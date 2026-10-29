import type { Match } from '../../data/match.ts';
import type { TeamInfo } from '../../data/teams.ts';
import type { SponsorSet } from '../../sponsors.ts';
import { Crest, DISPLAY, ellipsis, ownTeamName, Pill, PostLayout, SponsorLogo, TEXT, type Theme } from '../components.tsx';
import type { Format } from '../render.ts';
import { dateLongNo } from './teamResult.tsx';

export function MatchDay({ theme, format, match, own, opponent, home, sponsors }: { theme: Theme; format: Format; match: Match; own: TeamInfo; opponent: TeamInfo; home: boolean; sponsors: SponsorSet }) {
  const story = format === 'story';
  const crest = story ? 220 : 170;
  const sides = [
    { name: ownTeamName(theme, own.label), club: own.club, own: true },
    { name: opponent.club, club: opponent.club, own: false },
  ];
  const [left, right] = home ? sides : [sides[1], sides[0]];
  return (
    <PostLayout theme={theme} format={format} sponsors={sponsors} badge={<Pill text={own.label} color={theme.palette.primary} size={story ? 44 : 38} />}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', alignItems: 'center', gap: story ? 48 : 26 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: story ? 230 : 190, lineHeight: 0.88, textTransform: 'uppercase' }}>Kampdag</span>
          <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 26, letterSpacing: 4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>
            {match.league}{match.round ? ` · runde ${match.round}` : ''}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: story ? 40 : 30 }}>
          {[left, right].map((s, i) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: story ? 40 : 30 }}>
              {i === 1 && <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: story ? 90 : 72, color: theme.palette.accent }}>VS</span>}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: crest * 1.5 }}>
                <Crest theme={theme} club={s.club} own={s.own} size={crest} />
                <span style={{ ...ellipsis, fontFamily: DISPLAY, fontWeight: 800, fontSize: crest * 0.22, textTransform: 'uppercase', maxWidth: crest * 1.5, textAlign: 'center' }}>{s.name}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: story ? 150 : 120, lineHeight: 0.95 }}>{match.start.slice(11, 16)}</span>
          <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 32 }}>{dateLongNo(match.start)}</span>
          <span style={{ fontFamily: TEXT, fontSize: 26, color: 'rgba(255,255,255,0.75)' }}>{match.venue}</span>
        </div>

        {sponsors.match && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 18, padding: '14px 26px' }}>
            <span style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 18, letterSpacing: 2, color: '#6b7280', textTransform: 'uppercase' }}>Kampsponsor</span>
            <SponsorLogo sponsor={sponsors.match} height={story ? 70 : 56} />
          </div>
        )}
      </div>
    </PostLayout>
  );
}
