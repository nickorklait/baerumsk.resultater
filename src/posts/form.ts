import type { ClubConfig } from '../config.ts';
import type { Match } from '../data/match.ts';
import { toResultItem, type Outcome } from './results.ts';

export interface TeamForm {
  /** Up to the last 5 results, oldest first, ending with the given match. */
  outcomes: Outcome[];
  /** A positive streak sentence, or null. */
  streak: string | null;
}

/**
 * Form and streak for a team up to and including a match. Our history only goes back to the first
 * stored snapshot, so streaks are phrased as "the last N matches", which stays true even if the
 * real streak is longer. Losing streaks are never mentioned (many of these are youth teams).
 */
export function teamForm(matches: Match[], team: string, upTo: string, config: ClubConfig): TeamForm {
  const outcomes = matches
    .filter((m) => m.score && (m.home === team || m.away === team) && m.start <= upTo)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((m) => toResultItem(m, config)?.outcome)
    .filter((o): o is Outcome => !!o);

  const run = (ok: (o: Outcome) => boolean) => {
    let n = 0;
    for (let i = outcomes.length - 1; i >= 0 && ok(outcomes[i]); i--) n++;
    return n;
  };
  const wins = run((o) => o === 'win');
  const unbeaten = run((o) => o !== 'loss');
  const streak = wins >= 2 ? `Seier i de ${wins} siste kampene` : unbeaten >= 3 ? `Ubeseiret i de ${unbeaten} siste kampene` : null;
  return { outcomes: outcomes.slice(-5), streak };
}
