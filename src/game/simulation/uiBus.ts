/**
 * A tiny event bus between the world renderer and the DOM interface.
 *
 * The Phaser scene must be able to ask the interface to open a panel, and the
 * interface must be able to move the camera. Neither may depend on the other
 * directly, so they talk through this bus.
 */

export type UiBusEvents = {
  'open-panel': { panelId: string; payload?: unknown };
  'notify': { text: string; kind: 'info' | 'warn' | 'danger' };
  'focus-character': { id: string };
  'focus-node': { id: string };
  'focus-visitor': { id: string };
  'open-character': { id: string };
  'open-visitor': { id: string };
};

type Handler<T> = (payload: T) => void;

class UiBus {
  private listeners = new Map<string, Set<(payload: unknown) => void>>();

  on<K extends keyof UiBusEvents>(event: K, handler: Handler<UiBusEvents[K]>): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler as (payload: unknown) => void);
    this.listeners.set(event, set);
    return () => set.delete(handler as (payload: unknown) => void);
  }

  emit<K extends keyof UiBusEvents>(event: K, payload: UiBusEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[uiBus] handler failed for "${event}"`, err);
      }
    }
  }
}

export const uiBus = new UiBus();
