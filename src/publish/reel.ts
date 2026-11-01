// Reels reach people who do not follow the account yet, so each story set is also published as a short Reel
// (9:16). It goes to the Reels tab only, so the grid gets no duplicates. A still slideshow is skipped fast, so
// every image moves (a slow zoom), the images cross-fade, the first is short to start quickly, and the last
// seconds carry a "follow" line. ffmpeg comes from the ffmpeg-static package, so it works the same locally and
// on GitHub. The follow line is drawn as a picture (resvg) and laid over the video: the Linux build of
// ffmpeg-static has no text filter (drawtext).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import ffmpegPath from 'ffmpeg-static';

const FPS = 30;
/** Cross-fade between images, seconds. */
export const FADE = 0.4;
/** How far each image zooms in over its time on screen (1.06 = 6 %). */
const ZOOM = 0.06;
/** The follow line shows for the last seconds. */
const END_SECONDS = 2.5;

/** Seconds per image: one image 6 s; otherwise the first 2.5 s (start fast) and the rest 3 s each. */
export const durations = (images: number): number[] => (images === 1 ? [6] : Array.from({ length: images }, (_, i) => (i === 0 ? 2.5 : 3)));

/** The Reel's length: the images minus the overlaps of the cross-fades. */
export const reelSeconds = (images: number) => durations(images).reduce((s, d) => s + d, 0) - FADE * Math.max(0, images - 1);

export interface ReelOptions {
  /** A line shown over the last seconds, e.g. "Følg @trafikken.oslo for mer". */
  endText?: string;
  /** Folder with Inter-ExtraBold.ttf (for the end text). */
  fontDir?: string;
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The follow line as a transparent 1080×1920 PNG: white text on a dark box, 72 % down, shrunk to fit. */
export function endCard(text: string, fontDir: string, file: string): void {
  const font = { fontFiles: [path.join(fontDir, 'Inter-ExtraBold.ttf')], loadSystemFonts: false, defaultFontFamily: 'Inter' };
  const line = (size: number) => `<text x="540" y="1382" font-family="Inter" font-weight="800" font-size="${size}" fill="#fff" text-anchor="middle">${xml(text)}</text>`;
  const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">${body}</svg>`;
  let size = 56;
  let width = new Resvg(svg(line(size)), { font }).getBBox()?.width ?? text.length * size * 0.6;
  if (width > 940) {
    size = Math.floor((size * 940) / width);
    width = (width * size) / 56;
  }
  // The text's baseline is at y = 1382 (72 % of 1920); the box is centred on the letters.
  const box = `<rect x="${(540 - width / 2 - 30).toFixed(1)}" y="${(1382 - size * 0.73 - 30).toFixed(1)}" width="${(width + 60).toFixed(1)}" height="${(size * 0.73 + 60 + size * 0.2).toFixed(1)}" rx="18" fill="#000" fill-opacity="0.72"/>`;
  fs.writeFileSync(file, new Resvg(svg(box + line(size)), { font }).render().asPng());
}

/** A silent MP4 (H.264, 30 fps, 1080×1920) with an empty AAC track, which Instagram handles best. */
export function makeReel(pngs: string[], out: string, opts: ReelOptions = {}): void {
  if (!ffmpegPath) throw new Error('ffmpeg-static has no binary for this platform');
  if (!pngs.length) throw new Error('No images for the Reel');
  const ds = durations(pngs.length);
  const total = reelSeconds(pngs.length);
  const args = ['-y', '-loglevel', 'error'];
  pngs.forEach((p, i) => args.push('-loop', '1', '-framerate', String(FPS), '-t', String(ds[i]), '-i', p));
  args.push('-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
  const card = opts.endText && opts.fontDir ? out.replace(/\.mp4$/i, '') + '_end.png' : null;
  if (card) {
    endCard(opts.endText!, opts.fontDir!, card);
    args.push('-loop', '1', '-framerate', String(FPS), '-t', String(total), '-i', card);
  }

  // Each image: fit 9:16, then a slow zoom towards the middle (rendered at double size so it does not jitter).
  const clips = pngs.map((_, i) => {
    const frames = Math.round(ds[i] * FPS);
    return `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,scale=2160:3840,zoompan=z='1+${ZOOM}*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${FPS},format=yuv420p[c${i}]`;
  });
  // Cross-fades: each starts FADE before the previous clip ends.
  const chain: string[] = [];
  let last = 'c0';
  let offset = 0;
  for (let i = 1; i < pngs.length; i++) {
    offset += ds[i - 1] - FADE;
    chain.push(`[${last}][c${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(2)}[x${i}]`);
    last = `x${i}`;
  }
  let video = last;
  if (card) {
    const from = Math.max(0, total - END_SECONDS).toFixed(2);
    chain.push(`[${video}][${pngs.length + 1}:v]overlay=0:0:enable='gte(t\\,${from})'[e]`);
    video = 'e';
  }
  args.push('-filter_complex', [...clips, ...chain].join(';'), '-map', `[${video}]`, '-map', `${pngs.length}:a`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out);
  const r = spawnSync(ffmpegPath as unknown as string, args, { encoding: 'utf8' });
  if (card) fs.rmSync(card, { force: true });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || r.error?.message || '').slice(0, 300)}`);
}
