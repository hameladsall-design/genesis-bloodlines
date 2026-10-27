/**
 * Species definitions.
 *
 * Every race in the world is described here. Species drive lifespan, growth,
 * maturity, base stat multipliers, fertility, reproduction compatibility and
 * the traits that can occur naturally in that bloodline.
 *
 * Sex handling: `sexSystem: 'none'` species use the 'none' biological sex
 * (for example spirits), so the reproduction system never has to force an
 * inaccurate male/female label onto them.
 */

import type { RaceId, SpeciesDef } from '../simulation/types';

export const SPECIES: Record<RaceId, SpeciesDef> = {
  human: {
    id: 'human',
    nameAr: 'بشري',
    nameEn: 'Human',
    sexSystem: 'binary',
    lifespan: [70, 100],
    maturityAge: 16,
    adultAge: 18,
    rarity: 1,
    statMultiplier: { hp: 1, damage: 1, defense: 1, stamina: 1, speed: 1 },
    fertility: 1,
    lifespanBonus: 0,
    nativeTraits: ['trait.toughness', 'trait.versatile'],
    compatibleWith: 'all',
    incompatibleWith: [],
    descAr: 'غزاة هذا العالم المدمّر، قصيرو العمر لكن أمتعهم موازنةً بين القدرات.',
    descEn: 'Invaders of this broken world. Short-lived, but the most balanced.',
  },
  elf: {
    id: 'elf',
    nameAr: 'إلفي',
    nameEn: 'Elf',
    sexSystem: 'binary',
    lifespan: [300, 500],
    maturityAge: 40,
    adultAge: 60,
    rarity: 2,
    statMultiplier: { hp: 0.9, damage: 1.05, defense: 0.9, stamina: 1.1, speed: 1.15 },
    fertility: 0.5,
    lifespanBonus: 250,
    nativeTraits: ['trait.longevity', 'trait.graceful'],
    compatibleWith: 'all',
    incompatibleWith: [],
    descAr: 'إسلال بقاء في العالم الجديد، إلهامٌ ومهارة لا تتقادم.',
    descEn: 'Immortal remnants of the old world — inspiration that never ages.',
  },
  dark_elf: {
    id: 'dark_elf',
    nameAr: 'إلفي مظلم',
    nameEn: 'Dark Elf',
    sexSystem: 'binary',
    lifespan: [250, 420],
    maturityAge: 38,
    adultAge: 55,
    rarity: 2,
    statMultiplier: { hp: 1, damage: 1.2, defense: 0.95, stamina: 1, speed: 1.1 },
    fertility: 0.55,
    lifespanBonus: 200,
    nativeTraits: ['trait.nightborn', 'trait.sharpness'],
    compatibleWith: 'all',
    incompatibleWith: [],
    descAr: 'ورثة عوالم داكنة، يولدون في الظلام وتخيفهم أظلال ساحقة.',
    descEn: 'Heirs of dark worlds — night-born and razor-edged.',
  },
  dwarf: {
    id: 'dwarf',
    nameAr: 'قزم',
    nameEn: 'Dwarf',
    sexSystem: 'binary',
    lifespan: [180, 300],
    maturityAge: 22,
    adultAge: 28,
    rarity: 2,
    statMultiplier: { hp: 1.35, damage: 1.15, defense: 1.3, stamina: 1.1, speed: 0.75 },
    fertility: 0.7,
    lifespanBonus: 130,
    nativeTraits: ['trait.toughness', 'trait.stoneheart'],
    compatibleWith: 'all',
    incompatibleWith: [],
    descAr: 'حِرَفيون الجبال، أجسادٌ كالحجر وعقولٌ كالحِد.',
    descEn: 'Mountain craftsmen — bodies like stone, minds sharper.',
  },
  orc: {
    id: 'orc',
    nameAr: 'orc',
    nameEn: 'Orc',
    sexSystem: 'binary',
    lifespan: [60, 85],
    maturityAge: 14,
    adultAge: 18,
    rarity: 2,
    statMultiplier: { hp: 1.3, damage: 1.3, defense: 1.05, stamina: 1.2, speed: 0.95 },
    fertility: 1.1,
    lifespanBonus: -10,
    nativeTraits: ['trait.wildblood', 'trait.toughness'],
    compatibleWith: 'all',
    incompatibleWith: [],
    descAr: 'سلالةٌ حربية لا تعرف إلا القوة والدم.',
    descEn: 'A warlike bloodline that knows only strength and blood.',
  },
  vampire: {
    id: 'vampire',
    nameAr: 'ماصّ دماء',
    nameEn: 'Vampire',
    sexSystem: 'binary',
    lifespan: [400, 900],
    maturityAge: 25,
    adultAge: 30,
    rarity: 4,
    statMultiplier: { hp: 1.15, damage: 1.45, defense: 1, stamina: 1.15, speed: 1.25 },
    fertility: 0.35,
    lifespanBonus: 400,
    nativeTraits: ['trait.nightborn', 'trait.bloodthirst', 'trait.longevity'],
    compatibleWith: 'all',
    incompatibleWith: [],
    descAr: 'أicionesٌ تحت الأرض، تفرزها أجسادٌ لا يعرفها النهار.',
    descEn: 'Creatures of the underdark, born in bodies the daylight rejects.',
  },
  werewolf: {
    id: 'werewolf',
    nameAr: 'ذئب مسكون',
    nameEn: 'Werewolf',
    sexSystem: 'binary',
    lifespan: [70, 110],
    maturityAge: 16,
    adultAge: 20,
    rarity: 3,
    statMultiplier: { hp: 1.25, damage: 1.4, defense: 1, stamina: 1.2, speed: 1.2 },
    fertility: 0.8,
    lifespanBonus: 0,
    nativeTraits: ['trait.wildblood', 'trait.feral'],
    compatibleWith: 'all',
    incompatibleWith: [],
    descAr: 'لعنةٌ حيوانية تتبدّل فيها أجسادُهم تحت ضوء القمر.',
    descEn: 'An animal curse that changes its shape under moonlight.',
  },
  demon: {
    id: 'demon',
    nameAr: 'شيطان',
    nameEn: 'Demon',
    sexSystem: 'binary',
    lifespan: [500, 1200],
    maturityAge: 30,
    adultAge: 45,
    rarity: 5,
    statMultiplier: { hp: 1.4, damage: 1.6, defense: 1.15, stamina: 1.25, speed: 1.05 },
    fertility: 0.4,
    lifespanBonus: 550,
    nativeTraits: ['trait.hellborn', 'trait.mutation', 'trait.cursed'],
    compatibleWith: 'all',
    incompatibleWith: ['angel'],
    descAr: 'من عوالمٍ أخرى، قوتُها لا تعرف حدودَ الدعاء.',
    descEn: 'From other worlds; their power answers to no prayer.',
  },
  half_demon: {
    id: 'half_demon',
    nameAr: 'نصف شيطان',
    nameEn: 'Half-Demon',
    sexSystem: 'binary',
    lifespan: [120, 220],
    maturityAge: 18,
    adultAge: 22,
    rarity: 3,
    statMultiplier: { hp: 1.15, damage: 1.3, defense: 1, stamina: 1.1, speed: 1.1 },
    fertility: 0.9,
    lifespanBonus: 90,
    nativeTraits: ['trait.hellborn', 'trait.toughness'],
    compatibleWith: 'all',
    incompatibleWith: [],
    descAr: 'دمٌ مختلط — قوةٌ وهدوءٌ في آنٍ واحد.',
    descEn: 'Mixed blood — power and calm in the same heartbeat.',
  },
  angel: {
    id: 'angel',
    nameAr: 'ملك',
    nameEn: 'Angel',
    sexSystem: 'none',
    lifespan: [600, 1400],
    maturityAge: 32,
    adultAge: 50,
    rarity: 5,
    statMultiplier: { hp: 1.3, damage: 1.5, defense: 1.35, stamina: 1.2, speed: 1.1 },
    fertility: 0.15,
    lifespanBonus: 650,
    nativeTraits: ['trait.holyblood', 'trait.blessed'],
    compatibleWith: 'all',
    incompatibleWith: ['demon'],
    descAr: 'سُلعٌ نازلةٌ من عوالمٍ مضيئة، بلا تمييزٍ بين ذكرٍ وأنثى.',
    descEn: 'Descended from radiant worlds, without male/female distinction.',
  },
  dragon_blooded: {
    id: 'dragon_blooded',
    nameAr: 'دم التنين',
    nameEn: 'Dragon-Blooded',
    sexSystem: 'binary',
    lifespan: [200, 400],
    maturityAge: 20,
    adultAge: 25,
    rarity: 4,
    statMultiplier: { hp: 1.35, damage: 1.35, defense: 1.2, stamina: 1.1, speed: 0.95 },
    fertility: 0.6,
    lifespanBonus: 180,
    nativeTraits: ['trait.dragonblood', 'trait.toughness'],
    compatibleWith: 'all',
    incompatibleWith: [],
    descAr: 'سلالةٌ تحمل عرق تنّينٍ في شرايينها.',
    descEn: 'A bloodline carrying dragon ichor in its veins.',
  },
  giant: {
    id: 'giant',
    nameAr: 'عملاق',
    nameEn: 'Giant',
    sexSystem: 'binary',
    lifespan: [120, 200],
    maturityAge: 22,
    adultAge: 30,
    rarity: 3,
    statMultiplier: { hp: 1.8, damage: 1.5, defense: 1.3, stamina: 1.1, speed: 0.7 },
    fertility: 0.5,
    lifespanBonus: 70,
    nativeTraits: ['trait.toughness', 'trait.stoneheart'],
    compatibleWith: 'all',
    incompatibleWith: [],
    descAr: 'أقزامٌ كانوا عمالقة، ولا تزال أعينهم تملأ الأفق.',
    descEn: 'Once titans; their gaze still fills the horizon.',
  },
  undead: {
    id: 'undead',
    nameAr: 'غير حيّ',
    nameEn: 'Undead',
    sexSystem: 'none',
    lifespan: [500, 1500],
    maturityAge: 25,
    adultAge: 30,
    rarity: 4,
    statMultiplier: { hp: 1.3, damage: 1.25, defense: 1.2, stamina: 0.6, speed: 0.9 },
    fertility: 0.05,
    lifespanBonus: 500,
    nativeTraits: ['trait.undead', 'trait.cursed'],
    compatibleWith: 'all',
    incompatibleWith: ['angel'],
    descAr: 'قتلى لم تتعلّم كيف تستلقي، وخلفاء العالم المتراكم.',
    descEn: 'The slain who never learned to lie down.',
  },
  spirit: {
    id: 'spirit',
    nameAr: 'روح',
    nameEn: 'Spirit',
    sexSystem: 'none',
    lifespan: [200, 600],
    maturityAge: 20,
    adultAge: 28,
    rarity: 4,
    statMultiplier: { hp: 0.9, damage: 1.2, defense: 0.85, stamina: 1.4, speed: 1.3 },
    fertility: 0.2,
    lifespanBonus: 220,
    nativeTraits: ['trait.spiritborn', 'trait.blessed'],
    compatibleWith: 'all',
    incompatibleWith: [],
    descAr: 'أرواح عالقة بين عوالم التصادم.',
    descEn: 'Spirits caught between colliding worlds.',
  },
  mutant: {
    id: 'mutant',
    nameAr: 'مُتحوِّل',
    nameEn: 'Mutant',
    sexSystem: 'binary',
    lifespan: [50, 90],
    maturityAge: 14,
    adultAge: 18,
    rarity: 2,
    statMultiplier: { hp: 1.1, damage: 1.2, defense: 0.95, stamina: 1, speed: 1.1 },
    fertility: 0.9,
    lifespanBonus: -20,
    nativeTraits: ['trait.mutation', 'trait.feral'],
    compatibleWith: 'all',
    incompatibleWith: [],
    descAr: 'آثارُ الالتقاء الكبير منطبوسةً في الجسد.',
    descEn: 'The Great Convergence written into flesh.',
  },
};

export const SPECIES_IDS: RaceId[] = Object.keys(SPECIES);

/** Species that can join the player's household through the tavern. */
export const RECRUITABLE_SPECIES: RaceId[] = [
  'human', 'elf', 'dark_elf', 'dwarf', 'orc', 'half_demon',
  'werewolf', 'vampire', 'dragon_blooded', 'giant', 'spirit', 'mutant',
];

export function getSpecies(id: RaceId): SpeciesDef {
  const def = SPECIES[id];
  if (!def) throw new Error(`Unknown species: ${id}`);
  return def;
}

export function speciesName(id: RaceId, lang: 'ar' | 'en' = 'ar'): string {
  const def = SPECIES[id];
  if (!def) return id;
  return lang === 'ar' ? def.nameAr : def.nameEn;
}

/** Human-readable biological sex, respecting species without a sex distinction. */
export function sexLabel(sex: 'male' | 'female' | 'none', speciesId: RaceId, lang: 'ar' | 'en' = 'ar'): string {
  if (sex === 'none') {
    const species = SPECIES[speciesId];
    if (species && species.sexSystem === 'none') {
      return lang === 'ar' ? 'لا يُذكر' : 'N/A';
    }
    return lang === 'ar' ? 'غير محدد' : 'Unspecified';
  }
  if (lang === 'ar') return sex === 'male' ? 'ذكر' : 'أنثى';
  return sex === 'male' ? 'Male' : 'Female';
}

/**
 * Decides whether two species can produce offspring together.
 * Same-species pairs always produce that same species — never a hybrid.
 */
export function canReproduce(a: RaceId, b: RaceId): boolean {
  const sa = SPECIES[a];
  const sb = SPECIES[b];
  if (!sa || !sb) return false;
  if (sa.incompatibleWith.includes(b) || sb.incompatibleWith.includes(a)) return false;
  if (a === b) return true;
  if (sa.compatibleWith === 'all' && sb.compatibleWith === 'all') return true;
  if (sa.compatibleWith !== 'all' && !sa.compatibleWith.includes(b)) return false;
  if (sb.compatibleWith !== 'all' && !sb.compatibleWith.includes(a)) return false;
  return true;
}

/** The species of a child produced by two parents. */
export function childSpecies(a: RaceId, b: RaceId): RaceId | null {
  if (!canReproduce(a, b)) return null;
  if (a === b) return a;
  // Hybrid: the child carries the blood of both parents.
  return `hybrid_${a}_${b}`;
}

/** Stable id for a hybrid species, registering a synthetic definition if needed. */
export function ensureHybridSpecies(a: RaceId, b: RaceId): RaceId | null {
  if (!canReproduce(a, b)) return null;
  const id = `hybrid_${a}_${b}`;
  if (SPECIES[id]) return id;

  const sa = SPECIES[a]!;
  const sb = SPECIES[b]!;
  const stats: Partial<SpeciesDef['statMultiplier']> = {};
  const keys = Object.keys(sa.statMultiplier) as (keyof SpeciesDef['statMultiplier'])[];
  for (const k of keys) {
    const av = sa.statMultiplier[k] ?? 1;
    const bv = sb.statMultiplier[k] ?? 1;
    (stats as Record<string, number>)[k] = (av + bv) / 2;
  }

  SPECIES[id] = {
    id,
    nameAr: `هجين ${sa.nameAr} و${sb.nameAr}`,
    nameEn: `${sa.nameEn}-${sb.nameEn} Hybrid`,
    sexSystem: sa.sexSystem === 'none' || sb.sexSystem === 'none' ? 'none' : 'binary',
    lifespan: [
      Math.round((sa.lifespan[0] + sb.lifespan[0]) / 2),
      Math.round((sa.lifespan[1] + sb.lifespan[1]) / 2),
    ],
    maturityAge: Math.round((sa.maturityAge + sb.maturityAge) / 2),
    adultAge: Math.round((sa.adultAge + sb.adultAge) / 2),
    rarity: Math.min(5, Math.round((sa.rarity + sb.rarity) / 2)),
    statMultiplier: stats,
    fertility: Math.min(sa.fertility, sb.fertility) * 0.8,
    lifespanBonus: Math.round((sa.lifespanBonus + sb.lifespanBonus) / 2),
    nativeTraits: Array.from(new Set([...sa.nativeTraits, ...sb.nativeTraits])),
    compatibleWith: [a, b],
    incompatibleWith: [],
    descAr: `نسلٌ يجمع دم ${sa.nameAr} و${sb.nameAr} في جسدٍ واحد.`,
    descEn: `Descendant blending the blood of ${sa.nameEn} and ${sb.nameEn}.`,
  };
  return id;
}

/** Base combat stats for a species, before level growth and traits. */
export function baseStatsFor(speciesId: RaceId) {
  const species = SPECIES[speciesId] ?? SPECIES.human!;
  const base = {
    hp: 100, damage: 12, defense: 6, stamina: 60, speed: 10,
    accuracy: 0.85, evasion: 0.08, critChance: 0.05, magicResist: 0.1,
    attackRange: 1, attackSpeed: 1,
  };
  const out = { ...base } as typeof base;
  for (const [key, mult] of Object.entries(species.statMultiplier)) {
    (out as Record<string, number>)[key] = (out as Record<string, number>)[key]! * (mult as number);
  }
  return out;
}
