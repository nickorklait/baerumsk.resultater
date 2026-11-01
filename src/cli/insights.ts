// npm run insights
// Reads Instagram statistics (followers, reach and interactions per post) into data/insights.json.
// Needs the instagram_business_manage_insights permission on the token; without it this records
// "missing-permission" (shown on the dashboard) and exits normally, so the run does not fail.

import { loadConfig } from '../config.ts';
import { InstagramError } from '../publish/instagram.ts';
import { connectInstagram } from '../publish/connect.ts';
import { addFollowerPoint, insightTargets, readInsights, writeInsights } from '../publish/insights.ts';
import { readProfile } from '../publish/profile.ts';
import { loadCredentials, readPublished } from '../publish/state.ts';

const config = loadConfig();
let insights = readInsights();
if (!loadCredentials()?.token) {
  console.log('Instagram is not connected yet; no statistics to read.');
  process.exit(0);
}
const { ig } = await connectInstagram(config);

try {
  const { followers } = await ig.accountStats();
  insights = addFollowerPoint(insights, followers);
  insights.profile = (await readProfile(loadCredentials()!.token)) ?? insights.profile;

  // Older log entries have no media id: match them to the account's posts by permalink.
  const published = readPublished();
  const targets = insightTargets(published);
  const byPermalink = targets.some((t) => !t.entry.mediaIds[0] && t.entry.permalink)
    ? new Map((await ig.recentMedia(50)).map((m) => [m.permalink.replace(/\/$/, ''), m.id]))
    : new Map<string, string>();

  let read = 0;
  for (const { key, entry } of targets) {
    const mediaId = entry.mediaIds[0] ?? (entry.permalink ? byPermalink.get(entry.permalink.replace(/\/$/, '')) : undefined);
    if (!mediaId) continue;
    // Read at most every 6 hours (the shared rate limit).
    const seen = insights.media[key]?.fetchedAt;
    if (seen && Date.now() - Date.parse(seen) < 6 * 3.6e6) continue;
    try {
      const values = await ig.mediaInsights(mediaId, entry.kind);
      insights.media[key] = { mediaId, kind: entry.kind, fetchedAt: new Date().toISOString(), ...values };
      read++;
    } catch (e) {
      // Too new (data lags) or too few views for a story: try again next run.
      if (e instanceof InstagramError && e.code === 10 && !/permission/i.test(e.message)) continue;
      throw e;
    }
  }
  insights = { ...insights, updatedAt: new Date().toISOString(), error: undefined };
  writeInsights(insights);
  console.log(`Insights: ${followers} followers, statistics read for ${read} publications.`);
} catch (e) {
  const missing = e instanceof InstagramError && (/permission/i.test(e.message) || e.code === 10 || e.code === 200);
  writeInsights({ ...insights, updatedAt: new Date().toISOString(), error: missing ? 'missing-permission' : (e as Error).message.slice(0, 200) });
  console.warn(missing ? 'Insights: the token lacks instagram_business_manage_insights (see README).' : `Insights failed: ${(e as Error).message}`);
}
