import { describe, expect, it } from 'vitest';

import { GameStore } from '../src/game/simulation/store';
import type { Character, CombatStats, GameState } from '../src/game/simulation/types';
import { baseStatsFor } from '../src/game/content/species';
import {
  MAX_NORMAL_TEAM,
  MAX_RANKED_TEAM,
  applyBattleResult,
  canJoinTeam,
  estimateTeamStrength,
  isEligibleForBattle,
  resolveBattle,
  teamPower,
} from '../src/game/simulation/systems/combat';
import {
  ENCOUNTERS,
  ENEMIES,
  bossEncounters,
  encountersForStage,
  getEncounter,
} from '../src/game/content/enemies';
import { SKILLS } from '../src/game/content/skills';
import { ITEMS } from '../src/game/content/items';

/* ------------------------------------------------------------------ */
/* Fixtures                                                           */
/* ------------------------------------------------------------------ */

const WEAK_STATS: CombatStats = {
  hp: 10,
  damage: 1,
  defense: 0,
  stamina: 20,
  speed: 5,
  accuracy: 0.5,
  evasion: 0,
  critChance: 0,
  magicResist: 0,
  attackRange: 1,
  attackSpeed: 1,
};

function makeCharacter(id: string, level: number, overrides: Partial<Character> = {}): Character {
  const base = baseStatsFor('human');
  const hpFactor = Math.pow(1.08, level - 1);
  const damageFactor = Math.pow(1.06, level - 1);
  const defenseFactor = Math.pow(1.05, level - 1);
  const stats: CombatStats = {
    ...base,
    hp: Math.round(base.hp * hpFactor),
    damage: Math.round(base.damage * damageFactor),
    defense: Math.round(base.defense * defenseFactor),
    stamina: Math.round(base.stamina + 4 * (level - 1)),
    speed: Math.round((base.speed + 0.4 * (level - 1)) * 10) / 10,
  };

  const character: Character = {
    id,
    firstName: `Name${id}`,
    familyName: 'House',
    sex: 'male',
    race: 'human',
    age: 20 + level,
    level,
    xp: 0,
    xpToNext: 100 + level * 20,
    health: stats.hp,
    baseStats: { ...stats },
    stats: { ...stats },
    genotype: {},
    phenotype: [],
    skills: ['skill.strike'],
    equipment: {},
    personality: [],
    relationships: [],
    family: { partnerIds: [], childIds: [], siblingIds: [] },
    status: { condition: 'healthy', hunger: 100, morale: 80, effects: [] },
    history: [],
    alive: true,
    bornDay: 0,
    isFounder: false,
    household: 'family',
    job: 'soldier',
    x: 0,
    y: 0,
    zone: 'zone.ashfall_road',
    portraitSeed: 1,
  };

  return { ...character, ...overrides };
}

function makeState(characters: Character[]): GameState {
  const roster: Record<string, Character> = {};
  const order: string[] = [];
  for (const character of characters) {
    roster[character.id] = character;
    order.push(character.id);
  }

  return {
    version: 1,
    config: {
      founderName: 'Founder',
      familyName: 'House',
      dynastyName: 'Test Dynasty',
      emblem: 'e',
      primaryColor: '#ffffff',
      secondaryColor: '#000000',
      seed: 'test-seed',
      worldSize: 'small',
      difficulty: 'normal',
      enemyDensity: 'normal',
      resourceAbundance: 'normal',
      diseaseFrequency: 'normal',
      disasterFrequency: 'rare',
      timeSpeed: 1,
    },
    difficulty: {
      enemyHealth: 1,
      enemyDamage: 1,
      enemyXp: 1,
      lootMultiplier: 1,
      diseaseChance: 0.1,
      disasterChance: 0.05,
      recruitmentPriceMultiplier: 1,
    },
    calendar: { year: 1, month: 1, day: 1, hour: 6, minute: 0, totalDays: 0 },
    weather: 'clear',
    world: {
      seed: 'test-seed',
      size: 'small',
      calendar: { year: 1, month: 1, day: 1, hour: 6, minute: 0, totalDays: 0 },
      weather: 'clear',
      daylight: 1,
      resources: {},
      resourceNodes: [],
      baseX: 0,
      baseY: 0,
      unlockedZones: ['zone.ashfall_road'],
    },
    characters: roster,
    characterOrder: order,
    base: {
      level: 1,
      capacity: 10,
      buildings: [],
      unrest: 0,
      starvationDays: 0,
      prosperityDays: 0,
      traditions: [],
      titles: [],
    },
    resources: {},
    inventory: {},
    equipmentItems: {},
    tavern: [],
    tavernRosterDay: 0,
    visitors: [],
    factions: {},
    quests: [],
    recruitedIds: [],
    battle: null,
    permadeadIds: [],
    notifications: [],
    starvationDays: 0,
    tutorialComplete: true,
    dynastyRecords: [],
    chronicle: [],
  };
}

function makeStore(characters: Character[], seed = 'combat-test-seed'): GameStore {
  return new GameStore(makeState(characters), seed);
}

/* ------------------------------------------------------------------ */
/* Team rules                                                         */
/* ------------------------------------------------------------------ */

describe('team composition rules', () => {
  it('accepts a single fighter, accepts ten and refuses an eleventh', () => {
    const roster = Array.from({ length: 12 }, (_, i) => makeCharacter(`c${i}`, 5));

    const first = canJoinTeam([], roster[0]!, 'normal');
    expect(first.ok).toBe(true);

    const team = roster.slice(0, MAX_NORMAL_TEAM);
    expect(team).toHaveLength(10);

    const eleventh = canJoinTeam(team, roster[10]!, 'normal');
    expect(eleventh.ok).toBe(false);
    expect(eleventh.reason).toBeTruthy();

    const eleventhRanked = canJoinTeam(team, roster[10]!, 'ranked');
    expect(eleventhRanked.ok).toBe(false);
    expect(eleventhRanked.reason).toBeTruthy();

    expect(MAX_NORMAL_TEAM).toBe(10);
    expect(MAX_RANKED_TEAM).toBe(10);
  });

  it('fields a full team of ten in an actual battle', () => {
    const roster = Array.from({ length: 11 }, (_, i) => makeCharacter(`c${i}`, 12));
    const team = roster.slice(0, MAX_NORMAL_TEAM);
    const store = makeStore(roster, 'full-team-seed');

    const result = resolveBattle(store, 'normal', 'enc.s1_wolf_pack', team.map((c) => c.id));
    expect(result.victory).toBe(true);
    expect(Object.keys(result.xpGained)).toHaveLength(10);

    // The eleventh fighter is refused, so the battle cannot field eleven.
    expect(canJoinTeam(team, roster[10]!, 'normal').ok).toBe(false);
  });

  it('never selects the dead, the permadead or the incapacitated', () => {
    const dead = makeCharacter('dead', 5, { alive: false });
    const permadead = makeCharacter('permadead', 5, { permadead: true });
    const downed = makeCharacter('downed', 5, {
      health: 0,
      status: { condition: 'incapacitated', hunger: 50, morale: 20, effects: [] },
    });
    const healthy = makeCharacter('healthy', 5);

    expect(isEligibleForBattle(dead)).toBe(false);
    expect(isEligibleForBattle(permadead)).toBe(false);
    expect(isEligibleForBattle(downed)).toBe(false);
    expect(isEligibleForBattle(healthy)).toBe(true);

    expect(canJoinTeam([], dead, 'normal').ok).toBe(false);
    expect(canJoinTeam([], permadead, 'normal').ok).toBe(false);
    expect(canJoinTeam([], downed, 'normal').ok).toBe(false);
    expect(canJoinTeam([healthy], healthy, 'normal').ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Normal battle: incapacitation, not death                           */
/* ------------------------------------------------------------------ */

describe('normal battle', () => {
  it('incapacitates a fighter at 0 HP and keeps it alive', () => {
    const weak = makeCharacter('weak', 1, {
      stats: { ...WEAK_STATS },
      baseStats: { ...WEAK_STATS },
      health: 10,
    });
    const store = makeStore([weak], 'normal-mode-seed');

    const result = resolveBattle(store, 'normal', 'enc.s5_boss_warden', ['weak']);
    expect(result.victory).toBe(false);
    expect(result.incapacitated).toContain('weak');
    expect(result.casualties).not.toContain('weak');

    applyBattleResult(store, result);

    const character = store.getCharacter('weak')!;
    expect(character.alive).toBe(true);
    expect(character.health).toBe(0);
    expect(character.status.condition).toBe('incapacitated');
    expect(character.permadead).not.toBe(true);
    expect(store.state.permadeadIds).not.toContain('weak');
    expect(store.livingCharacters().map((c) => c.id)).toContain('weak');
    expect(isEligibleForBattle(character)).toBe(false);
  });

  it('grants the loot of the encounter to the settlement', () => {
    const hero = makeCharacter('hero', 12);
    const store = makeStore([hero], 'loot-seed');

    const result = resolveBattle(store, 'normal', 'enc.s1_wolf_pack', ['hero']);
    expect(result.victory).toBe(true);
    expect(result.loot.food ?? 0).toBeGreaterThan(0);

    applyBattleResult(store, result);

    expect(store.getResource('food')).toBeGreaterThan(0);
    expect(store.getResource('coins')).toBeGreaterThan(0);
    expect(store.getResource('food')).toBe(result.loot.food ?? 0);
  });

  it('gives experience to the survivors and levels them up', () => {
    const hero = makeCharacter('hero', 8, { xpToNext: 20, xp: 0 });
    const store = makeStore([hero], 'xp-seed');

    const result = resolveBattle(store, 'normal', 'enc.s1_rat_infestation', ['hero']);
    expect(result.victory).toBe(true);
    expect(result.xpGained.hero ?? 0).toBeGreaterThan(0);

    applyBattleResult(store, result);

    const character = store.getCharacter('hero')!;
    expect(character.xp).toBeGreaterThan(0);
    expect(character.level).toBeGreaterThan(8);
  });
});

/* ------------------------------------------------------------------ */
/* Ranked battle: permanent death                                     */
/* ------------------------------------------------------------------ */

describe('ranked battle', () => {
  it('kills a fighter at 0 HP permanently', () => {
    const weak = makeCharacter('doomed', 1, {
      stats: { ...WEAK_STATS },
      baseStats: { ...WEAK_STATS },
      health: 10,
    });
    const store = makeStore([weak], 'ranked-mode-seed');

    const result = resolveBattle(store, 'ranked', 'enc.s5_boss_warden', ['doomed']);
    expect(result.victory).toBe(false);
    expect(result.casualties).toContain('doomed');
    expect(result.incapacitated).not.toContain('doomed');

    applyBattleResult(store, result);

    const character = store.getCharacter('doomed')!;
    expect(character.alive).toBe(false);
    expect(character.permadead).toBe(true);
    expect(character.dayOfDeath).toBe(0);
    expect(character.causeOfDeath).toBeTruthy();
    expect(store.state.permadeadIds).toContain('doomed');
    expect(store.livingCharacters().map((c) => c.id)).not.toContain('doomed');
    expect(character.history.some((event) => event.kind === 'death')).toBe(true);
  });

  it('keeps a ranked casualty dead after a save and reload', () => {
    const weak = makeCharacter('doomed', 1, {
      stats: { ...WEAK_STATS },
      baseStats: { ...WEAK_STATS },
      health: 10,
    });
    const store = makeStore([weak], 'reload-seed');

    const result = resolveBattle(store, 'ranked', 'enc.s5_boss_warden', ['doomed']);
    applyBattleResult(store, result);

    // Simulate a save / load round trip.
    const reloaded = JSON.parse(JSON.stringify(store.state)) as GameState;
    const restored = new GameStore(reloaded, 'reload-seed');

    expect(restored.state.permadeadIds).toContain('doomed');
    expect(restored.getCharacter('doomed')!.alive).toBe(false);
    expect(restored.getCharacter('doomed')!.permadead).toBe(true);
    expect(restored.livingCharacters().map((c) => c.id)).not.toContain('doomed');
  });
});

/* ------------------------------------------------------------------ */
/* Victory is not guaranteed                                          */
/* ------------------------------------------------------------------ */

describe('battle outcomes', () => {
  it('lets a strong team win and a hopeless team lose', () => {
    const strong = Array.from({ length: 5 }, (_, i) => makeCharacter(`hero${i}`, 24));
    const strongStore = makeStore(strong, 'strong-seed');
    const strongResult = resolveBattle(strongStore, 'normal', 'enc.s5_boss_warden', strong.map((c) => c.id));
    expect(strongResult.victory).toBe(true);
    expect(strongResult.rounds).toBeGreaterThan(0);

    const hopeless = makeCharacter('child', 1, {
      stats: { ...WEAK_STATS },
      baseStats: { ...WEAK_STATS },
      health: 10,
    });
    const weakStore = makeStore([hopeless], 'hopeless-seed');
    const weakResult = resolveBattle(weakStore, 'normal', 'enc.s5_boss_warden', ['child']);
    expect(weakResult.victory).toBe(false);
    expect(weakResult.log.length).toBeGreaterThan(0);
  });

  it('grows the estimated strength with stronger characters', () => {
    const weak = makeCharacter('weak', 1);
    const strong = makeCharacter('strong', 20);
    expect(estimateTeamStrength([strong])).toBeGreaterThan(estimateTeamStrength([weak]));
    expect(teamPower(strong)).toBeGreaterThan(teamPower(weak));
    expect(estimateTeamStrength([weak, strong])).toBeGreaterThan(estimateTeamStrength([weak]));
  });
});

/* ------------------------------------------------------------------ */
/* Content integrity                                                  */
/* ------------------------------------------------------------------ */

describe('encounter content', () => {
  it('orders encounters by stage', () => {
    const stages = ENCOUNTERS.map((enc) => enc.stage);
    expect(stages).toEqual([...stages].sort((a, b) => a - b));
    expect(ENCOUNTERS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(stages).size).toBeGreaterThanOrEqual(10);
  });

  it('places a boss on every fifth stage', () => {
    const stages = Array.from(new Set(ENCOUNTERS.map((enc) => enc.stage)));
    for (const stage of stages) {
      if (stage % 5 !== 0) continue;
      const bosses = bossEncounters().filter((enc) => enc.stage === stage);
      expect(bosses.length).toBeGreaterThan(0);
      for (const boss of bosses) {
        const enemies = boss.enemies.map((group) => ENEMIES[group.enemyId]!);
        expect(enemies.some((enemy) => enemy.isBoss)).toBe(true);
        for (const enemy of enemies.filter((e) => e.isBoss)) {
          expect(enemy.special).toBeTruthy();
          expect(SKILLS[enemy.special!]).toBeTruthy();
          expect(enemy.resistances.length).toBeGreaterThan(0);
          expect(enemy.weaknesses.length).toBeGreaterThan(0);
          expect(enemy.art).toBeTruthy();
        }
      }
    }
  });

  it('references only existing enemies, skills and items', () => {
    for (const enc of ENCOUNTERS) {
      expect(enc.enemies.length).toBeGreaterThan(0);
      for (const group of enc.enemies) {
        const enemy = ENEMIES[group.enemyId];
        expect(enemy, `unknown enemy ${group.enemyId}`).toBeTruthy();
        for (const skillId of enemy!.skills) {
          expect(SKILLS[skillId], `unknown skill ${skillId}`).toBeTruthy();
        }
      }
      for (const entry of enc.loot) {
        if (entry.item) {
          expect(ITEMS[entry.item], `unknown item ${entry.item}`).toBeTruthy();
        }
      }
    }
  });

  it('keeps the stage helpers consistent', () => {
    expect(encountersForStage(1).length).toBeGreaterThan(0);
    expect(getEncounter('enc.s1_wolf_pack')).toBeTruthy();
    expect(getEncounter('enc.does.not.exist')).toBeUndefined();
    expect(bossEncounters().length).toBeGreaterThanOrEqual(2);
  });
});
