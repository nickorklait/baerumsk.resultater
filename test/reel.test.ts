import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { InstagramClient } from '../src/publish/instagram.ts';
import { durations, FADE, makeReel, reelSeconds } from '../src/publish/reel.ts';
import { paths } from '../src/config.ts';

test('a Reel is a REELS container with the video URL and caption, kept out of the grid, then published', async () => {
  const calls: { path: string; params: Record<string, string> }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const params = Object.fromEntries(init?.body ? new URLSearchParams(String(init.body)) : url.searchParams);
    const p = url.pathname.replace(/^\/v\d+\.\d+\//, '');
    calls.push({ path: p, params });
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (p.endsWith('/media')) return json({ id: 'c1' });
    if (p.endsWith('/media_publish')) return json({ id: 'm1' });
    if (params.fields === 'status_code') return json({ status_code: calls.filter((c) => c.params.fields === 'status_code').length < 2 ? 'IN_PROGRESS' : 'FINISHED' });
    return json({});
  }) as typeof fetch;
  const ig = new InstagramClient({ userId: '1789', token: 'tok', apiVersion: 'v26.0', fetch: fetchFn, pollIntervalMs: 1 });
  assert.equal(await ig.publishReel('https://x/a.mp4', 'Tekst'), 'm1');
  const create = calls.find((c) => c.path === '1789/media')!.params;
  assert.deepEqual([create.media_type, create.video_url, create.caption, create.share_to_feed], ['REELS', 'https://x/a.mp4', 'Tekst', 'false']);
  assert.equal(calls.filter((c) => c.params.fields === 'status_code').length, 2); // waited for processing
  assert.equal(calls.at(-1)!.params.creation_id, 'c1');
});

test('the video: 9:16 MP4 from the story images, moving and cross-faded, a short first image, and a follow line', () => {
  assert.deepEqual(durations(1), [6]);
  assert.deepEqual(durations(3), [2.5, 3, 3]);
  assert.equal(reelSeconds(3), 2.5 + 3 + 3 - 2 * FADE);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'));
  const pngs = ['#0c1b2e', '#f5c400'].map((fill, i) => {
    const file = path.join(dir, `${i}.png`);
    fs.writeFileSync(file, new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="108" height="192"><rect width="108" height="192" fill="${fill}"/></svg>`).render().asPng());
    return file;
  });
  const out = path.join(dir, 'reel.mp4');
  makeReel(pngs, out, { endText: 'Følg @konto for mer: 50 % 100', fontDir: paths.fonts });
  const head = fs.readFileSync(out).subarray(4, 8).toString('latin1');
  assert.equal(head, 'ftyp');
  fs.rmSync(dir, { recursive: true, force: true });
});
