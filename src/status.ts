import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.ts';

/** Outcome of the last fetch / generate / publish, shown on the dashboard. Committed in the cloud. */
export interface Status {
  fetch?: { at: string; reports: { source: string; status: string; detail: string }[] };
  generate?: { at: string; weeks: { key: string; posts: number; images: number }[] };
  publish?: { at: string; paused: boolean; published: string[]; failed: { key: string; error: string }[]; waiting: number };
}

const FILE = path.join(ROOT, 'data', 'status.json');

export function readStatus(): Status {
  return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
}

export function updateStatus<K extends keyof Status>(section: K, data: Omit<NonNullable<Status[K]>, 'at'>): void {
  const s = readStatus();
  s[section] = { at: new Date().toISOString(), ...data } as Status[K];
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2) + '\n');
}
