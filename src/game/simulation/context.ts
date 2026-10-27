/**
 * The active game session.
 *
 * A single module-level holder lets the Phaser scene, the DOM UI and the
 * simulation systems reach the current engine without threading it through
 * every constructor. It is always set together with the engine.
 */

import type { GameEngine } from './engine';
import type { GameStore } from './store';

export const session: {
  engine: GameEngine | null;
  store: GameStore | null;
} = {
  engine: null,
  store: null,
};

export function setSession(engine: GameEngine): void {
  session.engine = engine;
  session.store = engine.store;
}

export function clearSession(): void {
  session.engine = null;
  session.store = null;
}

/** Throws when no game is running — used to catch wiring mistakes early. */
export function requireEngine(): GameEngine {
  if (!session.engine) throw new Error('No active game session');
  return session.engine;
}
