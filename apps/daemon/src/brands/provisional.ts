// provisional — build a usable Brand deterministically from raw prefetch
// material (no LLM, no network, no Date/random — same input always yields the
// same Brand).
//
// `brandFromMaterial` runs `seedFromMaterial` to get base colors/font, derives
// the 6–7 semantic color roles from a neutral ramp, lifts the obvious copy
// (name / first heading / first body line) out of the material, ranks the
// downloaded logo candidates, and hands the assembled object to
// `validateBrand` so the result is normalized and guaranteed valid.

import type { Brand, BrandColor } from '@open-design/contracts';

import type { LogoCandidate, PrefetchResult } from './prefetch.js';
import { seedFromMaterial } from './seed.js';
import { validateBrand } from './validate.js';

/** Best-effort hostname for a URL — falls back to the trimmed raw string. */
function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.trim();
  }
}

/** "www.economist.com" → "Economist": a presentable name when the page
 *  yielded no usable site name (e.g. a bot-challenge interstitial). */
function nameFromHost(host: string): string {
  const core = host.replace(/^www\./i, '').split('.')[0] ?? '';
  return core ? core.charAt(0).toUpperCase() + core.slice(1) : host;
}

/**
 * Prefer-best-mark ordering for logo candidates. The harvester pushes whatever
 * it finds in DOM order — an inline header SVG (frequently a nav/UI glyph)
 * often lands first, which makes a junky preview. Image-blind, so we lean on
 * the candidate's source kind: clean app / favicon marks win, then header logo
 * images, then inline SVGs, and marketing og:image banners last. Ties keep
 * harvest order.
 */
const LOGO_KIND_RANK: Record<LogoCandidate['kind'], number> = {
  'apple-touch-icon': 0,
  favicon: 1,
  'header-img': 2,
  'inline-svg': 3,
  'og-image': 4,
};

function rankLogos(logos: LogoCandidate[]): LogoCandidate[] {
  return logos
    .map((l, i) => ({ l, i }))
    .sort((a, b) => LOGO_KIND_RANK[a.l.kind] - LOGO_KIND_RANK[b.l.kind] || a.i - b.i)
    .map((x) => x.l);
}

/** Parse #rrggbb → [r,g,b], or null when it isn't a 6-digit hex. */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1] ?? '', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Deterministic linear blend of two hex colors (t=0 → a, t=1 → b). */
function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  const ch = (i: number): string =>
    Math.round(ca[i]! + (cb[i]! - ca[i]!) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

const SANS_FALLBACK = [
  'system-ui',
  '-apple-system',
  'Segoe UI',
  'Helvetica Neue',
  'Arial',
  'sans-serif',
];

/**
 * Deterministically build a provisional Brand from prefetch material. The
 * shape is intentionally minimal — voice/imagery/layout stay near-empty.
 * Passing through `validateBrand` normalizes the object (and enforces the
 * background/foreground/accent color roles).
 */
export function brandFromMaterial(material: PrefetchResult, sourceUrl: string): Brand {
  const seed = seedFromMaterial(material);
  const host = hostname(material.finalUrl || sourceUrl);

  const name = (material.siteName || material.title || nameFromHost(host) || 'Brand').trim();
  const headings = material.headings ?? [];
  const paragraphs = material.paragraphs ?? [];

  const tagline = (headings[0] ?? '').trim();
  const description = (material.description || paragraphs[0] || '').trim();

  // A full neutral ramp derived deterministically from the measured base
  // colors, so the instant preview shows a real 6–7 swatch palette (background
  // / surface / foreground / muted / border / accent) instead of a bare three.
  const bg = seed.colorBgBase;
  const fg = seed.colorTextBase;
  const colors: BrandColor[] = [
    { role: 'background', hex: bg, oklch: '', name: 'Background', usage: 'page canvas' },
    { role: 'surface', hex: mixHex(bg, fg, 0.04), oklch: '', name: 'Surface', usage: 'cards / raised surfaces' },
    { role: 'foreground', hex: fg, oklch: '', name: 'Foreground', usage: 'body text' },
    { role: 'muted', hex: mixHex(bg, fg, 0.45), oklch: '', name: 'Muted', usage: 'secondary text' },
    { role: 'border', hex: mixHex(bg, fg, 0.14), oklch: '', name: 'Border', usage: 'hairlines / dividers' },
    { role: 'accent', hex: seed.colorPrimary, oklch: '', name: 'Accent', usage: 'primary brand color' },
  ];
  // accent-secondary is only set when the material yields a usable secondary
  // that isn't just the primary again; skip the empty default so validateBrand
  // doesn't reject a blank hex.
  if (
    seed.colorLink &&
    /^#[0-9a-fA-F]{6}$/.test(seed.colorLink) &&
    seed.colorLink.toLowerCase() !== seed.colorPrimary.toLowerCase()
  ) {
    colors.push({
      role: 'accent-secondary',
      hex: seed.colorLink,
      oklch: '',
      name: 'Accent secondary',
      usage: 'secondary brand color / links',
    });
  }

  const displayFamily =
    material.fonts?.[0]?.family
    ?? material.fontFaceFamilies?.[0]
    ?? (seed.primaryFontFamily || 'Inter');
  const bodyFamily = displayFamily;
  const rankedLogos = rankLogos(material.logos ?? []);

  const provisional = {
    name,
    tagline,
    description,
    sourceUrl,
    logo: {
      primary: rankedLogos[0] ? `logos/${rankedLogos[0].file}` : null,
      alternates: rankedLogos.slice(1).map((l) => `logos/${l.file}`),
      notes: '',
    },
    colors,
    typography: {
      display: { family: displayFamily, fallbacks: SANS_FALLBACK, weights: [400, 700] },
      body: { family: bodyFamily, fallbacks: SANS_FALLBACK, weights: [400, 700] },
    },
    voice: {
      adjectives: [],
      tone: '',
      messagingPillars: headings.slice(0, 3),
      vocabulary: { use: [], avoid: [] },
    },
    imagery: { style: '', subjects: [], treatment: '', avoid: [] },
    layout: {
      radius: '8px',
      borderWeight: '1px',
      spacing: '8px baseline grid',
      postureRules: [],
    },
  };

  return validateBrand(provisional, sourceUrl);
}
