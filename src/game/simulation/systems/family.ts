/**
 * Family — the heart of the dynasty.
 *
 * Handles character creation, marriage, pregnancy, birth, death and the
 * kinship graph that the family-tree screen renders.
 *
 * Species rules honoured here:
 *  - Two parents of the SAME species always produce a child of that species.
 *  - Cross-species parents produce a hybrid only when `canReproduce()` allows
 *    it, and the child species id is the one `childSpecies()` /
 *    `ensureHybridSpecies()` produces.
 *  - Species without a sex distinction (angels, spirits, undead) use the
 *    biological sex 'none'; no label is ever forced onto them.
 */

import type {
  Character,
  GameState,
  Genotype,
  Id,
  LifeEvent,
  NewGameConfig,
  PersonalityTrait,
  RaceId,
  Relationship,
  Sex,
  SkillId,
} from '../types';
import type { Rng } from '../rng';
import type { GameStore } from '../store';
import { newId } from '../ids';
import { canReproduce, ensureHybridSpecies, SPECIES } from '../../content/species';
import { TRAITS } from '../../content/traits';
import { randomNamesForRace } from '../../content/names';
import {
  applyTraitEffects,
  childGenotype,
  expressTraits,
  normalizeGenotype,
  randomGenotype,
} from './genetics';
import { applyDeath, baseStatsForLevel, xpForNextLevel } from './progression';
import { t } from '../../../i18n/registry';

/** Gestation length in in-game days. */
export const GESTATION_DAYS = 180;

/** Characters the store can marry. */
const PERSONALITY_POOL: PersonalityTrait[] = [
  'brave', 'timid', 'aggressive', 'kind', 'greedy', 'loyal',
  'ambitious', 'lazy', 'cunning', 'devout',
];

/* ------------------------------------------------------------------ */
/* Character creation                                                   */
/* ------------------------------------------------------------------ */

export interface CreateCharacterOptions {
  firstName: string;
  familyName: string;
  sex: Sex;
  race: RaceId;
  age?: number;
  level?: number;
  household?: 'family' | 'resident';
  isFounder?: boolean;
  genotype?: Genotype;
  rng: Rng;
  bornDay?: number;
}

/**
 * Creates a character with a complete, valid record: genotype, expressed
 * phenotype, level-scaled stats and trait-modified combat stats.
 */
export function createCharacter(opts: CreateCharacterOptions): Character {
  const { rng } = opts;
  const race = opts.race;
  const level = Math.max(1, Math.floor(opts.level ?? 1));
  const species = SPECIES[race];

  // Species without a sex distinction never receive a male/female label.
  let sex: Sex = opts.sex;
  if (species && species.sexSystem === 'none') {
    sex = 'none';
  } else if (sex === 'none') {
    sex = rng.chance(0.5) ? 'male' : 'female';
  }

  const genotype = normalizeGenotype(opts.genotype ?? randomGenotype(rng, race));
  const phenotype = expressTraits(genotype);
  const baseStats = baseStatsForLevel(race, level);
  const stats = applyTraitEffects(baseStats, phenotype);

  const skills: SkillId[] = [];
  for (const traitId of phenotype) {
    const def = TRAITS[traitId];
    if (!def) continue;
    for (const effect of def.effects) {
      if (effect.ability && !skills.includes(effect.ability)) skills.push(effect.ability);
    }
  }

  const character: Character = {
    id: newId('chr'),
    firstName: opts.firstName,
    familyName: opts.familyName,
    sex,
    race,
    age: Math.max(0, opts.age ?? 0),
    level,
    xp: 0,
    xpToNext: xpForNextLevel(level),
    health: stats.hp,
    baseStats,
    stats,
    genotype,
    phenotype,
    skills,
    equipment: {},
    personality: rng.sample(PERSONALITY_POOL, 2),
    relationships: [],
    family: { partnerIds: [], childIds: [], siblingIds: [] },
    status: { condition: 'healthy', hunger: 100, morale: 70, effects: [] },
    history: [],
    alive: true,
    bornDay: Math.max(0, opts.bornDay ?? 0),
    startAge: Math.max(0, opts.age ?? 0),
    isFounder: opts.isFounder ?? false,
    household: opts.household ?? 'family',
    job: 'idle',
    x: rng.range(0, 100),
    y: rng.range(0, 100),
    zone: 'settlement',
    portraitSeed: rng.int(0, 999999),
  };

  return character;
}

/** Creates the founder of a new dynasty from the new-game configuration. */
export function createFounder(config: NewGameConfig, rng: Rng): Character {
  const sex: Sex = rng.chance(0.5) ? 'male' : 'female';
  const firstName = config.founderName?.trim() || t('family.founder.default', 'المؤسس', 'Founder');
  const familyName = config.familyName?.trim() || config.dynastyName?.trim() || '—';

  return createCharacter({
    firstName,
    familyName,
    sex,
    race: 'human',
    age: 25,
    level: 1,
    household: 'family',
    isFounder: true,
    rng,
    bornDay: 0,
  });
}

/* ------------------------------------------------------------------ */
/* Marriage                                                            */
/* ------------------------------------------------------------------ */

export interface MarryCheck {
  ok: boolean;
  /** Arabic reason (the primary player-facing language). */
  reason?: string;
  /** English reason for the mirrored UI. */
  reasonEn?: string;
}

/** Checks whether two characters may become partners. */
export function canMarry(a: Character, b: Character): MarryCheck {
  if (a.id === b.id) {
    return {
      ok: false,
      reason: t('family.marry.self', 'لا يمكن زواج النفس.', 'A character cannot marry themselves.'),
      reasonEn: 'A character cannot marry themselves.',
    };
  }
  if (!a.alive || !b.alive) {
    return {
      ok: false,
      reason: t('family.marry.dead', 'لا يُزوّج ميت.', 'The dead cannot be married.'),
      reasonEn: 'The dead cannot be married.',
    };
  }
  if (a.partnerId || b.partnerId) {
    return {
      ok: false,
      reason: t(
        'family.marry.bound',
        'أحدهما مرتبطٌ بالفعل.',
        'One of them is already bound to a partner.',
      ),
      reasonEn: 'One of them is already bound to a partner.',
    };
  }
  if (!canReproduce(a.race, b.race)) {
    return {
      ok: false,
      reason: t(
        'family.marry.incompatible',
        'دمٌ لا يختلط: هذان النوعان لا يُنتجان ذرية.',
        'Incompatible blood: these two species cannot produce offspring.',
      ),
      reasonEn: 'Incompatible blood: these two species cannot produce offspring.',
    };
  }
  return { ok: true };
}

/** Marries two characters. Returns false when the pair is not compatible. */
export function marry(store: GameStore, a: Character, b: Character): boolean {
  const check = canMarry(a, b);
  if (!check.ok) return false;

  a.partnerId = b.id;
  b.partnerId = a.id;
  if (!a.family.partnerIds.includes(b.id)) a.family.partnerIds.push(b.id);
  if (!b.family.partnerIds.includes(a.id)) b.family.partnerIds.push(a.id);

  setRelationship(a, b.id, 80, 'partner');
  setRelationship(b, a.id, 80, 'partner');

  const text = t(
    'family.marry.event',
    `تزوّج ${a.firstName} ${a.familyName} من ${b.firstName} ${b.familyName}.`,
    `${a.firstName} ${a.familyName} married ${b.firstName} ${b.familyName}.`,
  );
  addLifeEvent(a, { text, kind: 'marriage' }, store);
  addLifeEvent(b, { text, kind: 'marriage' }, store);

  store.notify(text, 'info');
  store.chronicle(text);
  store.touch('character:married');
  return true;
}

/* ------------------------------------------------------------------ */
/* Pregnancy & birth                                                    */
/* ------------------------------------------------------------------ */

/** Attempts to conceive. Returns true when the mother is expecting. */
export function startPregnancy(store: GameStore, mother: Character, father: Character): boolean {
  if (!mother.alive || !father.alive) return false;
  if (mother.sex !== 'female' || father.sex !== 'male') return false;
  if (!canReproduce(mother.race, father.race)) return false;
  if (mother.pregnant) return false;

  const species = SPECIES[mother.race];
  const fertility = (species?.fertility ?? 0.5) * 0.35;
  if (!store.rng.chance(fertility)) return false;

  const day = store.state.calendar.totalDays;
  mother.pregnant = { partnerId: father.id, dueDay: day + GESTATION_DAYS, daysLeft: GESTATION_DAYS };
  return true;
}

/** Advances a pregnancy by one day and delivers the child when it is due. */
export function tickPregnancy(store: GameStore, mother: Character): void {
  const pregnancy = mother.pregnant;
  if (!pregnancy) return;
  if (!mother.alive) {
    mother.pregnant = undefined;
    return;
  }

  pregnancy.daysLeft -= 1;
  if (pregnancy.daysLeft > 0) return;

  mother.pregnant = undefined;
  const father = store.getCharacter(pregnancy.partnerId);
  if (father && father.alive) {
    birthChild(store, mother, father);
    return;
  }

  const text = t(
    'family.pregnancy.lost',
    `فقدت ${mother.firstName} جنينها قبل أوانه.`,
    `${mother.firstName} lost her unborn child before its time.`,
  );
  addLifeEvent(mother, { text, kind: 'illness' }, store);
  store.notify(text, 'warn');
  store.touch('pregnancy:lost');
}

/**
 * Delivers a child.
 *
 * Same-species parents always produce a child of that species. Cross-species
 * parents produce a hybrid only when the species are compatible; otherwise
 * this throws and no child is added to the world.
 */
export function birthChild(store: GameStore, mother: Character, father: Character): Character {
  if (!canReproduce(mother.race, father.race)) {
    throw new Error(
      t(
        'family.birth.incompatible',
        'دمٌ لا يختلط: لا يمكن لهذين الزوجين إنجاب طفل.',
        'Incompatible blood: this pair cannot produce a child.',
      ),
    );
  }

  const childRace =
    mother.race === father.race
      ? mother.race
      : (ensureHybridSpecies(mother.race, father.race) ?? mother.race);

  const species = SPECIES[childRace];
  const sex: Sex = species && species.sexSystem === 'none' ? 'none' : store.rng.chance(0.5) ? 'male' : 'female';

  const names = randomNamesForRace(store.rng, childRace, sex);
  const familyName = mother.familyName || father.familyName || names.family;

  const child = createCharacter({
    firstName: names.first,
    familyName,
    sex,
    race: childRace,
    age: 0,
    level: 1,
    household: 'family',
    genotype: childGenotype(store.rng, father, mother),
    rng: store.rng,
    bornDay: store.state.calendar.totalDays,
  });

  child.family.fatherId = father.id;
  child.family.motherId = mother.id;

  // Siblings: the mother's other children, linked both ways.
  const siblings = mother.family.childIds.filter((id) => id !== child.id);
  child.family.siblingIds = [...siblings];
  for (const siblingId of siblings) {
    const sibling = store.getCharacter(siblingId);
    if (sibling && !sibling.family.siblingIds.includes(child.id)) sibling.family.siblingIds.push(child.id);
  }

  if (!father.family.childIds.includes(child.id)) father.family.childIds.push(child.id);
  if (!mother.family.childIds.includes(child.id)) mother.family.childIds.push(child.id);

  store.addCharacter(child);

  const text = t(
    'family.birth.event',
    `وُلد ${child.firstName} ${child.familyName} من ${father.firstName} و${mother.firstName}.`,
    `${child.firstName} ${child.familyName} was born to ${father.firstName} and ${mother.firstName}.`,
  );
  addLifeEvent(child, { text, kind: 'birth' }, store);
  addLifeEvent(mother, { text, kind: 'birth' }, store);
  addLifeEvent(father, { text, kind: 'birth' }, store);

  store.emit('character:born', { id: child.id, motherId: mother.id, fatherId: father.id });
  store.notify(text, 'info');
  store.chronicle(text);
  store.touch('character:born');

  return child;
}

/* ------------------------------------------------------------------ */
/* Death                                                               */
/* ------------------------------------------------------------------ */

/**
 * Kills a character. The character stays in `state.characters` so the family
 * tree keeps showing the dead. When `permanent` is true the death is
 * irreversible and the id is recorded in `state.permadeadIds`.
 */
export function killCharacter(store: GameStore, c: Character, cause: string, permanent: boolean): void {
  if (!applyDeath(store, c, cause, permanent)) return;

  store.notify(
    t(
      'family.death.notify',
      `تُوفّي ${c.firstName} ${c.familyName} — ${cause}.`,
      `${c.firstName} ${c.familyName} died — ${cause}.`,
    ),
    'danger',
  );
  store.chronicle(
    t(
      'family.death.chronicle',
      `مات ${c.firstName} ${c.familyName} (${cause}) في السنة ${store.state.calendar.year}.`,
      `${c.firstName} ${c.familyName} died (${cause}) in year ${store.state.calendar.year}.`,
    ),
  );
  store.touch('character:died');
}

/* ------------------------------------------------------------------ */
/* Relationships & life events                                          */
/* ------------------------------------------------------------------ */

/** Sets (or updates) the affinity a character holds towards another. */
export function setRelationship(
  c: Character,
  targetId: Id,
  affinity: number,
  kind: Relationship['kind'],
): void {
  const value = Math.max(-100, Math.min(100, Math.round(affinity)));
  const existing = c.relationships.find((r) => r.targetId === targetId);
  if (existing) {
    existing.affinity = value;
    existing.kind = kind;
    return;
  }
  c.relationships.push({ targetId, affinity: value, kind });
}

/**
 * Appends a life event to a character's history. When a store is supplied the
 * event is dated with the world clock; otherwise the last known day is used.
 */
export function addLifeEvent(
  c: Character,
  ev: Omit<LifeEvent, 'day' | 'year'>,
  store?: GameStore,
): void {
  const day = store ? store.state.calendar.totalDays : lastKnownDay(c);
  const year = store ? store.state.calendar.year : Math.floor(day / 360) + 1;
  c.history.push({ day, year, text: ev.text, kind: ev.kind });
}

function lastKnownDay(c: Character): number {
  let day = c.bornDay;
  for (const event of c.history) {
    if (event.day > day) day = event.day;
  }
  return day;
}

/* ------------------------------------------------------------------ */
/* Family tree                                                          */
/* ------------------------------------------------------------------ */

export interface FamilyTreeNode {
  id: Id;
  name: string;
  sex: Sex;
  race: RaceId;
  age: number;
  alive: boolean;
  fatherId?: Id;
  motherId?: Id;
  partnerIds: Id[];
  childIds: Id[];
  siblingIds: Id[];
  generation: number;
}

/**
 * Builds the kinship graph of the dynasty. Generations are derived from the
 * parent links (founders are generation 0, their children 1, and so on).
 */
export function buildFamilyTree(state: GameState): FamilyTreeNode[] {
  const nodes = new Map<Id, FamilyTreeNode>();

  for (const id of state.characterOrder) {
    const c = state.characters[id];
    if (!c) continue;
    nodes.set(id, {
      id: c.id,
      name: `${c.firstName} ${c.familyName}`.trim(),
      sex: c.sex,
      race: c.race,
      age: Math.floor(c.age),
      alive: c.alive,
      fatherId: c.family.fatherId,
      motherId: c.family.motherId,
      partnerIds: [...c.family.partnerIds],
      childIds: [...c.family.childIds],
      siblingIds: [...c.family.siblingIds],
      generation: 0,
    });
  }

  // Sibling links live on the character records; the tree mirrors them and
  // keeps them reciprocal, so the two children of a pair always list each
  // other even when only one side was recorded.
  const siblingSets = new Map<Id, Set<Id>>();
  for (const node of nodes.values()) {
    siblingSets.set(node.id, new Set<Id>());
  }
  for (const node of nodes.values()) {
    const own = siblingSets.get(node.id)!;
    for (const siblingId of node.siblingIds) {
      if (siblingId === node.id || !nodes.has(siblingId)) continue;
      own.add(siblingId);
      siblingSets.get(siblingId)!.add(node.id);
    }
  }

  // Children of the same parents are siblings even when the record was never
  // updated (older saves, hand-made characters).
  const byParent = new Map<Id, Id[]>();
  for (const node of nodes.values()) {
    for (const parentId of [node.fatherId, node.motherId]) {
      if (!parentId) continue;
      const list = byParent.get(parentId) ?? [];
      list.push(node.id);
      byParent.set(parentId, list);
    }
  }
  for (const siblings of byParent.values()) {
    for (const a of siblings) {
      for (const b of siblings) {
        if (a === b) continue;
        siblingSets.get(a)!.add(b);
      }
    }
  }

  for (const node of nodes.values()) {
    node.siblingIds = Array.from(siblingSets.get(node.id) ?? []);
  }

  const cache = new Map<Id, number>();
  const resolving = new Set<Id>();

  const generationOf = (id: Id): number => {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const node = nodes.get(id);
    if (!node) return 0;
    if (resolving.has(id)) return 0;
    resolving.add(id);
    let generation = 0;
    for (const parentId of [node.fatherId, node.motherId]) {
      if (!parentId || !nodes.has(parentId)) continue;
      generation = Math.max(generation, generationOf(parentId) + 1);
    }
    resolving.delete(id);
    cache.set(id, generation);
    return generation;
  };

  for (const node of nodes.values()) node.generation = generationOf(node.id);

  return Array.from(nodes.values());
}

/**
 * Finds the heir of the dynasty: the closest living blood descendant, and
 * within a generation the eldest of them.
 */
export function findHeir(state: GameState): Character | undefined {
  const nodes = buildFamilyTree(state);
  const generations = new Map<Id, number>();
  for (const node of nodes) generations.set(node.id, node.generation);

  const candidates = nodes
    .filter((n) => n.alive)
    .map((n) => state.characters[n.id])
    .filter((c): c is Character => !!c && c.household === 'family');

  if (!candidates.length) return undefined;

  candidates.sort((a, b) => {
    const ga = generations.get(a.id) ?? 0;
    const gb = generations.get(b.id) ?? 0;
    if (ga !== gb) return gb - ga;
    if (a.bornDay !== b.bornDay) return a.bornDay - b.bornDay;
    return b.level - a.level;
  });

  return candidates[0];
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */
