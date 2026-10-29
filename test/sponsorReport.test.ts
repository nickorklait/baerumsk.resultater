import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SponsorConfig } from '../src/config.ts';
import { isoWeek, monthOf, monthReport, reportItems } from '../src/gallery/sponsorReport.ts';
import type { PublicationUnit } from '../src/publish/plan.ts';
import type { PublishedEntry } from '../src/publish/state.ts';

const sc: SponsorConfig = {
  kind: 'placeholder', approvedForPublishing: true, partnersPerPost: 1, matchSponsorOfTheWeek: {},
  labels: { main: 'Hovedsponsor', team: 'Lagsponsor', match: 'Kampsponsor', partner: 'Partner' },
  sponsors: [
    { id: 'main', name: 'Din sponsor her', role: 'main' },
    { id: 'p1', name: 'Sponsor', role: 'partner' },
    { id: 'p2', name: 'Sponsor', role: 'partner' },
  ],
};

const entry = (publishedAt: string, kind: 'feed' | 'story', extra: Partial<PublishedEntry> = {}): PublishedEntry => ({ publishedAt, kind, mediaIds: ['m'], permalink: kind === 'feed' ? 'https://instagram.com/p/x' : null, ...extra });

test('Oslo month and ISO week', () => {
  assert.equal(monthOf('2026-10-31T23:30:00Z'), '2026-11'); // 00:30 in Oslo on 1 November
  assert.equal(isoWeek('2026-10-21'), 43);
  assert.equal(isoWeek('2027-01-01'), 53);
});

test('monthly report counts real publications per sponsor, with fallbacks for older entries', () => {
  const units = new Map<string, PublicationUnit>([
    ['w/a-feed', { key: 'w/a-feed', week: '2026-10-18', label: 'A', kind: 'feed', images: ['a1.png', 'a2.png', 'a3.png'], caption: '', altText: '', publishAt: '', expiresAt: '', postIds: [], teams: ['Haslum G13-2', 'Haslum Menn 1'], sponsors: ['main', 'p1'] }],
  ]);
  const published = {
    'w/a-feed': entry('2026-10-20T08:00:00Z', 'feed'), // old entry: data from the planned unit
    'w/a-story': entry('2026-10-20T08:01:00Z', 'story'), // old entry, no unit: main sponsor only
    'w/b-feed': entry('2026-10-28T10:00:00Z', 'feed', { sponsors: ['main', 'p2'], teams: ['Haslum G16-2'], images: 1, label: 'B' }),
    'w/c-feed': entry('2026-11-02T10:00:00Z', 'feed', { sponsors: ['main', 'p1'], images: 1 }),
  };
  const items = reportItems(published, units, sc);
  const r = monthReport(items, '2026-10', sc);
  assert.deepEqual([r.feedPosts, r.stories, r.images, r.teams], [2, 1, 5, 3]);
  const by = Object.fromEntries(r.perSponsor.map((p) => [p.sponsor.id, [p.feedPosts, p.stories, p.images]]));
  assert.deepEqual(by, { main: [2, 1, 5], p1: [1, 0, 3], p2: [1, 0, 1] });
  assert.deepEqual(r.perWeek, [{ week: 43, feedPosts: 1, stories: 1 }, { week: 44, feedPosts: 1, stories: 0 }]);
  assert.equal(monthReport(items, '2026-11', sc).feedPosts, 1);
});
