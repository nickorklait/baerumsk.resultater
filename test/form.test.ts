import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haslumConfig } from './haslumConfig.ts';
import type { Match } from '../src/data/match.ts';
import { teamForm } from '../src/posts/form.ts';
import { addFollowerPoint, followerTrend, insightTargets, interactions } from '../src/publish/insights.ts';

const config = haslumConfig();
const T = 'Haslum G16-2';
const m = (day: string, home: string, away: string, h: number, a: number): Match => ({
  key: `${day}${home}`, fiksId: null, start: `${day}T18:00`, league: 'G16', round: 1, home, away, venue: '', score: { home: h, away: a },
});

test('form: last results oldest first, and a streak phrased as "the last N matches"', () => {
  const ms = [
    m('2026-10-01', T, 'Lyn G16-1', 0, 1), // loss
    m('2026-10-08', 'KFUM G16-1', T, 1, 3), // win (away)
    m('2026-10-15', T, 'Bærum G16-1', 2, 0), // win
    m('2026-10-22', T, 'Holmen G16-1', 4, 4), // draw
    m('2026-10-29', 'Ready G16-1', T, 0, 2), // win (after the match we ask about)
  ];
  assert.deepEqual(teamForm(ms, T, '2026-10-15T18:00', config), { outcomes: ['loss', 'win', 'win'], streak: 'Seier i de 2 siste kampene' });
  assert.deepEqual(teamForm(ms, T, '2026-10-22T18:00', config), { outcomes: ['loss', 'win', 'win', 'draw'], streak: 'Ubeseiret i de 3 siste kampene' });
  assert.equal(teamForm(ms, T, '2026-10-01T18:00', config).streak, null); // never a losing streak
  assert.equal(teamForm(ms, 'Haslum G13-1', '2026-10-29T18:00', config).outcomes.length, 0);
});

test('insights helpers: follower trend, interactions, which publications to read', () => {
  let i = { followers: [] as { date: string; count: number }[], media: {} };
  i = addFollowerPoint(i, 40, new Date('2026-10-15T10:00:00Z'));
  i = addFollowerPoint(i, 52, new Date('2026-10-22T09:00:00Z'));
  i = addFollowerPoint(i, 55, new Date('2026-10-22T15:00:00Z')); // same day: replaces
  assert.deepEqual(followerTrend(i), { now: 55, delta: 15 });
  assert.equal(interactions({ mediaId: 'x', kind: 'feed', fetchedAt: '', likes: 10, comments: 2, saved: 1, shares: 3 }), 16);
  const now = Date.parse('2026-10-23T12:00:00Z');
  const pub = {
    a: { publishedAt: '2026-10-22T20:00:00Z', kind: 'story' as const, mediaIds: ['1'], permalink: null },
    b: { publishedAt: '2026-10-21T08:00:00Z', kind: 'story' as const, mediaIds: ['2'], permalink: null }, // story older than 24 h
    c: { publishedAt: '2026-10-15T08:00:00Z', kind: 'feed' as const, mediaIds: ['3'], permalink: null },
    d: { publishedAt: '2026-10-01T08:00:00Z', kind: 'feed' as const, mediaIds: ['4'], permalink: null }, // older than 14 days
  };
  assert.deepEqual(insightTargets(pub, now).map((t) => t.key), ['a', 'c']);
});
