/**
 * Factions: the powers that share the world with the player's dynasty.
 *
 * Factions drift forward with the calendar: their populations grow or shrink,
 * their armies change, their relations with the settlement drift slowly and
 * every notable change is appended to their history.
 */

import { FACTION_TEMPLATES, ZONES } from '../../content/factions';
import type { GameStore } from '../store';
import type {
  Faction,
  FactionId,
  FactionRelation,
  GameState,
  Id,
  ResourceBag,
  ZoneId,
} from '../types';

/** Reputation thresholds that map onto the diplomatic relation. */
const RELATION_THRESHOLDS: { min: number; relation: FactionRelation }[] = [
  { min: 70, relation: 'ally' },
  { min: 35, relation: 'trade' },
  { min: -20, relation: 'neutral' },
  { min: -50, relation: 'suspicious' },
  { min: -80, relation: 'hostile' },
];

/** The diplomatic relation that matches a reputation score. */
export function relationForReputation(reputation: number): FactionRelation {
  const value = Math.max(-100, Math.min(100, reputation));
  for (const entry of RELATION_THRESHOLDS) {
    if (value >= entry.min) return entry.relation;
  }
  return 'war';
}

/** Arabic-first label for a diplomatic relation. */
export function relationLabel(relation: string, lang: 'ar' | 'en'): string {
  if (lang === 'en') {
    switch (relation) {
      case 'ally':
        return 'Ally';
      case 'trade':
        return 'Trade Partner';
      case 'neutral':
        return 'Neutral';
      case 'suspicious':
        return 'Suspicious';
      case 'hostile':
        return 'Hostile';
      case 'war':
        return 'At War';
      default:
        return 'Unknown';
    }
  }
  switch (relation) {
    case 'ally':
      return 'حليف';
    case 'trade':
      return 'شريك تجارة';
    case 'neutral':
      return 'محايد';
    case 'suspicious':
      return 'مريب';
    case 'hostile':
      return 'عدائي';
    case 'war':
      return 'في حالة حرب';
    default:
      return 'غير معروف';
  }
}

/** Arabic-first short description of a relation change. */
function relationNoteAr(relation: FactionRelation): string {
  switch (relation) {
    case 'ally':
      return 'Relations improved: they now call us allies.';
    case 'trade':
      return 'Relations improved: trade talks have started.';
    case 'neutral':
      return 'Relations returned to neutral ground.';
    case 'suspicious':
      return 'Relations sour: they watch us closely now.';
    case 'hostile':
      return 'Relations broke down: they call us enemies.';
    case 'war':
      return 'Relations are war: banners are raised against us.';
    default:
      return 'Relations changed.';
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Seeds every faction from the content templates and installs them on the
 * state. Returns the created record.
 */
export function createFactions(store: GameStore): Record<FactionId, Faction> {
  const rng = store.rng;
  const state = store.state;
  const zoneIds: ZoneId[] = ZONES.map((zone) => zone.id);
  const factions: Record<FactionId, Faction> = {};

  for (const template of FACTION_TEMPLATES) {
    const resources: ResourceBag = {
      wood: rng.int(150, 900),
      stone: rng.int(100, 700),
      iron: rng.int(40, 400),
      food: rng.int(200, 1200),
      coins: rng.int(50, 600),
    };
    const territory = rng.sample(zoneIds, rng.int(1, 2));
    factions[template.id] = {
      id: template.id,
      nameAr: template.nameAr,
      nameEn: template.nameEn,
      leaderId: undefined,
      population: rng.int(120, 900),
      territory,
      resources,
      military: rng.int(20, 140),
      reputation: 0,
      relation: 'neutral',
      goals: [...template.goals],
      history: ['نشأت هذه القوة في العالم'],
    };
  }

  state.factions = factions;
  store.touch('factions:create');
  return factions;
}

/** Points a faction at its current leader. */
export function assignFactionLeader(store: GameStore, factionId: FactionId, leaderId: Id): void {
  const faction = store.state.factions[factionId];
  if (!faction) return;
  faction.leaderId = leaderId;
  store.touch('factions:leader');
}

/**
 * Advances the world one step: populations drift, armies shift, reputation
 * decays back toward zero and the relation follows the reputation.
 */
export function tickFactions(store: GameStore): void {
  const state = store.state;
  const rng = store.rng;
  const day = state.calendar.totalDays;

  for (const id of Object.keys(state.factions ?? {})) {
    const faction = state.factions[id];
    if (!faction) continue;

    // Population drift: growth, famine and war all nudge the numbers.
    faction.population = Math.max(20, Math.round(faction.population * (1 + rng.range(-0.04, 0.05))));
    faction.military = Math.max(4, Math.round(faction.military * (1 + rng.range(-0.05, 0.07))));

    const wood = faction.resources.wood ?? 0;
    const food = faction.resources.food ?? 0;
    const coins = faction.resources.coins ?? 0;
    faction.resources.wood = Math.max(0, Math.round(wood + rng.int(-12, 16)));
    faction.resources.food = Math.max(0, Math.round(food + rng.int(-20, 24)));
    faction.resources.coins = Math.max(0, Math.round(coins + rng.int(-8, 12)));

    // Reputation drifts slowly back toward zero.
    const drift = rng.int(-1, 1);
    faction.reputation = clamp(Math.round(faction.reputation * 0.98) + drift, -100, 100);

    const relation = relationForReputation(faction.reputation);
    if (relation !== faction.relation) {
      faction.relation = relation;
      faction.history.unshift(`${relationNoteAr(relation)}`);
      if (faction.history.length > 40) faction.history.length = 40;
    }

    if (day % 30 === 0) {
      faction.history.unshift(`يوم ${day}: تبدلت أحوال العالم (The world moved on)`);
      if (faction.history.length > 40) faction.history.length = 40;
    }
  }

  store.touch('factions:tick');
}

/**
 * Changes the settlement's standing with a faction. Reputation is always
 * clamped to the -100..100 range and the relation follows immediately.
 */
export function adjustReputation(store: GameStore, factionId: FactionId, delta: number): void {
  const faction = store.state.factions?.[factionId];
  if (!faction) return;
  const before = faction.reputation;
  faction.reputation = clamp(faction.reputation + Math.round(delta), -100, 100);
  const relation = relationForReputation(faction.reputation);
  if (relation !== faction.relation) {
    faction.relation = relation;
    faction.history.unshift(`${relationNoteAr(relation)}`);
    if (faction.history.length > 40) faction.history.length = 40;
  } else {
    const direction = faction.reputation > before ? 'ارتفعت سمعتنا' : 'انخفضت سمعتنا';
    faction.history.unshift(`${direction} لدى ${faction.nameAr} (${faction.nameEn})`);
    if (faction.history.length > 40) faction.history.length = 40;
  }
  store.touch('factions:reputation');
}

/** A flat list of the settlement's standing with every known faction. */
export function factionRelations(state: GameState): {
  id: FactionId;
  nameAr: string;
  nameEn: string;
  relation: string;
  reputation: number;
}[] {
  const factions = state.factions ?? {};
  return Object.keys(factions).map((id) => {
    const faction = factions[id]!;
    return {
      id: faction.id,
      nameAr: faction.nameAr,
      nameEn: faction.nameEn,
      relation: faction.relation,
      reputation: faction.reputation,
    };
  });
}
