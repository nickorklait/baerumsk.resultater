import fs from 'node:fs';
import path from 'node:path';
import { paths, type ClubConfig } from '../config.ts';
import type { MatchDataAdapter, RefreshReport } from './adapter.ts';
import { parseIcal } from './ical.ts';
import { eventToMatch, type Match } from './match.ts';

const BASE = 'https://www.fotball.no/footballapi/Calendar';

/**
 * Official fotball.no iCal feeds (made for calendar apps to poll).
 *
 * Observed behaviour (Oct 2026):
 * - Club feed: only matches from ~48 h ago and forward, scores on played matches, no match ids.
 * - League feed: whole season with match ids, but no scores at all.
 * So we keep every snapshot and merge them: results accumulate as long as we poll a few times a day.
 */
export class CalendarFeedAdapter implements MatchDataAdapter {
  readonly name = 'calendarFeed';

  constructor(private readonly config: ClubConfig) {}

  private sources(): { id: string; url: string }[] {
    return [
      { id: `club-${this.config.club.fiksId}`, url: `${BASE}/GetCalendarForClub?clubId=${this.config.club.fiksId}` },
      ...this.config.data.tournamentIds.map((t) => ({ id: `tournament-${t}`, url: `${BASE}/GetCalendar?tournamentId=${t}` })),
    ];
  }

  async refresh({ force = false } = {}): Promise<RefreshReport[]> {
    fs.mkdirSync(paths.snapshots, { recursive: true });
    const reports: RefreshReport[] = [];
    const state = readFetchState();
    for (const src of this.sources()) {
      const latest = snapshotFiles(src.id).at(-1);
      const lastFetch = Math.max(latest ? snapshotTime(latest).getTime() : 0, Date.parse(state[src.id] ?? '') || 0);
      const ageHours = lastFetch ? (Date.now() - lastFetch) / 3.6e6 : Infinity;
      if (!force && ageHours < this.config.data.minHoursBetweenFetches) {
        reports.push({ source: src.id, status: 'cached', detail: `last fetch ${ageHours.toFixed(1)} h ago` });
        continue;
      }
      try {
        const res = await fetch(src.url, { headers: { 'User-Agent': this.config.data.userAgent, Accept: 'text/calendar' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.text();
        if (!body.includes('BEGIN:VCALENDAR')) throw new Error('response is not an iCal feed');
        state[src.id] = new Date().toISOString();
        // Only keep a snapshot when the content changed (the feed regenerates UIDs and DTSTAMP on every request).
        if (latest && normalizeFeed(fs.readFileSync(latest, 'utf8')) === normalizeFeed(body)) {
          reports.push({ source: src.id, status: 'fetched', detail: 'unchanged since the last snapshot' });
          continue;
        }
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
        const file = path.join(paths.snapshots, `${src.id}_${stamp}.ics`);
        fs.writeFileSync(file, body);
        reports.push({ source: src.id, status: 'fetched', detail: `${parseIcal(body).events.length} events -> ${path.basename(file)}` });
      } catch (err) {
        reports.push({ source: src.id, status: 'failed', detail: (err as Error).message });
      }
    }
    writeFetchState(state);
    return reports;
  }

  clubMatches(): Match[] {
    return mergeSnapshots(`club-${this.config.club.fiksId}`, this.config.club.teamPrefix);
  }

  /** The club feed only reaches ~48 h back, so the oldest snapshot's earliest match is where our history starts. */
  coverageStart(): string | null {
    const first = snapshotFiles(`club-${this.config.club.fiksId}`)[0];
    if (!first) return null;
    const starts = parseIcal(fs.readFileSync(first, 'utf8'))
      .events.map((e) => eventToMatch(e, this.config.club.teamPrefix)?.start)
      .filter((s): s is string => Boolean(s))
      .sort();
    return starts[0]?.slice(0, 10) ?? null;
  }

  leagueMatches(tournamentId: number): { name: string; matches: Match[] } {
    const id = `tournament-${tournamentId}`;
    const files = snapshotFiles(id);
    const name = files.length ? parseIcal(fs.readFileSync(files.at(-1)!, 'utf8')).name ?? id : id;
    // The league feed has no scores; fill them in from the club feed history where we have them.
    const clubScores = new Map(this.clubMatches().filter((m) => m.score).map((m) => [m.key, m.score]));
    const matches = mergeSnapshots(id, this.config.club.teamPrefix).map((m) => ({ ...m, score: m.score ?? clubScores.get(m.key) ?? null }));
    return { name, matches };
  }
}

const fetchStateFile = () => path.join(paths.snapshots, '..', 'fetch-state.json');
const readFetchState = (): Record<string, string> => (fs.existsSync(fetchStateFile()) ? JSON.parse(fs.readFileSync(fetchStateFile(), 'utf8')) : {});
const writeFetchState = (s: Record<string, string>) => fs.writeFileSync(fetchStateFile(), JSON.stringify(s, null, 2));

/** Feed text without the parts that change on every request. */
export const normalizeFeed = (ics: string) =>
  ics
    .replace(/\r?\n[ \t]/g, '')
    .split(/\r?\n/)
    .filter((l) => !/^(DTSTAMP|UID)[:;]/.test(l))
    .join('\n');

function snapshotFiles(sourceId: string): string[] {
  if (!fs.existsSync(paths.snapshots)) return [];
  return fs
    .readdirSync(paths.snapshots)
    .filter((f) => f.startsWith(`${sourceId}_`) && f.endsWith('.ics'))
    .sort()
    .map((f) => path.join(paths.snapshots, f));
}

function snapshotTime(file: string): Date {
  const m = path.basename(file).match(/_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.ics$/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : new Date(0);
}

/** Merge all snapshots oldest -> newest. Newer data wins, but a known score is never dropped. */
export function mergeSnapshots(sourceId: string, clubPrefix: string): Match[] {
  const byKey = new Map<string, Match>();
  for (const file of snapshotFiles(sourceId)) {
    for (const ev of parseIcal(fs.readFileSync(file, 'utf8')).events) {
      const m = eventToMatch(ev, clubPrefix);
      if (!m) continue;
      const prev = byKey.get(m.key);
      byKey.set(m.key, prev ? { ...m, score: m.score ?? prev.score, fiksId: m.fiksId ?? prev.fiksId } : m);
    }
  }
  return [...byKey.values()].sort((a, b) => a.start.localeCompare(b.start));
}
