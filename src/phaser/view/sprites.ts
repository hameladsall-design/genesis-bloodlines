/**
 * Procedural pixel-art asset generation.
 *
 * The game ships no binary art: every sprite is drawn from a pixel grid at
 * boot so the whole project stays text-only and visually consistent. Each
 * asset is registered under a stable manifest key.
 *
 * The palette is deliberately narrow — charcoal, blood red, muted gold,
 * forest green and bruised blue — to keep the dark-fantasy mood unified.
 */

import Phaser from 'phaser';

export interface Palette {
  [char: string]: string;
}

/** Base humanoid, 10 x 14 pixels. */
const HUMANOID: string[] = [
  '....hh....',
  '...hhhh...',
  '..hffffh..',
  '..ff..ff..',
  '..ffffff..',
  '...ffff...',
  '...ssss...',
  '..bbbbbb..',
  '.b.bbbb.b.',
  '..bbbbbb..',
  '..bbbbbb..',
  '...ll.ll..',
  '...ll.ll..',
  '..kkk.kkk.',
];

/** Hunched variant used by dwarfs and orcs. */
const STOCKY: string[] = [
  '..hhhhhh..',
  '.hhhhhhhh.',
  '.hfffffff.',
  '.ff.ff.ff.',
  '.ffffffff.',
  '..ffffff..',
  '..ssssss..',
  '.bbbbbbbb.',
  'bbbbbbbbbb',
  'bbbbbbbbbb',
  '.bbbbbbbb.',
  '..ll..ll..',
  '..ll..ll..',
  '.kkkkkkkk.',
];

const DEAD: string[] = [
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '..........',
  '...bbbb...',
  '..bbbbbb..',
  '..bbbbbb..',
  '..bbbbbb..',
  '...bbbb...',
  '..........',
  '..........',
  '..........',
];

export interface RaceLook {
  skin: string;
  hair: string;
  cloth: string;
  legs: string;
  boots: string;
  body?: 'humanoid' | 'stocky';
}

const RACE_LOOKS: Record<string, RaceLook> = {
  human: { skin: '#c9a184', hair: '#3a2a22', cloth: '#4a5b6b', legs: '#3b3128', boots: '#241c18' },
  elf: { skin: '#e0c8ae', hair: '#d8c070', cloth: '#2f5148', legs: '#2a3a34', boots: '#1d2823' },
  dark_elf: { skin: '#9d8ba8', hair: '#1e1724', cloth: '#3a2340', legs: '#241a28', boots: '#151019' },
  dwarf: { skin: '#c69a7c', hair: '#8a2f22', cloth: '#7a4a22', legs: '#3a2a1e', boots: '#231a12', body: 'stocky' },
  orc: { skin: '#7d9a63', hair: '#241f1c', cloth: '#5a2f28', legs: '#2f2a22', boots: '#1c1815', body: 'stocky' },
  vampire: { skin: '#d6cfd8', hair: '#1a1418', cloth: '#2a1c26', legs: '#1e1620', boots: '#120e14' },
  werewolf: { skin: '#8d8579', hair: '#4a4239', cloth: '#3e3630', legs: '#2c2620', boots: '#1a1613' },
  demon: { skin: '#a03c34', hair: '#2a1016', cloth: '#3a1a1e', legs: '#2a1418', boots: '#180c10' },
  half_demon: { skin: '#b07868', hair: '#2a1418', cloth: '#46303a', legs: '#2c2226', boots: '#191316' },
  angel: { skin: '#e6d8c2', hair: '#e8ddb0', cloth: '#b8a45c', legs: '#6a5f3c', boots: '#4a432c' },
  dragon_blooded: { skin: '#b8907a', hair: '#7a2a22', cloth: '#5c3028', legs: '#3a2620', boots: '#221814' },
  giant: { skin: '#c2a684', hair: '#6a4a2a', cloth: '#4a4030', legs: '#33291e', boots: '#1f1810', body: 'stocky' },
  undead: { skin: '#9aa89a', hair: '#1c201c', cloth: '#2e3a30', legs: '#232a22', boots: '#151a15' },
  spirit: { skin: '#9fc4d8', hair: '#c8e4f0', cloth: '#3a5a70', legs: '#28404f', boots: '#1a2a33' },
  mutant: { skin: '#8fa06a', hair: '#4a3a5a', cloth: '#3a4a3a', legs: '#2c3326', boots: '#1a1e16' },
};

export const DEFAULT_LOOK: RaceLook = RACE_LOOKS.human!;

/** Palette for a given race, falling back to the human palette for hybrids. */
export function lookForRace(race: string): RaceLook {
  if (RACE_LOOKS[race]) return RACE_LOOKS[race]!;
  const prefix = race.startsWith('hybrid_') ? race.slice('hybrid_'.length).split('_')[0] : '';
  return RACE_LOOKS[prefix] ?? DEFAULT_LOOK;
}

/**
 * Draws a pixel grid into a Phaser texture.
 * `palette` maps the grid characters to colours; '.' is transparent.
 */
export function drawPixelGrid(
  scene: Phaser.Scene,
  key: string,
  grid: string[],
  palette: Palette,
  pixelSize = 2,
): void {
  const cols = grid[0]?.length ?? 0;
  const rows = grid.length;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let y = 0; y < rows; y++) {
    const line = grid[y]!;
    for (let x = 0; x < cols; x++) {
      const ch = line[x];
      if (!ch || ch === '.' || ch === ' ') continue;
      const color = palette[ch];
      if (!color) continue;
      g.fillStyle(Phaser.Display.Color.HexStringToColor(color).color, 1);
      g.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
    }
  }
  g.generateTexture(key, cols * pixelSize, rows * pixelSize);
  g.destroy();
}

/** Builds the palette for a character sprite. */
export function characterPalette(look: RaceLook, dead = false): Palette {
  if (dead) {
    return { h: '#3a3238', f: '#4a4248', s: '#3a3238', b: '#2a242a', l: '#241f24', k: '#1a161a' };
  }
  return { h: look.hair, f: look.skin, s: look.skin, b: look.cloth, l: look.legs, k: look.boots };
}

/** Registers every character sprite variant used in the world. */
export function buildCharacterTextures(scene: Phaser.Scene, races: string[]): void {
  for (const race of races) {
    const look = lookForRace(race);
    const grid = look.body === 'stocky' ? STOCKY : HUMANOID;
    drawPixelGrid(scene, `char_${race}`, grid, characterPalette(look), 2);
  }
  drawPixelGrid(scene, 'char_dead', DEAD, characterPalette(DEFAULT_LOOK, true), 2);
}

/**
 * Builds a house-like building sprite: roof, walls, door and a warm window.
 */
export function buildBuildingTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  roof: string,
  wall: string,
  glow: string,
): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const w = width * 16;
  const h = height * 16;

  // Shadow.
  g.fillStyle(0x000000, 0.28);
  g.fillRect(4, 8, w - 8, h - 6);

  // Walls.
  g.fillStyle(Phaser.Display.Color.HexStringToColor(wall).color, 1);
  g.fillRect(4, 10, w - 8, h - 12);

  // Wall shading on the lower third.
  g.fillStyle(Phaser.Display.Color.HexStringToColor(wall).color, 0.45);
  g.fillRect(4, h - 22, w - 8, 12);

  // Roof (triangular, stepped for a pixel look).
  g.fillStyle(Phaser.Display.Color.HexStringToColor(roof).color, 1);
  const steps = 7;
  for (let i = 0; i < steps; i++) {
    const inset = Math.floor(((steps - i) / steps) * ((w - 12) / 2));
    g.fillRect(6 + inset, 2 + i * 2, w - 12 - inset * 2, 2);
  }

  // Roof highlight.
  g.fillStyle(0xffffff, 0.08);
  g.fillRect(6 + Math.floor((w - 12) / 4), 3, w - 12 - Math.floor((w - 12) / 2), 2);

  // Door.
  g.fillStyle(0x1a1014, 1);
  g.fillRect(Math.floor(w / 2) - 4, h - 18, 8, 12);

  // Window with lamplight.
  g.fillStyle(Phaser.Display.Color.HexStringToColor(glow).color, 1);
  g.fillRect(Math.floor(w / 2) - 14, h - 24, 6, 6);
  g.fillRect(Math.floor(w / 2) + 8, h - 24, 6, 6);
  g.fillStyle(0x000000, 0.5);
  g.fillRect(Math.floor(w / 2) - 14, h - 21, 6, 1);
  g.fillRect(Math.floor(w / 2) + 8, h - 21, 6, 1);

  g.generateTexture(key, w, h);
  g.destroy();
}

/** Builds a tree sprite with a canopy and a trunk. */
export function buildTreeTexture(scene: Phaser.Scene, key: string, canopy: string, trunk: string): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(Phaser.Display.Color.HexStringToColor(trunk).color, 1);
  g.fillRect(14, 22, 6, 14);
  g.fillStyle(Phaser.Display.Color.HexStringToColor(canopy).color, 1);
  g.fillRect(6, 6, 22, 18);
  g.fillRect(9, 2, 16, 4);
  g.fillRect(2, 10, 4, 10);
  g.fillRect(28, 10, 4, 10);
  g.fillStyle(0xffffff, 0.07);
  g.fillRect(9, 5, 10, 4);
  g.generateTexture(key, 32, 36);
  g.destroy();
}

/** Builds a rock or ore sprite. */
export function buildRockTexture(scene: Phaser.Scene, key: string, base: string, accent: string): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(Phaser.Display.Color.HexStringToColor(base).color, 1);
  g.fillRect(4, 10, 24, 14);
  g.fillRect(8, 6, 16, 6);
  g.fillRect(2, 14, 4, 6);
  g.fillRect(26, 14, 4, 6);
  g.fillStyle(Phaser.Display.Color.HexStringToColor(accent).color, 1);
  g.fillRect(10, 12, 4, 3);
  g.fillRect(18, 16, 3, 3);
  g.fillStyle(0xffffff, 0.1);
  g.fillRect(9, 7, 7, 3);
  g.generateTexture(key, 32, 28);
  g.destroy();
}

/** Builds a herb/bush sprite. */
export function buildBushTexture(scene: Phaser.Scene, key: string, leaf: string, accent: string): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(Phaser.Display.Color.HexStringToColor(leaf).color, 1);
  g.fillRect(6, 12, 20, 12);
  g.fillRect(9, 8, 14, 5);
  g.fillStyle(Phaser.Display.Color.HexStringToColor(accent).color, 1);
  g.fillRect(11, 10, 3, 3);
  g.fillRect(18, 15, 3, 3);
  g.fillRect(8, 17, 2, 2);
  g.generateTexture(key, 32, 28);
  g.destroy();
}

/** Builds a water pool sprite. */
export function buildWaterTexture(scene: Phaser.Scene, key: string): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x2a3a52, 1);
  g.fillRect(2, 8, 28, 14);
  g.fillRect(6, 4, 20, 6);
  g.fillStyle(0x3d5a80, 1);
  g.fillRect(6, 8, 20, 3);
  g.fillStyle(0x56709b, 0.6);
  g.fillRect(9, 10, 7, 2);
  g.fillRect(20, 16, 5, 2);
  g.generateTexture(key, 32, 28);
  g.destroy();
}

/**
 * Builds the ground texture used by the world tile sprite.
 * Dark forest floor with subtle variation and scattered debris.
 */
export function buildGroundTexture(scene: Phaser.Scene, key: string, size = 256): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x1d2117, 1);
  g.fillRect(0, 0, size, size);

  const rng = new Phaser.Math.RandomDataGenerator(['genesis-ground']);
  for (let i = 0; i < size * 3; i++) {
    const x = rng.between(0, size - 1);
    const y = rng.between(0, size - 1);
    const shade = rng.between(0, 4);
    const colors = [0x232819, 0x272c1d, 0x1a1e14, 0x2c3122, 0x2f3424];
    g.fillStyle(colors[shade]!, 0.8);
    g.fillRect(x, y, rng.between(1, 3), 1);
  }
  // Sparse grass tufts and pebbles.
  for (let i = 0; i < size / 5; i++) {
    const x = rng.between(0, size - 1);
    const y = rng.between(0, size - 1);
    g.fillStyle(0x39422a, 0.45);
    g.fillRect(x, y, 2, 1);
  }
  for (let i = 0; i < size / 14; i++) {
    const x = rng.between(0, size - 1);
    const y = rng.between(0, size - 1);
    g.fillStyle(0x4a4a42, 0.35);
    g.fillRect(x, y, 1, 1);
  }
  g.generateTexture(key, size, size);
  g.destroy();
}

/** Builds the exclamation mark shown above a visitor. */
export function buildExclamationTexture(scene: Phaser.Scene, key: string): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x12080a, 1);
  g.fillRect(4, 0, 8, 16);
  g.fillStyle(0xe8c34a, 1);
  g.fillRect(5, 1, 6, 14);
  g.fillStyle(0x12080a, 1);
  g.fillRect(7, 3, 2, 8);
  g.fillRect(7, 13, 2, 2);
  g.generateTexture(key, 16, 16);
  g.destroy();
}

/** Builds a small portrait frame for the character cards. */
export function buildPortraitTexture(scene: Phaser.Scene, key: string, race: string): void {
  const look = lookForRace(race);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x100d13, 1);
  g.fillRect(0, 0, 40, 40);
  g.fillStyle(0x1e1924, 1);
  g.fillRect(1, 1, 38, 38);
  g.fillStyle(Phaser.Display.Color.HexStringToColor(look.cloth).color, 1);
  g.fillRect(0, 26, 40, 14);
  g.fillStyle(Phaser.Display.Color.HexStringToColor(look.skin).color, 1);
  g.fillRect(14, 10, 12, 13);
  g.fillStyle(Phaser.Display.Color.HexStringToColor(look.hair).color, 1);
  g.fillRect(12, 6, 16, 7);
  g.fillRect(12, 10, 3, 9);
  g.fillRect(25, 10, 3, 9);
  g.fillStyle(0x20161a, 1);
  g.fillRect(17, 16, 2, 2);
  g.fillRect(22, 16, 2, 2);
  g.generateTexture(key, 40, 40);
  g.destroy();
}
