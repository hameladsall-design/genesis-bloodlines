/**
 * Faction and zone content.
 *
 * This module owns ONLY static data: the powers that roam the world and the
 * regions they inhabit. No simulation logic lives here, so it can be imported
 * by systems, UI panels and tests without creating a dependency cycle.
 *
 * Every user-facing string exists in Arabic (primary) and English (fallback).
 */

/** A faction blueprint used to seed `state.factions` on a new game. */
export interface FactionTemplate {
  id: string;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  /** Short list of what this power wants from the world. */
  goals: string[];
}

/** A region of the world map. */
export interface ZoneTemplate {
  id: string;
  nameAr: string;
  nameEn: string;
  /** 0 = safe haven, 5 = nightmare territory. */
  danger: number;
  descAr: string;
  descEn: string;
}

export const FACTION_TEMPLATES: FactionTemplate[] = [
  {
    id: 'iron_crown',
    nameAr: 'التاج الحديدي',
    nameEn: 'The Iron Crown',
    descAr:
      'إمارة متينة من البشر يجمعها فولاذ صلب. يحفظون الثأر ويقاتلون كل من يهدد حدودهم.',
    descEn:
      'A hardened human dominion bound by iron and oath. They hold grudges and end anyone who crosses their border.',
    goals: ['توحيد الممالك تحت التاج', 'استعادة السور القديم', 'اقتلاب الغزاة'],
  },
  {
    id: 'hollow_court',
    nameAr: 'البلاط الفارغ',
    nameEn: 'The Hollow Court',
    descAr:
      'جماعة من السحرة يجمعون الدم من الأرواح الميتة ويبيعون أسرارهم بأعلى ثمن.',
    descEn:
      'A coven of warlocks who trade in blood and secrets, selling power to the highest bidder.',
    goals: ['جمع الأرواح المحتجزة', 'إحياء التنانين المنقرضة', 'السيطرة على طرق التجارة'],
  },
  {
    id: 'iron_pact',
    nameAr: 'ميثاق الحداد',
    nameEn: 'The Smiths Pact',
    descAr:
      'نقابات الأقزام التي تسيطر على طرق الخام. من يشتر ذراعا منهم فسيصنع السلاح الذي يقتل به.',
    descEn:
      'Dwarven guilds that hold the ore roads. Buy a limb from them and you have bought the weapon that kills you.',
    goals: ['السيطرة على مناجم الجبل', 'حماية طرق التجارة', 'طرد الغزاة'],
  },
  {
    id: 'bone_chorus',
    nameAr: 'جوقة العظام',
    nameEn: 'The Bone Chorus',
    descAr:
      'قبائل من الموتى غير المستقرين يمارسون طقوسا في المستنقع. تجارتهم تجلب العذاب لكنهم رخيصون.',
    descEn:
      'Tribes of the unquiet dead performing rites in the marshes. Their trade brings suffering, but they are cheap.',
    goals: ['إحياء الموتى القدامى', 'جمع أرواح المهزومين', 'بناء معبد في المستنقع'],
  },
  {
    id: 'sunken_kin',
    nameAr: 'الأقارب الغارقة',
    nameEn: 'The Sunken Kin',
    descAr:
      'أرواح فقدت أعماق البحر. يقدّمون حكمتهم لمن يجيد الملاحة في السواحل الغارقة.',
    descEn:
      'Spirits lost to the deep. They trade their counsel to those who can navigate the drowned coasts.',
    goals: ['إيقاظ أعماق البحر', 'حماية غرقى القرى', 'مطاردة غاصبي اللآلئ'],
  },
  {
    id: 'free_bands',
    nameAr: 'الأحزمة الحرة',
    nameEn: 'The Free Bands',
    descAr:
      'نهب لا يطيعون طاعة أحد. يبيعون الحماية بأرخص ثمن في العالم.',
    descEn:
      'Raiders with no lord but their own. They sell protection at the lowest price in the world.',
    goals: ['نهب المستوطنات الضعيفة', 'بناء شبكة تجارة سرية', 'السيطرة على ممرات الشمال'],
  },
];

/**
 * Zones double as the home region for characters (`Character.zone`) and as the
 * territory pool for factions.
 */
export const ZONES: ZoneTemplate[] = [
  {
    id: 'wilds',
    nameAr: 'البرية',
    nameEn: 'The Wilds',
    danger: 1,
    descAr: 'الحقول حول المستوطنة حيث تبدأ الطرق نحو كل شيء آخر.',
    descEn: 'The fields around the settlement where every road begins.',
  },
  {
    id: 'forest',
    nameAr: 'الغابة السوداء',
    nameEn: 'The Black Forest',
    danger: 2,
    descAr: 'غابة كثيفة تخفي ما لا ينوي ان يظهر.',
    descEn: 'A thick forest that hides whatever means to stay hidden.',
  },
  {
    id: 'zone.ashfall_road',
    nameAr: 'طريق الرماد',
    nameEn: 'The Ashfall Road',
    danger: 2,
    descAr: 'طريق تجارة مظلم يقطعه الرماد من كل جهة.',
    descEn: 'A trade road choked with ash and worse.',
  },
  {
    id: 'ruins',
    nameAr: 'الاطلال',
    nameEn: 'The Ruins',
    danger: 3,
    descAr: 'مدن ميتة تحمل اسرارا لم يفهمها أحد.',
    descEn: 'Dead cities holding secrets nobody understood.',
  },
  {
    id: 'city',
    nameAr: 'المدينة الميتة',
    nameEn: 'The Dead City',
    danger: 3,
    descAr: 'مدينة خلت من سكانها وهي شاهدة على ما كان.',
    descEn: 'A great city that emptied in silence and stayed as witness.',
  },
  {
    id: 'zone.blood_marsh',
    nameAr: 'مستنقع الدم',
    nameEn: 'The Blood Marsh',
    danger: 4,
    descAr: 'مستنقع دافئ تنمو فيه جذور لا تنتمي إلى نبات.',
    descEn: 'A warm marsh where roots grow that belong to no plant.',
  },
  {
    id: 'dungeon',
    nameAr: 'الاعماق',
    nameEn: 'The Depths',
    danger: 4,
    descAr: 'ممرات تحت الارض لا ينتهي منها النور.',
    descEn: 'Passages under the earth where the light does not end.',
  },
  {
    id: 'haunted',
    nameAr: 'الارض المسكونة',
    nameEn: 'The Haunted Ground',
    danger: 5,
    descAr: 'ارض يهرب منها الضوء ولا يعود من دخل.',
    descEn: 'Ground that light flees and no one returns from.',
  },
];
