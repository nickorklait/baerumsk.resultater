// Team-name handling. The feeds only give free-text names such as
// "Haslum G13-2", "Korsvoll Menn Senior C", "Haslum  M 55" or "Øvrevoll Hosle G11 Grav 1".

export type TeamCategory = 'child' | 'youth' | 'senior' | 'veteran';

export interface TeamInfo {
  /** Whitespace-normalised full name, e.g. "Haslum G13-2". */
  name: string;
  /** Club part, e.g. "Øvrevoll Hosle". */
  club: string;
  /** Team part without the club, e.g. "G13-2", "Menn 1". Empty if none. */
  label: string;
  gender: 'boys' | 'girls' | 'men' | 'women' | null;
  age: number | null;
  category: TeamCategory | null;
}

export function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

// First token that starts the team designation after the club name.
const DESIGNATION_START = /^(?:[GJ]\d{1,2}(?:-\d+)?|Menn|Kvinner|Herrer|Damer|Senior|Gutter|Jenter|M|K|Old|[A-F]|\d{1,2})$/i;

export function splitClubAndLabel(fullName: string): { club: string; label: string } {
  const tokens = normalizeName(fullName).split(' ');
  // Never treat the first token as the designation: "Frem-31" and "KFUM" are clubs.
  for (let i = 1; i < tokens.length; i++) {
    if (DESIGNATION_START.test(tokens[i])) {
      return { club: tokens.slice(0, i).join(' '), label: tokens.slice(i).join(' ') };
    }
  }
  return { club: tokens.join(' '), label: '' };
}

/** Age/gender from a team label, falling back to the league name ("G09 år", "8. div. menn", "M55"). */
export function classify(label: string, league = ''): Pick<TeamInfo, 'gender' | 'age' | 'category'> {
  const youth = label.match(/^([GJ])(\d{1,2})\b/i) ?? league.match(/^(?:Futsal )?([GJ])0?(\d{1,2})\b/i);
  if (youth) {
    const age = Number(youth[2]);
    return {
      gender: youth[1].toUpperCase() === 'G' ? 'boys' : 'girls',
      age,
      category: age <= 12 ? 'child' : 'youth',
    };
  }
  const veteran = label.match(/^([MK])\s?(\d{2})$/i) ?? league.match(/^([MK])\s?(\d{2})\b/);
  if (veteran) {
    return { gender: veteran[1].toUpperCase() === 'M' ? 'men' : 'women', age: null, category: 'veteran' };
  }
  if (/\b(menn|herrer)\b/i.test(label) || /\bmenn\b/i.test(league)) return { gender: 'men', age: null, category: 'senior' };
  if (/\b(kvinner|damer)\b/i.test(label) || /\bkvinner\b/i.test(league)) return { gender: 'women', age: null, category: 'senior' };
  return { gender: null, age: null, category: null };
}

export function teamInfo(fullName: string, league = ''): TeamInfo {
  const name = normalizeName(fullName);
  const { club, label } = splitClubAndLabel(name);
  return { name, club, label, ...classify(label, league) };
}

/** Results are published from this age (13+), and always for senior and veteran teams. */
export function hasPublicResults(team: TeamInfo, minAge = 13): boolean {
  if (team.category === 'senior' || team.category === 'veteran') return true;
  return team.age !== null && team.age >= minAge;
}

/** Badge initials: "KFUM" -> "KFUM", "Øvrevoll Hosle" -> "ØH", "Holmlia" -> "HOL", "Bærum SK" -> "BSK". */
export function initials(club: string): string {
  const words = normalizeName(club).split(' ').filter(Boolean);
  if (words.length === 1) {
    const w = words[0];
    if (w.length <= 4 && w === w.toUpperCase()) return w;
    return w.replace(/[^\p{L}]/gu, '').slice(0, 3).toUpperCase();
  }
  // A short abbreviation in capitals keeps all its letters ("SK", "IL", "FK").
  return words.map((w) => (w.length <= 3 && w === w.toUpperCase() && w !== w.toLowerCase() ? w : w[0])).join('').slice(0, 3).toUpperCase();
}
