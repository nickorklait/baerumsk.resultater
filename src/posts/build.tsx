import type { ReactNode } from 'react';
import { activeHashtags, type ClubConfig, type SponsorConfig } from '../config.ts';
import { formatRangeNo, inRange, osloNow, periodLabel } from '../dates.ts';
import type { MatchDataAdapter } from '../data/adapter.ts';
import type { Match } from '../data/match.ts';
import { hasPublicResults, splitClubAndLabel, teamInfo } from '../data/teams.ts';
import type { CaptionFacts } from '../captions/facts.ts';
import * as tpl from '../captions/templates.ts';
import type { Theme } from '../render/components.tsx';
import type { Format } from '../render/render.ts';
import { Fixtures, paginateFixtures, type FixtureItem } from '../render/templates/fixtures.tsx';
import { LeagueTable } from '../render/templates/leagueTable.tsx';
import { MatchDay } from '../render/templates/matchDay.tsx';
import { MAX_ROWS, ResultsSummary } from '../render/templates/resultsSummary.tsx';
import { TeamResult } from '../render/templates/teamResult.tsx';
import { sponsorList, sponsorsFor, type SponsorSet } from '../sponsors.ts';
import { isExcluded, resultsInWindow, summarize, type ResultItem } from './results.ts';
import { calculateTable, coverage, withExampleScores } from './table.ts';
import { teamForm } from './form.ts';
import type { PostWeek } from './week.ts';

export type PostType = 'results-summary' | 'team-result' | 'fixtures' | 'match-day' | 'table';

export const GROUPS: Record<PostType, string> = {
  'results-summary': 'Resultater',
  'team-result': 'Resultater per lag',
  fixtures: 'Ukens kamper',
  'match-day': 'Kampdag',
  table: 'Tabeller',
};

export interface PostSpec {
  id: string;
  type: PostType;
  title: string;
  teams: string[];
  sponsors: SponsorSet;
  /** Example content that must not be published. */
  demo: boolean;
  /** Kick-off for match-day posts (Oslo time), used to schedule publishing. */
  eventStart?: string;
  facts: CaptionFacts;
  templateCaption: string;
  /** One or more images (carousel) per format. */
  pages: Record<Format, ReactNode[]>;
}

export interface BuildContext {
  config: ClubConfig;
  theme: Theme;
  week: PostWeek;
  adapter: MatchDataAdapter;
  sponsors: SponsorConfig;
  now?: string;
  /** Increments per post so rotating partners spread across the week. */
  slot?: number;
}

function postSponsors(ctx: BuildContext, teams: string[]): SponsorSet {
  ctx.slot = (ctx.slot ?? 0) + 1;
  return sponsorsFor(ctx.sponsors, ctx.week.key, teams, ctx.slot - 1);
}

const FORMATS: Format[] = ['feed', 'story'];
const slug = (s: string) => s.toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
// Placeholder slots are not sponsors: never thank them in captions.
const sponsorNames = (s: SponsorSet) => sponsorList(s).filter((x) => !x.placeholder).map((x) => x.name);
const realName = (s: { name: string; placeholder?: boolean } | null | undefined) => (s && !s.placeholder ? s.name : null);

function resultFacts(items: ResultItem[], headline: string, sponsors: SponsorSet): CaptionFacts {
  return {
    headline,
    lines: items.map((i) => {
      const where = i.side === 'home' ? 'hjemme' : i.side === 'away' ? 'borte' : 'internt oppgjør';
      return `${i.own.name} mot ${i.opponent.club} (${where}): ${i.match.home} ${i.match.score!.home}–${i.match.score!.away} ${i.match.away}. ${i.match.league}${i.match.round ? `, runde ${i.match.round}` : ''}. ${i.match.start.slice(0, 10)}, ${i.match.venue}.`;
    }),
    teamLabels: uniq(items.flatMap((i) => [i.own.label, i.opponent.label]).filter(Boolean)),
    clubs: uniq(items.flatMap((i) => [i.own.club, i.opponent.club])),
    scores: items.map((i) => [i.match.score!.home, i.match.score!.away]),
    sponsorNames: sponsorNames(sponsors),
    places: uniq(items.flatMap((i) => [i.match.venue, i.match.league])),
  };
}

function resultsPosts(ctx: BuildContext, matches: Match[]): PostSpec[] {
  const { config, theme, week } = ctx;
  const items = resultsInWindow(matches, week.results, config);
  const weekItems = resultsInWindow(matches, week.span, config);
  const totals = summarize(items);
  const tags = activeHashtags(config);
  const set = postSponsors(ctx, items.map((i) => i.own.name));
  const chunks = (format: Format) => Array.from({ length: Math.ceil(items.length / MAX_ROWS[format]) }, (_, p) => items.slice(p * MAX_ROWS[format], (p + 1) * MAX_ROWS[format]));

  const summary: PostSpec | null = items.length === 0 ? null : {
    id: 'resultater-klubb',
    type: 'results-summary',
    title: `${periodLabel(week.results).title} resultater (${items.length} kamper)`,
    teams: items.map((i) => i.own.name),
    sponsors: set,
    demo: false,
    facts: resultFacts(items, `Oppsummering av ${periodLabel(week.results).title.toLowerCase()} resultater ${formatRangeNo(week.results)} for alle lag fra 13 år og senior: ${totals.wins} seire, ${totals.draws} uavgjort, ${totals.losses} tap, ${totals.goalsFor} mål scoret.`, set),
    templateCaption: tpl.resultsSummaryCaption(items, totals, config.club.shortName, periodLabel(week.results).word, realName(set.main), tags),
    pages: Object.fromEntries(
      FORMATS.map((format) => {
        const pages = chunks(format);
        return [format, pages.map((pageItems, index) => <ResultsSummary theme={theme} format={format} window={week.results} items={pageItems} totals={totals} sponsors={set} page={{ index, count: pages.length }} />)];
      }),
    ) as Record<Format, ReactNode[]>,
  };

  const perTeam = weekItems.map((item): PostSpec => {
    const teamSet = postSponsors(ctx, [item.own.name]);
    const form = teamForm(matches, item.own.name, item.match.start, config);
    const facts = resultFacts([item], `Resultat for ${item.own.name}.`, teamSet);
    if (form.outcomes.length >= 2) {
      const word = { win: 'S', draw: 'U', loss: 'T' } as const;
      facts.lines.push(`Form siste kamper (eldst først): ${form.outcomes.map((o) => word[o]).join(' ')}.${form.streak ? ` ${form.streak} (formuler det slik, ikke som «på rad»).` : ''}`);
    }
    return {
      id: `resultat-${slug(item.own.label)}-${item.match.start.slice(0, 10)}`,
      type: 'team-result',
      eventStart: item.match.start,
      title: `${item.own.label}: ${item.match.home} ${item.match.score!.home}–${item.match.score!.away} ${item.match.away}`,
      teams: [item.own.name],
      sponsors: teamSet,
      demo: false,
      facts,
      templateCaption: tpl.teamResultCaption(item, realName(teamSet.team[0]), tags, form.streak),
      pages: { feed: [<TeamResult theme={theme} format="feed" item={item} sponsors={teamSet} form={form} />], story: [<TeamResult theme={theme} format="story" item={item} sponsors={teamSet} form={form} />] },
    };
  });
  return [...(summary ? [summary] : []), ...perTeam];
}

function fixtureItems(ctx: BuildContext, matches: Match[]): FixtureItem[] {
  const prefix = ctx.config.club.teamPrefix.toLowerCase();
  const own = (t: string) => t.toLowerCase().startsWith(`${prefix} `);
  return matches
    .filter((m) => !m.score && inRange(m.start, ctx.week.fixtures) && m.start > (ctx.now ?? osloNow()) && (own(m.home) || own(m.away)))
    .map((m) => {
      const home = own(m.home);
      const team = teamInfo(home ? m.home : m.away, m.league);
      const opp = teamInfo(home ? m.away : m.home, m.league);
      return { m, team, item: { match: m, label: team.label, opponentClub: own(m.home) && own(m.away) ? `${opp.club} ${opp.label}` : opp.club, home } };
    })
    .filter(({ team }) => !isExcluded(team.name, ctx.config) && (ctx.config.posts.includeChildrenInFixtures || hasPublicResults(team, ctx.config.posts.minResultAge)))
    .map(({ item }) => item);
}

function fixturesPost(ctx: BuildContext, matches: Match[]): PostSpec[] {
  const { config, theme, week } = ctx;
  const items = fixtureItems(ctx, matches);
  if (items.length === 0) return [];
  const teams = uniq(items.map((i) => `${config.club.teamPrefix} ${i.label}`));
  const set = postSponsors(ctx, teams);
  return [{
    id: 'ukens-kamper',
    type: 'fixtures',
    title: `Ukens kamper (${items.length} kamper)`,
    teams,
    sponsors: set,
    demo: false,
    facts: {
      headline: `Kampoversikt for ${formatRangeNo(week.fixtures)}: ${items.length} kamper for lag fra 13 år og senior.`,
      lines: items.map((i) => `${i.match.start.slice(0, 10)} kl. ${i.match.start.slice(11, 16)}: ${config.club.teamPrefix} ${i.label} ${i.home ? 'hjemme mot' : 'borte mot'} ${i.opponentClub}, ${i.match.venue}.`),
      teamLabels: uniq(items.flatMap((i) => [i.label, splitClubAndLabel(i.home ? i.match.away : i.match.home).label]).filter(Boolean)),
      clubs: uniq([config.club.shortName, ...items.map((i) => splitClubAndLabel(i.opponentClub).club)]),
      scores: [],
      sponsorNames: sponsorNames(set),
      places: uniq(items.flatMap((i) => [i.match.venue, i.match.league])),
    },
    templateCaption: tpl.fixturesCaption(config.club.shortName, week.fixtures, items.map((i) => ({ m: i.match, label: i.label, opponent: i.opponentClub, home: i.home })), activeHashtags(config)),
    pages: Object.fromEntries(
      FORMATS.map((format) => {
        const pages = paginateFixtures(items, format);
        return [format, pages.map((lines, index) => <Fixtures theme={theme} format={format} range={week.fixtures} lines={lines} sponsors={set} page={{ index, count: pages.length }} />)];
      }),
    ) as Record<Format, ReactNode[]>,
  }];
}

function matchDayPosts(ctx: BuildContext, matches: Match[]): PostSpec[] {
  const { config, theme, week } = ctx;
  return config.posts.matchDayTeams.filter((t) => !isExcluded(t, config)).flatMap((teamName): PostSpec[] => {
    const m = matches.find((x) => !x.score && inRange(x.start, week.fixtures) && (x.home === teamName || x.away === teamName));
    if (!m) return [];
    const home = m.home === teamName;
    const own = teamInfo(teamName, m.league);
    const opponent = teamInfo(home ? m.away : m.home, m.league);
    const set = postSponsors(ctx, [teamName]);
    return [{
      id: `kampdag-${slug(own.label)}-${m.start.slice(0, 10)}`,
      type: 'match-day',
      eventStart: m.start,
      title: `Kampdag ${own.label}: ${m.home} – ${m.away}`,
      teams: [teamName],
      sponsors: set,
      demo: false,
      facts: {
        headline: `Kampdag-plakat for ${teamName}, publiseres på kampdagen.`,
        lines: [`${m.home} – ${m.away} (${home ? 'hjemmekamp' : 'bortekamp'}), ${m.start.slice(0, 10)} kl. ${m.start.slice(11, 16)}, ${m.venue}. ${m.league}${m.round ? `, runde ${m.round}` : ''}.`],
        teamLabels: [own.label, opponent.label].filter(Boolean),
        clubs: [own.club, opponent.club],
        scores: [],
        sponsorNames: sponsorNames(set),
        places: [m.venue, m.league],
      },
      templateCaption: tpl.matchDayCaption(m, `${own.club} ${own.label}`, opponent.club, home, realName(set.match), activeHashtags(config), own.club),
      pages: { feed: [<MatchDay theme={theme} format="feed" match={m} own={own} opponent={opponent} home={home} sponsors={set} />], story: [<MatchDay theme={theme} format="story" match={m} own={own} opponent={opponent} home={home} sponsors={set} />] },
    }];
  });
}

function tablePosts(ctx: BuildContext): PostSpec[] {
  const { config, theme, week, adapter } = ctx;
  const now = ctx.now ?? osloNow();
  return config.data.tournamentIds.flatMap((tid): PostSpec[] => {
    const { name, matches } = adapter.leagueMatches(tid);
    if (matches.length === 0) return [];
    const cov = coverage(matches, now);
    const demo = !cov.complete;
    const rows = calculateTable(demo ? withExampleScores(matches, now) : matches);
    const prefix = config.club.teamPrefix.toLowerCase();
    const ownRow = rows.find((r) => r.team.toLowerCase().startsWith(`${prefix} `));
    const ownLabel = ownRow ? splitClubAndLabel(ownRow.team).label : '';
    const set = postSponsors(ctx, ownRow ? [ownRow.team] : []);
    const note = demo
      ? `EKSEMPEL · fiktive resultater · kalenderfeeden har resultat for ${cov.withScore} av ${cov.played} spilte kamper`
      : `Beregnet tabell · ${cov.played} spilte kamper · kilde: fotball.no-kalender`;
    return [{
      id: `tabell-${tid}`,
      type: 'table',
      title: `Tabell ${name}${demo ? ' (EKSEMPEL)' : ''}`,
      teams: ownRow ? [ownRow.team] : [],
      sponsors: set,
      demo,
      facts: {
        headline: `Beregnet tabell for ${name}.`,
        lines: rows.map((r) => `${r.position}. ${r.team}: ${r.points} poeng etter ${r.played} kamper (${r.goalsFor}-${r.goalsAgainst}).`),
        teamLabels: rows.map((r) => splitClubAndLabel(r.team).label).filter(Boolean),
        clubs: uniq(rows.map((r) => splitClubAndLabel(r.team).club)),
        scores: [],
        sponsorNames: sponsorNames(set),
        places: [name],
      },
      templateCaption: demo
        ? 'EKSEMPEL – IKKE PUBLISER. Tabellen bruker fiktive resultater fordi kalenderfeeden fra fotball.no ikke har resultater for alle kampene i serien. Med lisensierte data (Fotballdata) blir dette en ekte, beregnet tabell.'
        : tpl.tableCaption(name, ownRow, ownLabel, cov.played, activeHashtags(config)),
      pages: Object.fromEntries(FORMATS.map((format) => [format, [<LeagueTable theme={theme} format={format} league={name} rows={rows} ownPrefix={config.club.teamPrefix} note={note} demo={demo} sponsors={set} />]])) as Record<Format, ReactNode[]>,
    }];
  });
}

export function buildPosts(ctx: BuildContext): PostSpec[] {
  const matches = ctx.adapter.clubMatches();
  return [...resultsPosts(ctx, matches), ...fixturesPost(ctx, matches), ...matchDayPosts(ctx, matches), ...tablePosts(ctx)];
}
