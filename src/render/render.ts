import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import satori, { type Font } from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { paths, type ClubConfig } from '../config.ts';

export const SIZES = {
  feed: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
} as const;
export type Format = keyof typeof SIZES;

let fonts: Font[] | null = null;

function loadFonts(): Font[] {
  const f = (file: string, name: string, weight: Font['weight']): Font => ({
    name,
    weight,
    style: 'normal',
    data: fs.readFileSync(path.join(paths.fonts, file)),
  });
  return (fonts ??= [
    f('BarlowCondensed-ExtraBold.ttf', 'Barlow Condensed', 800),
    f('Inter-Regular.ttf', 'Inter', 400),
    f('Inter-SemiBold.ttf', 'Inter', 600),
    f('Inter-ExtraBold.ttf', 'Inter', 800),
  ]);
}

export async function renderPng(node: ReactNode, size: { width: number; height: number }): Promise<Buffer> {
  const svg = await satori(node, { ...size, fonts: loadFonts() });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: size.width } }).render().asPng());
}

/** Club logo, cached locally after the first download. */
export async function loadClubLogo(config: ClubConfig): Promise<Buffer | null> {
  const file = path.join(paths.logos, `${config.club.fiksId}.jpg`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  try {
    const res = await fetch(config.club.logoUrl, { headers: { 'User-Agent': config.data.userAgent } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(paths.logos, { recursive: true });
    fs.writeFileSync(file, buf);
    return buf;
  } catch (err) {
    console.warn(`Could not download club logo (${(err as Error).message}); using initials badge.`);
    return null;
  }
}

export const dataUri = (buf: Buffer, mime: string) => `data:${mime};base64,${buf.toString('base64')}`;
