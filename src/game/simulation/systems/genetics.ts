/**
 * Genetics — inheritance, expression and mutation.
 *
 * Everything here is computed, never fabricated:
 *  - A genotype holds two alleles per locus (the maternal and paternal copy).
 *  - Expression follows the trait's inheritance mode:
 *      dominant  : any locus carries the trait allele.
 *      recessive : every locus carries the trait allele.
 *      polygenic : the count of trait alleles reaches the trait's threshold.
 *  - A child's genotype only ever contains alleles that exist in one of the
 *    two parents (one parent contributes each locus slot).
 *  - Probabilities are derived by enumerating the gametes a genotype can
 *    produce and counting the fraction of outcomes that express the trait.
 *
 * All randomness comes from the injected seeded RNG, so a save/load round trip
 * reproduces the same bloodlines.
 */

import type {
  Allele,
  Character,
  CombatStats,
  Genotype,
  LocusId,
  RaceId,
  TraitDef,
  TraitId,
} from '../types';
import type { Rng } from '../rng';
import { ALL_LOCI, TRAIT_IDS, TRAITS, getTrait } from '../../content/traits';
import { SPECIES } from '../../content/species';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Chance that a carrier carries a trait allele, by rarity (1 = common). */
const CARRIER_CHANCE: Record<number, number> = {
  1: 0.3,
  2: 0.16,
  3: 0.08,
  4: 0.035,
  5: 0.012,
};

/** Native traits are far more likely in their own species. */
const NATIVE_BOOST = 2.5;

/** Chance that a native trait is homozygous rather than a single copy. */
const NATIVE_HOMOZYGOTE_CHANCE = 0.3;

/** Chance that a non-native trait is homozygous. */
const HOMOZYGOTE_CHANCE = 0.1;

/** Chance that a native trait is homozygous in a polygenic slot. */
const NATIVE_POLY_HOMOZYGOTE_CHANCE = 0.25;

/** Chance that a non-native polygenic slot is homozygous. */
const POLY_HOMOZYGOTE_CHANCE = 0.08;

/** Per-attempt chance that a mutation event happens at all. */
const MUTATION_CHANCE_PER_ATTEMPT = 0.25;

/** How many mutation attempts a single mutation call makes. */
const MUTATION_ATTEMPTS = 3;

/* ------------------------------------------------------------------ */
/* Genotype helpers                                                    */
/* ------------------------------------------------------------------ */

/** True when the value is a usable allele. */
export function isValidAllele(value: unknown): value is Allele {
  return value === 'normal' || (typeof value === 'string' && value in TRAITS);
}

/**
 * Returns a complete, valid genotype: every known locus is present and every
 * allele is either 'normal' or a known trait id.
 */
export function normalizeGenotype(genotype: Genotype | undefined): Genotype {
  const out: Genotype = {};
  for (const locus of ALL_LOCI) {
    const pair = genotype?.[locus];
    out[locus] = [sanitizeAllele(pair?.[0]), sanitizeAllele(pair?.[1])];
  }
  for (const locus of Object.keys(genotype ?? {})) {
    if (locus in out) continue;
    const pair = genotype![locus]!;
    out[locus] = [sanitizeAllele(pair[0]), sanitizeAllele(pair[1])];
  }
  return out;
}

function sanitizeAllele(value: Allele | undefined): Allele {
  if (value === undefined || value === 'normal') return 'normal';
  return value in TRAITS ? value : 'normal';
}

/** Number of trait alleles carried across all loci of a trait. */
export function traitAlleleCount(genotype: Genotype, def: TraitDef): number {
  let count = 0;
  for (const locus of def.loci) {
    const pair = genotype?.[locus];
    if (!pair) continue;
    for (const allele of pair) {
      if (allele === def.id) count += 1;
    }
  }
  return count;
}

/** True when a genotype expresses a trait according to its inheritance mode. */
export function traitExpresses(genotype: Genotype, def: TraitDef): boolean {
  const count = traitAlleleCount(genotype, def);
  switch (def.inheritance) {
    case 'dominant':
      return count >= 1;
    case 'recessive':
      return def.loci.length > 0 && count >= def.loci.length * 2;
    case 'polygenic':
      return count >= (def.threshold ?? def.loci.length);
    default:
      return false;
  }
}

/** Every trait expressed by a genotype. */
export function expressTraits(genotype: Genotype): TraitId[] {
  const out: TraitId[] = [];
  for (const id of TRAIT_IDS) {
    const def = TRAITS[id]!;
    if (traitExpresses(genotype, def)) out.push(id);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Gametes                                                             */
/* ------------------------------------------------------------------ */

interface Gamete {
  /** One allele per locus of the trait being evaluated. */
  alleles: Allele[];
  probability: number;
}

/**
 * Enumerates the distinct gametes a genotype can produce for the given loci.
 * A locus with two different alleles yields two gametes with equal weight;
 * a homozygous or missing locus yields a single certain allele.
 */
function enumerateGametes(genotype: Genotype, loci: LocusId[]): Gamete[] {
  let gametes: Gamete[] = [{ alleles: [], probability: 1 }];
  for (const locus of loci) {
    const pair = genotype?.[locus];
    const a = sanitizeAllele(pair?.[0]);
    const b = sanitizeAllele(pair?.[1]);
    const options: { allele: Allele; weight: number }[] =
      a === b ? [{ allele: a, weight: 1 }] : [{ allele: a, weight: 0.5 }, { allele: b, weight: 0.5 }];
    const next: Gamete[] = [];
    for (const gamete of gametes) {
      for (const option of options) {
        next.push({
          alleles: [...gamete.alleles, option.allele],
          probability: gamete.probability * option.weight,
        });
      }
    }
    gametes = next;
  }
  return gametes;
}

function genotypeFromGametes(g1: Gamete, g2: Gamete, loci: LocusId[]): Genotype {
  const out: Genotype = {};
  for (let i = 0; i < loci.length; i++) {
    out[loci[i]!] = [g1.alleles[i] ?? 'normal', g2.alleles[i] ?? 'normal'];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Probabilities                                                       */
/* ------------------------------------------------------------------ */

/**
 * Probability that a child of a line carrying this genotype expresses the
 * trait, computed by enumerating the gametes the genotype can produce and
 * counting the fraction of gamete pairs whose combination expresses the
 * trait (a self-cross of the line).
 *
 * The result is always in [0, 1].
 */
export function traitProbability(genotype: Genotype, traitId: TraitId): number {
  const def = getTrait(traitId);
  if (!def) return 0;
  const gametes = enumerateGametes(genotype, def.loci);
  if (!gametes.length) return 0;

  let total = 0;
  let expressing = 0;
  for (const g1 of gametes) {
    for (const g2 of gametes) {
      const weight = g1.probability * g2.probability;
      total += weight;
      if (traitExpresses(genotypeFromGametes(g1, g2, def.loci), def)) expressing += weight;
    }
  }
  if (total <= 0) return 0;
  return clamp01(expressing / total);
}

/**
 * Probability that a child of these two specific parents expresses the trait.
 * Both parents' gametes are enumerated, so the number is the exact fraction
 * of possible offspring that express the trait.
 */
export function inheritTraitProbability(
  father: Character,
  mother: Character,
  traitId: TraitId,
): number {
  const def = getTrait(traitId);
  if (!def) return 0;
  const fatherGametes = enumerateGametes(father.genotype ?? {}, def.loci);
  const motherGametes = enumerateGametes(mother.genotype ?? {}, def.loci);

  let total = 0;
  let expressing = 0;
  for (const f of fatherGametes) {
    for (const m of motherGametes) {
      const weight = f.probability * m.probability;
      total += weight;
      const child: Genotype = {};
      for (let i = 0; i < def.loci.length; i++) {
        child[def.loci[i]!] = [f.alleles[i] ?? 'normal', m.alleles[i] ?? 'normal'];
      }
      if (traitExpresses(child, def)) expressing += weight;
    }
  }
  if (total <= 0) return 0;
  return clamp01(expressing / total);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/* ------------------------------------------------------------------ */
/* Randomisation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Builds a random genotype for a species. Native traits are noticeably more
 * common, and every roll comes from the injected RNG.
 */
export function randomGenotype(rng: Rng, race: RaceId): Genotype {
  const genotype: Genotype = {};
  for (const locus of ALL_LOCI) genotype[locus] = ['normal', 'normal'];

  const nativeTraits = SPECIES[race]?.nativeTraits ?? [];

  for (const id of TRAIT_IDS) {
    const def = TRAITS[id]!;
    const isNative = nativeTraits.includes(id);
    const chance = (CARRIER_CHANCE[def.rarity] ?? 0.01) * (isNative ? NATIVE_BOOST : 1);
    if (chance <= 0) continue;

    if (def.inheritance === 'polygenic') {
      for (const locus of def.loci) {
        if (!rng.chance(chance / def.loci.length)) continue;
        const homo = rng.chance(isNative ? NATIVE_POLY_HOMOZYGOTE_CHANCE : POLY_HOMOZYGOTE_CHANCE);
        genotype[locus] = homo ? [id, id] : [id, 'normal'];
      }
      continue;
    }

    const locus = def.loci[0];
    if (!locus) continue;
    if (!rng.chance(chance)) continue;
    const homo = rng.chance(isNative ? NATIVE_HOMOZYGOTE_CHANCE : HOMOZYGOTE_CHANCE);
    genotype[locus] = homo ? [id, id] : [id, 'normal'];
  }

  return genotype;
}

/**
 * Builds a child's genotype. Every locus slot is filled by exactly one
 * parent, so each allele demonstrably comes from the father or the mother.
 */
export function childGenotype(rng: Rng, father: Character, mother: Character): Genotype {
  const loci = new Set<string>([
    ...Object.keys(father.genotype ?? {}),
    ...Object.keys(mother.genotype ?? {}),
  ]);

  const out: Genotype = {};
  for (const locus of loci) {
    const first = rng.chance(0.5) ? father : mother;
    const second = first === father ? mother : father;
    out[locus] = [gameteFrom(first, locus, rng), gameteFrom(second, locus, rng)];
  }
  return out;
}

/** One random allele of a parent at a locus (a gamete). */
function gameteFrom(parent: Character, locus: string, rng: Rng): Allele {
  const pair = parent.genotype?.[locus];
  if (!pair) return 'normal';
  const a = sanitizeAllele(pair[0]);
  const b = sanitizeAllele(pair[1]);
  if (a === b) return a;
  return rng.chance(0.5) ? a : b;
}

/**
 * Mutates a genotype: a trait the line does not yet express may appear
 * through a mutation. The result is always a valid genotype.
 */
export function mutateGenotype(rng: Rng, genotype: Genotype, race: RaceId): Genotype {
  const out = normalizeGenotype(genotype);
  const nativeTraits = SPECIES[race]?.nativeTraits ?? [];

  for (let attempt = 0; attempt < MUTATION_ATTEMPTS; attempt++) {
    if (!rng.chance(MUTATION_CHANCE_PER_ATTEMPT)) continue;

    const expressed = new Set(expressTraits(out));
    const candidates = TRAIT_IDS.filter((id) => {
      if (expressed.has(id)) return false;
      const def = TRAITS[id]!;
      return def.loci.some((locus) => {
        const pair = out[locus] ?? ['normal', 'normal'];
        return pair.includes('normal');
      });
    });
    if (!candidates.length) break;

    const weights = candidates.map((id) => {
      const def = TRAITS[id]!;
      const nativeBoost = nativeTraits.includes(id) ? NATIVE_BOOST : 1;
      return Math.max(0.0001, def.mutationChance * (6 - def.rarity) * nativeBoost);
    });

    const chosen = rng.weighted(candidates, weights);
    const def = TRAITS[chosen]!;
    const locus = rng.pick(def.loci);
    const pair = out[locus] ?? ['normal', 'normal'];
    const slot: 0 | 1 = pair[0] === 'normal' ? 0 : 1;
    const next: [Allele, Allele] = [pair[0], pair[1]];
    next[slot] = chosen;
    out[locus] = next;
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Effects & info                                                      */
/* ------------------------------------------------------------------ */

const STAT_KEYS: (keyof CombatStats)[] = [
  'hp', 'damage', 'defense', 'stamina', 'speed', 'accuracy', 'evasion',
  'critChance', 'magicResist', 'attackRange', 'attackSpeed',
];

/**
 * Applies the stat effects of every expressed trait. Flat modifiers are
 * added first, multiplicative ones after.
 */
export function applyTraitEffects(stats: CombatStats, phenotype: TraitId[]): CombatStats {
  const out: CombatStats = { ...stats };

  for (const id of phenotype) {
    const def = getTrait(id);
    if (!def) continue;
    for (const effect of def.effects) {
      if (effect.stat) {
        for (const key of STAT_KEYS) {
          const value = effect.stat[key];
          if (typeof value === 'number') out[key] += value;
        }
      }
      if (effect.statMultiplier) {
        for (const key of STAT_KEYS) {
          const value = effect.statMultiplier[key];
          if (typeof value === 'number') out[key] *= value;
        }
      }
    }
  }

  for (const key of STAT_KEYS) out[key] = Math.round(out[key] * 100) / 100;
  return out;
}

/** Localized information about a trait, for UI cards. */
export function traitInfo(
  traitId: TraitId,
  lang: 'ar' | 'en',
): { name: string; desc: string; rarity: number; origin: string } {
  const def = getTrait(traitId);
  if (!def) return { name: traitId, desc: '', rarity: 0, origin: '' };
  return {
    name: lang === 'ar' ? def.nameAr : def.nameEn,
    desc: lang === 'ar' ? def.descAr : def.descEn,
    rarity: def.rarity,
    origin: traitOrigin(def, lang),
  };
}

/** Localized origin of a trait (its native species or "acquired"). */
export function traitOrigin(def: TraitDef, lang: 'ar' | 'en'): string {
  if (!def.originRace) return lang === 'ar' ? 'مكتسَبة' : 'Acquired';
  const species = SPECIES[def.originRace];
  if (!species) return def.originRace;
  return lang === 'ar' ? species.nameAr : species.nameEn;
}
