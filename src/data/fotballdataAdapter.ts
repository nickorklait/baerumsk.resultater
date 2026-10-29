import type { ClubConfig } from '../config.ts';
import type { MatchDataAdapter, RefreshReport } from './adapter.ts';
import type { Match } from './match.ts';

/**
 * Placeholder for licensed data from NFF/Fotballdata (full results, official tables, match ids).
 * Enable with "data.adapter": "fotballdata" in config/club.json once access is in place.
 */
export class FotballdataAdapter implements MatchDataAdapter {
  readonly name = 'fotballdata';

  constructor(private readonly config: ClubConfig) {}

  private notAvailable(): never {
    throw new Error(
      `FotballdataAdapter is not implemented yet: it needs licensed API access for club ${this.config.club.fiksId}. ` +
        'Set "data.adapter" to "calendarFeed" in config/club.json.',
    );
  }

  async refresh(): Promise<RefreshReport[]> {
    return this.notAvailable();
  }

  clubMatches(): Match[] {
    return this.notAvailable();
  }

  coverageStart(): string | null {
    return null;
  }

  leagueMatches(): { name: string; matches: Match[] } {
    return this.notAvailable();
  }
}
