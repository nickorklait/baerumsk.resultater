import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InstagramClient, isTransient, InstagramError } from '../src/publish/instagram.ts';

/** A fake graph.instagram.com: `answer` decides per call; every call is logged. */
function fake(answer: (p: string, params: Record<string, string>, n: number) => { status?: number; body: unknown }) {
  const calls: { path: string; params: Record<string, string> }[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const params = Object.fromEntries(init?.body ? new URLSearchParams(String(init.body)) : url.searchParams);
    const p = url.pathname.replace(/^\/v\d+\.\d+\//, '');
    calls.push({ path: p, params });
    const a = answer(p, params, calls.filter((c) => c.path === p).length);
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
  }) as typeof fetch;
  const ig = new InstagramClient({ userId: '17', token: 'tok', apiVersion: 'v26.0', fetch: fetchFn, pollIntervalMs: 1, retryDelaysMs: [1, 1, 1] });
  return { ig, calls };
}
const timeout = { status: 400, body: { error: { message: 'Timeout', type: 'OAuthException', code: -2, is_transient: true } } };

test("Instagram's transient errors are retried; rate limits and real refusals are not", () => {
  assert.equal(isTransient(new InstagramError('Timeout', 400, -2, true)), true);
  assert.equal(isTransient(new InstagramError('Timeout', 400)), true);
  assert.equal(isTransient(new InstagramError('An unexpected error has occurred. Please retry your request later.', 500, 2)), true);
  assert.equal(isTransient(new InstagramError('Application request limit reached', 403, 4, true)), false);
  assert.equal(isTransient(new InstagramError('Invalid parameter', 400, 100)), false);
  assert.equal(isTransient(new Error('Timeout')), false);
});

test('a story whose container times out once is made again and published', async () => {
  const { ig, calls } = fake((p, params, n) => {
    if (p === '17/media') return n === 1 ? timeout : { body: { id: 'c1' } };
    if (p === '17/media_publish') return { body: { id: 'm1' } };
    if (params.fields === 'status_code') return { body: { status_code: 'FINISHED' } };
    return { body: {} };
  });
  assert.deepEqual(await ig.publishStories(['https://x/1.jpg']), ['m1']);
  assert.equal(calls.filter((c) => c.path === '17/media').length, 2);
});

test('a hiccup while checking the container status is waited out', async () => {
  const { ig } = fake((p, params, n) => {
    if (p === '17/media') return { body: { id: 'c1' } };
    if (p === '17/media_publish') return { body: { id: 'm1' } };
    if (params.fields === 'status_code') return n === 1 ? timeout : { body: { status_code: 'FINISHED' } };
    return { body: {} };
  });
  assert.deepEqual(await ig.publishStories(['https://x/1.jpg']), ['m1']);
});

test('a publish that times out is tried again, but never twice when it went through', async () => {
  // Not published yet: publish again.
  let f = fake((p, params, n) => {
    if (p === '17/media') return { body: { id: 'c1' } };
    if (p === '17/media_publish') return n === 1 ? timeout : { body: { id: 'm1' } };
    if (params.fields === 'status_code') return { body: { status_code: 'FINISHED' } };
    return { body: {} };
  });
  assert.deepEqual(await f.ig.publishStories(['https://x/1.jpg']), ['m1']);
  assert.equal(f.calls.filter((c) => c.path === '17/media_publish').length, 2);
  // It went out despite the timeout: no second publish.
  let published = false;
  f = fake((p, params) => {
    if (p === '17/media') return { body: { id: 'c1' } };
    if (p === '17/media_publish') { published = true; return timeout; }
    if (params.fields === 'status_code') return { body: { status_code: published ? 'PUBLISHED' : 'FINISHED' } };
    return { body: {} };
  });
  assert.deepEqual(await f.ig.publishStories(['https://x/1.jpg']), ['c1']);
  assert.equal(f.calls.filter((c) => c.path === '17/media_publish').length, 1);
});

test('a rate limit is not retried here (the post waits for the next run)', async () => {
  const { ig, calls } = fake(() => ({ status: 403, body: { error: { message: 'Application request limit reached', code: 4, is_transient: true } } }));
  await assert.rejects(ig.publishStories(['https://x/1.jpg']), /request limit/);
  assert.equal(calls.length, 1);
});

test('a dropped connection counts as a hiccup', async () => {
  let n = 0;
  const ig = new InstagramClient({
    userId: '17', token: 'tok', apiVersion: 'v26.0', pollIntervalMs: 1, retryDelaysMs: [1],
    fetch: (async (input: string | URL | Request) => {
      const p = new URL(String(input)).pathname;
      if (p.endsWith('/media') && ++n === 1) throw new TypeError('fetch failed');
      return new Response(JSON.stringify(p.endsWith('/media') ? { id: 'c1' } : p.endsWith('/media_publish') ? { id: 'm1' } : { status_code: 'FINISHED' }));
    }) as typeof fetch,
  });
  assert.deepEqual(await ig.publishStories(['https://x/1.jpg']), ['m1']);
});
