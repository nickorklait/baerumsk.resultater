import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haslumConfig } from './haslumConfig.ts';
import { applyAction, applySettings, EMPTY_CONTROLS } from '../src/controls.ts';
import { MAX_CAPTION, parseAction } from '../src/controlsSchema.ts';
import { selectDue, type PublicationUnit } from '../src/publish/plan.ts';

const KEY = '2026-10-25/kamper-feed';

test('parseAction accepts the dashboard actions', () => {
  assert.deepEqual(parseAction({ type: 'pause' }), { type: 'pause' });
  assert.deepEqual(parseAction({ type: 'skip', key: KEY }), { type: 'skip', key: KEY });
  assert.deepEqual(parseAction({ type: 'caption', key: KEY, text: '  Hei!  ' }), { type: 'caption', key: KEY, text: 'Hei!' });
  assert.deepEqual(parseAction({ type: 'caption', key: KEY, text: null }), { type: 'caption', key: KEY, text: null });
  assert.deepEqual(parseAction({ type: 'settings', settings: { perResult: false, times: { results: '09:30' }, matchDayTeams: ['Haslum Menn 1', 'Haslum G19-1'] } }), {
    type: 'settings',
    settings: { perResult: false, times: { results: '09:30' }, matchDayTeams: ['Haslum Menn 1', 'Haslum G19-1'] },
  });
});

test('parseAction rejects anything malformed (it also guards the cloud function)', () => {
  const bad = [
    null,
    'pause',
    { type: 'delete-everything' },
    { type: 'skip', key: '../../etc/passwd' },
    { type: 'skip', key: '2026-10-25/kamper-feed; rm -rf /' },
    { type: 'caption', key: KEY, text: '' },
    { type: 'caption', key: KEY, text: 'x'.repeat(MAX_CAPTION + 1) },
    { type: 'settings', settings: {} },
    { type: 'settings', settings: { perResult: 'yes' } },
    { type: 'settings', settings: { times: { results: '25:00' } } },
    { type: 'settings', settings: { matchDayTeams: ['<script>'] } },
  ];
  for (const b of bad) assert.throws(() => parseAction(b), Error, JSON.stringify(b));
});

test('applyAction: pause/resume, skip/unskip, captions, settings merge, and an activity log', () => {
  let c = applyAction(EMPTY_CONTROLS, { type: 'pause' }, 'ola@klubb.no', '2026-10-21T10:00:00Z');
  assert.equal(c.paused, true);
  c = applyAction(c, { type: 'skip', key: KEY }, 'ola@klubb.no');
  c = applyAction(c, { type: 'skip', key: KEY }, 'ola@klubb.no');
  assert.deepEqual(c.skip, [KEY]);
  c = applyAction(c, { type: 'caption', key: KEY, text: 'Ny tekst' }, 'kari@klubb.no');
  assert.equal(c.captions[KEY], 'Ny tekst');
  c = applyAction(c, { type: 'settings', settings: { times: { results: '09:00' } } }, 'kari@klubb.no');
  c = applyAction(c, { type: 'settings', settings: { times: { fixtures: '13:00' }, perResult: false } }, 'kari@klubb.no');
  assert.deepEqual(c.settings, { times: { results: '09:00', fixtures: '13:00' }, perResult: false });
  c = applyAction(c, { type: 'caption', key: KEY, text: null }, 'kari@klubb.no');
  c = applyAction(c, { type: 'unskip', key: KEY }, 'kari@klubb.no');
  c = applyAction(c, { type: 'resume' }, 'kari@klubb.no');
  assert.deepEqual([c.paused, c.skip, c.captions], [false, [], {}]);
  assert.equal(c.log.length, 9);
  assert.equal(c.log.at(-1)!.by, 'ola@klubb.no');
  assert.match(c.log[0].action, /automatisk publisering igjen/);
  assert.deepEqual(EMPTY_CONTROLS.log, []); // pure
});

test('applySettings puts dashboard settings on top of club.json', () => {
  const base = haslumConfig();
  const c = applySettings(base, { perResult: false, stories: false, includeChildrenInFixtures: true, matchDayTeams: ['Haslum G19-1'], times: { results: '09:15' } });
  assert.equal(c.publish.schedule.perResult.enabled, false);
  assert.equal(c.publish.instagram.stories, false);
  assert.equal(c.posts.includeChildrenInFixtures, true);
  assert.deepEqual(c.posts.matchDayTeams, ['Haslum G19-1']);
  assert.equal(c.publish.schedule.results.time, '09:15');
  assert.equal(c.publish.schedule.fixtures.time, base.publish.schedule.fixtures.time);
  assert.notEqual(base.publish.schedule.results.time, '09:15'); // base untouched
});

const unit = (key: string, publishAt: string, kind: 'feed' | 'story' = 'feed'): PublicationUnit => ({
  key, week: key.slice(0, 10), label: key, kind, images: ['a.png'], caption: 'auto', altText: '', publishAt, expiresAt: '2026-10-30T00:00', postIds: [], teams: [], sponsors: [],
});

test('team opt-out: no results, no fixtures, and a single-team item is never published', async () => {
  const { resultsInWindow } = await import('../src/posts/results.ts');
  const base = haslumConfig();
  const config = applySettings(base, { excludedTeams: ['Haslum G13-2'] });
  const m = (home: string, away: string) => ({ key: home, fiksId: null, start: '2026-10-18T12:00', league: 'G13 2. div.', round: 1, home, away, venue: '', score: { home: 1, away: 2 } });
  const items = resultsInWindow([m('KFUM G13-2', 'Haslum G13-2'), m('Haslum G13-1', 'Lyn G13-1')], { from: '2026-10-18', to: '2026-10-18' }, config);
  assert.deepEqual(items.map((i) => i.own.name), ['Haslum G13-1']);

  const u = { ...unit('2026-10-25/resultat-g13-2-2026-10-20-feed', '2026-10-21T08:00'), teams: ['Haslum G13-2'] };
  const opts = { published: {}, controls: { paused: false, skip: [], captions: {} }, now: '2026-10-21T15:00', max: 12, excludedTeams: ['Haslum G13-2'] };
  assert.deepEqual(selectDue([u], opts), []);
  assert.deepEqual(parseAction({ type: 'settings', settings: { excludedTeams: ['Haslum G13-2'] } }), { type: 'settings', settings: { excludedTeams: ['Haslum G13-2'] } });
  assert.throws(() => parseAction({ type: 'settings', settings: { excludedTeams: 'Haslum G13-2' } }));
});

test('selectDue respects pause, skip and edited captions; a manual publish bypasses pause and skip', () => {
  const units = [unit('2026-10-25/b-feed', '2026-10-21T12:00'), unit('2026-10-25/a-feed', '2026-10-21T08:00'), unit('2026-10-25/later-feed', '2026-10-28T08:00')];
  const base = { published: {}, now: '2026-10-21T15:00', max: 12 };
  const open = { paused: false, skip: [], captions: { '2026-10-25/b-feed': 'Redigert' } };
  const due = selectDue(units, { ...base, controls: open });
  assert.deepEqual(due.map((u) => u.key), ['2026-10-25/a-feed', '2026-10-25/b-feed']); // oldest first, not the future one
  assert.equal(due[1].caption, 'Redigert');

  assert.deepEqual(selectDue(units, { ...base, controls: { ...open, paused: true } }), []);
  assert.deepEqual(selectDue(units, { ...base, controls: { ...open, skip: ['2026-10-25/a-feed'] } }).map((u) => u.key), ['2026-10-25/b-feed']);
  const manual = selectDue(units, { ...base, controls: { paused: true, skip: ['2026-10-25/a-feed'], captions: {} }, only: '2026-10-25/a-feed', force: true });
  assert.deepEqual(manual.map((u) => u.key), ['2026-10-25/a-feed']);
  assert.deepEqual(selectDue(units, { ...base, controls: open, published: { '2026-10-25/a-feed': {} } }).map((u) => u.key), ['2026-10-25/b-feed']);
});
