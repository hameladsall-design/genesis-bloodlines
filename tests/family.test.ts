/**
 * Family tests — species rules, kinship, permadeath and levelling.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../src/game/simulation/rng';
import { GameStore } from '../src/game/simulation/store';
import type { GameState } from '../src/game/simulation/types';
import { SPECIES, canReproduce, ensureHybridSpecies } from '../src/game/content/species';
import {
  birthChild,
  buildFamilyTree,
  createCharacter,
  findHeir,
  killCharacter,
  marry,
  setRelationship,
  tickPregnancy,
} from '../src/game/simulation/systems/family';
import { grantXp } from '../src/game/simulation/systems/progression';

/* ------------------------------------------------------------------ */
/* Test world                                                          */
/* ------------------------------------------------------------------ */

function makeState(): GameState {
  const calendar = { year: 1, month: 1, day: 1, hour: 6, minute: 0, totalDays: 0 };
  return {
    version: 1,
    config: {
      founderName: 'المؤسس',
      familyName: 'السلالة',
      dynastyName: 'الدينasty',
      emblem: 'wolf',
      primaryColor: '#8b0000',
      secondaryColor: '#222222',
      seed: 'family-test-seed',
      worldSize: 'small',
      difficulty: 'normal',
      enemyDensity: 'normal',
      resourceAbundance: 'normal',
      diseaseFrequency: 'normal',
      disasterFrequency: 'normal',
      timeSpeed: 1,
    },
    difficulty: {
      enemyHealth: 1,
      enemyDamage: 1,
      enemyXp: 1,
      lootMultiplier: 1,
      diseaseChance: 0.1,
      disasterChance: 0.1,
      recruitmentPriceMultiplier: 1,
    },
    calendar: { ...calendar },
    weather: 'clear',
    world: {
      seed: 'family-test-seed',
      size: 'small',
      calendar: { ...calendar },
      weather: 'clear',
      daylight: 1,
      resources: {},
      resourceNodes: [],
      baseX: 0,
      baseY: 0,
      unlockedZones: [],
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
    tutorialComplete: false,
    dynastyRecords: [],
    chronicle: [],
  };
}

function makeStore(seed = 'family-test'): GameStore {
  return new GameStore(makeState(), seed);
}

function makeParents(store: GameStore, race = 'human') {
  const rng = createRng('family-parents');
  const mother = createCharacter({
    firstName: 'Mother',
    familyName: 'Test',
    sex: 'female',
    race,
    rng,
  });
  const father = createCharacter({
    firstName: 'Father',
    familyName: 'Test',
    sex: 'male',
    race,
    rng,
  });
  store.addCharacter(mother);
  store.addCharacter(father);
  return { mother, father };
}

/* ------------------------------------------------------------------ */
/* Species rules                                                       */
/* ------------------------------------------------------------------ */

describe('offspring species', () => {
  it('produces a child of the same species for same-species parents', () => {
    const store = makeStore();
    const { mother, father } = makeParents(store, 'human');

    const child = birthChild(store, mother, father);

    expect(child.race).toBe('human');
    expect(child.race.startsWith('hybrid_')).toBe(false);
    expect(store.state.characters[child.id]).toBeDefined();
    expect(store.state.characterOrder).toContain(child.id);
  });

  it('produces a hybrid for compatible cross-species parents', () => {
    const store = makeStore();
    const rng = createRng('hybrid-parents');
    const mother = createCharacter({
      firstName: 'Elfie',
      familyName: 'Test',
      sex: 'female',
      race: 'elf',
      rng,
    });
    const father = createCharacter({
      firstName: 'Human',
      familyName: 'Test',
      sex: 'male',
      race: 'human',
      rng,
    });
    store.addCharacter(mother);
    store.addCharacter(father);

    expect(canReproduce('elf', 'human')).toBe(true);

    const child = birthChild(store, mother, father);

    expect(child.race).toBe(ensureHybridSpecies('elf', 'human'));
    expect(child.race.startsWith('hybrid_')).toBe(true);
    expect(SPECIES[child.race]).toBeDefined();
  });

  it('produces no child for incompatible parents', () => {
    const store = makeStore();
    const rng = createRng('incompatible-parents');
    const mother = createCharacter({
      firstName: 'Angel',
      familyName: 'Test',
      sex: 'female',
      race: 'angel',
      rng,
    });
    const father = createCharacter({
      firstName: 'Demon',
      familyName: 'Test',
      sex: 'male',
      race: 'demon',
      rng,
    });
    store.addCharacter(mother);
    store.addCharacter(father);

    expect(canReproduce('angel', 'demon')).toBe(false);

    const before = store.state.characterOrder.length;
    expect(() => birthChild(store, mother, father)).toThrow();
    expect(store.state.characterOrder.length).toBe(before);
    expect(Object.keys(store.state.characters)).toHaveLength(before);
  });

  it('never forces a sex label on a species without one', () => {
    const rng = createRng('sexless');
    const spirit = createCharacter({
      firstName: 'Spirit',
      familyName: 'Test',
      sex: 'female',
      race: 'spirit',
      rng,
    });
    expect(spirit.sex).toBe('none');

    const human = createCharacter({
      firstName: 'Human',
      familyName: 'Test',
      sex: 'male',
      race: 'human',
      rng,
    });
    expect(human.sex).toBe('male');
  });
});

/* ------------------------------------------------------------------ */
/* Kinship                                                             */
/* ------------------------------------------------------------------ */

describe('family tree', () => {
  it('records partners, parents, children and siblings', () => {
    const store = makeStore();
    const { mother, father } = makeParents(store, 'human');

    expect(marry(store, father, mother)).toBe(true);
    expect(father.partnerId).toBe(mother.id);
    expect(mother.partnerId).toBe(father.id);

    const first = birthChild(store, mother, father);
    const second = birthChild(store, mother, father);

    const tree = buildFamilyTree(store.state);
    const fatherNode = tree.find((node) => node.id === father.id)!;
    const motherNode = tree.find((node) => node.id === mother.id)!;
    const firstNode = tree.find((node) => node.id === first.id)!;
    const secondNode = tree.find((node) => node.id === second.id)!;

    expect(fatherNode.partnerIds).toContain(mother.id);
    expect(motherNode.partnerIds).toContain(father.id);
    expect(fatherNode.childIds).toContain(first.id);
    expect(motherNode.childIds).toContain(second.id);
    expect(firstNode.fatherId).toBe(father.id);
    expect(firstNode.motherId).toBe(mother.id);
    expect(firstNode.siblingIds).toContain(second.id);
    expect(secondNode.siblingIds).toContain(first.id);
    expect(firstNode.generation).toBe(1);
    expect(fatherNode.generation).toBe(0);
    expect(fatherNode.alive).toBe(true);
  });

  it('numbers the generations of grandchildren', () => {
    const store = makeStore();
    const { mother, father } = makeParents(store, 'human');
    marry(store, father, mother);

    let sonId: string | undefined;
    let daughterId: string | undefined;
    for (let i = 0; i < 12 && (!sonId || !daughterId); i++) {
      const child = birthChild(store, mother, father);
      if (child.sex === 'male' && !sonId) sonId = child.id;
      if (child.sex === 'female' && !daughterId) daughterId = child.id;
    }
    expect(sonId).toBeDefined();
    expect(daughterId).toBeDefined();

    const son = store.getCharacter(sonId!)!;
    const daughter = store.getCharacter(daughterId!)!;
    const grandchild = birthChild(store, daughter, son);

    const tree = buildFamilyTree(store.state);
    const grandchildNode = tree.find((node) => node.id === grandchild.id)!;
    const sonNode = tree.find((node) => node.id === son.id)!;

    expect(grandchildNode.generation).toBe(2);
    expect(sonNode.generation).toBe(1);
  });

  it('finds the heir of the dynasty', () => {
    const store = makeStore();
    expect(findHeir(store.state)).toBeUndefined();

    const { mother, father } = makeParents(store, 'human');
    marry(store, father, mother);
    const child = birthChild(store, mother, father);

    expect(findHeir(store.state)?.id).toBe(child.id);
  });

  it('sets relationships and keeps the affinity in range', () => {
    const store = makeStore();
    const { mother, father } = makeParents(store, 'human');

    setRelationship(mother, father.id, 150, 'friend');
    setRelationship(mother, father.id, -80, 'rival');

    expect(mother.relationships).toHaveLength(1);
    expect(mother.relationships[0]!.affinity).toBe(-80);
    expect(mother.relationships[0]!.kind).toBe('rival');
  });
});

/* ------------------------------------------------------------------ */
/* Death                                                               */
/* ------------------------------------------------------------------ */

describe('death', () => {
  it('records permadeath and keeps the character in the world', () => {
    const store = makeStore();
    const rng = createRng('death-test');
    const victim = createCharacter({
      firstName: 'Doomed',
      familyName: 'Test',
      sex: 'male',
      race: 'human',
      rng,
    });
    store.addCharacter(victim);

    const deaths: { id: string; cause: string }[] = [];
    store.on('character:died', (payload) => deaths.push({ id: payload.id, cause: payload.cause }));

    killCharacter(store, victim, 'dragon fire', true);

    expect(victim.alive).toBe(false);
    expect(victim.causeOfDeath).toBe('dragon fire');
    expect(typeof victim.dayOfDeath).toBe('number');
    expect(victim.permadead).toBe(true);
    expect(store.state.permadeadIds).toContain(victim.id);
    expect(store.state.characters[victim.id]).toBeDefined();
    expect(store.state.characterOrder).toContain(victim.id);
    expect(victim.history.some((event) => event.kind === 'death')).toBe(true);
    expect(deaths).toHaveLength(1);
    expect(deaths[0]!.cause).toBe('dragon fire');

    // The dead stay in the family tree, marked as deceased.
    const tree = buildFamilyTree(store.state);
    const victimNode = tree.find((node) => node.id === victim.id);
    expect(victimNode).toBeDefined();
    expect(victimNode!.alive).toBe(false);
    expect(victimNode!.id).toBe(victim.id);
  });

  it('does not flag a natural death as permadeath', () => {
    const store = makeStore();
    const rng = createRng('natural-death');
    const victim = createCharacter({
      firstName: 'Elder',
      familyName: 'Test',
      sex: 'female',
      race: 'human',
      rng,
    });
    store.addCharacter(victim);

    killCharacter(store, victim, 'old age', false);

    expect(victim.alive).toBe(false);
    expect(victim.permadead).toBeUndefined();
    expect(store.state.permadeadIds).not.toContain(victim.id);
  });
});

/* ------------------------------------------------------------------ */
/* Pregnancy & progression                                              */
/* ------------------------------------------------------------------ */

describe('pregnancy', () => {
  it('delivers a child when the pregnancy runs out', () => {
    const store = makeStore();
    const { mother, father } = makeParents(store, 'human');
    marry(store, father, mother);

    mother.pregnant = { partnerId: father.id, dueDay: 1, daysLeft: 1 };
    const before = store.state.characterOrder.length;

    tickPregnancy(store, mother);

    expect(store.state.characterOrder.length).toBe(before + 1);
    expect(mother.pregnant).toBeUndefined();
  });
});

describe('progression', () => {
  it('raises the level and emits character:leveled', () => {
    const store = makeStore();
    const rng = createRng('xp-test');
    const hero = createCharacter({
      firstName: 'Hero',
      familyName: 'Test',
      sex: 'male',
      race: 'human',
      rng,
    });
    store.addCharacter(hero);

    const levels: number[] = [];
    store.on('character:leveled', (payload) => levels.push(payload.level));

    const gained = grantXp(store, hero, 500);

    expect(gained).toBeGreaterThan(0);
    expect(hero.level).toBe(1 + gained);
    expect(hero.xp).toBeLessThan(hero.xpToNext);
    expect(levels).toHaveLength(gained);
    expect(levels[levels.length - 1]).toBe(hero.level);
  });

  it('ignores experience for the dead', () => {
    const store = makeStore();
    const rng = createRng('xp-dead');
    const ghost = createCharacter({
      firstName: 'Ghost',
      familyName: 'Test',
      sex: 'male',
      race: 'human',
      rng,
    });
    store.addCharacter(ghost);
    killCharacter(store, ghost, 'the plague', false);

    expect(grantXp(store, ghost, 1000)).toBe(0);
    expect(ghost.level).toBe(1);
  });
});
