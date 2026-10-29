// npm run generate [-- --week 2026-10-18] [--with-previous] [--offline]
// Builds all posts for a week into output/<sunday>/ and refreshes the gallery.
// --with-previous also rebuilds the week before, so a result that was registered late still gets its post.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { activeHashtags, loadConfig, loadSponsors, paths } from '../config.ts';
import { factCheckContext, produceCaptions } from '../captions/index.ts';
import { createAdapter } from '../data/adapter.ts';
import { splitClubAndLabel } from '../data/teams.ts';
import { addDays, formatRangeNo, osloNow } from '../dates.ts';
import { buildSite, type Manifest, type ManifestPost } from '../gallery/build.ts';
import { createZip } from '../gallery/zip.ts';
import { buildPosts, GROUPS } from '../posts/build.tsx';
import { latestWeekWithResults, postWeek, type PostWeek } from '../posts/week.ts';
import { buildPalette } from '../render/colors.ts';
import { SponsorLogo, type Theme } from '../render/components.tsx';
import { dataUri, loadClubLogo, renderPng, SIZES, type Format } from '../render/render.ts';
import { sponsorIds } from '../sponsors.ts';
import { updateStatus } from '../status.ts';

const { values: args } = parseArgs({
  options: { week: { type: 'string' }, offline: { type: 'boolean', default: false }, 'with-previous': { type: 'boolean', default: false } },
});
if (args.week && !/^\d{4}-\d{2}-\d{2}$/.test(args.week)) throw new Error('--week must be a date like 2026-10-18');

const config = loadConfig();
const sponsorConfig = loadSponsors(config);
const sponsors = sponsorConfig.sponsors;
const adapter = createAdapter(config);

if (!args.offline) {
  for (const r of await adapter.refresh()) console.log(`data: ${r.status} ${r.source} (${r.detail})`);
}
const matches = adapter.clubMatches();

const target = args.week ? postWeek(args.week, config) : latestWeekWithResults(matches, config);
if (!target) throw new Error('No week with results found in the stored data. Run `npm run fetch` after the matches.');
const weeks: PostWeek[] = args['with-previous'] ? [postWeek(addDays(target.key, -7), config), target] : [target];

const logo = await loadClubLogo(config);
const palette = buildPalette(config, logo);
const club = config.brand.profile === 'club';
const theme: Theme = {
  palette,
  // Neutral profile: no club logo anywhere; our teams get an initials badge in the club colours.
  logoUri: club && logo ? dataUri(logo, 'image/jpeg') : null,
  clubName: club ? config.club.name : config.club.shortName,
  headerTitle: club ? config.club.name : config.brand.name,
  headerSubtitle: club ? 'Fotball' : config.brand.tagline,
  headerMark: club ? 'club' : 'neutral',
  sourceLine: config.brand.sourceLine,
  hashtag: activeHashtags(config)[0] ?? '',
};

const knownClubs = [
  ...new Set([
    ...matches.flatMap((m) => [m.home, m.away]),
    ...config.data.tournamentIds.flatMap((t) => adapter.leagueMatches(t).matches.flatMap((m) => [m.home, m.away])),
  ].map((t) => splitClubAndLabel(t).club)),
];
const coverage = adapter.coverageStart();
const weekStatus: { key: string; posts: number; images: number }[] = [];
const today = osloNow().slice(0, 10);

for (const fullWeek of weeks) {
  // Only claim the days we actually have data for, and only list matches that are still to be played.
  const clamp = (r: { from: string; to: string }) => ({ ...r, from: coverage && coverage > r.from ? coverage : r.from });
  const week: PostWeek = {
    ...fullWeek,
    results: clamp(fullWeek.results),
    span: clamp(fullWeek.span),
    fixtures: { ...fullWeek.fixtures, from: today > fullWeek.fixtures.from && today <= fullWeek.fixtures.to ? today : fullWeek.fixtures.from },
  };
  console.log(`Week ${week.key}: recap ${formatRangeNo(week.results)}, result posts ${formatRangeNo(week.span)}, fixtures ${formatRangeNo(week.fixtures)}`);

  const outDir = path.join(paths.output, week.key);
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (/\.(png|zip)$/.test(f)) fs.rmSync(path.join(outDir, f));

  // Render
  const specs = buildPosts({ config, theme, week, adapter, sponsors: sponsorConfig });
  const images = new Map<string, Record<Format, string[]>>();
  for (const spec of specs) {
    const files: Record<Format, string[]> = { feed: [], story: [] };
    for (const format of ['feed', 'story'] as Format[]) {
      const pages = spec.pages[format];
      for (let i = 0; i < pages.length; i++) {
        const file = `${spec.id}_${format}${pages.length > 1 ? `_${i + 1}` : ''}.png`;
        fs.writeFileSync(path.join(outDir, file), await renderPng(pages[i], SIZES[format]));
        files[format].push(file);
      }
    }
    images.set(spec.id, files);
    console.log(`  ✓ ${spec.id} (${files.feed.length + files.story.length} images)${spec.demo ? ' [EXAMPLE]' : ''}`);
  }

  const captions = await produceCaptions(specs, config, factCheckContext(config, knownClubs, sponsors));

  // Manifest, zip
  const posts: ManifestPost[] = specs.map((s) => {
    const c = captions.get(s.id)!;
    return {
      id: s.id,
      type: s.type,
      group: GROUPS[s.type],
      title: s.title,
      teams: s.teams,
      sponsors: sponsorIds(s.sponsors),
      demo: s.demo,
      caption: c.text,
      captionSource: c.source,
      ...(c.rejected ? { captionRejected: c.rejected } : {}),
      images: images.get(s.id)!,
      ...(s.eventStart ? { eventStart: s.eventStart } : {}),
    };
  });

  const zipName = `${config.club.shortName.toLowerCase().normalize('NFD').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/[^a-z0-9]+/g, '-')}-${week.key}.zip`;
  const zipFiles = posts.flatMap((p) => [...p.images.feed, ...p.images.story].map((f) => ({ name: f, data: fs.readFileSync(path.join(outDir, f)) })));
  const texts = posts.map((p) => `### ${p.title}${p.demo ? ' (EKSEMPEL – IKKE PUBLISER)' : ''}\n${p.caption}\n`).join('\n');
  zipFiles.push({ name: 'tekster.txt', data: Buffer.from(texts, 'utf8') });
  fs.writeFileSync(path.join(outDir, zipName), createZip(zipFiles));

  const manifest: Manifest = { week, generatedAt: new Date().toISOString(), zip: zipName, posts };
  fs.writeFileSync(path.join(outDir, 'posts.json'), JSON.stringify(manifest, null, 2));
  console.log(`  ${posts.length} posts, ${zipFiles.length - 1} images in ${path.relative(process.cwd(), outDir)}`);
  weekStatus.push({ key: week.key, posts: posts.length, images: zipFiles.length - 1 });
}
updateStatus('generate', { weeks: weekStatus });

// Sponsor logos for the report page, then the gallery
const assets = path.join(paths.output, '_assets');
fs.mkdirSync(assets, { recursive: true });
for (const s of sponsors) {
  fs.writeFileSync(path.join(assets, `sponsor-${s.id}.png`), await renderPng(<div style={{ display: 'flex', padding: 8, backgroundColor: 'white' }}><SponsorLogo sponsor={s} height={84} /></div>, { width: 420, height: 100 }));
}
buildSite(config, palette, sponsorConfig, logo, matches);
console.log('\nGallery: npm run serve');
