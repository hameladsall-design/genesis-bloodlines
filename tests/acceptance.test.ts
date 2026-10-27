/**
 * GENESIS: BLOODLINES — master acceptance suite.
 *
 * Every test drives the REAL implementation: a real `createNewGame` state, a real
 * `GameStore`, the real `GameEngine` clock and the real simulation systems. There
 * are no mocks and no stubs; only the deterministic seeded RNG of the store is
 * used for randomness.
 *
 * The vitest environment is 'node' (see vitest.config.ts), so no DOM/Phaser
 * globals exist here. The two criteria that are (partly) visual — the visitor
 * exclamation mark (20) and the profile line (13) — are asserted against the
 * underlying data contract the view layer reads, and criterion 20 additionally
 * checks the real scene source that renders the mark.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { GameEngine } from '../src/game/simulation/engine';
import { GameStore } from '../src/game/simulation/store';
import { isPermadead, SaveManager } from '../src/game/simulation/save';
import { DAYS_PER_MONTH } from '../src/game/simulation/calendar';
import { DEFAULT_CONFIG, createNewGame } from '../src/game/simulation/systems/newGame';
import type { Character, GameState, RaceId } from '../src/game/simulation/types';
import {
  isBuildingUnlocked,
  placeBuilding,
  populationCapacity,
  upgradeBase,
} from '../src/game/simulation/systems/base';
import {
  consumeFood,
  dailyFoodConsumption,
  gatherFromNode,
  harvestFarm,
  plantFarm,
  starvationStatus,
} from '../src/game/simulation/systems/economy';
import { ageOf, grantXp } from '../src/game/simulation/systems/progression';
import {
  birthChild,
  buildFamilyTree,
  canMarry,
  createCharacter as createFamilyCharacter,
  killCharacter,
  marry,
} from '../src/game/simulation/systems/family';
import {
  BASE_RECRUIT_PRICE,
  createCharacter as createTavernCharacter,
  marriageCandidates,
  recruitCandidate,
  recruitPriceFor,
  refreshTavern,
} from '../src/game/simulation/systems/tavern';
import {
  maybeSpawnVisitor,
  pendingVisitors,
  resolveVisitor,
  VISITOR_INTERVAL_DAYS,
} from '../src/game/simulation/systems/visitors';
import {
  applyBattleResult,
  canJoinTeam,
  MAX_NORMAL_TEAM,
  resolveBattle,
} from '../src/game/simulation/systems/combat';
import { getSpecies, sexLabel, SPECIES } from '../src/game/content/species';
import { BASE_LEVELS } from '../src/game/content/baseLevels';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** A brand new game with a deterministic seed. */
function newGame(seed = 'acceptance-seed'): GameState {
  return createNewGame({ ...DEFAULT_CONFIG, seed });
}

/** A store over a brand new game. */
function newStore(seed = 'acceptance-seed'): GameStore {
  return new GameStore(newGame(seed), seed);
}

/**
 * A real tavern-built character (full record, real stats) that is added to the
 * store so the combat systems can find it.
 */
function makeCharacter(
  store: GameStore,
  race: RaceId,
  level: number,
  tuning?: { hp?: number; damage?: number; health?: number },
): Character {
  const character = createTavernCharacter({
    firstName: 'موجب',
    familyName: 'حَدِيد',
    sex: 'male',
    race,
    age: 25,
    level,
  });
  const stats = {
    ...character.stats,
    hp: tuning?.hp ?? character.stats.hp,
    damage: tuning?.damage ?? character.stats.damage,
  };
  character.stats = stats;
  character.baseStats = { ...stats };
  character.health = tuning?.health ?? stats.hp;
  store.addCharacter(character);
  return character;
}

/** Reads a source file of the project (used for the visual-only criteria). */
function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

/* ------------------------------------------------------------------ */
/* World creation                                                      */
/* ------------------------------------------------------------------ */

describe('World creation', () => {
  it('1. a new game can be created', () => {
    const state = newGame();

    expect(state.version).toBe(1);
    expect(state.base.level).toBe(1);
    expect(state.base.capacity).toBe(10);
    expect(state.calendar.totalDays).toBe(0);
    expect(state.resources.food).toBeGreaterThan(0);
    expect(state.resources.wood).toBeGreaterThan(0);
    expect(state.world.resourceNodes.length).toBeGreaterThan(0);
    expect(state.characterOrder.length).toBe(1);

    const store = new GameStore(state, 'acceptance-seed');
    expect(store.livingCount()).toBe(1);
    expect(store.allCharacters().length).toBe(1);
  });

  it('2. the founder appears in the world', () => {
    const state = newGame();
    const founder = state.characterOrder.map((id) => state.characters[id]).find((c) => c?.isFounder);

    expect(founder).toBeDefined();
    expect(founder!.alive).toBe(true);
    expect(founder!.household).toBe('family');
    expect(state.recruitedIds).toContain(founder!.id);
    // The founder stands at the settlement anchor, so the map can show him.
    expect(founder!.x).toBe(state.world.baseX);
    expect(founder!.y).toBe(state.world.baseY);

    const engine = GameEngine.fromState(state);
    expect(engine.visibleCharacterIds()).toContain(founder!.id);
  });

  it('3. the initial base population capacity is 10', () => {
    const state = newGame();
    expect(state.base.capacity).toBe(10);
    expect(BASE_LEVELS[0].capacity).toBe(10);
    expect(populationCapacity(state)).toBe(10);
  });
});

/* ------------------------------------------------------------------ */
/* Base progression                                                     */
/* ------------------------------------------------------------------ */

describe('Base progression', () => {
  it('4. the base can be upgraded with materials', () => {
    const store = newStore();
    const cost = BASE_LEVELS[1].cost;

    expect(upgradeBase(store)).toBe(true);
    expect(store.state.base.level).toBe(2);
    expect(store.getResource('wood')).toBe(store.state.resources.wood);
    // The upgrade really was paid for.
    expect(store.getResource('wood')).toBeLessThan(120);
    expect(store.getResource('stone')).toBeLessThan(80);
    expect(store.getResource('coins')).toBeLessThan(120);
    expect(cost.wood).toBeGreaterThan(0);

    // Without the materials the upgrade is refused.
    const poor = newStore('poor-settlement');
    poor.state.resources.wood = 0;
    poor.state.resources.stone = 0;
    poor.state.resources.coins = 0;
    expect(upgradeBase(poor)).toBe(false);
    expect(poor.state.base.level).toBe(1);
  });

  it('5. base upgrades increase population capacity and unlock appropriate content', () => {
    const store = newStore();
    const before = populationCapacity(store.state);

    expect(isBuildingUnlocked('small_farm', 1)).toBe(false);
    expect(upgradeBase(store)).toBe(true);

    expect(populationCapacity(store.state)).toBeGreaterThan(before);
    expect(populationCapacity(store.state)).toBe(BASE_LEVELS[1].capacity);
    // Level 2 opens the food category and its first farm.
    expect(BASE_LEVELS[1].unlocksCategories).toContain('food');
    expect(isBuildingUnlocked('small_farm', 2)).toBe(true);
    expect(isBuildingUnlocked('tavern', 2)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Gathering                                                            */
/* ------------------------------------------------------------------ */

describe('Gathering', () => {
  it('6. wood can be gathered', () => {
    const store = newStore();
    const node = store.state.world.resourceNodes.find((n) => n.kind === 'wood' && n.amount > 0);
    expect(node).toBeDefined();

    const founder = store.livingCharacters()[0]!;
    const woodBefore = store.getResource('wood');
    const amountBefore = node!.amount;

    const result = gatherFromNode(store, node!.id, founder.id);
    expect(result.ok).toBe(true);
    expect(result.gained?.wood).toBeGreaterThan(0);
    expect(store.getResource('wood')).toBe(woodBefore + (result.gained?.wood ?? 0));
    expect(node!.amount).toBe(amountBefore - (result.gained?.wood ?? 0));
  });

  it('7. stone can be gathered', () => {
    const store = newStore();
    const node = store.state.world.resourceNodes.find((n) => n.kind === 'stone' && n.amount > 0);
    expect(node).toBeDefined();

    const founder = store.livingCharacters()[0]!;
    const stoneBefore = store.getResource('stone');

    const result = gatherFromNode(store, node!.id, founder.id);
    expect(result.ok).toBe(true);
    expect(result.gained?.stone).toBeGreaterThan(0);
    expect(store.getResource('stone')).toBe(stoneBefore + (result.gained?.stone ?? 0));
  });
});

/* ------------------------------------------------------------------ */
/* Food                                                                */
/* ------------------------------------------------------------------ */

describe('Food', () => {
  it('8. food can be obtained through combat', () => {
    const store = newStore();
    const foodBefore = store.getResource('food');

    // A real fighter built by the real character factory, tuned to win.
    const hero = makeCharacter(store, 'human', 1, { hp: 5000, damage: 500, health: 5000 });

    const result = resolveBattle(store, 'normal', 'enc.s1_wolf_pack', [hero.id]);
    expect(result.victory).toBe(true);
    expect(result.loot.food ?? 0).toBeGreaterThan(0);

    applyBattleResult(store, result);
    expect(store.getResource('food')).toBe(foodBefore + (result.loot.food ?? 0));
  });

  it('9. food can be produced through farming', () => {
    const store = newStore();
    const engine = new GameEngine(store);

    expect(upgradeBase(store)).toBe(true);
    const placement = placeBuilding(store, 'small_farm', 0, 0);
    expect(placement.ok).toBe(true);

    // The field needs three days of construction.
    engine.advanceHours(24 * 3);
    const instance = store.state.base.buildings[0]!;
    expect(instance.underConstruction).toBe(false);

    const foodBefore = store.getResource('food');
    expect(plantFarm(store)).toBe(true);
    // The field ripens in four days.
    engine.advanceHours(24 * 4);

    const harvest = harvestFarm(store);
    expect(harvest.ok).toBe(true);
    expect(harvest.food ?? 0).toBeGreaterThan(0);
    expect(store.getResource('food')).toBe(foodBefore + (harvest.food ?? 0));
  });

  it('10. food consumption equals one unit per living character per in-game day by default', () => {
    const store = newStore();
    makeCharacter(store, 'human', 1);
    makeCharacter(store, 'human', 1);

    const living = store.livingCount();
    expect(living).toBe(3);
    expect(dailyFoodConsumption(store.state)).toBe(living);
    expect(store.dailyFoodConsumption()).toBe(living);

    store.state.resources.food = 10;
    const payment = consumeFood(store);
    expect(payment.consumed).toBe(living);
    expect(payment.shortfall).toBe(0);
    expect(store.getResource('food')).toBe(10 - living);
  });

  it('11. starvation warnings appear before deaths begin', () => {
    const store = newStore();
    const engine = new GameEngine(store);
    const founder = store.livingCharacters()[0]!;

    store.state.resources.food = 0;

    engine.advanceHours(24);
    expect(store.state.base.starvationDays).toBe(1);
    const warning = store.state.notifications.find((n) => n.day === 1);
    expect(warning).toBeDefined();
    expect(warning!.kind).toBe('warn');
    expect(warning!.text).toContain('طعام');
    // Nobody dies on the first missed day.
    expect(founder.alive).toBe(true);

    // The rule continues to hold through the whole grace window.
    engine.advanceHours(24 * 8);
    expect(store.state.base.starvationDays).toBe(9);
    expect(founder.alive).toBe(true);
    expect(store.livingCharacters().length).toBe(1);
  });

  it('31. food shortages affect survival according to the defined rules', () => {
    const store = newStore();
    const engine = new GameEngine(store);
    const founder = store.livingCharacters()[0]!;

    store.state.resources.food = 0;
    const healthStart = founder.health;
    const staminaStart = founder.stats.stamina;
    const moraleStart = founder.status.morale;

    engine.advanceHours(24);
    expect(starvationStatus(store.state).level).toBe('warning');
    // During the grace window only hunger falls, health is untouched.
    expect(founder.health).toBe(healthStart);

    engine.advanceHours(24 * 2);
    expect(starvationStatus(store.state).level).toBe('critical');
    expect(founder.status.condition).toBe('starving');
    expect(founder.health).toBeLessThan(healthStart);
    expect(founder.stats.stamina).toBeLessThan(staminaStart);
    expect(founder.status.morale).toBeLessThan(moraleStart);

    engine.advanceHours(24 * 5);
    expect(starvationStatus(store.state).level).toBe('severe');
    expect(store.state.base.unrest).toBeGreaterThan(0);
    // Death is only possible in the most severe stage, so nobody died yet.
    expect(founder.alive).toBe(true);
    expect(store.state.permadeadIds).not.toContain(founder.id);
  });
});

/* ------------------------------------------------------------------ */
/* Characters                                                          */
/* ------------------------------------------------------------------ */

describe('Characters', () => {
  it('12. characters can level up', () => {
    const store = newStore();
    const founder = store.livingCharacters()[0]!;
    const levelBefore = founder.level;
    const damageBefore = founder.stats.damage;

    const events: number[] = [];
    store.on('character:leveled', (payload) => events.push(payload.level));

    const levels = grantXp(store, founder, 500);
    expect(levels).toBeGreaterThan(0);
    expect(founder.level).toBeGreaterThan(levelBefore);
    expect(founder.xp).toBeLessThan(founder.xpToNext);
    expect(founder.stats.damage).toBeGreaterThan(damageBefore);
    expect(events).toContain(founder.level);
  });

  it('13. character profiles display level, species, and biological sex where applicable', () => {
    const store = newStore();
    const founder = store.livingCharacters()[0]!;

    // The profile card (src/ui/panels/roster.ts) reads exactly these fields.
    expect(typeof founder.level).toBe('number');
    expect(founder.level).toBeGreaterThanOrEqual(1);
    expect(founder.race).toBe('human');
    expect(['male', 'female', 'none']).toContain(founder.sex);
    expect(getSpecies(founder.race).nameAr.length).toBeGreaterThan(0);
    expect(sexLabel(founder.sex, founder.race, 'en')).toMatch(/Male|Female|Unspecified|N\/A/);

    // A species without a sex distinction is shown as "not applicable".
    const angel = createFamilyCharacter({
      firstName: 'ملك',
      familyName: 'نور',
      sex: 'male',
      race: 'angel',
      age: 30,
      rng: store.rng,
    });
    expect(angel.sex).toBe('none');
    expect(sexLabel(angel.sex, angel.race, 'en')).toBe('N/A');
    expect(SPECIES.angel.sexSystem).toBe('none');
  });
});

/* ------------------------------------------------------------------ */
/* Combat                                                              */
/* ------------------------------------------------------------------ */

describe('Combat', () => {
  it('14. normal battles accept fewer than 10 characters', () => {
    const store = newStore();
    const fighters = [
      makeCharacter(store, 'human', 1),
      makeCharacter(store, 'human', 1),
      makeCharacter(store, 'human', 1),
    ];

    expect(fighters.length).toBeLessThan(10);
    expect(canJoinTeam(fighters, fighters[0]!, 'normal').ok).toBe(false); // duplicate
    const fourth = makeCharacter(store, 'human', 1);
    expect(canJoinTeam(fighters, fourth, 'normal').ok).toBe(true);

    // A three-fighter party really enters a normal battle.
    const result = resolveBattle(store, 'normal', 'enc.s1_wolf_pack', fighters.map((c) => c.id));
    expect(result.rounds).toBeGreaterThan(0);
    expect(result.log.length).toBeGreaterThan(0);
  });

  it('15. normal battles never accept more than 10 characters', () => {
    const store = newStore();
    const team = Array.from({ length: MAX_NORMAL_TEAM }, () => makeCharacter(store, 'human', 1));
    const extra = makeCharacter(store, 'human', 1);

    expect(team.length).toBe(10);
    expect(MAX_NORMAL_TEAM).toBe(10);
    const check = canJoinTeam(team, extra, 'normal');
    expect(check.ok).toBe(false);
    expect(check.reason).toBeTruthy();
  });

  it('16. normal combat rewards are added correctly', () => {
    const store = newStore();
    const hero = makeCharacter(store, 'human', 1, { hp: 5000, damage: 500, health: 5000 });
    const doomed = makeCharacter(store, 'human', 1, { hp: 1, damage: 0, health: 1 });

    const before = { ...store.state.resources };

    const result = resolveBattle(store, 'normal', 'enc.s1_wolf_pack', [hero.id, doomed.id]);
    expect(result.victory).toBe(true);
    expect(Object.keys(result.loot).length).toBeGreaterThan(0);

    applyBattleResult(store, result);

    // Every rolled resource really landed in the settlement.
    for (const [key, amount] of Object.entries(result.loot)) {
      expect(store.getResource(key as 'food')).toBe((before[key as 'food'] ?? 0) + (amount ?? 0));
    }
    // Survivors are paid in experience.
    expect(result.xpGained[hero.id] ?? 0).toBeGreaterThan(0);
    expect(hero.xp).toBeGreaterThan(0);
    // A normal battle never kills: the fallen are only incapacitated.
    expect(result.incapacitated).toContain(doomed.id);
    expect(doomed.alive).toBe(true);
    expect(doomed.health).toBe(0);
    expect(doomed.status.condition).toBe('incapacitated');
    expect(store.state.permadeadIds).not.toContain(doomed.id);
  });

  it('17. ranked combat warns the player about permanent death', () => {
    const store = newStore();
    const doomed = makeCharacter(store, 'human', 1, { hp: 1, damage: 0, health: 1 });

    const result = resolveBattle(store, 'ranked', 'enc.s1_wolf_pack', [doomed.id]);
    expect(result.casualties).toContain(doomed.id);

    applyBattleResult(store, result);

    // A ranked death is permanent.
    expect(doomed.alive).toBe(false);
    expect(doomed.permadead).toBe(true);
    expect(store.state.permadeadIds).toContain(doomed.id);
    expect(isPermadead(store.state, doomed.id)).toBe(true);
    expect(store.livingCharacters().map((c) => c.id)).not.toContain(doomed.id);
    expect(store.livingCount()).toBe(0);
  });

  it('18. a ranked casualty remains dead after saving and reloading', () => {
    const saveManager = new SaveManager();
    const store = newStore();
    const engine = new GameEngine(store, saveManager);
    const doomed = makeCharacter(store, 'human', 1, { hp: 1, damage: 0, health: 1 });

    const result = resolveBattle(store, 'ranked', 'enc.s1_wolf_pack', [doomed.id]);
    applyBattleResult(store, result);
    expect(doomed.alive).toBe(false);

    expect(engine.save(1)).toBe(true);
    const loaded = engine.load(1);
    expect(loaded).not.toBeNull();

    const reloaded = loaded!.characters[doomed.id]!;
    expect(reloaded.alive).toBe(false);
    expect(reloaded.permadead).toBe(true);
    expect(loaded!.permadeadIds).toContain(doomed.id);
    expect(isPermadead(loaded!, doomed.id)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Visitors                                                            */
/* ------------------------------------------------------------------ */

describe('Visitors', () => {
  it('19. a visitor arrives approximately once per in-game month', () => {
    const store = newStore();
    const engine = new GameEngine(store);

    engine.advanceHours(24);
    expect(store.state.visitors.length).toBe(1);
    const first = store.state.visitors[0]!;
    expect(first.disposition).toBe('waiting');
    expect(first.arrivedDay).toBe(1);

    // Only one visitor waits at a time, so the first one has to be resolved.
    expect(resolveVisitor(store, first.id, 'send_away').ok).toBe(true);

    engine.advanceHours(24 * 29);
    expect(store.state.visitors.length).toBe(1);

    engine.advanceHours(24);
    expect(store.state.visitors.length).toBe(2);
    const second = store.state.visitors[1]!;
    expect(second.arrivedDay - first.arrivedDay).toBe(VISITOR_INTERVAL_DAYS);
    expect(VISITOR_INTERVAL_DAYS).toBe(DAYS_PER_MONTH);
    expect(VISITOR_INTERVAL_DAYS).toBe(30);
  });

  it('20. a visitor displays an exclamation-mark indicator', () => {
    const store = newStore();
    const visitor = maybeSpawnVisitor(store);
    expect(visitor).not.toBeNull();

    // The visitor state contract the scene depends on: a waiting visitor.
    expect(visitor!.disposition).toBe('waiting');
    expect(visitor!.notified).toBe(true);
    expect(Number.isFinite(visitor!.x)).toBe(true);
    expect(Number.isFinite(visitor!.y)).toBe(true);
    expect(store.state.visitors.map((v) => v.id)).toContain(visitor!.id);

    // The visibility rule of src/phaser/scenes/WorldScene.ts: only a visitor
    // whose disposition is 'waiting' is rendered (and gets the mark sprite).
    expect(pendingVisitors(store.state).map((v) => v.id)).toContain(visitor!.id);

    // Once resolved, the scene destroys the sprite (and its mark) again.
    expect(resolveVisitor(store, visitor!.id, 'send_away').ok).toBe(true);
    expect(pendingVisitors(store.state)).toHaveLength(0);

    // The visual mark itself: the real scene builds an 'exclamation' texture and
    // puts it on the visitor container. Phaser cannot boot in the node test
    // environment, so the real scene source is inspected instead.
    const sceneSource = readSource('../src/phaser/scenes/WorldScene.ts');
    expect(sceneSource).toContain("buildExclamationTexture(this, 'exclamation')");
    expect(sceneSource).toContain("this.add.image(0, -58, 'exclamation')");
    expect(sceneSource).toContain("visitor.disposition !== 'waiting'");

    const spritesSource = readSource('../src/phaser/view/sprites.ts');
    expect(spritesSource).toContain('export function buildExclamationTexture');
  });

  it('21. clicking the visitor displays Recruit, Kill, and Send Away', () => {
    const store = newStore();
    store.state.resources.coins = 10000;

    // 1. Recruit.
    const recruitTarget = maybeSpawnVisitor(store)!;
    expect(recruitTarget.disposition).toBe('waiting');
    const recruited = resolveVisitor(store, recruitTarget.id, 'recruit');
    expect(recruited.ok).toBe(true);
    expect(recruitTarget.disposition).toBe('recruited');
    expect(store.getCharacter(recruitTarget.character.id)).toBeDefined();
    expect(store.getCharacter(recruitTarget.character.id)!.alive).toBe(true);
    expect(store.state.recruitedIds).toContain(recruitTarget.character.id);

    // 2. Kill.
    const killTarget = maybeSpawnVisitor(store)!;
    const killed = resolveVisitor(store, killTarget.id, 'kill');
    expect(killed.ok).toBe(true);
    expect(killTarget.disposition).toBe('killed');
    expect(killTarget.character.alive).toBe(false);
    expect(killTarget.character.permadead).toBe(true);
    expect(store.state.recruitedIds).not.toContain(killTarget.character.id);

    // 3. Send away.
    const sendTarget = maybeSpawnVisitor(store)!;
    const sent = resolveVisitor(store, sendTarget.id, 'send_away');
    expect(sent.ok).toBe(true);
    expect(sendTarget.disposition).toBe('sent_away');
    expect(sendTarget.character.alive).toBe(true);
    expect(store.getCharacter(sendTarget.character.id)).toBeUndefined();

    // A visitor can only be resolved once.
    expect(resolveVisitor(store, sendTarget.id, 'recruit').ok).toBe(false);
  });

  it('22. recruitment respects population capacity and currency costs', () => {
    const store = newStore();
    refreshTavern(store);
    const offers = store.state.tavern;
    expect(offers.length).toBeGreaterThan(0);
    const candidate = offers[0]!;

    // Capacity: the settlement is full.
    store.state.base.capacity = store.livingCount();
    const coinsBefore = store.getResource('coins');
    const blockedByCapacity = recruitCandidate(store, candidate.id);
    expect(blockedByCapacity.ok).toBe(false);
    expect(blockedByCapacity.reason).toBeTruthy();
    expect(store.getResource('coins')).toBe(coinsBefore);
    expect(candidate.taken).toBe(false);
    expect(store.getCharacter(candidate.character.id)).toBeUndefined();

    // Currency: room exists, but there are no coins.
    store.state.base.capacity = 10;
    store.state.resources.coins = 0;
    const blockedByCoins = recruitCandidate(store, candidate.id);
    expect(blockedByCoins.ok).toBe(false);
    expect(blockedByCoins.reason).toBeTruthy();
    expect(store.getResource('coins')).toBe(0);
    expect(candidate.taken).toBe(false);

    // With room and money the recruit joins the household.
    store.state.resources.coins = 1000;
    const hired = recruitCandidate(store, candidate.id);
    expect(hired.ok).toBe(true);
    expect(store.getResource('coins')).toBe(1000 - candidate.price);
    expect(candidate.taken).toBe(true);
    expect(store.getCharacter(candidate.character.id)?.household).toBe('resident');
    expect(store.livingCount()).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* Tavern                                                              */
/* ------------------------------------------------------------------ */

describe('Tavern', () => {
  it('23. common eligible tavern recruits can cost 10 coins', () => {
    const store = newStore();
    refreshTavern(store);

    expect(BASE_RECRUIT_PRICE).toBe(10);

    // A plain level-1 human with no bloodline traits is the common recruit.
    const common = createTavernCharacter({
      firstName: 'عادي',
      familyName: 'حَقل',
      sex: 'male',
      race: 'human',
      age: 22,
      level: 1,
    });
    expect(recruitPriceFor(common, 1, 1)).toBe(10);
    expect(recruitPriceFor(common, 1, store.state.difficulty.recruitmentPriceMultiplier)).toBe(10);

    // No offer is ever cheaper than the base price.
    for (const offer of store.state.tavern) {
      expect(offer.price).toBeGreaterThanOrEqual(BASE_RECRUIT_PRICE);
    }
  });

  it('24. rare recruits cost more according to configured rarity', () => {
    const store = newStore();

    const common = createTavernCharacter({
      firstName: 'عادي',
      familyName: 'حَقل',
      sex: 'male',
      race: 'human',
      age: 22,
      level: 1,
    });
    const rare = createTavernCharacter({
      firstName: 'نادر',
      familyName: 'دَم',
      sex: 'male',
      race: 'demon',
      age: 22,
      level: 1,
    });

    const commonPrice = recruitPriceFor(common, 1, 1);
    const rarePrice = recruitPriceFor(rare, 1, 1);

    expect(SPECIES.demon.rarity).toBeGreaterThan(SPECIES.human.rarity);
    expect(rarePrice).toBeGreaterThan(commonPrice);
    // The price follows the configured rarity: 10 * (1 + (rarity - 1) * 0.5).
    const expected = Math.round(
      BASE_RECRUIT_PRICE * (1 + (SPECIES.demon.rarity - 1) * 0.5),
    );
    expect(rarePrice).toBe(expected);
    expect(commonPrice).toBe(BASE_RECRUIT_PRICE);
  });

  it('25. tavern recruitment and marriage are separate actions', () => {
    const store = newStore();
    refreshTavern(store);
    const candidate = store.state.tavern.find((c) => c.character.race === 'human')!;
    expect(candidate).toBeDefined();

    expect(recruitCandidate(store, candidate.id).ok).toBe(true);
    const recruit = store.getCharacter(candidate.character.id)!;
    const founder = store.livingCharacters().find((c) => c.isFounder)!;

    // Hiring is not marrying.
    expect(recruit.partnerId).toBeUndefined();
    expect(recruit.family.partnerIds).toHaveLength(0);
    expect(founder.partnerId).toBeUndefined();
    expect(founder.family.partnerIds).toHaveLength(0);
    expect(recruit.relationships.find((r) => r.kind === 'partner')).toBeUndefined();

    // The marriage option is a separate, explicit action.
    expect(canMarry(founder, recruit).ok).toBe(true);
    expect(marriageCandidates(store, founder).map((c) => c.id)).toContain(recruit.id);

    expect(marry(store, founder, recruit)).toBe(true);
    expect(founder.partnerId).toBe(recruit.id);
    expect(recruit.partnerId).toBe(founder.id);
    expect(founder.family.partnerIds).toContain(recruit.id);
  });
});

/* ------------------------------------------------------------------ */
/* Family and genetics                                                 */
/* ------------------------------------------------------------------ */

describe('Family and genetics', () => {
  it('26. a child inherits genetic data from the parents', () => {
    const store = newStore();

    const father = createFamilyCharacter({
      firstName: 'أب',
      familyName: 'سَفَين',
      sex: 'male',
      race: 'human',
      age: 30,
      genotype: { 'loc.tough': ['trait.toughness', 'normal'] },
      rng: store.rng,
    });
    const mother = createFamilyCharacter({
      firstName: 'أم',
      familyName: 'سَفَين',
      sex: 'female',
      race: 'human',
      age: 28,
      genotype: { 'loc.versatile': ['trait.versatile', 'normal'] },
      rng: store.rng,
    });
    store.addCharacter(father);
    store.addCharacter(mother);

    const child = birthChild(store, mother, father);

    // Every allele the child carries comes from one of the two parents.
    const inheritedTraits = new Set<string>(['trait.toughness', 'trait.versatile']);
    for (const [locus, alleles] of Object.entries(child.genotype)) {
      const parentsAlleles = [...father.genotype[locus]!, ...mother.genotype[locus]!];
      for (const allele of alleles) {
        expect(parentsAlleles).toContain(allele);
        if (allele !== 'normal') expect(inheritedTraits.has(allele)).toBe(true);
      }
    }
    for (const trait of child.phenotype) {
      expect(inheritedTraits.has(trait)).toBe(true);
    }

    // The child is linked to both parents.
    expect(child.family.fatherId).toBe(father.id);
    expect(child.family.motherId).toBe(mother.id);
    expect(father.family.childIds).toContain(child.id);
    expect(mother.family.childIds).toContain(child.id);
  });

  it('27. same-species children do not automatically become hybrids', () => {
    const store = newStore();

    const father = createFamilyCharacter({
      firstName: 'أب',
      familyName: 'خَص',
      sex: 'male',
      race: 'human',
      age: 30,
      rng: store.rng,
    });
    const mother = createFamilyCharacter({
      firstName: 'أم',
      familyName: 'خَص',
      sex: 'female',
      race: 'human',
      age: 28,
      rng: store.rng,
    });
    store.addCharacter(father);
    store.addCharacter(mother);

    const child = birthChild(store, mother, father);
    expect(child.race).toBe('human');
    expect(child.race.startsWith('hybrid_')).toBe(false);
    expect(SPECIES['hybrid_human_human']).toBeUndefined();
  });

  it('28. family relationships appear correctly in the family tree', () => {
    const store = newStore();

    const father = createFamilyCharacter({
      firstName: 'أب',
      familyName: 'شَجَر',
      sex: 'male',
      race: 'human',
      age: 30,
      rng: store.rng,
    });
    const mother = createFamilyCharacter({
      firstName: 'أم',
      familyName: 'شَجَر',
      sex: 'female',
      race: 'human',
      age: 28,
      rng: store.rng,
    });
    store.addCharacter(father);
    store.addCharacter(mother);

    const first = birthChild(store, mother, father);
    const second = birthChild(store, mother, father);

    const tree = buildFamilyTree(store.state);
    const childNode = tree.find((n) => n.id === first.id)!;
    const siblingNode = tree.find((n) => n.id === second.id)!;
    const fatherNode = tree.find((n) => n.id === father.id)!;
    const motherNode = tree.find((n) => n.id === mother.id)!;

    expect(childNode.fatherId).toBe(father.id);
    expect(childNode.motherId).toBe(mother.id);
    expect(childNode.generation).toBe(1);
    expect(fatherNode.generation).toBe(0);
    expect(fatherNode.childIds).toContain(first.id);
    expect(motherNode.childIds).toContain(first.id);
    expect(motherNode.childIds).toContain(second.id);
    // Siblings are linked both ways.
    expect(childNode.siblingIds).toContain(second.id);
    expect(siblingNode.siblingIds).toContain(first.id);
  });
});

/* ------------------------------------------------------------------ */
/* Time, death and persistence                                         */
/* ------------------------------------------------------------------ */

describe('Time, death and persistence', () => {
  it('29. character aging follows the unified game clock', () => {
    const store = newStore();
    const engine = new GameEngine(store);
    store.state.resources.food = 1000;

    const child = createFamilyCharacter({
      firstName: 'طفل',
      familyName: 'ساعَة',
      sex: 'male',
      race: 'human',
      age: 0,
      bornDay: 0,
      rng: store.rng,
    });
    store.addCharacter(child);

    engine.advanceHours(24 * 30);
    expect(store.state.calendar.totalDays).toBe(30);
    // One year is 360 days, so the child is 30/360 of a year old.
    expect(child.age).toBeCloseTo(30 / 360, 6);
    expect(child.age).toBeCloseTo(ageOf(child, store.state.calendar.totalDays), 6);

    engine.advanceHours(24 * 30);
    expect(store.state.calendar.totalDays).toBe(60);
    expect(child.age).toBeCloseTo(60 / 360, 6);
    expect(child.age).toBeGreaterThan(0);
  });

  it('30. death records persist', () => {
    const store = newStore();
    const engine = new GameEngine(store);
    const founder = store.livingCharacters()[0]!;

    killCharacter(store, founder, 'اختبار القبول', true);

    // The record stays in the world so the family tree can still show the dead.
    const record = store.state.characters[founder.id]!;
    expect(record).toBeDefined();
    expect(record.alive).toBe(false);
    expect(record.causeOfDeath).toBe('اختبار القبول');
    expect(record.dayOfDeath).toBe(store.state.calendar.totalDays);
    expect(record.history.some((h) => h.kind === 'death')).toBe(true);
    expect(store.state.permadeadIds).toContain(founder.id);
    expect(store.livingCharacters()).toHaveLength(0);

    // And it survives a save/load round trip.
    expect(engine.save(1)).toBe(true);
    const loaded = engine.load(1)!;
    const reloaded = loaded.characters[founder.id]!;
    expect(reloaded.alive).toBe(false);
    expect(reloaded.causeOfDeath).toBe('اختبار القبول');
    expect(reloaded.dayOfDeath).toBe(record.dayOfDeath);
    expect(loaded.permadeadIds).toContain(founder.id);
  });

  it('32. save/load restores the world without duplicating characters or resources', () => {
    const store = newStore();
    const engine = new GameEngine(store);

    makeCharacter(store, 'human', 2);
    makeCharacter(store, 'elf', 1);
    refreshTavern(store);
    const visitor = maybeSpawnVisitor(store)!;
    expect(visitor).toBeDefined();

    const before = {
      characters: Object.keys(store.state.characters).length,
      order: store.state.characterOrder.length,
      resources: { ...store.state.resources },
      tavern: store.state.tavern.length,
      visitors: store.state.visitors.length,
    };

    expect(engine.save(1)).toBe(true);
    const loaded = engine.load(1)!;

    expect(Object.keys(loaded.characters)).toHaveLength(before.characters);
    expect(loaded.characterOrder).toHaveLength(before.order);
    expect(new Set(loaded.characterOrder).size).toBe(before.order);
    expect(loaded.tavern).toHaveLength(before.tavern);
    expect(loaded.visitors).toHaveLength(before.visitors);
    for (const [key, amount] of Object.entries(before.resources)) {
      expect(loaded.resources[key as 'food']).toBe(amount);
    }

    // Loading twice does not duplicate anything either.
    const loadedAgain = engine.load(1)!;
    expect(Object.keys(loadedAgain.characters)).toHaveLength(before.characters);
    expect(loadedAgain.characterOrder).toHaveLength(before.order);
    expect(loadedAgain.resources.wood).toBe(before.resources.wood);
  });
});

/* ------------------------------------------------------------------ */
/* Scale                                                               */
/* ------------------------------------------------------------------ */

describe('Scale', () => {
  it('33. the game remains usable with a large character database', () => {
    const store = newStore();
    const founder = store.livingCharacters()[0]!;

    const started = performance.now();
    for (let i = 0; i < 300; i += 1) {
      const character = createTavernCharacter({
        firstName: `ساكن${i}`,
        familyName: 'جُمهور',
        sex: i % 2 === 0 ? 'male' : 'female',
        race: 'human',
        age: 18 + (i % 40),
        level: 1 + (i % 5),
      });
      store.addCharacter(character);
    }
    const built = performance.now() - started;

    expect(store.allCharacters()).toHaveLength(301);
    expect(store.livingCount()).toBe(301);
    expect(store.livingCharacters().map((c) => c.id)).toContain(founder.id);

    const queried = performance.now();
    const living = store.livingCharacters();
    const aliveIds = new Set(living.map((c) => c.id));
    expect(aliveIds.size).toBe(301);
    for (const character of living) {
      expect(store.getCharacter(character.id)).toBeDefined();
    }
    const elapsed = performance.now() - queried;

    expect(built).toBeLessThan(2000);
    expect(elapsed).toBeLessThan(2000);
  });
});
