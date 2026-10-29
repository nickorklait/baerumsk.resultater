import fs from 'node:fs';
import { applySettings, readControls } from './controls.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const paths = {
  config: path.join(ROOT, 'config'),
  snapshots: path.join(ROOT, 'data', 'snapshots'),
  logos: path.join(ROOT, 'data', 'logos'),
  fonts: path.join(ROOT, 'assets', 'fonts'),
  output: path.join(ROOT, 'output'),
};

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface ClubConfig {
  club: {
    name: string;
    shortName: string;
    fiksId: number;
    teamPrefix: string;
    logoUrl: string;
    hashtags: string[];
  };
  /**
   * How posts are branded. "club": the club's own account (logo, club name).
   * "neutral": an independent results account (own name, no club logo) in the club's colours.
   */
  brand: {
    profile: 'club' | 'neutral';
    name: string;
    tagline: string;
    hashtags: string[];
    /** Small credit line on every image, e.g. the data source. */
    sourceLine: string | null;
  };
  colors: {
    auto: boolean;
    primary: string | null;
    secondary: string | null;
    accent: string | null;
  };
  data: {
    adapter: 'calendarFeed' | 'fotballdata';
    userAgent: string;
    minHoursBetweenFetches: number;
    tournamentIds: number[];
  };
  sponsors: {
    /** File in config/: sponsors.haslum.json (real, from the club website) or sponsors.demo.json (fictional). */
    file: string;
  };
  publish: {
    /** Master switch: nothing is sent to Instagram unless true. */
    enabled: boolean;
    instagram: { apiVersion: string; stories: boolean };
    /** Public base URL where output/ is served (e.g. a web host). Null: use a temporary Cloudflare tunnel. */
    imageBaseUrl: string | null;
    schedule: {
      results: { daysAfterWindow: number; time: string };
      fixtures: { daysAfterWindow: number; time: string };
      matchDay: { time: string };
      /** One post per result, published as soon as the result is in the data. */
      perResult: {
        enabled: boolean;
        /** Only results from this date ("YYYY-MM-DD"), so switching on does not post old results. */
        since: string;
        /** Do not post a result more than this many hours after kick-off. */
        expiresAfterHours: number;
      };
    };
  };
  posts: {
    resultsWindow: { from: Weekday; to: Weekday };
    minResultAge: number;
    includeChildrenInFixtures: boolean;
    matchDayTeams: string[];
    /** Teams that have opted out: no posts about them at all. */
    excludedTeams?: string[];
  };
}

export type SponsorRole = 'main' | 'team' | 'match' | 'partner';

export interface Sponsor {
  id: string;
  name: string;
  role: SponsorRole;
  /** Regex on full team name for the teams this sponsor backs (role "team"). */
  teamPattern?: string;
  website?: string;
  /** Logo supplied by the club, in assets/sponsors/. Without it a real sponsor is shown as plain text. */
  logoFile?: string;
  /** Set when loaded: data URI of logoFile. */
  logoUri?: string;
  /** Demo sponsors only: generated placeholder logo. */
  colors?: [string, string];
  mark?: 'wave' | 'peak' | 'sun' | 'leaf';
  /** Set when loaded from a demo file: logo gets a DEMO tag. */
  demo?: boolean;
  /** Set when loaded from a placeholder file: shown as an empty, highlighted sponsor slot. */
  placeholder?: boolean;
}

export interface SponsorConfig {
  kind: 'demo' | 'real' | 'placeholder';
  /** Where the sponsor list comes from. */
  source?: string;
  /** False until the club has confirmed that these sponsors (and logos) may be used in public posts. */
  approvedForPublishing: boolean;
  /** Heading shown above each group in the sponsor bar. */
  labels: Record<SponsorRole, string>;
  /** How many "partner" sponsors to show per post (rotating, so all get exposure). */
  partnersPerPost: number;
  sponsors: Sponsor[];
  matchSponsorOfTheWeek: Record<string, string>;
}

export function loadJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(paths.config, file), 'utf8')) as T;
}

/** club.json, with the club's dashboard settings (config/controls.json) applied on top. */
export const loadConfig = () => applySettings(loadJson<ClubConfig>('club.json'), readControls(ROOT).settings);

/** Hashtags for the active brand profile. */
export const activeHashtags = (config: ClubConfig) => (config.brand.profile === 'club' ? config.club.hashtags : config.brand.hashtags);

export function loadSponsors(config: ClubConfig): SponsorConfig {
  const cfg = loadJson<SponsorConfig>(config.sponsors.file);
  for (const s of cfg.sponsors) {
    if (cfg.kind === 'demo') s.demo = true;
    if (cfg.kind === 'placeholder') s.placeholder = true;
    const logo = s.logoFile && path.join(ROOT, 'assets', 'sponsors', s.logoFile);
    if (logo && fs.existsSync(logo)) {
      const mime = logo.endsWith('.svg') ? 'image/svg+xml' : logo.endsWith('.png') ? 'image/png' : 'image/jpeg';
      s.logoUri = `data:${mime};base64,${fs.readFileSync(logo).toString('base64')}`;
    }
  }
  return cfg;
}
