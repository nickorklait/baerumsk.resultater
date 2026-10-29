// The club's dashboard (output/index.html): status, what will be published when, what has been
// published, recent results and upcoming matches, settings and the activity log. Buttons post actions
// to /api/action: the local server applies them at once, the Cloudflare function forwards them to GitHub.

import type { ClubConfig } from '../config.ts';
import type { Controls } from '../controls.ts';
import { MAX_CAPTION } from '../controlsSchema.ts';
import { addDays, osloNow } from '../dates.ts';
import type { Match } from '../data/match.ts';
import { hasPublicResults, teamInfo } from '../data/teams.ts';
import { planUnits, type PublicationUnit } from '../publish/plan.ts';
import type { PublishedEntry } from '../publish/state.ts';
import type { Palette } from '../render/colors.ts';
import type { Status } from '../status.ts';
import { followerTrend, interactions, type Insights } from '../publish/insights.ts';
import { brand, esc, page, when, type Manifest } from './build.ts';

export interface DashboardInput {
  config: ClubConfig;
  palette: Palette;
  manifests: Manifest[];
  matches: Match[];
  controls: Controls;
  status: Status;
  published: Record<string, PublishedEntry>;
  /** When the Instagram token was last refreshed (ISO), if known. */
  tokenRefreshedAt: string | null;
  /** Leagues we follow (for source links). */
  leagues: { id: number; name: string }[];
  /** Match fiksIds by match key, from the league feeds (the club feed has none). */
  matchIds: Record<string, number>;
  insights: Insights;
  now?: string;
}

const CSS = `
.tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (min-width: 640px) { .tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.tile { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
.tile .label { font-size: 13px; color: var(--muted); }
.tile .value { font: 600 30px/1.15 Inter, system-ui, sans-serif; margin-top: 2px; font-variant-numeric: tabular-nums; }
.tile .delta { font-size: 13px; color: var(--muted); }
.cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
@media (min-width: 640px) { .cards { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.card2 { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
.card2 .k { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; }
.card2 .v { font: 800 24px/1.1 'Barlow Condensed', sans-serif; margin-top: 4px; }
.ok { color: #15803d; } .warn { color: #b45309; } .bad { color: #b91c1c; }
@media (prefers-color-scheme: dark) { .ok { color: #4ade80; } .warn { color: #fbbf24; } .bad { color: #f87171; } }
.row { display: flex; gap: 12px; align-items: flex-start; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 10px; margin-bottom: 10px; }
.row img { width: 64px; height: auto; border-radius: 8px; flex: 0 0 auto; background: #0b0f0d; }
.row .main { flex: 1; min-width: 0; }
.row .t { font-weight: 600; }
.row .m { font-size: 13px; color: var(--muted); }
.row .cap { font-size: 13px; white-space: pre-wrap; max-height: 3.9em; overflow: hidden; margin-top: 4px; }
.row .btns { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.btn.sm { min-height: 34px; padding: 6px 10px; font-size: 13px; }
.row.skipped { opacity: .55; }
.list2 { background: var(--card); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
.list2 div { padding: 9px 12px; border-bottom: 1px solid var(--line); font-size: 14px; display: flex; justify-content: space-between; gap: 10px; }
.list2 div:last-child { border-bottom: 0; }
.list2 .when { color: var(--muted); white-space: nowrap; }
form.settings { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; }
form.settings label { display: flex; gap: 10px; align-items: center; margin: 8px 0; }
form.settings fieldset { border: 0; padding: 0; margin: 12px 0 0; }
form.settings legend { font-weight: 600; margin-bottom: 4px; }
form.settings input[type=time] { font: inherit; padding: 6px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--text); }
.teamtable { width: 100%; border-collapse: collapse; font-size: 14px; }
.teamtable th, .teamtable td { padding: 6px 4px; border-bottom: 1px solid var(--line); text-align: center; }
.teamtable th:first-child, .teamtable td:first-child { text-align: left; }
.teamtable tr.off td:first-child { color: var(--muted); text-decoration: line-through; }
.teamtable input { width: 20px; height: 20px; }
.banner { position: sticky; top: 0; z-index: 6; background: #1e3a8a; color: #fff; padding: 10px 16px; font-size: 14px; display: none; }
.banner.show { display: block; }
dialog { border: 0; border-radius: 16px; padding: 0; width: min(560px, calc(100vw - 32px)); background: var(--card); color: var(--text); }
dialog::backdrop { background: rgba(0,0,0,.5); }
dialog .in { padding: 16px; }
dialog textarea { width: 100%; min-height: 220px; font: 14px/1.45 Inter, system-ui, sans-serif; padding: 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--text); }
dialog .orig { font-size: 12px; color: var(--muted); white-space: pre-wrap; max-height: 120px; overflow: auto; border-left: 3px solid var(--line); padding-left: 8px; margin: 8px 0; }
`;

const FOTBALL_NO = 'https://www.fotball.no/fotballdata';
export const clubUrl = (fiksId: number) => `${FOTBALL_NO}/klubb/hjem/?fiksId=${fiksId}`;
export const leagueUrl = (fiksId: number) => `${FOTBALL_NO}/turnering/hjem/?fiksId=${fiksId}`;
export const matchUrl = (fiksId: number) => `${FOTBALL_NO}/kamp/?fiksId=${fiksId}`;

const ago = (iso: string | undefined, nowMs: number) => {
  if (!iso) return 'aldri';
  const min = Math.round((nowMs - Date.parse(iso)) / 60000);
  if (min < 1) return 'nå nettopp';
  if (min < 60) return `${min} min siden`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} t siden` : `${Math.round(h / 24)} dager siden`;
};

function unitRow(u: PublicationUnit, c: Controls, now: string): string {
  const skipped = c.skip.includes(u.key);
  const edited = u.kind === 'feed' && c.captions[u.key];
  const caption = edited ? c.captions[u.key] : u.caption;
  const due = u.publishAt <= now;
  const state = skipped ? '<span class="badge">Hoppes over</span>' : due ? '<span class="badge warn">Venter på neste kjøring</span>' : '';
  const thumb = `<img src="/${esc(u.week)}/${esc(u.images[0] ?? '')}" alt="" loading="lazy">`;
  const data = esc(JSON.stringify({ key: u.key, caption: caption ?? '', original: u.caption ?? '', edited: !!edited }));
  return `<div class="row${skipped ? ' skipped' : ''}" data-unit="${data}">${thumb}<div class="main">
<div class="t">${esc(u.label)}</div>
<div class="m">${esc(when(u.publishAt))} · ${u.kind === 'feed' ? 'innlegg' : 'story'} · ${u.images.length} bilde${u.images.length > 1 ? 'r' : ''} ${state} ${edited ? '<span class="badge ok">Tekst endret</span>' : ''}</div>
${caption ? `<div class="cap">${esc(caption)}</div>` : ''}
<div class="btns">
<button class="btn sm" onclick="act({type:'publish-now',key:'${esc(u.key)}'}, 'Publisere dette på Instagram nå?')">Publiser nå</button>
${skipped ? `<button class="btn sm ghost" onclick="act({type:'unskip',key:'${esc(u.key)}'})">Angre hopp over</button>` : `<button class="btn sm ghost" onclick="act({type:'skip',key:'${esc(u.key)}'}, 'Hoppe over dette innlegget?')">Hopp over</button>`}
${u.kind === 'feed' ? `<button class="btn sm ghost" onclick="editCaption(this)">Rediger tekst</button>` : ''}
</div></div></div>`;
}

const statTile = (label: string, value: number | null, delta?: string) =>
  `<div class="tile"><div class="label">${esc(label)}</div><div class="value">${value === null ? '–' : value.toLocaleString('nb-NO')}</div>${delta ? `<div class="delta">${esc(delta)}</div>` : ''}</div>`;

/** Followers, reach and interactions from Instagram's statistics, and the most seen posts. */
function instagramSection(d: DashboardInput, nowMs: number, byKey: Map<string, PublicationUnit>): string {
  const ins = d.insights;
  if (ins.error === 'missing-permission' || (!ins.updatedAt && !ins.followers.length)) {
    return '<h2>Instagram</h2><p class="notice">Statistikk (følgere, rekkevidde, likerklikk) er ikke slått på ennå. Det krever en ny Instagram-nøkkel med tillatelsen <em>instagram_business_manage_insights</em> – se README.</p>';
  }
  const week = Object.entries(ins.media).filter(([k, m]) => m.kind === 'feed' && d.published[k] && nowMs - Date.parse(d.published[k].publishedAt) < 7 * 864e5);
  const reach = week.reduce((n, [, m]) => n + (m.reach ?? 0), 0);
  const inter = week.reduce((n, [, m]) => n + interactions(m), 0);
  const f = followerTrend(ins);
  const top = Object.entries(ins.media)
    .filter(([, m]) => m.kind === 'feed' && m.reach !== undefined)
    .sort((a, b) => (b[1].reach ?? 0) - (a[1].reach ?? 0))
    .slice(0, 5);
  const topList = top.length
    ? `<div class="list2">${top.map(([k, m]) => `<div><span>${d.published[k]?.permalink ? `<a href="${esc(d.published[k].permalink!)}" target="_blank" rel="noopener">` : '<span>'}${esc(byKey.get(k)?.label ?? d.published[k]?.label ?? k)}${d.published[k]?.permalink ? '</a>' : '</span>'}</span><span class="when">${(m.reach ?? 0).toLocaleString('nb-NO')} nådd · ${interactions(m)} reaksjoner</span></div>`).join('')}</div>`
    : '';
  const deltaText = f.delta === null ? undefined : `${f.delta > 0 ? '+' : f.delta < 0 ? '−' : '±'}${Math.abs(f.delta)} siste 7 dager`;
  return `<h2>Instagram</h2><div class="tiles">
${statTile('Følgere', f.now, deltaText)}
${statTile('Rekkevidde, 7 dager', reach)}
${statTile('Reaksjoner, 7 dager', inter)}
${statTile('Innlegg, 7 dager', week.length)}
</div>
<p class="hint">Rekkevidde er summen av kontoer som så hvert innlegg (samme person kan telles flere ganger). Reaksjoner = likerklikk, kommentarer, lagringer og delinger. Instagram kan bruke opptil 48 timer på å oppdatere tallene.</p>
${top.length ? `<h3 style="margin:14px 0 8px">Mest sette innlegg</h3>${topList}` : ''}`;
}

export function dashboardPage(d: DashboardInput): string {
  const now = d.now ?? osloNow();
  const nowMs = Date.now();
  const { config, controls: c, status: s } = d;
  const units = d.manifests.flatMap((m) => planUnits(m, config));
  const upcoming = units.filter((u) => !d.published[u.key] && now < u.expiresAt).sort((a, b) => a.publishAt.localeCompare(b.publishAt));
  const byKey = new Map(units.map((u) => [u.key, u]));
  const publishedList = Object.entries(d.published).sort((a, b) => b[1].publishedAt.localeCompare(a[1].publishedAt)).slice(0, 15);

  // Status cards
  const fetchFailed = s.fetch?.reports.some((r) => r.status === 'failed');
  const pubFailed = (s.publish?.failed.length ?? 0) > 0;
  const tokenDays = d.tokenRefreshedAt && Date.parse(d.tokenRefreshedAt) > 0 ? Math.round((Date.parse(d.tokenRefreshedAt) + 60 * 864e5 - nowMs) / 864e5) : null;
  const card = (k: string, v: string, cls: string, extra = '') => `<div class="card2"><div class="k">${k}</div><div class="v ${cls}">${v}</div>${extra}</div>`;
  const cards = `<div class="cards">
${card('Autopilot', c.paused ? 'På pause' : config.publish.enabled ? 'På' : 'Av', c.paused || !config.publish.enabled ? 'warn' : 'ok', `<button class="btn sm ${c.paused ? '' : 'ghost'}" style="margin-top:8px" onclick="act({type:'${c.paused ? 'resume' : 'pause'}'}, '${c.paused ? 'Starte automatisk publisering igjen?' : 'Sette all automatisk publisering på pause?'}')">${c.paused ? 'Start igjen' : 'Pause'}</button>`)}
${card('Siste publisering', pubFailed ? 'Feil' : esc(ago(s.publish?.at, nowMs)), pubFailed ? 'bad' : 'ok')}
${card('Data fra fotball.no', fetchFailed ? 'Feil' : esc(ago(s.fetch?.at, nowMs)), fetchFailed ? 'bad' : 'ok')}
${card('Instagram-tilgang', tokenDays === null ? 'Ukjent' : tokenDays > 0 ? `${tokenDays} dager` : 'Utløpt', tokenDays === null ? 'warn' : tokenDays > 14 ? 'ok' : tokenDays > 0 ? 'warn' : 'bad')}
</div>`;

  const errors = [
    ...(s.publish?.failed ?? []).map((f) => `Publisering feilet: ${byKey.get(f.key)?.label ?? f.key} – ${f.error}`),
    ...(s.fetch?.reports ?? []).filter((r) => r.status === 'failed').map((r) => `Henting av ${r.source} feilet: ${r.detail}`),
  ];
  const errorBox = errors.length ? `<p class="notice" style="background:#fee2e2;color:#991b1b">${errors.map(esc).join('<br>')}</p>` : '';

  // Data from the feed
  const today = now.slice(0, 10);
  const own = (t: string) => t.startsWith(`${config.club.teamPrefix} `);
  const recentResults = d.matches
    .filter((m) => m.score && m.start.slice(0, 10) >= addDays(today, -7) && (own(m.home) || own(m.away)))
    .filter((m) => hasPublicResults(teamInfo(own(m.home) ? m.home : m.away, m.league), config.posts.minResultAge))
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 12);
  const nextMatches = d.matches.filter((m) => !m.score && m.start > now && m.start.slice(0, 10) <= addDays(today, 7) && (own(m.home) || own(m.away))).sort((a, b) => a.start.localeCompare(b.start));
  // Each row links to the match on fotball.no when we know its id, otherwise to the club page.
  const link = (m: Match) => {
    const id = m.fiksId ?? d.matchIds[m.key];
    return id ? matchUrl(id) : clubUrl(config.club.fiksId);
  };
  const results = recentResults.length
    ? `<div class="list2">${recentResults.map((m) => `<div><a href="${esc(link(m))}" target="_blank" rel="noopener">${esc(m.home)} <strong>${m.score!.home}–${m.score!.away}</strong> ${esc(m.away)}</a><span class="when">${esc(when(m.start))}</span></div>`).join('')}</div>`
    : '<p class="hint">Ingen resultater siste 7 dager.</p>';
  const fixtures = nextMatches.length
    ? `<div class="list2">${nextMatches.slice(0, 15).map((m) => `<div><a href="${esc(link(m))}" target="_blank" rel="noopener">${esc(m.home)} – ${esc(m.away)}</a><span class="when">${esc(when(m.start))}</span></div>`).join('')}</div>${nextMatches.length > 15 ? `<p class="hint">+ ${nextMatches.length - 15} flere kamper.</p>` : ''}`
    : '<p class="hint">Ingen kamper neste 7 dager.</p>';

  // Settings: our teams from the data, so the club can pick match-day teams
  const ownTeams = [...new Set(d.matches.flatMap((m) => [m.home, m.away]).filter(own))]
    .filter((t) => hasPublicResults(teamInfo(t), config.posts.minResultAge))
    .sort((a, b) => a.localeCompare(b, 'nb', { numeric: true }));
  const sch = config.publish.schedule;
  const chk = (name: string, on: boolean, label: string) => `<label><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${label}</label>`;
  const settings = `<form class="settings" onsubmit="saveSettings(event)">
${chk('perResult', sch.perResult.enabled, 'Eget innlegg for hvert resultat (så snart det er registrert)')}
${chk('stories', config.publish.instagram.stories, 'Publiser også stories')}
${chk('includeChildrenInFixtures', config.posts.includeChildrenInFixtures, 'Ta med barnelag (6–12 år) i kampoversikten')}
<fieldset><legend>Tidspunkter</legend>
<label>Helgens resultater (mandag) <input type="time" name="results" value="${esc(sch.results.time)}"></label>
<label>Ukens kamper (mandag) <input type="time" name="fixtures" value="${esc(sch.fixtures.time)}"></label>
<label>Kampdag-plakat <input type="time" name="matchDay" value="${esc(sch.matchDay.time)}"></label>
</fieldset>
<fieldset><legend>Lag</legend>
<p class="hint" style="margin:0 0 6px">Fjern haken under «Publiseres» for lag som ikke ønsker innlegg (resultater, kampoversikt og kampdag). «Kampdag» gir egen plakat på kampdagen.</p>
<table class="teamtable"><thead><tr><th>Lag</th><th>Publiseres</th><th>Kampdag</th></tr></thead><tbody>
${ownTeams.map((t) => {
    const excluded = (config.posts.excludedTeams ?? []).includes(t);
    return `<tr${excluded ? ' class="off"' : ''}><td>${esc(t.replace(`${config.club.teamPrefix} `, ''))}</td>
<td><input type="checkbox" name="includedTeams" value="${esc(t)}" ${excluded ? '' : 'checked'} aria-label="Publiser ${esc(t)}"></td>
<td><input type="checkbox" name="matchDayTeams" value="${esc(t)}" ${config.posts.matchDayTeams.includes(t) ? 'checked' : ''} aria-label="Kampdag for ${esc(t)}"></td></tr>`;
  }).join('')}
</tbody></table>
${(config.posts.excludedTeams ?? []).length ? `<p class="hint">${config.posts.excludedTeams!.length} lag publiseres ikke.</p>` : ''}
</fieldset>
<button class="btn" style="margin-top:12px">Lagre innstillinger</button>
</form>`;

  const log = c.log.length
    ? `<div class="list2">${c.log.slice(0, 15).map((l) => `<div><span>${esc(l.action)} <span class="when">– ${esc(l.by)}</span></span><span class="when">${esc(ago(l.at, nowMs))}</span></div>`).join('')}</div>`
    : '<p class="hint">Ingen endringer ennå.</p>';

  const pubList = publishedList.length
    ? `<div class="list2">${publishedList.map(([k, e]) => `<div><span>${esc(byKey.get(k)?.label ?? k)}${e.kind === 'story' ? ' (story)' : ''}</span><span class="when">${e.permalink ? `<a href="${esc(e.permalink)}">Åpne ↗</a> · ` : ''}${esc(ago(e.publishedAt, nowMs))}</span></div>`).join('')}</div>`
    : '<p class="hint">Ingenting publisert ennå.</p>';

  const weeks = d.manifests.map((m) => `<a class="btn light" href="/${m.week.key}/">Bilder uke ${esc(m.week.key.slice(5).split('-').reverse().join('.'))}</a>`).join('');
  const title = config.brand.profile === 'club' ? config.club.name : config.brand.name;
  const header = `<div class="banner" id="banner"></div><header class="top">${brand(config, 'Dashboard')}<div class="toolbar">${weeks}<a class="btn light" href="/sponsorer.html">Sponsorer</a></div></header>`;
  const body = `${cards}${errorBox}
${instagramSection(d, nowMs, byKey)}
<h2>Kommer</h2>${upcoming.length ? upcoming.map((u) => unitRow(u, c, now)).join('') : '<p class="hint">Ingenting planlagt akkurat nå.</p>'}
<h2>Publisert</h2>${pubList}
<h2>Resultater siste 7 dager</h2>${results}
<h2>Kamper neste 7 dager</h2>${fixtures}
<h2>Innstillinger</h2>${settings}
<h2>Aktivitetslogg</h2>${log}
<h2>Kilder</h2><div class="list2">
<div><a href="${esc(clubUrl(config.club.fiksId))}" target="_blank" rel="noopener">${esc(config.club.name)} på fotball.no</a><span class="when">kamper og resultater</span></div>
${d.leagues.map((l) => `<div><a href="${esc(leagueUrl(l.id))}" target="_blank" rel="noopener">${esc(l.name)}</a><span class="when">serie, tabell</span></div>`).join('')}
<div><span>Kalenderfeed (brukes av systemet)</span><span class="when">hentet ${esc(ago(s.fetch?.at, nowMs))}</span></div>
</div>
<p class="hint">Resultatene kommer fra Norges Fotballforbund via fotball.no. Er et resultat feil der, blir det feil her også – meld fra til kamplederen eller klubbens FIKS-ansvarlige, så rettes innlegget ved neste kjøring.</p>
<p class="hint">Data fra <a href="${esc(clubUrl(config.club.fiksId))}" target="_blank" rel="noopener">fotball.no</a>. Endringer du gjør her lagres i loggen med navnet ditt. Sist oppdatert ${esc(new Date().toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' }))}.</p>
<dialog id="capDialog"><div class="in"><h3 style="margin:0 0 8px">Rediger tekst</h3>
<textarea id="capText" maxlength="${MAX_CAPTION}" oninput="document.getElementById('capCount').textContent=this.value.length"></textarea>
<div class="hint" style="margin:4px 0"><span id="capCount">0</span>/${MAX_CAPTION} tegn. Ikke skriv navn på spillere.</div>
<div class="hint" style="margin:8px 0 0">Automatisk tekst:</div><div class="orig" id="capOrig"></div>
<div class="actions" style="margin-top:10px"><button class="btn" onclick="saveCaption()">Lagre</button><button class="btn ghost" id="capReset" onclick="resetCaption()">Bruk automatisk tekst</button><button class="btn ghost" onclick="capDialog.close()">Avbryt</button></div>
</div></dialog>`;
  return page(`${title} – dashboard`, d.palette, `<style>${CSS}</style>${header}`, body, DASHBOARD_JS);
}

const DASHBOARD_JS = `
const toast = (t) => { const el = document.getElementById('toast'); el.textContent = t; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2200); };
function banner(t) { const b = document.getElementById('banner'); b.textContent = t; b.classList.add('show'); }
async function act(action, question) {
  if (question && !confirm(question)) return;
  let pin = ''; try { pin = localStorage.getItem('pin') || ''; } catch {}
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pin': pin }, body: JSON.stringify({ action }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && j.needPin) {
      pin = prompt('PIN-kode (vises i terminalen der npm run serve kjører):') || '';
      if (!pin) return;
      continue;
    }
    if (!r.ok) { alert(j.error || 'Noe gikk galt.'); return; }
    try { if (pin) localStorage.setItem('pin', pin); } catch {}
    if (j.mode === 'local') { toast('Lagret ✓'); setTimeout(() => location.reload(), 700); }
    else banner('Sendt ✓ Endringen er tatt imot og vises her om ca. 2–3 minutter' + (action.type === 'publish-now' ? ' (innlegget publiseres da).' : '.'));
    return;
  }
}
let current = null;
function editCaption(btn) {
  current = JSON.parse(btn.closest('.row').dataset.unit);
  const t = document.getElementById('capText'); t.value = current.caption;
  document.getElementById('capCount').textContent = t.value.length;
  document.getElementById('capOrig').textContent = current.original;
  document.getElementById('capReset').style.display = current.edited ? '' : 'none';
  document.getElementById('capDialog').showModal();
}
function saveCaption() { const text = document.getElementById('capText').value; document.getElementById('capDialog').close(); act({ type: 'caption', key: current.key, text }); }
function resetCaption() { document.getElementById('capDialog').close(); act({ type: 'caption', key: current.key, text: null }); }
function saveSettings(e) {
  e.preventDefault();
  const f = e.target;
  act({ type: 'settings', settings: {
    perResult: f.perResult.checked, stories: f.stories.checked, includeChildrenInFixtures: f.includeChildrenInFixtures.checked,
    times: { results: f.results.value, fixtures: f.fixtures.value, matchDay: f.matchDay.value },
    matchDayTeams: [...f.querySelectorAll('input[name=matchDayTeams]:checked')].map((i) => i.value),
    excludedTeams: [...f.querySelectorAll('input[name=includedTeams]:not(:checked)')].map((i) => i.value),
  } });
}
`;
