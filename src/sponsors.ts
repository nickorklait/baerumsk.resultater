import type { Sponsor, SponsorConfig } from './config.ts';

export interface SponsorSet {
  main: Sponsor;
  team: Sponsor[];
  match: Sponsor | null;
  /** Rotating club partners. */
  partners: Sponsor[];
  labels: SponsorConfig['labels'];
}

/**
 * Sponsors for a post: main sponsor always, team sponsors of the teams shown, match sponsor of the week,
 * and `partnersPerPost` club partners. Partners rotate by week and by post (`slot`) so all get exposure.
 */
export function sponsorsFor(cfg: SponsorConfig, weekKey: string, teamNames: string[], slot = 0): SponsorSet {
  const main = cfg.sponsors.find((s) => s.role === 'main');
  if (!main) throw new Error('The sponsor file needs one sponsor with role "main"');
  const team = cfg.sponsors.filter(
    (s) => s.role === 'team' && s.teamPattern && teamNames.some((t) => new RegExp(s.teamPattern!, 'i').test(t)),
  );
  const matchId = cfg.matchSponsorOfTheWeek[weekKey] ?? cfg.matchSponsorOfTheWeek.default;
  const match = cfg.sponsors.find((s) => s.id === matchId && s.role === 'match') ?? null;

  const pool = cfg.sponsors.filter((s) => s.role === 'partner');
  const n = Math.min(cfg.partnersPerPost, pool.length);
  const weekNo = Math.floor(Date.parse(`${weekKey}T00:00:00Z`) / (7 * 864e5));
  const start = pool.length ? ((weekNo + slot) * n) % pool.length : 0;
  const partners = Array.from({ length: n }, (_, i) => pool[(start + i) % pool.length]);
  return { main, team, match, partners, labels: cfg.labels };
}

export const sponsorList = (set: SponsorSet) => [set.main, ...set.team, ...(set.match ? [set.match] : []), ...set.partners];
export const sponsorIds = (set: SponsorSet) => sponsorList(set).map((s) => s.id);
