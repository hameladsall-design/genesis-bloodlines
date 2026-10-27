/**
 * Base progression and building placement tests.
 */

import { describe, expect, it } from 'vitest';
import { BASE_LEVELS, getBaseLevel, nextBaseLevel } from '../src/game/content/baseLevels';
import {
  BUILDINGS,
  BUILDING_LIST,
  buildingsUnlockedAt,
  getBuilding,
  getBuildingDef,
} from '../src/game/content/buildings';
import { GameStore } from '../src/game/simulation/store';
import type { Calendar, Character, CombatStats, GameState } from '../src/game/simulation/types';
import {
  canUpgradeBase,
  isBuildingUnlocked,
  isPlacementValid,
  placeBuilding,
  populationCapacity,
  upgradeBase,
} from '../src/game/simulation/systems/base';

const SEED = 'genesis-test-seed';

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
    firstName: 'Founder',
    familyName: 'Fang',
    sex: 'female',
    race: 'human',
    age: 24,
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
    job: 'idle',
    x: 0,
    y: 0,
    zone: 'home',
    portraitSeed: 7,
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

function richStore(characters: Character[] = [makeCharacter('founder')]): GameStore {
  const store = new GameStore(makeState(characters), SEED);
  store.addResources({ wood: 1000, stone: 1000, iron: 1000, coins: 1000, food: 100 });
  return store;
}

describe('base level table', () => {
  it('has exactly ten levels with the required names and order', () => {
    expect(BASE_LEVELS.length).toBe(10);
    expect(BASE_LEVELS.map((l) => l.nameEn)).toEqual([
      'Basic Shelter',
      'Reinforced Shelter',
      'Wooden Camp',
      'Fortified Camp',
      'Small Stronghold',
      'Stone Fortress',
      'Expanded Fortress',
      'Settlement',
      'Town',
      'Kingdom Capital',
    ]);
  });

  it('gives level 1 a population capacity of exactly 10', () => {
    expect(getBaseLevel(1).capacity).toBe(10);
    expect(BASE_LEVELS[0].capacity).toBe(10);
  });

  it('raises capacity, expands the area and costs something on every level', () => {
    for (let i = 1; i < BASE_LEVELS.length; i++) {
      const prev = BASE_LEVELS[i - 1];
      const cur = BASE_LEVELS[i];
      expect(cur.capacity).toBeGreaterThan(prev.capacity);
      expect(cur.area.w * cur.area.h).toBeGreaterThan(prev.area.w * prev.area.h);
      expect(cur.defense).toBeGreaterThan(prev.defense);
      expect(Object.keys(cur.cost).length).toBeGreaterThan(0);
      expect(Object.keys(cur.cost)).toEqual(
        expect.arrayContaining(['wood', 'stone', 'coins']),
      );
    }
  });

  it('exposes the next level and stops at the maximum', () => {
    expect(nextBaseLevel(1)?.level).toBe(2);
    expect(nextBaseLevel(10)).toBeUndefined();
  });
});

describe('building catalog', () => {
  it('holds at least 40 distinct buildings', () => {
    expect(BUILDING_LIST.length).toBeGreaterThanOrEqual(40);
    expect(Object.keys(BUILDINGS).length).toBe(BUILDING_LIST.length);
  });

  it('gives every building a complete definition', () => {
    for (const def of BUILDING_LIST) {
      expect(def.id).toBeTruthy();
      expect(def.nameAr.length).toBeGreaterThan(0);
      expect(def.nameEn.length).toBeGreaterThan(0);
      expect(def.descAr.length).toBeGreaterThan(0);
      expect(def.descEn.length).toBeGreaterThan(0);
      expect(def.art.length).toBeGreaterThan(0);
      expect(def.buildDays).toBeGreaterThan(0);
      expect(def.maxLevel).toBeGreaterThan(0);
      expect(def.unlockBaseLevel).toBeGreaterThanOrEqual(1);
      expect(def.footprint.w).toBeGreaterThan(0);
      expect(def.footprint.h).toBeGreaterThan(0);
      expect(Object.keys(def.cost).length).toBeGreaterThan(0);
    }
  });

  it('keeps the base level unlock lists in sync with the building definitions', () => {
    for (const level of BASE_LEVELS) {
      for (const id of level.unlocksBuildings) {
        const def = getBuilding(id);
        expect(def, `${id} is listed by level ${level.level} but does not exist`).toBeTruthy();
        expect(def?.unlockBaseLevel).toBe(level.level);
      }
    }
    for (const def of BUILDING_LIST) {
      const level = BASE_LEVELS.find((l) => l.level === def.unlockBaseLevel);
      expect(level?.unlocksBuildings).toContain(def.id);
    }
  });

  it('unlocks more buildings as the settlement grows', () => {
    let previous = 0;
    for (const level of BASE_LEVELS) {
      const unlocked = buildingsUnlockedAt(level.level).length;
      expect(unlocked).toBeGreaterThan(previous);
      previous = unlocked;
    }
  });
});

describe('base upgrades', () => {
  it('requires materials, deducts them, raises capacity and unlocks buildings', () => {
    const store = richStore();
    const before = populationCapacity(store.state);
    const next = nextBaseLevel(store.state.base.level);
    expect(next).toBeTruthy();

    const check = canUpgradeBase(store);
    expect(check.ok).toBe(true);

    expect(upgradeBase(store)).toBe(true);
    expect(store.state.base.level).toBe(2);
    expect(populationCapacity(store.state)).toBeGreaterThan(before);
    expect(store.state.base.capacity).toBe(next?.capacity);

    expect(store.getResource('wood')).toBe(1000 - (next?.cost.wood ?? 0));
    expect(store.getResource('stone')).toBe(1000 - (next?.cost.stone ?? 0));
    expect(store.getResource('coins')).toBe(1000 - (next?.cost.coins ?? 0));

    const newlyUnlocked = BUILDING_LIST.filter((d) => d.unlockBaseLevel === 2);
    expect(newlyUnlocked.length).toBeGreaterThan(0);
    for (const def of newlyUnlocked) {
      expect(isBuildingUnlocked(def.id, 2)).toBe(true);
    }
    expect(isBuildingUnlocked('small_farm', 1)).toBe(false);
  });

  it('fails without enough materials and deducts nothing', () => {
    const store = new GameStore(makeState([makeCharacter('founder')]), SEED);
    const check = canUpgradeBase(store);
    expect(check.ok).toBe(false);
    expect(check.reason && check.reason.length).toBeGreaterThan(0);
    expect(check.missing && Object.keys(check.missing).length).toBeGreaterThan(0);

    expect(upgradeBase(store)).toBe(false);
    expect(store.state.base.level).toBe(1);
    expect(store.state.base.capacity).toBe(10);
    expect(store.getResource('wood')).toBe(0);
    expect(store.getResource('stone')).toBe(0);
    expect(store.getResource('iron')).toBe(0);
    expect(store.getResource('coins')).toBe(0);
  });

  it('keeps the level and capacity through a save/load round trip', () => {
    const store = richStore();
    expect(upgradeBase(store)).toBe(true);
    const level = store.state.base.level;
    const capacity = store.state.base.capacity;

    const reloaded = JSON.parse(JSON.stringify(store.state)) as GameState;
    expect(reloaded.base.level).toBe(level);
    expect(reloaded.base.capacity).toBe(capacity);
    expect(populationCapacity(reloaded)).toBe(populationCapacity(store.state));

    const restored = new GameStore(reloaded, SEED);
    expect(restored.state.base.level).toBe(2);
    expect(restored.state.base.capacity).toBe(capacity);
  });
});

describe('building placement', () => {
  it('deducts the cost and creates an instance under construction', () => {
    const store = richStore();
    const def = getBuilding('tent');
    expect(def).toBeTruthy();

    const result = placeBuilding(store, 'tent', 0, 0);
    expect(result.ok).toBe(true);
    expect(result.id).toBeTruthy();
    expect(store.state.base.buildings.length).toBe(1);

    const instance = store.state.base.buildings[0];
    expect(instance.defId).toBe('tent');
    expect(instance.x).toBe(0);
    expect(instance.y).toBe(0);
    expect(instance.underConstruction).toBe(true);
    expect(instance.constructionDaysLeft).toBe(def?.buildDays);
    expect(instance.level).toBe(1);

    expect(store.getResource('wood')).toBe(1000 - (def?.cost.wood ?? 0));
    expect(store.getResource('coins')).toBe(1000 - (def?.cost.coins ?? 0));
  });

  it('rejects an out-of-bounds placement and spends nothing', () => {
    const store = richStore();
    const level = getBaseLevel(store.state.base.level);

    expect(isPlacementValid(store.state, 'tent', 0, 0)).toBe(true);
    expect(isPlacementValid(store.state, 'tent', level.area.w, 0)).toBe(false);
    expect(isPlacementValid(store.state, 'tent', 0, level.area.h)).toBe(false);
    expect(isPlacementValid(store.state, 'tent', -1, 0)).toBe(false);

    const result = placeBuilding(store, 'tent', level.area.w + 5, 0);
    expect(result.ok).toBe(false);
    expect(result.reason && result.reason.length).toBeGreaterThan(0);
    expect(store.state.base.buildings.length).toBe(0);
    expect(store.getResource('wood')).toBe(1000);
    expect(store.getResource('coins')).toBe(1000);
  });

  it('rejects an overlapping placement and spends nothing', () => {
    const store = richStore();
    const def = getBuilding('tent');
    expect(placeBuilding(store, 'tent', 1, 1).ok).toBe(true);
    const woodAfterFirst = store.getResource('wood');

    expect(isPlacementValid(store.state, 'tent', 1, 1)).toBe(false);
    const result = placeBuilding(store, 'tent', 1, 1);
    expect(result.ok).toBe(false);
    expect(store.state.base.buildings.length).toBe(1);
    expect(store.getResource('wood')).toBe(woodAfterFirst);
    expect(store.getResource('coins')).toBe(1000 - (def?.cost.coins ?? 0));
  });

  it('refuses a locked building without spending anything', () => {
    const store = richStore();
    const result = placeBuilding(store, 'library', 0, 0);
    expect(result.ok).toBe(false);
    expect(store.state.base.buildings.length).toBe(0);
    expect(store.getResource('wood')).toBe(1000);
    expect(store.getResource('stone')).toBe(1000);
  });
});
