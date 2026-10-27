/**
 * GENESIS: BLOODLINES — Base progression table.
 *
 * Exactly ten levels, from a desperate shelter to a royal capital. Every level:
 *  - raises the population capacity,
 *  - expands the buildable tile grid (area.w x area.h, origin at 0,0),
 *  - raises the storage cap and the settlement defense,
 *  - unlocks new building ids and at least one new building category.
 *
 * `cost` is the price of REACHING that level (what `upgradeBase` charges when
 * moving from level-1 to level-2 is therefore BASE_LEVELS[1].cost).
 *
 * `unlocksBuildings` lists the buildings that become available exactly at that
 * level. It is kept in sync with `unlockBaseLevel` on every building def
 * (tests/base.test.ts asserts the two never drift apart).
 */

import type { BaseLevelDef, BuildingCategory, BuildingId } from '../simulation/types';

export const BASE_LEVELS: BaseLevelDef[] = [
  {
    level: 1,
    nameAr: 'مأوى أساسي',
    nameEn: 'Basic Shelter',
    cost: { wood: 20, stone: 10, coins: 10 },
    capacity: 10,
    area: { w: 10, h: 8 },
    storage: 120,
    defense: 5,
    unlocksCategories: ['housing'],
    unlocksBuildings: ['tent', 'mud_hut'],
    maxBuildingLevel: 1,
    descAr: 'مأوى خشبي مغطى بالقماش، بالكاد يحمي أهله من المطر والريح.',
    descEn: 'A cloth-covered wooden lean-to that barely keeps the rain off its people.',
  },
  {
    level: 2,
    nameAr: 'مأوى مُحصَّن',
    nameEn: 'Reinforced Shelter',
    cost: { wood: 50, stone: 30, coins: 40 },
    capacity: 16,
    area: { w: 12, h: 9 },
    storage: 180,
    defense: 10,
    unlocksCategories: ['housing', 'food', 'civic'],
    unlocksBuildings: ['longhouse', 'small_farm', 'fishing_hut', 'tavern'],
    maxBuildingLevel: 2,
    descAr: 'جدران مدعّمة بالحجارة وأخشاب متينة، وصارت كلمة «مأوى» تثير الحذر.',
    descEn: 'Walls braced with stone and timber, and the first tavern to trade rumours in.',
  },
  {
    level: 3,
    nameAr: 'معسكر خشبي',
    nameEn: 'Wooden Camp',
    cost: { wood: 90, stone: 55, coins: 70 },
    capacity: 24,
    area: { w: 14, h: 10 },
    storage: 260,
    defense: 16,
    unlocksCategories: ['housing', 'food', 'civic', 'storage'],
    unlocksBuildings: ['stone_cottage', 'mushroom_cellar', 'grain_farm', 'market', 'wood_pile', 'granary'],
    maxBuildingLevel: 3,
    descAr: 'مخازن وسوق ومزارع صغيرة: الأرض صارت تنتج أكثر مما تأكل.',
    descEn: 'Granaries, a market and small fields: the land now yields more than it consumes.',
  },
  {
    level: 4,
    nameAr: 'معسكر مُحصَّن',
    nameEn: 'Fortified Camp',
    cost: { wood: 130, stone: 110, iron: 20, coins: 120 },
    capacity: 34,
    area: { w: 16, h: 11 },
    storage: 360,
    defense: 24,
    unlocksCategories: ['housing', 'food', 'civic', 'storage', 'workshop'],
    unlocksBuildings: ['elf_glade_lodge', 'orchard', 'temple', 'carpentry', 'sawmill', 'stone_quarry', 'iron_vault'],
    maxBuildingLevel: 4,
    descAr: 'مناجم الحجار والنجارة تخدم الحامية، ومعبد يخفض غضب العامة.',
    descEn: 'Quarries and carpenters serve the garrison, and a temple softens the crowd.',
  },
  {
    level: 5,
    nameAr: 'حصن صغير',
    nameEn: 'Small Stronghold',
    cost: { wood: 160, stone: 180, iron: 45, coins: 200 },
    capacity: 48,
    area: { w: 18, h: 13 },
    storage: 500,
    defense: 35,
    unlocksCategories: ['housing', 'food', 'civic', 'storage', 'workshop', 'military'],
    unlocksBuildings: ['noble_quarters', 'greenhouse', 'bathhouse', 'mining_camp', 'tannery', 'barracks', 'weapon_shop', 'warehouse'],
    maxBuildingLevel: 5,
    descAr: 'ثكنات وورش تسليح: العائلة تحكم أرضًا وتردّ بسلاح.',
    descEn: 'Barracks and armoury: the family rules land and answers in steel.',
  },
  {
    level: 6,
    nameAr: 'قلعة حجرية',
    nameEn: 'Stone Fortress',
    cost: { wood: 120, stone: 320, iron: 90, coins: 340 },
    capacity: 66,
    area: { w: 21, h: 14 },
    storage: 700,
    defense: 50,
    unlocksCategories: ['housing', 'food', 'civic', 'storage', 'workshop', 'military', 'defense'],
    unlocksBuildings: ['apartment_block', 'great_kitchen', 'guild_hall', 'blacksmith', 'iron_mine', 'armoury', 'training_ground', 'wooden_palisade', 'watchtower'],
    maxBuildingLevel: 6,
    descAr: 'أسوار وبرج مراقبة ومطرقة الكبار: القلعة تصمد أمام الفرسان.',
    descEn: 'Palisades, watchtowers and a real forge: the fortress holds against riders.',
  },
  {
    level: 7,
    nameAr: 'قلعة موسَّعة',
    nameEn: 'Expanded Fortress',
    cost: { wood: 200, stone: 520, iron: 160, coins: 560 },
    capacity: 88,
    area: { w: 24, h: 16 },
    storage: 950,
    defense: 68,
    unlocksCategories: ['housing', 'food', 'civic', 'storage', 'workshop', 'military', 'defense', 'healing', 'arcane'],
    unlocksBuildings: ['slum_district', 'treasury', 'bone_carver', 'apothecary', 'town_hall', 'infirmary', 'elf_grove', 'vampire_crypt', 'stable', 'stone_wall'],
    maxBuildingLevel: 7,
    descAr: 'مستوصفات وقبو شفاء وبستان الجنية: أسرار المدينة صارت أعمق من بيوتها.',
    descEn: 'Clinics, apothecaries and an elven grove: secrets deeper than the city.',
  },
  {
    level: 8,
    nameAr: 'مستوطنة',
    nameEn: 'Settlement',
    cost: { wood: 320, stone: 800, iron: 280, coins: 900 },
    capacity: 120,
    area: { w: 27, h: 18 },
    storage: 1250,
    defense: 90,
    unlocksCategories: ['housing', 'food', 'civic', 'storage', 'workshop', 'military', 'defense', 'healing', 'arcane', 'research'],
    unlocksBuildings: ['adventurers_guild', 'dwarven_forge', 'mercenary_camp', 'gatehouse', 'hospital', 'orc_war_totem', 'spirit_grove', 'library'],
    maxBuildingLevel: 8,
    descAr: 'مكتبة ومستشفى ونادي المحارفين: المعرفة صارت سلاحًا.',
    descEn: 'Library, hospital and an adventurers guild: knowledge became a weapon.',
  },
  {
    level: 9,
    nameAr: 'مدينة',
    nameEn: 'Town',
    cost: { wood: 500, stone: 1200, iron: 460, coins: 1400 },
    capacity: 165,
    area: { w: 31, h: 20 },
    storage: 1650,
    defense: 118,
    unlocksCategories: ['housing', 'food', 'civic', 'storage', 'workshop', 'military', 'defense', 'healing', 'arcane', 'research'],
    unlocksBuildings: ['bastion', 'quarantine_ward', 'school', 'observatory', 'angel_shrine', 'demon_sacrificial_altar', 'dwarven_hall'],
    maxBuildingLevel: 9,
    descAr: 'مدارس ومراصد وأضرحة ملعونة: المدينة تعرف ما لا ينبغي أن تعرف.',
    descEn: 'Schools, observatories and cursed altars: the city knows too much.',
  },
  {
    level: 10,
    nameAr: 'عاصمة المملكة',
    nameEn: 'Kingdom Capital',
    cost: { wood: 800, stone: 1900, iron: 780, coins: 2300 },
    capacity: 240,
    area: { w: 36, h: 24 },
    storage: 2200,
    defense: 160,
    unlocksCategories: ['housing', 'food', 'civic', 'storage', 'workshop', 'military', 'defense', 'healing', 'arcane', 'research'],
    unlocksBuildings: ['arcane_laboratory', 'crystal_spire', 'giant_stone_hall'],
    maxBuildingLevel: 10,
    descAr: 'برج بلور ومختبر سحري وقاعة العمالقة: عاصمة تسير على خوف الجميع.',
    descEn: 'Crystal spire, arcane laboratory and a giant hall: a capital built on fear.',
  },
];

/** All categories, in the order they are introduced. */
export const BUILDING_CATEGORIES: BuildingCategory[] = [
  'housing',
  'food',
  'storage',
  'workshop',
  'military',
  'defense',
  'healing',
  'research',
  'civic',
  'arcane',
];

/**
 * Returns the definition of a base level. Out-of-range levels are clamped to
 * the nearest existing level so that a corrupted save can never crash the UI.
 */
export function getBaseLevel(level: number): BaseLevelDef {
  const found = BASE_LEVELS.find((l) => l.level === level);
  if (found) return found;
  if (!Number.isFinite(level) || level < BASE_LEVELS[0].level) return BASE_LEVELS[0];
  return BASE_LEVELS[BASE_LEVELS.length - 1];
}

/** The level above the current one, or undefined at the maximum level. */
export function nextBaseLevel(current: number): BaseLevelDef | undefined {
  return BASE_LEVELS.find((l) => l.level === current + 1);
}

/** The level below the current one, or undefined at the minimum level. */
export function previousBaseLevel(current: number): BaseLevelDef | undefined {
  return BASE_LEVELS.find((l) => l.level === current - 1);
}

/** All building ids introduced at the given level. */
export function buildingsUnlockedByLevel(level: number): BuildingId[] {
  const def = getBaseLevel(level);
  return [...def.unlocksBuildings];
}
