import { activeHashtags, type ClubConfig, type Sponsor } from '../config.ts';
import type { PostSpec } from '../posts/build.tsx';
import { claudeAvailable, claudeCaptions } from './claude.ts';
import { factCheck, type FactCheckContext } from './factCheck.ts';
import type { Caption } from './facts.ts';

const DAYS_AND_MONTHS = 'Mandag Tirsdag Onsdag Torsdag Fredag Lørdag Søndag Januar Februar Mars April Mai Juni Juli August September Oktober November Desember';

export function factCheckContext(config: ClubConfig, knownClubs: string[], sponsors: Sponsor[]): FactCheckContext {
  return {
    knownClubs,
    allowedWords: [config.club.name, config.club.shortName, config.brand.name, 'Bærum', 'Fotball', 'Futsal', 'Menn', 'Kvinner', 'Heia', ...sponsors.filter((s) => !s.placeholder).map((s) => s.name), ...DAYS_AND_MONTHS.split(' ')],
    placeNames: ['Bærum', 'Oslo', 'Asker'],
  };
}

/**
 * Template caption for every post; with an API key, a Claude caption instead when it passes the fact-check.
 * Demo posts always keep their "do not publish" template.
 */
export async function produceCaptions(posts: PostSpec[], config: ClubConfig, ctx: FactCheckContext, log = console.log): Promise<Map<string, Caption>> {
  const captions = new Map<string, Caption>();
  for (const p of posts) {
    captions.set(p.id, { text: p.templateCaption, source: 'template' });
    const check = factCheck(p.templateCaption, p.facts, ctx);
    if (!p.demo && !check.ok) log(`  ! template caption for ${p.id} fails its own fact-check: ${check.problems.join('; ')}`);
  }
  if (!claudeAvailable()) {
    log('Captions: templates (set ANTHROPIC_API_KEY to write them with Claude).');
    return captions;
  }
  const publishable = posts.filter((p) => !p.demo);
  const fromClaude = await claudeCaptions(publishable.map((p) => ({ id: p.id, facts: p.facts })), { name: config.brand.profile === 'club' ? config.club.name : config.brand.name, hashtags: activeHashtags(config), profile: config.brand.profile });
  let accepted = 0;
  for (const p of publishable) {
    const text = fromClaude.get(p.id);
    if (!text) continue;
    const check = factCheck(text, p.facts, ctx);
    if (check.ok) {
      captions.set(p.id, { text, source: 'claude' });
      accepted++;
    } else {
      captions.set(p.id, { text: p.templateCaption, source: 'template', rejected: check.problems });
      log(`  ! Claude caption for ${p.id} rejected (${check.problems.join('; ')}); using template.`);
    }
  }
  log(`Captions: ${accepted} from Claude, ${posts.length - accepted} from templates.`);
  return captions;
}
