/**
 * Food, starvation and farming tests.
 */

import { describe, expect, it } from 'vitest';
import { getBuildingDef } from '../src/game/content/buildings';
import { GameStore } from '../src/game/simulation/store';
import type { Calendar, Character, CombatStats, GameState } from '../src/game/simulation/types';
import {
  consumeFood,
  dailyFoodConsumption,
  gatherFromNode,
  harvestFarm,
  canPlantFarm,
  plantFarm,
  starvationStatus,
  tickConstruction,
  tickProduction,
  tickStarvation,
} from '../src/game/simulation/systems/economy';
import { placeBuilding } from '../src/game/simulation/systems/base';

const SEED = 'genesis-food-seed';

function makeStats(): CombatStats {
  return {
    hp: 100,
    damage: 10,
    defense: 10,
    stamina: 100,
    speed: 10,
    accuracy: 10,
    evasion: 10,
    critChance: 5,
    magicResist: 0,
    attackRange: 1,
    attackSpeed: 1,
  };
}

function makeCharacter(id: string, overrides: Partial<Character> = {}): Character {
  const stats = makeStats();
  return {
    id,
    firstName: `Farmer${id}`,
    familyName: 'Fang',
    sex: 'female',
    race: 'human',
    age: 26,
    level: 1,
    xp: 0,
    xpToNext: 100,
    health: 100,
    baseStats: { ...stats },
    stats: { ...stats },
    genotype: {},
    phenotype: [],
    skills: [],
    equipment: {},
    personality: [],
    relationships: [],
    family: { partnerIds: [], childIds: [], siblingIds: [] },
    status: { condition: 'healthy', hunger: 100, morale: 80, effects: [] },
    history: [],
    alive: true,
    bornDay: 0,
    isFounder: true,
    household: 'family',
    job: 'farmer',
    x: 0,
    y: 0,
    zone: 'home',
    portraitSeed: 3,
    ...overrides,
  };
}

function makeCalendar(): Calendar {
  return { year: 1, month: 1, day: 1, hour: 6, minute: 0, totalDays: 0 };
}

function makeState(characters: Character[] = []): GameState {
  const map: Record<string, Character> = {};
  const order: string[] = [];
  for (const c of characters) {
    map[c.id] = c;
    order.push(c.id);
  }
  return {
    version: 1,
    config: {
      founderName: 'Founder',
      familyName: 'Fang',
      dynastyName: 'Fang',
      emblem: 'wolf',
      primaryColor: '#ffffff',
      secondaryColor: '#000000',
      seed: SEED,
      worldSize: 'small',
      difficulty: 'normal',
      enemyDensity: 'normal',
      resourceAbundance: 'normal',
      diseaseFrequency: 'rare',
      disasterFrequency: 'rare',
      timeSpeed: 1,
    },
    difficulty: {
      enemyHealth: 1,
      enemyDamage: 1,
      enemyXp: 1,
      lootMultiplier: 1,
      diseaseChance: 0.01,
      disasterChance: 0.01,
      recruitmentPriceMultiplier: 1,
    },
    calendar: makeCalendar(),
    weather: 'clear',
    world: {
      seed: SEED,
      size: 'small',
      calendar: makeCalendar(),
      weather: 'clear',
      daylight: 1,
      resources: {},
      resourceNodes: [],
      unlockedZones: [],
      baseX: 0,
      baseY: 0,
    },
    characters: map,
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
    resources: { wood: 0, stone: 0, iron: 0, food: 0, coins: 0 },
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

/** Advances the in-game calendar by one day. */
function advanceDay(store: GameStore): void {
  const cal = store.state.calendar;
  cal.totalDays += 1;
  cal.day += 1;
  if (cal.day > 30) {
    cal.day = 1;
    cal.month += 1;
  }
}

/** Runs the construction tick until every building is finished. */
function finishConstruction(store: GameStore): void {
  for (let i = 0; i < 30; i++) {
    if (!store.state.base.buildings.some((b) => b.underConstruction)) return;
    advanceDay(store);
    tickConstruction(store);
  }
}

describe('daily food consumption', () => {
  it('equals the number of living characters', () => {
    const chars = [makeCharacter('a'), makeCharacter('b'), makeCharacter('c', { alive: false })];
    const store = new GameStore(makeState(chars), SEED);
    expect(dailyFoodConsumption(store.state)).toBe(2);
    expect(store.dailyFoodConsumption()).toBe(2);
    expect(dailyFoodConsumption(store.state)).toBe(store.livingCount());
  });

  it('deducts exactly one food unit per living character and reports the shortfall', () => {
    const chars = [makeCharacter('a'), makeCharacter('b'), makeCharacter('c')];
    const store = new GameStore(makeState(chars), SEED);
    store.addResource('food', 10);

    const result = consumeFood(store);
    expect(result.consumed).toBe(3);
    expect(result.shortfall).toBe(0);
    expect(store.getResource('food')).toBe(7);
    expect(result.daysOfFoodLeft).toBeCloseTo(7 / 3, 5);

    advanceDay(store);
    const second = consumeFood(store);
    expect(second.consumed).toBe(3);
    expect(store.getResource('food')).toBe(4);
  });

  it('reports a shortfall when there is not enough food', () => {
    const chars = [makeCharacter('a'), makeCharacter('b'), makeCharacter('c')];
    const store = new GameStore(makeState(chars), SEED);
    store.addResource('food', 1);

    const result = consumeFood(store);
    expect(result.consumed).toBe(1);
    expect(result.shortfall).toBe(2);
    expect(store.getResource('food')).toBe(0);
  });
});

describe('starvation', () => {
  it('warns before any damage is done', () => {
    const a = makeCharacter('a');
    const store = new GameStore(makeState([a]), SEED);
    store.state.resources.food = 0;
    const healthBefore = a.health;

    tickStarvation(store);

    expect(store.state.notifications.some((n) => n.kind === 'warn')).toBe(true);
    expect(store.state.base.starvationDays).toBe(1);
    expect(starvationStatus(store.state).level).toBe('warning');
    expect(a.health).toBe(healthBefore);
    expect(a.alive).toBe(true);
  });

  it('damages the settlement progressively and never kills on the first day', () => {
    const a = makeCharacter('a');
    const b = makeCharacter('b');
    const store = new GameStore(makeState([a, b]), SEED);
    store.state.resources.food = 0;
    const healthBefore = a.health;

    for (let day = 0; day < 5; day++) {
      advanceDay(store);
      tickStarvation(store);
    }

    expect(store.state.base.starvationDays).toBe(5);
    expect(starvationStatus(store.state).level).toBe('critical');
    expect(store.state.notifications.some((n) => n.kind === 'danger')).toBe(true);
    expect(a.health).toBeLessThan(healthBefore);
    expect(b.health).toBeLessThan(healthBefore);
    expect(a.alive).toBe(true);
    expect(b.alive).toBe(true);
    expect(store.state.base.unrest).toBeGreaterThan(0);
  });

  it('recovers when the food comes back', () => {
    const a = makeCharacter('a');
    const store = new GameStore(makeState([a]), SEED);
    store.state.resources.food = 0;

    tickStarvation(store);
    expect(store.state.base.starvationDays).toBe(1);

    advanceDay(store);
    store.addResource('food', 50);
    tickStarvation(store);
    expect(store.state.base.starvationDays).toBe(0);
    expect(starvationStatus(store.state).level).toBe('none');
  });
});

describe('farming', () => {
  it('yields food after the growth period and empties the field after harvest', () => {
    const farmer = makeCharacter('farmer');
    const store = new GameStore(makeState([farmer]), SEED);
    store.state.base.level = 2;
    store.state.base.capacity = 16;
    store.addResources({ wood: 500, stone: 500, coins: 500 });

    const placed = placeBuilding(store, 'small_farm', 0, 0);
    expect(placed.ok).toBe(true);
    finishConstruction(store);

    const growDays = getBuildingDef('small_farm')?.growDays ?? 4;
    expect(growDays).toBeGreaterThan(0);

    expect(canPlantFarm(store).ok).toBe(true);
    expect(plantFarm(store)).toBe(true);

    // The field is not ready yet.
    expect(harvestFarm(store).ok).toBe(false);

    for (let day = 0; day < growDays; day++) {
      advanceDay(store);
      tickProduction(store);
    }

    const harvest = harvestFarm(store);
    expect(harvest.ok).toBe(true);
    expect(harvest.food).toBeGreaterThan(0);
    expect(store.getResource('food')).toBeGreaterThanOrEqual(harvest.food ?? 0);

    // The field is empty after the harvest.
    const second = harvestFarm(store);
    expect(second.ok).toBe(false);
    expect(canPlantFarm(store).ok).toBe(true);
  });
});

describe('gathering', () => {
  it('never yields more material than the node holds', () => {
    const a = makeCharacter('a');
    const state = makeState([a]);
    state.world.resourceNodes = [
      {
        id: 'node_wood',
        kind: 'wood',
        x: 2,
        y: 3,
        zone: 'home',
        amount: 5,
        maxAmount: 5,
        regrowIn: 0,
        hardness: 0,
      },
    ];
    const store = new GameStore(state, SEED);

    const first = gatherFromNode(store, 'node_wood', 'a');
    expect(first.ok).toBe(true);
    const firstGain = Object.values(first.gained ?? {})[0] ?? 0;
    expect(firstGain).toBeGreaterThan(0);

    // The same character cannot harvest twice in a day.
    const sameDay = gatherFromNode(store, 'node_wood', 'a');
    expect(sameDay.ok).toBe(false);

    advanceDay(store);
    a.stats.stamina = 100;
    const nextDay = gatherFromNode(store, 'node_wood', 'a');
    if (nextDay.ok) {
      const gain = Object.values(nextDay.gained ?? {})[0] ?? 0;
      expect(gain).toBeLessThanOrEqual(5);
    }
    expect(store.getResource('wood')).toBeLessThanOrEqual(5);
  });
});
