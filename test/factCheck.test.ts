import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factCheck, type FactCheckContext } from '../src/captions/factCheck.ts';
import type { CaptionFacts } from '../src/captions/facts.ts';

const ctx: FactCheckContext = {
  knownClubs: ['Haslum', 'KFUM', 'Korsvoll', 'Holmlia', 'Bærum', 'Stabæk', 'Øvrevoll Hosle'],
  allowedWords: ['Haslum', 'IL', 'Bærum', 'Menn', 'Mandag', 'Søndag', 'Oktober', 'Bølgetopp', 'Energi'],
  placeNames: ['Bærum'],
};

// Real data: KFUM G13-2 2-9 Haslum G13-2
const facts: CaptionFacts = {
  headline: 'Resultat for Haslum G13-2.',
  lines: [],
  teamLabels: ['G13-2'],
  clubs: ['Haslum', 'KFUM'],
  scores: [[2, 9]],
  sponsorNames: ['Mjølkevei Bakeri'],
  places: ['Ekeberg kunstgress 9er A', 'G13 2. div. høst avd. 01'],
};

const ok = (caption: string) => assert.deepEqual(factCheck(caption, facts, ctx), { ok: true, problems: [] }, caption);
const fails = (caption: string, problem: RegExp) => {
  const r = factCheck(caption, facts, ctx);
  assert.equal(r.ok, false, caption);
  assert.ok(r.problems.some((p) => problem.test(p)), `${caption} -> ${r.problems.join('; ')}`);
};

test('accepts captions that only use facts from the post', () => {
  ok('SEIER! 💪 G13-2 vant 9–2 borte mot KFUM.\nG13 2. div. høst avd. 01, runde 8.\nLaget støttes av Mjølkevei Bakeri. 💚\n\n#haslumil #haslumfotball');
  ok('For en kamp på Ekeberg! KFUM – Haslum 2-9 🔥 #haslumil');
  ok('Søndag 18. oktober kl. 17:00 vant guttene 9 – 2.'); // time and score both fine
  ok('Laget fra Bærum tok tre poeng!'); // place name, not the Bærum team
});

test('rejects scores that are not in the data', () => {
  fails('G13-2 vant 3–1 mot KFUM!', /score "3–1"/);
  fails('Seier 9-1 til G13-2!', /score/);
});

test('rejects other teams and clubs from the data', () => {
  fails('G13-1 vant 9–2 mot KFUM.', /team "G13-1"/);
  fails('Neste helg venter Stabæk!', /club "Stabæk"/);
  fails('Neste kamp er mot Bærum G13-1.', /Bærum|G13-1/);
});

test('rejects unknown names (player names, invented facts)', () => {
  fails('G13-2 vant 9–2. Hat-trick av Ola Nordmann!', /unknown name "Ola"/);
  fails('Stor innsats av keeper Emma i dag.', /unknown name "Emma"/);
});

test('does not mistake team labels or date ranges for scores', () => {
  ok('Kamper 20.–26. oktober for G13-2.');
  ok('Uke 20–26. oktober: G13-2 spilte 9–2.');
});

test('joint teams written with a slash ("KIL/Hemne") are known names', () => {
  assert.deepEqual(factCheck('Ukens kamper: Haslum G13-2 møter KIL/Hemne på søndag. Heia Haslum!', { ...facts, clubs: ['Haslum', 'KIL/Hemne'] }, ctx).problems, []);
});
