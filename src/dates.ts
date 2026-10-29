// Date helpers on plain "YYYY-MM-DD" strings. The feeds are in Europe/Oslo local time,
// so we never convert match times; arithmetic is done on calendar days in UTC.

import type { Weekday } from './config.ts';

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES_NO = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MONTHS_NO = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

const toUtc = (day: string) => new Date(`${day}T00:00:00Z`);
const fromUtc = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  const d = toUtc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

export const weekdayIndex = (day: string) => toUtc(day).getUTCDay();
export const weekdayNameNo = (day: string) => DAY_NAMES_NO[weekdayIndex(day)];
export const monthNameNo = (day: string) => MONTHS_NO[toUtc(day).getUTCMonth()];

/** The Sunday of the Monday–Sunday week containing `day`. */
export function sundayOf(day: string): string {
  const wd = weekdayIndex(day);
  return wd === 0 ? day : addDays(day, 7 - wd);
}

export interface DayRange {
  from: string;
  to: string;
}

/**
 * Results window around a Sunday, e.g. fri..mon -> Friday before to Monday after.
 * Days before Sunday count backwards, Monday-or-later counts forwards.
 */
export function resultsWindow(sunday: string, from: Weekday, to: Weekday): DayRange {
  const back = (7 - WEEKDAYS.indexOf(from)) % 7;
  const fwd = WEEKDAYS.indexOf(to);
  return { from: addDays(sunday, -back), to: addDays(sunday, fwd) };
}

/** "Helgens" for a short range around the weekend, "Ukens" for a full week. */
export function periodLabel(r: DayRange): { title: string; word: 'helg' | 'uke' } {
  const days = (Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / 864e5 + 1;
  return days <= 4 ? { title: 'Helgens', word: 'helg' } : { title: 'Ukens', word: 'uke' };
}

export const inRange = (start: string, r: DayRange) => start.slice(0, 10) >= r.from && start.slice(0, 10) <= r.to;

/** Current Oslo wall-clock time as "YYYY-MM-DDTHH:MM". */
export function osloNow(): string {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
  return s.replace(' ', 'T');
}

/** "16.–19. oktober 2026", "30. oktober – 2. november 2026". */
export function formatRangeNo(r: DayRange): string {
  const [fy, , fd] = r.from.split('-').map(Number);
  const [ty, , td] = r.to.split('-').map(Number);
  if (r.from === r.to) return `${td}. ${monthNameNo(r.to)} ${ty}`;
  if (monthNameNo(r.from) === monthNameNo(r.to) && fy === ty) return `${fd}.–${td}. ${monthNameNo(r.to)} ${ty}`;
  if (fy === ty) return `${fd}. ${monthNameNo(r.from)} – ${td}. ${monthNameNo(r.to)} ${ty}`;
  return `${fd}. ${monthNameNo(r.from)} ${fy} – ${td}. ${monthNameNo(r.to)} ${ty}`;
}
