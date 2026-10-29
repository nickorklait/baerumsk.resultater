import type { ClubConfig } from '../config.ts';
import { inRange, type DayRange } from '../dates.ts';
import type { Match } from '../data/match.ts';
import { hasPublicResults, teamInfo, type TeamInfo } from '../data/teams.ts';

export type Outcome = 'win' | 'draw' | 'loss';

export interface ResultItem {
  match: Match;
  /** Which side is ours. "both" for internal matches (Haslum vs Haslum). */
  side: 'home' | 'away' | 'both';
  own: TeamInfo;
  opponent: TeamInfo;
  /** From the club's point of view; null for internal matches. */
  outcome: Outcome | null;
  goalsFor: number;
  goalsAgainst: number;
}

const isOwn = (team: string, prefix: string) => team.toLowerCase().startsWith(`${prefix.toLowerCase()} `);

export function toResultItem(m: Match, config: ClubConfig): ResultItem | null {
  if (!m.score) return null;
  const prefix = config.club.teamPrefix;
  const homeOwn = isOwn(m.home, prefix);
  const awayOwn = isOwn(m.away, prefix);
  if (!homeOwn && !awayOwn) return null;
  const side = homeOwn && awayOwn ? 'both' : homeOwn ? 'home' : 'away';
  const own = teamInfo(side === 'away' ? m.away : m.home, m.league);
  const opponent = teamInfo(side === 'away' ? m.home : m.away, m.league);
  const goalsFor = side === 'away' ? m.score.away : m.score.home;
  const goalsAgainst = side === 'away' ? m.score.home : m.score.away;
  const outcome = side === 'both' ? null : goalsFor > goalsAgainst ? 'win' : goalsFor < goalsAgainst ? 'loss' : 'draw';
  return { match: m, side, own, opponent, outcome, goalsFor, goalsAgainst };
}

/** Teams the club has opted out from the dashboard. */
export const isExcluded = (team: string, config: ClubConfig) => (config.posts.excludedTeams ?? []).includes(team);

/** Played matches in the window for teams with public results (13+ and senior) that have not opted out, oldest first. */
export function resultsInWindow(matches: Match[], window: DayRange, config: ClubConfig): ResultItem[] {
  return matches
    .filter((m) => m.score && inRange(m.start, window))
    .map((m) => toResultItem(m, config))
    .filter((r): r is ResultItem => r !== null && hasPublicResults(r.own, config.posts.minResultAge) && !isExcluded(r.own.name, config))
    .sort((a, b) => a.match.start.localeCompare(b.match.start));
}

export function summarize(items: ResultItem[]) {
  const count = (o: Outcome) => items.filter((i) => i.outcome === o).length;
  return {
    wins: count('win'),
    draws: count('draw'),
    losses: count('loss'),
    goalsFor: items.reduce((n, i) => n + (i.side === 'both' ? 0 : i.goalsFor), 0),
    matches: items.length,
  };
}
