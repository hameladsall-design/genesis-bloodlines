/**
 * Visitors: strangers who reach the settlement gate roughly once a month.
 *
 * A visitor is a real world entity: it has a position, a body, a disposition
 * and the day it arrived. Exactly one visitor may be waiting at a time, and a
 * visitor is never offered twice: the arrival day is remembered on the state
 * so the spawn stays idempotent across frames and across save/load.
 */

import { newId } from '../ids';
import { DAYS_PER_MONTH } from '../calendar';
import { FACTION_TEMPLATES } from '../../content/factions';
import { namesForRace } from '../../content/names';
import { createCharacter, recruitPriceFor, type CharacterExtended } from './tavern';
import { adjustReputation } from './factions';
import { countEnemyDefeated } from './quests';
import type { GameStore } from '../store';
import type { FactionId, GameState, Id, RaceId, Visitor } from '../types';

/** Days between two visitor arrivals (one in-game month). */
export const VISITOR_INTERVAL_DAYS = DAYS_PER_MONTH;

/** A visitor plus the extra fields the UI and the systems need. */
export interface VisitorExtended extends Visitor {
  /** The faction the visitor comes from. */
  factionId?: FactionId;
  /** The exact coin price of recruiting this visitor. */
  recruitPrice?: number;
}

/** State extension that remembers the day of the last visitor. */
export interface VisitorState extends GameState {
  lastVisitorDay?: number;
}

/** Races a visitor may come from — deliberately more diverse than hiring. */
const VISITOR_RACES: RaceId[] = [
  'human',
  'elf',
  'dark_elf',
  'dwarf',
  'orc',
  'half_demon',
  'werewolf',
  'vampire',
  'dragon_blooded',
  'giant',
  'spirit',
  'mutant',
  'demon',
  'undead',
];

/* ------------------------------------------------------------------ */
/* Timing                                                             */
/* ------------------------------------------------------------------ */

/** The day the most recent visitor arrived, or -1 when there never was one. */
export function visitorArriveDay(state: GameState): number {
  let last = -1;
  for (const visitor of state.visitors ?? []) {
    if (visitor.arrivedDay > last) last = visitor.arrivedDay;
  }
  const marker = (state as VisitorState).lastVisitorDay;
  if (typeof marker === 'number' && marker > last) last = marker;
  return last;
}

/** Days since the last visitor arrived (infinite when there never was one). */
export function daysSinceLastVisitor(state: GameState): number {
  const last = visitorArriveDay(state);
  if (last < 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, state.calendar.totalDays - last);
}

/** The day the next visitor is expected to arrive. */
export function nextVisitorDay(state: GameState): number {
  const last = visitorArriveDay(state);
  if (last < 0) return state.calendar.totalDays;
  return last + VISITOR_INTERVAL_DAYS;
}

/* ------------------------------------------------------------------ */
/* Queries                                                            */
/* ------------------------------------------------------------------ */

/** Visitors that are still waiting at the gate. */
export function pendingVisitors(state: GameState): Visitor[] {
  return (state.visitors ?? []).filter(
    (visitor) => visitor.disposition === 'waiting' && visitor.character.alive,
  );
}

/** The exact coin price of recruiting a visitor. */
export function visitorRecruitPrice(store: GameStore, visitor: Visitor): number {
  const extended = visitor as VisitorExtended;
  if (typeof extended.recruitPrice === 'number') return extended.recruitPrice;
  return recruitPriceFor(
    visitor.character,
    2,
    store.state.difficulty?.recruitmentPriceMultiplier ?? 1,
  );
}

/* ------------------------------------------------------------------ */
/* Spawning                                                           */
/* ------------------------------------------------------------------ */

function pickFactionId(store: GameStore): FactionId | undefined {
  const known = Object.keys(store.state.factions ?? {});
  if (known.length > 0) return store.rng.pick(known);
  const templates = FACTION_TEMPLATES.map((template) => template.id);
  return templates.length > 0 ? store.rng.pick(templates) : undefined;
}

/**
 * Spawns a visitor when one is due. Returns null when nothing should happen,
 * so calling this every frame is safe.
 */
export function maybeSpawnVisitor(store: GameStore): Visitor | null {
  const state = store.state;
  if (pendingVisitors(state).length > 0) return null;
  if (daysSinceLastVisitor(state) < VISITOR_INTERVAL_DAYS) return null;

  const rng = store.rng;
  const day = state.calendar.totalDays;
  const race = rng.pick(VISITOR_RACES);
  const sex = rng.chance(0.5) ? 'male' : 'female';
  const age = 18 + rng.int(0, 30);
  const level = rng.int(1, Math.max(2, (state.base?.level ?? 1) + 3));
  const factionId = pickFactionId(store);

  const character: CharacterExtended = createCharacter({
    firstName: namesForRace(race, sex).first,
    familyName: namesForRace(race, sex).family,
    sex,
    race,
    age,
    level,
    zone: 'settlement',
    x: (state.world?.baseX ?? 0) + rng.range(-14, 14),
    y: (state.world?.baseY ?? 0) + rng.range(-14, 14),
    household: 'resident',
    job: 'idle',
    portraitSeed: rng.int(1, 999999),
    factionId,
  });

  const visitor: VisitorExtended = {
    id: newId('vis'),
    character,
    x: character.x,
    y: character.y,
    arrivedDay: day,
    disposition: 'waiting',
    notified: false,
    factionId,
    recruitPrice: recruitPriceFor(character, 2, state.difficulty?.recruitmentPriceMultiplier ?? 1),
  };

  state.visitors.push(visitor);
  (state as VisitorState).lastVisitorDay = day;
  visitor.notified = true;
  store.emit('visitor:arrived', { id: visitor.id });
  store.notify(`وصل زائر الى البوابة: ${character.firstName} ${character.familyName}`, 'info');
  store.chronicle(`وصل زائر: ${character.firstName} ${character.familyName}`);
  store.touch('visitors:arrive');
  return visitor;
}

/* ------------------------------------------------------------------ */
/* Resolution                                                         */
/* ------------------------------------------------------------------ */

export type VisitorAction = 'recruit' | 'kill' | 'send_away';

export interface VisitorResult {
  ok: boolean;
  reason?: string;
}

function capacityReason(capacity: number): string {
  return `امتلأت سعة المستوطنة (Population capacity reached: ${capacity}) - طور مستواك السكني لتوسيع السكن`;
}

function coinsReason(price: number, have: number): string {
  return `لا توجد عملات كافية (Not enough coins: need ${price}, have ${have})`;
}

/**
 * Resolves a waiting visitor with one of exactly three actions:
 * `recruit`, `kill` or `send_away`.
 */
export function resolveVisitor(
  store: GameStore,
  visitorId: Id,
  action: VisitorAction,
): VisitorResult {
  const state = store.state;
  const visitor = (state.visitors ?? []).find((entry) => entry.id === visitorId) as
    | VisitorExtended
    | undefined;
  if (!visitor) {
    return { ok: false, reason: 'هذا الزائر غير موجود (Visitor not found)' };
  }
  if (visitor.disposition !== 'waiting') {
    return { ok: false, reason: 'سبق ان حسم مصير هذا الزائر (Visitor already resolved)' };
  }

  const character = visitor.character;
  const day = state.calendar.totalDays;

  if (action === 'recruit') {
    if (!character.alive) {
      return { ok: false, reason: 'هذا الزائر لم يعد على قيد الحياة (Visitor is dead)' };
    }
    const capacity = state.base?.capacity ?? 0;
    if (store.livingCount() >= capacity) {
      return { ok: false, reason: capacityReason(capacity) };
    }
    const price = visitorRecruitPrice(store, visitor);
    const coins = store.getResource('coins');
    if (coins < price) {
      return { ok: false, reason: coinsReason(price, coins) };
    }
    if (!store.spendResources({ coins: price })) {
      return { ok: false, reason: coinsReason(price, store.getResource('coins')) };
    }
    character.household = 'resident';
    character.alive = true;
    store.addCharacter(character);
    if (!state.recruitedIds.includes(character.id)) {
      state.recruitedIds.push(character.id);
    }
    visitor.disposition = 'recruited';
    visitor.resolvedDay = day;
    visitor.notified = true;
    store.emit('character:recruited', { id: character.id });
    store.emit('visitor:resolved', { id: visitor.id, disposition: visitor.disposition });
    store.notify(`انضم ${character.firstName} ${character.familyName} الى العائلة`, 'info');
    store.chronicle(`قبلنا ${character.firstName} ${character.familyName} من البوابة`);
    store.touch('visitors:recruit');
    return { ok: true };
  }

  if (action === 'kill') {
    character.alive = false;
    character.permadead = true;
    character.causeOfDeath = 'قتل على يد المستوطنة (Killed by the settlement)';
    character.dayOfDeath = day;
    visitor.disposition = 'killed';
    visitor.resolvedDay = day;
    visitor.notified = true;

    const loot = {
      coins: store.rng.int(2, 18),
      herbs: store.rng.int(0, 3),
      leather: store.rng.int(0, 4),
    };
    store.addResources(loot);
    countEnemyDefeated(state);

    if (visitor.factionId) {
      adjustReputation(store, visitor.factionId, -15);
    }

    store.emit('visitor:resolved', { id: visitor.id, disposition: visitor.disposition });
    store.notify(`قتلت ${character.firstName} ${character.familyName}`, 'danger');
    store.chronicle(`قتلنا ${character.firstName} ${character.familyName} عند البوابة`);
    store.touch('visitors:kill');
    return { ok: true };
  }

  // send_away
  visitor.disposition = 'sent_away';
  visitor.resolvedDay = day;
  visitor.notified = true;
  store.emit('visitor:resolved', { id: visitor.id, disposition: visitor.disposition });
  store.notify(`أرسلنا ${character.firstName} ${character.familyName} بعيدا`, 'info');
  store.chronicle(`صرفنا ${character.firstName} ${character.familyName}`);
  store.touch('visitors:send_away');
  return { ok: true };
}
