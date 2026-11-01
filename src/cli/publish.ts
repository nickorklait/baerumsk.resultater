// npm run publish [-- --dry-run] [--now] [--only resultater-feed] [--max 6]
// Publishes the posts that are due (see the plan in src/publish/plan.ts) to Instagram.
// Nothing is sent unless "publish.enabled" is true in config/club.json and credentials are set.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, loadSponsors, paths, ROOT } from '../config.ts';
import { readControls } from '../controls.ts';
import { updateStatus } from '../status.ts';
import { addDays, osloNow } from '../dates.ts';
import { readManifests } from '../gallery/build.ts';
import { InstagramClient, InstagramError, refreshToken } from '../publish/instagram.ts';
import { cloudflaredAvailable, staticHost, tunnelHost, type ImageHost } from '../publish/host.ts';
import { connectInstagram } from '../publish/connect.ts';
import { pngSize, pngToJpeg } from '../publish/jpeg.ts';
import { planUnits, selectDue, type PublicationUnit } from '../publish/plan.ts';
import { makeReel } from '../publish/reel.ts';
import { loadCredentials, readPublished, recordPublished, saveCredentials } from '../publish/state.ts';

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    now: { type: 'boolean', default: false },
    only: { type: 'string' },
    max: { type: 'string', default: '12' },
    check: { type: 'boolean', default: false },
  },
});

const config = loadConfig();
const sponsorConfig = loadSponsors(config);

/** Connect to Instagram: refresh the token if due, then resolve the account from the token. */
const connect = () => connectInstagram(config);

if (args.check) {
  const { me, ig } = await connect();
  console.log(`Token OK: @${me.username} (account ID ${me.userId}, type ${me.accountType ?? 'unknown'}).`);
  console.log(`Posts published via the API in the last 24 h: ${await ig.quotaUsage()}.`);
  console.log(`Image hosting: ${config.publish.imageBaseUrl ? config.publish.imageBaseUrl : cloudflaredAvailable() ? 'cloudflared tunnel (installed)' : 'MISSING - install cloudflared: winget install --id Cloudflare.cloudflared'}`);
  console.log(`Publishing switch: ${config.publish.enabled ? 'ON' : 'OFF (publish.enabled in config/club.json)'}`);
  process.exit(0);
}
const now = osloNow();
const published = readPublished();

// Weeks from the last three weeks: match-day posts of last week can still be due.
const controls = readControls(ROOT);
const recent = readManifests().filter((m) => m.week.key >= addDays(now.slice(0, 10), -21));
const allUnits = recent.flatMap((m) => planUnits(m, config));
const due = selectDue(allUnits, { published, controls, now, only: args.only, force: args.now, max: Number(args.max), excludedTeams: config.posts.excludedTeams });
const waiting = allUnits.filter((u) => !published[u.key] && now < u.expiresAt).length - due.length;

const fmt = (u: PublicationUnit) => `${u.publishAt.replace('T', ' ')}  ${u.kind.padEnd(5)}  ${u.label} (${u.images.length} bilde${u.images.length > 1 ? 'r' : ''})  [${u.key}]`;
if (controls.paused && !args.only) console.log('Automatic publishing is paused from the dashboard.');
if (due.length === 0) {
  console.log('Nothing due for publishing.');
  if (!args['dry-run']) updateStatus('publish', { paused: controls.paused, published: [], failed: [], waiting });
  process.exit(0);
}
console.log(`Due now (${now.replace('T', ' ')}):\n${due.map((u) => `  ${fmt(u)}`).join('\n')}\n`);

// Safety: never publish fictional or not-yet-approved real sponsors to a public account.
if (sponsorConfig.kind === 'demo') throw new Error('The sponsor file contains fictional demo sponsors. Use sponsors.placeholder.json or approved real sponsors before publishing.');
if (sponsorConfig.kind === 'real' && !sponsorConfig.approvedForPublishing) throw new Error(`${config.sponsors.file}: approvedForPublishing is false. Get the club's OK, or use sponsors.placeholder.json.`);

// Convert to JPEG (Instagram requirement) into one folder per run.
const runDir = path.join(paths.output, '_publish');
fs.rmSync(runDir, { recursive: true, force: true });
fs.mkdirSync(runDir, { recursive: true });
const jpegName = (u: PublicationUnit, png: string) => `${u.week}_${png.replace(/\.png$/, '.jpg')}`;
for (const u of due) {
  for (const png of u.images) {
    const buf = fs.readFileSync(path.join(paths.output, u.week, png));
    const { width, height } = pngSize(buf);
    fs.writeFileSync(path.join(runDir, jpegName(u, png)), pngToJpeg(buf, width, height));
  }
}
console.log(`Prepared ${fs.readdirSync(runDir).length} JPEG images in ${path.relative(process.cwd(), runDir)}`);

const dryRun = args['dry-run'] || !config.publish.enabled;
if (dryRun) {
  console.log(
    config.publish.enabled
      ? '\nDry run: nothing was sent.'
      : '\nDry run: "publish.enabled" is false in config/club.json, so nothing was sent.',
  );
  if (!config.publish.imageBaseUrl && !cloudflaredAvailable()) console.log('Note: real publishing needs cloudflared (winget install --id Cloudflare.cloudflared) or publish.imageBaseUrl.');
  if (!loadCredentials()) console.log('Note: real publishing needs INSTAGRAM_ACCESS_TOKEN in .env (see README).');
  process.exit(0);
}

// A new club account before its Instagram token is added: build everything, publish nothing, don't fail.
if (!loadCredentials()?.token) {
  console.log('Instagram is not connected yet (no INSTAGRAM_ACCESS_TOKEN): posts built, not published.');
  process.exit(0);
}

// Credentials, refreshed weekly so the 60-day token never runs out while the job is in use.
const { me, ig } = await connect();
console.log(`Publishing to @${me.username}. Posts used in the last 24 h: ${await ig.quotaUsage()}.`);

const host: ImageHost = config.publish.imageBaseUrl ? staticHost(`${config.publish.imageBaseUrl}/_publish`) : await tunnelHost(runDir);
const done: string[] = [];
const failed: { key: string; error: string }[] = [];
try {
  for (const u of due) {
    const urls = u.images.map((png) => host.url(jpegName(u, png)));
    try {
      const ids = u.kind === 'feed' ? [await ig.publishFeed(urls, u.caption ?? '', u.altText)] : await ig.publishStories(urls);
      const permalink = u.kind === 'feed' ? await ig.permalink(ids[0]).catch(() => null) : null;
      recordPublished(u.key, {
        publishedAt: new Date().toISOString(), kind: u.kind, mediaIds: ids, permalink,
        label: u.label, sponsors: u.sponsors, teams: u.teams, images: u.images.length, thumb: `${u.week}/${u.images[0]}`,
      });
      done.push(u.key);
      console.log(`  ✓ ${u.label}${permalink ? `  ${permalink}` : ''}`);
      if (u.kind === 'story') await reel(u);
    } catch (e) {
      const msg = e instanceof InstagramError ? `${e.message} (status ${e.status}${e.code ? `, code ${e.code}` : ''})` : (e as Error).message;
      failed.push({ key: u.key, error: msg });
      console.error(`  ✗ ${u.label}: ${msg}`);
    }
  }
} finally {
  await host.close();
  updateStatus('publish', { paused: controls.paused, published: done, failed, waiting });
}
/** Meta's rate limits: the post waits for the next run, which is not a failure. */
const RATE_LIMITED = /request limit|rate limit|too many calls/i;
if (failed.some((f) => !RATE_LIMITED.test(f.error))) process.exitCode = 1;

/**
 * The story images as a Reel too (publish/reel.ts): Reels reach people who do not follow yet. Only for the
 * week's main posts (results, matches, match days, tables), not every single result: Instagram allows about
 * 50 posts a day, and one Reel per youth match would look like spam. Never fails the run.
 */
async function reel(u: PublicationUnit): Promise<void> {
  const base = u.key.replace(/-story$/, '');
  if (/\/resultat-/.test(base)) return;
  const key = `${base}-reel`;
  if (readPublished()[key]) return;
  const feedKey = `${base}-feed`;
  const caption = controls.captions[feedKey] ?? allUnits.find((x) => x.key === feedKey)?.caption;
  if (!caption) return;
  try {
    const file = `${base.replace(/[^\w-]/g, '_')}.mp4`;
    makeReel(u.images.map((png) => path.join(paths.output, u.week, png)), path.join(runDir, file), { endText: `Følg @${me.username} for mer`, fontDir: paths.fonts });
    const id = await ig.publishReel(host.url(file), caption);
    const permalink = await ig.permalink(id).catch(() => null);
    recordPublished(key, { publishedAt: new Date().toISOString(), kind: 'reel', mediaIds: [id], permalink, label: `${u.label} (reel)`, sponsors: u.sponsors, teams: u.teams, images: u.images.length, thumb: `${u.week}/${u.images[0]}` });
    done.push(key);
    console.log(`  ✓ ${u.label} (reel)${permalink ? `  ${permalink}` : ''}`);
  } catch (e) {
    console.warn(`  ! ${u.label}: Reel not published (the story is): ${(e as Error).message}`);
  }
}
