/**
 * Persistence layer.
 *
 * v1 uses localStorage behind a small repository interface so the project can
 * move to a database later without touching the systems that call it.
 *
 * Guarantees required by the spec:
 *  - A ranked-combat casualty stays dead after a reload.
 *  - A recruited visitor never re-appears as an active visitor.
 *  - A tavern purchase can never be paid for twice.
 */

import { primeIdCounter, scanIdCounter } from './ids';
import type { GameState, Id } from './types';

export const SAVE_VERSION = 1;
export const SAVE_PREFIX = 'genesis-bloodlines:save:';
export const AUTOSAVE_KEY = 'genesis-bloodlines:autosave';

export interface SaveSlotMeta {
  slot: number;
  name: string;
  savedAt: number;
  day: number;
  year: number;
  founder: string;
  dynasty: string;
  population: number;
}

export interface SaveEnvelope {
  version: number;
  savedAt: number;
  state: GameState;
}

export interface SaveRepository {
  read(slot: number | 'auto'): SaveEnvelope | null;
  write(slot: number | 'auto', envelope: SaveEnvelope): boolean;
  list(): SaveSlotMeta[];
  remove(slot: number | 'auto'): boolean;
}

class LocalStorageRepository implements SaveRepository {
  private key(slot: number | 'auto'): string {
    return slot === 'auto' ? AUTOSAVE_KEY : `${SAVE_PREFIX}${slot}`;
  }

  read(slot: number | 'auto'): SaveEnvelope | null {
    try {
      const raw = localStorage.getItem(this.key(slot));
      if (!raw) return null;
      return JSON.parse(raw) as SaveEnvelope;
    } catch (err) {
      console.error('[save] failed to read slot', slot, err);
      return null;
    }
  }

  write(slot: number | 'auto', envelope: SaveEnvelope): boolean {
    try {
      localStorage.setItem(this.key(slot), JSON.stringify(envelope));
      return true;
    } catch (err) {
      console.error('[save] failed to write slot', slot, err);
      return false;
    }
  }

  remove(slot: number | 'auto'): boolean {
    try {
      localStorage.removeItem(this.key(slot));
      return true;
    } catch (err) {
      console.error('[save] failed to remove slot', slot, err);
      return false;
    }
  }

  list(): SaveSlotMeta[] {
    const metas: SaveSlotMeta[] = [];
    const slots: (number | 'auto')[] = ['auto'];
    for (let i = 1; i <= 5; i++) slots.push(i);

    for (const slot of slots) {
      const env = this.read(slot);
      if (!env) continue;
      const state = env.state;
      const founder = Object.values(state.characters ?? {}).find((c) => c.isFounder);
      metas.push({
        slot: slot === 'auto' ? 0 : slot,
        name: slot === 'auto' ? 'حفظ تلقائي' : `الفتحة ${slot}`,
        savedAt: env.savedAt,
        day: state.calendar?.day ?? 1,
        year: state.calendar?.year ?? 1,
        founder: founder ? founder.firstName : '—',
        dynasty: state.config?.dynastyName ?? '—',
        population: Object.values(state.characters ?? {}).filter((c) => c.alive).length,
      });
    }
    return metas;
  }
}

class MemoryRepository implements SaveRepository {
  private data = new Map<string, SaveEnvelope>();

  read(slot: number | 'auto'): SaveEnvelope | null {
    return this.data.get(String(slot)) ?? null;
  }

  write(slot: number | 'auto', envelope: SaveEnvelope): boolean {
    this.data.set(String(slot), envelope);
    return true;
  }

  remove(slot: number | 'auto'): boolean {
    return this.data.delete(String(slot));
  }

  list(): SaveSlotMeta[] {
    const out: SaveSlotMeta[] = [];
    for (const [key, env] of this.data) {
      const founder = Object.values(env.state.characters ?? {}).find((c) => c.isFounder);
      out.push({
        slot: key === 'auto' ? 0 : Number(key),
        name: key === 'auto' ? 'حفظ تلقائي' : `الفتحة ${key}`,
        savedAt: env.savedAt,
        day: env.state.calendar?.day ?? 1,
        year: env.state.calendar?.year ?? 1,
        founder: founder ? founder.firstName : '—',
        dynasty: env.state.config?.dynastyName ?? '—',
        population: Object.values(env.state.characters ?? {}).filter((c) => c.alive).length,
      });
    }
    return out;
  }
}

/** Storage is unavailable in some embedded contexts; fall back to memory. */
function makeRepository(): SaveRepository {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__genesis_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return new LocalStorageRepository();
    }
  } catch {
    /* fall through */
  }
  return new MemoryRepository();
}

export class SaveManager {
  private repo: SaveRepository;

  constructor(repo?: SaveRepository) {
    this.repo = repo ?? makeRepository();
  }

  save(state: GameState, slot: number | 'auto' = 1): boolean {
    try {
      const envelope: SaveEnvelope = {
        version: SAVE_VERSION,
        savedAt: Date.now(),
        state: JSON.parse(JSON.stringify(state)) as GameState,
      };
      return this.repo.write(slot, envelope);
    } catch (err) {
      console.error('[save] serialization failed', err);
      return false;
    }
  }

  load(slot: number | 'auto'): GameState | null {
    const envelope = this.repo.read(slot);
    if (!envelope) return null;
    try {
      const state = migrate(envelope.state);
      // Ensure newly minted ids cannot collide with restored ones.
      const allIds = [
        ...Object.keys(state.characters ?? {}),
        ...(state.tavern ?? []).map((t) => t.id),
        ...(state.visitors ?? []).map((v) => v.id),
        ...Object.keys(state.factions ?? {}),
      ];
      primeIdCounter(scanIdCounter(allIds, 'chr'));
      return state;
    } catch (err) {
      console.error('[save] deserialization failed', err);
      return null;
    }
  }

  list(): SaveSlotMeta[] {
    return this.repo.list();
  }

  remove(slot: number | 'auto'): boolean {
    return this.repo.remove(slot);
  }
}

/**
 * Brings an older save up to the current schema. Unknown future versions are
 * rejected rather than silently misloaded.
 */
export function migrate(state: GameState): GameState {
  const version = state.version ?? 1;
  if (version > SAVE_VERSION) {
    throw new Error(`Save version ${version} is newer than supported version ${SAVE_VERSION}`);
  }
  const next = state as GameState;
  next.version = SAVE_VERSION;
  next.notifications ??= [];
  next.chronicle ??= [];
  next.dynastyRecords ??= [];
  next.permadeadIds ??= [];
  next.recruitedIds ??= [];
  next.tavern ??= [];
  next.visitors ??= [];
  next.quests ??= [];
  next.factions ??= {};
  next.starvationDays ??= 0;
  next.tutorialComplete ??= false;
  next.battle ??= null;
  next.base ??= {
    level: 1,
    capacity: 10,
    buildings: [],
    unrest: 0,
    starvationDays: 0,
    prosperityDays: 0,
    traditions: [],
    titles: [],
  };
  return next;
}

/** True when the given character id is recorded as permanently dead. */
export function isPermadead(state: GameState, id: Id): boolean {
  if (state.permadeadIds?.includes(id)) return true;
  return state.characters?.[id]?.permadead === true;
}
