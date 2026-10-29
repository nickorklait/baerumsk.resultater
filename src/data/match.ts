import { icalLocalDateTime, unescapeText, type IcalEvent } from './ical.ts';
import { normalizeName } from './teams.ts';

export interface Score {
  home: number;
  away: number;
}

export interface Match {
  /** Stable key across feeds and fetches (feed UIDs are regenerated per request). */
  key: string;
  /** Match fiksId, when the feed links to the match page (league feeds do, club feed does not). */
  fiksId: number | null;
  /** Kick-off, local Europe/Oslo time: "2026-10-18T17:00". */
  start: string;
  /** League name without the round, e.g. "G13 2. div. høst avd. 01". */
  league: string;
  round: number | null;
  home: string;
  away: string;
  venue: string;
  /** Null until the result is in the feed. */
  score: Score | null;
}

export function matchKey(start: string, home: string, away: string): string {
  return [start.slice(0, 10), normalizeName(home), normalizeName(away)].join('|').toLowerCase();
}

/**
 * Split "Home - Away". Team names never contain a spaced dash in practice ("G16-1", "Frem-31"),
 * but if they ever do, prefer the split that puts the club's own team on one side.
 */
export function splitPair(pair: string, clubPrefix?: string): [string, string] | null {
  const parts = pair.split(' - ');
  if (parts.length < 2) return null;
  const candidates: [string, string][] = [];
  for (let i = 1; i < parts.length; i++) {
    candidates.push([parts.slice(0, i).join(' - ').trim(), parts.slice(i).join(' - ').trim()]);
  }
  if (clubPrefix && candidates.length > 1) {
    const own = new RegExp(`^${clubPrefix}\\s`, 'i');
    const hit = candidates.find(([h, a]) => own.test(h) || own.test(a));
    if (hit) return hit;
  }
  return candidates[0];
}

/** What is left of SUMMARY after "Home - Away": "2 - 9" (played), "-" (club feed, not played) or "" (league feed). */
export function parseScoreSuffix(suffix: string): Score | null {
  const m = suffix.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  return m ? { home: Number(m[1]), away: Number(m[2]) } : null;
}

export function eventToMatch(ev: IcalEvent, clubPrefix?: string): Match | null {
  const summary = ev.SUMMARY ? normalizeName(unescapeText(ev.SUMMARY.value)) : '';
  const descLines = ev.DESCRIPTION ? unescapeText(ev.DESCRIPTION.value).split('\n') : [];
  const leagueLine = normalizeName(descLines[0] ?? '');
  const pairLine = normalizeName(descLines[2] ?? '');
  if (!ev.DTSTART) return null;

  let teams: [string, string] | null = null;
  let score: Score | null = null;
  if (pairLine && summary.startsWith(pairLine)) {
    // Reliable path: the description has the pair without the score.
    teams = splitPair(pairLine, clubPrefix);
    score = parseScoreSuffix(summary.slice(pairLine.length));
  } else {
    // Fallback: SUMMARY only. The score is the trailing "N - N".
    const m = summary.match(/^(.*?)\s+(\d+) - (\d+)$/);
    teams = splitPair((m ? m[1] : summary).replace(/\s+-$/, ''), clubPrefix);
    score = m ? { home: Number(m[2]), away: Number(m[3]) } : null;
  }
  if (!teams) return null;

  const start = icalLocalDateTime(ev.DTSTART.value);
  const roundMatch = leagueLine.match(/\(runde (\d+)\)/i);
  const fiksMatch = ev.URL?.value.match(/fiksId=(\d+)/i);
  const [home, away] = teams.map(normalizeName);
  return {
    key: matchKey(start, home, away),
    fiksId: fiksMatch ? Number(fiksMatch[1]) : null,
    start,
    league: normalizeName(leagueLine.replace(/\(runde \d+\)/i, '')),
    round: roundMatch ? Number(roundMatch[1]) : null,
    home,
    away,
    venue: ev.LOCATION ? normalizeName(unescapeText(ev.LOCATION.value)) : '',
    score,
  };
}
