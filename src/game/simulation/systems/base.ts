/**
 * GENESIS: BLOODLINES — Base progression, building placement and upkeep.
 *
 * The buildable area is a tile grid of `area.w` x `area.h` tiles that starts at
 * (0, 0). A building occupies `footprint.w` x `footprint.h` tiles. Placement is
 * validated BEFORE any resource is touched, so an invalid placement never
 * costs the player a single plank.
 */

import { newId } from '../ids';
import type { GameStore } from '../store';
import type {
  BuildingDef,
  BuildingId,
  BuildingInstance,
  GameState,
  Id,
  ResourceBag,
  ResourceKey,
} from '../types';
import { getBaseLevel, nextBaseLevel } from '../../content/baseLevels';
import {
  DEFAULT_UPGRADE_MULTIPLIERS,
  getBuildingDef,
  isBuildingUnlockedAt,
  type GameBuildingDef,
} from '../../content/buildings';
import { bi, describeMissing, forgetFarmPlot, resourceLabel } from './economy';

/* ------------------------------------------------------------------ */
/* Population and settlement totals                                     */
/* ------------------------------------------------------------------ */

/** Housing provided by every finished housing building. */
export function housingCapacity(state: GameState): number {
  let housing = 0;
  for (const inst of state.base.buildings) {
    if (inst.underConstruction) continue;
    const def = getBuildingDef(inst.defId);
    if (!def?.housing) continue;
    housing += def.housing * inst.level;
  }
  return housing;
}

/**
 * Total population capacity: the base level capacity plus the housing of every
 * finished building. Level 1 grants exactly 10.
 */
export function populationCapacity(state: GameState): number {
  const level = getBaseLevel(state.base.level);
  const baseCapacity = Math.max(level.capacity, state.base.capacity ?? 0);
  return baseCapacity + housingCapacity(state);
}

/** Total defense of the settlement. */
export function settlementDefense(state: GameState): number {
  let defense = getBaseLevel(state.base.level).defense;
  for (const inst of state.base.buildings) {
    if (inst.underConstruction) continue;
    const def = getBuildingDef(inst.defId);
    if (!def?.defense) continue;
    defense += def.defense * inst.level;
  }
  return defense;
}

/** Total storage capacity of the settlement. */
export function settlementStorage(state: GameState): number {
  let storage = getBaseLevel(state.base.level).storage;
  for (const inst of state.base.buildings) {
    if (inst.underConstruction) continue;
    const def = getBuildingDef(inst.defId);
    if (!def?.storage) continue;
    storage += def.storage * inst.level;
  }
  return storage;
}

/** Every building instance of the settlement. */
export function buildingsAt(state: GameState): BuildingInstance[] {
  return state.base.buildings.slice();
}

/** Footprint of a building type in tiles. */
export function buildingFootprint(defId: BuildingId): { w: number; h: number } {
  const def = getBuildingDef(defId);
  if (!def) return { w: 1, h: 1 };
  return { w: def.footprint.w, h: def.footprint.h };
}

/* ------------------------------------------------------------------ */
/* Base upgrades                                                        */
/* ------------------------------------------------------------------ */

/** Result of a base upgrade check. */
export interface UpgradeCheck {
  ok: boolean;
  reason?: string;
  /** The full cost of the next level (or of the failed attempt). */
  cost?: ResourceBag;
  /** Exactly what is still missing. */
  missing?: ResourceBag;
}

/** Checks whether the base can be upgraded, and what is missing if not. */
export function canUpgradeBase(store: GameStore): UpgradeCheck {
  const state = store.state;
  const next = nextBaseLevel(state.base.level);
  if (!next) {
    return {
      ok: false,
      reason: bi('وصلت إلى أعلى مستوى', 'The base is already at its highest level'),
      cost: {},
      missing: {},
    };
  }
  const missing = store.missingResources(next.cost);
  if (Object.keys(missing).length > 0) {
    return { ok: false, reason: describeMissing(missing), cost: next.cost, missing };
  }
  return { ok: true, cost: next.cost };
}

/** Upgrades the base: spends the cost and raises the level and capacity. */
export function upgradeBase(store: GameStore): boolean {
  const state = store.state;
  const next = nextBaseLevel(state.base.level);
  if (!next) {
    store.notify(bi('وصلت إلى أعلى مستوى', 'The base is already at its highest level'), 'warn');
    return false;
  }

  const missing = store.missingResources(next.cost);
  if (Object.keys(missing).length > 0) {
    store.notify(describeMissing(missing), 'warn');
    return false;
  }
  if (!store.spendResources(next.cost)) {
    store.notify(describeMissing(missing), 'warn');
    return false;
  }

  state.base.level = next.level;
  state.base.capacity = next.capacity;
  store.emit('base:upgraded', { level: next.level });
  store.notify(
    bi(`توسّع المستوطن إلى ${next.nameAr}`, `The settlement grew into ${next.nameEn}`),
    'info',
  );
  store.chronicle(bi(`صارت القلعة ${next.nameAr}`, `The settlement became ${next.nameEn}`));
  store.touch('base:upgraded');
  return true;
}

/* ------------------------------------------------------------------ */
/* Unlocking                                                           */
/* ------------------------------------------------------------------ */

/** True when the building may be built at the given base level. */
export function isBuildingUnlocked(defId: BuildingId, baseLevel: number): boolean {
  const def = getBuildingDef(defId);
  if (!def) return false;
  return isBuildingUnlockedAt(def, baseLevel);
}

/* ------------------------------------------------------------------ */
/* Placement                                                            */
/* ------------------------------------------------------------------ */

/**
 * True when the building fits inside the buildable area and does not overlap
 * an existing building.
 */
export function isPlacementValid(state: GameState, defId: BuildingId, x: number, y: number): boolean {
  return placementValid(state, defId, x, y, undefined);
}

function placementValid(
  state: GameState,
  defId: BuildingId,
  x: number,
  y: number,
  ignoreId: Id | undefined,
): boolean {
  const def = getBuildingDef(defId);
  if (!def) return false;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0) return false;

  const level = getBaseLevel(state.base.level);
  const fp = def.footprint;
  if (x + fp.w > level.area.w) return false;
  if (y + fp.h > level.area.h) return false;

  for (const other of state.base.buildings) {
    if (ignoreId !== undefined && other.id === ignoreId) continue;
    const otherDef = getBuildingDef(other.defId);
    if (!otherDef) continue;
    const ofp = otherDef.footprint;
    const overlaps =
      x < other.x + ofp.w && x + fp.w > other.x && y < other.y + ofp.h && y + fp.h > other.y;
    if (overlaps) return false;
  }
  return true;
}

/** Result of a placement attempt. */
export interface PlacementResult {
  ok: boolean;
  reason?: string;
  /** Id of the created building instance. */
  id?: Id;
  /** Exactly what is still missing. */
  missing?: ResourceBag;
}

/**
 * Places a building. The placement is validated FIRST: an invalid placement
 * never spends a single resource.
 */
export function placeBuilding(
  store: GameStore,
  defId: BuildingId,
  x: number,
  y: number,
): PlacementResult {
  const state = store.state;
  const def = getBuildingDef(defId);
  if (!def) {
    return { ok: false, reason: bi('مبنى غير معروف', 'Unknown building') };
  }
  if (!isBuildingUnlocked(defId, state.base.level)) {
    return {
      ok: false,
      reason: bi(
        `${def.nameAr} مقفل حتى يصل المستوطنة إلى مستوى ${def.unlockBaseLevel}`,
        `${def.nameEn} is locked until the settlement reaches level ${def.unlockBaseLevel}`,
      ),
    };
  }
  if (def.requires && def.requires.length > 0) {
    for (const req of def.requires) {
      if (!state.base.buildings.some((b) => b.defId === req)) {
        const reqDef = getBuildingDef(req);
        return {
          ok: false,
          reason: bi(
            `يحتاج ${def.nameAr} إلى ${reqDef?.nameAr ?? req}`,
            `${def.nameEn} requires ${reqDef?.nameEn ?? req}`,
          ),
        };
      }
    }
  }
  if (!isPlacementValid(state, defId, x, y)) {
    return {
      ok: false,
      reason: bi(
        'لا مكان صالح لهذا المبنى',
        'There is no valid place for this building',
      ),
    };
  }

  const missing = store.missingResources(def.cost);
  if (Object.keys(missing).length > 0) {
    return { ok: false, reason: describeMissing(missing), missing };
  }
  if (!store.spendResources(def.cost)) {
    return { ok: false, reason: describeMissing(missing), missing };
  }

  const instance: BuildingInstance = {
    id: newId('bld'),
    defId,
    x,
    y,
    level: 1,
    condition: 0,
    underConstruction: true,
    constructionDaysLeft: def.buildDays,
    assignedWorkers: [],
  };
  state.base.buildings.push(instance);

  store.emit('building:placed', { id: instance.id, defId });
  store.notify(
    bi(`بدأ بناء ${def.nameAr} (${def.buildDays} أيام)`, `Construction started: ${def.nameEn} (${def.buildDays} days)`),
    'info',
  );
  store.touch('building:placed');
  return { ok: true, id: instance.id };
}

/** Moves an existing building to another valid spot. */
export function moveBuilding(store: GameStore, id: Id, x: number, y: number): boolean {
  const state = store.state;
  const instance = state.base.buildings.find((b) => b.id === id);
  if (!instance) return false;
  if (!placementValid(state, instance.defId, x, y, id)) {
    store.notify(
      bi('لا مكان صالح لنقل المبنى', 'There is no valid place to move the building to'),
      'warn',
    );
    return false;
  }
  instance.x = x;
  instance.y = y;
  store.touch('building:moved');
  return true;
}

/** Cost of the next upgrade step of a building. */
export function buildingUpgradeCost(def: BuildingDef, currentLevel: number): ResourceBag {
  const multiplier =
    def.upgradeCostMultiplier?.[currentLevel] ??
    DEFAULT_UPGRADE_MULTIPLIERS[currentLevel] ??
    DEFAULT_UPGRADE_MULTIPLIERS[DEFAULT_UPGRADE_MULTIPLIERS.length - 1];
  const cost: ResourceBag = {};
  for (const [key, amount] of Object.entries(def.cost)) {
    const value = Math.ceil((amount ?? 0) * multiplier);
    if (value > 0) cost[key as ResourceKey] = value;
  }
  return cost;
}

/** Upgrades a building to the next level, if the settlement allows it. */
export function upgradeBuilding(store: GameStore, id: Id): boolean {
  const state = store.state;
  const instance = state.base.buildings.find((b) => b.id === id);
  if (!instance) return false;
  const def = getBuildingDef(instance.defId);
  if (!def) return false;

  const maxLevel = Math.min(def.maxLevel, getBaseLevel(state.base.level).maxBuildingLevel);
  if (instance.level >= maxLevel) {
    store.notify(
      bi(
        `${def.nameAr} بلغ أعلى مستوى مسموح`,
        `${def.nameEn} is already at its highest allowed level`,
      ),
      'warn',
    );
    return false;
  }
  if (instance.underConstruction) {
    store.notify(
      bi('لا يمكن ترقية مبنى قيد البناء', 'A building under construction cannot be upgraded'),
      'warn',
    );
    return false;
  }

  const cost = buildingUpgradeCost(def, instance.level);
  const missing = store.missingResources(cost);
  if (Object.keys(missing).length > 0) {
    store.notify(describeMissing(missing), 'warn');
    return false;
  }
  if (!store.spendResources(cost)) {
    store.notify(describeMissing(missing), 'warn');
    return false;
  }

  instance.level += 1;
  store.notify(
    bi(`ترقية ${def.nameAr} إلى المستوى ${instance.level}`, `${def.nameEn} upgraded to level ${instance.level}`),
    'info',
  );
  store.touch('building:upgraded');
  return true;
}

/** Demolishes a building. */
export function removeBuilding(store: GameStore, id: Id): boolean {
  const state = store.state;
  const index = state.base.buildings.findIndex((b) => b.id === id);
  if (index < 0) return false;
  const [removed] = state.base.buildings.splice(index, 1);
  const def = getBuildingDef(removed.defId);
  forgetFarmPlot(state, removed.id);
  store.notify(
    bi(`هُدم ${def?.nameAr ?? removed.defId}`, `${def?.nameEn ?? removed.defId} was demolished`),
    'info',
  );
  store.touch('building:removed');
  return true;
}

/** Repairs a damaged building. */
export function repairBuilding(store: GameStore, id: Id): boolean {
  const state = store.state;
  const instance = state.base.buildings.find((b) => b.id === id);
  if (!instance) return false;
  if (instance.condition >= 100) {
    store.notify(
      bi('المبنى سليم ولا يحتاج إصلاحًا', 'The building is sound and needs no repair'),
      'info',
    );
    return false;
  }
  if (instance.underConstruction) return false;

  const def = getBuildingDef(instance.defId);
  if (!def) return false;

  const damageRatio = (100 - instance.condition) / 100;
  const cost: ResourceBag = {};
  for (const [key, amount] of Object.entries(def.cost)) {
    const value = Math.ceil((amount ?? 0) * damageRatio * 0.5);
    if (value > 0) cost[key as ResourceKey] = value;
  }

  const missing = store.missingResources(cost);
  if (Object.keys(missing).length > 0) {
    store.notify(describeMissing(missing), 'warn');
    return false;
  }
  if (!store.spendResources(cost)) {
    store.notify(describeMissing(missing), 'warn');
    return false;
  }

  instance.condition = 100;
  store.notify(
    bi(`أُصلح ${def.nameAr}`, `${def.nameEn} was repaired`),
    'info',
  );
  store.touch('building:repaired');
  return true;
}

/** Human readable list of the buildable area, used by the build panel. */
export function buildableArea(state: GameState): { w: number; h: number } {
  const level = getBaseLevel(state.base.level);
  return { w: level.area.w, h: level.area.h };
}

/** Bilingual cost summary, e.g. "خشب (Wood) ×20". */
export function describeCost(cost: ResourceBag): string {
  const parts: string[] = [];
  for (const [key, amount] of Object.entries(cost)) {
    const k = key as ResourceKey;
    parts.push(`${resourceLabel(k, 'ar')} (${resourceLabel(k, 'en')}) ×${amount ?? 0}`);
  }
  return parts.join('، ');
}

/** The extended definition of a building (with its special behaviour). */
export function buildingDetails(defId: BuildingId): GameBuildingDef | undefined {
  return getBuildingDef(defId);
}
