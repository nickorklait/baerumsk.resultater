import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.ts';
import type { PublishedEntry } from './state.ts';
import type { Profile } from './profile.ts';

/** Instagram statistics, collected after each run (data/insights.json, committed in the cloud). */
export interface Insights {
  updatedAt?: string;
  /** Set when statistics cannot be read, e.g. "missing-permission". */
  error?: string;
  /** Is the profile set up (picture, bio) and does it follow anyone: the growth report's checklist. */
  profile?: Profile;
  /** One point per day (Oslo date), latest value of the day. */
  followers: { date: string; count: number }[];
  /** Per publication key. */
  media: Record<string, { mediaId: string; kind: 'feed' | 'story' | 'reel'; fetchedAt: string; reach?: number; likes?: number; comments?: number; saved?: number; shares?: number; replies?: number }>;
}

const FILE = path.join(ROOT, 'data', 'insights.json');

export function readInsights(): Insights {
  return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { followers: [], media: {} };
}

export function writeInsights(i: Insights): void {
  fs.writeFileSync(FILE, JSON.stringify(i, null, 2) + '\n');
}

export const interactions = (m: Insights['media'][string] | undefined) => (m ? (m.likes ?? 0) + (m.comments ?? 0) + (m.saved ?? 0) + (m.shares ?? 0) + (m.replies ?? 0) : 0);

/** Record today's follower count (one point per Oslo day). */
export function addFollowerPoint(i: Insights, count: number, now = new Date()): Insights {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(now);
  return { ...i, followers: [...i.followers.filter((p) => p.date !== date), { date, count }].sort((a, b) => a.date.localeCompare(b.date)) };
}

/** Followers now and the change since `days` ago (null when there is no point that old yet). */
export function followerTrend(i: Insights, days = 7): { now: number | null; delta: number | null } {
  const last = i.followers.at(-1);
  if (!last) return { now: null, delta: null };
  const cutoff = new Date(Date.parse(`${last.date}T00:00:00Z`) - days * 864e5).toISOString().slice(0, 10);
  const before = [...i.followers].reverse().find((p) => p.date <= cutoff);
  return { now: last.count, delta: before ? last.count - before.count : null };
}

/**
 * Which publications to (re)read now: feed posts from the last 14 days (numbers keep growing for a while)
 * and stories from the last 24 hours (Instagram drops story insights after that). Each read counts against the
 * Meta app's shared rate limit.
 */
export function insightTargets(published: Record<string, PublishedEntry>, now = Date.now()): { key: string; entry: PublishedEntry }[] {
  return Object.entries(published)
    .filter(([, e]) => now - Date.parse(e.publishedAt) < (e.kind === 'story' ? 24 * 3.6e6 : 14 * 864e5))
    .map(([key, entry]) => ({ key, entry }));
}
