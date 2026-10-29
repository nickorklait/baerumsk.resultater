import { formatRangeNo, monthNameNo, weekdayNameNo, type DayRange } from '../../dates.ts';
import type { Match } from '../../data/match.ts';
import type { SponsorSet } from '../../sponsors.ts';
import { DISPLAY, ellipsis, OpponentBadge, PageBadge, PostLayout, TEXT, Title, type Theme } from '../components.tsx';
import type { Format } from '../render.ts';

export interface FixtureItem {
  match: Match;
  /** Our team, e.g. "G13-2". */
  label: string;
  opponentClub: string;
  home: boolean;
}

export type FixtureLine = { kind: 'day'; day: string } | { kind: 'match'; item: FixtureItem };

const ROW = 70;
const DAY = 52;
const GAP = 8;
/** Pixel budget for the list per format; overflow continues on the next carousel image. */
export const FIXTURE_AREA: Record<Format, number> = { feed: 820, story: 1000 };

/** Split fixtures (sorted by kick-off) into pages, repeating the day header on a new page. */
export function paginateFixtures(items: FixtureItem[], format: Format): FixtureLine[][] {
  const pages: FixtureLine[][] = [];
  let page: FixtureLine[] = [];
  let used = 0;
  let lastDay = '';
  for (const item of items) {
    const day = item.match.start.slice(0, 10);
    const need = (day !== lastDay || page.length === 0 ? DAY + GAP : 0) + ROW + GAP;
    if (used + need > FIXTURE_AREA[format] && page.length > 0) {
      pages.push(page);
      page = [];
      used = 0;
    }
    if (day !== lastDay || page.length === 0) {
      page.push({ kind: 'day', day });
      used += DAY + GAP;
      lastDay = day;
    }
    page.push({ kind: 'match', item });
    used += ROW + GAP;
  }
  if (page.length) pages.push(page);
  return pages;
}

function DayHeader({ day, accent }: { day: string; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', height: DAY, gap: 14, borderBottom: '2px solid rgba(255,255,255,0.2)', paddingBottom: 6 }}>
      <div style={{ width: 10, height: 30, backgroundColor: accent, marginBottom: 4 }} />
      <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 38, textTransform: 'uppercase' }}>{weekdayNameNo(day)}</span>
      <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 24, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>{`${Number(day.slice(8, 10))}. ${monthNameNo(day)}`}</span>
    </div>
  );
}

function FixtureRow({ item, primary }: { item: FixtureItem; primary: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: ROW, gap: 16, padding: '0 16px', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)' }}>
      <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 40, width: 96 }}>{item.match.start.slice(11, 16)}</span>
      <div style={{ display: 'flex', width: 132, height: 44, borderRadius: 8, backgroundColor: primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, textTransform: 'uppercase' }}>{item.label}</span>
      </div>
      <OpponentBadge club={item.opponentClub} size={46} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <span style={{ ...ellipsis, fontFamily: DISPLAY, fontWeight: 800, fontSize: 32, textTransform: 'uppercase', lineHeight: 1 }}>{item.opponentClub}</span>
        <span style={{ ...ellipsis, fontFamily: TEXT, fontSize: 18, color: 'rgba(255,255,255,0.6)' }}>{item.match.venue}</span>
      </div>
      <div style={{ display: 'flex', padding: '4px 12px', borderRadius: 8, border: '2px solid rgba(255,255,255,0.45)', backgroundColor: item.home ? 'rgba(255,255,255,0.9)' : 'transparent' }}>
        <span style={{ fontFamily: TEXT, fontWeight: 800, fontSize: 18, letterSpacing: 1, color: item.home ? '#0f172a' : 'white' }}>{item.home ? 'HJEMME' : 'BORTE'}</span>
      </div>
    </div>
  );
}

export function Fixtures({ theme, format, range, lines, sponsors, page }: { theme: Theme; format: Format; range: DayRange; lines: FixtureLine[]; sponsors: SponsorSet; page: { index: number; count: number } }) {
  return (
    <PostLayout theme={theme} format={format} sponsors={sponsors} badge={page.count > 1 ? <PageBadge page={page} /> : undefined}>
      <Title lines={['Ukens kamper']} size={format === 'story' ? 150 : 116} subtitle={formatRangeNo(range)} accent={theme.palette.accent} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: GAP, marginTop: 24 }}>
        {lines.map((l) =>
          l.kind === 'day' ? <DayHeader key={`d${l.day}`} day={l.day} accent={theme.palette.accent} /> : <FixtureRow key={l.item.match.key} item={l.item} primary={theme.palette.primary} />,
        )}
      </div>
    </PostLayout>
  );
}
