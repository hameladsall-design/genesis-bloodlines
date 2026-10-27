/**
 * World generation.
 *
 * Builds the resource nodes, unlocked zones and the spatial layout the
 * settlement is anchored in. Everything is derived from the world seed so the
 * same seed always produces the same world.
 */

import type { Rng } from '../rng';
import type {
  GameState,
  Id,
  ResourceKey,
  ResourceNode,
  WorldState,
  ZoneId,
} from '../types';
import { newId } from '../ids';
import { createCalendar } from '../calendar';

export interface WorldSizeProfile {
  /** World extent in tiles. */
  extent: number;
  /** Number of resource nodes generated. */
  nodes: number;
  /** Number of zones. */
  zones: number;
}

export const WORLD_SIZES: Record<'small' | 'medium' | 'large', WorldSizeProfile> = {
  small: { extent: 900, nodes: 90, zones: 4 },
  medium: { extent: 1400, nodes: 150, zones: 6 },
  large: { extent: 2000, nodes: 240, zones: 9 },
};

/** Resource kinds and how much a single node holds. */
const NODE_TABLE: { kind: ResourceKey; weight: number; amount: [number, number]; hardness: number }[] = [
  { kind: 'wood', weight: 26, amount: [40, 120], hardness: 1 },
  { kind: 'stone', weight: 20, amount: [30, 90], hardness: 1 },
  { kind: 'iron', weight: 8, amount: [12, 40], hardness: 3 },
  { kind: 'food', weight: 14, amount: [10, 35], hardness: 1 },
  { kind: 'herbs', weight: 10, amount: [6, 20], hardness: 1 },
  { kind: 'leather', weight: 8, amount: [8, 25], hardness: 2 },
  { kind: 'bone', weight: 6, amount: [6, 18], hardness: 2 },
  { kind: 'essence', weight: 4, amount: [3, 10], hardness: 4 },
  { kind: 'crystal', weight: 3, amount: [2, 8], hardness: 5 },
  { kind: 'water', weight: 6, amount: [20, 60], hardness: 1 },
];

export function generateWorld(rng: Rng, size: 'small' | 'medium' | 'large'): WorldState {
  const profile = WORLD_SIZES[size];
  const extent = profile.extent;

  const nodes: ResourceNode[] = [];
  for (let i = 0; i < profile.nodes; i++) {
    const entry = rng.weighted(
      NODE_TABLE,
      NODE_TABLE.map((n) => n.weight),
    );
    const amount = rng.int(entry.amount[0], entry.amount[1]);
    nodes.push({
      id: newId('node'),
      kind: entry.kind,
      x: rng.int(40, extent),
      y: rng.int(40, extent),
      zone: 'wilds',
      amount,
      maxAmount: amount,
      regrowIn: 0,
      hardness: entry.hardness,
    });
  }

  const baseX = Math.round(extent / 2);
  const baseY = Math.round(extent / 2);

  // Push nodes away from the settlement so the player must walk for resources.
  for (const node of nodes) {
    const dx = node.x - baseX;
    const dy = node.y - baseY;
    const dist = Math.hypot(dx, dy);
    const minDist = 120;
    if (dist < minDist && dist > 0) {
      const scale = minDist / dist;
      node.x = Math.round(baseX + dx * scale);
      node.y = Math.round(baseY + dy * scale);
    }
  }

  return {
    seed: rng.next().toFixed(0),
    size,
    calendar: createCalendar(),
    weather: 'clear',
    daylight: 1,
    resources: {},
    resourceNodes: nodes,
    baseX,
    baseY,
    unlockedZones: ['wilds'],
  };
}

export const ZONE_IDS: ZoneId[] = [
  'wilds',
  'forest',
  'ruins',
  'city',
  'dungeon',
  'haunted',
  'mountains',
  'swamp',
  'portal',
];

export function generateResourceNodes(
  rng: Rng,
  size: 'small' | 'medium' | 'large',
  abundance: 'scarce' | 'normal' | 'abundant',
): ResourceNode[] {
  const profile = WORLD_SIZES[size];
  const scale = abundance === 'scarce' ? 0.6 : abundance === 'abundant' ? 1.5 : 1;
  const count = Math.max(20, Math.round(profile.nodes * scale));
  const extent = profile.extent;
  const nodes: ResourceNode[] = [];

  for (let i = 0; i < count; i++) {
    const entry = rng.weighted(
      NODE_TABLE,
      NODE_TABLE.map((n) => n.weight),
    );
    const amount = Math.round(rng.int(entry.amount[0], entry.amount[1]) * scale);
    const zone = rng.pick(ZONE_IDS);
    nodes.push({
      id: newId('node'),
      kind: entry.kind,
      x: rng.int(20, extent),
      y: rng.int(20, extent),
      zone,
      amount,
      maxAmount: amount,
      regrowIn: 0,
      hardness: entry.hardness,
    });
  }
  return nodes;
}

/** Distance between two world points. */
export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Background simulation resolution.
 *
 * Characters far from the settlement are simulated at a reduced detail so the
 * game stays responsive with thousands of records.
 */
export type SimulationDetail = 'full' | 'reduced' | 'dormant';

export function simulationDetailFor(
  state: GameState,
  character: { x: number; y: number },
  viewRadius = 420,
): SimulationDetail {
  const dx = character.x - state.world.baseX;
  const dy = character.y - state.world.baseY;
  const dist = Math.hypot(dx, dy);
  if (dist <= viewRadius) return 'full';
  if (dist <= viewRadius * 3) return 'reduced';
  return 'dormant';
}

export function nearestNode(state: GameState, x: number, y: number, maxDist = 260): ResourceNode | undefined {
  let best: ResourceNode | undefined;
  let bestDist = maxDist;
  for (const node of state.world.resourceNodes) {
    if (node.amount <= 0) continue;
    const d = Math.hypot(node.x - x, node.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

export function nodesOfKind(state: GameState, kind: ResourceKey): ResourceNode[] {
  return state.world.resourceNodes.filter((n) => n.kind === kind);
}

export function nodeById(state: GameState, id: Id): ResourceNode | undefined {
  return state.world.resourceNodes.find((n) => n.id === id);
}
