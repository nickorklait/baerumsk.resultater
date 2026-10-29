import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, loadSponsors, paths } from '../config.ts';
import { createAdapter } from '../data/adapter.ts';
import { buildPalette } from '../render/colors.ts';
import { buildSite } from './build.ts';

/** Rewrite the gallery pages from the posts.json files on disk (e.g. after publishing), without re-rendering images. */
export function rebuildGallery(): void {
  const config = loadConfig();
  const logoFile = path.join(paths.logos, `${config.club.fiksId}.jpg`);
  const logo = fs.existsSync(logoFile) ? fs.readFileSync(logoFile) : null;
  buildSite(config, buildPalette(config, logo), loadSponsors(config), logo, createAdapter(config).clubMatches());
}
