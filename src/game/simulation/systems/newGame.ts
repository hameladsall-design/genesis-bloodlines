/**
 * New game creation.
 *
 * Turns a NewGameConfig into a fully-formed GameState: the founder, the
 * initial shelter, the world, the starting stock and the difficulty profile.
 */

import { createRng } from '../rng';
import { createCalendar } from '../calendar';
import { newId } from '../ids';
import type {
  DifficultyProfile,
  GameState,
  NewGameConfig,
  ResourceBag,
} from '../types';
import { generateResourceNodes, WORLD_SIZES } from './world';
import { createFounder } from './family';
import { baseStatsFor, getSpecies } from '../../content/species';
import { ZONES as ENCOUNTER_ZONES } from '../../content/enemies';

export const DEFAULT_CONFIG: NewGameConfig = {
  founderName: 'آرِس',
  familyName: 'لعنة الدم',
  dynastyName: 'سلالات الدم',
  emblem: 'crown',
  primaryColor: '#7a1f2b',
  secondaryColor: '#c8a24a',
  seed: 'genesis-001',
  worldSize: 'medium',
  difficulty: 'normal',
  enemyDensity: 'normal',
  resourceAbundance: 'normal',
  diseaseFrequency: 'normal',
  disasterFrequency: 'normal',
  timeSpeed: 1,
};

export const DIFFICULTY_PROFILES: Record<NewGameConfig['difficulty'], DifficultyProfile> = {
  easy: {
    enemyHealth: 0.75,
    enemyDamage: 0.6,
    enemyXp: 0.8,
    lootMultiplier: 1.3,
    diseaseChance: 0.5,
    disasterChance: 0.4,
    recruitmentPriceMultiplier: 0.8,
  },
  normal: {
    enemyHealth: 1,
    enemyDamage: 1,
    enemyXp: 1,
    lootMultiplier: 1,
    diseaseChance: 1,
    disasterChance: 1,
    recruitmentPriceMultiplier: 1,
  },
  hard: {
    enemyHealth: 1.35,
    enemyDamage: 1.35,
    enemyXp: 1.4,
    lootMultiplier: 0.8,
    diseaseChance: 1.5,
    disasterChance: 1.6,
    recruitmentPriceMultiplier: 1.25,
  },
  nightmare: {
    enemyHealth: 1.8,
    enemyDamage: 1.8,
    enemyXp: 2,
    lootMultiplier: 0.65,
    diseaseChance: 2.2,
    disasterChance: 2.4,
    recruitmentPriceMultiplier: 1.6,
  },
};

export const ENEMY_DENSITY_SCALE: Record<NewGameConfig['enemyDensity'], number> = {
  low: 0.7,
  normal: 1,
  high: 1.4,
  extreme: 1.9,
};

/** How the chosen frequency setting scales the base rates. */
const DISEASE_FREQUENCY_SCALE: Record<NewGameConfig['diseaseFrequency'], number> = {
  rare: 0.5,
  normal: 1,
  frequent: 2,
};

const DISASTER_FREQUENCY_SCALE: Record<NewGameConfig['disasterFrequency'], number> = {
  rare: 0.5,
  normal: 1,
  frequent: 2,
};

/** Starting stock, scaled by the chosen resource abundance. */
function startingStock(abundance: NewGameConfig['resourceAbundance']): ResourceBag {
  const mult = abundance === 'scarce' ? 0.5 : abundance === 'abundant' ? 2 : 1;
  return {
    wood: Math.round(120 * mult),
    stone: Math.round(80 * mult),
    iron: Math.round(20 * mult),
    food: Math.round(45 * mult),
    water: Math.round(60 * mult),
    coins: Math.round(120 * mult),
    tools: Math.round(12 * mult),
    herbs: Math.round(8 * mult),
    leather: Math.round(6 * mult),
    bone: Math.round(4 * mult),
    essence: 0,
    crystal: 0,
  };
}

/**
 * Creates a brand-new game state from the player's configuration.
 */
export function createNewGame(config: NewGameConfig): GameState {
  const rng = createRng(config.seed);
  const profile = WORLD_SIZES[config.worldSize];
  const calendar = createCalendar();
  const difficulty = { ...DIFFICULTY_PROFILES[config.difficulty] };

  // The frequency settings are independent axes on top of the difficulty.
  difficulty.diseaseChance *= DISEASE_FREQUENCY_SCALE[config.diseaseFrequency];
  difficulty.disasterChance *= DISASTER_FREQUENCY_SCALE[config.disasterFrequency];

  const founder = createFounder(config, rng);
  founder.x = Math.round(profile.extent / 2);
  founder.y = Math.round(profile.extent / 2);

  const resourceNodes = generateResourceNodes(rng, config.worldSize, config.resourceAbundance);

  const state: GameState = {
    version: 1,
    config,
    difficulty,
    calendar,
    weather: 'clear',
    world: {
      seed: config.seed,
      size: config.worldSize,
      calendar,
      weather: 'clear',
      daylight: 1,
      resources: {},
      resourceNodes,
      baseX: founder.x,
      baseY: founder.y,
      // The first stage's hunting ground is open from day one, so the player
      // always has something to fight. Later zones open through boss victories.
      unlockedZones: ['wilds', ENCOUNTER_ZONES.ashfallRoad],
    },
    characters: {},
    characterOrder: [],
    base: {
      level: 1,
      capacity: 10,
      buildings: [],
      unrest: 0,
      starvationDays: 0,
      prosperityDays: 0,
      traditions: [],
      titles: [],
    },
    resources: startingStock(config.resourceAbundance),
    inventory: {},
    equipmentItems: {},
    tavern: [],
    tavernRosterDay: 0,
    visitors: [],
    factions: {},
    quests: [],
    recruitedIds: [],
    battle: null,
    permadeadIds: [],
    notifications: [],
    starvationDays: 0,
    tutorialComplete: false,
    dynastyRecords: [],
    chronicle: [],
  };

  state.characters[founder.id] = founder;
  state.characterOrder.push(founder.id);
  state.recruitedIds.push(founder.id);

  state.chronicle.push({
    day: 0,
    year: 1,
    text: `بدأ السلالة في ربيع العالم المتصدع: ${founder.firstName} ${founder.familyName}، مؤسس سلالة ${config.dynastyName}.`,
  });

  return state;
}

/** Starter stats helper reused by tests and the founder flow. */
export function founderBaseStats(race = 'human') {
  return baseStatsFor(getSpecies(race).id);
}

/** A fresh id for a save slot label. */
export function newSaveLabel(): string {
  return newId('save');
}
