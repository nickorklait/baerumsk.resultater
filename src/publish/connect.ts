import type { ClubConfig } from '../config.ts';
import { updateStatus } from '../status.ts';
import { InstagramClient, refreshToken } from './instagram.ts';
import { loadCredentials, saveCredentials } from './state.ts';

/**
 * Connect to Instagram: refresh the token weekly (so the 60-day token never runs out while the job runs),
 * then resolve the account from the token. Used by publish and insights.
 */
export async function connectInstagram(config: ClubConfig) {
  const creds = loadCredentials();
  if (!creds?.token) {
    const msg = process.env.GITHUB_ACTIONS
      ? 'Mangler Instagram-tilgang: legg inn GitHub-secret INSTAGRAM_ACCESS_TOKEN (og TOKEN_ENCRYPTION_KEY) med nøyaktig disse navnene.'
      : 'Mangler Instagram-tilgang: sett INSTAGRAM_ACCESS_TOKEN i .env (se README).';
    // Show it on the dashboard too, then stop before anything is sent.
    updateStatus('publish', { paused: false, published: [], failed: [{ key: 'instagram', error: msg }], waiting: 0 });
    throw new Error(msg);
  }
  if (Date.now() - Date.parse(creds.refreshedAt) > 7 * 864e5) {
    try {
      const r = await refreshToken(creds.token);
      Object.assign(creds, { token: r.token, refreshedAt: new Date().toISOString() });
      console.log(`Access token refreshed (valid ${Math.round(r.expiresInSeconds / 86400)} days).`);
    } catch (e) {
      console.warn(`Token refresh not done (${(e as Error).message}); using the current token.`);
    }
  }
  const probe = new InstagramClient({ userId: 'me', token: creds.token, apiVersion: config.publish.instagram.apiVersion });
  const me = await probe.whoAmI();
  if (creds.userId && creds.userId !== me.userId) console.warn(`Note: INSTAGRAM_USER_ID in .env (${creds.userId}) is not this account's ID; using ${me.userId} from the token.`);
  creds.userId = me.userId;
  if (creds.refreshedAt !== new Date(0).toISOString()) saveCredentials(creds);
  return { me, ig: new InstagramClient({ userId: me.userId, token: creds.token, apiVersion: config.publish.instagram.apiVersion }) };
}
