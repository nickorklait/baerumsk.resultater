import { monthNameNo, weekdayNameNo } from '../../dates.ts';
import type { ResultItem } from '../../posts/results.ts';
import type { SponsorSet } from '../../sponsors.ts';
import { Crest, DISPLAY, ellipsis, OutcomeChip, ownTeamName, Pill, PostLayout, TEXT, type Theme } from '../components.tsx';
import type { TeamForm } from '../../posts/form.ts';
import type { Format } from '../render.ts';

const HEADLINE = { win: 'Seier!', draw: 'Uavgjort', loss: 'Fulltid' } as const;
const HEADLINE_COLOR = { win: '#4ade80', draw: '#fcd34d', loss: 'white' } as const;

export function dateLongNo(start: string): string {
  const day = start.slice(0, 10);
  const text = `${weekdayNameNo(day)} ${Number(day.slice(8, 10))}. ${monthNameNo(day)}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Side({ theme, name, club, own, size }: { theme: Theme; name: string; club: string; own: boolean; size: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: size * 1.45, gap: size * 0.12 }}>
      <Crest theme={theme} club={club} own={own} size={size} />
      <span style={{ ...ellipsis, fontFamily: DISPLAY, fontWeight: 800, fontSize: size * 0.24, textTransform: 'uppercase', color: own ? 'white' : 'rgba(255,255,255,0.85)', maxWidth: size * 1.45, textAlign: 'center' }}>
        {name}
      </span>
    </div>
  );
}

/** "FORM" + the last results as S/U/T chips (newest last, outlined) and the streak sentence. */
function FormRow({ form, story }: { form: TeamForm; story: boolean }) {
  const size = story ? 44 : 38;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 20, letterSpacing: 3, color: 'rgba(255,255,255,0.7)', marginRight: 6 }}>FORM</span>
        {form.outcomes.map((o, i) => (
          <div key={i} style={{ display: 'flex', borderRadius: size * 0.32, border: i === form.outcomes.length - 1 ? '3px solid white' : '3px solid transparent' }}>
            <OutcomeChip outcome={o} size={size} />
          </div>
        ))}
      </div>
      {form.streak && <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: story ? 30 : 26, color: 'white' }}>{form.streak}</span>}
    </div>
  );
}

export function TeamResult({ theme, format, item, sponsors, form }: { theme: Theme; format: Format; item: ResultItem; sponsors: SponsorSet; form?: TeamForm }) {
  const story = format === 'story';
  const crest = story ? 240 : 210;
  const s = item.match.score!;
  const homeOwn = item.side !== 'away';
  const awayOwn = item.side !== 'home';
  const homeTeam = homeOwn ? item.own : item.opponent;
  const awayTeam = awayOwn && item.side !== 'both' ? item.own : item.opponent;
  // Our own team by the configured short name: the feed's club name can be too long ("Øvrevoll Hosle").
  const display = (t: typeof homeTeam, own: boolean) => (own ? ownTeamName(theme, t.label) : t.club);
  const headline = item.outcome ? HEADLINE[item.outcome] : 'Fulltid';
  const scoreText = `${s.home}–${s.away}`;
  // Shrink for double-digit scores so "10–2" stays on one line.
  const scoreSize = (story ? 170 : 140) * (scoreText.length <= 3 ? 1 : scoreText.length === 4 ? 0.78 : 0.64);
  return (
    <PostLayout theme={theme} format={format} sponsors={sponsors} badge={<Pill text={item.own.label} color={theme.palette.primary} size={story ? 44 : 38} />}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', alignItems: 'center', gap: story ? 56 : 34 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: story ? 200 : 170, lineHeight: 0.9, textTransform: 'uppercase', color: item.outcome ? HEADLINE_COLOR[item.outcome] : 'white' }}>
            {headline}
          </span>
          <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 26, letterSpacing: 4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', marginTop: 6 }}>
            {item.match.league}{item.match.round ? ` · runde ${item.match.round}` : ''}
          </span>
        </div>

        {form && form.outcomes.length >= 2 && <FormRow form={form} story={story} />}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: story ? 28 : 18 }}>
          <Side theme={theme} name={display(homeTeam, homeOwn)} club={homeTeam.club} own={homeOwn} size={crest} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', borderRadius: 24, padding: story ? '6px 34px' : '4px 28px', marginBottom: crest * 0.3 }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: scoreSize, lineHeight: 1.05, color: '#0f172a', whiteSpace: 'nowrap' }}>{scoreText}</span>
          </div>
          <Side theme={theme} name={display(awayTeam, awayOwn)} club={awayTeam.club} own={awayOwn} size={crest} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 30, color: 'white' }}>{dateLongNo(item.match.start)}</span>
          <span style={{ fontFamily: TEXT, fontSize: 26, color: 'rgba(255,255,255,0.7)' }}>{item.match.venue}</span>
        </div>
      </div>
    </PostLayout>
  );
}
