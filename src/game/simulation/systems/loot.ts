/**
 * Loot resolution.
 *
 * Every reward a battle grants comes from the encounter's `LootEntry` table
 * and is scaled by the difficulty profile's `lootMultiplier`. All rolls use
 * the injected seeded RNG so a given seed always produces the same loot.
 *
 * Combat is one of the main sources of food: encounters list `food` rows and
 * those amounts are multiplied by the difficulty profile.
 */

import type { EncounterDef, ItemId, LootEntry, ResourceBag, ResourceKey } from '../types';
import { createRng, type Rng } from '../rng';
import { ENEMIES } from '../../content/enemies';

export interface LootResult {
  resources: ResourceBag;
  items: ItemId[];
}

/**
 * Rolls a loot table.
 *
 * Each entry is rolled independently:
 *  - `chance` decides whether the entry drops at all,
 *  - a resource entry grants `min..max` units (or `amount` when no range is
 *    given) multiplied by `multiplier`,
 *  - an item entry grants the item id.
 */
export function rollLoot(
  rng: Rng,
  entries: LootEntry[],
  multiplier: number,
): { resources: ResourceBag; items: ItemId[] } {
  const resources: ResourceBag = {};
  const items: ItemId[] = [];
  const mult = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;

  for (const entry of entries ?? []) {
    if (!entry) continue;
    if (entry.chance <= 0) continue;
    if (!rng.chance(entry.chance)) continue;

    if (entry.item) {
      items.push(entry.item);
      continue;
    }
    if (!entry.resource) continue;

    const min = entry.min ?? entry.amount ?? 1;
    const max = entry.max ?? entry.amount ?? min;
    const amount = Math.max(1, Math.round(rng.int(min, max) * mult));
    const key = entry.resource as ResourceKey;
    resources[key] = (resources[key] ?? 0) + amount;
  }

  return { resources, items };
}

/**
 * Total experience an encounter is worth, before the difficulty multiplier.
 * The xp of every enemy is summed, multiplied by how many of them there are.
 */
export function encounterXp(encounter: EncounterDef, enemyXpMultiplier = 1): number {
  let xp = 0;
  for (const group of encounter.enemies) {
    const def = ENEMIES[group.enemyId];
    if (!def) continue;
    xp += def.xp * group.count;
  }
  const mult = Number.isFinite(enemyXpMultiplier) && enemyXpMultiplier > 0 ? enemyXpMultiplier : 1;
  return Math.max(0, Math.round(xp * mult));
}

/**
 * The reward preview of an encounter.
 *
 * The sample is deterministic: the RNG is seeded from the encounter id, so the
 * same encounter always shows the same reward line in the UI. The actual
 * battle roll uses the game RNG through `rollLoot`.
 */
export function encounterRewards(
  encounter: EncounterDef,
  multiplier: number,
): { resources: ResourceBag; items: ItemId[]; xp: number } {
  const previewRng = createRng(`${encounter.id}::preview`);
  const { resources, items } = rollLoot(previewRng, encounter.loot, multiplier);
  return { resources, items, xp: encounterXp(encounter) };
}
