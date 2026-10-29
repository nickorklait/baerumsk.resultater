// The account's profile as the growth report shows it: is it set up (picture, bio, name, link) and does it
// follow anyone. Read with the account's own token when the statistics are read; never fails the run.

export interface Profile {
  name: string;
  /** Characters in the bio (0 = no bio). */
  bio: number;
  picture: boolean;
  website: boolean;
  follows: number;
  followers: number;
  media: number;
  checkedAt: string;
}

export async function readProfile(token: string, apiVersion = 'v26.0'): Promise<Profile | null> {
  try {
    const fields = 'name,biography,website,profile_picture_url,followers_count,follows_count,media_count';
    const res = await fetch(`https://graph.instagram.com/${apiVersion}/me?fields=${fields}&access_token=${encodeURIComponent(token)}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { name?: string; biography?: string; website?: string; profile_picture_url?: string; followers_count?: number; follows_count?: number; media_count?: number };
    return { name: j.name ?? '', bio: (j.biography ?? '').length, picture: !!j.profile_picture_url, website: !!j.website, follows: j.follows_count ?? 0, followers: j.followers_count ?? 0, media: j.media_count ?? 0, checkedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}
