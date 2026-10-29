// Several tests use Haslum's real feed (fixtures/club-92-real.ics), so they run with Haslum's club settings,
// whichever club this copy of the project is set up for.
import { loadJson, type ClubConfig } from '../src/config.ts';

export function haslumConfig(): ClubConfig {
  const c = loadJson<ClubConfig>('club.json');
  return { ...c, club: { ...c.club, name: 'Haslum IL', shortName: 'Haslum', fiksId: 92, teamPrefix: 'Haslum' } };
}
