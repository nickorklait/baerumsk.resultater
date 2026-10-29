import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAction, verifyAccessJwt, type Env } from '../cloud/functions/_lib/handle.ts';

const env: Env = { ACCESS_TEAM_DOMAIN: 'haslum.cloudflareaccess.com', ACCESS_AUD: 'aud-123', GITHUB_TOKEN: 'ghtok', GITHUB_REPO: 'nickorklait/fotball-resultater' };
const b64url = (b: Uint8Array | string) => Buffer.from(b).toString('base64url');

const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' };

async function jwt(claims: Record<string, unknown>, kid = 'k1'): Promise<string> {
  const head = b64url(JSON.stringify({ alg: 'RS256', kid }));
  const body = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}
const good = () => ({ aud: ['aud-123'], exp: Math.floor(Date.now() / 1000) + 600, iss: 'https://haslum.cloudflareaccess.com', email: 'kari@klubb.no' });

function fakeFetch() {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/cdn-cgi/access/certs')) return new Response(JSON.stringify({ keys: [jwk] }));
    if (url.endsWith('/dispatches')) return new Response(null, { status: 204 });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { calls, fn };
}

const req = (token: string | null, body: unknown) =>
  new Request('https://x.pages.dev/api/action', { method: 'POST', headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {}, body: JSON.stringify(body) });

test('Access JWT: valid token gives the email; wrong audience, expiry, issuer or signature are rejected', async () => {
  const { fn } = fakeFetch();
  assert.equal(await verifyAccessJwt(await jwt(good()), env, fn), 'kari@klubb.no');
  await assert.rejects(verifyAccessJwt(await jwt({ ...good(), aud: ['other'] }), env, fn));
  await assert.rejects(verifyAccessJwt(await jwt({ ...good(), exp: 1 }), env, fn));
  await assert.rejects(verifyAccessJwt(await jwt({ ...good(), iss: 'https://evil.example' }), env, fn));
  await assert.rejects(verifyAccessJwt(await jwt(good(), 'unknown-kid'), env, fn));
  const t = await jwt(good());
  const tampered = t.split('.').map((part, i) => (i === 1 ? b64url(JSON.stringify({ ...good(), email: 'boss@klubb.no' })) : part)).join('.');
  await assert.rejects(verifyAccessJwt(tampered, env, fn));
});

test('handleAction forwards a valid action to GitHub with the user as author', async () => {
  const { calls, fn } = fakeFetch();
  const res = await handleAction(req(await jwt(good()), { action: { type: 'skip', key: '2026-10-25/kamper-feed' } }), env, fn);
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { ok: true, mode: 'cloud' });
  const dispatch = calls.find((c) => c.url.endsWith('/dispatches'))!;
  assert.equal(dispatch.url, 'https://api.github.com/repos/nickorklait/fotball-resultater/dispatches');
  assert.equal((dispatch.init!.headers as Record<string, string>).Authorization, 'Bearer ghtok');
  assert.deepEqual(JSON.parse(String(dispatch.init!.body)), { event_type: 'dashboard-action', client_payload: { action: { type: 'skip', key: '2026-10-25/kamper-feed' }, by: 'kari@klubb.no' } });
});

test('handleAction refuses: not configured, not logged in, bad token, invalid action', async () => {
  const { calls, fn } = fakeFetch();
  const body = { action: { type: 'pause' } };
  assert.equal((await handleAction(req(await jwt(good()), body), { ...env, GITHUB_TOKEN: undefined }, fn)).status, 503);
  assert.equal((await handleAction(req(null, body), env, fn)).status, 401);
  assert.equal((await handleAction(req('not.a.jwt', body), env, fn)).status, 401);
  assert.equal((await handleAction(req(await jwt(good()), { action: { type: 'skip', key: '../x' } }), env, fn)).status, 400);
  assert.ok(!calls.some((c) => c.url.endsWith('/dispatches')), 'nothing may reach GitHub');
});
