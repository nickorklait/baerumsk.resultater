import type { ClubConfig } from '../config.ts';
import type { Match } from './match.ts';
import { CalendarFeedAdapter } from './calendarFeedAdapter.ts';
import { FotballdataAdapter } from './fotballdataAdapter.ts';

export interface RefreshReport {
  source: string;
  status: 'fetched' | 'cached' | 'failed';
  detail: string;
}

/** Everything the post generator needs from a data source. Swap implementations via config. */
export interface MatchDataAdapter {
  readonly name: string;
  /** Fetch new data if the cache is stale. Must be polite: rate-limited and cached. */
  refresh(options?: { force?: boolean }): Promise<RefreshReport[]>;
  /** All known matches involving the club, with results where available. */
  clubMatches(): Match[];
  /** First day the stored data covers completely ("YYYY-MM-DD"), or null if the source has full history. */
  coverageStart(): string | null;
  /** All known matches in a league (for tables). Scores may be missing. */
  leagueMatches(tournamentId: number): { name: string; matches: Match[] };
}

export function createAdapter(config: ClubConfig): MatchDataAdapter {
  switch (config.data.adapter) {
    case 'calendarFeed':
      return new CalendarFeedAdapter(config);
    case 'fotballdata':
      return new FotballdataAdapter(config);
    default:
      throw new Error(`Unknown data adapter "${config.data.adapter}" in config/club.json`);
  }
}
