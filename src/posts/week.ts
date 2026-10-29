import type { ClubConfig } from '../config.ts';
import { addDays, inRange, osloNow, resultsWindow, sundayOf, type DayRange } from '../dates.ts';
import type { Match } from '../data/match.ts';
import { resultsInWindow } from './results.ts';

export interface PostWeek {
  /** Sunday of the week; used as the output folder name. */
  key: string;
  /** Results window for the recap (default Friday–Sunday). */
  results: DayRange;
  /** All days whose results get their own post in this week's folder (Monday–Sunday, plus the recap window). */
  span: DayRange;
  /** The seven days after the results window. */
  fixtures: DayRange;
}

export function postWeek(anyDay: string, config: ClubConfig): PostWeek {
  const sunday = sundayOf(anyDay);
  const { from, to } = config.posts.resultsWindow;
  const results = resultsWindow(sunday, from, to);
  const monday = addDays(sunday, -6);
  return {
    key: sunday,
    results,
    span: { from: results.from < monday ? results.from : monday, to: results.to > sunday ? results.to : sunday },
    fixtures: { from: addDays(results.to, 1), to: addDays(results.to, 7) },
  };
}

/** The week (up to today) holding the most recent publishable result. */
export function latestWeekWithResults(matches: Match[], config: ClubConfig, today = osloNow().slice(0, 10)): PostWeek | null {
  const days = [...new Set(matches.filter((m) => m.score).map((m) => m.start.slice(0, 10)))].sort().reverse();
  for (const day of days) {
    // A day can belong to this week or (with a window that runs into Monday) to the previous one.
    for (const sunday of [sundayOf(day), addDays(sundayOf(day), -7)]) {
      const week = postWeek(sunday, config);
      if (week.span.from <= today && inRange(day, week.span) && resultsInWindow(matches, week.span, config).length > 0) return week;
    }
  }
  return null;
}
