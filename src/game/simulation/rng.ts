/**
 * Deterministic, seedable pseudo-random number generation.
 *
 * Every world-driven system must draw from a seeded stream so that a given
 * seed reproduces the same world, tavern rosters, genetics and loot.
 */

/** xmur3 string hash -> 32-bit seed. */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Random element. */
  pick<T>(arr: readonly T[]): T;
  /** n distinct random elements (or fewer if the array is short). */
  sample<T>(arr: readonly T[], n: number): T[];
  /** True with the given probability (0..1). */
  chance(p: number): boolean;
  /** Weighted pick: weights parallel to arr. */
  weighted<T>(arr: readonly T[], weights: readonly number[]): T;
  /** In-place Fisher-Yates shuffle. */
  shuffle<T>(arr: T[]): T[];
  /** A fresh independent stream derived from this one (for sub-systems). */
  fork(label: string): Rng;
}

/** mulberry32 PRNG. */
export function createRng(seed: string | number): Rng {
  let state = (typeof seed === 'number' ? seed >>> 0 : hashSeed(seed)) || 0x9e3779b9;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => {
      if (max < min) [min, max] = [max, min];
      return Math.floor(min + next() * (max - min + 1));
    },
    pick: (arr) => {
      if (!arr.length) throw new Error('Rng.pick called with an empty array');
      return arr[Math.floor(next() * arr.length)]!;
    },
    sample: (arr, n) => rng.shuffle([...arr]).slice(0, Math.max(0, Math.min(n, arr.length))),
    chance: (p) => next() < p,
    weighted: (arr, weights) => {
      if (!arr.length) throw new Error('Rng.weighted called with an empty array');
      const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
      if (total <= 0) return rng.pick(arr);
      let roll = next() * total;
      for (let i = 0; i < arr.length; i++) {
        roll -= Math.max(0, weights[i] ?? 0);
        if (roll <= 0) return arr[i]!;
      }
      return arr[arr.length - 1]!;
    },
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j]!, arr[i]!];
      }
      return arr;
    },
    fork: (label) => createRng(hashSeed(`${seedKey(seed)}::${label}`)),
  };

  return rng;
}

function seedKey(seed: string | number): string {
  return typeof seed === 'number' ? String(seed) : seed;
}

/** Random human-readable seed word pair, e.g. "ashen-vigil". */
export function randomSeedPhrase(rand: () => number = Math.random): string {
  const a = [
    'ashen', 'bloody', 'hollow', 'grim', 'iron', 'ember', 'frozen', 'sunken',
    'thorn', 'raven', 'gilded', 'pale', 'storm', 'dusk', 'iron', 'salt',
  ];
  const b = [
    'vigil', 'crown', 'march', 'oath', 'reach', 'hearth', 'sigil', 'fall',
    'wake', 'song', 'gate', 'bloom', 'bite', 'hymn', 'shard', 'root',
  ];
  const ia = Math.floor(rand() * a.length);
  const ib = Math.floor(rand() * b.length);
  return `${a[ia]}-${b[ib]}-${Math.floor(rand() * 900 + 100)}`;
}
