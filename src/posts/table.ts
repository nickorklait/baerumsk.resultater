import type { Match } from '../data/match.ts';

export interface TableRow {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  position: number;
}

/**
 * League table from results: 3/1/0 points, then goal difference, then goals scored.
 * Teams still level share a position and are listed alphabetically.
 * Every team in the fixture list is included, also before it has played.
 */
export function calculateTable(matches: Match[]): TableRow[] {
  const rows = new Map<string, TableRow>();
  const row = (team: string) => {
    let r = rows.get(team);
    if (!r) {
      r = { team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0, position: 0 };
      rows.set(team, r);
    }
    return r;
  };
  for (const m of matches) {
    const home = row(m.home);
    const away = row(m.away);
    if (!m.score) continue;
    const { home: hg, away: ag } = m.score;
    for (const [r, gf, ga] of [[home, hg, ag], [away, ag, hg]] as const) {
      r.played++;
      r.goalsFor += gf;
      r.goalsAgainst += ga;
      if (gf > ga) r.won++;
      else if (gf === ga) r.drawn++;
      else r.lost++;
    }
  }
  const list = [...rows.values()].map((r) => ({ ...r, goalDiff: r.goalsFor - r.goalsAgainst, points: r.won * 3 + r.drawn }));
  list.sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team, 'nb'));
  list.forEach((r, i) => {
    const prev = list[i - 1];
    r.position = prev && prev.points === r.points && prev.goalDiff === r.goalDiff && prev.goalsFor === r.goalsFor ? prev.position : i + 1;
  });
  return list;
}

/** How many matches that should have been played actually have a known score. */
export function coverage(matches: Match[], now: string): { played: number; withScore: number; complete: boolean } {
  const played = matches.filter((m) => m.start < now);
  const withScore = played.filter((m) => m.score).length;
  return { played: played.length, withScore, complete: played.length > 0 && withScore === played.length };
}

/**
 * Deterministic made-up scores for every match before `now`, used only for the
 * clearly-marked EXAMPLE table in the demo when real scores are not available.
 */
export function withExampleScores(matches: Match[], now: string): Match[] {
  return matches.map((m) => {
    if (m.start >= now || m.score) return m;
    let h = 2166136261;
    for (const ch of m.key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return { ...m, score: { home: h % 5, away: (h >>> 8) % 4 } };
  });
}
