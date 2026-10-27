/**
 * The world scene.
 *
 * Renders the settlement, the resource nodes and the living characters on a
 * top-down pixel-art map. It is a thin view: it reads simulation state and
 * emits player intents, and never decides gameplay outcomes.
 */

import Phaser from 'phaser';
import type { GameEngine } from '../../game/simulation/engine';
import type { BuildingInstance, Character, ResourceNode, Visitor } from '../../game/simulation/types';
import { uiBus } from '../../game/simulation/uiBus';
import { buildCharacterTextures, buildExclamationTexture, buildGroundTexture, buildBushTexture, buildBuildingTexture, buildPortraitTexture, buildRockTexture, buildTreeTexture, buildWaterTexture } from '../view/sprites';

const BASE_TILE = 16;
export class WorldScene extends Phaser.Scene {
  private engine!: GameEngine;
  private ground!: Phaser.GameObjects.TileSprite;
  private basePlate!: Phaser.GameObjects.Graphics;
  private darkness!: Phaser.GameObjects.Rectangle;
  private weatherLayer!: Phaser.GameObjects.Graphics;
  private characterSprites = new Map<string, Phaser.GameObjects.Container>();
  private visitorSprites = new Map<string, Phaser.GameObjects.Container>();
  private buildingSprites = new Map<string, Phaser.GameObjects.Image>();
  private nodeSprites = new Map<string, Phaser.GameObjects.Image>();
  private builtTextures = new Set<string>();
  private extent = 1200;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastStateRevision = -1;
  private weatherPhase = 0;

  constructor() {
    super('world');
  }

  init(data: { engine: GameEngine }): void {
    this.engine = data.engine;
  }

  create(): void {
    this.extent = 1200;
    this.buildTextures();

    this.ground = this.add.tileSprite(0, 0, this.extent, this.extent, 'ground').setOrigin(0);

    this.basePlate = this.add.graphics();

    this.weatherLayer = this.add.graphics().setScrollFactor(0).setDepth(900);

    this.darkness = this.add
      .rectangle(0, 0, this.cameras.main.width, this.cameras.main.height, 0x0a0a1a)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(950);

    this.cameras.main.setBounds(0, 0, this.extent, this.extent);
    this.cameras.main.setZoom(1.6);

    const kb = this.input.keyboard;
    if (kb) {
      this.cursors = kb.createCursorKeys();
      this.keys = kb.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    }

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const next = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.55, 3.2);
      cam.setZoom(next);
    });

    // Drag to pan.
    let dragging = false;
    let dragX = 0;
    let dragY = 0;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      dragging = true;
      dragX = pointer.x;
      dragY = pointer.y;
    });
    this.input.on('pointerup', () => {
      dragging = false;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!dragging) return;
      const cam = this.cameras.main;
      cam.scrollX -= (pointer.x - dragX) / cam.zoom;
      cam.scrollY -= (pointer.y - dragY) / cam.zoom;
      dragX = pointer.x;
      dragY = pointer.y;
    });

    // A click (as opposed to a drag) selects a world entity.
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (Math.abs(pointer.x - pointer.downX) > 6 || Math.abs(pointer.y - pointer.downY) > 6) return;
      this.handleWorldClick(pointer);
    });

    this.engine.store.on('state:changed', () => {
      this.syncWorld();
    });
    this.engine.onDayComplete = () => this.syncWorld();

    this.syncWorld(true);

    // Frame the settlement.
    this.cameras.main.centerOn(this.engine.state.world.baseX, this.engine.state.world.baseY);

    this.events.on('shutdown', () => {
      this.engine.onDayComplete = undefined;
    });
  }

  /** Registers every procedural texture exactly once. */
  private buildTextures(): void {
    if (this.builtTextures.has('ground')) return;
    this.builtTextures.add('ground');

    buildGroundTexture(this, 'ground');
    buildTreeTexture(this, 'node_wood', '#2f4a2c', '#3b2b1d');
    buildRockTexture(this, 'node_stone', '#54514c', '#7c776e');
    buildRockTexture(this, 'node_iron', '#4a4b52', '#8d8f9c');
    buildRockTexture(this, 'node_crystal', '#4a3f66', '#9a7fe0');
    buildBushTexture(this, 'node_food', '#3c5230', '#8a9a3a');
    buildBushTexture(this, 'node_herbs', '#3a5a44', '#7ac08a');
    buildBushTexture(this, 'node_leather', '#4a4030', '#8a6a40');
    buildBushTexture(this, 'node_bone', '#4a4a44', '#c8c4b4');
    buildBushTexture(this, 'node_essence', '#3c3450', '#b08ae0');
    buildWaterTexture(this, 'node_water');
    buildExclamationTexture(this, 'exclamation');

    const species = this.engine?.store?.state ? Object.keys(SPECIES_IDS_CACHE) : [];
    buildCharacterTextures(this, species.length ? species : ['human']);
  }

  /** Rebuilds the world from simulation state. */
  syncWorld(initial = false): void {
    const state = this.engine.state;
    if (!initial && this.lastStateRevision === this.engine.store.revision) return;
    this.lastStateRevision = this.engine.store.revision;

    this.extent = state.world.size === 'large' ? 2000 : state.world.size === 'small' ? 900 : 1400;
    this.ground.setSize(this.extent, this.extent);
    this.cameras.main.setBounds(0, 0, this.extent, this.extent);

    this.drawBasePlate();
    this.syncBuildings();
    this.syncNodes();
    this.syncCharacters();
    this.syncVisitors();
  }

  /** Draws the settlement ground and its stone courtyard. */
  private drawBasePlate(): void {
    const state = this.engine.state;
    const g = this.basePlate;
    g.clear();

    const bx = state.world.baseX;
    const by = state.world.baseY;
    const area = this.baseArea();
    const w = area.w * BASE_TILE;
    const h = area.h * BASE_TILE;
    const left = bx - w / 2;
    const top = by - h / 2;

    // Packed earth ground of the settlement.
    g.fillStyle(0x2a2a20, 0.9);
    g.fillRect(left, top, w, h);

    // Cobblestone courtyard.
    g.fillStyle(0x3a382f, 0.95);
    g.fillRect(left + 18, top + 18, w - 36, h - 36);
    const rng = new Phaser.Math.RandomDataGenerator(['cobble']);
    for (let i = 0; i < 260; i++) {
      const x = left + 20 + rng.between(0, w - 44);
      const y = top + 20 + rng.between(0, h - 44);
      const tone = rng.between(0, 2);
      g.fillStyle([0x46443a, 0x504d42, 0x3c3a32][tone]!, 0.75);
      g.fillRect(x, y, 4, 3);
    }

    // Main stone street through the settlement.
    g.fillStyle(0x4a473d, 1);
    g.fillRect(left + 10, by - 15, w - 20, 30);
    g.fillStyle(0x575349, 0.6);
    for (let i = 0; i < Math.floor(w / 16); i++) {
      g.fillRect(left + 12 + i * 16, by - 11, 9, 22);
    }

    // Palisade of sharpened stakes.
    g.lineStyle(3, 0x4a3826, 0.95);
    g.strokeRect(left, top, w, h);
    g.fillStyle(0x5c4630, 0.95);
    const posts = Math.floor(w / 16);
    for (let i = 0; i <= posts; i++) {
      const x = left + i * 16;
      g.fillRect(x - 2, top - 4, 4, 7);
      g.fillRect(x - 2, top + h - 3, 4, 7);
    }
    for (let i = 0; i <= Math.floor(h / 16); i++) {
      const y = top + i * 16;
      g.fillRect(left - 4, y - 2, 7, 4);
      g.fillRect(left + w - 3, y - 2, 7, 4);
    }

    // Hearth glow in the middle of the settlement.
    for (let i = 6; i >= 1; i--) {
      g.fillStyle(0xc8a24a, 0.016);
      g.fillCircle(bx, by, 9 * i);
    }
    g.fillStyle(0xe0b45a, 0.28);
    g.fillCircle(bx, by, 5);
    g.fillStyle(0xffd98a, 0.5);
    g.fillCircle(bx, by, 2);
  }

  private baseArea(): { w: number; h: number } {
    const level = this.engine.state.base.level;
    const sizes = [
      { w: 12, h: 10 }, { w: 14, h: 11 }, { w: 16, h: 12 }, { w: 18, h: 13 },
      { w: 20, h: 14 }, { w: 22, h: 15 }, { w: 24, h: 16 }, { w: 26, h: 17 },
      { w: 28, h: 18 }, { w: 32, h: 20 },
    ];
    return sizes[Math.min(level, sizes.length) - 1] ?? sizes[0]!;
  }

  private syncBuildings(): void {
    const state = this.engine.state;
    const seen = new Set<string>();

    for (const b of state.base.buildings) {
      seen.add(b.id);
      let sprite = this.buildingSprites.get(b.id);
      if (!sprite) {
        const key = this.buildingTextureFor(b);
        if (!this.textures.exists(key)) continue;
        sprite = this.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(50);
        this.buildingSprites.set(b.id, sprite);
      }
      const area = this.baseArea();
      const bx = state.world.baseX;
      const by = state.world.baseY;
      sprite.setPosition(bx + (b.x - area.w / 2) * BASE_TILE, by + (b.y - area.h / 2) * BASE_TILE);
      sprite.setAlpha(b.underConstruction ? 0.55 : 1);
      sprite.setData('buildingId', b.id);
    }

    for (const [id, sprite] of this.buildingSprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.buildingSprites.delete(id);
      }
    }
  }

  private buildingTextureFor(b: BuildingInstance): string {
    const key = `bld_${b.defId}_${b.level}`;
    if (this.textures.exists(key)) return key;
    const palette = BUILDING_PALETTE[b.defId] ?? { roof: '#5a3a30', wall: '#4a4038', glow: '#c8a24a' };
    buildBuildingTexture(this, key, 2, 2, palette.roof, palette.wall, palette.glow);
    return key;
  }

  private syncNodes(): void {
    const state = this.engine.state;
    const seen = new Set<string>();

    for (const node of state.world.resourceNodes) {
      if (node.amount <= 0) continue;
      const key = this.nodeTextureFor(node);
      if (!this.textures.exists(key)) continue;
      seen.add(node.id);
      let sprite = this.nodeSprites.get(node.id);
      if (!sprite) {
        sprite = this.add.image(node.x, node.y, key).setOrigin(0.5, 1).setDepth(10);
        sprite.setData('nodeId', node.id);
        this.nodeSprites.set(node.id, sprite);
      }
      sprite.setPosition(node.x, node.y);
    }

    for (const [id, sprite] of this.nodeSprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.nodeSprites.delete(id);
      }
    }
  }

  private nodeTextureFor(node: ResourceNode): string {
    switch (node.kind) {
      case 'wood': return 'node_wood';
      case 'stone': return 'node_stone';
      case 'iron': return 'node_iron';
      case 'crystal': return 'node_crystal';
      case 'food': return 'node_food';
      case 'herbs': return 'node_herbs';
      case 'leather': return 'node_leather';
      case 'bone': return 'node_bone';
      case 'essence': return 'node_essence';
      case 'water': return 'node_water';
      default: return 'node_stone';
    }
  }

  private syncCharacters(): void {
    const seen = new Set<string>();

    for (const c of this.engine.store.livingCharacters()) {
      seen.add(c.id);
      let container = this.characterSprites.get(c.id);
      if (!container) {
        const created = this.createCharacterContainer(c);
        if (!created) continue;
        container = created;
        this.characterSprites.set(c.id, container);
      }
      container.setPosition(c.x, c.y);
    }

    for (const [id, container] of this.characterSprites) {
      if (!seen.has(id)) {
        container.destroy();
        this.characterSprites.delete(id);
      }
    }
  }

  private createCharacterContainer(c: Character): Phaser.GameObjects.Container | null {
    const key = `char_${c.race}`;
    if (!this.textures.exists(key)) return null;

    const shadow = this.add.ellipse(0, 0, 16, 6, 0x000000, 0.32);
    const body = this.add.image(0, -18, key).setOrigin(0.5, 1);

    const label = this.add
      .text(0, -40, `${c.level}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#c8a24a',
      })
      .setOrigin(0.5, 1)
      .setResolution(2);

    const container = this.add.container(c.x, c.y, [shadow, body, label]);
    container.setDepth(100);
    container.setData('characterId', c.id);

    const nameTag = this.add
      .text(0, -52, c.firstName, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#9a9086',
        backgroundColor: 'rgba(8,7,10,0.55)',
        padding: { x: 2, y: 1 },
      })
      .setOrigin(0.5, 1)
      .setResolution(2);
    container.add(nameTag);

    return container;
  }

  private syncVisitors(): void {
    const state = this.engine.state;
    const seen = new Set<string>();

    for (const visitor of state.visitors) {
      if (visitor.disposition !== 'waiting') continue;
      seen.add(visitor.id);
      let container = this.visitorSprites.get(visitor.id);
      if (!container) {
        const c = visitor.character;
        const key = `char_${c.race}`;
        if (!this.textures.exists(key)) return;
        const shadow = this.add.ellipse(0, 0, 16, 6, 0x000000, 0.32);
        const body = this.add.image(0, -18, key).setOrigin(0.5, 1);
        const mark = this.add.image(0, -58, 'exclamation').setOrigin(0.5, 1);
        container = this.add.container(visitor.x, visitor.y, [shadow, body, mark]);
        container.setDepth(200);
        container.setData('visitorId', visitor.id);
        this.tweens.add({
          targets: mark,
          y: -64,
          duration: 520,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this.visitorSprites.set(visitor.id, container);
      }
      container.setPosition(visitor.x, visitor.y);
    }

    for (const [id, container] of this.visitorSprites) {
      if (!seen.has(id)) {
        container.destroy();
        this.visitorSprites.delete(id);
      }
    }
  }

  /** Called every frame: camera movement, lighting and weather. */
  override update(_time: number, delta: number): void {
    this.engine?.update(delta);
    this.updateCamera(delta);
    this.updateLighting();
    this.updateWeather(delta);
  }

  private updateCamera(delta: number): void {
    const cam = this.cameras.main;
    const speed = 420 / cam.zoom;
    let dx = 0;
    let dy = 0;
    if (this.cursors?.left.isDown || this.keys?.A?.isDown) dx -= speed;
    if (this.cursors?.right.isDown || this.keys?.D?.isDown) dx += speed;
    if (this.cursors?.up.isDown || this.keys?.W?.isDown) dy -= speed;
    if (this.cursors?.down.isDown || this.keys?.S?.isDown) dy += speed;
    if (dx || dy) {
      cam.scrollX += (dx * delta) / 1000;
      cam.scrollY += (dy * delta) / 1000;
    }
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, this.extent - cam.width / cam.zoom);
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, this.extent - cam.height / cam.zoom);
  }

  private updateLighting(): void {
    const state = this.engine.state;
    const daylight = state.world.daylight ?? 1;
    const darkness = 1 - daylight;
    this.darkness.setAlpha(Phaser.Math.Clamp(darkness * 0.72, 0, 0.78));
    this.darkness.setPosition(this.cameras.main.scrollX * 0 + 0, 0);
    this.darkness.setSize(this.cameras.main.width, this.cameras.main.height);
  }

  private updateWeather(delta: number): void {
    const state = this.engine.state;
    const g = this.weatherLayer;
    g.clear();

    const cam = this.cameras.main;
    const w = cam.width;
    const h = cam.height;

    if (state.weather === 'rain' || state.weather === 'storm') {
      this.weatherPhase += delta * 0.02;
      const count = state.weather === 'storm' ? 150 : 90;
      const rng = new Phaser.Math.RandomDataGenerator(['weather']);
      g.lineStyle(1, state.weather === 'storm' ? 0x9fb6da : 0x6a7d99, state.weather === 'storm' ? 0.5 : 0.32);
      for (let i = 0; i < count; i++) {
        const x = rng.between(0, w);
        const y = (rng.between(0, h) + this.weatherPhase * 8) % h;
        g.lineBetween(x, y, x - 3, y + 11);
      }
    } else if (state.weather === 'snow') {
      this.weatherPhase += delta * 0.004;
      const rng = new Phaser.Math.RandomDataGenerator(['weather']);
      g.fillStyle(0xd8e4f0, 0.55);
      for (let i = 0; i < 110; i++) {
        const x = rng.between(0, w);
        const y = (rng.between(0, h) + this.weatherPhase * (1 + (i % 3))) % h;
        g.fillRect(x, y, 2, 2);
      }
    } else if (state.weather === 'fog') {
      g.fillStyle(0x2a3040, 0.3);
      g.fillRect(0, 0, w, h);
    }
  }

  /** Moves the camera to a world position. */
  focusOn(x: number, y: number): void {
    this.cameras.main.centerOn(x, y);
  }

  /**
   * Resolves a world click into a player intent.
   * Visitors take priority, then characters, then resource nodes.
   */
  private handleWorldClick(pointer: Phaser.Input.Pointer): void {
    const worldX = pointer.worldX;
    const worldY = pointer.worldY;

    for (const [id, container] of this.visitorSprites) {
      if (Math.abs(container.x - worldX) < 18 && Math.abs(container.y - worldY) < 34) {
        uiBus.emit('open-visitor', { id });
        return;
      }
    }

    for (const [id, container] of this.characterSprites) {
      if (Math.abs(container.x - worldX) < 14 && Math.abs(container.y - worldY) < 30) {
        uiBus.emit('open-character', { id });
        return;
      }
    }

    for (const [id, sprite] of this.nodeSprites) {
      if (Math.abs(sprite.x - worldX) < 16 && Math.abs(sprite.y - worldY) < 22) {
        uiBus.emit('open-panel', { panelId: 'resources' });
        uiBus.emit('focus-node', { id });
        return;
      }
    }
  }

  /** Creates a portrait texture for a character and returns its key. */
  portraitKey(race: string): string {
    const key = `portrait_${race}`;
    if (!this.textures.exists(key)) buildPortraitTexture(this, key, race);
    return key;
  }
}

/** Building colour palettes keyed by building id. */
export const BUILDING_PALETTE: Record<string, { roof: string; wall: string; glow: string }> = {
  house: { roof: '#5a3a30', wall: '#4a4038', glow: '#c8a24a' },
  shelter: { roof: '#4a4030', wall: '#3e362c', glow: '#a87a3a' },
  camp: { roof: '#54402c', wall: '#443a2c', glow: '#c8a24a' },
  farm: { roof: '#6a4a26', wall: '#4a3a26', glow: '#9ab04a' },
  granary: { roof: '#7a5a2a', wall: '#574526', glow: '#c8a24a' },
  storage: { roof: '#4a4038', wall: '#3c352e', glow: '#9a8a6a' },
  workshop: { roof: '#4a3428', wall: '#453830', glow: '#d08a3a' },
  blacksmith: { roof: '#3a2a24', wall: '#332822', glow: '#e07a2a' },
  tavern: { roof: '#6a3a2a', wall: '#503828', glow: '#e0a24a' },
  barracks: { roof: '#4a3a3a', wall: '#3c3030', glow: '#c04a3a' },
  tower: { roof: '#3a3a46', wall: '#343440', glow: '#8ab0d8' },
  wall: { roof: '#3a3833', wall: '#302e2a', glow: '#8a8070' },
  market: { roof: '#7a4a4a', wall: '#54403a', glow: '#d0b04a' },
  temple: { roof: '#5a4a6a', wall: '#463a52', glow: '#e8dcb0' },
  hospital: { roof: '#5a5a6a', wall: '#46464f', glow: '#e0e0e0' },
  library: { roof: '#3a4a5a', wall: '#2e3c48', glow: '#c8b070' },
  castle: { roof: '#3a3446', wall: '#2e2a38', glow: '#c8a24a' },
};

/** Species ids available for sprite generation. */
export const SPECIES_IDS_CACHE: Record<string, true> = {
  human: true, elf: true, dark_elf: true, dwarf: true, orc: true, vampire: true,
  werewolf: true, demon: true, half_demon: true, angel: true, dragon_blooded: true,
  giant: true, undead: true, spirit: true, mutant: true,
};

export type { Visitor };
