// npm run autopilot
// What the scheduled task runs: poll the feeds, rebuild the latest week, then publish whatever is due.
// With "publish.enabled": false the last step is a dry run, so the gallery stays fresh without posting.

import { spawnSync } from 'node:child_process';

function run(script: string, ...args: string[]): boolean {
  console.log(`\n== npm run ${script} ${args.join(' ')}`.trimEnd());
  const r = spawnSync('npm', ['run', script, ...(args.length ? ['--', ...args] : [])], { stdio: 'inherit', shell: true });
  return r.status === 0;
}

const fetched = run('fetch');
// Generate even if a fetch failed: the stored snapshots are still valid.
const generated = run('generate', '--offline', '--with-previous');
const published = generated ? run('publish') : false;
// Statistics are nice to have: a failure here must not mark the run as failed.
if (published) run('insights');
if (!fetched || !generated || !published) process.exitCode = 1;
