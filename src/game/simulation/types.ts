/**
 * GENESIS: BLOODLINES — Shared domain contracts.
 *
 * This file is the single source of truth for the shape of game state.
 * It is owned by the core team: systems and content modules IMPORT from here
 * and MUST NOT mutate or extend it. Anything a module needs that is not
 * declared here is declared inside that module's own file.
 */

export type Id = string;

/** Biological sex used by the reproduction rules. */
export type Sex = 'male' | 'female' | 'none';

export type RaceId = string;
export type TraitId = string;
export type ItemId = string;
export type SkillId = string;
export type BuildingId = string;
export type EncounterId = string;
export type FactionId = string;
export type QuestId = string;
export type ZoneId = string;
export type LocusId = string;

/** A single allele pair: [maternal, paternal] slot values. */
export type Allele = TraitId | 'normal';

/** Map of locus id -> the two alleles carried by a character. */
export type Genotype = Record<LocusId, [Allele, Allele]>;

/* ------------------------------------------------------------------ */
/* Combat                                                             */
/* ------------------------------------------------------------------ */

export interface CombatStats {
  hp: number;
  damage: number;
  defense: number;
  stamina: number;
  speed: number;
  accuracy: number;
  evasion: number;
  critChance: number;
  magicResist: number;
  attackRange: number;
  attackSpeed: number;
}

export type StatusEffectKind =
  | 'bleed'
  | 'poison'
  | 'stun'
  | 'curse'
  | 'buff_attack'
  | 'buff_defense'
  | 'weaken';

export interface StatusEffect {
  id: Id;
  kind: StatusEffectKind;
  element?: DamageType;
  magnitude: number;
  remainingTurns: number;
}

export type DamageType = 'physical' | 'fire' | 'frost' | 'shadow' | 'holy' | 'arcane' | 'poison';

export interface Resistance {
  damageType: DamageType;
  resist: number;
  weakness?: number;
}

/* ------------------------------------------------------------------ */
/* Genetics                                                            */
/* ------------------------------------------------------------------ */

export type InheritanceMode = 'dominant' | 'recessive' | 'polygenic';

export interface TraitEffect {
  /** Flat additive stat modifiers applied when the trait is expressed. */
  stat?: Partial<CombatStats>;
  /** Multiplicative stat modifiers (1.2 = +20%). */
  statMultiplier?: Partial<CombatStats>;
  /** Skill/ability id unlocked by this trait. */
  ability?: SkillId;
  /** Years added to (or removed from) natural lifespan. */
  lifespanDelta?: number;
  /** 0..1 reduction in disease acquisition chance. */
  diseaseResistance?: number;
  /** Multiplier on reproduction chance. */
  fertility?: number;
  /** Trait also carries a hereditary illness risk. */
  hereditaryDisease?: boolean;
}

export interface TraitDef {
  id: TraitId;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  /** 1 = common, 5 = legendary. Drives tavern price and mutation rate. */
  rarity: number;
  inheritance: InheritanceMode;
  /**
   * Locus ids carrying this trait's allele. One locus for dominant/recessive,
   * two or more for polygenic traits (threshold-based expression).
   */
  loci: LocusId[];
  /** For polygenic mode: number of trait alleles required to express. */
  threshold?: number;
  effects: TraitEffect[];
  /** Species this trait is native to, if any. */
  originRace?: RaceId;
  /** Baseline probability this trait arises through mutation. */
  mutationChance: number;
}

/* ------------------------------------------------------------------ */
/* Species                                                            */
/* ------------------------------------------------------------------ */

export type SexSystem = 'binary' | 'none';

export interface SpeciesDef {
  id: RaceId;
  nameAr: string;
  nameEn: string;
  sexSystem: SexSystem;
  /** Natural lifespan range in years. */
  lifespan: [number, number];
  /** Age at which the species can reproduce. */
  maturityAge: number;
  /** Age at which the character is considered an adult for stats. */
  adultAge: number;
  /** 1 = common (human), 5 = legendary (dragon). */
  rarity: number;
  /** Multiplier applied to base combat stats. */
  statMultiplier: Partial<CombatStats>;
  /** 0..1 probability of conceiving when conditions are met. */
  fertility: number;
  /** Extra years of life added to human baseline by this species. */
  lifespanBonus: number;
  /** Trait ids native to this species. */
  nativeTraits: TraitId[];
  /** Species ids this species can reproduce with. 'all' = unrestricted. */
  compatibleWith: RaceId[] | 'all';
  /** Species ids that are NOT biologically compatible. */
  incompatibleWith: RaceId[];
  /** Short description used in UI cards. */
  descAr: string;
  descEn: string;
}

/* ------------------------------------------------------------------ */
/* Characters                                                         */
/* ------------------------------------------------------------------ */

export type PersonalityTrait =
  | 'brave'
  | 'timid'
  | 'aggressive'
  | 'kind'
  | 'greedy'
  | 'loyal'
  | 'ambitious'
  | 'lazy'
  | 'cunning'
  | 'devout';

export type JobId =
  | 'idle'
  | 'gatherer'
  | 'farmer'
  | 'hunter'
  | 'woodcutter'
  | 'miner'
  | 'smith'
  | 'healer'
  | 'soldier'
  | 'scholar'
  | 'trader';

export type Condition = 'healthy' | 'injured' | 'incapacitated' | 'ill' | 'starving' | 'dead';

export interface Relationship {
  targetId: Id;
  /** -100 .. 100 */
  affinity: number;
  kind: 'family' | 'friend' | 'rival' | 'partner' | 'mentor';
}

export interface FamilyLinks {
  fatherId?: Id;
  motherId?: Id;
  partnerIds: Id[];
  childIds: Id[];
  siblingIds: Id[];
}

export interface LifeEvent {
  day: number;
  year: number;
  text: string;
  kind:
    | 'birth'
    | 'death'
    | 'battle'
    | 'marriage'
    | 'illness'
    | 'recovery'
    | 'promotion'
    | 'recruit'
    | 'visitor'
    | 'building'
    | 'inheritance';
}

export interface CharacterStatus {
  condition: Condition;
  /** 0 = starving, 100 = fully fed. */
  hunger: number;
  /** 0..100 */
  morale: number;
  disease?: { id: string; nameAr: string; nameEn: string; severity: number; daysLeft: number };
  injury?: { id: string; nameAr: string; nameEn: string; severity: number; daysLeft: number };
  effects: StatusEffect[];
}

export interface Equipment {
  weapon?: ItemId;
  armor?: ItemId;
  accessory?: ItemId;
}

export interface Pregnancy {
  partnerId: Id;
  dueDay: number;
  /** Consecutive days remaining before the child is born. */
  daysLeft: number;
}

export interface Character {
  id: Id;
  firstName: string;
  familyName: string;
  sex: Sex;
  race: RaceId;
  /** Age in years (fractional between birthdays). */
  age: number;
  level: number;
  xp: number;
  xpToNext: number;
  /** Current hit points. */
  health: number;
  /** Level-scaled stats before trait effects. */
  baseStats: CombatStats;
  /** Final stats after traits, equipment, level growth. */
  stats: CombatStats;
  genotype: Genotype;
  /** Expressing trait ids, recomputed from the genotype. */
  phenotype: TraitId[];
  skills: SkillId[];
  equipment: Equipment;
  personality: PersonalityTrait[];
  relationships: Relationship[];
  family: FamilyLinks;
  status: CharacterStatus;
  history: LifeEvent[];
  alive: boolean;
  causeOfDeath?: string;
  dayOfDeath?: number;
  bornDay: number;
  /**
   * The age this character already had when they entered the world. Age is
   * then `startAge + elapsed days / 360`, so a founder who starts at 25 keeps
   * aging from 25 instead of being reset to zero on the first tick.
   */
  startAge?: number;
  isFounder: boolean;
  /** 'family' = blood relative, 'resident' = recruited into the household. */
  household: 'family' | 'resident';
  job: JobId;
  partnerId?: Id;
  pregnant?: Pregnancy;
  x: number;
  y: number;
  zone: ZoneId;
  portraitSeed: number;
  /** Ranked combat deaths are permanent and cannot be undone by a reload. */
  permadead?: boolean;
}

/* ------------------------------------------------------------------ */
/* Economy and base                                                   */
/* ------------------------------------------------------------------ */

export type ResourceKey =
  | 'wood'
  | 'stone'
  | 'iron'
  | 'food'
  | 'water'
  | 'coins'
  | 'tools'
  | 'herbs'
  | 'leather'
  | 'bone'
  | 'essence'
  | 'crystal';

export type ResourceBag = Partial<Record<ResourceKey, number>>;

export type BuildingCategory =
  | 'housing'
  | 'food'
  | 'storage'
  | 'workshop'
  | 'military'
  | 'healing'
  | 'research'
  | 'civic'
  | 'defense'
  | 'arcane';

export interface BuildingDef {
  id: BuildingId;
  nameAr: string;
  nameEn: string;
  category: BuildingCategory;
  cost: ResourceBag;
  /** In-game days to construct. */
  buildDays: number;
  /** Minimum base level required. */
  unlockBaseLevel: number;
  /** Building ids that must already exist. */
  requires?: BuildingId[];
  /** Population housing provided. */
  housing?: number;
  /** Workers required to operate. */
  workers?: number;
  /** Resource production per in-game day while staffed. */
  production?: ResourceBag;
  /** Food consumed per in-game day while staffed. */
  upkeepFood?: number;
  /** Storage capacity added. */
  storage?: number;
  /** Defense points added to the settlement. */
  defense?: number;
  /** Number of placement tiles occupied (w x h). */
  footprint: { w: number; h: number };
  maxLevel: number;
  /** Cost multipliers applied per upgrade level (index 1 = first upgrade). */
  upgradeCostMultiplier?: number[];
  descAr: string;
  descEn: string;
  /** Cosmetic palette key used by the renderer. */
  art: string;
}

export interface BuildingInstance {
  id: Id;
  defId: BuildingId;
  x: number;
  y: number;
  level: number;
  condition: number;
  underConstruction: boolean;
  constructionDaysLeft: number;
  assignedWorkers: Id[];
}

export interface BaseLevelDef {
  level: number;
  nameAr: string;
  nameEn: string;
  cost: ResourceBag;
  /** Population capacity granted at this level. */
  capacity: number;
  /** Buildable area in tiles (width x height). */
  area: { w: number; h: number };
  storage: number;
  defense: number;
  /** Building categories unlocked at this level. */
  unlocksCategories: BuildingCategory[];
  /** Building ids unlocked at this level. */
  unlocksBuildings: BuildingId[];
  /** Maximum building level allowed. */
  maxBuildingLevel: number;
  descAr: string;
  descEn: string;
}

export interface BaseState {
  level: number;
  capacity: number;
  buildings: BuildingInstance[];
  /** Settlement unrest 0..100. */
  unrest: number;
  /** Days the settlement has gone without enough food. */
  starvationDays: number;
  /** Days the settlement has been fully fed. */
  prosperityDays: number;
  /** Names of traditions/laws established by the player. */
  traditions: string[];
  titles: string[];
}

/* ------------------------------------------------------------------ */
/* World                                                              */
/* ------------------------------------------------------------------ */

export interface ResourceNode {
  id: Id;
  kind: ResourceKey;
  x: number;
  y: number;
  zone: ZoneId;
  amount: number;
  maxAmount: number;
  /** Days until this node regrows. */
  regrowIn: number;
  /** Gathering skill tier bonus. */
  hardness: number;
}

export type Weather = 'clear' | 'rain' | 'storm' | 'snow' | 'fog';

export interface Calendar {
  year: number;
  /** 1..12 */
  month: number;
  /** 1..30 */
  day: number;
  /** 0..23 */
  hour: number;
  minute: number;
  /** Total elapsed in-game days since world start. */
  totalDays: number;
}

export interface WorldState {
  seed: string;
  size: 'small' | 'medium' | 'large';
  calendar: Calendar;
  weather: Weather;
  /** Hours of daylight remaining / current daylight fraction 0..1. */
  daylight: number;
  resources: ResourceBag;
  resourceNodes: ResourceNode[];
  /** Where the settlement is anchored on the world map. */
  baseX: number;
  baseY: number;
  /** Regions unlocked by boss victories etc. */
  unlockedZones: ZoneId[];
}

/* ------------------------------------------------------------------ */
/* Tavern, visitors, recruitment                                      */
/* ------------------------------------------------------------------ */

export interface TavernCandidate {
  id: Id;
  character: Character;
  /** Coin cost to recruit. */
  price: number;
  /** Tier of the tavern slot (1 = common). */
  tier: number;
  /** Day the candidate appeared. */
  offeredDay: number;
  /** True when this candidate has already been bought. */
  taken: boolean;
}

export type VisitorDisposition = 'waiting' | 'recruited' | 'killed' | 'sent_away';

export interface Visitor {
  id: Id;
  character: Character;
  x: number;
  y: number;
  /** Day the visitor arrived. */
  arrivedDay: number;
  disposition: VisitorDisposition;
  /** Day the visitor was resolved. */
  resolvedDay?: number;
  /** Whether the player has been notified about the arrival. */
  notified: boolean;
}

/* ------------------------------------------------------------------ */
/* Factions and quests                                                */
/* ------------------------------------------------------------------ */

export type FactionRelation = 'ally' | 'trade' | 'neutral' | 'suspicious' | 'hostile' | 'war';

export interface Faction {
  id: FactionId;
  nameAr: string;
  nameEn: string;
  leaderId?: Id;
  population: number;
  territory: ZoneId[];
  resources: ResourceBag;
  military: number;
  /** -100..100 */
  reputation: number;
  relation: FactionRelation;
  goals: string[];
  history: string[];
}

export type QuestStatus = 'locked' | 'available' | 'active' | 'completed' | 'failed';

export interface Quest {
  id: QuestId;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  status: QuestStatus;
  objectives: { id: Id; textAr: string; textEn: string; target: number; progress: number }[];
  rewards: { resources?: ResourceBag; xp?: number; items?: ItemId[] };
  /** Minimum day the quest may become available. */
  unlockDay: number;
}

/* ------------------------------------------------------------------ */
/* Combat                                                             */
/* ------------------------------------------------------------------ */

export interface EnemyDef {
  id: Id;
  nameAr: string;
  nameEn: string;
  race: RaceId;
  level: number;
  stats: CombatStats;
  skills: SkillId[];
  resistances: Resistance[];
  weaknesses: Resistance[];
  xp: number;
  isBoss: boolean;
  /** Bosses get a special ability id. */
  special?: SkillId;
  descAr: string;
  descEn: string;
  art: string;
}

export interface LootEntry {
  resource?: ResourceKey;
  amount?: number;
  item?: ItemId;
  chance: number;
  min?: number;
  max?: number;
}

export interface EncounterDef {
  id: EncounterId;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  /** Stage index used for the difficulty curve. */
  stage: number;
  enemies: { enemyId: Id; count: number }[];
  loot: LootEntry[];
  /** Minimum player level recommended. */
  minLevel: number;
  /** Encounter kind drives the reward weighting. */
  kind: 'normal' | 'elite' | 'boss' | 'hunt';
  zone?: ZoneId;
  /** Required base level for the encounter to appear. */
  minBaseLevel?: number;
}

export interface CombatantState {
  characterId: Id;
  name: string;
  race: RaceId;
  sex: Sex;
  level: number;
  team: 'player' | 'enemy';
  hp: number;
  maxHp: number;
  stats: CombatStats;
  skills: SkillId[];
  equipment: Equipment;
  effects: StatusEffect[];
  resistances: Resistance[];
  weaknesses: Resistance[];
  isBoss: boolean;
  alive: boolean;
  /** For enemies, which EnemyDef this represents. */
  enemyId?: Id;
}

export type BattleMode = 'normal' | 'ranked';

export interface BattleResult {
  mode: BattleMode;
  victory: boolean;
  rounds: number;
  /** Characters permanently lost (ranked mode only). */
  casualties: Id[];
  /** Characters that were incapacitated but survive. */
  incapacitated: Id[];
  xpGained: Record<Id, number>;
  loot: ResourceBag;
  items: ItemId[];
  log: string[];
}

/* ------------------------------------------------------------------ */
/* Items and skills                                                   */
/* ------------------------------------------------------------------ */

export interface ItemDef {
  id: ItemId;
  nameAr: string;
  nameEn: string;
  kind: 'weapon' | 'armor' | 'accessory' | 'consumable' | 'material' | 'key';
  slot?: 'weapon' | 'armor' | 'accessory';
  stats?: Partial<CombatStats>;
  /** Consumable effects. */
  heal?: number;
  cures?: string[];
  rarity: number;
  price: number;
  descAr: string;
  descEn: string;
}

export interface SkillDef {
  id: SkillId;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  /** Damage multiplier. */
  power?: number;
  /** Cost in stamina. */
  staminaCost?: number;
  element?: DamageType;
  /** Status applied on hit. */
  applies?: StatusEffectKind;
  applyChance?: number;
  cooldown?: number;
  /** Passive stat modifiers. */
  passive?: Partial<CombatStats>;
  /** Skills unlocked at a given character level. */
  unlockLevel: number;
  /** Species allowed to learn this skill (undefined = anyone). */
  races?: RaceId[];
}

/* ------------------------------------------------------------------ */
/* New game configuration                                             */
/* ------------------------------------------------------------------ */

export interface NewGameConfig {
  founderName: string;
  familyName: string;
  dynastyName: string;
  emblem: string;
  primaryColor: string;
  secondaryColor: string;
  seed: string;
  worldSize: 'small' | 'medium' | 'large';
  difficulty: 'easy' | 'normal' | 'hard' | 'nightmare';
  enemyDensity: 'low' | 'normal' | 'high' | 'extreme';
  resourceAbundance: 'scarce' | 'normal' | 'abundant';
  diseaseFrequency: 'rare' | 'normal' | 'frequent';
  disasterFrequency: 'rare' | 'normal' | 'frequent';
  timeSpeed: 0 | 1 | 2 | 3;
}

export interface DifficultyProfile {
  enemyHealth: number;
  enemyDamage: number;
  enemyXp: number;
  lootMultiplier: number;
  diseaseChance: number;
  disasterChance: number;
  recruitmentPriceMultiplier: number;
}

/* ------------------------------------------------------------------ */
/* Root game state                                                    */
/* ------------------------------------------------------------------ */

export interface GameState {
  version: number;
  config: NewGameConfig;
  difficulty: DifficultyProfile;
  calendar: Calendar;
  weather: Weather;
  world: WorldState;
  characters: Record<Id, Character>;
  /** Order of characters for deterministic iteration. */
  characterOrder: Id[];
  base: BaseState;
  resources: ResourceBag;
  inventory: ResourceBag;
  equipmentItems: Record<Id, ItemDef>;
  tavern: TavernCandidate[];
  tavernRosterDay: number;
  visitors: Visitor[];
  factions: Record<FactionId, Faction>;
  quests: Quest[];
  /** Roster of character ids that were ever recruited (anti-duplicate). */
  recruitedIds: Id[];
  /** Currently active battle, if any. */
  battle: {
    mode: BattleMode;
    encounterId: EncounterId;
    combatants: CombatantState[];
    round: number;
    log: string[];
  } | null;
  /** Ids of characters that have died permanently in ranked combat. */
  permadeadIds: Id[];
  /** Notifications queued for the HUD. */
  notifications: { id: Id; text: string; kind: 'info' | 'warn' | 'danger'; day: number }[];
  /** Number of consecutive days food was insufficient. */
  starvationDays: number;
  /** Set once the tutorial has been dismissed. */
  tutorialComplete: boolean;
  /** Free-form dynasty records: laws, traditions, titles, honours. */
  dynastyRecords: string[];
  /** Ledger of the last 50 significant events for the history screen. */
  chronicle: { day: number; year: number; text: string }[];
}

/* ------------------------------------------------------------------ */
/* Events emitted by the simulation bus                               */
/* ------------------------------------------------------------------ */

export interface Notification {
  id: Id;
  text: string;
  kind: 'info' | 'warn' | 'danger';
  day: number;
}

export interface GameEventMap {
  'state:changed': { reason: string };
  'character:created': { id: Id };
  'character:leveled': { id: Id; level: number };
  'character:died': { id: Id; cause: string };
  'character:recruited': { id: Id };
  'character:born': { id: Id; motherId: Id; fatherId: Id };
  'resource:changed': { resource: ResourceKey; delta: number };
  'food:changed': { delta: number };
  'base:upgraded': { level: number };
  'building:placed': { id: Id; defId: BuildingId };
  'battle:started': { mode: BattleMode; encounterId: EncounterId };
  'battle:ended': { result: BattleResult };
  'visitor:arrived': { id: Id };
  'visitor:resolved': { id: Id; disposition: VisitorDisposition };
  'tavern:refreshed': { count: number };
  'quest:updated': { id: QuestId; status: QuestStatus };
  'time:day': { day: number };
  'notification': { id: Id; text: string; kind: 'info' | 'warn' | 'danger' };
  'game:loaded': { version: number };
}
