/**
 * Phaser bootstrap.
 *
 * Creates the renderer and keeps it in sync with the active simulation.
 */

import Phaser from 'phaser';
import type { GameEngine } from '../game/simulation/engine';
import { WorldScene } from './scenes/WorldScene';

export interface PhaserGameHandle {
  game: Phaser.Game;
  scene(): WorldScene | null;
  setEngine(engine: GameEngine): void;
}

export function createPhaserGame(container: HTMLElement, engine: GameEngine): PhaserGameHandle {
  const scene = new WorldScene();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    backgroundColor: '#08070a',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: container.clientWidth || 1280,
      height: container.clientHeight || 720,
    },
    render: {
      powerPreference: 'high-performance',
    },
    scene: [],
    callbacks: {
      postBoot: (g) => {
        g.scene.add('world', scene, true, { engine });
      },
    },
  });

  return {
    game,
    scene: () => (game.scene.getScene('world') as WorldScene | null) ?? null,
    setEngine: (next: GameEngine) => {
      const world = game.scene.getScene('world') as WorldScene | null;
      if (!world) {
        game.scene.add('world', scene, true, { engine: next });
        return;
      }
      world.scene.restart({ engine: next });
    },
  };
}
