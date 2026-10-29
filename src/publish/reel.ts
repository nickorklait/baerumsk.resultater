// Reels reach people who do not follow the account yet, so each story set is also published as a short Reel
// (9:16). It goes to the Reels tab only, so the grid gets no duplicates. A still slideshow is skipped fast, so
// every image moves (a slow zoom), the images cross-fade, the first is short to start quickly, and the last
// seconds carry a "follow" line. ffmpeg comes from the ffmpeg-static package, so it works the same locally and
// on GitHub.

import { spawnSync } from 'node:child_process';
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

/** drawtext's own escaping: backslash, colon, quote and percent. */
const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\u2019").replace(/%/g, '\\%');

/** A silent MP4 (H.264, 30 fps, 1080×1920) with an empty AAC track, which Instagram handles best. */
export function makeReel(pngs: string[], out: string, opts: ReelOptions = {}): void {
  if (!ffmpegPath) throw new Error('ffmpeg-static has no binary for this platform');
  if (!pngs.length) throw new Error('No images for the Reel');
  const ds = durations(pngs.length);
  const total = reelSeconds(pngs.length);
  const args = ['-y', '-loglevel', 'error'];
  pngs.forEach((p, i) => args.push('-loop', '1', '-framerate', String(FPS), '-t', String(ds[i]), '-i', p));
  args.push('-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');

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
  if (opts.endText && opts.fontDir) {
    const from = Math.max(0, total - END_SECONDS).toFixed(2);
    chain.push(`[${video}]drawtext=fontfile=Inter-ExtraBold.ttf:text='${escapeText(opts.endText)}':fontsize=56:fontcolor=white:box=1:boxcolor=black@0.72:boxborderw=30:x=(w-text_w)/2:y=h*0.72:enable='gte(t\\,${from})'[e]`);
    video = 'e';
  }
  args.push('-filter_complex', [...clips, ...chain].join(';'), '-map', `[${video}]`, '-map', `${pngs.length}:a`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out);
  // The end text's font is found relative to the font folder (no drive letters to escape on Windows).
  const r = spawnSync(ffmpegPath as unknown as string, args, { encoding: 'utf8', cwd: opts.endText && opts.fontDir ? opts.fontDir : undefined });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || r.error?.message || '').slice(0, 300)}`);
}
