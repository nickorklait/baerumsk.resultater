import { formatRangeNo, periodLabel, weekdayNameNo, type DayRange } from '../../dates.ts';
import type { ResultItem } from '../../posts/results.ts';
import type { SponsorSet } from '../../sponsors.ts';
import { DISPLAY, ellipsis, OpponentBadge, OutcomeChip, PageBadge, PostLayout, TEXT, Title, type Theme } from '../components.tsx';
import type { Format } from '../render.ts';

export interface ResultsSummaryProps {
  theme: Theme;
  format: Format;
  window: DayRange;
  items: ResultItem[];
  totals: { wins: number; draws: number; losses: number; goalsFor: number; matches: number };
  sponsors: SponsorSet;
  page?: { index: number; count: number };
}

/** Rows that fit on one image; more than this and the summary becomes a carousel. */
export const MAX_ROWS: Record<Format, number> = { feed: 6, story: 7 };

const LAYOUT = {
  feed: { title: 116, gap: 12, rowMax: 118, rowsArea: 620, stats: 84 },
  story: { title: 150, gap: 18, rowMax: 140, rowsArea: 720, stats: 104 },
};

function shortDate(start: string): string {
  const day = start.slice(0, 10);
  const [, mm, dd] = day.split('-');
  return `${weekdayNameNo(day).slice(0, 3)}. ${Number(dd)}.${Number(mm)}`;
}

function TeamSide({ item, home, size }: { item: ResultItem; home: boolean; size: number }) {
  const name = home ? item.match.home : item.match.away;
  const ours = item.side === 'both' || (item.side === 'home') === home;
  const team = ours ? (item.side === 'both' ? null : item.own) : item.opponent;
  // Internal derbies show the team labels; otherwise club names (the label pill says which team).
  const text = item.side === 'both' ? name.replace(/^\S+\s/, '') : (team?.club ?? name);
  const badge = ours ? null : <OpponentBadge club={item.opponent.club} size={size * 0.9} />;
  return (
    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: home ? 'flex-end' : 'flex-start', gap: 12, minWidth: 0 }}>
      {!home && badge}
      <span
        style={{
          ...ellipsis, fontFamily: DISPLAY, fontWeight: 800, fontSize: text.length > 11 ? size * 0.62 : size * 0.78,
          color: ours ? 'white' : 'rgba(255,255,255,0.78)', textTransform: 'uppercase', textAlign: home ? 'right' : 'left', maxWidth: '100%',
        }}
      >
        {text}
      </span>
      {home && badge}
    </div>
  );
}

function ResultRow({ item, height, primary }: { item: ResultItem; height: number; primary: string }) {
  const s = item.match.score!;
  const u = height / 120;
  const meta = [item.match.league, item.match.round ? `runde ${item.match.round}` : null, shortDate(item.match.start), item.side === 'away' ? 'borte' : item.side === 'home' ? 'hjemme' : null]
    .filter(Boolean)
    .join('  ·  ');
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', height, gap: 18 * u, padding: `0 ${20 * u}px`, borderRadius: 18 * u,
        backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)',
      }}
    >
      <div style={{ display: 'flex', width: 132 * u, height: 54 * u, borderRadius: 10 * u, backgroundColor: primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 36 * u, color: 'white', textTransform: 'uppercase' }}>{item.own.label}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 8 * u }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 * u }}>
          <TeamSide item={item} home size={50 * u} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 132 * u, height: 58 * u, padding: `0 ${14 * u}px`, borderRadius: 10 * u, backgroundColor: 'white', flexShrink: 0 }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 50 * u, color: '#0f172a' }}>{`${s.home} – ${s.away}`}</span>
          </div>
          <TeamSide item={item} home={false} size={50 * u} />
        </div>
        <span style={{ ...ellipsis, fontFamily: TEXT, fontSize: 17 * u, color: 'rgba(255,255,255,0.6)', textAlign: 'center', justifyContent: 'center' }}>{meta}</span>
      </div>
      <OutcomeChip outcome={item.outcome} size={52 * u} />
    </div>
  );
}

function Stat({ value, label, color, size }: { value: number; label: string; color: string; size: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: size * 0.14 }}>
      <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size, color }}>{value}</span>
      <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: size * 0.27, letterSpacing: 2, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}

export function ResultsSummary({ theme, format, window, items, totals, sponsors, page }: ResultsSummaryProps) {
  const L = LAYOUT[format];
  const rowHeight = Math.min(L.rowMax, Math.floor((L.rowsArea - L.gap * (items.length - 1)) / Math.max(items.length, 1)));
  return (
    <PostLayout theme={theme} format={format} sponsors={sponsors} badge={page && page.count > 1 ? <PageBadge page={page} /> : undefined}>
      <Title lines={[periodLabel(window).title, 'resultater']} size={L.title} subtitle={formatRangeNo(window)} accent={theme.palette.accent} />

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, justifyContent: 'center', gap: L.gap, marginTop: L.gap * 2 }}>
        {items.map((item) => (
          <ResultRow key={item.match.key} item={item} height={rowHeight} primary={theme.palette.primary} />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: L.stats, marginTop: L.gap, padding: '0 8px', borderTop: '2px solid rgba(255,255,255,0.18)' }}>
        <Stat value={totals.wins} label={totals.wins === 1 ? 'seier' : 'seire'} color="#4ade80" size={L.stats * 0.72} />
        <Stat value={totals.draws} label="uavgjort" color="#fcd34d" size={L.stats * 0.72} />
        <Stat value={totals.losses} label="tap" color="#f87171" size={L.stats * 0.72} />
        <Stat value={totals.goalsFor} label="mål" color="white" size={L.stats * 0.72} />
      </div>
    </PostLayout>
  );
}
