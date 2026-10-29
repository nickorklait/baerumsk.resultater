import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { haslumConfig } from './haslumConfig.ts';
import { formatRangeNo, periodLabel, sundayOf } from '../src/dates.ts';
import { parseIcal } from '../src/data/ical.ts';
import { eventToMatch, type Match } from '../src/data/match.ts';
import { resultsInWindow, summarize } from '../src/posts/results.ts';
import { latestWeekWithResults, postWeek } from '../src/posts/week.ts';

const config = haslumConfig();
const real = parseIcal(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'club-92-real.ics'), 'utf8'))
  .events.map((e) => eventToMatch(e, 'Haslum'))
  .filter((m): m is Match => m !== null);

test('week windows: Tue–Mon (default) covers every day, so midweek results are never lost', () => {
  const tueMon = { ...config, posts: { ...config.posts, resultsWindow: { from: 'tue' as const, to: 'mon' as const } } };
  const w = postWeek('2026-10-18', tueMon);
  assert.deepEqual(w.results, { from: '2026-10-13', to: '2026-10-19' });
  assert.deepEqual(w.fixtures, { from: '2026-10-20', to: '2026-10-26' });
  // The next week starts the day after: no gap, no overlap.
  assert.equal(postWeek('2026-10-25', tueMon).results.from, '2026-10-20');
  assert.equal(periodLabel(w.results).title, 'Ukens');
  assert.equal(periodLabel({ from: '2026-10-18', to: '2026-10-19' }).title, 'Helgens');
});

test('week windows: Fri–Mon results, then the next seven days of fixtures', () => {
  assert.equal(sundayOf('2026-10-18'), '2026-10-18');
  assert.equal(sundayOf('2026-10-14'), '2026-10-18');
  const w = postWeek('2026-10-18', { ...config, posts: { ...config.posts, resultsWindow: { from: 'fri', to: 'mon' } } });
  assert.deepEqual(w.results, { from: '2026-10-16', to: '2026-10-19' });
  assert.deepEqual(w.fixtures, { from: '2026-10-20', to: '2026-10-26' });
  assert.equal(formatRangeNo(w.results), '16.–19. oktober 2026');
  assert.equal(formatRangeNo({ from: '2026-10-30', to: '2026-11-02' }), '30. oktober – 2. november 2026');
  assert.equal(formatRangeNo({ from: '2026-10-18', to: '2026-10-18' }), '18. oktober 2026');
});

test('default (Fri–Sun recap): Monday results belong to the new week, Monday–Sunday', () => {
  const w = postWeek('2026-10-25', config);
  assert.deepEqual(w.results, { from: '2026-10-23', to: '2026-10-25' });
  assert.deepEqual(w.span, { from: '2026-10-19', to: '2026-10-25' });
  assert.deepEqual(w.fixtures, { from: '2026-10-26', to: '2026-11-01' });
  // The last result in the fixture is Monday 19 Oct, so the latest week is the one starting that Monday.
  assert.equal(latestWeekWithResults(real, config, '2026-10-20')?.key, '2026-10-25');
});

test('weekend results for 16–19 Oct from the real feed (Fri–Mon window)', () => {
  const friMon = { ...config, posts: { ...config.posts, resultsWindow: { from: 'fri' as const, to: 'mon' as const } } };
  const items = resultsInWindow(real, postWeek('2026-10-18', friMon).results, friMon);
  assert.deepEqual(items.map((i) => `${i.own.label} ${i.goalsFor}-${i.goalsAgainst} ${i.outcome}`), [
    'G13-2 9-2 win',
    'Menn 2 7-2 win',
    'G15-1 2-1 win',
    'G19-3 2-2 draw',
    'G16-2 10-2 win',
  ]);
  assert.deepEqual(summarize(items), { wins: 4, draws: 1, losses: 0, goalsFor: 30, matches: 5 });
});

test('children (12 and under) are left out of results; internal matches have no outcome', () => {
  const base = { fiksId: null, league: 'G09 år avd. 05', round: 18, venue: 'X', key: 'k' };
  const kids: Match = { ...base, start: '2026-10-17T12:00', home: 'Haslum G9 2', away: 'Frisk Asker G9 2', score: { home: 3, away: 1 } };
  const derby: Match = { ...base, key: 'd', league: 'G14 4. div.', start: '2026-10-17T13:00', home: 'Haslum G14-1', away: 'Haslum G14-2', score: { home: 1, away: 1 } };
  const items = resultsInWindow([kids, derby], { from: '2026-10-16', to: '2026-10-19' }, config);
  assert.equal(items.length, 1);
  assert.equal(items[0].side, 'both');
  assert.equal(items[0].outcome, null);
});
