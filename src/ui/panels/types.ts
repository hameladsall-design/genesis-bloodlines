/**
 * The panel contract.
 *
 * Every panel is a self-contained module that renders into a container and
 * talks to the simulation only through the context below. Panels never touch
 * Phaser and never hold their own copy of game state.
 */

import type { GameEngine } from '../../game/simulation/engine';
import type { GameStore } from '../../game/simulation/store';
import type { GameState } from '../../game/simulation/types';
import type { Lang } from '../../i18n';

export interface PanelContext {
  engine: GameEngine;
  store: GameStore;
  state: GameState;
  lang: Lang;
  /** Re-renders the currently open panel from scratch. */
  refresh(): void;
  /** Closes the currently open panel. */
  close(): void;
  /** Pushes a toast notification. */
  notify(text: string, kind?: 'info' | 'warn' | 'danger'): void;
  /** Opens another panel by id, optionally with a payload. */
  open(panelId: string, payload?: unknown): void;
  /** The payload the panel was opened with, if any. */
  readonly payload: unknown;
}

export interface PanelDef {
  id: string;
  titleAr: string;
  titleEn: string;
  /** Small glyph or emoji shown on the launcher tab. */
  icon: string;
  /** Sort order in the launcher bar. */
  order: number;
  /** 'normal' | 'wide' | 'xwide' panel width. */
  size?: 'normal' | 'wide' | 'xwide';
  /** When true the panel cannot be closed by clicking outside. */
  modal?: boolean;
  render(root: HTMLElement, ctx: PanelContext): void;
}

/** The registry every panel module registers itself into. */
export const panelRegistry = new Map<string, PanelDef>();

export function registerPanel(panel: PanelDef): void {
  panelRegistry.set(panel.id, panel);
}

export function getPanel(id: string): PanelDef | undefined {
  return panelRegistry.get(id);
}

export function sortedPanels(): PanelDef[] {
  return [...panelRegistry.values()].sort((a, b) => a.order - b.order);
}
