/**
 * Genetics tests — inheritance modes, lineage and mutation.
 */

import { describe, expect, it } from 'vitest';
import { createRng } from '../src/game/simulation/rng';
import { TRAITS, getTrait } from '../src/game/content/traits';
import {
  applyTraitEffects,
  childGenotype,
  expressTraits,
  inheritTraitProbability,
  mutateGenotype,
  randomGenotype,
  traitInfo,
  traitProbability,
} from '../src/game/simulation/systems/genetics';
import { createCharacter } from '../src/game/simulation/systems/family';
import type { Genotype } from '../src/game/simulation/types';

const TOUGH = getTrait('trait.toughness')!;
const STONE = getTrait('trait.stoneheart')!; // recessive
const MUTATION = getTrait('trait.mutation')!; // polygenic
const TOUGH_LOCUS = TOUGH.loci[0]!;
const STONE_LOCUS = STONE.loci[0]!;

describe('trait expression', () => {
  it('expresses a dominant trait when a single parent carries the allele', () => {
    const carrier: Genotype = { [TOUGH_LOCUS]: ['trait.toughness', 'normal'] };
    expect(expressTraits(carrier)).toContain('trait.toughness');

    const homozygous: Genotype = { [TOUGH_LOCUS]: ['trait.toughness', 'trait.toughness'] };
    expect(expressTraits(homozygous)).toContain('trait.toughness');

    const clean: Genotype = { [TOUGH_LOCUS]: ['normal', 'normal'] };
    expect(expressTraits(clean)).not.toContain('trait.toughness');
  });

  it('does not express a recessive trait from a single carrier but does from two copies', () => {
    const singleCarrier: Genotype = { [STONE_LOCUS]: ['trait.stoneheart', 'normal'] };
    expect(expressTraits(singleCarrier)).not.toContain('trait.stoneheart');

    const doubleCarrier: Genotype = { [STONE_LOCUS]: ['trait.stoneheart', 'trait.stoneheart'] };
    expect(expressTraits(doubleCarrier)).toContain('trait.stoneheart');
  });

  it('expresses a polygenic trait only above its threshold', () => {
    const [first, second] = MUTATION.loci;
    expect(MUTATION.inheritance).toBe('polygenic');
    expect(MUTATION.threshold).toBeGreaterThan(1);

    const belowThreshold: Genotype = {
      [first!]: ['trait.mutation', 'normal'],
      [second!]: ['normal', 'normal'],
    };
    expect(expressTraits(belowThreshold)).not.toContain('trait.mutation');

    const atThreshold: Genotype = {
      [first!]: ['trait.mutation', 'normal'],
      [second!]: ['trait.mutation', 'normal'],
    };
    expect(expressTraits(atThreshold)).toContain('trait.mutation');
  });
});

describe('child genotypes', () => {
  it('draws every allele from the actual parents', () => {
    const rng = createRng('child-genotype');
    const father = createCharacter({
      firstName: 'Fathers',
      familyName: 'Test',
      sex: 'male',
      race: 'human',
      rng,
      genotype: { [TOUGH_LOCUS]: ['trait.toughness', 'trait.toughness'] },
    });
    const mother = createCharacter({
      firstName: 'Mother',
      familyName: 'Test',
      sex: 'female',
      race: 'human',
      rng,
      genotype: { [STONE_LOCUS]: ['trait.stoneheart', 'normal'] },
    });

    const child = childGenotype(rng, father, mother);

    for (const [locus, pair] of Object.entries(child)) {
      const pool = new Set<string>([
        ...(father.genotype[locus] ?? []),
        ...(mother.genotype[locus] ?? []),
      ]);
      expect(pair.length).toBe(2);
      for (const allele of pair) {
        expect(pool.has(allele)).toBe(true);
      }
    }

    // The father is homozygous, so the child always inherits the allele.
    expect(child[TOUGH_LOCUS]).toContain('trait.toughness');
  });

  it('inherits a trait from a heterozygous parent with a computed probability', () => {
    const rng = createRng('inherit-probability');
    const father = createCharacter({
      firstName: 'Fathers',
      familyName: 'Test',
      sex: 'male',
      race: 'human',
      rng,
      genotype: { [TOUGH_LOCUS]: ['trait.toughness', 'normal'] },
    });
    const mother = createCharacter({
      firstName: 'Mother',
      familyName: 'Test',
      sex: 'female',
      race: 'human',
      rng,
      genotype: { [TOUGH_LOCUS]: ['normal', 'normal'] },
    });

    const probability = inheritTraitProbability(father, mother, 'trait.toughness');
    expect(probability).toBeGreaterThan(0);
    expect(probability).toBeLessThan(1);
  });
});

describe('trait probability', () => {
  it('stays between 0 and 1 for every trait', () => {
    const empty: Genotype = {};
    for (const traitId of Object.keys(TRAITS)) {
      const probability = traitProbability(empty, traitId);
      expect(probability).toBeGreaterThanOrEqual(0);
      expect(probability).toBeLessThanOrEqual(1);
    }
  });

  it('is 1 for a guaranteed dominant case', () => {
    const guaranteed: Genotype = { [TOUGH_LOCUS]: ['trait.toughness', 'trait.toughness'] };
    expect(traitProbability(guaranteed, 'trait.toughness')).toBe(1);

    const empty: Genotype = { [TOUGH_LOCUS]: ['normal', 'normal'] };
    expect(traitProbability(empty, 'trait.toughness')).toBe(0);
  });

  it('matches the enumeration for a heterozygous dominant carrier', () => {
    const carrier: Genotype = { [TOUGH_LOCUS]: ['trait.toughness', 'normal'] };
    // Two gametes (trait / normal) per parent slot: the child misses the
    // allele only when both gametes are 'normal' (1/4 of the outcomes).
    expect(traitProbability(carrier, 'trait.toughness')).toBeCloseTo(0.75, 5);
  });
});

describe('mutation', () => {
  it('can introduce a new trait and always returns a valid genotype', () => {
    const rng = createRng('mutation-test');
    const base: Genotype = { [TOUGH_LOCUS]: ['normal', 'normal'] };
    const before = expressTraits(base);

    let introduced = false;
    for (let attempt = 0; attempt < 300 && !introduced; attempt++) {
      const mutated = mutateGenotype(rng, base, 'human');

      for (const [locus, pair] of Object.entries(mutated)) {
        expect(locus.length).toBeGreaterThan(0);
        expect(pair.length).toBe(2);
        for (const allele of pair) {
          expect(allele === 'normal' || allele in TRAITS).toBe(true);
        }
      }

      const after = expressTraits(mutated);
      if (after.some((traitId) => !before.includes(traitId))) introduced = true;
    }

    expect(introduced).toBe(true);
  });

  it('keeps a random genotype valid and consistent with its phenotype', () => {
    const rng = createRng('random-genotype');
    const genotype = randomGenotype(rng, 'elf');
    for (const [locus, pair] of Object.entries(genotype)) {
      expect(locus.length).toBeGreaterThan(0);
      expect(pair.length).toBe(2);
      for (const allele of pair) {
        expect(allele === 'normal' || allele in TRAITS).toBe(true);
      }
    }
  });
});

describe('trait effects and info', () => {
  it('applies trait stat effects', () => {
    const base = {
      hp: 100, damage: 10, defense: 5, stamina: 50, speed: 10,
      accuracy: 0.8, evasion: 0.05, critChance: 0.05, magicResist: 0.1,
      attackRange: 1, attackSpeed: 1,
    };
    const plain = applyTraitEffects(base, []);
    const tough = applyTraitEffects(base, ['trait.toughness']);

    expect(plain.hp).toBe(base.hp);
    expect(tough.hp).toBeGreaterThan(base.hp);
    expect(tough.defense).toBeGreaterThan(base.defense);
  });

  it('exposes bilingual trait information', () => {
    const arabic = traitInfo('trait.toughness', 'ar');
    const english = traitInfo('trait.toughness', 'en');
    expect(arabic.name).toBe(TOUGH.nameAr);
    expect(english.name).toBe(TOUGH.nameEn);
    expect(arabic.rarity).toBe(TOUGH.rarity);
    expect(arabic.origin.length).toBeGreaterThan(0);
    expect(english.origin.length).toBeGreaterThan(0);
  });
});
