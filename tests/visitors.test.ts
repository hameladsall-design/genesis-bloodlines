import { describe, expect, it } from 'vitest';

import { GameStore } from '../src/game/simulation/store';
import { advanceDays } from '../src/game/simulation/calendar';
import type {
  DifficultyProfile,
  GameState,
  NewGameConfig,
} from '../src/game/simulation/types';
import {
  daysSinceLastVisitor,
  maybeSpawnVisitor,
  pendingVisitors,
  resolveVisitor,
  visitorArriveDay,
  VISITOR_INTERVAL_DAYS,
  type VisitorExtended,
} from '../src/game/simulation/systems/visitors';
import { createFactions } from '../src/game/simulation/systems/factions';

/* ------------------------------------------------------------------ */
/* Local test world                                                   */
/* ------------------------------------------------------------------ */

const CONFIG: NewGameConfig = {
  founderName: 'مؤسس',
  familyName: 'الرعوي',
  dynastyName: 'بيت الرعوي',
  emblem: 'wolf',
  primaryColor: '#7a1f1f',
  secondaryColor: '#c9a227',
  seed: 'visitor-seed',
  worldSize: 'small',
  difficulty: 'normal',
  enemyDensity: 'normal',
  resourceAbundance: 'normal',
  diseaseFrequency: 'normal',
  disasterFrequency: 'normal',
  timeSpeed: 1,
};

const DIFFICULTY: DifficultyProfile = {
  enemyHealth: 1,
  enemyDamage: 1,
  enemyXp: 1,
  lootMultiplier: 1,
  diseaseChance: 0.1,
  disasterChance: 0.05,
  recruitmentPriceMultiplier: 1,
};

function makeState(overrides: Partial<GameState> = {}): GameState {
  const calendar = { year: 1, month: 1, day: 1, hour: 6, minute: 0, totalDays: 0 };
  const state: GameState = {
    version: 1,
    config: CONFIG,
    difficulty: DIFFICULTY,
    calendar,
    weather: 'clear',
    world: {
      seed: 'visitor-seed',
      size: 'small',
      calendar,
      weather: 'clear',
      daylight: 1,
      resources: {},
      resourceNodes: [],
      baseX: 10,
      baseY: 10,
      unlockedZones: ['home_valley'],
    },
    characters: {},
    characterOrder: [],
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
    resources: { coins: 500, food: 100, wood: 50, stone: 20 },
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
  return { ...state, ...overrides };
}

function newStore(seed: string): GameStore {
  return new GameStore(makeState(), seed);
}

/* ------------------------------------------------------------------ */
/* Timing                                                             */
/* ------------------------------------------------------------------ */

describe('visitor timing', () => {
  it('arrives about once per in-game month and not on every tick', () => {
    const store = newStore('timing-seed');
    expect(daysSinceLastVisitor(store.state)).toBe(Number.POSITIVE_INFINITY);

    const first = maybeSpawnVisitor(store);
    expect(first).not.toBeNull();
    expect(visitorArriveDay(store.state)).toBe(store.state.calendar.totalDays);
    expect(daysSinceLastVisitor(store.state)).toBe(0);

    // Same day: nothing new.
    expect(maybeSpawnVisitor(store)).toBeNull();

    // Resolve the visitor so the gate is free again.
    expect(resolveVisitor(store, first!.id, 'send_away').ok).toBe(true);

    // Every day of the month that follows: still nothing.
    for (let day = 1; day < VISITOR_INTERVAL_DAYS; day++) {
      advanceDays(store.state.calendar, 1);
      expect(maybeSpawnVisitor(store)).toBeNull();
    }

    // The next month brings a new visitor.
    advanceDays(store.state.calendar, 1);
    const second = maybeSpawnVisitor(store);
    expect(second).not.toBeNull();
    expect(second!.id).not.toBe(first!.id);
    expect(store.state.visitors).toHaveLength(2);
  });

  it('never spawns a duplicate inside the same month', () => {
    const store = newStore('duplicate-seed');
    const first = maybeSpawnVisitor(store);
    expect(first).not.toBeNull();

    for (let i = 0; i < 5; i++) {
      expect(maybeSpawnVisitor(store)).toBeNull();
    }
    expect(store.state.visitors).toHaveLength(1);
    expect(pendingVisitors(store.state)).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* Actions                                                            */
/* ------------------------------------------------------------------ */

describe('visitor actions', () => {
  it('recruits a visitor into the household', () => {
    const store = newStore('recruit-seed');
    const visitor = maybeSpawnVisitor(store)!;
    const coinsBefore = store.getResource('coins');

    const result = resolveVisitor(store, visitor.id, 'recruit');

    expect(result.ok).toBe(true);
    expect(visitor.disposition).toBe('recruited');
    expect(visitor.resolvedDay).toBe(store.state.calendar.totalDays);
    expect(store.livingCount()).toBe(1);
    expect(store.state.characters[visitor.character.id]).toBeDefined();
    expect(store.state.recruitedIds).toContain(visitor.character.id);
    expect(store.getResource('coins')).toBeLessThan(coinsBefore);
    expect(pendingVisitors(store.state)).toHaveLength(0);
  });

  it('kills a visitor and never lets the dead be recruited', () => {
    const store = newStore('kill-seed');
    const visitor = maybeSpawnVisitor(store)!;

    const result = resolveVisitor(store, visitor.id, 'kill');

    expect(result.ok).toBe(true);
    expect(visitor.disposition).toBe('killed');
    expect(visitor.character.alive).toBe(false);
    expect(visitor.character.permadead).toBe(true);
    expect(visitor.character.causeOfDeath).toBeTruthy();
    expect(pendingVisitors(store.state)).toHaveLength(0);

    const again = resolveVisitor(store, visitor.id, 'recruit');
    expect(again.ok).toBe(false);
  });

  it('sends a visitor away without harm', () => {
    const store = newStore('away-seed');
    const visitor = maybeSpawnVisitor(store)!;

    const result = resolveVisitor(store, visitor.id, 'send_away');

    expect(result.ok).toBe(true);
    expect(visitor.disposition).toBe('sent_away');
    expect(visitor.character.alive).toBe(true);
    expect(store.livingCount()).toBe(0);
    expect(pendingVisitors(store.state)).toHaveLength(0);
  });

  it('lowers the standing with the faction of a killed visitor', () => {
    const store = newStore('faction-seed');
    createFactions(store);
    const visitor = maybeSpawnVisitor(store)!;
    const factionId = (visitor as VisitorExtended).factionId;
    expect(factionId).toBeTruthy();
    const before = store.state.factions[factionId!]!.reputation;

    resolveVisitor(store, visitor.id, 'kill');

    expect(store.state.factions[factionId!]!.reputation).toBeLessThan(before);
  });
});

/* ------------------------------------------------------------------ */
/* Persistence                                                        */
/* ------------------------------------------------------------------ */

describe('visitor persistence', () => {
  it('never offers a recruited visitor again', () => {
    const store = newStore('persist-seed');
    const visitor = maybeSpawnVisitor(store)!;

    resolveVisitor(store, visitor.id, 'recruit');

    expect(pendingVisitors(store.state)).toHaveLength(0);
    expect(store.state.visitors.find((entry) => entry.id === visitor.id)?.disposition).toBe('recruited');

    // Still inside the same month: no new visitor is spawned.
    advanceDays(store.state.calendar, 10);
    expect(maybeSpawnVisitor(store)).toBeNull();

    // The recruited body is part of the household, not a free guest.
    expect(store.state.characters[visitor.character.id]?.household).toBe('resident');
  });
});
