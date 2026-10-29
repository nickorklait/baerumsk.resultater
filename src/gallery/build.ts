// Static, mobile-first gallery: output/index.html, output/<week>/index.html, output/sponsorer.html.

import fs from 'node:fs';
import path from 'node:path';
import { paths, ROOT, type ClubConfig, type Sponsor, type SponsorConfig } from '../config.ts';
import { formatRangeNo, type DayRange } from '../dates.ts';
import type { Palette } from '../render/colors.ts';
import { planUnits } from '../publish/plan.ts';
import { loadCredentials, readPublished } from '../publish/state.ts';
import { readControls } from '../controls.ts';
import { readStatus } from '../status.ts';
import type { Match } from '../data/match.ts';
import { dashboardPage } from './dashboard.ts';
import { writeSponsorReports } from './sponsorReport.ts';
import { readInsights } from '../publish/insights.ts';
import { createAdapter } from '../data/adapter.ts';

export interface ManifestPost {
  id: string;
  type: string;
  group: string;
  title: string;
  teams: string[];
  sponsors: string[];
  demo: boolean;
  caption: string;
  captionSource: 'claude' | 'template';
  captionRejected?: string[];
  images: { feed: string[]; story: string[] };
  eventStart?: string;
}

export interface Manifest {
  week: { key: string; results: DayRange; span?: DayRange; fixtures: DayRange };
  generatedAt: string;
  zip: string;
  posts: ManifestPost[];
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function readManifests(): Manifest[] {
  if (!fs.existsSync(paths.output)) return [];
  return fs
    .readdirSync(paths.output)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && fs.existsSync(path.join(paths.output, d, 'posts.json')))
    .sort()
    .reverse()
    .map((d) => JSON.parse(fs.readFileSync(path.join(paths.output, d, 'posts.json'), 'utf8')) as Manifest);
}

function css(p: Palette): string {
  return `
@font-face { font-family: 'Barlow Condensed'; font-weight: 800; src: url('/_assets/BarlowCondensed-ExtraBold.ttf'); }
@font-face { font-family: 'Inter'; font-weight: 400; src: url('/_assets/Inter-Regular.ttf'); }
@font-face { font-family: 'Inter'; font-weight: 600; src: url('/_assets/Inter-SemiBold.ttf'); }
:root { --primary: ${p.primary}; --accent: ${p.accent}; --dark: ${p.dark}; --bg: #f3f5f4; --card: #ffffff; --text: #111827; --muted: #6b7280; --line: #e5e7eb; }
@media (prefers-color-scheme: dark) { :root { --bg: #0d1411; --card: #17201c; --text: #f3f4f6; --muted: #9ca3af; --line: #26322c; } }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.45 Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; }
a { color: inherit; }
header.top { background: var(--dark); color: #fff; padding: 16px 16px 14px; position: sticky; top: 0; z-index: 5; box-shadow: 0 2px 12px rgba(0,0,0,.25); }
.brand { display: flex; align-items: center; gap: 12px; }
.brand img { width: 46px; height: 46px; border-radius: 50%; background: #fff; padding: 3px; }
.brand h1 { font: 800 28px/1 'Barlow Condensed', sans-serif; text-transform: uppercase; margin: 0; letter-spacing: .5px; }
.brand small { display: block; opacity: .8; font-size: 13px; margin-top: 3px; }
.toolbar { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; align-items: center; }
.seg { display: inline-flex; background: rgba(255,255,255,.12); border-radius: 999px; padding: 3px; }
.seg button { border: 0; background: transparent; color: #fff; font: 600 14px Inter, sans-serif; padding: 7px 16px; border-radius: 999px; cursor: pointer; }
.seg button[aria-pressed="true"] { background: #fff; color: var(--dark); }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 10px; padding: 10px 14px; font: 600 14px Inter, sans-serif; cursor: pointer; text-decoration: none; background: var(--primary); color: #fff; min-height: 44px; }
.btn.light { background: rgba(255,255,255,.14); color: #fff; }
.btn.ghost { background: transparent; color: var(--text); border: 1.5px solid var(--line); }
main { max-width: 720px; margin: 0 auto; padding: 8px 16px 64px; }
h2 { font: 800 30px/1 'Barlow Condensed', sans-serif; text-transform: uppercase; margin: 28px 0 12px; display: flex; align-items: center; gap: 10px; }
h2::before { content: ''; width: 6px; height: 24px; background: var(--accent); border-radius: 2px; }
.card { background: var(--card); border-radius: 16px; overflow: hidden; margin-bottom: 18px; box-shadow: 0 1px 3px rgba(0,0,0,.08); border: 1px solid var(--line); }
.slides { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; background: #0b0f0d; }
.slides img { width: 100%; flex: 0 0 100%; scroll-snap-align: center; display: block; height: auto; }
.count { font-size: 12px; color: var(--muted); padding: 6px 14px 0; }
.body { padding: 12px 14px 14px; }
.title { font-weight: 600; margin: 0 0 6px; }
.badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.badge { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: var(--line); color: var(--text); }
.badge.ok { background: #dcfce7; color: #166534; }
.badge.warn { background: #fef3c7; color: #92400e; }
.badge.demo { background: #fee2e2; color: #991b1b; }
.caption { white-space: pre-wrap; background: var(--bg); border-radius: 10px; padding: 10px 12px; font-size: 14px; margin: 0 0 10px; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.actions .btn { flex: 1 1 auto; }
.hint { font-size: 13px; color: var(--muted); margin: 14px 0 0; }
.notice { background: #fef3c7; color: #78350f; border-radius: 12px; padding: 10px 14px; font-size: 14px; margin: 16px 0 0; }
.btn.pub { min-height: 34px; padding: 6px 10px; font-size: 13px; margin-top: 4px; }
.toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: #111; color: #fff; padding: 10px 16px; border-radius: 10px; font-size: 14px; opacity: 0; transition: opacity .2s; pointer-events: none; }
.toast.show { opacity: 1; }
table { width: 100%; border-collapse: collapse; background: var(--card); border-radius: 12px; overflow: hidden; font-size: 14px; }
th, td { padding: 10px 8px; text-align: right; border-bottom: 1px solid var(--line); }
th:first-child, td:first-child { text-align: left; }
th { font-size: 12px; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); }
.sponsor { display: flex; align-items: center; gap: 10px; }
.sponsor img { height: 34px; width: auto; }
.list a { display: block; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; margin-bottom: 10px; text-decoration: none; }
`;
}

export function page(title: string, palette: Palette, header: string, body: string, script = ''): string {
  return `<!doctype html>
<html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="theme-color" content="${palette.dark}"><style>${css(palette)}</style></head>
<body>${header}<main>${body}</main><div class="toast" id="toast"></div>${script ? `<script>${script}</script>` : ''}</body></html>`;
}

const BALL_SVG = `<svg viewBox="0 0 100 100" width="46" height="46" style="background:#fff;border-radius:50%;padding:5px"><circle cx="50" cy="50" r="46" fill="#fff" stroke="#111" stroke-width="6"/><polygon points="50,33 66,45 60,64 40,64 34,45" fill="#111"/></svg>`;

export const brand = (config: ClubConfig, subtitle: string) => {
  const club = config.brand.profile === 'club';
  const mark = club ? '<img src="/_assets/logo.jpg" alt="">' : BALL_SVG;
  return `<div class="brand">${mark}<div><h1>${esc(club ? config.club.name : config.brand.name)} · Innhold</h1><small>${esc(subtitle)}</small></div></div>`;
};

const GALLERY_JS = `
const toast = (t) => { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1600); };
async function copyText(id) {
  const text = document.getElementById('cap-' + id).innerText;
  try { await navigator.clipboard.writeText(text); }
  catch { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, text.length); document.execCommand('copy'); ta.remove(); }
  toast('Tekst kopiert');
}
async function share(id) {
  const card = document.getElementById('post-' + id);
  const imgs = [...card.querySelectorAll('.slides img')].filter((i) => i.offsetParent !== null);
  try {
    const files = await Promise.all(imgs.map(async (img) => new File([await (await fetch(img.src)).blob()], img.src.split('/').pop(), { type: 'image/png' })));
    await navigator.share({ files, text: document.getElementById('cap-' + id).innerText });
  } catch (e) { if (e.name !== 'AbortError') toast('Deling støttes ikke her – bruk Last ned'); }
}
function setFormat(f) {
  document.body.dataset.format = f;
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
  try { localStorage.setItem('format', f); } catch {}
}
let saved = 'feed'; try { saved = localStorage.getItem('format') || 'feed'; } catch {}
setFormat(saved);
if (!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }))) document.querySelectorAll('.share').forEach((b) => b.remove());
`;

function postCard(p: ManifestPost): string {
  const badges = [
    p.demo ? '<span class="badge demo">Eksempel – ikke publiser</span>' : '',
    !p.demo && p.captionSource === 'claude' ? '<span class="badge ok">Tekst: Claude · faktasjekket</span>' : '',
    !p.demo && p.captionSource === 'template' ? `<span class="badge">Tekst: mal${p.captionRejected ? ' (Claude-forslag avvist)' : ''}</span>` : '',
    `<span class="badge">${p.sponsors.length} sponsorer</span>`,
  ].join('');
  const slides = (['feed', 'story'] as const)
    .map((f) => `<div class="slides fmt-${f}">${p.images[f].map((src) => `<img src="${esc(src)}" alt="${esc(p.title)}" loading="lazy" width="1080" height="${f === 'feed' ? 1350 : 1920}">`).join('')}</div>`)
    .join('');
  const counts = (['feed', 'story'] as const).map((f) => (p.images[f].length > 1 ? `<div class="count fmt-${f}">${p.images[f].length} bilder – sveip for neste</div>` : '')).join('');
  const downloads = (['feed', 'story'] as const)
    .map((f) => p.images[f].map((src, i) => `<a class="btn ghost fmt-${f}" href="${esc(src)}" download>Last ned${p.images[f].length > 1 ? ` ${i + 1}/${p.images[f].length}` : ''}</a>`).join(''))
    .join('');
  return `<article class="card" id="post-${esc(p.id)}">${slides}${counts}<div class="body">
<p class="title">${esc(p.title)}</p><div class="badges">${badges}</div>
<div class="caption" id="cap-${esc(p.id)}">${esc(p.caption)}</div>
<div class="actions">${p.demo ? '' : `<button class="btn" onclick="copyText('${esc(p.id)}')">Kopier tekst</button><button class="btn share" onclick="share('${esc(p.id)}')">Del…</button>`}${downloads}</div>
</div></article>`;
}

function sponsorNotice(sc: SponsorConfig): string {
  if (sc.kind === 'demo') return '<p class="notice">Sponsorene i bildene er fiktive demo-sponsorer.</p>';
  if (sc.kind === 'placeholder') return '<p class="notice">Sponsorfeltet nederst i hvert bilde er en <strong>ledig plass</strong>: her kommer klubbens egne sponsorer når kontoen blir klubbens. Sponsorrapporten viser hvor mange innlegg de ville vært synlige på.</p>';
  if (!sc.approvedForPublishing) return '<p class="notice">Sponsorene er hentet fra haslumil.no/sponsorer, men er ikke avklart med klubben. Kun til intern visning – ikke publiser før klubben har godkjent bruken.</p>';
  return '';
}

const DAY_SHORT = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
export const when = (t: string) => `${DAY_SHORT[new Date(`${t.slice(0, 10)}T12:00:00Z`).getUTCDay()]}. ${Number(t.slice(8, 10))}.${Number(t.slice(5, 7))} kl. ${t.slice(11, 16)}`;

function weekPage(m: Manifest, config: ClubConfig, palette: Palette, sc: SponsorConfig): string {
  const groups = [...new Set(m.posts.map((p) => p.group))];
  const header = `<header class="top">${brand(config, `Resultater ${formatRangeNo(m.week.results)} · kamper ${formatRangeNo(m.week.fixtures)}`)}
<div class="toolbar"><div class="seg" role="group" aria-label="Format"><button data-f="feed" onclick="setFormat('feed')">Innlegg</button><button data-f="story" onclick="setFormat('story')">Story</button></div>
<a class="btn light" href="${esc(m.zip)}" download>Last ned alle (.zip)</a><a class="btn light" href="/">Dashboard</a><a class="btn light" href="/sponsorer.html">Sponsorer</a></div></header>`;
  const body =
    sponsorNotice(sc) +
    groups.map((g) => `<h2>${esc(g)}</h2>${m.posts.filter((p) => p.group === g).map(postCard).join('')}`).join('') +
    `<p class="hint">Tips på mobil: trykk «Kopier tekst», hold fingeren på bildet og velg «Arkiver bilde» / «Last ned bilde», og lim inn teksten i Instagram eller Facebook. Laget ${esc(new Date(m.generatedAt).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' }))}.</p>`;
  const style = `<style>body[data-format="feed"] .fmt-story, body[data-format="story"] .fmt-feed { display: none !important; }</style>`;
  return page(`${config.club.name} – uke ${m.week.key}`, palette, style + header, body, GALLERY_JS);
}

/** League names and match ids from the league feeds, for links to fotball.no. */
function sources(config: ClubConfig): { leagues: { id: number; name: string }[]; matchIds: Record<string, number> } {
  const adapter = createAdapter(config);
  const leagues: { id: number; name: string }[] = [];
  const matchIds: Record<string, number> = {};
  for (const id of config.data.tournamentIds) {
    try {
      const l = adapter.leagueMatches(id);
      leagues.push({ id, name: l.name });
      for (const m of l.matches) if (m.fiksId) matchIds[m.key] = m.fiksId;
    } catch {
      // A league without snapshots yet: no links for it.
    }
  }
  return { leagues, matchIds };
}

/** Copies shared assets and (re)writes every gallery page from the posts.json files on disk. */
export function buildSite(config: ClubConfig, palette: Palette, sc: SponsorConfig, logo: Buffer | null, matches: Match[]): void {
  const assets = path.join(paths.output, '_assets');
  fs.mkdirSync(assets, { recursive: true });
  for (const f of ['BarlowCondensed-ExtraBold.ttf', 'Inter-Regular.ttf', 'Inter-SemiBold.ttf']) fs.copyFileSync(path.join(paths.fonts, f), path.join(assets, f));
  if (logo) fs.writeFileSync(path.join(assets, 'logo.jpg'), logo);

  const manifests = readManifests();
  for (const m of manifests) fs.writeFileSync(path.join(paths.output, m.week.key, 'index.html'), weekPage(m, config, palette, sc));
  fs.writeFileSync(
    path.join(paths.output, 'index.html'),
    dashboardPage({ config, palette, manifests, matches, controls: readControls(ROOT), status: readStatus(), published: readPublished(), tokenRefreshedAt: loadCredentials()?.refreshedAt ?? null, insights: readInsights(), ...sources(config) }),
  );
  writeSponsorReports(readPublished(), manifests.flatMap((m) => planUnits(m, config)), config, sc, palette, readInsights());
}
