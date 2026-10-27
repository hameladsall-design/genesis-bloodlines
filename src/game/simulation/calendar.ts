/**
 * The unified in-game calendar.
 *
 * Every time-dependent system (aging, food, farming, construction, healing,
 * pregnancy, visitors, quests) reads from this single clock so they can never
 * drift apart.
 *
 * A year is 12 months of 30 days = 360 days.
 */

import type { Calendar } from './types';

export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const HOURS_PER_DAY = 24;

export function createCalendar(): Calendar {
  return { year: 1, month: 1, day: 1, hour: 6, minute: 0, totalDays: 0 };
}

/** Advances the calendar by a number of hours (may be fractional). */
export function advanceHours(cal: Calendar, hours: number): { daysPassed: number; dayBoundary: boolean } {
  cal.hour += hours;
  let dayBoundary = false;
  while (cal.hour >= HOURS_PER_DAY) {
    cal.hour -= HOURS_PER_DAY;
    advanceOneDay(cal);
    dayBoundary = true;
  }
  cal.minute = Math.floor((cal.hour % 1) * 60);
  return { daysPassed: cal.totalDays, dayBoundary };
}

/** Advances the calendar by whole days. */
export function advanceDays(cal: Calendar, days: number): void {
  for (let i = 0; i < days; i++) advanceOneDay(cal);
}

function advanceOneDay(cal: Calendar): void {
  cal.day += 1;
  cal.totalDays += 1;
  if (cal.day > DAYS_PER_MONTH) {
    cal.day = 1;
    cal.month += 1;
    if (cal.month > MONTHS_PER_YEAR) {
      cal.month = 1;
      cal.year += 1;
    }
  }
}

/** Day-of-year index (0 based) used for seasonal logic. */
export function dayOfYear(cal: Calendar): number {
  return (cal.month - 1) * DAYS_PER_MONTH + (cal.day - 1);
}

/** Total days elapsed since the world's beginning. */
export function totalDays(cal: Calendar): number {
  return cal.totalDays;
}

/** True when the given absolute day is a new calendar month. */
export function isMonthStart(day: number): boolean {
  return day > 0 && day % DAYS_PER_MONTH === 0;
}

/** Human readable date, e.g. "يوم 12 من شهر 3، السنة 2". */
export function formatDate(cal: Calendar, locale: 'ar' | 'en' = 'ar'): string {
  if (locale === 'en') {
    return `Day ${cal.day}, Month ${cal.month}, Year ${cal.year}`;
  }
  return `اليوم ${cal.day} من الشهر ${cal.month}، السنة ${cal.year}`;
}

/** 24h clock string, e.g. "06:30". */
export function formatTime(cal: Calendar): string {
  const h = Math.floor(cal.hour) % HOURS_PER_DAY;
  const m = Math.floor((cal.hour % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Daylight fraction 0..1 driven by the hour of day. */
export function daylightFactor(hour: number): number {
  // Rises at 06:00, peaks at 13:00, sets at 20:00.
  const h = ((hour % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
  if (h < 5) return 0;
  if (h < 7) return (h - 5) / 2;
  if (h < 12) return 0.5 + ((h - 7) / 5) * 0.5;
  if (h < 16) return 1;
  if (h < 20) return 1 - ((h - 16) / 4);
  if (h < 22) return 0.15;
  return 0;
}

/** Named season for the current month. */
export function seasonOf(month: number): 'spring' | 'summer' | 'autumn' | 'winter' {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month && month <= 11) return 'autumn';
  return 'winter';
}
