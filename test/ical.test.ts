import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseIcal } from '../src/data/ical.ts';
import { eventToMatch, splitPair, type Match } from '../src/data/match.ts';
import { classify, hasPublicResults, initials, splitClubAndLabel, teamInfo } from '../src/data/teams.ts';

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8');

/** Build a VEVENT the way the club feed does, folded at 75 octets. */
function vevent(summary: string, pair: string, opts: { start?: string; league?: string; url?: string } = {}): string {
  const league = opts.league ?? 'G16 4. div. avd. 01 (runde 20)';
  const desc = `${league}\\n\\n${pair}\\nHaslum kunstgress 2 søndag 18.10.26 17:00\\n\\nwww.fotball.no`;
  const fold = (line: string) => line.match(/.{1,74}/g)!.join('\r\n ');
  return [
    'BEGIN:VEVENT',
    fold(`DESCRIPTION:${desc}`),
    `DTSTART;TZID=Europe/Oslo:${opts.start ?? '20261018T170000'}`,
    'LOCATION:Haslum kunstgress 2',
    fold(`SUMMARY:${summary}`),
    'UID:test',
    ...(opts.url ? [`URL:${opts.url}`] : []),
    'END:VEVENT',
  ].join('\r\n');
}

function parseOne(ev: string): Match {
  const cal = parseIcal(`BEGIN:VCALENDAR\r\nX-WR-CALNAME:Test\r\n${ev}\r\nEND:VCALENDAR\r\n`);
  assert.equal(cal.events.length, 1);
  const m = eventToMatch(cal.events[0], 'Haslum');
  assert.ok(m);
  return m;
}

test('played match: score is read from SUMMARY, teams from DESCRIPTION', () => {
  const m = parseOne(vevent('Korsvoll G16-1 - Haslum G16-1 2 - 2', 'Korsvoll G16-1 - Haslum G16-1'));
  assert.equal(m.home, 'Korsvoll G16-1');
  assert.equal(m.away, 'Haslum G16-1');
  assert.deepEqual(m.score, { home: 2, away: 2 });
  assert.equal(m.start, '2026-10-18T17:00');
  assert.equal(m.league, 'G16 4. div. avd. 01');
  assert.equal(m.round, 20);
});

test('upcoming match in club feed ends with a lone dash and has no score', () => {
  const m = parseOne(vevent('Haslum G16-2 - Stabæk G16-4 -', 'Haslum G16-2 - Stabæk G16-4'));
  assert.equal(m.away, 'Stabæk G16-4');
  assert.equal(m.score, null);
});

test('league feed format has no suffix at all and carries the match fiksId', () => {
  const m = parseOne(vevent('Røa G14-3 - Haslum G14-2', 'Røa G14-3 - Haslum G14-2', { url: 'https://www.fotball.no/fotballdata/kamp/?fiksId=9027764' }));
  assert.equal(m.score, null);
  assert.equal(m.fiksId, 9027764);
});

test('senior names with spaces and letters: "Menn Senior C"', () => {
  const m = parseOne(vevent('Korsvoll Menn Senior C - Haslum Menn 2 2 - 7', 'Korsvoll Menn Senior C - Haslum Menn 2', { league: '8. div. menn avd. 02 (runde 18)' }));
  assert.equal(m.home, 'Korsvoll Menn Senior C');
  assert.equal(m.away, 'Haslum Menn 2');
  assert.deepEqual(m.score, { home: 2, away: 7 });
});

test('team names ending in numbers do not leak into the score', () => {
  // "Frisk Asker G9 2 3 - 1": the team is "Frisk Asker G9 2", the score is 3-1.
  const m = parseOne(vevent('Haslum G9 2 - Frisk Asker G9 2 3 - 1', 'Haslum G9 2 - Frisk Asker G9 2'));
  assert.equal(m.home, 'Haslum G9 2');
  assert.equal(m.away, 'Frisk Asker G9 2');
  assert.deepEqual(m.score, { home: 3, away: 1 });
});

test('double spaces in names are normalised and double-digit scores work', () => {
  const m = parseOne(vevent('Haslum G16-2 - Stabæk  G16-4 10 - 2', 'Haslum G16-2 - Stabæk  G16-4'));
  assert.equal(m.away, 'Stabæk G16-4');
  assert.deepEqual(m.score, { home: 10, away: 2 });
});

test('club names with dashes and digits ("Frem-31") survive', () => {
  const m = parseOne(vevent('Haslum J8 3 - Frem-31  J8 Gaupene -', 'Haslum J8 3 - Frem-31  J8 Gaupene'));
  assert.equal(m.away, 'Frem-31 J8 Gaupene');
  assert.equal(splitClubAndLabel(m.away).club, 'Frem-31');
});

test('falls back to SUMMARY when DESCRIPTION is missing', () => {
  const ev = 'BEGIN:VEVENT\r\nDTSTART;TZID=Europe/Oslo:20261018T200000\r\nSUMMARY:Haslum G15-1 - Holmlia  G15-1 2 - 1\r\nEND:VEVENT';
  const m = parseOne(ev);
  assert.equal(m.home, 'Haslum G15-1');
  assert.equal(m.away, 'Holmlia G15-1');
  assert.deepEqual(m.score, { home: 2, away: 1 });
});

test('splitPair prefers the split with the club team when a name contains " - "', () => {
  assert.deepEqual(splitPair('Lyn - Oslo G16 - Haslum G16-1', 'Haslum'), ['Lyn - Oslo G16', 'Haslum G16-1']);
  assert.deepEqual(splitPair('KFUM G13-2 - Haslum G13-2', 'Haslum'), ['KFUM G13-2', 'Haslum G13-2']);
  assert.equal(splitPair('no separator here'), null);
});

test('same match gets the same key whatever the feed or kick-off time', () => {
  const a = parseOne(vevent('Haslum G16-2 - Stabæk G16-4 -', 'Haslum G16-2 - Stabæk G16-4', { start: '20261019T203000' }));
  const b = parseOne(vevent('Haslum G16-2 - Stabæk  G16-4', 'Haslum G16-2 - Stabæk  G16-4', { start: '20261019T190000' }));
  assert.equal(a.key, b.key);
});

test('team classification', () => {
  assert.deepEqual(classify('G13-2'), { gender: 'boys', age: 13, category: 'youth' });
  assert.deepEqual(classify('G9 2'), { gender: 'boys', age: 9, category: 'child' });
  assert.deepEqual(classify('J17-1'), { gender: 'girls', age: 17, category: 'youth' });
  assert.deepEqual(classify('Menn 2'), { gender: 'men', age: null, category: 'senior' });
  assert.deepEqual(classify('M 55'), { gender: 'men', age: null, category: 'veteran' });
  assert.deepEqual(classify('A', '4. div. menn avd. 01'), { gender: 'men', age: null, category: 'senior' });
  assert.equal(classify('United', 'G09 år avd. 10').age, 9);
  assert.ok(hasPublicResults(teamInfo('Haslum G13-2')));
  assert.ok(hasPublicResults(teamInfo('Haslum Menn 1')));
  assert.ok(!hasPublicResults(teamInfo('Haslum G12 1')));
});

test('club/label split and badge initials', () => {
  assert.deepEqual(splitClubAndLabel('Øvrevoll Hosle G11 Grav 1'), { club: 'Øvrevoll Hosle', label: 'G11 Grav 1' });
  assert.deepEqual(splitClubAndLabel('Korsvoll Menn Senior C'), { club: 'Korsvoll', label: 'Menn Senior C' });
  assert.deepEqual(splitClubAndLabel('Holmlia A'), { club: 'Holmlia', label: 'A' });
  assert.deepEqual(splitClubAndLabel('Haslum  M 55'), { club: 'Haslum', label: 'M 55' });
  assert.equal(splitClubAndLabel('Stovner SK G19-2').club, 'Stovner SK');
  assert.equal(initials('KFUM'), 'KFUM');
  assert.equal(initials('Øvrevoll Hosle'), 'ØH');
  assert.equal(initials('Holmlia'), 'HOL');
  assert.equal(initials('Frem-31'), 'FRE');
  assert.equal(initials('Bærum SK'), 'BSK');
  assert.equal(initials('Frigg Oslo FK'), 'FOF');
});

test('real Haslum club feed (snapshot 2026-10-20)', () => {
  const cal = parseIcal(fixture('club-92-real.ics'));
  assert.equal(cal.name, 'Alle kamper i Haslum 2');
  const matches = cal.events.map((e) => eventToMatch(e, 'Haslum'));
  assert.equal(matches.length, 107);
  assert.ok(matches.every((m) => m && (m.home.startsWith('Haslum ') || m.away.startsWith('Haslum '))));
  const played = matches.filter((m) => m!.score);
  assert.deepEqual(
    played.map((m) => `${m!.home} ${m!.score!.home}-${m!.score!.away} ${m!.away}`),
    [
      'KFUM G13-2 2-9 Haslum G13-2',
      'Korsvoll Menn Senior C 2-7 Haslum Menn 2',
      'Haslum G15-1 2-1 Holmlia G15-1',
      'Haslum G19-3 2-2 Bærum G19-3',
      'Haslum G16-2 10-2 Stabæk G16-4',
    ],
  );
});
