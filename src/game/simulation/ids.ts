/**
 * Stable identifier generation.
 *
 * IDs must remain stable across save/load so that a ranked-death, a recruited
 * visitor or a tavern purchase is never resurrected or duplicated by a reload.
 */

let counter = 0;

/** Monotonic, collision-free id with a readable prefix. */
export function newId(prefix: string): string {
  counter += 1;
  const time = Date.now().toString(36);
  const seq = counter.toString(36).padStart(4, '0');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${time}${seq}${rand}`;
}

/**
 * Restores the counter after a load so newly generated ids cannot collide
 * with ids that already exist in the loaded save.
 */
export function primeIdCounter(minimum: number): void {
  if (minimum > counter) counter = minimum;
}

/**
 * Extracts the highest numeric suffix used by ids with the given prefix so the
 * caller can re-prime the generator after loading a save.
 */
export function scanIdCounter(ids: string[], prefix: string): number {
  let max = 0;
  for (const id of ids) {
    if (!id.startsWith(prefix + '_')) continue;
    const tail = id.slice(prefix.length + 1);
    const num = parseInt(tail, 36);
    if (Number.isFinite(num) && num > max) max = num;
  }
  return max;
}
