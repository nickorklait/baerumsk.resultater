// npm run brand: launch kit for the Instagram account in output/brand/ – a pinned intro post (feed + story),
// and tekster.txt with the bio, the intro caption, ready-to-share texts for the club's own channels, and a
// first-week plan. Posted by hand (one-offs). The account is unofficial; the texts say so.

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, paths } from '../config.ts';
import { buildPalette } from '../render/colors.ts';
import { BrandMark } from '../render/components.tsx';
import { loadClubLogo, renderPng, SIZES } from '../render/render.ts';

const config = loadConfig();
const p = buildPalette(config, await loadClubLogo(config));
const out = path.join(paths.output, 'brand');
fs.mkdirSync(out, { recursive: true });
const name = config.brand.name;

const point = (title: string, text: string) => (
  <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
    <div style={{ width: 16, height: 16, borderRadius: 16, backgroundColor: p.accent, marginTop: 14, flexShrink: 0 }} />
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 36 }}>{title}</span>
      <span style={{ fontFamily: 'Inter', fontSize: 27, color: '#cfd8d3' }}>{text}</span>
    </div>
  </div>
);

const intro = (story: boolean) => (
  // Padding on an inner box: the renderer adds padding outside the given size (content-box).
  <div style={{ width: 1080, height: story ? 1920 : 1350, display: 'flex', backgroundColor: p.dark, color: '#ffffff', fontFamily: 'Inter' }}>
  <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, padding: `${story ? 220 : 80}px 64px ${story ? 220 : 64}px` }}>
    <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 24, letterSpacing: 4, textTransform: 'uppercase', color: p.accent }}>{`${name} · ${config.brand.tagline}`}</span>
    <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: story ? 140 : 124, lineHeight: 0.9, textTransform: 'uppercase', marginTop: 34 }}>Alle resultatene.</span>
    <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: story ? 140 : 124, lineHeight: 0.9, textTransform: 'uppercase', color: p.accent }}>Ett sted.</span>
    <span style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 32, marginTop: 30, lineHeight: 1.3 }}>Kamper og resultater for Bærum SKs lag – automatisk, rett fra fotball.no.</span>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 30, marginTop: 56 }}>
      {point('Hvert resultat', 'Så snart det er registrert, for lag fra 13 år og oppover')}
      {point('Mandag', 'Helgens resultater og ukas kamper')}
      {point('Kampdag', 'Plakat for A-lagets kamper')}
    </div>
    <div style={{ display: 'flex', flexGrow: 1 }} />
    <span style={{ fontFamily: 'Inter', fontSize: 22, color: '#cfd8d3', lineHeight: 1.4 }}>Uoffisiell side. Resultater fra fotball.no. Ingen spillernavn – mange av spillerne er barn og unge.</span>
  </div>
  </div>
);
fs.writeFileSync(path.join(out, 'intro_feed.png'), await renderPng(intro(false), SIZES.feed));
fs.writeFileSync(path.join(out, 'intro_story.png'), await renderPng(intro(true), SIZES.story));

// Profile picture: a football in the account's colours. The account is unofficial, so never the club logo.
const avatar = (
  <div style={{ width: 1080, height: 1080, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: p.dark }}>
    <div style={{ width: 800, height: 800, borderRadius: 800, border: `18px solid ${p.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <BrandMark size={560} color={p.dark} />
    </div>
  </div>
);
fs.writeFileSync(path.join(out, 'profilbilde.png'), await renderPng(avatar, { width: 1080, height: 1080 }));

const bio = `⚽ Resultater og kamper for Bærum SK-lagene\nHvert resultat så snart det er klart\nUoffisiell · data fra fotball.no 👇`;
fs.writeFileSync(
  path.join(out, 'tekster.txt'),
  `BIO (${bio.length} av 150 tegn)
${bio}

TEKST TIL INTRO-INNLEGGET (fest det øverst)
Alle resultatene. Ett sted. ⚽

Her kommer resultatene for Bærum SKs lag automatisk, så snart de er registrert på fotball.no – fra 13 år og oppover. Hver mandag: helgens resultater og ukas kamper.

Følg og slå på varsler, så får du med deg resultatet selv om du ikke var på kampen 👇
Tag lagkamerater og foreldre som vil følge med!

Uoffisiell side. Ingen spillernavn – mange av spillerne er barn og unge.
${config.brand.hashtags.join(' ')}

TIL KLUBBENS KANALER (avtal med klubben først – kontoen er uoffisiell)
Nettside / Facebook:
  Følg resultatene på Instagram! På @baerumsk.resultater kommer resultatene for lagene våre automatisk,
  så snart de er registrert, og hver mandag helgens resultater og ukas kamper. Ingen spillernavn.
Melding til lagledere (Spond / e-post):
  Hei! Resultatene for laget kommer nå automatisk på Instagram (@baerumsk.resultater) rett etter kamp.
  Del gjerne med foreldregruppa – fint for besteforeldre og andre som ikke kan være på kampen.

FØRSTE UKE
Dag 1: publiser intro-innlegget og fest det øverst; legg intro_story.png som høydepunkt «Om».
Dag 1–2: be klubben dele på nettside/Facebook og send meldingen til lagledere (over).
Dag 2–4: følg lagene, klubbene og lokale kontoer i Bærum; lik og kommenter etter kamp («Gratulerer med seieren!»).
Hver kampdag: del resultatinnlegget i story – det er der foreldre ser det først.
Mål første måned: 200–400 følgere (foreldre og spillere i de største lagene).
`,
);
console.log(`Brand files in ${path.relative(process.cwd(), out)}: profilbilde.png, intro_feed.png, intro_story.png, tekster.txt`);
