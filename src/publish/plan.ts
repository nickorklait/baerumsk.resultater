import type { ClubConfig } from '../config.ts';
import { addDays } from '../dates.ts';
import type { Manifest, ManifestPost } from '../gallery/build.ts';

/** One Instagram publication: a feed post (single image or carousel) or a set of stories. */
export interface PublicationUnit {
  /** Stable id used in the publish log, e.g. "2026-10-18/resultater-feed". */
  key: string;
  week: string;
  label: string;
  kind: 'feed' | 'story';
  /** PNG files in output/<week>/, in order. Stories: each image becomes its own story. */
  images: string[];
  /** Feed only. */
  caption: string | null;
  altText: string;
  /** Oslo local time "YYYY-MM-DDTHH:MM". */
  publishAt: string;
  /** Not published after this (a match-day poster after kick-off, or week-old results, would be wrong). */
  expiresAt: string;
  postIds: string[];
  /** Teams shown (own teams). */
  teams: string[];
  /** Sponsor ids in the images. */
  sponsors: string[];
}

/** Instagram allows up to 20 items in a carousel. */
export const MAX_CAROUSEL = 20;

const titles = (posts: ManifestPost[]) => posts.map((p) => p.title).join('. ');

/** "2026-10-20T20:15" + hours, as Oslo local time (calendar arithmetic, no time zone shift). */
export function addHours(local: string, hours: number): string {
  const d = new Date(`${local}:00Z`);
  d.setUTCHours(d.getUTCHours() + hours);
  return d.toISOString().slice(0, 16);
}

/**
 * What to publish for a week, and when:
 * - each result: its own post as soon as it is in the data (publish.schedule.perResult)
 * - results recap: after the results window (with per-result posts: the summary only, else summary + teams)
 * - fixtures: one carousel, after the results window
 * - match day: on the day of the match
 * - table: with the fixtures, only when it is a real (not example) table
 * Each feed unit has a matching story unit when stories are enabled. Example posts are never planned.
 */
export function planUnits(m: Manifest, config: ClubConfig): PublicationUnit[] {
  const s = config.publish.schedule;
  const week = m.week.key;
  const after = (days: number, time: string) => `${addDays(m.week.results.to, days)}T${time}`;
  const posts = m.posts.filter((p) => !p.demo);
  const byType = (t: string) => posts.filter((p) => p.type === t);
  const units: PublicationUnit[] = [];

  const add = (name: string, label: string, group: ManifestPost[], storyPosts: ManifestPost[], caption: string | null, publishAt: string, expiresAt = `${addDays(publishAt.slice(0, 10), 3)}${publishAt.slice(10)}`) => {
    if (group.length === 0) return;
    const images = group.flatMap((p) => p.images.feed).slice(0, MAX_CAROUSEL);
    const meta = (ps: ManifestPost[]) => ({ postIds: ps.map((p) => p.id), teams: [...new Set(ps.flatMap((p) => p.teams))], sponsors: [...new Set(ps.flatMap((p) => p.sponsors))] });
    units.push({ key: `${week}/${name}-feed`, week, label, kind: 'feed', images, caption, altText: titles(group), publishAt, expiresAt, ...meta(group) });
    if (config.publish.instagram.stories && storyPosts.length) {
      units.push({
        key: `${week}/${name}-story`, week, label: `${label} (story)`, kind: 'story',
        images: storyPosts.flatMap((p) => p.images.story), caption: null, altText: titles(storyPosts), publishAt, expiresAt, ...meta(storyPosts),
      });
    }
  };

  const perResult = s.perResult.enabled;
  for (const p of byType('team-result')) {
    if (!p.eventStart) continue;
    if (perResult) {
      // Due from kick-off: in practice it is posted at the first run after the result appears.
      if (p.eventStart.slice(0, 10) < s.perResult.since) continue;
      add(p.id, p.title, [p], [p], p.caption, p.eventStart, addHours(p.eventStart, s.perResult.expiresAfterHours));
    } else if (p.teams.some((t) => config.posts.matchDayTeams.includes(t))) {
      // Without per-result posts, the first team still gets its own result the morning after.
      add(p.id, p.title, [p], [p], p.caption, `${addDays(p.eventStart.slice(0, 10), 1)}T${s.results.time}`);
    }
  }

  const summary = byType('results-summary');
  const inRecap = (p: ManifestPost) => !!p.eventStart && p.eventStart.slice(0, 10) >= m.week.results.from && p.eventStart.slice(0, 10) <= m.week.results.to;
  const recapTeams = perResult ? [] : byType('team-result').filter(inRecap);
  add('resultater', summary[0]?.title.replace(/ \(.*$/, '') ?? 'Resultater', [...summary, ...recapTeams], summary, summary[0]?.caption ?? null, after(s.results.daysAfterWindow, s.results.time));

  const fixtures = byType('fixtures');
  add('kamper', 'Ukens kamper', fixtures, fixtures, fixtures[0]?.caption ?? null, after(s.fixtures.daysAfterWindow, s.fixtures.time));

  for (const p of byType('table')) add(p.id, p.title, [p], [], p.caption, after(s.fixtures.daysAfterWindow, s.fixtures.time));

  for (const p of byType('match-day')) {
    if (!p.eventStart) continue;
    add(p.id, p.title, [p], [p], p.caption, `${p.eventStart.slice(0, 10)}T${s.matchDay.time}`, p.eventStart);
  }
  return units.sort((a, b) => a.publishAt.localeCompare(b.publishAt) || a.key.localeCompare(b.key));
}

export interface DueOptions {
  published: Record<string, unknown>;
  controls: { paused: boolean; skip: string[]; captions: Record<string, string> };
  /** Opted-out teams: a single-team item about one of them is never published. */
  excludedTeams?: string[];
  now: string;
  /** Manual publish of one item: bypasses schedule, pause and skip. */
  only?: string;
  /** Ignore the schedule (publish everything not yet published). */
  force?: boolean;
  max: number;
}

/**
 * What to publish now, oldest first (so the newest post ends up on top of the grid).
 * Respects the dashboard: pause and skipped items block automatic publishing; edited captions replace the generated ones.
 */
export function selectDue(units: PublicationUnit[], o: DueOptions): PublicationUnit[] {
  return [...units]
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt))
    .filter((u) => !o.published[u.key])
    .filter((u) => !o.only || u.key.endsWith(o.only))
    .filter((u) => o.force || (u.publishAt <= o.now && o.now < u.expiresAt))
    .filter((u) => o.only || (!o.controls.paused && !o.controls.skip.includes(u.key)))
    .filter((u) => !(u.teams.length === 1 && (o.excludedTeams ?? []).includes(u.teams[0])))
    .map((u) => (u.kind === 'feed' && o.controls.captions[u.key] ? { ...u, caption: o.controls.captions[u.key] } : u))
    .slice(0, o.max);
}
