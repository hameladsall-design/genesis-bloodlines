/**
 * Turn based combat for GENESIS: BLOODLINES.
 *
 * TWO DISTINCT MODES:
 *
 *  - `normal`  : a fight between the household and the world. A character
 *                that reaches 0 HP is INCAPACITATED, never dead: it survives,
 *                is excluded from later battles until it heals, and is never
 *                added to `state.permadeadIds`.
 *  - `ranked`  : a fight to the death. A character that reaches 0 HP is DEAD:
 *                `alive` becomes false, `permadead` is set, the id is pushed
 *                into `state.permadeadIds`, the death is written into the
 *                family history and it stays dead after a save/reload.
 *
 * The simulation is deterministic: every roll comes from the seeded RNG that
 * is injected through the store, so the same seed and the same team always
 * produce the same battle.
 *
 * XP application lives here as well (see `applyBattleXp`) because the
 * progression system is owned by another module and may not exist yet.
 */

import type {
  BattleMode,
  BattleResult,
  Character,
  CombatantState,
  DamageType,
  EncounterDef,
  EncounterId,
  GameState,
  Id,
  Resistance,
  SkillDef,
  SkillId,
  StatusEffect,
  StatusEffectKind,
  EnemyDef,
} from '../types';
import type { GameStore } from '../store';
import { SKILLS } from '../../content/skills';
import {
  ENCOUNTERS,
  ENEMIES,
  encounterRecruitChance,
  encounterUnlocksZone,
  getEncounter,
} from '../../content/enemies';
import { getItem } from '../../content/items';
import { encounterXp, rollLoot } from './loot';
import { t } from '../../../i18n';

/** Maximum number of fighters a normal battle may field. */
export const MAX_NORMAL_TEAM = 10;
/** Maximum number of fighters a ranked battle may field. */
export const MAX_RANKED_TEAM = 10;
/** A battle that has not been decided after this many rounds is a loss. */
export const MAX_ROUNDS = 30;

const BASIC_ATTACK_COST = 3;

/* ------------------------------------------------------------------ */
/* Internal fighter model                                             */
/* ------------------------------------------------------------------ */

interface Fighter {
  combatant: CombatantState;
  skills: SkillDef[];
  cooldowns: Map<SkillId, number>;
  stamina: number;
  maxStamina: number;
  character?: Character;
  enemy?: EnemyDef;
}

/** Innate elemental profile of a race (players have no stored resistances). */
function raceResistances(race: string): { resistances: Resistance[]; weaknesses: Resistance[] } {
  switch (race) {
    case 'vampire':
      return {
        resistances: [{ damageType: 'shadow', resist: 0.35 }],
        weaknesses: [{ damageType: 'holy', resist: 0, weakness: 0.3 }],
      };
    case 'angel':
      return {
        resistances: [{ damageType: 'holy', resist: 0.25 }],
        weaknesses: [{ damageType: 'shadow', resist: 0, weakness: 0.3 }],
      };
    case 'demon':
    case 'half_demon':
      return {
        resistances: [{ damageType: 'shadow', resist: 0.25 }],
        weaknesses: [{ damageType: 'holy', resist: 0, weakness: 0.3 }],
      };
    case 'undead':
      return {
        resistances: [{ damageType: 'shadow', resist: 0.3 }],
        weaknesses: [{ damageType: 'holy', resist: 0, weakness: 0.35 }],
      };
    case 'dwarf':
      return {
        resistances: [{ damageType: 'physical', resist: 0.1 }],
        weaknesses: [{ damageType: 'fire', resist: 0, weakness: 0.2 }],
      };
    case 'giant':
      return {
        resistances: [{ damageType: 'physical', resist: 0.15 }],
        weaknesses: [{ damageType: 'arcane', resist: 0, weakness: 0.25 }],
      };
    default:
      return { resistances: [], weaknesses: [] };
  }
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                      */
/* ------------------------------------------------------------------ */

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function effectOf(fighter: Fighter, kind: StatusEffectKind): StatusEffect | undefined {
  return fighter.combatant.effects.find((effect) => effect.kind === kind);
}

/** Attack power after buffs, weakenings and curses. */
function effectiveDamage(fighter: Fighter): number {
  let damage = fighter.combatant.stats.damage;
  const buff = effectOf(fighter, 'buff_attack');
  if (buff) damage *= 1 + buff.magnitude;
  const weaken = effectOf(fighter, 'weaken');
  if (weaken) damage *= 1 - weaken.magnitude;
  const curse = effectOf(fighter, 'curse');
  if (curse) damage *= 1 - curse.magnitude;
  return Math.max(0, damage);
}

/** Defence after buffs. */
function effectiveDefense(fighter: Fighter): number {
  let defense = fighter.combatant.stats.defense;
  const buff = effectOf(fighter, 'buff_defense');
  if (buff) defense *= 1 + buff.magnitude;
  return Math.max(0, defense);
}

/** Probability that an attack lands. */
function hitChance(attacker: Fighter, defender: Fighter): number {
  let chance = attacker.combatant.stats.accuracy - defender.combatant.stats.evasion;
  chance += (attacker.combatant.level - defender.combatant.level) * 0.03;
  chance = clamp(chance, 0.3, 0.97);
  if (attacker.combatant.stats.attackRange < defender.combatant.stats.attackRange) {
    chance *= 0.5;
  }
  return chance;
}

/** Damage of a single attack, including element, resistance and crit. */
function computeDamage(
  rng: GameStore['rng'],
  attacker: Fighter,
  defender: Fighter,
  element: DamageType,
  power: number,
): { amount: number; crit: boolean } {
  let raw = effectiveDamage(attacker) * power;

  const defense = effectiveDefense(defender);
  if (element === 'physical') {
    raw *= 100 / (100 + defense * 1.6);
  } else {
    raw *= 100 / (100 + defense * 0.8);
  }

  let resist = 0;
  const resistRow = defender.combatant.resistances.find((row) => row.damageType === element);
  if (resistRow) resist += resistRow.resist;

  let weakness = 0;
  const weaknessRow = defender.combatant.weaknesses.find((row) => row.damageType === element);
  if (weaknessRow) weakness += weaknessRow.weakness ?? 0;

  if (element !== 'physical') {
    resist += clamp(defender.combatant.stats.magicResist, 0, 0.6);
  }

  raw *= 1 - clamp(resist, 0, 0.85);
  raw *= 1 + clamp(weakness, 0, 1);
  raw *= clamp(1 + (attacker.combatant.level - defender.combatant.level) * 0.04, 0.5, 1.5);
  raw *= rng.range(0.9, 1.1);

  const crit = rng.chance(clamp(attacker.combatant.stats.critChance, 0, 1));
  if (crit) raw *= 1.8;

  return { amount: Math.max(1, Math.round(raw)), crit };
}

/** Magnitude and duration of a status effect. */
function statusPayload(
  kind: StatusEffectKind,
  sourceDamage: number,
): { magnitude: number; turns: number } {
  switch (kind) {
    case 'bleed':
      return { magnitude: Math.max(1, Math.round(sourceDamage * 0.2)), turns: 3 };
    case 'poison':
      return { magnitude: Math.max(1, Math.round(sourceDamage * 0.18)), turns: 4 };
    case 'stun':
      return { magnitude: 1, turns: 1 };
    case 'curse':
      return { magnitude: 0.25, turns: 3 };
    case 'weaken':
      return { magnitude: 0.2, turns: 3 };
    case 'buff_attack':
      return { magnitude: 0.25, turns: 3 };
    case 'buff_defense':
      return { magnitude: 0.3, turns: 3 };
    default:
      return { magnitude: 0, turns: 0 };
  }
}

let statusCounter = 0;

function applyStatus(
  target: Fighter,
  kind: StatusEffectKind,
  magnitude: number,
  turns: number,
  element?: DamageType,
): void {
  if (turns <= 0) return;
  const existing = target.combatant.effects.find((effect) => effect.kind === kind);
  if (existing) {
    existing.remainingTurns = Math.max(existing.remainingTurns, turns);
    existing.magnitude = Math.max(existing.magnitude, magnitude);
    return;
  }
  statusCounter += 1;
  target.combatant.effects.push({
    id: `stf_${statusCounter}`,
    kind,
    element,
    magnitude,
    remainingTurns: turns,
  });
}

/* ------------------------------------------------------------------ */
/* Team helpers                                                       */
/* ------------------------------------------------------------------ */

/** A character may fight when it is alive, healthy enough and not permadead. */
export function isEligibleForBattle(c: Character): boolean {
  if (!c || !c.alive) return false;
  if (c.permadead) return false;
  if (c.status?.condition === 'incapacitated') return false;
  if (c.health <= 0) return false;
  return true;
}

/**
 * Checks whether a candidate may join the team.
 *
 * The player is never forced to fill the roster, but an eleventh fighter is
 * always refused with a clear reason.
 */
export function canJoinTeam(
  team: Character[],
  candidate: Character,
  mode: BattleMode,
): { ok: boolean; reason?: string } {
  const max = mode === 'ranked' ? MAX_RANKED_TEAM : MAX_NORMAL_TEAM;
  if (team.length >= max) {
    return {
      ok: false,
      reason: t(
        'combat.team.full',
        `لا يمكن إضافة المزيد: الفريق مكتمل (${max} أعضاء).`,
        `Cannot add more: the team is full (${max} members).`,
      ),
    };
  }
  if (!candidate.alive || candidate.permadead) {
    return {
      ok: false,
      reason: t(
        'combat.team.dead',
        'هذا المقاتل ميتٌ ولا يُختار في المعارك.',
        'This fighter is dead and cannot be fielded.',
      ),
    };
  }
  if (candidate.status?.condition === 'incapacitated' || candidate.health <= 0) {
    return {
      ok: false,
      reason: t(
        'combat.team.incapacitated',
        'هذا المقاتل مُعطَّلٌ حتى يُشفي.',
        'This fighter is incapacitated until healed.',
      ),
    };
  }
  if (team.some((member) => member.id === candidate.id)) {
    return {
      ok: false,
      reason: t(
        'combat.team.duplicate',
        'هذا المقاتل مُدرَجٌ في الفريق بالفعل.',
        'This fighter is already on the team.',
      ),
    };
  }
  return { ok: true };
}

/** Rough combat rating of a single character. */
export function teamPower(ch: Character): number {
  const stats = ch.stats;
  const hp = Math.max(0, ch.health);
  const power =
    hp * 0.35 +
    stats.damage * 3 +
    stats.defense * 1.2 +
    stats.stamina * 0.12 +
    stats.speed * 0.6 +
    stats.accuracy * 12 +
    stats.evasion * 8 +
    stats.critChance * 20 +
    stats.magicResist * 6 +
    ch.level * 3;
  return round1(power);
}

/** Total strength of a team; grows with every stronger member. */
export function estimateTeamStrength(characters: Character[]): number {
  let total = 0;
  for (const character of characters ?? []) {
    if (!character) continue;
    total += teamPower(character);
  }
  return round1(total);
}

/* ------------------------------------------------------------------ */
/* Ranked ladder                                                      */
/* ------------------------------------------------------------------ */

const RANK_TIERS: { min: number; tier: number; nameAr: string; nameEn: string }[] = [
  { min: 0, tier: 1, nameAr: 'مبتدئ', nameEn: 'Novice' },
  { min: 100, tier: 2, nameAr: 'برونزي', nameEn: 'Bronze' },
  { min: 250, tier: 3, nameAr: 'فضّي', nameEn: 'Silver' },
  { min: 500, tier: 4, nameAr: 'ذهبي', nameEn: 'Gold' },
  { min: 900, tier: 5, nameAr: 'بلاتيني', nameEn: 'Platinum' },
  { min: 1500, tier: 6, nameAr: 'ألماسي', nameEn: 'Diamond' },
];

/** Reputation tier of the household. */
export function rankTierFor(reputation: number): { tier: number; nameAr: string; nameEn: string } {
  const value = Number.isFinite(reputation) ? reputation : 0;
  let current = RANK_TIERS[0]!;
  for (const tier of RANK_TIERS) {
    if (value >= tier.min) current = tier;
  }
  return { tier: current.tier, nameAr: current.nameAr, nameEn: current.nameEn };
}

/** The best reputation the household has with any faction. */
function houseReputation(state: GameState): number {
  let best = 0;
  for (const faction of Object.values(state.factions ?? {})) {
    if (!faction) continue;
    if (faction.reputation > best) best = faction.reputation;
  }
  return best;
}

/** Ranked encounters the household may challenge at its current standing. */
export function rankedEncountersFor(state: GameState): EncounterDef[] {
  const tier = rankTierFor(houseReputation(state)).tier;
  const maxStage = tier * 2;
  return ENCOUNTERS.filter(
    (enc) =>
      (enc.kind === 'elite' || enc.kind === 'boss') &&
      enc.stage <= maxStage &&
      (enc.minBaseLevel ?? 1) <= state.base.level,
  );
}

/* ------------------------------------------------------------------ */
/* Battle setup                                                       */
/* ------------------------------------------------------------------ */

function makePlayerFighter(character: Character): Fighter {
  const maxHp = Math.max(1, character.stats.hp);
  const hp = clamp(character.health, 0, maxHp);
  const skillIds = (character.skills ?? []).filter((id) => !!SKILLS[id]);
  const profile = raceResistances(character.race);
  const combatant: CombatantState = {
    characterId: character.id,
    name: `${character.firstName} ${character.familyName}`.trim(),
    race: character.race,
    sex: character.sex,
    level: character.level,
    team: 'player',
    hp,
    maxHp,
    stats: { ...character.stats },
    skills: skillIds,
    equipment: { ...character.equipment },
    effects: (character.status?.effects ?? []).map((effect) => ({ ...effect })),
    resistances: profile.resistances,
    weaknesses: profile.weaknesses,
    isBoss: false,
    alive: character.alive && hp > 0,
  };
  return {
    combatant,
    skills: skillIds.map((id) => SKILLS[id]!).filter((skill) => !!skill),
    cooldowns: new Map<SkillId, number>(),
    stamina: Math.max(0, character.stats.stamina),
    maxStamina: Math.max(1, character.stats.stamina),
    character,
  };
}

function makeEnemyFighter(def: EnemyDef, index: number, difficulty: GameState['difficulty']): Fighter {
  const hpMult = difficulty.enemyHealth > 0 ? difficulty.enemyHealth : 1;
  const dmgMult = difficulty.enemyDamage > 0 ? difficulty.enemyDamage : 1;
  const maxHp = Math.max(1, Math.round(def.stats.hp * hpMult));
  const stats = {
    ...def.stats,
    hp: maxHp,
    damage: Math.max(1, Math.round(def.stats.damage * dmgMult)),
    defense: Math.max(0, Math.round(def.stats.defense * (1 + (dmgMult - 1) * 0.5))),
  };
  const combatant: CombatantState = {
    characterId: `${def.id}#${index}`,
    name: def.nameAr,
    race: def.race,
    sex: 'none',
    level: def.level,
    team: 'enemy',
    hp: maxHp,
    maxHp,
    stats,
    skills: def.skills.filter((id) => !!SKILLS[id]),
    equipment: {},
    effects: [],
    resistances: def.resistances ?? [],
    weaknesses: def.weaknesses ?? [],
    isBoss: def.isBoss,
    alive: true,
    enemyId: def.id,
  };
  return {
    combatant,
    skills: def.skills.filter((id) => !!SKILLS[id]).map((id) => SKILLS[id]!),
    cooldowns: new Map<SkillId, number>(),
    stamina: Math.max(0, def.stats.stamina),
    maxStamina: Math.max(1, def.stats.stamina),
    enemy: def,
  };
}

/* ------------------------------------------------------------------ */
/* Combat resolution                                                  */
/* ------------------------------------------------------------------ */

function chooseSkill(fighter: Fighter, rng: GameStore['rng']): SkillDef | undefined {
  const usable = fighter.skills.filter(
    (skill) =>
      (skill.power ?? 0) > 0 &&
      fighter.stamina >= (skill.staminaCost ?? 0) &&
      (fighter.cooldowns.get(skill.id) ?? 0) <= 0,
  );
  if (!usable.length) return undefined;

  const specialId = fighter.enemy?.special;
  if (specialId) {
    const special = usable.find((skill) => skill.id === specialId);
    if (special && rng.chance(0.55)) return special;
  }

  const strongest = usable.reduce((best, skill) =>
    (skill.power ?? 0) > (best.power ?? 0) ? skill : best,
  );

  if (fighter.enemy) {
    return rng.chance(0.7) ? strongest : rng.pick(usable);
  }

  // Players keep a stamina reserve instead of burning everything at once.
  const reserve = fighter.maxStamina * 0.6;
  if ((strongest.staminaCost ?? 0) > reserve) {
    const affordable = usable.filter((skill) => (skill.staminaCost ?? 0) <= reserve);
    if (affordable.length) {
      return affordable.reduce((best, skill) =>
        (skill.power ?? 0) > (best.power ?? 0) ? skill : best,
      );
    }
  }
  return strongest;
}

function performAttack(
  rng: GameStore['rng'],
  attacker: Fighter,
  defender: Fighter,
  skill: SkillDef | undefined,
  log: string[],
): void {
  const element: DamageType = skill?.element ?? 'physical';
  const power = skill?.power ?? 1;
  const cost = skill?.staminaCost ?? BASIC_ATTACK_COST;

  attacker.stamina = Math.max(0, attacker.stamina - cost);
  if (skill) {
    const cooldown = skill.cooldown ?? 0;
    if (cooldown > 0) attacker.cooldowns.set(skill.id, cooldown);
  }

  const label = skill ? skill.nameAr : t('combat.log.plain_attack', 'ضربة عادية', 'a plain strike');
  const chance = hitChance(attacker, defender);
  if (!rng.chance(chance)) {
    log.push(
      t(
        'combat.log.miss',
        `أخطأ ${attacker.combatant.name} ${defender.combatant.name} بـ«${label}».`,
        `${attacker.combatant.name} missed ${defender.combatant.name} with "${label}".`,
      ),
    );
    return;
  }

  const { amount, crit } = computeDamage(rng, attacker, defender, element, power);
  defender.combatant.hp = Math.max(0, defender.combatant.hp - amount);

  log.push(
    t(
      'combat.log.hit',
      `ضرب ${attacker.combatant.name} ${defender.combatant.name} بـ«${label}» ضررًا قدره ${amount}.`,
      `${attacker.combatant.name} hit ${defender.combatant.name} with "${label}" for ${amount} damage.`,
    ),
  );
  if (crit) {
    log.push(
      t(
        'combat.log.crit',
        `ضربةٌ قاتلة! ${amount} ضررًا.`,
        `A critical strike! ${amount} damage.`,
      ),
    );
  }

  if (skill?.applies && rng.chance(skill.applyChance ?? 0.5)) {
    const payload = statusPayload(skill.applies, effectiveDamage(attacker));
    const isBuff = skill.applies === 'buff_attack' || skill.applies === 'buff_defense';
    const affected = isBuff ? attacker : defender;
    applyStatus(affected, skill.applies, payload.magnitude, payload.turns, element);
    log.push(
      t(
        'combat.log.status',
        `تعرّض ${affected.combatant.name} لتأثير «${statusNameAr(skill.applies)}».`,
        `${affected.combatant.name} is affected by "${statusNameEn(skill.applies)}".`,
      ),
    );
  }

  if (defender.combatant.hp <= 0) {
    defender.combatant.alive = false;
    log.push(
      t(
        'combat.log.down',
        `سقط ${defender.combatant.name}.`,
        `${defender.combatant.name} fell.`,
      ),
    );
  }
}

/** Arabic label of a status effect. */
function statusNameAr(kind: StatusEffectKind): string {
  switch (kind) {
    case 'bleed':
      return 'نزيف';
    case 'poison':
      return 'سمّ';
    case 'stun':
      return 'ذهول';
    case 'curse':
      return 'لعنة';
    case 'buff_attack':
      return 'توهّج';
    case 'buff_defense':
      return 'حصانة';
    case 'weaken':
      return 'ذبول';
    default:
      return kind;
  }
}

/** English label of a status effect. */
function statusNameEn(kind: StatusEffectKind): string {
  switch (kind) {
    case 'bleed':
      return 'bleeding';
    case 'poison':
      return 'poison';
    case 'stun':
      return 'stun';
    case 'curse':
      return 'curse';
    case 'buff_attack':
      return 'battle rage';
    case 'buff_defense':
      return 'warding';
    case 'weaken':
      return 'weakening';
    default:
      return kind;
  }
}

/** Ages every effect of a fighter by one round and applies damage over time. */
function tickEffects(fighter: Fighter, log: string[]): void {
  const kept: StatusEffect[] = [];
  for (const effect of fighter.combatant.effects) {
    effect.remainingTurns -= 1;
    if (effect.remainingTurns <= 0) continue;
    kept.push(effect);
    if (effect.kind === 'bleed' || effect.kind === 'poison') {
      const damage = Math.max(1, Math.round(effect.magnitude));
      fighter.combatant.hp = Math.max(0, fighter.combatant.hp - damage);
      log.push(
        t(
          'combat.log.dot',
          `تعرّض ${fighter.combatant.name} لـ${damage} ضررًا من ${statusNameAr(effect.kind)}.`,
          `${fighter.combatant.name} takes ${damage} damage from ${statusNameEn(effect.kind)}.`,
        ),
      );
      if (fighter.combatant.hp <= 0) {
        fighter.combatant.alive = false;
        log.push(
          t(
            'combat.log.down',
            `سقط ${fighter.combatant.name}.`,
            `${fighter.combatant.name} fell.`,
          ),
        );
        break;
      }
    }
  }
  fighter.combatant.effects = kept;
}

/**
 * Resolves a battle and returns the result. The store is not mutated with
 * rewards or XP here: `applyBattleResult` does that. The current HP of every
 * participant is written back to the character sheet so the UI stays in sync.
 */
export function resolveBattle(
  store: GameStore,
  mode: BattleMode,
  encounterId: EncounterId,
  teamIds: Id[],
): BattleResult {
  const rng = store.rng;
  const result: BattleResult = {
    mode,
    victory: false,
    rounds: 0,
    casualties: [],
    incapacitated: [],
    xpGained: {},
    loot: {},
    items: [],
    log: [],
  };

  const encounter = getEncounter(encounterId);
  if (!encounter) {
    result.log.push(
      t(
        'combat.error.no_encounter',
        'لا يوجد ملتقى بهذا الاسم.',
        'No such encounter exists.',
      ),
    );
    return result;
  }

  const players: Fighter[] = [];
  for (const id of teamIds ?? []) {
    const character = store.getCharacter(id);
    if (!character) continue;
    if (!isEligibleForBattle(character)) continue;
    if (players.some((fighter) => fighter.combatant.characterId === id)) continue;
    players.push(makePlayerFighter(character));
  }

  const enemies: Fighter[] = [];
  for (const group of encounter.enemies) {
    const def = ENEMIES[group.enemyId];
    if (!def) continue;
    for (let i = 0; i < group.count; i += 1) {
      enemies.push(makeEnemyFighter(def, i, store.state.difficulty));
    }
  }

  store.emit('battle:started', { mode, encounterId });
  result.log.push(
    t(
      'combat.log.start',
      `بدأت المعركة: ${encounter.nameAr}.`,
      `The battle begins: ${encounter.nameEn}.`,
    ),
  );
  result.log.push(
    t(
      'combat.log.mode',
      mode === 'ranked'
        ? 'معركةٌ مُصنَّفة: الموت هنا دائم.'
        : 'معركةٌ عادية: السقوط لا يعني الموت.',
      mode === 'ranked'
        ? 'Ranked battle: death here is permanent.'
        : 'Normal battle: falling is not dying.',
    ),
  );

  const all: Fighter[] = [...players, ...enemies];
  store.state.battle = {
    mode,
    encounterId,
    combatants: all.map((fighter) => fighter.combatant),
    round: 0,
    log: result.log,
  };

  let finished = false;
  let round = 0;

  for (round = 1; round <= MAX_ROUNDS && !finished; round += 1) {
    result.rounds = round;
    result.log.push(
      t('combat.log.round', `الجولة ${round}.`, `Round ${round}.`),
    );

    const order = [...all].sort((a, b) => {
      const speedDiff = b.combatant.stats.speed - a.combatant.stats.speed;
      if (speedDiff !== 0) return speedDiff;
      if (a.combatant.team !== b.combatant.team) return a.combatant.team === 'player' ? -1 : 1;
      return a.combatant.characterId.localeCompare(b.combatant.characterId);
    });

    for (const fighter of order) {
      if (!fighter.combatant.alive) continue;

      tickEffects(fighter, result.log);
      if (!fighter.combatant.alive) continue;

      const stun = effectOf(fighter, 'stun');
      if (stun) {
        result.log.push(
          t(
            'combat.log.stunned',
            `لا يستطيع ${fighter.combatant.name} الحركة بسبب الذهول.`,
            `${fighter.combatant.name} cannot move, stunned.`,
          ),
        );
        continue;
      }

      const skill = chooseSkill(fighter, rng);
      if (!skill && fighter.stamina < BASIC_ATTACK_COST) {
        result.log.push(
          t(
            'combat.log.exhausted',
            `نفدت لياقة ${fighter.combatant.name}.`,
            `${fighter.combatant.name} runs out of stamina.`,
          ),
        );
        fighter.stamina = Math.min(fighter.maxStamina, fighter.stamina + fighter.maxStamina * 0.2);
        continue;
      }

      const target = pickTarget(fighter, all);
      if (!target) continue;
      performAttack(rng, fighter, target, skill, result.log);
    }

    for (const fighter of all) {
      fighter.stamina = Math.min(fighter.maxStamina, fighter.stamina + fighter.maxStamina * 0.08);
      for (const [id, turns] of fighter.cooldowns) {
        if (turns <= 1) fighter.cooldowns.delete(id);
        else fighter.cooldowns.set(id, turns - 1);
      }
    }

    if (store.state.battle) store.state.battle.round = round;

    const enemiesAlive = enemies.some((fighter) => fighter.combatant.alive);
    const playersAlive = players.some((fighter) => fighter.combatant.alive);
    if (!enemiesAlive) {
      result.victory = true;
      finished = true;
    } else if (!playersAlive) {
      finished = true;
    }
  }

  if (!finished && !result.victory) {
    result.log.push(
      t(
        'combat.log.timeout',
        'انتهى الوقت قبل الحسم، ويعود الجميع كما هم.',
        'The time limit is reached and everyone withdraws.',
      ),
    );
  }

  /* ---------------- write the outcome back ---------------- */

  const downedPlayers = players.filter((fighter) => !fighter.combatant.alive);
  for (const fighter of players) {
    const character = fighter.character;
    if (!character) continue;
    character.health = Math.max(0, Math.round(fighter.combatant.hp));
    character.status.effects = fighter.combatant.effects.map((effect) => ({
      ...effect,
      remainingTurns: Math.max(1, effect.remainingTurns),
    }));
  }

  for (const fighter of downedPlayers) {
    const id = fighter.combatant.characterId;
    if (mode === 'ranked') {
      result.casualties.push(id);
    } else {
      result.incapacitated.push(id);
    }
  }

  const survivors = players.filter((fighter) => fighter.combatant.alive);
  const totalXp = encounterXp(encounter, store.state.difficulty.enemyXp);
  const share = survivors.length
    ? Math.max(1, Math.round((totalXp * (result.victory ? 1.25 : 0.75)) / survivors.length))
    : 0;
  for (const fighter of survivors) {
    result.xpGained[fighter.combatant.characterId] = share;
  }

  if (result.victory) {
    const rolled = rollLoot(rng, encounter.loot, store.state.difficulty.lootMultiplier);
    result.loot = rolled.resources;
    result.items = rolled.items;

    const recruitChance = encounterRecruitChance(encounter.id);
    if (recruitChance > 0 && rng.chance(recruitChance)) {
      store.notify(
        t(
          'combat.log.recruit',
          'سمعُ جنديٍّ وصل إلى القرية بعد المعركة.',
          'Word of a fighter reaching the village after the battle.',
        ),
        'info',
      );
      store.chronicle(
        t(
          'combat.chronicle.recruit',
          'ظهر مرشّحٌ للتجنيد بعد المعركة.',
          'A recruit candidate appeared after the battle.',
        ),
      );
    }

    const unlocked = encounterUnlocksZone(encounter.id);
    if (unlocked && !store.state.world.unlockedZones.includes(unlocked)) {
      store.state.world.unlockedZones.push(unlocked);
      store.notify(
        t(
          'combat.log.zone',
          'فُتحت منطقةٌ جديدة بعد النصر.',
          'A new zone opens after the victory.',
        ),
        'info',
      );
      store.chronicle(
        t(
          'combat.chronicle.zone',
          'فُتحت منطقةٌ جديدة بعد النصر.',
          'A new zone was unlocked by the victory.',
        ),
      );
    }
  }

  result.log.push(
    result.victory
      ? t('combat.log.victory', 'انتهت المعركة بالنصر.', 'The battle ends in victory.')
      : t('combat.log.defeat', 'انتهت المعركة بالهزيمة.', 'The battle ends in defeat.'),
  );

  store.state.battle = null;
  store.emit('battle:ended', { result });
  store.touch('battle:resolved');

  return result;
}

/** Picks a living opponent for a fighter. */
function pickTarget(fighter: Fighter, all: Fighter[]): Fighter | undefined {
  const team = fighter.combatant.team;
  const candidates = all.filter(
    (other) => other.combatant.alive && other.combatant.team !== team,
  );
  if (!candidates.length) return undefined;
  // Prefer the weakest reachable target, which keeps fights readable.
  let best = candidates[0]!;
  for (const candidate of candidates) {
    if (candidate.combatant.hp < best.combatant.hp) best = candidate;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Applying the result                                                */
/* ------------------------------------------------------------------ */

/** Grows a character when it levels up. */
function growCharacterStats(character: Character): void {
  const hpFactor = 1.08;
  const dmgFactor = 1.06;
  const defFactor = 1.05;

  character.baseStats.hp = round1(character.baseStats.hp * hpFactor);
  character.baseStats.damage = round1(character.baseStats.damage * dmgFactor);
  character.baseStats.defense = round1(character.baseStats.defense * defFactor);
  character.baseStats.stamina = round1(character.baseStats.stamina + 4);
  character.baseStats.speed = round1(character.baseStats.speed + 0.4);

  character.stats.hp = round1(character.stats.hp * hpFactor);
  character.stats.damage = round1(character.stats.damage * dmgFactor);
  character.stats.defense = round1(character.stats.defense * defFactor);
  character.stats.stamina = round1(character.stats.stamina + 4);
  character.stats.speed = round1(character.stats.speed + 0.4);
  character.stats.critChance = round3(character.stats.critChance + 0.002);
  character.stats.magicResist = round3(character.stats.magicResist + 0.005);
  character.stats.evasion = round3(character.stats.evasion + 0.002);
  character.stats.accuracy = round3(character.stats.accuracy + 0.002);

  if (character.health > 0) {
    character.health = Math.min(character.stats.hp, round1(character.health * hpFactor));
  }
}

/**
 * Grants battle experience and levels the character up when it crosses the
 * threshold. The progression system is owned by another module, so the XP
 * bookkeeping lives here to avoid a circular dependency.
 */
function applyBattleXp(store: GameStore, character: Character, amount: number): void {
  if (!character || amount <= 0) return;
  if (!character.xpToNext || character.xpToNext <= 0) character.xpToNext = 100;
  character.xp += amount;
  let leveled = 0;
  while (character.xp >= character.xpToNext) {
    character.xp -= character.xpToNext;
    character.level += 1;
    character.xpToNext = Math.max(10, Math.round(character.xpToNext * 1.4 + 10));
    growCharacterStats(character);
    leveled += 1;
  }
  if (leveled > 0) {
    store.emit('character:leveled', { id: character.id, level: character.level });
  }
}

/**
 * Applies a resolved battle to the world: permanent deaths, incapacitations,
 * experience, resources and items.
 */
export function applyBattleResult(store: GameStore, result: BattleResult): void {
  const state = store.state;

  for (const id of result.casualties ?? []) {
    const character = store.getCharacter(id);
    if (!character) continue;

    // A normal battle NEVER kills: such a casualty is only incapacitated.
    if (result.mode !== 'ranked') {
      character.health = 0;
      character.status.condition = 'incapacitated';
      continue;
    }

    character.alive = false;
    character.permadead = true;
    const cause = character.causeOfDeath ?? 'battle';
    character.causeOfDeath = cause;
    character.dayOfDeath = state.calendar.totalDays;
    character.health = 0;
    character.history.push({
      day: state.calendar.totalDays,
      year: state.calendar.year,
      text: t(
        'combat.history.death',
        `قُتل ${character.firstName} في معركة مُصنَّفة ولم يعد.`,
        `${character.firstName} was killed in a ranked battle and did not return.`,
      ),
      kind: 'death',
    });
    if (!state.permadeadIds.includes(id)) state.permadeadIds.push(id);
    store.emit('character:died', { id, cause });
    store.chronicle(
      t(
        'combat.chronicle.death',
        `مات ${character.firstName} في معركة مُصنَّفة.`,
        `${character.firstName} died in a ranked battle.`,
      ),
    );
  }

  for (const id of result.incapacitated ?? []) {
    const character = store.getCharacter(id);
    if (!character) continue;
    character.health = 0;
    character.status.condition = 'incapacitated';
    character.history.push({
      day: state.calendar.totalDays,
      year: state.calendar.year,
      text: t(
        'combat.history.incapacitated',
        `سقط ${character.firstName} في معركةٍ عادية ونجا من الموت.`,
        `${character.firstName} fell in a normal battle and survived.`,
      ),
      kind: 'battle',
    });
  }

  for (const [id, xp] of Object.entries(result.xpGained ?? {})) {
    const character = store.getCharacter(id);
    if (!character) continue;
    if (!character.alive) continue;
    applyBattleXp(store, character, xp);
  }

  const loot = result.loot ?? {};
  if (Object.keys(loot).length) {
    store.addResources(loot);
    const food = loot.food ?? 0;
    if (food) store.emit('food:changed', { delta: food });
  }

  for (const itemId of result.items ?? []) {
    const def = getItem(itemId);
    if (!def) continue;
    if (!state.equipmentItems[itemId]) state.equipmentItems[itemId] = def;
  }

  store.notify(
    result.victory
      ? t('combat.notify.victory', 'انتهت المعركة بالنصر.', 'The battle ended in victory.')
      : t('combat.notify.defeat', 'انتهت المعركة بالهزيمة.', 'The battle ended in defeat.'),
    result.victory ? 'info' : 'warn',
  );

  store.touch('battle:result');
}
