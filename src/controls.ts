import fs from 'node:fs';
import path from 'node:path';
import type { ClubConfig } from './config.ts';
import { describeAction, type ControlAction, type DashboardSettings } from './controlsSchema.ts';

/** Everything the club changes from the dashboard. Stored in config/controls.json (committed). */
export interface Controls {
  paused: boolean;
  /** Publication keys that must not be published. */
  skip: string[];
  /** Edited captions by publication key (feed). */
  captions: Record<string, string>;
  settings: DashboardSettings;
  /** Newest first. */
  log: { at: string; by: string; action: string }[];
}

const MAX_LOG = 200;
export const EMPTY_CONTROLS: Controls = { paused: false, skip: [], captions: {}, settings: {}, log: [] };

export function controlsFile(root: string): string {
  return path.join(root, 'config', 'controls.json');
}

export function readControls(root: string): Controls {
  const file = controlsFile(root);
  return fs.existsSync(file) ? { ...EMPTY_CONTROLS, ...JSON.parse(fs.readFileSync(file, 'utf8')) } : structuredClone(EMPTY_CONTROLS);
}

export function writeControls(root: string, c: Controls): void {
  fs.writeFileSync(controlsFile(root), JSON.stringify(c, null, 2) + '\n');
}

/** Apply one dashboard action. Pure: returns new controls. */
export function applyAction(c: Controls, a: ControlAction, by: string, at = new Date().toISOString()): Controls {
  const next: Controls = structuredClone(c);
  switch (a.type) {
    case 'pause':
      next.paused = true;
      break;
    case 'resume':
      next.paused = false;
      break;
    case 'skip':
      if (!next.skip.includes(a.key)) next.skip.push(a.key);
      break;
    case 'unskip':
      next.skip = next.skip.filter((k) => k !== a.key);
      break;
    case 'caption':
      if (a.text === null) delete next.captions[a.key];
      else next.captions[a.key] = a.text;
      break;
    case 'settings':
      next.settings = { ...next.settings, ...a.settings, times: { ...next.settings.times, ...a.settings.times } };
      break;
    case 'publish-now':
      break; // only logged; the caller publishes
  }
  next.log = [{ at, by, action: describeAction(a) }, ...next.log].slice(0, MAX_LOG);
  return next;
}

/** club.json with the dashboard settings on top. */
export function applySettings(config: ClubConfig, s: DashboardSettings): ClubConfig {
  const c: ClubConfig = structuredClone(config);
  if (s.perResult !== undefined) c.publish.schedule.perResult.enabled = s.perResult;
  if (s.includeChildrenInFixtures !== undefined) c.posts.includeChildrenInFixtures = s.includeChildrenInFixtures;
  if (s.matchDayTeams !== undefined) c.posts.matchDayTeams = s.matchDayTeams;
  if (s.excludedTeams !== undefined) c.posts.excludedTeams = s.excludedTeams;
  if (s.stories !== undefined) c.publish.instagram.stories = s.stories;
  if (s.times?.results) c.publish.schedule.results.time = s.times.results;
  if (s.times?.fixtures) c.publish.schedule.fixtures.time = s.times.fixtures;
  if (s.times?.matchDay) c.publish.schedule.matchDay.time = s.times.matchDay;
  return c;
}
