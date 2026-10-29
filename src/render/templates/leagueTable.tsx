import { splitClubAndLabel } from '../../data/teams.ts';
import type { TableRow } from '../../posts/table.ts';
import type { SponsorSet } from '../../sponsors.ts';
import { Crest, DemoStamp, DISPLAY, ellipsis, PostLayout, TEXT, Title, type Theme } from '../components.tsx';
import type { Format } from '../render.ts';

const COLS = [
  { key: 'played', label: 'K', width: 56 },
  { key: 'won', label: 'S', width: 52 },
  { key: 'drawn', label: 'U', width: 52 },
  { key: 'lost', label: 'T', width: 52 },
  { key: 'goals', label: 'Mål', width: 104 },
  { key: 'points', label: 'P', width: 70 },
] as const;

function cell(r: TableRow, key: (typeof COLS)[number]['key']): string {
  return key === 'goals' ? `${r.goalsFor}-${r.goalsAgainst}` : String(r[key]);
}

export function LeagueTable({ theme, format, league, rows, ownPrefix, note, demo, sponsors }: {
  theme: Theme; format: Format; league: string; rows: TableRow[]; ownPrefix: string; note: string; demo: boolean; sponsors: SponsorSet;
}) {
  const story = format === 'story';
  const area = story ? 1000 : 760;
  const rowH = Math.min(story ? 78 : 64, Math.floor(area / (rows.length + 1)) - 4);
  const fs = rowH * 0.5;
  return (
    <PostLayout theme={theme} format={format} sponsors={sponsors}>
      {demo && <DemoStamp width={1080} height={story ? 1920 : 1350} />}
      <Title lines={['Tabell']} size={story ? 150 : 116} subtitle={league} accent={theme.palette.accent} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 4, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: rowH * 0.7, padding: '0 18px', gap: 12 }}>
          <span style={{ width: 44 }} />
          <span style={{ flex: 1, fontFamily: TEXT, fontWeight: 600, fontSize: fs * 0.7, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 2 }}>Lag</span>
          {COLS.map((c) => (
            <span key={c.key} style={{ width: c.width, textAlign: 'center', fontFamily: TEXT, fontWeight: 600, fontSize: fs * 0.7, color: 'rgba(255,255,255,0.6)' }}>{c.label}</span>
          ))}
        </div>
        {rows.map((r) => {
          const own = r.team.toLowerCase().startsWith(`${ownPrefix.toLowerCase()} `);
          const { club, label } = splitClubAndLabel(r.team);
          return (
            <div key={r.team} style={{ display: 'flex', alignItems: 'center', height: rowH, padding: '0 18px', gap: 12, borderRadius: 12, backgroundColor: own ? theme.palette.primary : 'rgba(255,255,255,0.07)', border: own ? '2px solid rgba(255,255,255,0.8)' : '2px solid transparent' }}>
              <span style={{ width: 44, fontFamily: DISPLAY, fontWeight: 800, fontSize: fs * 1.1, textAlign: 'center' }}>{r.position}</span>
              <Crest theme={theme} club={club} own={own} size={rowH * 0.72} />
              <div style={{ display: 'flex', flex: 1, minWidth: 0, alignItems: 'baseline', gap: 10 }}>
                <span style={{ ...ellipsis, fontFamily: DISPLAY, fontWeight: 800, fontSize: fs * 1.05, textTransform: 'uppercase' }}>{club}</span>
                <span style={{ fontFamily: TEXT, fontSize: fs * 0.6, color: 'rgba(255,255,255,0.7)' }}>{label}</span>
              </div>
              {COLS.map((c) => (
                <span key={c.key} style={{ width: c.width, textAlign: 'center', fontFamily: c.key === 'points' ? DISPLAY : TEXT, fontWeight: c.key === 'points' ? 800 : 400, fontSize: c.key === 'points' ? fs * 1.1 : fs * 0.78 }}>
                  {cell(r, c.key)}
                </span>
              ))}
            </div>
          );
        })}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
          <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 20, letterSpacing: 1, color: demo ? '#fcd34d' : 'rgba(255,255,255,0.65)' }}>{note}</span>
        </div>
      </div>
    </PostLayout>
  );
}
