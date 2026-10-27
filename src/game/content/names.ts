/**
 * Name pools — Arabic-first, English mirrored.
 *
 * The UI is Arabic-first, so every pool is written in Arabic and then in
 * English. `namesForRace` is deterministic (no RNG, no `Math.random`) so a
 * saved game always regenerates the same name for the same race and sex.
 */

import type { RaceId, Sex } from '../simulation/types';

/* ------------------------------------------------------------------ */
/* Base pools                                                          */
/* ------------------------------------------------------------------ */

export const MALE_NAMES_AR: string[] = [
  'عمر', 'زيد', 'خالد', 'طارق', 'سامر', 'جابر', 'نبيل', 'مروان',
  'رامي', 'وليد', 'فادي', 'باسل', 'سيف', 'جهاد', 'حسن', 'إبراهيم',
  'يوسف', 'أيمن', 'نادر', 'باسم', 'مراد', 'سليم', 'عاشور', 'حمزة',
];

export const FEMALE_NAMES_AR: string[] = [
  'فاطمة', 'عائشة', 'مريم', 'نور', 'رنا', 'سلمى', 'هدى', 'لينا',
  'ريم', 'يارا', 'دانا', 'سارة', 'هبة', 'أسماء', 'لمى', 'آية',
  'مها', 'رغد', 'سجى', 'نادية', 'بشرى', 'شذى', 'لبنى', 'غادة',
];

export const MALE_NAMES_EN: string[] = [
  'Aldric', 'Borin', 'Cedric', 'Dorian', 'Edrik', 'Faron', 'Garrick', 'Hadrik',
  'Ivar', 'Jorund', 'Kaelen', 'Lucan', 'Morven', 'Osric', 'Ragnar', 'Theron',
  'Ulric', 'Varen', 'Wilfred', 'Yoric', 'Brand', 'Halvard', 'Sindri', 'Torvald',
];

export const FEMALE_NAMES_EN: string[] = [
  'Aelwen', 'Brynn', 'Cerys', 'Dagny', 'Elenne', 'Freya', 'Gudrun', 'Hestia',
  'Isolde', 'Jorunn', 'Katrin', 'Lyra', 'Morgana', 'Nerys', 'Olwen', 'Rhiannon',
  'Sigrid', 'Thyra', 'Ulrika', 'Ylva', 'Aslaug', 'Brenda', 'Elowen', 'Sable',
];

export const SURNAMES_AR: string[] = [
  'العزبي', 'الراوي', 'الحربي', 'الشمري', 'القيسي', 'الأنصاري', 'الطائي',
  'الدرجاني', 'الحلبي', 'البغدادي', 'النجدي', 'السعدي', 'المهنا', 'الزهراني',
  'العمري', 'الخالدي', 'السلمي', 'الجراح', 'الخطيب', 'الفهداوي',
];

export const SURNAMES_EN: string[] = [
  'Ashford', 'Blackthorn', 'Crowell', 'Dunmore', 'Everhart', 'Frostmere',
  'Grimwald', 'Hollowell', 'Ironvale', 'Kestrel', 'Larkspur', 'Mossgrave',
  'Nightfall', 'Oakhart', 'Ravenmoor', 'Stonebrook', 'Thistlewood', 'Umberlyn',
  'Vinterby', 'Westmarch',
];

/* ------------------------------------------------------------------ */
/* Species-flavoured pools                                              */
/* ------------------------------------------------------------------ */

export interface RaceNamePool {
  male: string[];
  female: string[];
  /** Used for species without a sex distinction (angels, spirits, undead). */
  neutral: string[];
  surnames: string[];
}

export const RACE_POOLS_AR: Record<RaceId, RaceNamePool> = {
  human: { male: [], female: [], neutral: [], surnames: [] },
  elf: {
    male: ['إيلنار', 'أثيل', 'لوريل', 'فين', 'أدار', 'سيبال'],
    female: ['أثينا', 'لوسيا', 'إيلين', 'ميري', 'ناريا', 'أرييل'],
    neutral: ['نارين', 'سيلفان', 'إيرين', 'لافين', 'آهار', 'فيليا'],
    surnames: ['الشجرة الهادئة', 'قمر الألف', 'الورق الذهبي', 'نجم الفجر', 'نسج الحرير', 'ظل الياسمين'],
  },
  dark_elf: {
    male: ['فيزار', 'مازار', 'نيراز', 'ظاهر', 'شادار', 'كازان'],
    female: ['مازارا', 'نيرا', 'فيرا', 'شاديرا', 'كزيرا', 'نيفار'],
    neutral: ['زاريث', 'ثناتوس', 'سيان', 'داراك', 'أوراث', 'زهرة الظلام'],
    surnames: ['الظهيرة المظلمة', 'قمر الكهف', 'حجر القمر', 'همس الرماد', 'خنجر الليل', 'درة العتمة'],
  },
  dwarf: {
    male: ['ثورين', 'بالين', 'دورين', 'فينلي', 'برور', 'جورني'],
    female: ['هيلدا', 'دورنا', 'برونها', 'فال', 'غونار', 'هدرا'],
    neutral: ['بيرن', 'فالار', 'بورن', 'كليفي', 'إيلد', 'أورن'],
    surnames: ['الصدأ', 'قمة المنجم', 'درب الحجر', 'حجر الفأس', 'الجبل القصير', 'ريح الثلج'],
  },
  orc: {
    male: ['غورغ', 'مازغ', 'أورغ', 'كازوك', 'ورغ', 'توز'],
    female: ['مازرا', 'وغا', 'شراك', 'توسا', 'روغا', 'نازغ'],
    neutral: ['وورغ', 'زورغ', 'كاراك', 'غور', 'هورغ', 'برغ'],
    surnames: ['الأنياب الحمراء', 'القبضة', 'الرعد', 'العرق الأسود', 'فك الصخر', 'نهر الدم'],
  },
  vampire: {
    male: ['مرويار', 'سيابد', 'أدرين', 'فزراث', 'كاليستو', 'ريموند'],
    female: ['أزالِه', 'ليليث', 'مورث', 'سيلفيا', 'نوكتورنا', 'دارا'],
    neutral: ['كاثار', 'أزرائيل', 'سيان', 'مور', 'نيلا', 'فارين'],
    surnames: ['الختام', 'قمر الدم', 'العقدة', 'البرد الأبدي', 'السفينة', 'الحرير الأسود'],
  },
  werewolf: {
    male: ['ديريك', 'فارول', 'ريو', 'رينارد', 'إيفان', 'توران'],
    female: ['لونا', 'سيلفا', 'أريكسا', 'نيلا', 'خايرا', 'رونا'],
    neutral: ['مون', 'رين', 'أكس', 'فن', 'هاو', 'وير'],
    surnames: ['العواء', 'عواء القمر', 'الذئب', 'الأنياب', 'ليل الذئاب', 'الغابة المفتوحة'],
  },
  demon: {
    male: ['مالثمائيل', 'أزائيل', 'موردريد', 'إيريدان', 'باروث', 'فيتز'],
    female: ['ليليا', 'أزال', 'نيريس', 'مور', 'سافيرا', 'كالي'],
    neutral: ['مور', 'زال', 'زير', 'نيم', 'لافَر', 'سمائيل'],
    surnames: ['اللسان', 'جمر الجحيم', 'قيد الجحيم', 'العرش المحروق', 'نداء الهاوية', 'تاج الرماد'],
  },
  half_demon: {
    male: ['كورين', 'مالك', 'إدريس', 'زاخر', 'سيفان', 'أرمان'],
    female: ['نيرا', 'سلمى', 'إيلين', 'يارا', 'ميرا', 'سيلفا'],
    neutral: ['رامي', 'سامي', 'نوري', 'آدم', 'شاهين', 'أوريون'],
    surnames: ['الحد', 'نصف القمر', 'الظل المزدوج', 'الدم المختلط', 'الصليب المكسور', 'الغبار الأحمر'],
  },
  angel: {
    male: ['جبرائيل', 'ميخائيل', 'رافائيل', 'أزائيل', 'جبرائيل', 'أورييل'],
    female: ['أنجيليك', 'سيرافينا', 'راشيل', 'إزرائيل', 'سَرشا', 'زارا'],
    neutral: ['سَرشا', 'أنجيلوس', 'ميخائيل', 'نوري', 'بولد', 'أور'],
    surnames: ['الضوء', 'السماء', 'الجناح', 'البشارة', 'النجم', 'القدوس'],
  },
  dragon_blooded: {
    male: ['فيران', 'إيزار', 'كاره', 'زرفير', 'ديار', 'بهارس'],
    female: ['فيرا', 'إيزيل', 'ساكايا', 'نهارا', 'زِرز', 'أرا'],
    neutral: ['سابل', 'مِراث', 'فَج', 'ڤالي', 'أورين', 'ري'],
    surnames: ['اللسان', 'الجمرة', 'الجناح', 'الدرع القرني', 'نَفَس النار', 'العرق المتوهج'],
  },
  giant: {
    male: ['ثورم', 'بيورن', 'غريم', 'سفين', 'جورم', 'هار'],
    female: ['يڤا', 'غلارا', 'أسترِد', 'سِف', 'برا', 'هالدا'],
    neutral: ['بور', 'هِنريك', 'كليرا', 'دور', 'سكارن', 'برا'],
    surnames: ['الحجر الضخم', 'الرعد البعيد', 'الظل الطويل', 'الجبال', 'الهمهمة', 'الخطوة الثقيلة'],
  },
  undead: {
    male: ['كالي', 'أزائيل', 'مورث', 'سيث', 'ثال', 'نيكر'],
    female: ['ليث', 'مورث', 'سيلا', 'نيا', 'أريس', 'هيل'],
    neutral: ['كورث', 'سيث', 'مور', 'ثال', 'نيس', 'أر'],
    surnames: ['القبر', 'الصمت', 'الرماد', 'العفن المقدس', 'الظل', 'المقبرة'],
  },
  spirit: {
    male: ['أسيري', 'نيو', 'سالك', 'أورين', 'زهدي', 'طيف'],
    female: ['سير', 'نهى', 'أرو', 'رَواح', 'زهرة', 'سلام'],
    neutral: ['سير', 'أرو', 'نور', 'هواء', 'زيد', 'مر'],
    surnames: ['الهمس', 'الضباب', 'النداء', 'العبور', 'الضوء الباهت', 'الوشم'],
  },
  mutant: {
    male: ['كاي', 'مورغ', 'زاك', 'تال', 'ريست', 'نيك'],
    female: ['سيا', 'بيلى', 'نيفا', 'آرا', 'زيمي', 'كيتا'],
    neutral: ['سير', 'أورغ', 'ريد', 'تاي', 'مير', 'نون'],
    surnames: ['الالتقاء', 'الشق', 'العرق الجديد', 'الانشطار', 'الطفر', 'الحد'],
  },
};

export const RACE_POOLS_EN: Record<RaceId, RaceNamePool> = {
  human: { male: [], female: [], neutral: [], surnames: [] },
  elf: {
    male: ['Aelar', 'Aerindil', 'Caladriel', 'Faelar', 'Lorinn', 'Siltho'],
    female: ['Adrie', 'Enna', 'Keyla', 'Lia', 'Namira', 'Seraphine'],
    neutral: ['Ashlyn', 'Birel', 'Elaria', 'Feyra', 'Ilyen', 'Neth'],
    surnames: ['Stillbough', 'Moonbriar', 'Goldleaf', 'Dawnstar', 'Silksong', 'Jasmineshadow'],
  },
  dark_elf: {
    male: ['Fyzard', 'Maz’ar', 'Neraz', 'Zahar', 'Shadar', 'Kazan'],
    female: ['Mazara', 'Nira', 'Veyra', 'Shadira', 'Kzira', 'Nivar'],
    neutral: ['Zarith', 'Thanatos', 'Sian', 'Darak', 'Orath', 'Duskmoth'],
    surnames: ['Darkshade', 'Cavemoon', 'Moonstone', 'Ashenwhisper', 'Nightfang', 'Blackpearl'],
  },
  dwarf: {
    male: ['Thorin', 'Balin', 'Durin', 'Faelin', 'Bror', 'Gorni'],
    female: ['Helda', 'Durna', 'Brunhild', 'Fann', 'Gunnar', 'Hedra'],
    neutral: ['Birna', 'Fjalar', 'Borin', 'Kleve', 'Orni', 'Ulfar'],
    surnames: ['Rustforge', 'Minepeak', 'Stonepath', 'Axebearer', 'Shortmountain', 'Snowwind'],
  },
  orc: {
    male: ['Gorg', 'Mazzg', 'Urg', 'Kazok', 'Worg', 'Toz'],
    female: ['Mazra', 'Wugha', 'Shrak', 'Torsa', 'Ruga', 'Nazg'],
    neutral: ['Worg', 'Zorg', 'Karak', 'Ghor', 'Horg', 'Berg'],
    surnames: ['Redfang', 'Thefist', 'Thunder', 'Blackblood', 'Stonejaw', 'Bloodriver'],
  },
  vampire: {
    male: ['Moriart', 'Cyabad', 'Adrien', 'Vezrath', 'Callisto', 'Raimond'],
    female: ['Azaleh', 'Lilith', 'Morth', 'Sylvia', 'Nocturna', 'Dara'],
    neutral: ['Cathar', 'Azrael', 'Sian', 'Mour', 'Nila', 'Farin'],
    surnames: ['Theend', 'Bloodmoon', 'Theknot', 'Evercold', 'Theship', 'Darksilk'],
  },
  werewolf: {
    male: ['Derek', 'Farol', 'Reo', 'Reinard', 'Evan', 'Torran'],
    female: ['Luna', 'Sylva', 'Arixa', 'Nila', 'Khaira', 'Runa'],
    neutral: ['Moon', 'Ryn', 'Aks', 'Fenn', 'Howl', 'Wyr'],
    surnames: ['Howling', 'Moonhowl', 'Thewolf', 'Thefang', 'Wolfsnight', 'Openwood'],
  },
  demon: {
    male: ['Malthael', 'Azazel', 'Mordred', 'Eredan', 'Baroth', 'Vitz'],
    female: ['Lilia', 'Azal', 'Nerys', 'Mour', 'Savyra', 'Kali'],
    neutral: ['Mour', 'Xal', 'Zer', 'Nim', 'Laver', 'Samael'],
    surnames: ['Thetongue', 'Hellember', 'Thechain', 'Burntthrone', 'AbyssCall', 'Ashcrown'],
  },
  half_demon: {
    male: ['Corin', 'Malik', 'Idris', 'Zakhar', 'Sefan', 'Arman'],
    female: ['Nira', 'Salma', 'Elin', 'Yara', 'Mira', 'Sylva'],
    neutral: ['Rami', 'Sami', 'Nuri', 'Adam', 'Shaheen', 'Orion'],
    surnames: ['Thelimit', 'Halfmoon', 'Doubleshade', 'Mixedblood', 'Brokencross', 'Reddust'],
  },
  angel: {
    male: ['Gabriel', 'Michael', 'Raphael', 'Azrael', 'Uriel', 'Uri'],
    female: ['Angelique', 'Seraphina', 'Rachael', 'Israfil', 'Zara', 'Sasha'],
    neutral: ['Sasha', 'Angelus', 'Michael', 'Nuri', 'Bold', 'Or'],
    surnames: ['Thelight', 'Thesky', 'Thewing', 'Theherald', 'Thestar', 'Thesaint'],
  },
  dragon_blooded: {
    male: ['Firan', 'Ezar', 'Karah', 'Zarif', 'Diyar', 'Bahars'],
    female: ['Feyra', 'Ezel', 'Sakaya', 'Nahara', 'Zers', 'Ara'],
    neutral: ['Sable', 'Mirath', 'Faj', 'Vale', 'Orin', 'Ray'],
    surnames: ['Thetongue', 'Thesear', 'Thewing', 'Hornward', 'Firebreath', 'Glowingblood'],
  },
  giant: {
    male: ['Thorm', 'Bjorn', 'Grim', 'Sven', 'Gorm', 'Har'],
    female: ['Yva', 'Glara', 'Astrid', 'Sif', 'Bera', 'Halda'],
    neutral: ['Borr', 'Henrik', 'Klira', 'Dur', 'Skarn', 'Bera'],
    surnames: ['Boulder', 'Distantthunder', 'Tallshadow', 'Mountains', 'Themurmur', 'Heavystep'],
  },
  undead: {
    male: ['Kali', 'Azrael', 'Morth', 'Seth', 'Thal', 'Nekr'],
    female: ['Lith', 'Morth', 'Syla', 'Nia', 'Aris', 'Hel'],
    neutral: ['Korth', 'Seth', 'Mour', 'Thal', 'Nis', 'Ar'],
    surnames: ['Thegrave', 'Thesilence', 'Theashes', 'Blight', 'Theshadow', 'Thetomb'],
  },
  spirit: {
    male: ['Asiri', 'Nio', 'Salc', 'Orin', 'Zahdi', 'Tayf'],
    female: ['Sir', 'Nahi', 'Aro', 'Rawah', 'Zahra', 'Salam'],
    neutral: ['Sir', 'Aro', 'Nur', 'Hawa', 'Zaid', 'Mar'],
    surnames: ['Thewhisper', 'Thefog', 'Thecall', 'Thecrossing', 'PaleLight', 'Thetattoo'],
  },
  mutant: {
    male: ['Kai', 'Morg', 'Zak', 'Tal', 'Rist', 'Nik'],
    female: ['Sia', 'Bela', 'Neva', 'Ara', 'Zemi', 'Kita'],
    neutral: ['Sir', 'Orgh', 'Red', 'Tai', 'Mir', 'Non'],
    surnames: ['Theconvergence', 'Thesplit', 'Newblood', 'Thedivergence', 'Themutation', 'Thelimit'],
  },
};

/* ------------------------------------------------------------------ */
/* Lookup                                                              */
/* ------------------------------------------------------------------ */

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic, species-flavoured names. The same race + sex always yields
 * the same pair, so a saved game stays stable across reloads.
 */
export function namesForRace(race: RaceId, sex: Sex): { first: string; family: string } {
  const ar = RACE_POOLS_AR[race];
  const en = RACE_POOLS_EN[race];
  const seed = hashString(`${race}:${sex}`);
  const useNeutral = sex === 'none';

  const firstAr = pickFrom(
    useNeutral ? ar?.neutral ?? [] : sex === 'male' ? ar?.male ?? [] : ar?.female ?? [],
    MALE_NAMES_AR,
    FEMALE_NAMES_AR,
    useNeutral,
    seed,
  );
  const firstEn = pickFrom(
    useNeutral ? en?.neutral ?? [] : sex === 'male' ? en?.male ?? [] : en?.female ?? [],
    MALE_NAMES_EN,
    FEMALE_NAMES_EN,
    useNeutral,
    seed,
  );

  const familyAr = pickFrom(ar?.surnames ?? [], SURNAMES_AR, SURNAMES_AR, false, seed >>> 3);
  const familyEn = pickFrom(en?.surnames ?? [], SURNAMES_EN, SURNAMES_EN, false, seed >>> 3);

  return {
    first: firstAr || firstEn,
    family: familyAr || familyEn,
  };
}

function pickFrom(
  primary: string[],
  fallbackMale: string[],
  fallbackFemale: string[],
  useNeutral: boolean,
  seed: number,
): string {
  if (primary.length) return primary[seed % primary.length]!;
  const fallback = useNeutral
    ? [...fallbackMale, ...fallbackFemale]
    : seed % 2 === 0
      ? fallbackMale
      : fallbackFemale;
  if (!fallback.length) return '';
  return fallback[seed % fallback.length]!;
}

/**
 * Random names for a race using an injected RNG (used when minting
 * characters). Falls back to the deterministic pool when the race is unknown.
 */
export function randomNamesForRace(
  rng: { pick: <T>(arr: readonly T[]) => T },
  race: RaceId,
  sex: Sex,
): { first: string; family: string } {
  const ar = RACE_POOLS_AR[race];
  const en = RACE_POOLS_EN[race];
  const firstAr =
    sex === 'none'
      ? (ar?.neutral.length ? rng.pick(ar.neutral) : rng.pick(MALE_NAMES_AR))
      : sex === 'male'
        ? (ar?.male.length ? rng.pick(ar.male) : rng.pick(MALE_NAMES_AR))
        : (ar?.female.length ? rng.pick(ar.female) : rng.pick(FEMALE_NAMES_AR));
  const firstEn =
    sex === 'none'
      ? (en?.neutral.length ? rng.pick(en.neutral) : rng.pick(MALE_NAMES_EN))
      : sex === 'male'
        ? (en?.male.length ? rng.pick(en.male) : rng.pick(MALE_NAMES_EN))
        : (en?.female.length ? rng.pick(en.female) : rng.pick(FEMALE_NAMES_EN));
  const familyAr = ar?.surnames.length ? rng.pick(ar.surnames) : rng.pick(SURNAMES_AR);
  const familyEn = en?.surnames.length ? rng.pick(en.surnames) : rng.pick(SURNAMES_EN);
  return { first: firstAr || firstEn, family: familyAr || familyEn };
}
