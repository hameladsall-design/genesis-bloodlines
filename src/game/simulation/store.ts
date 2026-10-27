/**
 * The single source of truth for game state.
 *
 * Phaser scenes, DOM panels and every simulation system read from here and
 * mutate through explicit actions. Nothing important is ever stored only in a
 * sprite, a DOM node or a tween.
 */

import { createRng, type Rng } from './rng';
import { newId } from './ids';
import type {
  Character,
  GameEventMap,
  GameState,
  Id,
  Notification,
  ResourceBag,
  ResourceKey,
} from './types';

export type EventName = keyof GameEventMap;
type Handler<T> = (payload: T) => void;

export class GameStore {
  state: GameState;
  rng: Rng;
  private listeners = new Map<string, Set<(payload: unknown) => void>>();
  /** Bumped whenever state mutates so the view layer can re-render cheaply. */
  revision = 0;

  constructor(state: GameState, seed?: string) {
    this.state = state;
    this.rng = createRng(seed ?? state.config?.seed ?? 'genesis');
  }

  /* ---------------- events ---------------- */

  on<T extends EventName>(event: T, handler: Handler<GameEventMap[T]>): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler as (payload: unknown) => void);
    this.listeners.set(event, set);
    return () => set.delete(handler as (payload: unknown) => void);
  }

  emit<T extends EventName>(event: T, payload: GameEventMap[T]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[store] listener failed for "${event}"`, err);
      }
    }
  }

  touch(reason: string): void {
    this.revision += 1;
    this.emit('state:changed', { reason });
  }

  /* ---------------- notifications ---------------- */

  notify(text: string, kind: Notification['kind'] = 'info'): Id {
    const id = newId('ntf');
    this.state.notifications.push({ id, text, kind, day: this.state.calendar.totalDays });
    if (this.state.notifications.length > 100) this.state.notifications.shift();
    this.emit('notification', { id, text, kind });
    return id;
  }

  dismissNotification(id: Id): void {
    const idx = this.state.notifications.findIndex((n) => n.id === id);
    if (idx >= 0) this.state.notifications.splice(idx, 1);
    this.touch('notification:dismiss');
  }

  chronicle(text: string): void {
    this.state.chronicle.push({
      day: this.state.calendar.totalDays,
      year: this.state.calendar.year,
      text,
    });
    if (this.state.chronicle.length > 200) this.state.chronicle.shift();
  }

  /* ---------------- characters ---------------- */

  getCharacter(id: Id): Character | undefined {
    return this.state.characters[id];
  }

  addCharacter(character: Character): Character {
    this.state.characters[character.id] = character;
    if (!this.state.characterOrder.includes(character.id)) {
      this.state.characterOrder.push(character.id);
    }
    this.emit('character:created', { id: character.id });
    return character;
  }

  livingCharacters(): Character[] {
    const out: Character[] = [];
    for (const id of this.state.characterOrder) {
      const c = this.state.characters[id];
      if (c && c.alive) out.push(c);
    }
    return out;
  }

  livingCount(): number {
    return this.livingCharacters().length;
  }

  /** All characters including the dead, in insertion order. */
  allCharacters(): Character[] {
    const out: Character[] = [];
    for (const id of this.state.characterOrder) {
      const c = this.state.characters[id];
      if (c) out.push(c);
    }
    return out;
  }

  /** Family bloodline only (founders and descendants). */
  familyMembers(): Character[] {
    return this.allCharacters().filter((c) => c.household === 'family');
  }

  /* ---------------- resources ---------------- */

  getResource(key: ResourceKey): number {
    return this.state.resources[key] ?? 0;
  }

  addResource(key: ResourceKey, amount: number): void {
    if (amount === 0) return;
    const current = this.getResource(key);
    this.state.resources[key] = Math.max(0, current + amount);
    this.emit('resource:changed', { resource: key, delta: amount });
  }

  addResources(bag: ResourceBag): void {
    for (const [key, amount] of Object.entries(bag)) {
      if (amount) this.addResource(key as ResourceKey, amount);
    }
  }

  hasResources(bag: ResourceBag): boolean {
    return Object.entries(bag).every(([key, amount]) => this.getResource(key as ResourceKey) >= (amount ?? 0));
  }

  /** Lists the resources the player is missing for the given cost. */
  missingResources(bag: ResourceBag): ResourceBag {
    const missing: ResourceBag = {};
    for (const [key, amount] of Object.entries(bag)) {
      const need = amount ?? 0;
      const have = this.getResource(key as ResourceKey);
      if (have < need) missing[key as ResourceKey] = need - have;
    }
    return missing;
  }

  /** Spends resources atomically: all-or-nothing. Returns false if it failed. */
  spendResources(bag: ResourceBag): boolean {
    if (!this.hasResources(bag)) return false;
    for (const [key, amount] of Object.entries(bag)) {
      if (amount) this.addResource(key as ResourceKey, -amount);
    }
    return true;
  }

  /** Total food consumed per in-game day: 1 unit per living character. */
  dailyFoodConsumption(): number {
    return this.livingCount();
  }

  /** How many days the current food supply lasts at the current consumption. */
  daysOfFoodLeft(): number {
    const daily = this.dailyFoodConsumption();
    if (daily <= 0) return Infinity;
    return this.getResource('food') / daily;
  }
}

export function createStore(state: GameState, seed?: string): GameStore {
  return new GameStore(state, seed);
}
