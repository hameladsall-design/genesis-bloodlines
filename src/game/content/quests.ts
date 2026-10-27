/**
 * Quest content.
 *
 * Static quest blueprints plus the small vocabulary used to read objective
 * progress out of the live world state. The simulation side (progress, reward
 * payout, failure) lives in `src/game/simulation/systems/quests.ts`.
 *
 * Every user-facing string exists in Arabic (primary) and English (fallback).
 */

import type { GameState, ResourceBag } from '../simulation/types';

/**
 * How the progress of an objective is measured against the world state.
 * The simulation knows how to read each of these from `GameState`.
 */
export type QuestObjectiveKind =
  | 'population'
  | 'recruits'
  | 'coins'
  | 'food'
  | 'wood'
  | 'stone'
  | 'iron'
  | 'herbs'
  | 'faction_reputation'
  | 'quests_completed'
  | 'visitors_resolved'
  | 'enemies_defeated'
  | 'day_survived';

export interface QuestObjectiveTemplate {
  textAr: string;
  textEn: string;
  target: number;
  /** Optional: how progress is measured. Defaults to `population`. */
  kind?: QuestObjectiveKind;
}

export interface QuestTemplate {
  id: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  objectives: QuestObjectiveTemplate[];
  rewards: { resources?: ResourceBag; xp?: number };
  /** Earliest day (total in-game days) the quest may become available. */
  unlockDay: number;
  /** Optional state requirement checked before the quest unlocks. */
  requires?: { kind: QuestObjectiveKind; target: number };
  /** Optional condition that fails the quest while it is active. */
  failWhen?: (state: GameState) => boolean;
  /** Built-in failure kind that survives a save/load. */
  failKind?: 'extinction';
  /** Optional number of days after acceptance before the quest fails. */
  deadlineDays?: number;
  failReasonAr?: string;
  failReasonEn?: string;
}

export const QUEST_TEMPLATES: QuestTemplate[] = [
  {
    id: 'establish_roots',
    titleAr: 'تأسيس الجذور',
    titleEn: 'Establish the Roots',
    descAr: 'المستوطنة تحتاج بيوتا وسكانا.',
    descEn: 'A settlement needs houses and people.',
    objectives: [
      {
        textAr: 'ابق خمسة من سلالتك على قيد الحياة',
        textEn: 'Keep five of your bloodline alive',
        target: 5,
        kind: 'population',
      },
    ],
    rewards: { resources: { coins: 30 }, xp: 20 },
    unlockDay: 0,
  },
  {
    id: 'stone_and_wood',
    titleAr: 'الحجر والخشب',
    titleEn: 'Stone and Wood',
    descAr: 'اجمع مواد البناء لسور الوادي.',
    descEn: 'Gather the material for the valley wall.',
    objectives: [
      { textAr: 'اجمع مئتين وخمسين وحدة خشب', textEn: 'Gather two hundred and fifty wood', target: 250, kind: 'wood' },
      { textAr: 'اجمع مئتي وحدة حجر', textEn: 'Gather two hundred stone', target: 200, kind: 'stone' },
    ],
    rewards: { resources: { tools: 2 }, xp: 30 },
    unlockDay: 3,
  },
  {
    id: 'first_contract',
    titleAr: 'اول عقد',
    titleEn: 'The First Contract',
    descAr: 'الحانة وحدها لا تبني أسرة.',
    descEn: 'The tavern alone builds no family.',
    objectives: [
      {
        textAr: 'ضم ثلاثة مقيمين الى العائلة',
        textEn: 'Recruit three residents into the household',
        target: 3,
        kind: 'recruits',
      },
    ],
    rewards: { resources: { coins: 50 }, xp: 40 },
    unlockDay: 10,
  },
  {
    id: 'gate_greetings',
    titleAr: 'تحيات البوابة',
    titleEn: 'Greetings at the Gate',
    descAr: 'تعامل مع الزوار وسجل مصائرهم.',
    descEn: 'Handle the visitors and record their fates.',
    objectives: [
      { textAr: 'تعامل مع ثلاثة زوار', textEn: 'Resolve three visitors', target: 3, kind: 'visitors_resolved' },
    ],
    rewards: { resources: { coins: 40, herbs: 3 }, xp: 35 },
    unlockDay: 12,
  },
  {
    id: 'full_bellies',
    titleAr: 'بطون شبعاء',
    titleEn: 'Full Bellies',
    descAr: 'خزن الطعام قبل حلول الشتاء.',
    descEn: 'Store the food before winter ends.',
    objectives: [
      { textAr: 'خزن مئة وخمسين وحدة طعام', textEn: 'Store a hundred and fifty food', target: 150, kind: 'food' },
    ],
    rewards: { resources: { coins: 60 }, xp: 25 },
    unlockDay: 20,
  },
  {
    id: 'standing_with_the_crown',
    titleAr: 'الوقوف مع التاج',
    titleEn: 'Standing with the Crown',
    descAr: 'اجعل سمعتك بين الفصائل تحترم اسمك.',
    descEn: 'Make the powers respect your name.',
    objectives: [
      {
        textAr: 'ارفع سمعتك الى اربعين مع الفصائل',
        textEn: 'Raise faction reputation to forty',
        target: 40,
        kind: 'faction_reputation',
      },
    ],
    rewards: { resources: { coins: 120 }, xp: 60 },
    unlockDay: 30,
  },
  {
    id: 'cull_the_beasts',
    titleAr: 'ذبح الوحوش',
    titleEn: 'Cull the Beasts',
    descAr: 'نظف الارض من تهديد الوحشي.',
    descEn: 'Clean the land of the things that hunt it.',
    objectives: [
      {
        textAr: 'اقتل خمسة اعداء',
        textEn: 'Defeat five enemies',
        target: 5,
        kind: 'enemies_defeated',
      },
    ],
    rewards: { resources: { bone: 5, leather: 5 }, xp: 120 },
    unlockDay: 45,
  },
  {
    id: 'lineage',
    titleAr: 'السلطنة',
    titleEn: 'The Lineage',
    descAr: 'اكبر سلالة في الوادي هي التي تصمد.',
    descEn: 'The largest bloodline in the valley is the one that survives.',
    objectives: [
      { textAr: 'اجمع اثني عشر من أبناء السلالة', textEn: 'Reach twelve living bloodline', target: 12, kind: 'population' },
    ],
    rewards: { resources: { coins: 200 }, xp: 200 },
    unlockDay: 60,
    requires: { kind: 'population', target: 8 },
  },
  {
    id: 'hold_the_line',
    titleAr: 'الصمود',
    titleEn: 'Hold the Line',
    descAr: 'لا يسقط الوادي ما لم يسقط آخر من يسكنه.',
    descEn: 'The valley does not fall while one bloodline still stands.',
    objectives: [
      { textAr: 'عش حتى اليوم الخمسين', textEn: 'Survive until day fifty', target: 50, kind: 'day_survived' },
    ],
    rewards: { resources: { coins: 150 }, xp: 100 },
    unlockDay: 5,
    deadlineDays: 90,
    failKind: 'extinction',
    failWhen: (state) => (state.characters ? Object.values(state.characters).filter((c) => c.alive).length : 0) < 1,
    failReasonAr: 'ماتت السلالة كلها.',
    failReasonEn: 'The whole bloodline died.',
  },
];
