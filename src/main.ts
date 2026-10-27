/**
 * Application entry point.
 *
 * Boots the title screen, then starts the simulation and the renderer once the
 * player commits to a new game or loads a save.
 */

import './styles/main.css';

import { setLanguage, getLanguage } from './i18n';
import { GameEngine } from './game/simulation/engine';
import { GameStore } from './game/simulation/store';
import { createNewGame, DEFAULT_CONFIG } from './game/simulation/systems/newGame';
import { bootstrapWorldEntities } from './game/simulation/engine';
import { setSession, clearSession } from './game/simulation/context';
import { SaveManager } from './game/simulation/save';
import { GameUI } from './ui/GameUI';
import { TitleScreen } from './ui/screens/TitleScreen';
import { Tooltip } from './ui/dom';
import { createPhaserGame, type PhaserGameHandle } from './phaser/createGame';
import type { NewGameConfig } from './game/simulation/types';

const uiRootEl = document.getElementById('ui-root');
const stageEl = document.getElementById('stage');

if (!uiRootEl || !stageEl) {
  throw new Error('GENESIS: BLOODLINES could not find its mount points.');
}

const uiRoot: HTMLElement = uiRootEl;
const stage: HTMLElement = stageEl;

setLanguage(getLanguage());

const saveManager = new SaveManager();

let phaser: PhaserGameHandle | null = null;
let ui: GameUI | null = null;
let title: TitleScreen | null = null;
let activeEngine: GameEngine | null = null;

// A single tooltip instance serves the whole interface.
new Tooltip();

function startFromConfig(config: NewGameConfig): void {
  const state = createNewGame(config);
  const store = new GameStore(state, state.config.seed);
  bootstrapWorldEntities(store);
  const engine = new GameEngine(store, saveManager);
  engine.setSpeed(state.config.timeSpeed);
  beginGame(engine);
}

function showTitle(): void {
  ui?.destroy();
  ui = null;
  activeEngine = null;
  clearSession();

  title = new TitleScreen(uiRoot, {
    onNewGame: (config) => startFromConfig(config),
    onLoadGame: (slot) => {
      const state = saveManager.load(slot);
      if (!state) {
        window.alert('تعذّر تحميل اللعبة المحفوظة.');
        return;
      }
      const store = new GameStore(state, state.config?.seed);
      const engine = new GameEngine(store, saveManager);
      beginGame(engine);
    },
    listSaves: () => saveManager.list(),
  });
}

function beginGame(engine: GameEngine): void {
  title?.destroy();
  title = null;
  activeEngine = engine;
  setSession(engine);

  if (!phaser) {
    phaser = createPhaserGame(stage, engine);
  } else {
    phaser.setEngine(engine);
  }

  ui = new GameUI(uiRoot, engine);

  // The tutorial panel opens automatically on a brand-new dynasty.
  if (!engine.state.tutorialComplete) {
    ui.openPanel('tutorial');
  }

  engine.store.notify(
    'نشأ ملجأٌ في العَرم. اجمع ما يمكنك، ولا تدع الجوع يفتح الأبواب أمام الوحوش.',
    'info',
  );
}

showTitle();

/**
 * A small debug/automation handle. The acceptance harness and the browser QA
 * pass drive the game through this surface.
 */
declare global {
  interface Window {
    GENESIS?: {
      engine(): GameEngine | null;
      ui(): GameUI | null;
      startNewGame(config?: Partial<NewGameConfig>): void;
      loadSlot(slot: number | 'auto'): boolean;
    };
  }
}

window.GENESIS = {
  engine: () => activeEngine,
  ui: () => ui,
  startNewGame: (config) => startFromConfig({ ...DEFAULT_CONFIG, ...config }),
  loadSlot: (slot) => {
    const state = saveManager.load(slot);
    if (!state) return false;
    const store = new GameStore(state, state.config?.seed);
    const engine = new GameEngine(store, saveManager);
    beginGame(engine);
    return true;
  },
};
