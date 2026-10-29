// Sponsor report: what actually went out on Instagram, per month, and where each sponsor was shown.
// output/sponsorer.html (overview) and output/sponsorer/<YYYY-MM>.html (printable monthly report).
// Based on data/published.json, so it counts real publications, not just generated images.

import fs from 'node:fs';
import path from 'node:path';
import { paths, type ClubConfig, type Sponsor, type SponsorConfig } from '../config.ts';
import type { PublicationUnit } from '../publish/plan.ts';
import type { PublishedEntry } from '../publish/state.ts';
import type { Palette } from '../render/colors.ts';
import { brand, esc, page } from './build.ts';
import type { Insights } from '../publish/insights.ts';

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

/** "YYYY-MM-DD" / "YYYY-MM" in Oslo time for an ISO timestamp. */
const osloDate = (iso: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(new Date(iso));
export const monthOf = (iso: string) => osloDate(iso).slice(0, 7);
export const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** ISO week number of a "YYYY-MM-DD" date. */
export function isoWeek(day: string): number {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 864e5 + 1) / 7);
}

export interface ReportItem {
  key: string;
  publishedAt: string;
  kind: 'feed' | 'story' | 'reel';
  label: string;
  sponsors: string[];
  teams: string[];
  images: number;
  thumb: string | null;
  permalink: string | null;
  /** From Instagram statistics, when available. */
  reach?: number;
}

export interface MonthReport {
  month: string;
  feedPosts: number;
  stories: number;
  images: number;
  teams: number;
  /** Sum of per-post reach; null when no statistics exist for the month. */
  reach: number | null;
  perSponsor: { sponsor: Sponsor; feedPosts: number; stories: number; images: number; reach: number | null }[];
  perWeek: { week: number; feedPosts: number; stories: number }[];
  items: ReportItem[];
}

/**
 * Published entries as report items. Older entries lack sponsor data: fall back to the planned unit,
 * and finally to the main sponsor alone (it is on every post).
 */
export function reportItems(published: Record<string, PublishedEntry>, units: Map<string, PublicationUnit>, sc: SponsorConfig, insights?: Insights): ReportItem[] {
  const main = sc.sponsors.find((s) => s.role === 'main');
  return Object.entries(published)
    .map(([key, e]) => {
      const u = units.get(key);
      return {
        key,
        publishedAt: e.publishedAt,
        kind: e.kind,
        label: e.label ?? u?.label ?? key,
        sponsors: e.sponsors ?? u?.sponsors ?? (main ? [main.id] : []),
        teams: e.teams ?? u?.teams ?? [],
        images: e.images ?? u?.images.length ?? 1,
        thumb: e.thumb ?? (u ? `${u.week}/${u.images[0]}` : null),
        permalink: e.permalink,
        reach: insights?.media[key]?.reach,
      };
    })
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
}

const sumReach = (items: ReportItem[]) => (items.some((i) => i.reach !== undefined) ? items.reduce((n, i) => n + (i.reach ?? 0), 0) : null);

export function monthReport(items: ReportItem[], month: string, sc: SponsorConfig): MonthReport {
  const inMonth = items.filter((i) => monthOf(i.publishedAt) === month);
  const feed = inMonth.filter((i) => i.kind === 'feed');
  const weeks = new Map<number, { week: number; feedPosts: number; stories: number }>();
  for (const i of inMonth) {
    const w = isoWeek(osloDate(i.publishedAt));
    const row = weeks.get(w) ?? { week: w, feedPosts: 0, stories: 0 };
    if (i.kind === 'feed') row.feedPosts++;
    else row.stories++;
    weeks.set(w, row);
  }
  return {
    month,
    feedPosts: feed.length,
    stories: inMonth.length - feed.length,
    images: inMonth.reduce((n, i) => n + i.images, 0),
    teams: new Set(inMonth.flatMap((i) => i.teams)).size,
    reach: sumReach(inMonth),
    perSponsor: sc.sponsors.map((sponsor) => {
      const mine = inMonth.filter((i) => i.sponsors.includes(sponsor.id));
      return {
        sponsor,
        feedPosts: mine.filter((i) => i.kind === 'feed').length,
        stories: mine.filter((i) => i.kind === 'story').length,
        images: mine.reduce((n, i) => n + i.images, 0),
        reach: sumReach(mine),
      };
    }),
    perWeek: [...weeks.values()].sort((a, b) => a.week - b.week),
    items: inMonth,
  };
}

const CSS = `
.tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
@media (min-width: 640px) { .tiles { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.tile { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
.tile .label { font-size: 13px; color: var(--muted); }
.tile .value { font: 600 32px/1.15 Inter, system-ui, sans-serif; margin-top: 2px; font-variant-numeric: tabular-nums; }
.tile .delta { font-size: 13px; color: var(--muted); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.examples { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.examples a { display: block; }
.examples img { width: 100%; height: auto; border-radius: 8px; display: block; }
.note { font-size: 13px; color: var(--muted); }
@media print {
  header.top, .noprint { display: none !important; }
  body { background: #fff; color: #000; }
  .tile, table { border-color: #ccc; }
  main { max-width: none; }
}
`;

const tile = (label: string, value: number, delta?: string) =>
  `<div class="tile"><div class="label">${esc(label)}</div><div class="value">${value.toLocaleString('nb-NO')}</div>${delta ? `<div class="delta">${esc(delta)}</div>` : ''}</div>`;

function deltaText(now: number, before: number | undefined, prevMonth: string): string | undefined {
  if (before === undefined) return undefined;
  const d = now - before;
  return `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)} mot ${monthName(prevMonth).split(' ')[0]}`;
}

const prevMonthOf = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

function reportPage(r: MonthReport, prev: MonthReport | null, config: ClubConfig, sc: SponsorConfig, palette: Palette): string {
  const account = config.brand.profile === 'club' ? config.club.name : config.brand.name;
  const roles = sc.labels;
  const pm = prevMonthOf(r.month);
  const sponsorRows = r.perSponsor
    .map((p) => `<tr><td><strong>${esc(p.sponsor.name)}</strong><br><span class="note">${esc(roles[p.sponsor.role])}</span></td><td class="num">${p.feedPosts}</td><td class="num">${p.stories}</td><td class="num">${p.images}</td>${r.reach === null ? '' : `<td class="num">${(p.reach ?? 0).toLocaleString('nb-NO')}</td>`}</tr>`)
    .join('');
  const weekRows = r.perWeek.map((w) => `<tr><td>Uke ${w.week}</td><td class="num">${w.feedPosts}</td><td class="num">${w.stories}</td></tr>`).join('');
  const examples = r.items
    .filter((i) => i.kind === 'feed' && i.thumb && fs.existsSync(path.join(paths.output, i.thumb)))
    .slice(-6)
    .map((i) => `<a href="${esc(i.permalink ?? '#')}" target="_blank" rel="noopener"><img src="/${esc(i.thumb!)}" alt="${esc(i.label)}" loading="lazy"></a>`)
    .join('');
  const list = r.items
    .map((i) => `<tr><td>${esc(osloDate(i.publishedAt).split('-').reverse().join('.'))}</td><td>${esc(i.label)}${i.kind === 'story' ? ' <span class="note">(story)</span>' : ''}</td><td>${i.permalink ? `<a href="${esc(i.permalink)}" target="_blank" rel="noopener">Åpne</a>` : ''}</td></tr>`)
    .join('');
  const placeholderNote =
    sc.kind === 'placeholder'
      ? '<p class="notice">Sponsorplassene er ledige i dag. Tallene viser hvor mange publiseringer klubbens sponsorer ville vært synlige på.</p>'
      : sc.kind === 'demo'
        ? '<p class="notice">Sponsorene er fiktive demo-sponsorer.</p>'
        : '';
  const header = `<header class="top">${brand(config, `Sponsorrapport · ${monthName(r.month)}`)}<div class="toolbar"><a class="btn light" href="/">Dashboard</a><a class="btn light" href="/sponsorer.html">Alle måneder</a><button class="btn light" onclick="window.print()">Skriv ut / lagre som PDF</button></div></header>`;
  const body = `<h2>Sponsorrapport ${esc(monthName(r.month))}</h2>
<p class="note" style="margin-top:-6px">${esc(account)} på Instagram. Teller publiseringer som faktisk er lagt ut.</p>
${placeholderNote}
<div class="tiles">
${tile('Innlegg i feeden', r.feedPosts, deltaText(r.feedPosts, prev?.feedPosts, pm))}
${tile('Stories', r.stories, deltaText(r.stories, prev?.stories, pm))}
${tile('Bilder vist', r.images, deltaText(r.images, prev?.images, pm))}
${r.reach === null ? tile('Lag omtalt', r.teams) : tile('Samlet rekkevidde', r.reach, deltaText(r.reach, prev?.reach ?? undefined, pm))}
</div>
<h2>Synlighet per sponsor</h2>
<table><thead><tr><th>Sponsor</th><th class="num">Innlegg</th><th class="num">Stories</th><th class="num">Bilder</th>${r.reach === null ? '' : '<th class="num">Rekkevidde</th>'}</tr></thead><tbody>${sponsorRows}</tbody></table>
<p class="note">Hovedsponsoren står på alle bilder. Samarbeidspartnere roterer, så alle får omtrent like mye plass. Ett innlegg kan ha flere bilder (karusell).</p>
${weekRows ? `<h2>Per uke</h2><table><thead><tr><th>Uke</th><th class="num">Innlegg</th><th class="num">Stories</th></tr></thead><tbody>${weekRows}</tbody></table>` : ''}
${examples ? `<h2>Eksempler</h2><div class="examples">${examples}</div>` : ''}
<h2>Alle publiseringer</h2>
${list ? `<table><thead><tr><th>Dato</th><th>Innhold</th><th></th></tr></thead><tbody>${list}</tbody></table>` : '<p class="note">Ingen publiseringer denne måneden.</p>'}
${r.reach === null ? '<p class="note">Rekkevidde og likerklikk kommer med når statistikk-tilgang til Instagram er slått på.</p>' : '<p class="note">Rekkevidde er summen av kontoer som så hvert innlegg (samme person kan telles flere ganger), fra Instagrams egen statistikk.</p>'}`;
  return page(`Sponsorrapport ${monthName(r.month)} – ${account}`, palette, `<style>${CSS}</style>${header}`, body);
}

function overviewPage(reports: MonthReport[], config: ClubConfig, palette: Palette): string {
  const rows = [...reports]
    .reverse()
    .map((r) => `<tr><td><a href="/sponsorer/${r.month}.html">${esc(monthName(r.month))}</a></td><td class="num">${r.feedPosts}</td><td class="num">${r.stories}</td><td class="num">${r.images}</td></tr>`)
    .join('');
  const header = `<header class="top">${brand(config, 'Sponsorrapporter')}<div class="toolbar"><a class="btn light" href="/">Dashboard</a></div></header>`;
  const body = `<h2>Månedsrapporter</h2>
${rows ? `<table><thead><tr><th>Måned</th><th class="num">Innlegg</th><th class="num">Stories</th><th class="num">Bilder</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="note">Ingen publiseringer ennå.</p>'}
<p class="note">Åpne en måned for en rapport som kan skrives ut eller lagres som PDF og sendes til sponsorene.</p>`;
  return page(`Sponsorrapporter – ${config.brand.profile === 'club' ? config.club.name : config.brand.name}`, palette, `<style>${CSS}</style>${header}`, body);
}

/** Writes output/sponsorer.html and one report per month that has publications. */
export function writeSponsorReports(published: Record<string, PublishedEntry>, units: PublicationUnit[], config: ClubConfig, sc: SponsorConfig, palette: Palette, insights?: Insights): void {
  const items = reportItems(published, new Map(units.map((u) => [u.key, u])), sc, insights);
  const months = [...new Set(items.map((i) => monthOf(i.publishedAt)))].sort();
  const reports = months.map((m) => monthReport(items, m, sc));
  const dir = path.join(paths.output, 'sponsorer');
  fs.mkdirSync(dir, { recursive: true });
  reports.forEach((r, i) => fs.writeFileSync(path.join(dir, `${r.month}.html`), reportPage(r, reports[i - 1]?.month === prevMonthOf(r.month) ? reports[i - 1] : null, config, sc, palette)));
  fs.writeFileSync(path.join(paths.output, 'sponsorer.html'), overviewPage(reports, config, palette));
}
