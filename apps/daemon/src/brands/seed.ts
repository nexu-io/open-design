// Deterministic color/font seed from raw prefetch material (no LLM).
//
// Ported (slimmed) from the branding-agent engine seed. This produces only the
// handful of base values the provisional brand builder needs:
//   - colorPrimary  : highest-scoring chromatic candidate (skip extremes/greys)
//   - colorLink     : a distinct secondary chromatic candidate, when present
//   - colorTextBase : "#000000" / "#ffffff" by the site's overall light/dark cast
//   - colorBgBase   : the inverse cast
//   - primaryFontFamily : the first measured font family (else "")
//
// No SeedToken / Ant-Design coupling — just plain hex strings + a family name.

import type { PrefetchResult } from './prefetch.js';

const DEFAULT_PRIMARY = '#1677ff';

export type BrandSeed = {
  colorPrimary: string;
  /** A distinct secondary/link color, or "" when none stands out. */
  colorLink: string;
  colorTextBase: string;
  colorBgBase: string;
  /** First measured font family, or "" when none was harvested. */
  primaryFontFamily: string;
};

type SeedCandidate = {
  hex: string;
  count: number;
  sources: string[];
};

// ─── inline color utils ──────────────────────────────────────────────

/** Normalize a #rgb/#rrggbb (with optional alpha) string to lowercase #rrggbb, or null. */
export function normalizeHex(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  const m = /^#?([0-9a-f]{3,8})$/.exec(v);
  if (!m) return null;
  let h = m[1] ?? '';
  if (h.length === 3 || h.length === 4) {
    h = h
      .slice(0, 3)
      .split('')
      .map((c) => c + c)
      .join('');
  } else if (h.length === 8) {
    h = h.slice(0, 6);
  } else if (h.length !== 6) {
    return null;
  }
  return `#${h}`;
}

type RGB = { r: number; g: number; b: number };

export function hexToRgb(hex: string): RGB {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** Perceptual lightness 0..1 (Rec.709 luma). 1 = white, 0 = black. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** HSV saturation 0..1 (chroma / max channel). Greys → ~0. */
export function saturation(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** HSV value 0..1 (max channel). */
export function value(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return Math.max(r, g, b) / 255;
}

/** True when a hex is so light or dark it reads as near-white / near-black. */
function isExtreme(hex: string): boolean {
  const l = luminance(hex);
  return l > 0.92 || l < 0.06;
}

function isVeryDark(hex: string): boolean {
  return luminance(hex) < 0.12;
}

function sourceText(candidate: SeedCandidate): string {
  return candidate.sources.join(' ').toLowerCase();
}

function isOpaqueGeneratedToken(source: string): boolean {
  return /css-var:--(?:token|framer)-[0-9a-f-]{8,}/i.test(source);
}

function tokenNameScore(source: string): number {
  const matches = [...source.matchAll(/css-var:(--[-\w]+)/gi)].map((m) => (m[1] ?? '').toLowerCase());
  let score = 0;
  for (const name of matches) {
    if (isOpaqueGeneratedToken(`css-var:${name}`)) continue;
    if (/\b(?:bg|background|paper|surface|canvas|ink|text|foreground|muted|border|line|shadow|white|black|grey|gray|neutral|bone)\b/.test(name)) {
      continue;
    }
    if (/(?:brand|primary|accent|coral|mustard|olive|cta|action|highlight|link)/.test(name)) {
      score += 4.5;
    }
    if (/(?:soft|tint|subtle|faint|hover|active|bg|background|border|shadow)/.test(name)) {
      score -= 1.8;
    }
  }
  return score;
}

function semanticScore(candidate: SeedCandidate): number {
  const source = sourceText(candidate);
  let score = tokenNameScore(source);
  if (/logo-svg:/.test(source)) score += 2.2;
  if (/(?:selector|prop):[^;]*(?:brand|accent|cta|button|hero|label|dot|selected|active|focus|primary)/.test(source)) {
    score += 1.6;
  }
  if (/(?:fillstyle|strokestyle|wireframe|collisions|inspector|mouseposition|runner|matter)/.test(source)) {
    score -= 4;
  }
  return score;
}

/**
 * Score a color candidate as a brand-primary contender. Higher is better.
 * Rewards usage frequency (log-damped so a single ubiquitous border color
 * can't dominate) and mid/high saturation in a comfortable value band; hard
 * rejects extremes and washed-out greys by returning a very negative score.
 */
export function primaryScore(hex: string, count: number): number {
  if (isExtreme(hex)) return -Infinity;
  const sat = saturation(hex);
  const val = value(hex);
  // Low-saturation greys make poor brand colors.
  if (sat < 0.18) return -Infinity;
  // Prefer a usable value band: not too dark, not blown out.
  const valPenalty = val < 0.2 ? (0.2 - val) * 3 : val > 0.95 ? (val - 0.95) * 4 : 0;
  const freq = Math.log2(Math.max(1, count) + 1);
  return sat * 2 + freq * 0.6 - valPenalty;
}

function chromaticScore(candidate: SeedCandidate): number {
  return primaryScore(candidate.hex, candidate.count);
}

function explicitSemanticPrimary(candidates: SeedCandidate[]): string | null {
  let winner: SeedCandidate | null = null;
  let best = -Infinity;
  for (const candidate of candidates) {
    if (isExtreme(candidate.hex)) continue;
    const semantic = semanticScore(candidate);
    if (semantic < 3.2) continue;
    const score = chromaticScore(candidate) + semantic;
    if (score > best) {
      best = score;
      winner = candidate;
    }
  }
  return winner?.hex ?? null;
}

function dominantDarkPrimary(candidates: SeedCandidate[]): string | null {
  const darkCandidates = candidates.filter((candidate) => isVeryDark(candidate.hex));
  const darkCount = darkCandidates.reduce((sum, candidate) => sum + candidate.count, 0);
  const topChromaticCount = candidates.reduce((max, candidate) => {
    if (saturation(candidate.hex) < 0.18 || isExtreme(candidate.hex)) return max;
    return Math.max(max, candidate.count);
  }, 0);
  if (darkCount < 60 || darkCount < topChromaticCount * 1.35) return null;
  return darkCandidates
    .slice()
    .sort((a, b) => b.count - a.count || luminance(a.hex) - luminance(b.hex))[0]?.hex ?? null;
}

function fallbackChromaticPrimary(candidates: SeedCandidate[]): string {
  let primaryHex = DEFAULT_PRIMARY;
  let best = -Infinity;
  for (const candidate of candidates) {
    const score = chromaticScore(candidate);
    if (score > best) {
      best = score;
      primaryHex = candidate.hex;
    }
  }
  return primaryHex;
}

function secondaryScore(candidate: SeedCandidate): number {
  const semantic = semanticScore(candidate);
  const chromatic = chromaticScore(candidate);
  const logo = /logo-svg:/.test(sourceText(candidate)) ? 2.5 : 0;
  return (Number.isFinite(chromatic) ? chromatic : -2) + semantic + logo;
}

function chooseSecondary(candidates: SeedCandidate[], primaryHex: string): string {
  let linkHex = '';
  let best = -Infinity;
  for (const candidate of candidates) {
    if (candidate.hex === primaryHex) continue;
    if (saturation(candidate.hex) < 0.18 || isExtreme(candidate.hex)) continue;
    const score = secondaryScore(candidate);
    if (score > best) {
      best = score;
      linkHex = candidate.hex;
    }
  }
  return best > -Infinity ? linkHex : '';
}

/**
 * Deterministically infer a small brand seed from raw prefetch material.
 * Same input always yields the same seed — no Date/random, no network.
 */
export function seedFromMaterial(material: PrefetchResult): BrandSeed {
  const candidates = (material.colors ?? [])
    .map((c) => ({ hex: normalizeHex(c.hex), count: c.count, sources: c.sources ?? [] }))
    .filter((c): c is SeedCandidate => c.hex !== null);

  // ── primary: prefer explicit human-readable brand evidence. If a site is
  // mostly monochrome and only has generic generated chromatic effects, allow
  // a dominant near-black to be the brand primary. Otherwise fall back to the
  // old chromatic heuristic.
  const primaryHex =
    explicitSemanticPrimary(candidates) ??
    dominantDarkPrimary(candidates) ??
    fallbackChromaticPrimary(candidates);

  // ── link/secondary: strongest remaining chromatic evidence, with logo and
  // semantic sources preferred over generic generated decoration.
  const linkHex = chooseSecondary(candidates, primaryHex);

  // ── light vs dark cast: count-weighted mean luminance over the measured
  // colors. Extremes are kept here on purpose — they reveal whether the canvas
  // itself is light or dark, which is exactly the background/text decision.
  // The threshold is biased light (0.45) — a wrong dark canvas is far more
  // jarring than a wrong light one. ──
  let dark = false;
  const totalCount = candidates.reduce((sum, c) => sum + c.count, 0);
  if (totalCount > 0) {
    const meanLuma =
      candidates.reduce((sum, c) => sum + luminance(c.hex) * c.count, 0) / totalCount;
    dark = meanLuma < 0.45;
  }

  // ── font: first measured family, else first @font-face family ──
  const primaryFontFamily =
    material.fonts?.[0]?.family ?? material.fontFaceFamilies?.[0] ?? '';

  return {
    colorPrimary: primaryHex,
    colorLink: linkHex,
    colorTextBase: dark ? '#ffffff' : '#000000',
    colorBgBase: dark ? '#000000' : '#ffffff',
    primaryFontFamily,
  };
}
