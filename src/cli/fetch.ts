// npm run fetch [-- --force]
// Polls the fotball.no calendar feeds (rate-limited) and stores a snapshot. Schedule this 3x a day.

import { loadConfig } from '../config.ts';
import { createAdapter } from '../data/adapter.ts';
import { updateStatus } from '../status.ts';

const config = loadConfig();
const adapter = createAdapter(config);
const reports = await adapter.refresh({ force: process.argv.includes('--force') });
updateStatus('fetch', { reports });
for (const r of reports) console.log(`${r.status.padEnd(8)} ${r.source.padEnd(20)} ${r.detail}`);

const matches = adapter.clubMatches();
console.log(`\n${matches.length} known club matches, ${matches.filter((m) => m.score).length} with results.`);
if (reports.some((r) => r.status === 'failed')) process.exitCode = 1;
