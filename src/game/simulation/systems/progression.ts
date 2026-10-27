/**
 * Progression — levels, stats, aging and death.
 *
 * Level growth scales the species base stats, trait effects are applied on
 * top, and aging is driven by the world clock so a character's age never
 * drifts away from the calendar.
 *
 * `applyDeath` lives here (and not in `family.ts`) so that `family.ts` can
 * depend on this module without creating an import cycle.
 */

import type { Character, CombatStats, LifeEvent, RaceId } from '../types';
import type { GameStore } from '../store';
import { baseStatsFor, SPECIES } from '../../content/species';
import { TRAITS } from '../../content/traits';
import { applyTraitEffects } from './genetics';
import { t } from '../../../i18n/registry';

/** Days in one in-game year (12 months of 30 days). */
export const DAYS_PER_YEAR = 360;

/* ------------------------------------------------------------------ */
/* Levels                                                              */
/* ------------------------------------------------------------------ */

/** Experience required to advance from `level` to the next one. */
export function xpForNextLevel(level: number): number {
  const l = Math.max(1, Math.floor(level) || 1);
  return Math.round(100 * Math.pow(l, 1.25));
}

/**
 * Grants experience and levels the character up as many times as the amount
 * allows. Returns the number of levels gained.
 */
export function grantXp(store: GameStore, c: Character, amount: number): number {
  if (!c.alive || !Number.isFinite(amount) || amount <= 0) return 0;

  c.xp += Math.floor(amount);
  let levels = 0;

  while (c.xp >= c.xpToNext) {
    c.xp -= c.xpToNext;
    c.level += 1;
    c.xpToNext = xpForNextLevel(c.level);
    levels += 1;

    recomputeStats(store, c);
    if (c.health > 0) c.health = Math.min(c.stats.hp, c.health + (c.stats.hp - c.baseStats.hp));
    else c.health = c.stats.hp;

    store.emit('character:leveled', { id: c.id, level: c.level });
    pushHistory(
      store,
      c,
      'promotion',
      t(
        'progression.levelup',
        `بلغ ${c.firstName} ${c.familyName} المرتبة ${c.level}.`,
        `${c.firstName} ${c.familyName} reached level ${c.level}.`,
      ),
    );
  }

  if (levels > 0) store.touch('character:leveled');
  return levels;
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

/** Species base stats scaled by level. */
export function baseStatsForLevel(race: RaceId, level: number): CombatStats {
  const base = baseStatsFor(race);
  const l = Math.max(1, Math.floor(level) || 1);
  const growth = 1 + 0.1 * (l - 1);

  return {
    ...base,
    hp: base.hp * growth,
    damage: base.damage * growth,
    defense: base.defense * growth,
    stamina: base.stamina * (1 + 0.05 * (l - 1)),
    speed: base.speed,
    accuracy: base.accuracy,
    evasion: base.evasion,
    critChance: base.critChance,
    magicResist: base.magicResist,
    attackRange: base.attackRange,
    attackSpeed: base.attackSpeed,
  };
}

/** Recomputes base stats and the final trait-modified stats of a character. */
export function recomputeStats(store: GameStore, c: Character): void {
  const before = c.stats ? { ...c.stats } : null;
  c.baseStats = baseStatsForLevel(c.race, c.level);
  c.stats = applyTraitEffects(c.baseStats, c.phenotype);
  if (c.health > c.stats.hp) c.health = c.stats.hp;
  if (before && !statsEqual(before, c.stats)) store.touch('character:stats');
}

function statsEqual(a: CombatStats, b: CombatStats): boolean {
  const keys = Object.keys(a) as (keyof CombatStats)[];
  return keys.every((key) => a[key] === b[key]);
}

/* ------------------------------------------------------------------ */
/* Aging & death                                                       */
/* ------------------------------------------------------------------ */

/** A character's age in years at the given absolute day. */
export function ageOf(c: Character, totalDays: number): number {
  const base = c.startAge ?? 0;
  const days = Math.max(0, totalDays - c.bornDay);
  return base + days / DAYS_PER_YEAR;
}

/** The age at which this character is expected to die of old age. */
export function lifespanOf(c: Character): number {
  const species = SPECIES[c.race];
  const base = species ? species.lifespan[1] + species.lifespanBonus : 80;
  let bonus = 0;
  for (const traitId of c.phenotype) {
    const def = TRAITS[traitId];
    if (!def) continue;
    for (const effect of def.effects) bonus += effect.lifespanDelta ?? 0;
  }
  return base + bonus;
}

/**
 * Kills a character. The record is kept in `state.characters` so the family
 * tree still shows the dead; `permanent` additionally flags the death as
 * irreversible and records the id in `state.permadeadIds`.
 */
export function applyDeath(
  store: GameStore,
  c: Character,
  cause: string,
  permanent: boolean,
): boolean {
  if (!c.alive) return false;

  c.alive = false;
  c.causeOfDeath = cause;
  c.dayOfDeath = store.state.calendar.totalDays;
  c.status.condition = 'dead';
  c.pregnant = undefined;

  // Permadeath is recorded before the event fires so that listeners always
  // observe the final, irreversible state of the character.
  if (permanent) {
    c.permadead = true;
    if (!store.state.permadeadIds.includes(c.id)) store.state.permadeadIds.push(c.id);
  }

  pushHistory(
    store,
    c,
    'death',
    t(
      'progression.died',
      `تُوفّي ${c.firstName} ${c.familyName} — ${cause}.`,
      `${c.firstName} ${c.familyName} died — ${cause}.`,
    ),
  );

  store.emit('character:died', { id: c.id, cause });

  return true;
}

/**
 * Advances every character's age and kills those that outlived their
 * species' natural lifespan.
 */
export function tickAging(store: GameStore): void {
  const totalDays = store.state.calendar.totalDays;

  for (const c of store.allCharacters()) {
    if (!c.alive) continue;

    c.age = ageOf(c, totalDays);

    const limit = lifespanOf(c);
    if (c.age >= limit) {
      const cause = t('progression.oldage', 'الشيخوخة', 'old age');
      if (applyDeath(store, c, cause, false)) {
        store.notify(
          t(
            'progression.oldage.notify',
            `توفّي ${c.firstName} ${c.familyName} عن العمر (${Math.floor(c.age)} عامًا).`,
            `${c.firstName} ${c.familyName} died of old age at ${Math.floor(c.age)} years.`,
          ),
          'info',
        );
        store.chronicle(
          t(
            'progression.oldage.chronicle',
            `مات ${c.firstName} ${c.familyName} شيخًا في السنة ${store.state.calendar.year}.`,
            `${c.firstName} ${c.familyName} died of old age in year ${store.state.calendar.year}.`,
          ),
        );
        store.touch('character:aged');
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

/** Appends a life event using the world clock. */
export function pushHistory(
  store: GameStore,
  c: Character,
  kind: LifeEvent['kind'],
  text: string,
): void {
  c.history.push({
    day: store.state.calendar.totalDays,
    year: store.state.calendar.year,
    text,
    kind,
  });
}
