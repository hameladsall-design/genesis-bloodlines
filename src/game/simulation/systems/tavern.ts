/**
 * The tavern: hiring strangers, pricing them and pairing them for marriage.
 *
 * Design rules enforced here:
 *  - A plain level-1 human with no special traits costs exactly
 *    `BASE_RECRUIT_PRICE` (10 coins) at a price multiplier of 1.
 *  - Rarer species, higher levels, stronger bodies, rarer bloodlines, special
 *    traits and higher recruitment tiers all push the price UP.
 *  - Hiring is atomic: coins are checked against capacity and purse BEFORE
 *    anything is deducted, and a candidate can never be bought twice.
 *  - The roster rotates with the calendar and never contains the same
 *    character twice.
 *  - The tavern sells PEOPLE for coins. It never mints food or currency.
 */

import { newId } from '../ids';
import type { GameStore } from '../store';
import { RECRUITABLE_SPECIES, SPECIES } from '../../content/species';
import type {
  Character,
  CombatStats,
  FactionId,
  Id,
  JobId,
  PersonalityTrait,
  RaceId,
  Relationship,
  Sex,
  SkillId,
  TavernCandidate,
  TraitId,
} from '../types';

/** Price of a plain, level-1, trait-less human at a multiplier of 1. */
export const BASE_RECRUIT_PRICE = 10;
/** Days between two tavern roster rotations (matches the engine tick). */
export const TAVERN_ROTATION_DAYS = 5;
/** Slots granted before the base level is taken into account. */
export const TAVERN_SLOTS_BASE = 2;
/** Hard cap on the number of offers so the UI stays readable. */
export const TAVERN_SLOTS_MAX = 12;

/* ------------------------------------------------------------------ */
/* Local helpers (kept here so this module never depends on files      */
/* that other teams may still be writing).                             */
/* ------------------------------------------------------------------ */

/** A character plus the extra presentation fields the UI likes to read. */
export interface CharacterExtended extends Character {
  firstNameEn?: string;
  familyNameEn?: string;
  backgroundAr?: string;
  backgroundEn?: string;
  /** The faction this character belongs to, when known. */
  factionId?: FactionId;
}

interface NameEntry {
  ar: string;
  en: string;
}

const GIVEN_NAMES: NameEntry[] = [
  { ar: 'حسن', en: 'Hasan' },
  { ar: 'علي', en: 'Ali' },
  { ar: 'مروان', en: 'Marwan' },
  { ar: 'زيد', en: 'Zaid' },
  { ar: 'نادر', en: 'Nader' },
  { ar: 'سالم', en: 'Salem' },
  { ar: 'رامي', en: 'Rami' },
  { ar: 'فارس', en: 'Fares' },
  { ar: 'آدم', en: 'Adam' },
  { ar: 'كريم', en: 'Karim' },
  { ar: 'بلال', en: 'Bilal' },
  { ar: 'عمر', en: 'Umar' },
  { ar: 'طارق', en: 'Tariq' },
  { ar: 'ياسر', en: 'Yasser' },
  { ar: 'سيف', en: 'Saif' },
  { ar: 'مهند', en: 'Mohand' },
  { ar: 'رائد', en: 'Raed' },
  { ar: 'سامي', en: 'Sami' },
  { ar: 'مؤيد', en: 'Moayad' },
  { ar: 'جاد', en: 'Jad' },
  { ar: 'أنس', en: 'Anas' },
  { ar: 'ليث', en: 'Laith' },
  { ar: 'عمار', en: 'Ammar' },
  { ar: 'خالد', en: 'Khalid' },
];

const FAMILY_NAMES: NameEntry[] = [
  { ar: 'الصقلي', en: 'al-Siqilli' },
  { ar: 'الرعوي', en: 'al-Raawi' },
  { ar: 'الحارثي', en: 'al-Harthi' },
  { ar: 'القزويني', en: 'al-Qazwini' },
  { ar: 'الغامدي', en: 'al-Ghamdi' },
  { ar: 'العمري', en: 'al-Amri' },
  { ar: 'السديس', en: 'al-Sudeis' },
  { ar: 'المارد', en: 'al-Mard' },
  { ar: 'العنزي', en: 'al-Anzi' },
  { ar: 'الشامي', en: 'al-Shami' },
  { ar: 'الزهري', en: 'al-Zuhri' },
  { ar: 'الطائي', en: 'al-Tai' },
  { ar: 'النفيعي', en: 'al-Nafei' },
  { ar: 'الريس', en: 'al-Rays' },
  { ar: 'الخطيب', en: 'al-Khatib' },
  { ar: 'الديب', en: 'ad-Deeb' },
  { ar: 'البكر', en: 'al-Bakr' },
  { ar: 'السنوسي', en: 'al-Sinoussi' },
];

const BACKGROUNDS: NameEntry[] = [
  { ar: 'تاجر مسافر', en: 'Wandering Trader' },
  { ar: 'حرفي مهاجر', en: 'Wandering Artisan' },
  { ar: 'مقاتل مرتزق', en: 'Mercenary Fighter' },
  { ar: 'باحث عن كنز', en: 'Treasure Seeker' },
  { ar: 'هارب من الديون', en: 'Debt Fugitive' },
  { ar: 'ممرض ميداني', en: 'Field Healer' },
  { ar: 'صائد جبال', en: 'Mountain Hunter' },
  { ar: 'فارس تائه', en: 'Lost Knight' },
  { ar: 'عامل مناجم', en: 'Mine Worker' },
  { ar: 'راهق شارد', en: 'Wandering Youth' },
  { ar: 'ناجر الحظ', en: 'Fortune Hunter' },
  { ar: 'سابق خدمة', en: 'Veteran' },
];

const PERSONALITY_POOL: PersonalityTrait[] = [
  'brave',
  'timid',
  'aggressive',
  'kind',
  'greedy',
  'loyal',
  'ambitious',
  'lazy',
  'cunning',
  'devout',
];

const SKILL_POOL: SkillId[] = [
  'sword',
  'axe',
  'bow',
  'dagger',
  'hunt',
  'farm',
  'smith',
  'heal',
  'trade',
  'lore',
  'survival',
  'build',
];

/** Bloodline rarity of every trait the tavern may roll (1 = common). */
const TRAIT_RARITY: Record<string, number> = {
  'trait.toughness': 1,
  'trait.versatile': 2,
  'trait.warbrand': 3,
  'trait.longevity': 3,
  'trait.graceful': 2,
  'trait.silverblood': 3,
  'trait.starsight': 4,
  'trait.nightborn': 3,
  'trait.sharpness': 2,
  'trait.stoneheart': 2,
  'trait.ironbound': 2,
  'trait.frostbound': 3,
  'trait.wildblood': 3,
  'trait.rageborn': 2,
  'trait.serpentkin': 4,
  'trait.mutation': 4,
  'trait.bloodthirst': 4,
  'trait.emberveil': 3,
  'trait.feral': 3,
  'trait.moonborn': 3,
  'trait.hellborn': 4,
  'trait.cursed': 3,
  'trait.voidtouched': 5,
  'trait.holyblood': 5,
  'trait.blessed': 4,
  'trait.dawnkeeper': 4,
  'trait.spiritborn': 4,
  'trait.undead': 4,
  'trait.graveborn': 3,
  'trait.dragonblood': 5,
};

/** Traits that make a bloodline worth a premium on top of plain rarity. */
const SPECIAL_TRAIT_BONUS: Record<string, number> = {
  'trait.hellborn': 0.6,
  'trait.holyblood': 0.6,
  'trait.dragonblood': 0.5,
  'trait.bloodthirst': 0.4,
  'trait.mutation': 0.35,
  'trait.undead': 0.3,
  'trait.spiritborn': 0.3,
  'trait.nightborn': 0.15,
  'trait.feral': 0.15,
  'trait.stoneheart': 0.1,
  'trait.longevity': 0.1,
};

/** Pairs that may never produce offspring, defined locally on purpose. */
const LOCAL_INCOMPATIBLE: Array<[RaceId, RaceId]> = [
  ['demon', 'angel'],
  ['angel', 'demon'],
];

/** Age at which a bloodline may become a parent. */
export function maturityAgeFor(race: RaceId): number {
  return SPECIES[race]?.maturityAge ?? 18;
}

/** Local species compatibility rule used by the marriage system. */
export function speciesCompatible(a: RaceId, b: RaceId): boolean {
  if (a === b) return true;
  for (const [x, y] of LOCAL_INCOMPATIBLE) {
    if ((x === a && y === b) || (x === b && y === a)) return false;
  }
  const sa = SPECIES[a];
  const sb = SPECIES[b];
  if (!sa || !sb) return true;
  if (sa.incompatibleWith.includes(b) || sb.incompatibleWith.includes(a)) return false;
  if (sa.compatibleWith !== 'all' && !sa.compatibleWith.includes(b)) return false;
  if (sb.compatibleWith !== 'all' && !sb.compatibleWith.includes(a)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Character factory                                                  */
/* ------------------------------------------------------------------ */

export interface CreateCharacterOptions {
  id?: Id;
  firstName: string;
  firstNameEn?: string;
  familyName: string;
  familyNameEn?: string;
  sex: Sex;
  race: RaceId;
  age: number;
  level: number;
  zone?: string;
  x?: number;
  y?: number;
  household?: 'family' | 'resident';
  isFounder?: boolean;
  job?: JobId;
  personality?: PersonalityTrait[];
  skills?: SkillId[];
  phenotype?: TraitId[];
  relationships?: Relationship[];
  bornDay?: number;
  portraitSeed?: number;
  factionId?: FactionId;
  backgroundAr?: string;
  backgroundEn?: string;
}

/** Combat stats of a species at a given level. */
export function combatStatsFor(race: RaceId, level: number): CombatStats {
  const species = SPECIES[race];
  const stats: CombatStats = {
    hp: 100,
    damage: 12,
    defense: 6,
    stamina: 60,
    speed: 10,
    accuracy: 0.85,
    evasion: 0.08,
    critChance: 0.05,
    magicResist: 0.1,
    attackRange: 1,
    attackSpeed: 1,
  };
  if (species) {
    for (const [key, mult] of Object.entries(species.statMultiplier)) {
      const k = key as keyof CombatStats;
      stats[k] = stats[k] * (mult ?? 1);
    }
  }
  const steps = Math.max(0, Math.floor(level) - 1);
  stats.hp += steps * 10;
  stats.damage += steps * 2;
  stats.defense += steps * 1;
  stats.stamina += steps * 4;
  return stats;
}

/** Builds a complete Character object literal from the shared contract. */
export function createCharacter(options: CreateCharacterOptions): CharacterExtended {
  const level = Math.max(1, Math.floor(options.level));
  const stats = combatStatsFor(options.race, level);
  const phenotype = options.phenotype ?? [];
  const genotype: Record<string, [TraitId | 'normal', TraitId | 'normal']> = {};
  phenotype.forEach((trait, index) => {
    genotype[`locus_${index}`] = [trait, 'normal'];
  });
  const character: CharacterExtended = {
    id: options.id ?? newId('chr'),
    firstName: options.firstName,
    familyName: options.familyName,
    sex: options.sex,
    race: options.race,
    age: options.age,
    level,
    xp: 0,
    xpToNext: 100 * level,
    health: stats.hp,
    baseStats: stats,
    stats,
    genotype,
    phenotype,
    skills: options.skills ?? [],
    equipment: {},
    personality: options.personality ?? [],
    relationships: options.relationships ?? [],
    family: { partnerIds: [], childIds: [], siblingIds: [] },
    status: { condition: 'healthy', hunger: 85, morale: 70, effects: [] },
    history: [],
    alive: true,
    bornDay: options.bornDay ?? 0,
    startAge: options.age,
    isFounder: options.isFounder ?? false,
    household: options.household ?? 'resident',
    job: options.job ?? 'idle',
    x: options.x ?? 0,
    y: options.y ?? 0,
    zone: options.zone ?? 'settlement',
    portraitSeed: options.portraitSeed ?? 1,
  };
  if (options.firstNameEn !== undefined) character.firstNameEn = options.firstNameEn;
  if (options.familyNameEn !== undefined) character.familyNameEn = options.familyNameEn;
  if (options.backgroundAr !== undefined) character.backgroundAr = options.backgroundAr;
  if (options.backgroundEn !== undefined) character.backgroundEn = options.backgroundEn;
  if (options.factionId !== undefined) character.factionId = options.factionId;
  return character;
}

/* ------------------------------------------------------------------ */
/* Pricing                                                            */
/* ------------------------------------------------------------------ */

/** How much a bloodline trait adds to the price (fractional multiplier). */
function specialTraitFactor(character: Character): number {
  let factor = 1;
  for (const trait of character.phenotype ?? []) {
    const bonus = SPECIAL_TRAIT_BONUS[trait];
    if (bonus) factor *= 1 + bonus;
  }
  return factor;
}

/** How much rare genetics add to the price (fractional multiplier). */
function geneticFactor(character: Character): number {
  let extra = 0;
  for (const trait of character.phenotype ?? []) {
    extra += (TRAIT_RARITY[trait] ?? 2) - 1;
  }
  return 1 + extra * 0.08;
}

/** How much a stronger body adds to the price (fractional multiplier). */
function combatFactor(character: Character): number {
  const level = Math.max(1, Math.floor(character.level ?? 1));
  const base = combatStatsFor(character.race, level);
  const stats = character.stats ?? base;
  const excess =
    (stats.damage - base.damage) * 0.05 +
    (stats.defense - base.defense) * 0.04 +
    (stats.hp - base.hp) * 0.004 +
    (stats.speed - base.speed) * 0.03;
  const clamped = Math.max(-0.4, Math.min(1.5, excess));
  return 1 + clamped * 0.5;
}

/**
 * The exact coin price of hiring a character.
 *
 * Always an integer of at least `BASE_RECRUIT_PRICE`; a plain level-1 human
 * with no special traits costs exactly `BASE_RECRUIT_PRICE` at multiplier 1.
 */
export function recruitPriceFor(character: Character, tier: number, multiplier: number): number {
  const rarity = SPECIES[character.race]?.rarity ?? 1;
  const tierValue = Number.isFinite(tier) ? Math.max(1, Math.floor(tier)) : 1;
  const multiplierValue = Number.isFinite(multiplier) ? Math.max(0.1, multiplier) : 1;
  let price = BASE_RECRUIT_PRICE;
  price *= 1 + (rarity - 1) * 0.5;
  price *= 1 + Math.max(0, Math.floor(character.level ?? 1) - 1) * 0.2;
  price *= combatFactor(character);
  price *= geneticFactor(character);
  price *= specialTraitFactor(character);
  price *= 1 + (tierValue - 1) * 0.25;
  price *= multiplierValue;
  return Math.max(BASE_RECRUIT_PRICE, Math.round(price));
}

/* ------------------------------------------------------------------ */
/* Roster                                                             */
/* ------------------------------------------------------------------ */

/** Number of tavern slots for a given base level. */
export function tavernSlots(baseLevel: number): number {
  const level = Math.max(1, Math.floor(Number.isFinite(baseLevel) ? baseLevel : 1));
  return Math.min(TAVERN_SLOTS_MAX, TAVERN_SLOTS_BASE + level);
}

/** Tavern slots including the level of a built tavern, if there is one. */
export function tavernSlotsFor(store: GameStore): number {
  const state = store.state;
  const buildings = state.base?.buildings ?? [];
  let bonus = 0;
  for (const building of buildings) {
    if (building.defId === 'tavern') bonus += building.level;
  }
  return Math.min(TAVERN_SLOTS_MAX + 4, tavernSlots(state.base?.level ?? 1) + bonus);
}

/** The candidates currently on offer (untaken ones only). */
export function tavernOffers(store: GameStore): TavernCandidate[] {
  return store.state.tavern.filter((candidate) => !candidate.taken);
}

function rollTier(rng: GameStore['rng']): number {
  return rng.weighted([1, 2, 3, 4], [60, 25, 10, 5]);
}

function rollRace(rng: GameStore['rng'], tier: number): RaceId {
  const pool = RECRUITABLE_SPECIES.length ? RECRUITABLE_SPECIES : ['human'];
  const weights = pool.map((race) => {
    const rarity = SPECIES[race]?.rarity ?? 1;
    // Rarer bloodlines stay rare, but a higher tier lifts their chance.
    const base = 10 / rarity;
    return base * (1 + (tier - 1) * 0.25);
  });
  return rng.weighted(pool, weights);
}

function rollSex(rng: GameStore['rng'], race: RaceId): Sex {
  if (SPECIES[race]?.sexSystem === 'none') return 'none';
  return rng.chance(0.5) ? 'male' : 'female';
}

/** A full name together with the parts it was built from. */
interface PickedNames {
  ar: string;
  en: string;
  first: NameEntry;
  family: NameEntry;
}

function pickNames(rng: GameStore['rng'], used: Set<string>): PickedNames | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const first = rng.pick(GIVEN_NAMES);
    const family = rng.pick(FAMILY_NAMES);
    const key = `${first.ar}|${family.ar}`;
    if (!used.has(key)) {
      used.add(key);
      return {
        ar: `${first.ar} ${family.ar}`,
        en: `${first.en} ${family.en}`,
        first,
        family,
      };
    }
  }
  return null;
}

function pickTraits(rng: GameStore['rng'], race: RaceId, tier: number): TraitId[] {
  const native = SPECIES[race]?.nativeTraits ?? [];
  const fallback: TraitId[] = ['trait.toughness'];
  const traits: TraitId[] = [];
  const wanted = tier >= 3 ? rng.int(1, 2) : rng.chance(0.45) ? 1 : 0;
  for (let i = 0; i < wanted; i++) {
    const trait = rng.pick(native.length ? native : fallback);
    if (!traits.includes(trait)) traits.push(trait);
  }
  if (tier >= 3) {
    const exotic = rng.pick([
      'trait.bloodthirst',
      'trait.dragonblood',
      'trait.hellborn',
      'trait.mutation',
      'trait.spiritborn',
      'trait.undead',
    ]);
    if (!traits.includes(exotic)) traits.push(exotic);
  }
  return traits;
}

function generateCandidate(store: GameStore, usedNames: Set<string>): TavernCandidate | null {
  const rng = store.rng;
  const state = store.state;
  const tier = rollTier(rng);
  const race = rollRace(rng, tier);
  const species = SPECIES[race];
  const maxLevel = Math.max(1, Math.min(15, (state.base?.level ?? 1) + tier + 1));
  const level = rng.int(1, maxLevel);
  const minAge = Math.max(18, species?.adultAge ?? 18, maturityAgeFor(race));
  const age = minAge + rng.int(0, 24);
  const names = pickNames(rng, usedNames);
  if (!names) return null;
  const background = rng.pick(BACKGROUNDS);
  const character = createCharacter({
    firstName: names.first.ar,
    firstNameEn: names.first.en,
    familyName: names.family.ar,
    familyNameEn: names.family.en,
    sex: rollSex(rng, race),
    race,
    age,
    level,
    zone: 'settlement',
    x: (state.world?.baseX ?? 0) + rng.range(-6, 6),
    y: (state.world?.baseY ?? 0) + rng.range(-6, 6),
    household: 'resident',
    job: 'idle',
    personality: [rng.pick(PERSONALITY_POOL), rng.pick(PERSONALITY_POOL)],
    skills: rng.sample(SKILL_POOL, rng.int(1, 3)),
    phenotype: pickTraits(rng, race, tier),
    portraitSeed: rng.int(1, 999999),
    backgroundAr: background.ar,
    backgroundEn: background.en,
  });
  const price = recruitPriceFor(character, tier, state.difficulty?.recruitmentPriceMultiplier ?? 1);
  return {
    id: newId('tav'),
    character,
    price,
    tier,
    offeredDay: state.calendar.totalDays,
    taken: false,
  };
}

/**
 * Rotates the tavern roster when it is due and returns the live offers.
 *
 * The roster only ever changes when `TAVERN_ROTATION_DAYS` have passed since
 * `state.tavernRosterDay`, so calling this every frame is cheap and safe.
 */
export function refreshTavern(store: GameStore): TavernCandidate[] {
  const state = store.state;
  const day = state.calendar.totalDays;
  const due = state.tavern.length === 0 || day - state.tavernRosterDay >= TAVERN_ROTATION_DAYS;
  if (!due) return tavernOffers(store);

  const slots = tavernSlotsFor(store);
  const roster: TavernCandidate[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < slots; i++) {
    const candidate = generateCandidate(store, usedNames);
    if (candidate) roster.push(candidate);
  }
  state.tavern = roster;
  state.tavernRosterDay = day;
  store.emit('tavern:refreshed', { count: roster.length });
  store.touch('tavern:refresh');
  return tavernOffers(store);
}

/* ------------------------------------------------------------------ */
/* Hiring                                                             */
/* ------------------------------------------------------------------ */

export interface RecruitResult {
  ok: boolean;
  reason?: string;
  characterId?: Id;
}

/** Arabic-first failure message with a short English label for the UI. */
function capacityReason(capacity: number): string {
  return `امتلأت سعة المستوطنة (Population capacity reached: ${capacity}) - طور مستواك السكني لتوسيع السكن`;
}

function coinsReason(price: number, have: number): string {
  return `لا توجد عملات كافية (Not enough coins: need ${price}, have ${have})`;
}

/**
 * Buys a candidate from the tavern.
 *
 * Validation happens BEFORE any mutation, so a failed hire never costs coins
 * and never adds a character. A candidate can only ever be bought once.
 */
export function recruitCandidate(store: GameStore, candidateId: Id): RecruitResult {
  const state = store.state;
  const candidate = state.tavern.find((entry) => entry.id === candidateId);
  if (!candidate) {
    return { ok: false, reason: 'هذا المرشح غير موجود (Candidate not found)' };
  }
  if (candidate.taken) {
    return { ok: false, reason: 'تم التعاقد مع هذا المرشح من قبل (Candidate already hired)' };
  }
  if (!candidate.character.alive) {
    return { ok: false, reason: 'هذا المرشح لم يعد على قيد الحياة (Candidate is dead)' };
  }

  const capacity = state.base?.capacity ?? 0;
  const living = store.livingCount();
  if (living >= capacity) {
    return { ok: false, reason: capacityReason(capacity) };
  }

  const price = Math.max(BASE_RECRUIT_PRICE, Math.round(candidate.price));
  const coins = store.getResource('coins');
  if (coins < price) {
    return { ok: false, reason: coinsReason(price, coins) };
  }

  // Commit: coins first, then the character.
  const spent = store.spendResources({ coins: price });
  if (!spent) {
    return { ok: false, reason: coinsReason(price, store.getResource('coins')) };
  }

  const character = candidate.character;
  character.household = 'resident';
  character.alive = true;
  character.job = character.job ?? 'idle';
  store.addCharacter(character);
  candidate.taken = true;
  if (!state.recruitedIds.includes(character.id)) {
    state.recruitedIds.push(character.id);
  }
  store.emit('character:recruited', { id: character.id });
  store.notify(`انضم ${character.firstName} ${character.familyName} الى العائلة مقابل ${price} عملة`, 'info');
  store.chronicle(`تعاقد مع ${character.firstName} ${character.familyName} مقابل ${price} عملة`);
  store.touch('tavern:recruit');
  return { ok: true, characterId: character.id };
}

/** Drops a candidate from the offer list without hiring them. */
export function removeCandidate(store: GameStore, candidateId: Id): void {
  const state = store.state;
  const index = state.tavern.findIndex((entry) => entry.id === candidateId);
  if (index < 0) return;
  const candidate = state.tavern[index]!;
  candidate.taken = true;
  state.tavern.splice(index, 1);
  store.touch('tavern:remove');
}

/* ------------------------------------------------------------------ */
/* Marriage                                                          */
/* ------------------------------------------------------------------ */

/** Affinity towards the given character (0 when there is no bond). */
export function affinityBetween(a: Character, b: Character): number {
  let affinity = 0;
  for (const rel of a.relationships ?? []) {
    if (rel.targetId === b.id) affinity = Math.max(affinity, rel.affinity);
  }
  for (const rel of b.relationships ?? []) {
    if (rel.targetId === a.id) affinity = Math.max(affinity, rel.affinity);
  }
  return affinity;
}

function isPartnered(character: Character, otherId: Id): boolean {
  if (character.partnerId) return true;
  if ((character.family?.partnerIds ?? []).includes(otherId)) return true;
  return false;
}

/**
 * Characters that may marry the given character.
 *
 * Both must be alive, unpartnered, at or above their species maturity age and
 * of compatible bloodlines. Recruitment never implies marriage.
 */
export function marriageCandidates(store: GameStore, character: Character): Character[] {
  if (!character.alive) return [];
  const out: Character[] = [];
  for (const other of store.livingCharacters()) {
    if (other.id === character.id) continue;
    if (isPartnered(other, character.id)) continue;
    if (isPartnered(character, other.id)) continue;
    if (other.age < maturityAgeFor(other.race)) continue;
    if (character.age < maturityAgeFor(character.race)) continue;
    if (!speciesCompatible(character.race, other.race)) continue;
    out.push(other);
  }
  out.sort((a, b) => affinityBetween(b, character) - affinityBetween(a, character));
  return out;
}
