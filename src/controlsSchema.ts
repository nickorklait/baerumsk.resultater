// Dashboard actions and their validation. No Node imports: this file is also bundled into the
// Cloudflare function, which validates actions before they reach GitHub.

export interface DashboardSettings {
  /** One post per result (otherwise only the Monday recap). */
  perResult?: boolean;
  /** Children's teams (12 and under) in the fixtures post. */
  includeChildrenInFixtures?: boolean;
  /** Teams that get match-day posters. */
  matchDayTeams?: string[];
  /** Teams that have opted out (no results, fixtures or match-day posts). */
  excludedTeams?: string[];
  /** Stories alongside feed posts. */
  stories?: boolean;
  /** Posting times, "HH:MM" Oslo time. */
  times?: { results?: string; fixtures?: string; matchDay?: string };
}

export type ControlAction =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'skip'; key: string }
  | { type: 'unskip'; key: string }
  | { type: 'caption'; key: string; text: string | null }
  | { type: 'publish-now'; key: string }
  | { type: 'settings'; settings: DashboardSettings };

/** Publication keys from the plan, e.g. "2026-10-25/kamper-feed". */
export const UNIT_KEY = /^\d{4}-\d{2}-\d{2}\/[a-z0-9-]{1,80}-(feed|story)$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TEAM = /^[\p{L}\d .-]{2,40}$/u;
/** Instagram's caption limit. */
export const MAX_CAPTION = 2200;

const fail = (msg: string): never => {
  throw new Error(msg);
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : fail('Ugyldig forespørsel.'));
const key = (v: unknown): string => (typeof v === 'string' && UNIT_KEY.test(v) ? v : fail('Ugyldig innleggsnøkkel.'));
const bool = (v: unknown, name: string): boolean | undefined => (v === undefined ? undefined : typeof v === 'boolean' ? v : fail(`${name} må være av eller på.`));
const time = (v: unknown, name: string): string | undefined => (v === undefined ? undefined : typeof v === 'string' && TIME.test(v) ? v : fail(`${name} må være et klokkeslett som 08:00.`));

/** Parse and validate an action from the dashboard. Throws an Error with a Norwegian message. */
export function parseAction(input: unknown): ControlAction {
  const a = obj(input);
  switch (a.type) {
    case 'pause':
    case 'resume':
      return { type: a.type };
    case 'skip':
    case 'unskip':
    case 'publish-now':
      return { type: a.type, key: key(a.key) };
    case 'caption': {
      if (a.text === null) return { type: 'caption', key: key(a.key), text: null };
      if (typeof a.text !== 'string' || !a.text.trim()) return fail('Teksten kan ikke være tom.');
      if (a.text.length > MAX_CAPTION) return fail(`Teksten er for lang (maks ${MAX_CAPTION} tegn).`);
      return { type: 'caption', key: key(a.key), text: a.text.trim() };
    }
    case 'settings': {
      const s = obj(a.settings);
      const out: DashboardSettings = {};
      const set = <K extends keyof DashboardSettings>(k: K, v: DashboardSettings[K] | undefined) => {
        if (v !== undefined) out[k] = v;
      };
      set('perResult', bool(s.perResult, 'Innlegg per resultat'));
      set('includeChildrenInFixtures', bool(s.includeChildrenInFixtures, 'Barnelag i kampoversikten'));
      set('stories', bool(s.stories, 'Stories'));
      if (s.matchDayTeams !== undefined) {
        if (!Array.isArray(s.matchDayTeams) || s.matchDayTeams.length > 20 || !s.matchDayTeams.every((t) => typeof t === 'string' && TEAM.test(t))) {
          fail('Ugyldig lagliste for kampdag.');
        }
        out.matchDayTeams = s.matchDayTeams as string[];
      }
      if (s.excludedTeams !== undefined) {
        if (!Array.isArray(s.excludedTeams) || s.excludedTeams.length > 100 || !s.excludedTeams.every((t) => typeof t === 'string' && TEAM.test(t))) {
          fail('Ugyldig liste over lag som ikke skal publiseres.');
        }
        out.excludedTeams = s.excludedTeams as string[];
      }
      if (s.times !== undefined) {
        const t = obj(s.times);
        const times = { results: time(t.results, 'Tid for resultater'), fixtures: time(t.fixtures, 'Tid for kampoversikt'), matchDay: time(t.matchDay, 'Tid for kampdag') };
        out.times = Object.fromEntries(Object.entries(times).filter(([, v]) => v !== undefined));
      }
      if (Object.keys(out).length === 0) fail('Ingen innstillinger å lagre.');
      return { type: 'settings', settings: out };
    }
    default:
      return fail('Ukjent handling.');
  }
}

/** Short Norwegian description for the activity log. */
export function describeAction(a: ControlAction): string {
  switch (a.type) {
    case 'pause':
      return 'Satte automatisk publisering på pause';
    case 'resume':
      return 'Startet automatisk publisering igjen';
    case 'skip':
      return `Hoppet over ${a.key}`;
    case 'unskip':
      return `Angret hopp over for ${a.key}`;
    case 'caption':
      return a.text === null ? `Tilbakestilte teksten for ${a.key}` : `Endret teksten for ${a.key}`;
    case 'publish-now':
      return `Publiserte ${a.key} manuelt`;
    case 'settings':
      return `Endret innstillinger: ${Object.keys(a.settings).join(', ')}`;
  }
}
