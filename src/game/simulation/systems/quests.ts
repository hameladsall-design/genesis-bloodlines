/**
 * Quests: objectives, prerequisites, rewards, failure and persistent progress.
 *
 * A quest keeps its own objective list on the state, so progress survives a
 * save/load round trip. Progress is only ever read from the live world
 * state, never guessed.
 */

import { newId } from '../ids';
import { QUEST_TEMPLATES, type QuestObjectiveKind, type QuestTemplate } from '../../content/quests';
import type { GameStore } from '../store';
import type { GameState, ItemId, Quest, QuestId, QuestStatus, ResourceBag } from '../types';

/** A quest plus the bookkeeping the simulation needs on top of it. */
export interface QuestExtended extends Quest {
  /** Maps an objective id to the kind of progress it tracks. */
  objectiveKinds?: Record<string, QuestObjectiveKind>;
  /** The day the quest was accepted, used for deadlines. */
  acceptedDay?: number;
  /** Days after acceptance before the quest fails. */
  deadlineDays?: number;
  /** State requirement that must hold before the quest unlocks. */
  requires?: { kind: QuestObjectiveKind; target: number };
  /** Built-in failure reason that survives a save/load. */
  failKind?: 'extinction';
  /** Extra failure condition (lost on save, the built-in kind persists). */
  failWhen?: (state: GameState) => boolean;
  failReasonAr?: string;
  failReasonEn?: string;
}

/** State extension used to remember how many enemies were defeated. */
export interface QuestProgressState extends GameState {
  enemiesDefeated?: number;
}

/** How many enemies the settlement has defeated so far. */
export function countEnemiesDefeated(state: GameState): number {
  return (state as QuestProgressState).enemiesDefeated ?? 0;
}

/** Records one defeated enemy (used by the visitor and combat systems). */
export function countEnemyDefeated(state: GameState): void {
  const extended = state as QuestProgressState;
  extended.enemiesDefeated = (extended.enemiesDefeated ?? 0) + 1;
}

/* ------------------------------------------------------------------ */
/* Objective reading                                                  */
/* ------------------------------------------------------------------ */

/** Reads the current value of an objective kind straight from the world. */
export function objectiveValue(store: GameStore, kind: QuestObjectiveKind): number {
  const state = store.state;
  switch (kind) {
    case 'population':
      return store.livingCount();
    case 'recruits':
      return state.recruitedIds?.length ?? 0;
    case 'coins':
      return store.getResource('coins');
    case 'food':
      return store.getResource('food');
    case 'wood':
      return store.getResource('wood');
    case 'stone':
      return store.getResource('stone');
    case 'iron':
      return store.getResource('iron');
    case 'herbs':
      return store.getResource('herbs');
    case 'faction_reputation': {
      const factions = Object.values(state.factions ?? {});
      let best = -100;
      for (const faction of factions) best = Math.max(best, faction.reputation);
      return factions.length ? best : 0;
    }
    case 'quests_completed':
      return (state.quests ?? []).filter((quest) => quest.status === 'completed').length;
    case 'visitors_resolved':
      return (state.visitors ?? []).filter((visitor) => visitor.disposition !== 'waiting').length;
    case 'enemies_defeated':
      return countEnemiesDefeated(state);
    case 'day_survived':
      return state.calendar.totalDays;
    default:
      return 0;
  }
}

function requirementsMet(store: GameStore, quest: QuestExtended): boolean {
  const requires = quest.requires;
  if (!requires) return true;
  return objectiveValue(store, requires.kind) >= requires.target;
}

/* ------------------------------------------------------------------ */
/* Creation                                                           */
/* ------------------------------------------------------------------ */

/**
 * Builds every quest from the content templates and installs them on the
 * state. Quests whose unlock day has passed are immediately available.
 */
export function createQuests(store: GameStore): Quest[] {
  const state = store.state;
  const quests: QuestExtended[] = [];

  for (const template of QUEST_TEMPLATES) {
    const objectives = template.objectives.map((objective) => ({
      id: newId('obj'),
      textAr: objective.textAr,
      textEn: objective.textEn,
      target: objective.target,
      progress: 0,
    }));
    const objectiveKinds: Record<string, QuestObjectiveKind> = {};
    template.objectives.forEach((objective, index) => {
      const created = objectives[index];
      if (created) objectiveKinds[created.id] = objective.kind ?? 'population';
    });

    const rewards: { resources?: ResourceBag; xp?: number; items?: ItemId[] } = {};
    if (template.rewards.resources) rewards.resources = { ...template.rewards.resources };
    if (template.rewards.xp !== undefined) rewards.xp = template.rewards.xp;

    const quest: QuestExtended = {
      id: template.id,
      titleAr: template.titleAr,
      titleEn: template.titleEn,
      descAr: template.descAr,
      descEn: template.descEn,
      status: 'locked',
      objectives,
      rewards,
      unlockDay: template.unlockDay,
      objectiveKinds,
    };
    if (template.requires) quest.requires = template.requires;
    if (template.deadlineDays !== undefined) quest.deadlineDays = template.deadlineDays;
    if (template.failKind) quest.failKind = template.failKind;
    if (template.failWhen) quest.failWhen = template.failWhen;
    if (template.failReasonAr) quest.failReasonAr = template.failReasonAr;
    if (template.failReasonEn) quest.failReasonEn = template.failReasonEn;

    quest.status =
      state.calendar.totalDays >= template.unlockDay && requirementsMet(store, quest)
        ? 'available'
        : 'locked';
    quests.push(quest);
  }

  state.quests = quests;
  store.touch('quests:create');
  return quests;
}

/* ------------------------------------------------------------------ */
/* Queries                                                            */
/* ------------------------------------------------------------------ */

/** Quests the player may accept right now. */
export function availableQuests(state: GameState): Quest[] {
  return (state.quests ?? []).filter((quest) => quest.status === 'available');
}

/** Quests that are currently being worked on. */
export function activeQuests(state: GameState): Quest[] {
  return (state.quests ?? []).filter((quest) => quest.status === 'active');
}

/* ------------------------------------------------------------------ */
/* Ticking                                                            */
/* ------------------------------------------------------------------ */

function failQuest(store: GameStore, quest: QuestExtended): void {
  quest.status = 'failed';
  store.emit('quest:updated', { id: quest.id, status: 'failed' });
  const reason = quest.failReasonAr ?? 'فشلت المهمة';
  store.notify(`فشلت المهمة ${quest.titleAr}: ${reason}`, 'danger');
  store.chronicle(`فشلت المهمة ${quest.titleAr}`);
}

function hasFailed(store: GameStore, quest: QuestExtended): boolean {
  const state = store.state;
  if (quest.failKind === 'extinction' && store.livingCount() < 1) return true;
  if (
    quest.deadlineDays !== undefined &&
    quest.acceptedDay !== undefined &&
    state.calendar.totalDays - quest.acceptedDay > quest.deadlineDays
  ) {
    return true;
  }
  if (quest.failWhen && quest.failWhen(state)) return true;
  return false;
}

/**
 * Updates quest progress from the world and completes quests whose targets
 * are met. Safe to call every day.
 */
export function tickQuests(store: GameStore): void {
  const state = store.state;
  const day = state.calendar.totalDays;

  for (const raw of state.quests ?? []) {
    const quest = raw as QuestExtended;
    if (quest.status === 'completed' || quest.status === 'failed') continue;

    if (quest.status === 'locked') {
      if (day >= quest.unlockDay && requirementsMet(store, quest)) {
        quest.status = 'available';
        store.emit('quest:updated', { id: quest.id, status: quest.status });
      } else {
        continue;
      }
    }

    if (quest.status === 'active' && hasFailed(store, quest)) {
      failQuest(store, quest);
      continue;
    }

    let allMet = true;
    for (const objective of quest.objectives) {
      const kind = quest.objectiveKinds?.[objective.id] ?? 'population';
      const value = objectiveValue(store, kind);
      // Progress only ever grows: it is persistent, never rewound.
      if (value > objective.progress) {
        objective.progress = Math.min(value, objective.target);
      }
      if (objective.progress < objective.target) allMet = false;
    }

    if (allMet && quest.objectives.length > 0) {
      if (quest.status === 'available') {
        quest.status = 'active';
        quest.acceptedDay = day;
        store.emit('quest:updated', { id: quest.id, status: quest.status });
      }
      completeQuest(store, quest.id);
    }
  }

  store.touch('quests:tick');
}

/** Accepts an available quest so the player starts working on it. */
export function acceptQuest(store: GameStore, questId: QuestId): boolean {
  const quest = (store.state.quests ?? []).find((entry) => entry.id === questId) as
    | QuestExtended
    | undefined;
  if (!quest) return false;
  if (quest.status !== 'available') return false;
  quest.status = 'active';
  quest.acceptedDay = store.state.calendar.totalDays;
  store.emit('quest:updated', { id: quest.id, status: quest.status });
  store.touch('quests:accept');
  return true;
}

/**
 * Hands in a quest: the status becomes `completed` and the rewards are
 * granted. Returns false when the quest is unknown or already finished.
 */
export function completeQuest(store: GameStore, questId: QuestId): boolean {
  const quest = (store.state.quests ?? []).find((entry) => entry.id === questId) as
    | QuestExtended
    | undefined;
  if (!quest) return false;
  if (quest.status === 'completed' || quest.status === 'failed') return false;

  const rewards = quest.rewards ?? {};
  if (rewards.resources) store.addResources(rewards.resources);
  if (rewards.xp && rewards.xp > 0) {
    const living = store.livingCharacters();
    if (living.length > 0) {
      const each = Math.max(1, Math.floor(rewards.xp / living.length));
      for (const character of living) {
        character.xp += each;
      }
    }
  }

  quest.status = 'completed';
  store.emit('quest:updated', { id: quest.id, status: quest.status });
  store.notify(`اكتملت المهمة ${quest.titleAr}`, 'info');
  store.chronicle(`اكتملت المهمة ${quest.titleAr}`);
  store.touch('quests:complete');
  return true;
}

/** The status of a quest, for UI panels that only need the enum. */
export function questStatus(state: GameState, questId: QuestId): QuestStatus | null {
  const quest = (state.quests ?? []).find((entry) => entry.id === questId);
  return quest ? quest.status : null;
}

/** Convenience helper for templates used outside of the quest system. */
export function questTemplate(id: string): QuestTemplate | undefined {
  return QUEST_TEMPLATES.find((template) => template.id === id);
}
