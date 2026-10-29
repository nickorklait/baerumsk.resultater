import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Match } from '../src/data/match.ts';
import { calculateTable, coverage, withExampleScores } from '../src/posts/table.ts';

let n = 0;
const m = (home: string, away: string, score: [number, number] | null, start = '2026-09-01T18:00'): Match => ({
  key: `k${n++}`, fiksId: null, start, league: 'Test', round: 1, home, away, venue: '',
  score: score ? { home: score[0], away: score[1] } : null,
});

const summary = (rows: ReturnType<typeof calculateTable>) => rows.map((r) => `${r.position}. ${r.team} ${r.played} ${r.won}-${r.drawn}-${r.lost} ${r.goalsFor}-${r.goalsAgainst} ${r.points}p`);

test('3/1/0 points', () => {
  const rows = calculateTable([m('A', 'B', [2, 0]), m('C', 'A', [1, 1]), m('B', 'C', [0, 3])]);
  assert.deepEqual(summary(rows), ['1. C 2 1-1-0 4-1 4p', '2. A 2 1-1-0 3-1 4p', '3. B 2 0-0-2 0-5 0p']);
});

test('tie-break: points, then goal difference, then goals scored', () => {
  // A and C both 4 points. C has better goal difference (+3 vs +2).
  const rows = calculateTable([m('A', 'B', [2, 0]), m('C', 'A', [1, 1]), m('B', 'C', [0, 3])]);
  assert.deepEqual(rows.map((r) => r.team), ['C', 'A', 'B']);

  // Same points and goal difference: more goals scored wins.
  const rows2 = calculateTable([m('X', 'Z', [3, 2]), m('Y', 'W', [1, 0])]);
  assert.deepEqual(rows2.slice(0, 2).map((r) => r.team), ['X', 'Y']);
  assert.equal(rows2[0].goalDiff, rows2[1].goalDiff);
});

test('fully level teams share a position', () => {
  const rows = calculateTable([m('A', 'B', [1, 1])]);
  assert.deepEqual(summary(rows), ['1. A 1 0-1-0 1-1 1p', '1. B 1 0-1-0 1-1 1p']);
});

test('unplayed fixtures add teams with zero matches but no points', () => {
  const rows = calculateTable([m('A', 'B', [1, 0]), m('C', 'D', null)]);
  assert.equal(rows.length, 4);
  assert.equal(rows.find((r) => r.team === 'C')!.played, 0);
});

test('coverage: table only counts as complete when every played match has a score', () => {
  const ms = [m('A', 'B', [1, 0], '2026-10-01T18:00'), m('C', 'D', null, '2026-10-02T18:00'), m('A', 'C', null, '2026-11-01T18:00')];
  assert.deepEqual(coverage(ms, '2026-10-20T10:00'), { played: 2, withScore: 1, complete: false });
  assert.equal(coverage(ms.slice(0, 1), '2026-10-20T10:00').complete, true);
});

test('example scores are deterministic and only fill past matches', () => {
  const ms = [m('A', 'B', null, '2026-10-01T18:00'), m('A', 'C', null, '2026-11-01T18:00')];
  const a = withExampleScores(ms, '2026-10-20T10:00');
  const b = withExampleScores(ms, '2026-10-20T10:00');
  assert.deepEqual(a, b);
  assert.ok(a[0].score);
  assert.equal(a[1].score, null);
});
