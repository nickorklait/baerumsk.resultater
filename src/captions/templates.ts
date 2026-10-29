// Template captions (bokmål). Used when no ANTHROPIC_API_KEY is set, or when a
// Claude caption fails the fact-check. They must pass the fact-check themselves.

import { weekdayNameNo, monthNameNo, formatRangeNo, type DayRange } from '../dates.ts';
import type { Match } from '../data/match.ts';
import type { ResultItem } from '../posts/results.ts';
import type { TableRow } from '../posts/table.ts';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dayText = (start: string) => {
  const day = start.slice(0, 10);
  return `${weekdayNameNo(day)} ${Number(day.slice(8, 10))}. ${monthNameNo(day)}`;
};
const ownScore = (i: ResultItem) => `${i.goalsFor}–${i.goalsAgainst}`;
const icon = (i: ResultItem) => (i.outcome === 'win' ? '🟢' : i.outcome === 'draw' ? '🟡' : i.outcome === 'loss' ? '🔴' : '⚪');
const tags = (hashtags: string[]) => hashtags.join(' ');

export function resultsSummaryCaption(items: ResultItem[], totals: { wins: number; draws: number; losses: number; goalsFor: number }, club: string, period: 'helg' | 'uke', mainSponsor: string | null, hashtags: string[]): string {
  const opener =
    totals.losses === 0 && totals.wins > 0
      ? `For en ${period} for ${club}! ${totals.wins} seire, ${totals.draws} uavgjort og ingen tap – og hele ${totals.goalsFor} mål! 💚❤️`
      : `${period === 'helg' ? 'Helgens' : 'Ukens'} resultater for ${club}: ${totals.wins} seire, ${totals.draws} uavgjort og ${totals.losses} tap. 💚❤️`;
  const lines = items.map((i) => {
    const [home, away] = i.side === 'away' ? [i.opponent.club, i.own.club] : [i.own.club, i.opponent.club];
    return `${icon(i)} ${i.own.label}: ${home} – ${away} ${i.match.score!.home}–${i.match.score!.away}`;
  });
  const thanks = `Takk til spillere, trenere og foreldre som stilte opp!${mainSponsor ? ` Takk også til ${mainSponsor} for støtten.` : ''}`;
  return [opener, '', ...lines, '', thanks, '', tags(hashtags)].join('\n');
}

export function teamResultCaption(i: ResultItem, teamSponsor: string | null, hashtags: string[], streak: string | null = null): string {
  const team = `${i.own.club} ${i.own.label}`;
  const where = i.side === 'home' ? 'hjemme' : 'borte';
  const opp = i.opponent.club;
  const first =
    i.outcome === 'win'
      ? `SEIER! 💪 ${team} vant ${ownScore(i)} ${where} mot ${opp}.`
      : i.outcome === 'draw'
        ? `Poengdeling for ${team}: ${ownScore(i)} ${where} mot ${opp}.`
        : `${team} tapte ${ownScore(i)} ${where} mot ${opp}. Ny sjanse i neste kamp!`;
  const league = `${i.match.league}${i.match.round ? `, runde ${i.match.round}` : ''}.`;
  const sponsor = teamSponsor ? `Laget støttes av ${teamSponsor}. 💚` : '';
  return [first, streak ? `🔥 ${streak}!` : '', league, sponsor, '', tags(hashtags)].filter((l, n, a) => l !== '' || a[n - 1] !== '').join('\n');
}

export function fixturesCaption(club: string, range: DayRange, matches: { m: Match; label: string; opponent: string; home: boolean }[], hashtags: string[]): string {
  const byDay = new Map<string, string[]>();
  for (const f of matches) {
    const key = f.m.start.slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), `${f.m.start.slice(11, 16)} ${f.label} ${f.home ? 'mot' : 'borte mot'} ${f.opponent}`]);
  }
  const list = matches.length <= 14
    ? [...byDay.entries()].flatMap(([day, rows]) => [`📅 ${cap(dayText(day))}`, ...rows, ''])
    : [`${matches.length} kamper fordelt på ${byDay.size} dager – se hele oversikten i bildene.`, ''];
  return [`Ukens kamper for ${club} (${formatRangeNo(range)}) ⚽`, '', ...list, 'Møt opp og hei fram lagene! 📣', '', tags(hashtags)].join('\n');
}

export function matchDayCaption(m: Match, label: string, opponent: string, home: boolean, matchSponsor: string | null, hashtags: string[], club = 'laget'): string {
  return [
    `KAMPDAG! ⚽ ${label} ${home ? 'tar imot' : 'møter'} ${opponent}${home ? '' : ' på bortebane'}.`,
    `⏰ ${cap(dayText(m.start))} kl. ${m.start.slice(11, 16)}`,
    `📍 ${m.venue}`,
    `🏆 ${m.league}${m.round ? `, runde ${m.round}` : ''}`,
    '',
    home ? 'Kom og støtt laget fra tribunen! 📣' : `Heia ${club}! 📣`,
    matchSponsor ? `Ukens kampsponsor: ${matchSponsor}.` : '',
    '',
    tags(hashtags),
  ].filter((l, n, a) => l !== '' || a[n - 1] !== '').join('\n');
}

export function tableCaption(league: string, own: TableRow | undefined, ownLabel: string, playedMatches: number, hashtags: string[]): string {
  const pos = own ? `${ownLabel} ligger på ${own.position}. plass med ${own.points} poeng etter ${own.played} kamper.` : '';
  return [`Slik står det i ${league} 📊`, pos, `Tabellen er beregnet fra ${playedMatches} spilte kamper.`, '', tags(hashtags)].filter(Boolean).join('\n');
}
