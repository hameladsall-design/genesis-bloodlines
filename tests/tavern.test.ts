import { describe, expect, it } from 'vitest';

import { GameStore } from '../src/game/simulation/store';
import type {
  Character,
  DifficultyProfile,
  GameState,
  NewGameConfig,
} from '../src/game/simulation/types';
import {
  BASE_RECRUIT_PRICE,
  createCharacter,
  marriageCandidates,
  recruitCandidate,
  recruitPriceFor,
  refreshTavern,
  removeCandidate,
  tavernOffers,
  tavernSlots,
} from '../src/game/simulation/systems/tavern';

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
  seed: 'test-seed',
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
      seed: 'test-seed',
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

function plainHuman(level = 1): Character {
  return createCharacter({
    firstName: 'حسن',
    familyName: 'الرعوي',
    sex: 'male',
    race: 'human',
    age: 20,
    level,
  });
}

/* ------------------------------------------------------------------ */
/* Pricing                                                            */
/* ------------------------------------------------------------------ */

describe('tavern pricing', () => {
  it('prices a plain level-1 human at exactly 10 coins', () => {
    const human = plainHuman(1);
    expect(BASE_RECRUIT_PRICE).toBe(10);
    expect(recruitPriceFor(human, 1, 1)).toBe(10);
    expect(Number.isInteger(recruitPriceFor(human, 1, 1))).toBe(true);
  });

  it('prices a rarer species above the base price', () => {
    const elf = createCharacter({
      firstName: 'ليث',
      familyName: 'الغامدي',
      sex: 'male',
      race: 'elf',
      age: 60,
      level: 1,
    });
    const demon = createCharacter({
      firstName: 'آدم',
      familyName: 'الخطيب',
      sex: 'male',
      race: 'demon',
      age: 50,
      level: 1,
    });
    expect(recruitPriceFor(elf, 1, 1)).toBeGreaterThan(10);
    expect(recruitPriceFor(demon, 1, 1)).toBeGreaterThan(recruitPriceFor(elf, 1, 1));
  });

  it('never returns a price below the base price', () => {
    const human = plainHuman(1);
    expect(recruitPriceFor(human, 1, 0.5)).toBeGreaterThanOrEqual(10);
    expect(recruitPriceFor(human, 1, 2)).toBeGreaterThan(10);
  });

  it('shows the exact price on the candidate before any purchase', () => {
    const store = new GameStore(makeState(), 'price-seed');
    const offers = refreshTavern(store);
    expect(offers.length).toBeGreaterThan(0);
    for (const candidate of offers) {
      expect(candidate.price).toBe(
        recruitPriceFor(candidate.character, candidate.tier, store.state.difficulty.recruitmentPriceMultiplier),
      );
      expect(candidate.price).toBeGreaterThanOrEqual(BASE_RECRUIT_PRICE);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Roster                                                             */
/* ------------------------------------------------------------------ */

describe('tavern roster', () => {
  it('fills the slots that belong to the base level', () => {
    const store = new GameStore(makeState(), 'roster-seed');
    const offers = refreshTavern(store);
    expect(offers.length).toBe(tavernSlots(store.state.base.level));
    expect(offers.length).toBeGreaterThan(0);
  });

  it('never lists the same character twice', () => {
    const store = new GameStore(makeState(), 'roster-seed-2');
    const offers = refreshTavern(store);
    const ids = new Set(offers.map((candidate) => candidate.character.id));
    const names = new Set(offers.map((candidate) => `${candidate.character.firstName} ${candidate.character.familyName}`));
    expect(ids.size).toBe(offers.length);
    expect(names.size).toBe(offers.length);
  });

  it('rotates the roster with the calendar', () => {
    const store = new GameStore(makeState(), 'roster-seed-3');
    const first = refreshTavern(store);
    const firstIds = first.map((candidate) => candidate.id).join(',');
    store.state.calendar.totalDays += 30;
    const second = refreshTavern(store);
    expect(second.map((candidate) => candidate.id).join(',')).not.toBe(firstIds);
  });
});

/* ------------------------------------------------------------------ */
/* Hiring                                                             */
/* ------------------------------------------------------------------ */

describe('recruiting', () => {
  it('deducts the coins once and adds the character', () => {
    const store = new GameStore(makeState(), 'hire-seed');
    refreshTavern(store);
    const candidate = tavernOffers(store)[0]!;
    const coinsBefore = store.getResource('coins');

    const result = recruitCandidate(store, candidate.id);

    expect(result.ok).toBe(true);
    expect(result.characterId).toBe(candidate.character.id);
    expect(store.getResource('coins')).toBe(coinsBefore - candidate.price);
    expect(store.state.characters[candidate.character.id]).toBeDefined();
    expect(store.livingCount()).toBe(1);
    expect(store.state.recruitedIds).toContain(candidate.character.id);
    expect(candidate.character.household).toBe('resident');
  });

  it('never hires the same candidate twice', () => {
    const store = new GameStore(makeState(), 'hire-seed-2');
    refreshTavern(store);
    const candidate = tavernOffers(store)[0]!;
    const coinsBefore = store.getResource('coins');

    expect(recruitCandidate(store, candidate.id).ok).toBe(true);
    const second = recruitCandidate(store, candidate.id);

    expect(second.ok).toBe(false);
    expect(second.reason).toBeTruthy();
    expect(store.getResource('coins')).toBe(coinsBefore - candidate.price);
    expect(store.livingCount()).toBe(1);
    expect(store.state.recruitedIds.filter((id) => id === candidate.character.id)).toHaveLength(1);
  });

  it('charges nothing when the purse is too light', () => {
    const store = new GameStore(makeState({ resources: { coins: 0 } }), 'hire-seed-3');
    refreshTavern(store);
    const candidate = tavernOffers(store)[0]!;

    const result = recruitCandidate(store, candidate.id);

    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(store.getResource('coins')).toBe(0);
    expect(store.livingCount()).toBe(0);
    expect(store.state.recruitedIds).toHaveLength(0);
  });

  it('refuses to hire beyond the population capacity', () => {
    const base = { ...makeState().base, capacity: 1 };
    const store = new GameStore(makeState({ base }), 'hire-seed-4');
    const founder = createCharacter({
      firstName: 'مؤسس',
      familyName: 'الرعوي',
      sex: 'male',
      race: 'human',
      age: 40,
      level: 1,
      household: 'family',
      isFounder: true,
    });
    store.addCharacter(founder);
    refreshTavern(store);
    const candidate = tavernOffers(store)[0]!;
    const coinsBefore = store.getResource('coins');

    const result = recruitCandidate(store, candidate.id);

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/capacity/i);
    expect(result.reason).toMatch(/طور|upgrade/i);
    expect(store.getResource('coins')).toBe(coinsBefore);
    expect(store.livingCount()).toBe(1);
  });

  it('drops a candidate from the offer list without hiring them', () => {
    const store = new GameStore(makeState(), 'remove-seed');
    refreshTavern(store);
    const candidate = tavernOffers(store)[0]!;

    removeCandidate(store, candidate.id);

    expect(tavernOffers(store).find((entry) => entry.id === candidate.id)).toBeUndefined();
    expect(store.getResource('coins')).toBe(500);
    expect(store.livingCount()).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Marriage                                                           */
/* ------------------------------------------------------------------ */

describe('marriage candidates', () => {
  it('lists only living, unpartnered and mature partners', () => {
    const store = new GameStore(makeState(), 'marriage-seed');
    const hero = createCharacter({
      firstName: 'حسن',
      familyName: 'الرعوي',
      sex: 'male',
      race: 'human',
      age: 30,
      level: 1,
      household: 'family',
    });
    const partner = createCharacter({
      firstName: 'سارة',
      familyName: 'الغامدي',
      sex: 'female',
      race: 'human',
      age: 28,
      level: 1,
      household: 'family',
    });
    const child = createCharacter({
      firstName: 'صبي',
      familyName: 'الرعوي',
      sex: 'male',
      race: 'human',
      age: 8,
      level: 1,
      household: 'family',
    });
    const taken = createCharacter({
      firstName: 'مريم',
      familyName: 'العنزي',
      sex: 'female',
      race: 'human',
      age: 26,
      level: 1,
      household: 'family',
    });
    taken.partnerId = 'someone-else';
    store.addCharacter(hero);
    store.addCharacter(partner);
    store.addCharacter(child);
    store.addCharacter(taken);

    const candidates = marriageCandidates(store, hero);

    expect(candidates.map((entry) => entry.id)).toContain(partner.id);
    expect(candidates.map((entry) => entry.id)).not.toContain(child.id);
    expect(candidates.map((entry) => entry.id)).not.toContain(taken.id);
    expect(candidates.map((entry) => entry.id)).not.toContain(hero.id);
  });
});
