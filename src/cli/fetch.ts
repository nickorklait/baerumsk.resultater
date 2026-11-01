// npm run fetch [-- --force]
// Polls the fotball.no calendar feeds (rate-limited) and stores a snapshot. Schedule this 3x a day.

import { loadConfig } from '../config.ts';
import { createAdapter } from '../data/adapter.ts';
import { readFetchState } from '../data/calendarFeedAdapter.ts';
import { updateStatus } from '../status.ts';

const config = loadConfig();
const adapter = createAdapter(config);
const reports = await adapter.refresh({ force: process.argv.includes('--force') });
updateStatus('fetch', { reports });
for (const r of reports) console.log(`${r.status.padEnd(8)} ${r.source.padEnd(20)} ${r.detail}`);

const matches = adapter.clubMatches();
console.log(`\n${matches.length} known club matches, ${matches.filter((m) => m.score).length} with results.`);
// fotball.no now and then refuses a request from GitHub's servers (HTTP 403), and the next run usually gets
// through. So the run only fails when a feed has not been fetched for a whole day.
const last = readFetchState();
const failed = reports.filter((r) => r.status === 'failed');
const stale = failed.filter((r) => !(Date.now() - Date.parse(last[r.source] ?? '') < 24 * 3.6e6));
if (stale.length) process.exitCode = 1;
else if (failed.length) console.warn('Refused this time, but fetched within the last 24 hours: the run goes on with the stored data.');
