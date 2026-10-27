/**
 * GENESIS: BLOODLINES — Resource economy, food and survival.
 *
 * This module owns:
 *  - the resource vocabulary (Arabic-first labels),
 *  - gathering and hunting (bounded by the node amount, never infinite),
 *  - the daily food rule: exactly 1 food unit per living character per day,
 *  - progressive starvation (warning → critical → severe → collapse),
 *  - farm plots (plant → grow → harvest),
 *  - daily production, construction progress, healing and disease.
 *
 * Everything that must survive a save/load round trip lives inside the game
 * state: the economy keeps its own runtime block (`state.baseRuntime`) which is
 * serialized with the rest of the state, and it never uses `Math.random()`.
 */

import type { GameStore } from '../store';
import type {
  Character,
  GameState,
  Id,
  ResourceBag,
  ResourceKey,
} from '../types';
import { getBuildingDef, type GameBuildingDef } from '../../content/buildings';

/* ------------------------------------------------------------------ */
/* Resource vocabulary                                                 */
/* ------------------------------------------------------------------ */

/** Arabic-first labels for every resource key. */
export const RESOURCE_LABELS: Record<ResourceKey, { ar: string; en: string }> = {
  wood: { ar: 'خشب', en: 'Wood' },
  stone: { ar: 'حجر', en: 'Stone' },
  iron: { ar: 'حديد', en: 'Iron' },
  food: { ar: 'طعام', en: 'Food' },
  water: { ar: 'ماء', en: 'Water' },
  coins: { ar: 'عملات', en: 'Coins' },
  tools: { ar: 'أدوات', en: 'Tools' },
  herbs: { ar: 'أعشاب', en: 'Herbs' },
  leather: { ar: 'جلود', en: 'Leather' },
  bone: { ar: 'عظام', en: 'Bone' },
  essence: { ar: 'جوهر', en: 'Essence' },
  crystal: { ar: 'بلور', en: 'Crystal' },
};

/** Localized name of a resource. */
export function resourceLabel(key: ResourceKey, lang: 'ar' | 'en'): string {
  const entry = RESOURCE_LABELS[key];
  return entry ? entry[lang] : key;
}

/** Bilingual user-facing text: Arabic first, English after the separator. */
export function bi(ar: string, en: string): string {
  return `${ar} | ${en}`;
}

/** "خشب (Wood) ×20" style list of missing resources. */
export function describeMissing(missing: ResourceBag): string {
  const parts: string[] = [];
  for (const [key, amount] of Object.entries(missing)) {
    const k = key as ResourceKey;
    parts.push(`${RESOURCE_LABELS[k]?.ar ?? k} (${RESOURCE_LABELS[k]?.en ?? k}) ×${amount ?? 0}`);
  }
  if (parts.length === 0) return bi('لا مواد ناقصة', 'Nothing missing');
  return bi(`المواد الناقصة: ${parts.join('، ')}`, `Missing: ${parts.join(', ')}`);
}

/* ------------------------------------------------------------------ */
/* Runtime state (persisted with the save)                             */
/* ------------------------------------------------------------------ */

/** One farm plot, attached to a farm building instance. */
export interface FarmPlotState {
  buildingId: Id;
  planted: boolean;
  growthDaysLeft: number;
  growthDaysTotal: number;
  lastHarvestDay: number;
}

/** Extra economy state kept inside `state` so it survives save/load. */
export interface EconomyRuntime {
  /** Farm plots keyed by building instance id. */
  farms: Record<Id, FarmPlotState>;
  /** Day on which each character may gather or hunt again. */
  cooldowns: Record<Id, number>;
  /** Day on which the daily food payment was already made. */
  foodPaidDay: number;
  /** Shortfall recorded by the last food payment. */
  lastShortfall: number;
  /** Day on which the starvation effects were last applied. */
  starvationAppliedDay: number;
}

/**
 * Returns the economy runtime block, creating it on first use. The block lives
 * on the state object so `JSON.stringify` (and therefore the save file) keeps
 * it.
 */
export function getEconomyRuntime(state: GameState): EconomyRuntime {
  const holder = state as GameState & { baseRuntime?: EconomyRuntime };
  if (!holder.baseRuntime) {
    holder.baseRuntime = {
      farms: {},
      cooldowns: {},
      foodPaidDay: -1,
      lastShortfall: 0,
      starvationAppliedDay: -1,
    };
  }
  return holder.baseRuntime;
}

/** Drops the farm plot of a building that no longer exists. */
export function forgetFarmPlot(state: GameState, buildingId: Id): void {
  const runtime = getEconomyRuntime(state);
  delete runtime.farms[buildingId];
}

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */

/** Stamina spent on a single gathering trip. */
export const GATHER_STAMINA_COST = 10;
/** Stamina spent on a single hunting trip. */
export const HUNT_STAMINA_COST = 18;
/** Days a depleted resource node needs before it regrows. */
export const NODE_REGROW_DAYS = 5;
/** Days without enough food before the settlement starts to suffer. */
export const STARVATION_GRACE_DAYS = 3;
/** Days without enough food before the settlement starts to collapse. */
export const STARVATION_SEVERE_DAYS = 8;
/** Days without enough food before a building may collapse entirely. */
export const STARVATION_COLLAPSE_DAYS = 20;

const BASE_YIELD: Record<ResourceKey, number> = {
  wood: 4,
  stone: 3,
  iron: 2,
  food: 3,
  water: 4,
  coins: 2,
  tools: 1,
  herbs: 2,
  leather: 2,
  bone: 2,
  essence: 1,
  crystal: 1,
};

const GATHER_SKILLS = ['woodcutting', 'mining', 'foraging', 'gathering'];
const HUNT_SKILLS = ['hunting', 'tracking'];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isStaffed(def: GameBuildingDef, assigned: number): boolean {
  const required = def.workers ?? 0;
  return required <= 0 || assigned >= required;
}

/** Total healing per day provided by the completed, staffed clinics. */
export function settlementHealingBonus(state: GameState): number {
  let bonus = 0;
  for (const inst of state.base.buildings) {
    if (inst.underConstruction) continue;
    const def = getBuildingDef(inst.defId);
    if (!def?.healing) continue;
    if (!isStaffed(def, inst.assignedWorkers.length)) continue;
    bonus += def.healing;
  }
  return bonus;
}

/** Total disease resistance of the settlement (capped). */
export function settlementDiseaseResist(state: GameState): number {
  let resist = 0;
  for (const inst of state.base.buildings) {
    if (inst.underConstruction) continue;
    const def = getBuildingDef(inst.defId);
    if (!def?.diseaseResist) continue;
    resist += def.diseaseResist;
  }
  return Math.min(0.6, resist);
}

/** Total bonus applied to every farm harvest (kitchens and the like). */
export function settlementFarmYieldBonus(state: GameState): number {
  let bonus = 0;
  for (const inst of state.base.buildings) {
    if (inst.underConstruction) continue;
    const def = getBuildingDef(inst.defId);
    if (!def?.farmYieldBonus) continue;
    if (!isStaffed(def, inst.assignedWorkers.length)) continue;
    bonus += def.farmYieldBonus;
  }
  return bonus;
}

/** Stamina discount on gathering granted by workshops. */
export function settlementGatherDiscount(state: GameState): number {
  let discount = 0;
  for (const inst of state.base.buildings) {
    if (inst.underConstruction) continue;
    const def = getBuildingDef(inst.defId);
    if (!def?.gatherDiscount) continue;
    discount += def.gatherDiscount;
  }
  return Math.min(0.5, discount);
}

function gatherSkillBonus(ch: Character): number {
  let bonus = 1 + ch.level * 0.02;
  for (const skill of ch.skills) {
    if (GATHER_SKILLS.includes(skill)) bonus += 0.3;
  }
  return bonus;
}

function huntSkillBonus(ch: Character): number {
  let bonus = 0;
  for (const skill of ch.skills) {
    if (HUNT_SKILLS.includes(skill)) bonus += 0.2;
  }
  return bonus;
}

/** Removes dead characters from every building's worker list. */
export function releaseDeadWorkers(store: GameStore): void {
  for (const inst of store.state.base.buildings) {
    if (inst.assignedWorkers.length === 0) continue;
    inst.assignedWorkers = inst.assignedWorkers.filter((id) => {
      const ch = store.getCharacter(id);
      return !!ch && ch.alive;
    });
  }
}

/* ------------------------------------------------------------------ */
/* Gathering and hunting                                               */
/* ------------------------------------------------------------------ */

/**
 * Gathers from a resource node. The node amount is the hard bound: a node can
 * never be harvested infinitely, and every character pays stamina and waits a
 * day before gathering again.
 */
export function gatherFromNode(
  store: GameStore,
  nodeId: Id,
  characterId: Id,
): { ok: boolean; reason?: string; gained?: ResourceBag } {
  const state = store.state;
  const node = state.world.resourceNodes.find((n) => n.id === nodeId);
  if (!node) {
    return { ok: false, reason: bi('العقدة غير موجودة', 'Resource node not found') };
  }
  const ch = store.getCharacter(characterId);
  if (!ch || !ch.alive) {
    return { ok: false, reason: bi('لا أحد يقوم بالجمع', 'Nobody is able to gather') };
  }
  const runtime = getEconomyRuntime(state);
  const today = state.calendar.totalDays;
  if ((runtime.cooldowns[characterId] ?? -1) > today) {
    return {
      ok: false,
      reason: bi('ما زال على الحاصد أن يستريح حتى الغد', 'The gatherer must rest until tomorrow'),
    };
  }
  if (node.amount <= 0) {
    return {
      ok: false,
      reason: bi('نفدت هذه العقدة، وسيعود شيء منها مع الوقت', 'This node is exhausted and will regrow'),
    };
  }
  const cost = Math.max(2, Math.round(GATHER_STAMINA_COST * (1 - settlementGatherDiscount(state))));
  if (ch.stats.stamina < cost) {
    return {
      ok: false,
      reason: bi('اللياقة لا تكفي للعمل على العقدة', 'Not enough stamina to work the node'),
    };
  }

  const hardnessFactor = 1 - Math.min(0.6, node.hardness * 0.06);
  const roll = store.rng.range(0.85, 1.15);
  const raw = Math.max(1, Math.round((BASE_YIELD[node.kind] ?? 1) * hardnessFactor * gatherSkillBonus(ch) * roll));
  const amount = Math.min(raw, Math.floor(node.amount));
  if (amount <= 0) {
    return { ok: false, reason: bi('لا شيء يمكن أخذه من هذه العقدة', 'Nothing left to take from this node') };
  }

  node.amount -= amount;
  if (node.amount <= 0) {
    node.amount = 0;
    if (node.regrowIn <= 0) node.regrowIn = NODE_REGROW_DAYS;
  }
  ch.stats.stamina = Math.max(0, ch.stats.stamina - cost);
  runtime.cooldowns[characterId] = today + 1;

  const gained: ResourceBag = {};
  gained[node.kind] = amount;
  store.addResource(node.kind, amount);
  store.touch('gather');
  return { ok: true, gained };
}

/**
 * Hunts in the wilderness. Costs stamina, needs a day between hunts, and can
 * fail — the settlement never receives free food.
 */
export function huntInWilderness(
  store: GameStore,
  characterId: Id,
): { ok: boolean; reason?: string; food?: number } {
  const state = store.state;
  const ch = store.getCharacter(characterId);
  if (!ch || !ch.alive) {
    return { ok: false, reason: bi('لا أحد قادر على الصيد', 'Nobody is able to hunt') };
  }
  const runtime = getEconomyRuntime(state);
  const today = state.calendar.totalDays;
  if ((runtime.cooldowns[`hunt_${characterId}`] ?? -1) > today) {
    return {
      ok: false,
      reason: bi('لا صيد اليوم، الصيد يُترك حتى الغد', 'No hunting today; the hunt waits for tomorrow'),
    };
  }
  if (ch.stats.stamina < HUNT_STAMINA_COST) {
    return { ok: false, reason: bi('اللياقة لا تكفي للصيد', 'Not enough stamina to hunt') };
  }

  ch.stats.stamina = Math.max(0, ch.stats.stamina - HUNT_STAMINA_COST);
  runtime.cooldowns[`hunt_${characterId}`] = today + 1;

  const chance = Math.min(0.95, 0.45 + ch.level * 0.03 + huntSkillBonus(ch));
  if (!store.rng.chance(chance)) {
    store.touch('hunt');
    return { ok: false, reason: bi('عاد الصيادوا فارغي اليد', 'The hunter came back empty handed') };
  }

  const food = store.rng.int(3, 7);
  store.addResource('food', food);
  if (store.rng.chance(0.3)) store.addResource('leather', 1);
  store.touch('hunt');
  return { ok: true, food };
}

/* ------------------------------------------------------------------ */
/* Food                                                                */
/* ------------------------------------------------------------------ */

/** Exactly one food unit per living character per in-game day. */
export function dailyFoodConsumption(state: GameState): number {
  let count = 0;
  for (const id of state.characterOrder) {
    const ch = state.characters[id];
    if (ch && ch.alive) count += 1;
  }
  return count;
}

/**
 * Pays the daily food bill. The payment happens once per in-game day, so the
 * engine may safely call both `consumeFood` and `tickStarvation` on the same
 * tick without double-charging the settlement.
 */
export function consumeFood(store: GameStore): { consumed: number; shortfall: number; daysOfFoodLeft: number } {
  const state = store.state;
  const runtime = getEconomyRuntime(state);
  const today = state.calendar.totalDays;

  if (runtime.foodPaidDay === today) {
    return {
      consumed: 0,
      shortfall: runtime.lastShortfall,
      daysOfFoodLeft: store.daysOfFoodLeft(),
    };
  }

  const needed = dailyFoodConsumption(state);
  const available = store.getResource('food');
  const consumed = Math.max(0, Math.min(available, needed));
  const shortfall = Math.max(0, needed - available);
  if (consumed > 0) store.addResource('food', -consumed);

  runtime.foodPaidDay = today;
  runtime.lastShortfall = shortfall;
  store.touch('food:consumed');
  return { consumed, shortfall, daysOfFoodLeft: store.daysOfFoodLeft() };
}

/* ------------------------------------------------------------------ */
/* Starvation                                                          */
/* ------------------------------------------------------------------ */

/** Current starvation level of the settlement. */
export function starvationStatus(state: GameState): { days: number; level: 'none' | 'warning' | 'critical' | 'severe' } {
  const days = Math.max(0, state.base?.starvationDays ?? state.starvationDays ?? 0);
  if (days <= 0) return { days: 0, level: 'none' };
  if (days >= STARVATION_SEVERE_DAYS) return { days, level: 'severe' };
  if (days >= STARVATION_GRACE_DAYS) return { days, level: 'critical' };
  return { days, level: 'warning' };
}

/**
 * Daily starvation tick. Progressive by design: a warning first, then health
 * and stamina loss after a grace period, then unrest and building damage, and
 * only in the most severe stage does a building collapse. Nobody dies on the
 * first missed day.
 */
export function tickStarvation(store: GameStore): void {
  const state = store.state;
  const runtime = getEconomyRuntime(state);
  const today = state.calendar.totalDays;

  // Pay today's food bill if the engine did not already do it.
  consumeFood(store);
  const shortfall = runtime.lastShortfall;

  if (runtime.starvationAppliedDay === today) return;
  runtime.starvationAppliedDay = today;

  if (shortfall <= 0) {
    state.base.starvationDays = 0;
    state.starvationDays = 0;
    state.base.prosperityDays += 1;
    return;
  }

  const days = (state.base.starvationDays ?? 0) + 1;
  state.base.starvationDays = days;
  state.starvationDays = days;

  if (days === 1) {
    store.notify(
      bi(
        'المخزون من الطعام لا يكفي ليوم كامل — تحذير واضح',
        'Food stores will not cover a full day — the settlement is warned',
      ),
      'warn',
    );
  } else if (days === STARVATION_GRACE_DAYS) {
    store.notify(
      bi(
        'ثلاثة أيام بلا طعام: الجوع بدأ يأكل أجساد أهلنا',
        'Three days without food: hunger has started to eat our people',
      ),
      'danger',
    );
  } else if (days === STARVATION_SEVERE_DAYS) {
    store.notify(
      bi(
        'أسبوع بلا طعام: العمارة تتهالك والعامة ت التمرّد',
        'A week without food: the settlement decays and the people riot',
      ),
      'danger',
    );
  }

  applyStarvationEffects(store, days);
  store.touch('starvation');
}

function applyStarvationEffects(store: GameStore, days: number): void {
  const state = store.state;
  const living = store.livingCharacters();
  const damage = days >= STARVATION_GRACE_DAYS ? Math.max(1, Math.round((days - 2) / 2)) : 0;

  for (const ch of living) {
    if (days < STARVATION_GRACE_DAYS) {
      ch.status.hunger = Math.max(0, ch.status.hunger - 20);
      continue;
    }
    ch.status.hunger = 0;
    ch.status.condition = 'starving';
    ch.health = Math.max(1, ch.health - damage);
    ch.stats.stamina = Math.max(0, ch.stats.stamina - 10);
    ch.status.morale = Math.max(0, ch.status.morale - 5);

    if (!ch.status.disease && store.rng.chance(0.2)) {
      ch.status.disease = {
        id: 'famine_fever',
        nameAr: 'حمى المجاعة',
        nameEn: 'Famine Fever',
        severity: days >= STARVATION_SEVERE_DAYS ? 2 : 1,
        daysLeft: 3,
      };
    }

    // Death is possible only in the most severe stage, and only for a
    // character that is already broken — never on the first missed day.
    if (days >= 10 && ch.health <= 1 && store.rng.chance(0.15)) {
      ch.alive = false;
      ch.causeOfDeath = 'starvation';
      ch.dayOfDeath = state.calendar.totalDays;
      store.emit('character:died', { id: ch.id, cause: 'starvation' });
    }
  }

  if (days >= STARVATION_SEVERE_DAYS) {
    state.base.unrest = Math.min(100, state.base.unrest + 3);
    for (const inst of state.base.buildings) {
      inst.condition = Math.max(0, inst.condition - 1);
    }
    if (days >= STARVATION_COLLAPSE_DAYS) {
      const ruined = state.base.buildings.filter((b) => !b.underConstruction && b.condition <= 0);
      if (ruined.length > 0) {
        const victim = store.rng.pick(ruined);
        state.base.buildings = state.base.buildings.filter((b) => b.id !== victim.id);
        const def = getBuildingDef(victim.defId);
        store.notify(
          bi(
            `انهار ${def?.nameAr ?? victim.defId} تحت وطأة الجوع`,
            `${def?.nameEn ?? victim.defId} collapsed under the famine`,
          ),
          'danger',
        );
      }
    }
  } else if (days >= STARVATION_GRACE_DAYS) {
    state.base.unrest = Math.min(100, state.base.unrest + 1);
  }
}

/* ------------------------------------------------------------------ */
/* Healing and disease                                                 */
/* ------------------------------------------------------------------ */

/** Base chance per day of catching a disease on normal difficulty. */
export const BASE_DAILY_DISEASE_CHANCE = 0.02;

/** Daily recovery: stamina, wounds and the slow end of illness. */
export function tickHealing(store: GameStore): void {
  const state = store.state;
  const bonus = settlementHealingBonus(state);
  const fed = starvationStatus(state).level === 'none';

  for (const ch of store.livingCharacters()) {
    ch.stats.stamina = Math.min(100, ch.stats.stamina + (fed ? 12 : 4) + bonus);

    if (fed) {
      if (ch.health < 100) ch.health = Math.min(100, ch.health + 1 + bonus);
      if (ch.status.condition === 'injured' && ch.health >= 60) ch.status.condition = 'healthy';
      if (ch.status.condition === 'starving' && ch.health > 20) ch.status.condition = 'healthy';
      if (ch.status.condition === 'ill' && !ch.status.disease) ch.status.condition = 'healthy';
    }

    if (ch.status.disease) {
      ch.status.disease.daysLeft -= 1;
      if (ch.status.disease.daysLeft <= 0) {
        ch.status.disease = undefined;
        if (ch.status.condition === 'ill') ch.status.condition = 'healthy';
      }
    }
  }
  store.touch('healing');
}

/**
 * Daily disease pressure: starvation and weakness make people fall ill.
 *
 * `difficulty.diseaseChance` is a MULTIPLIER (the same shape as enemyDamage),
 * applied to a small base rate. Treating it as an absolute probability made
 * every settlement sick every single day on normal difficulty.
 */
export function tickDisease(store: GameStore): void {
  const state = store.state;
  const resist = settlementDiseaseResist(state);
  const multiplier = state.difficulty?.diseaseChance ?? 1;
  const baseChance = Math.min(0.5, BASE_DAILY_DISEASE_CHANCE * multiplier);
  const status = starvationStatus(state).level;

  for (const ch of store.livingCharacters()) {
    if (ch.status.disease) continue;
    let chance = baseChance;
    if (status === 'critical') chance += 0.12;
    else if (status === 'severe') chance += 0.25;
    if (ch.health < 50) chance += 0.05;
    chance = Math.max(0, chance - resist);
    if (store.rng.chance(chance)) {
      ch.status.disease = {
        id: 'fever',
        nameAr: 'حمى',
        nameEn: 'Fever',
        severity: 1,
        daysLeft: 3,
      };
      ch.status.condition = 'ill';
      store.notify(bi(`${ch.firstName} مريض بالحمى`, `${ch.firstName} has fallen ill with a fever`), 'warn');
    }
  }
  store.touch('disease');
}

/* ------------------------------------------------------------------ */
/* Production and construction                                         */
/* ------------------------------------------------------------------ */

/** Daily production of every staffed and finished building. */
export function tickProduction(store: GameStore): void {
  const state = store.state;
  releaseDeadWorkers(store);

  const status = starvationStatus(state);
  const moraleFactor =
    status.level === 'none' ? 1 : status.level === 'warning' ? 0.95 : status.level === 'critical' ? 0.85 : 0.65;

  let produced = false;
  for (const inst of state.base.buildings) {
    if (inst.underConstruction) continue;
    const def = getBuildingDef(inst.defId);
    if (!def) continue;
    // Farms produce through the plant / grow / harvest cycle instead.
    if (def.farm) continue;
    if (!isStaffed(def, inst.assignedWorkers.length)) continue;
    if (!def.production) continue;

    const levelFactor = 1 + 0.35 * (inst.level - 1);
    const workerFactor =
      (def.workers ?? 0) > 0 ? Math.min(1.5, inst.assignedWorkers.length / (def.workers ?? 1)) : 1;

    for (const [key, base] of Object.entries(def.production)) {
      const amount = Math.floor(base * levelFactor * workerFactor * moraleFactor * store.rng.range(0.9, 1.1));
      if (amount > 0) {
        store.addResource(key as ResourceKey, amount);
        produced = true;
      }
    }

    if (def.upkeepFood && def.upkeepFood > 0) {
      const upkeep = Math.floor(def.upkeepFood * levelFactor);
      const paid = Math.min(store.getResource('food'), upkeep);
      if (paid > 0) store.addResource('food', -paid);
    }
  }

  tickFarms(store);
  regrowNodes(store);
  if (produced) store.touch('production');
}

/** Daily progress of every building under construction. */
export function tickConstruction(store: GameStore): void {
  const state = store.state;
  for (const inst of state.base.buildings) {
    if (!inst.underConstruction) continue;
    inst.constructionDaysLeft -= 1;
    if (inst.constructionDaysLeft > 0) continue;
    inst.constructionDaysLeft = 0;
    inst.underConstruction = false;
    inst.condition = 100;
    const def = getBuildingDef(inst.defId);
    store.notify(
      bi(
        `اكتمل بناء ${def?.nameAr ?? inst.defId}`,
        `Construction finished: ${def?.nameEn ?? inst.defId}`,
      ),
      'info',
    );
    store.chronicle(bi(`اكتمل بناء ${def?.nameAr ?? inst.defId}`, `${def?.nameEn ?? inst.defId} completed`));
  }
  store.touch('construction');
}

/* ------------------------------------------------------------------ */
/* Farming                                                             */
/* ------------------------------------------------------------------ */

function farmBuildings(state: GameState): { id: Id; def: GameBuildingDef }[] {
  const out: { id: Id; def: GameBuildingDef }[] = [];
  for (const inst of state.base.buildings) {
    if (inst.underConstruction) continue;
    const def = getBuildingDef(inst.defId);
    if (!def?.farm) continue;
    out.push({ id: inst.id, def });
  }
  return out;
}

/** Advances every planted field by one day. */
export function tickFarms(store: GameStore): void {
  const state = store.state;
  const runtime = getEconomyRuntime(state);
  for (const { id, def } of farmBuildings(state)) {
    const plot = runtime.farms[id];
    if (!plot) continue;
    if (!plot.planted) continue;
    if (plot.growthDaysLeft > 0) {
      plot.growthDaysLeft -= 1;
      if (plot.growthDaysLeft === 0) {
        store.notify(
          bi(`${def.nameAr} نضج ويمكن حصاده`, `${def.nameEn} is ripe and ready to harvest`),
          'info',
        );
      }
    }
  }
}

/** True when at least one field can be planted right now. */
export function canPlantFarm(store: GameStore): { ok: boolean; reason?: string } {
  const state = store.state;
  const runtime = getEconomyRuntime(state);
  const farms = farmBuildings(state);
  if (farms.length === 0) {
    return { ok: false, reason: bi('لا توجد أرض زراعية', 'There is no farmland') };
  }
  const free = farms.find((f) => !runtime.farms[f.id]?.planted);
  if (!free) {
    return { ok: false, reason: bi('كل الحقول مزروعة', 'Every field is already planted') };
  }
  const instance = state.base.buildings.find((b) => b.id === free.id);
  const staffed = !!instance && instance.assignedWorkers.length > 0;
  if (!staffed && availableWorkers(state).length === 0) {
    return { ok: false, reason: bi('لا يوجد عامل للزراعة', 'Nobody is free to work the fields') };
  }
  return { ok: true };
}

function availableWorkers(state: GameState): Character[] {
  const busy = new Set<Id>();
  for (const inst of state.base.buildings) {
    for (const id of inst.assignedWorkers) busy.add(id);
  }
  const out: Character[] = [];
  for (const id of state.characterOrder) {
    const ch = state.characters[id];
    if (!ch || !ch.alive) continue;
    if (busy.has(id)) continue;
    out.push(ch);
  }
  return out;
}

/**
 * Plants a field: it needs land (a farm building), a worker and time. The
 * worker is hired automatically when the farm has none.
 */
export function plantFarm(store: GameStore): boolean {
  const state = store.state;
  const runtime = getEconomyRuntime(state);
  const check = canPlantFarm(store);
  if (!check.ok) {
    store.notify(check.reason ?? bi('لا يمكن الزراعة', 'Cannot plant'), 'warn');
    return false;
  }

  const farms = farmBuildings(state);
  const target = farms.find((f) => !runtime.farms[f.id]?.planted);
  if (!target) return false;

  const instance = state.base.buildings.find((b) => b.id === target.id);
  if (!instance) return false;

  if (instance.assignedWorkers.length === 0) {
    const workers = availableWorkers(state);
    if (workers.length === 0) {
      store.notify(bi('لا يوجد عامل للزراعة', 'Nobody is free to work the fields'), 'warn');
      return false;
    }
    const farmer = workers.find((w) => w.job === 'farmer') ?? workers[0];
    instance.assignedWorkers.push(farmer.id);
  }

  const growDays = target.def.growDays ?? 4;
  runtime.farms[target.id] = {
    buildingId: target.id,
    planted: true,
    growthDaysLeft: growDays,
    growthDaysTotal: growDays,
    lastHarvestDay: state.calendar.totalDays,
  };
  store.notify(
    bi(`زرع الفلاح ${target.def.nameAr}، ولن ينضج قبل ${growDays} أيام`, `A field was sown; it ripens in ${growDays} days`),
    'info',
  );
  store.touch('farm:planted');
  return true;
}

/** Harvests a ripe field and empties it. */
export function harvestFarm(store: GameStore): { ok: boolean; reason?: string; food?: number } {
  const state = store.state;
  const runtime = getEconomyRuntime(state);
  const farms = farmBuildings(state);
  if (farms.length === 0) {
    return { ok: false, reason: bi('لا توجد أرض زراعية', 'There is no farmland') };
  }

  const ripe = farms.find((f) => {
    const plot = runtime.farms[f.id];
    return !!plot && plot.planted && plot.growthDaysLeft <= 0;
  });
  if (!ripe) {
    return { ok: false, reason: bi('الحقول لم تنضج بعد', 'No field is ripe yet') };
  }

  const instance = state.base.buildings.find((b) => b.id === ripe.id);
  const plot = runtime.farms[ripe.id];
  if (!instance || !plot) return { ok: false, reason: bi('الحقل غير موجود', 'The field is gone') };

  const levelFactor = 1 + 0.35 * (instance.level - 1);
  const bonus = 1 + settlementFarmYieldBonus(state);
  const base = ripe.def.harvestFood ?? 8;
  const food = Math.max(1, Math.round(base * levelFactor * bonus * store.rng.range(0.85, 1.15)));

  store.addResource('food', food);
  plot.planted = false;
  plot.growthDaysLeft = 0;
  plot.lastHarvestDay = state.calendar.totalDays;

  store.notify(
    bi(`حُصد الحقل: ${food} وحدة طعام`, `The field was harvested: ${food} food`),
    'info',
  );
  store.touch('farm:harvested');
  return { ok: true, food };
}

/* ------------------------------------------------------------------ */
/* Node regrowth                                                       */
/* ------------------------------------------------------------------ */

function regrowNodes(store: GameStore): void {
  const state = store.state;
  for (const node of state.world.resourceNodes) {
    if (node.amount >= node.maxAmount) continue;
    if (node.regrowIn > 0) {
      node.regrowIn -= 1;
      continue;
    }
    const amount = Math.max(1, Math.round(node.maxAmount * 0.15 * store.rng.range(0.8, 1.2)));
    node.amount = Math.min(node.maxAmount, node.amount + amount);
    node.regrowIn = NODE_REGROW_DAYS;
  }
}
