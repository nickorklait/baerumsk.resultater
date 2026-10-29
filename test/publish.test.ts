import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Resvg } from '@resvg/resvg-js';
import { loadConfig } from '../src/config.ts';
import type { Manifest, ManifestPost } from '../src/gallery/build.ts';
import { InstagramClient } from '../src/publish/instagram.ts';
import { pngSize, pngToJpeg } from '../src/publish/jpeg.ts';
import { addHours, MAX_CAROUSEL, planUnits } from '../src/publish/plan.ts';

const config = loadConfig();
config.publish.instagram.stories = true;
// The original weekly plan: no per-result posts, teams in the recap carousel.
const weekly = { ...config, publish: { ...config.publish, schedule: { ...config.publish.schedule, perResult: { enabled: false, since: '2026-01-01', expiresAfterHours: 72 } } } };
const perResult = { ...config, publish: { ...config.publish, schedule: { ...config.publish.schedule, perResult: { enabled: true, since: '2026-10-19', expiresAfterHours: 72 } } } };

const post = (id: string, type: string, feed: number, extra: Partial<ManifestPost> = {}): ManifestPost => ({
  id, type, group: type, title: id, teams: [], sponsors: [], demo: false, caption: `caption ${id}`, captionSource: 'template',
  images: { feed: Array.from({ length: feed }, (_, i) => `${id}_feed_${i + 1}.png`), story: [`${id}_story.png`] }, ...extra,
});

const manifest: Manifest = {
  week: { key: '2026-10-18', results: { from: '2026-10-16', to: '2026-10-19' }, fixtures: { from: '2026-10-20', to: '2026-10-26' } },
  generatedAt: '2026-10-20T08:00:00Z',
  zip: 'x.zip',
  posts: [
    post('resultater-klubb', 'results-summary', 1),
    post('resultat-g13-2', 'team-result', 1, { eventStart: '2026-10-18T17:00' }),
    post('resultat-g16-2', 'team-result', 1, { eventStart: '2026-10-19T20:30' }),
    post('ukens-kamper', 'fixtures', 3),
    post('kampdag-menn-1', 'match-day', 1, { eventStart: '2026-10-20T20:15' }),
    post('tabell-205342', 'table', 1, { demo: true }),
  ],
};

test('plan (weekly): results carousel (summary first), fixtures carousel, match day on the day, stories alongside', () => {
  const units = planUnits(manifest, weekly);
  const byKey = Object.fromEntries(units.map((u) => [u.key.split('/')[1], u]));
  assert.deepEqual(byKey['resultater-feed'].images, ['resultater-klubb_feed_1.png', 'resultat-g13-2_feed_1.png', 'resultat-g16-2_feed_1.png']);
  assert.equal(byKey['resultater-feed'].caption, 'caption resultater-klubb');
  assert.equal(byKey['resultater-feed'].publishAt, '2026-10-20T10:00');
  assert.deepEqual(byKey['resultater-story'].images, ['resultater-klubb_story.png']);
  assert.equal(byKey['resultater-story'].caption, null);
  assert.equal(byKey['kamper-feed'].images.length, 3);
  assert.equal(byKey['kamper-feed'].publishAt, '2026-10-20T12:00');
  assert.equal(byKey['kampdag-menn-1-feed'].publishAt, '2026-10-20T08:00');
  assert.equal(byKey['kampdag-menn-1-feed'].expiresAt, '2026-10-20T20:15'); // never after kick-off
  assert.equal(byKey['resultater-feed'].expiresAt, '2026-10-23T10:00');
});

test('plan: example (demo) posts are never published', () => {
  assert.ok(!planUnits(manifest, config).some((u) => u.key.includes('tabell')));
});

test('plan: carousels are capped at the Instagram maximum', () => {
  const big: Manifest = { ...manifest, posts: [post('resultater-klubb', 'results-summary', 3), ...Array.from({ length: 25 }, (_, i) => post(`r${i}`, 'team-result', 1, { eventStart: '2026-10-18T12:00' }))] };
  assert.equal(planUnits(big, weekly).find((u) => u.key.endsWith('resultater-feed'))!.images.length, MAX_CAROUSEL);
});

/** Fake Graph API: records calls and answers like Meta does. */
function fakeApi() {
  const calls: { method: string; path: string; params: Record<string, string> }[] = [];
  let n = 0;
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const params = Object.fromEntries(init?.body ? new URLSearchParams(String(init.body)) : url.searchParams);
    const p = url.pathname.replace(/^\/v\d+\.\d+\//, '');
    calls.push({ method: init?.method ?? 'GET', path: p, params });
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (p.endsWith('/media')) return json({ id: `c${++n}` });
    if (p.endsWith('/media_publish')) return json({ id: `m${++n}` });
    if (params.fields === 'status_code') return json({ status_code: 'FINISHED' });
    return json({});
  }) as typeof fetch;
  return { calls, client: new InstagramClient({ userId: '1789', token: 'tok', apiVersion: 'v26.0', fetch: fetchFn, pollIntervalMs: 1 }) };
}

test('instagram: single image post = container with caption and alt text, then publish', async () => {
  const { calls, client } = fakeApi();
  const id = await client.publishFeed(['https://x/a.jpg'], 'Hei', 'alt');
  assert.match(id, /^m/);
  const create = calls.find((c) => c.path === '1789/media')!;
  assert.deepEqual({ url: create.params.image_url, caption: create.params.caption, alt: create.params.alt_text, token: create.params.access_token }, { url: 'https://x/a.jpg', caption: 'Hei', alt: 'alt', token: 'tok' });
  assert.equal(calls.at(-1)!.path, '1789/media_publish');
});

test('instagram: carousel = item containers, then CAROUSEL container with children and caption, then publish', async () => {
  const { calls, client } = fakeApi();
  await client.publishFeed(['https://x/1.jpg', 'https://x/2.jpg'], 'Tekst');
  const creates = calls.filter((c) => c.path === '1789/media');
  assert.equal(creates.length, 3);
  assert.equal(creates[0].params.is_carousel_item, 'true');
  assert.equal(creates[0].params.caption, undefined);
  assert.equal(creates[2].params.media_type, 'CAROUSEL');
  assert.equal(creates[2].params.children, 'c1,c2');
  assert.equal(creates[2].params.caption, 'Tekst');
  assert.equal(calls.at(-1)!.params.creation_id, 'c3');
});

test('instagram: each story image is published separately as STORIES', async () => {
  const { calls, client } = fakeApi();
  const ids = await client.publishStories(['https://x/s1.jpg', 'https://x/s2.jpg']);
  assert.equal(ids.length, 2);
  assert.ok(calls.filter((c) => c.path === '1789/media').every((c) => c.params.media_type === 'STORIES'));
});

test('jpeg: PNG is converted to a JPEG of the same size', () => {
  const png = Buffer.from(new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50"><rect width="40" height="50" fill="#02793c"/></svg>').render().asPng());
  assert.deepEqual(pngSize(png), { width: 40, height: 50 });
  const jpg = pngToJpeg(png, 40, 50);
  assert.equal(jpg.readUInt16BE(0), 0xffd8); // JPEG SOI marker
});

test('instagram: account ID comes from user_id (not the app-scoped id), flat or wrapped in data', async () => {
  for (const body of [{ data: [{ user_id: '1789', username: 'baerumfotball.resultater', account_type: 'MEDIA_CREATOR' }] }, { id: 'app-scoped', user_id: 1789, username: 'x' }]) {
    const fetchFn = (async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
    const me = await new InstagramClient({ userId: 'me', token: 't', apiVersion: 'v26.0', fetch: fetchFn }).whoAmI();
    assert.equal(me.userId, '1789');
  }
});

test('plan (per result): each result is its own post from kick-off, the recap is the summary only', () => {
  const units = planUnits(manifest, perResult);
  const g16 = units.find((u) => u.key.endsWith('resultat-g16-2-feed'))!;
  assert.equal(g16.publishAt, '2026-10-19T20:30');
  assert.equal(g16.expiresAt, '2026-10-22T20:30');
  assert.deepEqual(g16.images, ['resultat-g16-2_feed_1.png']);
  assert.equal(g16.caption, 'caption resultat-g16-2');
  // Results before "since" are not posted individually (they were in an earlier recap).
  assert.ok(!units.some((u) => u.key.endsWith('resultat-g13-2-feed')));
  assert.deepEqual(units.find((u) => u.key.endsWith('resultater-feed'))!.images, ['resultater-klubb_feed_1.png']);
});

test('addHours crosses midnight and month ends in local time', () => {
  assert.equal(addHours('2026-10-31T22:00', 72), '2026-11-03T22:00');
  assert.equal(addHours('2026-10-20T20:15', 4), '2026-10-21T00:15');
});

test('token: encrypted round trip with TOKEN_ENCRYPTION_KEY, unreadable with a wrong key', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { ROOT } = await import('../src/config.ts');
  const { loadCredentials, saveCredentials } = await import('../src/publish/state.ts');
  const enc = path.join(ROOT, 'data', 'instagram-token.enc');
  const backup = fs.existsSync(enc) ? fs.readFileSync(enc) : null;
  const env = { ...process.env };
  try {
    process.env.TOKEN_ENCRYPTION_KEY = 'test-key';
    process.env.INSTAGRAM_ACCESS_TOKEN = 'env-token';
    saveCredentials({ userId: '1', token: 'refreshed-token', refreshedAt: '2026-10-21T00:00:00Z', envTokenHash: (await import('../src/publish/state.ts')).tokenHash('env-token') });
    assert.ok(!fs.readFileSync(enc, 'utf8').includes('refreshed-token'));
    assert.equal(loadCredentials()?.token, 'refreshed-token');
    process.env.TOKEN_ENCRYPTION_KEY = 'wrong-key';
    assert.equal(loadCredentials()?.token, 'env-token');
  } finally {
    process.env = env;
    if (backup) fs.writeFileSync(enc, backup);
    else fs.rmSync(enc, { force: true });
  }
});
