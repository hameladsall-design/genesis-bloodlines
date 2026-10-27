/**
 * Bilingual text helper.
 *
 * Arabic is the default player-facing language. Every string in the game is
 * written as `t(key, 'النص العربي', 'English text')`, which keeps the
 * translation next to the call site and makes English localization a drop-in
 * locale override file (`src/i18n/locales/en.json`) rather than a rewrite.
 */

export type Lang = 'ar' | 'en';

export interface LocaleEntry {
  ar?: string;
  en?: string;
}

const overrides = new Map<Lang, Record<string, LocaleEntry>>([
  ['ar', {}],
  ['en', {}],
]);

let currentLang: Lang = 'ar';

export function getLanguage(): Lang {
  return currentLang;
}

export function setLanguage(lang: Lang): void {
  currentLang = lang;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.classList.toggle('lang-rtl', lang === 'ar');
  }
  window.dispatchEvent(new CustomEvent('languagechange', { detail: lang }));
}

/** Registers locale overrides, e.g. from a JSON locale file. */
export function registerOverrides(lang: Lang, entries: Record<string, LocaleEntry>): void {
  Object.assign(overrides.get(lang)!, entries);
}

/**
 * Translates a key. Falls back to the Arabic literal when no English literal
 * is supplied, so the game never renders a raw key.
 */
export function t(key: string, ar: string, en?: string): string {
  const table = overrides.get(currentLang)!;
  const entry = table[key];
  if (entry) {
    const value = currentLang === 'ar' ? entry.ar : entry.en;
    if (value) return value;
  }
  return currentLang === 'ar' ? ar : (en ?? ar);
}

/** Formats a number using the active locale's digits. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(currentLang === 'ar' ? 'ar-EG' : 'en-US').format(value);
}

/** Formats a percentage. */
export function formatPercent(ratio: number): string {
  return `${formatNumber(Math.round(ratio * 100))}%`;
}

/** Formats a signed delta such as +5 / -3. */
export function formatDelta(value: number): string {
  const sign = value > 0 ? '+' : '';
  return sign + formatNumber(value);
}
