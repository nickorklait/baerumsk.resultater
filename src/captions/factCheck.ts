import type { CaptionFacts } from './facts.ts';

export interface FactCheckContext {
  /** Every club name seen in the data (to catch teams that are not part of this post). */
  knownClubs: string[];
  /** Words that are always fine with a capital letter mid-sentence. */
  allowedWords: string[];
  /** Club names that are also place names ("Bærum"): only a team mention when followed by a team label. */
  placeNames: string[];
}

export interface FactCheckResult {
  ok: boolean;
  problems: string[];
}

const MONTHS = 'jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des';
// "2–9", "10 - 2". Not times ("18:45"), team labels ("G13-2") or date ranges ("20.–26. okt", "20–26. oktober").
const SCORE = new RegExp(`(?<![\\p{L}\\d.:])(\\d{1,2})\\s?[-–—]\\s?(\\d{1,2})(?![\\d:])(?!\\.?\\s*(?:${MONTHS}))`, 'giu');
// "G13-2", "J17-1", "G9", "Menn 2", "Kvinner 1", "M55", "M 55"
const LABEL = /(?<![\p{L}\d])(?:[GJ]\d{1,2}(?:-\d+)?|(?:Menn|Kvinner|Herrer|Damer) \d+|[MK] ?\d{2})(?![\p{L}\d-])/giu;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w: string, after = '') => new RegExp(`(?<![\\p{L}\\d])${escape(w)}(?![\\p{L}\\d])${after}`, 'iu');

/**
 * Checks that a caption only mentions teams and scores from this post's data,
 * and contains no unknown proper nouns (protects against invented facts and player names).
 */
export function factCheck(caption: string, facts: CaptionFacts, ctx: FactCheckContext): FactCheckResult {
  const problems: string[] = [];
  const text = caption.replace(/[#@][\p{L}\p{N}_]+/gu, ' '); // hashtags and handles are free-form

  // 1. Scores
  const allowedScores = new Set(facts.scores.flatMap(([a, b]) => [`${a}-${b}`, `${b}-${a}`]));
  for (const m of text.matchAll(SCORE)) {
    if (!allowedScores.has(`${Number(m[1])}-${Number(m[2])}`)) problems.push(`score "${m[0]}" is not in the data`);
  }

  // 2. Team designations
  // Age groups that are part of a league name ("G13 2. div.") are fine too.
  const allowedLabels = new Set([...facts.teamLabels, ...facts.places.flatMap((p) => p.match(LABEL) ?? [])].map(norm));
  for (const m of text.matchAll(LABEL)) {
    if (!allowedLabels.has(norm(m[0]))) problems.push(`team "${m[0]}" is not in this post`);
  }

  // 3. Other clubs from the data that are not part of this post
  const postClubs = new Set(facts.clubs.map(norm));
  for (const club of ctx.knownClubs) {
    if (postClubs.has(norm(club))) continue;
    const isPlace = ctx.placeNames.some((p) => norm(p) === norm(club));
    const re = isPlace ? wordRe(club, `\\s+(?:${LABEL.source})`) : wordRe(club);
    if (new RegExp(re.source, 'iu').test(text)) problems.push(`club "${club}" is not in this post`);
  }

  // 4. Unknown proper nouns mid-sentence (player names, invented opponents, places)
  const allowed = new Set(
    [...facts.clubs, ...facts.sponsorNames, ...facts.teamLabels, ...facts.places, ...ctx.allowedWords]
      // "KIL/Hemne": joint teams are written with a slash.
      .flatMap((s) => s.split(/[\s/-]+/))
      .map((w) => w.toLowerCase()),
  );
  for (const sentence of text.split(/(?<=[.!?:\n])\s*|\n/)) {
    const words = sentence.match(/[\p{L}][\p{L}'’-]*/gu) ?? [];
    for (const w of words.slice(1)) {
      const isCapitalised = /^\p{Lu}/u.test(w) && w !== w.toUpperCase();
      if (isCapitalised && !allowed.has(w.toLowerCase()) && !w.split('-').every((p) => allowed.has(p.toLowerCase()))) {
        problems.push(`unknown name "${w}"`);
      }
    }
  }

  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}
