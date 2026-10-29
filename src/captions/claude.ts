import Anthropic from '@anthropic-ai/sdk';
import type { CaptionFacts } from './facts.ts';

const MODEL = 'claude-opus-5-5';

const VOICE = {
  club: "You write Instagram/Facebook captions for the football department of a Norwegian amateur sports club, in the club's own voice.",
  neutral:
    'You write captions for an independent, unofficial Instagram account that posts local grassroots football results and fixtures from Bærum, Norway, based on public data from fotball.no. Write as a friendly local observer, not as the club (no "we" or "our team").',
};

const RULES = `
Rules:
- Write in Norwegian bokmål. Short and lively: 2-5 short lines, at most about 500 characters. A few fitting emojis are fine.
- End with 2-4 hashtags, always including the hashtags you are given.
- Use ONLY the facts given for each post: team designations, club names, scores, dates, venues, leagues. Do not add anything else.
- Never mention individual people: no players, coaches, goal scorers or parents by name. Many players are minors.
- Do not invent details such as goal scorers, weather, table positions, streaks or "first win of the season".
- Write scores with an en dash, e.g. 3–1. When you describe a club team's result, put the club team's goals first.
- Refer to opponents by the club name given, not by their team designation.
- If sponsors are listed, thank them briefly by name. If none are listed, do not mention sponsors.`;

const SCHEMA = {
  type: 'object',
  properties: {
    captions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, caption: { type: 'string' } },
        required: ['id', 'caption'],
        additionalProperties: false,
      },
    },
  },
  required: ['captions'],
  additionalProperties: false,
} as const;

export const claudeAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/**
 * One request for the whole week. Returns captions by post id; posts that are missing
 * (or the whole call failing) simply fall back to template captions.
 */
export async function claudeCaptions(posts: { id: string; facts: CaptionFacts }[], club: { name: string; hashtags: string[]; profile: 'club' | 'neutral' }): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (posts.length === 0) return result;
  const client = new Anthropic();
  const payload = posts.map((p) => ({
    id: p.id,
    post: p.facts.headline,
    facts: p.facts.lines,
    sponsors: p.facts.sponsorNames,
  }));
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: `${VOICE[club.profile]}\n\n${RULES}`,
      messages: [
        {
          role: 'user',
          content: `${club.profile === 'club' ? 'Club' : 'Account'}: ${club.name}. Hashtags to use: ${club.hashtags.join(' ')}.\nWrite one caption per post:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    });
    if (response.stop_reason === 'refusal') {
      console.warn('Claude declined the caption request; using template captions.');
      return result;
    }
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return result;
    const parsed = JSON.parse(text.text) as { captions: { id: string; caption: string }[] };
    for (const c of parsed.captions) result.set(c.id, c.caption.trim());
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) console.warn('Claude API: invalid credentials; using template captions.');
    else if (error instanceof Anthropic.RateLimitError) console.warn('Claude API: rate limited; using template captions.');
    else if (error instanceof Anthropic.APIError) console.warn(`Claude API error ${error.status}; using template captions.`);
    else if (error instanceof SyntaxError) console.warn('Claude API returned invalid JSON; using template captions.');
    else throw error;
  }
  return result;
}
