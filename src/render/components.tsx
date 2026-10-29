import type { CSSProperties, ReactNode } from 'react';
import type { Sponsor } from '../config.ts';
import { initials } from '../data/teams.ts';
import type { Outcome } from '../posts/results.ts';
import type { SponsorSet } from '../sponsors.ts';
import type { Palette } from './colors.ts';

export interface Theme {
  palette: Palette;
  /** Club logo for our own teams; null shows an initials badge in club colours. */
  logoUri: string | null;
  /** Used for the own-team initials badge when there is no logo. */
  clubName: string;
  /** Header: club name (club profile) or account name (neutral profile). */
  headerTitle: string;
  headerSubtitle: string;
  /** Neutral profile shows a generic football mark instead of the club logo in the header. */
  headerMark: 'club' | 'neutral';
  sourceLine: string | null;
  /** Main hashtag, used as decoration where platform UI covers the image. */
  hashtag: string;
}

export const DISPLAY = 'Barlow Condensed';
export const TEXT = 'Inter';

const OUTCOME_COLORS: Record<Outcome, string> = { win: '#22c55e', draw: '#f5b301', loss: '#ef4444' };
const OUTCOME_LETTER: Record<Outcome, string> = { win: 'S', draw: 'U', loss: 'T' };

/** Dark club-coloured background with a diagonal band and an accent stripe. */
export function Frame({ theme, width, height, children }: { theme: Theme; width: number; height: number; children: ReactNode }) {
  const { palette } = theme;
  return (
    <div style={{ width, height, display: 'flex', position: 'relative', overflow: 'hidden', backgroundColor: palette.dark, fontFamily: TEXT, color: 'white' }}>
      <DiagonalBands width={width} height={height} palette={palette} />
      <div style={{ position: 'absolute', top: 0, left: 0, width, height, backgroundImage: `radial-gradient(circle at 15% 10%, #ffffff14, #00000000 55%)` }} />
      <div style={{ position: 'absolute', top: 0, left: 0, width, height, display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}

/** Slanted club-colour band and accent stripe in the top-right corner, fading out before the content. */
function DiagonalBands({ width, height, palette }: { width: number; height: number; palette: Palette }) {
  const fade = Math.min(height * 0.5, 680);
  const slope = Math.tan((18 * Math.PI) / 180) * fade;
  const x = width * 0.68;
  const band = `${x},0 ${width},0 ${width},${fade} ${x - slope},${fade}`;
  const stripe = `${x - 46},0 ${x - 28},0 ${x - 28 - slope},${fade} ${x - 46 - slope},${fade}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', top: 0, left: 0 }}>
      <defs>
        <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.primary} stopOpacity="0.95" />
          <stop offset="1" stopColor={palette.primary} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="stripe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.accent} stopOpacity="1" />
          <stop offset="1" stopColor={palette.accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={band} fill="url(#band)" />
      <polygon points={stripe} fill="url(#stripe)" />
    </svg>
  );
}

export function ClubLogo({ theme, size }: { theme: Theme; size: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: size, backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 6px 24px rgba(0,0,0,0.35)', flexShrink: 0,
      }}
    >
      {theme.logoUri ? (
        <img src={theme.logoUri} width={size * 0.84} height={size * 0.84} style={{ borderRadius: size }} />
      ) : (
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size * 0.4, color: theme.palette.primary }}>{initials(theme.clubName)}</span>
      )}
    </div>
  );
}

/** Neutral account mark: a football in a white disc. */
export function BrandMark({ size, color }: { size: number; color: string }) {
  // Centre pentagon and the seams to the edge, on a 100x100 grid.
  const pent = [0, 1, 2, 3, 4].map((i) => {
    const a = (-90 + i * 72) * (Math.PI / 180);
    return [50 + 17 * Math.cos(a), 50 + 17 * Math.sin(a)];
  });
  const edge = pent.map(([x, y]) => [50 + (x - 50) * 2.6, 50 + (y - 50) * 2.6]);
  return (
    <div style={{ width: size, height: size, borderRadius: size, backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 24px rgba(0,0,0,0.35)', flexShrink: 0 }}>
      <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="white" stroke={color} strokeWidth="6" />
        {pent.map(([x, y], i) => (
          <line key={i} x1={x} y1={y} x2={edge[i][0]} y2={edge[i][1]} stroke={color} strokeWidth="5" />
        ))}
        <polygon points={pent.map((p) => p.join(',')).join(' ')} fill={color} />
      </svg>
    </div>
  );
}

const BADGE_COLORS = ['#334155', '#3f3f6e', '#4a3b2f', '#2f4858', '#5b2a3c', '#29434e', '#3d4a2a', '#4b3a5e'];

function hashString(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h;
}

/** Opponents have no logo in the feed: a neutral shield-like disc with initials. */
export function OpponentBadge({ club, size }: { club: string; size: number }) {
  const text = initials(club);
  const bg = BADGE_COLORS[hashString(club) % BADGE_COLORS.length];
  return (
    <div
      style={{
        width: size, height: size, borderRadius: size, backgroundColor: bg, border: `${Math.max(2, size * 0.05)}px solid rgba(255,255,255,0.85)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size * (text.length > 3 ? 0.3 : 0.4), color: 'white', letterSpacing: 1 }}>{text}</span>
    </div>
  );
}

export function OutcomeChip({ outcome, size }: { outcome: Outcome | null; size: number }) {
  const bg = outcome ? OUTCOME_COLORS[outcome] : 'rgba(255,255,255,0.25)';
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size * 0.62, color: outcome === 'draw' ? '#1a1a1a' : 'white' }}>
        {outcome ? OUTCOME_LETTER[outcome] : '–'}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- sponsors

function SponsorMark({ sponsor, size }: { sponsor: Sponsor; size: number }) {
  const [c0, c1] = sponsor.colors ?? ['#333333', '#999999'];
  const shapes: Record<NonNullable<Sponsor['mark']>, ReactNode> = {
    wave: (
      <>
        <circle cx="50" cy="50" r="48" fill={c0} />
        <path d="M8 58 Q 29 38 50 58 T 92 58 L 92 70 Q 71 50 50 70 T 8 70 Z" fill={c1} />
        <path d="M14 42 Q 32 26 50 42 T 86 42 L 86 50 Q 68 34 50 50 T 14 50 Z" fill="white" />
      </>
    ),
    sun: (
      <>
        <rect x="2" y="2" width="96" height="96" rx="22" fill={c0} />
        <circle cx="50" cy="62" r="24" fill={c1} />
        <rect x="14" y="62" width="72" height="22" fill={c0} />
        <rect x="14" y="66" width="72" height="5" fill={c1} />
        <rect x="24" y="76" width="52" height="5" fill={c1} />
      </>
    ),
    peak: (
      <>
        <circle cx="50" cy="50" r="48" fill={c0} />
        <path d="M14 76 L40 30 L56 56 L64 44 L86 76 Z" fill={c1} />
        <path d="M40 30 L48 44 L42 40 L36 46 Z" fill="white" />
        <circle cx="72" cy="28" r="7" fill="white" />
      </>
    ),
    leaf: (
      <>
        <rect x="2" y="2" width="96" height="96" rx="10" fill={c0} />
        <path d="M50 14 L82 50 L50 86 L18 50 Z" fill={c1} />
        <path d="M50 30 L66 50 L50 70 L34 50 Z" fill={c0} />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {shapes[sponsor.mark ?? 'leaf']}
    </svg>
  );
}

/** Club-supplied logo file, generated DEMO logo, or (real sponsor without a file) the name as plain text. */
export function SponsorLogo({ sponsor, height, onDark = false, accent = '#d3342f' }: { sponsor: Sponsor; height: number; onDark?: boolean; accent?: string }) {
  if (sponsor.placeholder) {
    const main = sponsor.role === 'main';
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height, width: height * (main ? 4.4 : 3.1), border: `${Math.max(2, height * 0.05)}px dashed ${accent}`, borderRadius: height * 0.18, backgroundColor: `${accent}14` }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: height * (main ? 0.4 : 0.42), letterSpacing: 1, color: accent, textTransform: 'uppercase' }}>{sponsor.name}</span>
      </div>
    );
  }
  if (sponsor.logoUri) {
    return <img src={sponsor.logoUri} height={height} width={height * 3} style={{ objectFit: 'contain' }} />;
  }
  if (!sponsor.demo) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', height, maxWidth: height * 5 }}>
        <span style={{ fontFamily: TEXT, fontWeight: 800, fontSize: height * (height < 60 ? 0.5 : 0.42), lineHeight: 1.05, letterSpacing: -0.3, color: onDark ? 'white' : '#111827' }}>{sponsor.name}</span>
      </div>
    );
  }
  const [first, ...more] = sponsor.name.split(' ');
  const ink = onDark ? 'white' : sponsor.colors?.[0] ?? '#111827';
  return (
    <div style={{ display: 'flex', alignItems: 'center', height, gap: height * 0.16 }}>
      <SponsorMark sponsor={sponsor} size={height} />
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: height * 0.52, lineHeight: 0.95, color: ink, textTransform: 'uppercase' }}>{first}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: height * 0.08 }}>
          <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: height * 0.2, letterSpacing: height * 0.03, color: ink, opacity: 0.8, textTransform: 'uppercase' }}>
            {more.join(' ')}
          </span>
          <span
            style={{
              fontFamily: TEXT, fontWeight: 800, fontSize: height * 0.13, color: onDark ? '#111' : 'white', backgroundColor: onDark ? 'white' : ink,
              padding: `${height * 0.01}px ${height * 0.05}px`, borderRadius: height * 0.04, letterSpacing: 1,
            }}
          >
            DEMO
          </span>
        </div>
      </div>
    </div>
  );
}

const label = (text: string, size: number): ReactNode => (
  <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: size, letterSpacing: size * 0.12, color: '#6b7280', textTransform: 'uppercase' }}>{text}</span>
);

/** White sponsor bar at the bottom of every post: main sponsor, then labelled groups. */
export function SponsorBar({ sponsors, width, scale = 1, accent }: { sponsors: SponsorSet; width: number; scale?: number; accent?: string }) {
  const groups: { title: string; list: Sponsor[] }[] = [
    ...sponsors.team.map((s) => ({ title: sponsors.labels.team, list: [s] })),
    ...(sponsors.match ? [{ title: sponsors.labels.match, list: [sponsors.match] }] : []),
    ...(sponsors.partners.length ? [{ title: sponsors.labels.partner, list: sponsors.partners }] : []),
  ];
  const pad = 44 * scale;
  return (
    <div style={{ width, display: 'flex', alignItems: 'center', backgroundColor: 'white', padding: `${22 * scale}px ${pad}px`, gap: 34 * scale }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 * scale, maxWidth: 360 * scale }}>
        {label(sponsors.labels.main, 15 * scale)}
        <SponsorLogo sponsor={sponsors.main} height={70 * scale} accent={accent} />
      </div>
      {groups.length > 0 && <div style={{ width: 2, alignSelf: 'stretch', backgroundColor: '#e5e7eb' }} />}
      <div style={{ display: 'flex', flex: 1, justifyContent: 'space-around', gap: 26 * scale }}>
        {groups.map(({ title, list }) => (
          <div key={title + list[0].id} style={{ display: 'flex', flexDirection: 'column', gap: 8 * scale, flex: list.length > 1 ? 1 : undefined }}>
            {label(title, 13 * scale)}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 22 * scale }}>
              {list.map((s) => <SponsorLogo key={s.id} sponsor={s} height={46 * scale} accent={accent} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Bottom of a story sits under the platform reply bar: decoration only. */
export function StoryFooter({ theme, height }: { theme: Theme; height: number }) {
  return (
    <div style={{ display: 'flex', height, alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: height * 0.5, letterSpacing: 6, color: 'rgba(255,255,255,0.14)', textTransform: 'uppercase' }}>{theme.hashtag}</span>
    </div>
  );
}

/** Our own team under its crest: "Haslum G13-2"; just the club when that is too long (the team is in the badge). 13 characters: wide letters (Æ, M, W) fill the space sooner. */
export const ownTeamName = (theme: Theme, label: string) => (`${theme.clubName} ${label}`.length <= 13 ? `${theme.clubName} ${label}` : theme.clubName);

export const ellipsis: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

// ---------------------------------------------------------------- shared post layout

export const PAGE = {
  feed: { padX: 56, padTop: 52, padBottom: 0, logo: 96 },
  // Story keeps the top 200 px and bottom 190 px clear of Instagram/Facebook UI.
  story: { padX: 56, padTop: 200, padBottom: 190, logo: 120 },
} as const;

export function Pill({ text, color, size, textColor = 'white' }: { text: string; color: string; size: number; textColor?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `${size * 0.1}px ${size * 0.42}px`, borderRadius: size * 0.22, backgroundColor: color, flexShrink: 0 }}>
      <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size, color: textColor, textTransform: 'uppercase' }}>{text}</span>
    </div>
  );
}

/** Frame + club header + content + sponsor bar (+ story footer). */
export function PostLayout({ theme, format, sponsors, badge, children }: { theme: Theme; format: 'feed' | 'story'; sponsors: SponsorSet; badge?: ReactNode; children: ReactNode }) {
  const width = 1080;
  const height = format === 'feed' ? 1350 : 1920;
  const P = PAGE[format];
  return (
    <Frame theme={theme} width={width} height={height}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: `${P.padTop}px ${P.padX}px 28px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          {theme.headerMark === 'club' ? <ClubLogo theme={theme} size={P.logo} /> : <BrandMark size={P.logo} color={theme.palette.dark} />}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 30, letterSpacing: 6, textTransform: 'uppercase' }}>{theme.headerTitle}</span>
            <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 22, letterSpacing: 5, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>{theme.headerSubtitle}</span>
          </div>
          {badge && <div style={{ display: 'flex', marginLeft: 'auto' }}>{badge}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>{children}</div>
        {theme.sourceLine && (
          <span style={{ fontFamily: TEXT, fontSize: 18, letterSpacing: 1, color: 'rgba(255,255,255,0.55)', marginTop: 10 }}>{theme.sourceLine}</span>
        )}
      </div>
      <div style={{ display: 'flex' }}>
        <SponsorBar sponsors={sponsors} width={width} accent={theme.palette.accent} />
      </div>
      {P.padBottom > 0 && <StoryFooter theme={theme} height={P.padBottom} />}
    </Frame>
  );
}

/** Big two-tone title with an accent bar and subtitle. */
export function Title({ lines, size, subtitle, accent }: { lines: string[]; size: number; subtitle?: string; accent: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 22 }}>
      {lines.map((l) => (
        <span key={l} style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size, lineHeight: 0.86, textTransform: 'uppercase' }}>{l}</span>
      ))}
      {subtitle && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14 }}>
          <div style={{ width: 70, height: 8, backgroundColor: accent, flexShrink: 0 }} />
          <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 28, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)' }}>{subtitle}</span>
        </div>
      )}
    </div>
  );
}

/** Crest for any team: our logo, or an initials badge for opponents. */
export function Crest({ theme, club, own, size }: { theme: Theme; club: string; own: boolean; size: number }) {
  return own ? <ClubLogo theme={theme} size={size} /> : <OpponentBadge club={club} size={size} />;
}

/** Diagonal "EKSEMPEL" stamp for demo content that must not be published. */
export function DemoStamp({ width, height, text = 'EKSEMPEL' }: { width: number; height: number; text?: string }) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width, height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: width * 0.2, color: 'rgba(255,255,255,0.13)', transform: 'rotate(-28deg)', letterSpacing: 12 }}>{text}</span>
    </div>
  );
}

export function PageBadge({ page }: { page: { index: number; count: number } }) {
  return (
    <div style={{ display: 'flex', padding: '6px 16px', borderRadius: 30, border: '2px solid rgba(255,255,255,0.5)' }}>
      <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30 }}>{`${page.index + 1}/${page.count}`}</span>
    </div>
  );
}
