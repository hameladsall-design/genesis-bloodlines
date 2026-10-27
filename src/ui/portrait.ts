/**
 * Character portraits.
 *
 * Drawn as pixel art on a canvas so the DOM interface does not depend on the
 * Phaser texture manager. The look matches the in-world sprites exactly.
 */

import { lookForRace } from '../phaser/view/sprites';

const cache = new Map<string, string>();

/** Draws a 40x40 portrait for a race and returns it as a data URL. */
export function portraitDataUrl(race: string, dead = false): string {
  const key = `${race}:${dead ? 'd' : 'a'}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const look = lookForRace(race);
  const size = 40;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  // Backdrop.
  px(0, 0, size, size, '#100d13');
  px(1, 1, size - 2, size - 2, '#1e1924');

  const skin = dead ? '#4a4248' : look.skin;
  const hair = dead ? '#3a3238' : look.hair;
  const cloth = dead ? '#2a242a' : look.cloth;

  // Shoulders.
  px(0, 26, size, 14, cloth);
  px(0, 26, size, 2, '#00000033');

  // Neck.
  px(17, 22, 6, 6, skin);

  // Head.
  px(13, 10, 14, 13, skin);

  // Hair.
  px(11, 6, 18, 7, hair);
  px(11, 8, 3, 11, hair);
  px(26, 8, 3, 11, hair);

  // Eyes.
  px(16, 16, 2, 2, dead ? '#2a242a' : '#20161a');
  px(22, 16, 2, 2, dead ? '#2a242a' : '#20161a');

  // Dead characters get closed eyes and a pale wash.
  if (dead) {
    px(15, 17, 4, 1, '#6a626a');
    px(21, 17, 4, 1, '#6a626a');
    ctx.fillStyle = 'rgba(120,110,120,0.18)';
    ctx.fillRect(0, 0, size, size);
  }

  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

/** Creates an <img> element showing a character portrait. */
export function portraitElement(race: string, dead = false, large = false): HTMLImageElement {
  const img = document.createElement('img');
  img.className = large ? 'portrait lg' : 'portrait';
  img.alt = '';
  img.src = portraitDataUrl(race, dead);
  return img;
}
