import { Resvg } from '@resvg/resvg-js';
import type { ClubConfig } from '../config.ts';

export interface Palette {
  /** Dominant logo colour. */
  primary: string;
  /** Second logo colour. */
  secondary: string;
  /** Dark background derived from primary. */
  dark: string;
  /** Extra highlight; defaults to secondary. */
  accent: string;
}

type Rgb = [number, number, number];

const hex = ([r, g, b]: Rgb) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const parseHex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** Same hue, new lightness: used for the dark background. */
export function withLightness(color: string, lightness: number, maxSaturation = 1): string {
  const [h, s] = rgbToHsl(parseHex(color));
  return hex(hslToRgb(h, Math.min(s, maxSaturation), lightness));
}

/**
 * Decode the logo through resvg (no extra image library) and find the two most common
 * saturated hues. White background and grey anti-aliasing are ignored.
 */
export function extractLogoColors(logo: Buffer, mime = 'image/jpeg'): string[] {
  const size = 96;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><image href="data:${mime};base64,${logo.toString('base64')}" width="${size}" height="${size}" preserveAspectRatio="none"/></svg>`;
  const { pixels } = new Resvg(svg).render();
  // Count every coloured pixel, but average only the strongly saturated "core" ones so
  // JPEG blur against the white background does not wash the colour out.
  const buckets = new Map<number, { n: number; core: number; sum: Rgb }>();
  for (let i = 0; i < pixels.length; i += 4) {
    const rgb: Rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
    if (pixels[i + 3] < 200) continue;
    const [h, s, l] = rgbToHsl(rgb);
    if (s < 0.35 || l < 0.12 || l > 0.85) continue;
    const bucket = Math.round(h / 20) % 18;
    const b = buckets.get(bucket) ?? { n: 0, core: 0, sum: [0, 0, 0] };
    b.n++;
    if (s >= 0.6 && l >= 0.2 && l <= 0.6) {
      b.core++;
      b.sum = b.sum.map((v, j) => v + rgb[j]) as Rgb;
    }
    buckets.set(bucket, b);
  }
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .filter((b) => b.core > 0)
    .slice(0, 2)
    .map((b) => hex(b.sum.map((v) => v / b.core) as Rgb));
}

export function buildPalette(config: ClubConfig, logo: Buffer | null): Palette {
  const extracted = config.colors.auto && logo ? extractLogoColors(logo) : [];
  const primary = config.colors.primary ?? extracted[0] ?? '#1f7a3a';
  const secondary = config.colors.secondary ?? extracted[1] ?? '#d42b2b';
  return {
    primary,
    secondary,
    dark: withLightness(primary, 0.11, 0.6),
    accent: config.colors.accent ?? secondary,
  };
}
