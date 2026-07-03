// Deterministic, server-side palette + typography seed for brand extraction.
//
// The agent does the authoritative measurement, but it takes a while to drive
// the browser, so the live `brand.html` shows all-skeleton modules for the
// first few seconds and "feels stuck". To give the page a real first paint —
// colors and fonts already visible before the agent writes anything — this
// module harvests the site's CSS server-side and derives:
//   - an initial semantic color palette from the page's CSS custom properties /
//     prominent computed color literals (and the `theme-color` meta), mapped to
//     the seven brand roles;
//   - initial display / body / mono font families from `@font-face` rules,
//     `font-family` declarations, and linked Google-Fonts stylesheets.
//
// Everything is timeout-bounded and failure-tolerant: offline or a hostile
// origin just yields an empty result, preserving the prior all-skeleton
// behavior — it never throws. It mirrors `logo-fallback.ts` /
// `imagery-fallback.ts` and is injectable so tests run offline.

import type { BrandColor, BrandColorRole, BrandFontSpec } from '@open-design/contracts';

import { extractColors, extractFonts, normalizeColor, type ColorCandidate } from './prefetch.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const HTML_TIMEOUT_MS = 7_000;
const CSS_TIMEOUT_MS = 7_000;
const HTML_CAP = 1_500_000;
const CSS_CAP = 400_000;
const MAX_CSS_FILES = 4;

/** The mutable seed shape the harvester fills in (a subset of `Brand`). */
export interface SeedSlot {
  colors?: BrandColor[];
  typography?: {
    display?: BrandFontSpec;
    body?: BrandFontSpec;
    mono?: BrandFontSpec;
  };
}

/** Signature of {@link ensureBrandSeed}; injectable so tests avoid network. */
export type SeedFallbackFn = (siteUrl: string, seed: SeedSlot) => Promise<{ changed: boolean }>;

const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#47;/g, '/')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

function metaContent(html: string, nameOrProp: string): string {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${nameOrProp.replace(/[:.]/g, '\\$&')}["'][^>]*>`,
    'i',
  );
  const tag = re.exec(html)?.[0];
  if (!tag) return '';
  return decodeEntities(/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? '');
}

async function fetchText(url: string, cap: number, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,text/css,*/*;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.subarray(0, cap).toString('utf8');
  } catch {
    return null;
  }
}

// ─── color math ──────────────────────────────────────────────────────

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function toRgb(hex: string): Rgb | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Relative luminance 0..1 (perceptual weights). */
function luma({ r, g, b }: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** HSL-style saturation 0..1 — distinguishes chromatic accents from grays. */
function saturation({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

/** Linear blend of two colors by `t` (0 = a, 1 = b). */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

interface RankedColor {
  hex: string;
  rgb: Rgb;
  count: number;
  l: number;
  s: number;
}

/** Normalize frequency-ranked candidates into a clean, hex-only working set. */
function rankColors(candidates: ColorCandidate[]): RankedColor[] {
  const out: RankedColor[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const hex = /^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex.toLowerCase() : null;
    if (!hex || seen.has(hex)) continue;
    const rgb = toRgb(hex);
    if (!rgb) continue;
    seen.add(hex);
    out.push({ hex, rgb, count: c.count, l: luma(rgb), s: saturation(rgb) });
  }
  return out;
}

function color(role: BrandColorRole, hex: string, name: string, usage: string): BrandColor {
  return { role, hex, oklch: '', name, usage };
}

/**
 * Derive an initial seven-role palette from frequency-ranked color literals and
 * an optional `theme-color`. Heuristic and best-effort: it never fabricates a
 * palette from memory — every role traces to a measured color (or a blend of
 * two measured colors). Returns [] when no usable color was measured so the kit
 * keeps its palette skeletons rather than showing a fake palette.
 */
export function deriveSeedPalette(
  candidates: ColorCandidate[],
  themeColor?: string | null,
): BrandColor[] {
  const ranked = rankColors(candidates);
  if (ranked.length === 0) return [];

  // Chromatic colors (real hues), ordered by frequency; grays/extremes separate.
  const chromatic = ranked.filter((c) => c.s >= 0.18 && c.l > 0.08 && c.l < 0.95);
  // Vivid mid-luminance hues make the strongest accent candidates (a pale wash
  // or a near-black is a poor accent even when technically chromatic).
  const vivid = chromatic.filter((c) => c.s >= 0.32 && c.l >= 0.22 && c.l <= 0.8);
  const byLight = [...ranked].sort((a, b) => b.l - a.l);
  const byDark = [...ranked].sort((a, b) => a.l - b.l);

  // Page cast: count-weighted mean luminance over the measured colors decides
  // whether the canvas itself is light or dark, so the `background` role tracks
  // the brand's real theme instead of letting a single dark swatch paint a
  // light page's background black (or vice-versa). Biased light (0.45 split,
  // mirroring seed.ts) because a wrong dark canvas reads far more jarring than a
  // wrong light one.
  const totalCount = ranked.reduce((sum, c) => sum + c.count, 0);
  const meanLuma =
    totalCount > 0 ? ranked.reduce((sum, c) => sum + c.l * c.count, 0) / totalCount : 1;
  const darkCast = meanLuma < 0.45;

  // Background: on a light page, the most frequent near-white (else the lightest
  // measured color); on a dark page, the most frequent near-black (else the
  // darkest measured color). Either way the role matches the page's cast.
  const lightSet = ranked.filter((c) => c.l >= 0.9);
  const darkBgSet = ranked.filter((c) => c.l <= 0.12);
  const background = darkCast
    ? [...darkBgSet].sort((a, b) => b.count - a.count)[0] ?? byDark[0] ?? null
    : [...lightSet].sort((a, b) => b.count - a.count)[0] ?? byLight[0] ?? null;
  // Foreground: the high-contrast counterpart to the background — darkest
  // frequent color on a light page, lightest frequent color on a dark page.
  const darkSet = ranked.filter((c) => c.l <= 0.25);
  const lightFgSet = ranked.filter((c) => c.l >= 0.85);
  const foreground = darkCast
    ? [...lightFgSet].sort((a, b) => b.count - a.count)[0] ?? byLight[0] ?? null
    : [...darkSet].sort((a, b) => b.count - a.count)[0] ?? byDark[0] ?? null;

  // Accent: prefer the declared theme-color when chromatic, else the most
  // frequent chromatic literal.
  const themeRgb = themeColor ? toRgb(normalizeColor(themeColor) ?? '') : null;
  let accentHex: string | null = null;
  if (themeRgb && saturation(themeRgb) >= 0.18) accentHex = toHex(themeRgb);
  if (!accentHex) accentHex = vivid[0]?.hex ?? chromatic[0]?.hex ?? null;
  const accentSecondaryHex =
    vivid.find((c) => c.hex !== accentHex)?.hex ??
    chromatic.find((c) => c.hex !== accentHex)?.hex ??
    null;

  // Cast-aware defaults so an unmeasured background/foreground still lands on the
  // correct theme (a dark page keeps a dark bg / light fg rather than snapping to
  // white-on-near-black).
  const bgRgb = background?.rgb ?? (darkCast ? { r: 17, g: 17, b: 17 } : { r: 255, g: 255, b: 255 });
  const fgRgb = foreground?.rgb ?? (darkCast ? { r: 244, g: 244, b: 244 } : { r: 26, g: 26, b: 24 });
  // Surface lifts the background toward the foreground (lighter on a light page,
  // a touch lighter than near-black on a dark page) so cards separate either way.
  const surfaceRgb = mix(bgRgb, fgRgb, 0.06);

  const out: BrandColor[] = [];
  out.push(color('background', toHex(bgRgb), 'Background', 'page background'));
  out.push(color('surface', toHex(surfaceRgb), 'Surface', 'cards, panels'));
  out.push(color('foreground', toHex(fgRgb), 'Foreground', 'primary text'));
  // Muted: midpoint between fg and bg — a measured-derived secondary text tone.
  out.push(color('muted', toHex(mix(fgRgb, bgRgb, 0.45)), 'Muted', 'secondary text'));
  // Border: close to the background, nudged toward the foreground for a hairline.
  out.push(color('border', toHex(mix(bgRgb, fgRgb, 0.12)), 'Border', 'borders, dividers'));
  if (accentHex) out.push(color('accent', accentHex, 'Accent', 'CTAs, links'));
  if (accentSecondaryHex) {
    out.push(color('accent-secondary', accentSecondaryHex, 'Accent secondary', 'secondary accents'));
  }
  return out;
}

// ─── typography ──────────────────────────────────────────────────────

const SERIF_HINT_RE = /serif|playfair|tiempos|georgia|garamond|merriweather|lora|times|caslon|freight/i;
const MONO_HINT_RE = /mono|consol|courier|menlo|code|jetbrains|fira code|source code/i;
/** Icon/symbol faces are UI chrome, not brand typography (mirrors fonts.ts). */
const ICON_FAMILY_RE = /icon|awesome|glyph|symbols?|emoji|icomoon|fontello|pictogram|remix/i;

/** Build a font spec, attaching a matching Google-Fonts stylesheet URL when one
 *  of the page's linked GF URLs covers the family. */
function fontSpecFor(family: string, googleFontsUrls: string[]): BrandFontSpec {
  const fallbacks = SERIF_HINT_RE.test(family)
    ? ['Georgia', 'serif']
    : MONO_HINT_RE.test(family)
      ? ['ui-monospace', 'monospace']
      : ['system-ui', 'sans-serif'];
  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const gf = googleFontsUrls.find((u) => u.toLowerCase().replace(/[^a-z0-9]+/g, '').includes(slug));
  return {
    family,
    fallbacks,
    weights: [400, 700],
    ...(gf ? { googleFontsUrl: gf } : {}),
  };
}

/**
 * Derive an initial display / body / (mono) typography block from the measured
 * font families. The most frequent serif/display-ish family becomes display and
 * the most frequent sans-ish family becomes body; a measured mono family fills
 * mono. Returns null when no real family was measured.
 */
export function deriveSeedTypography(
  fonts: Array<{ family: string }>,
  fontFaceFamilies: string[],
  googleFontsUrls: string[],
): SeedSlot['typography'] | null {
  const families: string[] = [];
  const seen = new Set<string>();
  for (const f of [...fonts.map((f) => f.family), ...fontFaceFamilies]) {
    const fam = f.trim();
    const key = fam.toLowerCase();
    // Drop icon/symbol faces — they are UI chrome, not brand typography, and
    // render as illegible glyph soup in the specimen tiles.
    if (!fam || seen.has(key) || ICON_FAMILY_RE.test(fam)) continue;
    seen.add(key);
    families.push(fam);
  }
  if (families.length === 0) return null;

  const mono = families.find((f) => MONO_HINT_RE.test(f)) ?? null;
  const nonMono = families.filter((f) => f !== mono);
  const serif = nonMono.find((f) => SERIF_HINT_RE.test(f)) ?? null;
  const display = serif ?? nonMono[0] ?? families[0];
  if (!display) return null;
  const body = nonMono.find((f) => f !== display) ?? nonMono[0] ?? display;

  const typography: NonNullable<SeedSlot['typography']> = {
    display: fontSpecFor(display, googleFontsUrls),
    body: fontSpecFor(body, googleFontsUrls),
  };
  if (mono) typography.mono = fontSpecFor(mono, googleFontsUrls);
  return typography;
}

// ─── CSS gathering ───────────────────────────────────────────────────

/** Collect inline <style>, style="" attributes, and a few linked stylesheets
 *  (incl. Google-Fonts CSS) into one blob, plus the linked Google-Fonts URLs. */
async function gatherCss(
  html: string,
  baseUrl: string,
): Promise<{ css: string; googleFontsUrls: string[] }> {
  const chunks: string[] = [];
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) chunks.push(m[1] ?? '');
  for (const m of html.matchAll(/style=["']([^"']{1,2000})["']/gi)) chunks.push(`${m[1]};`);

  const googleFontsUrls: string[] = [];
  const cssLinks: string[] = [];
  for (const m of html.matchAll(/<link[^>]+>/gi)) {
    if (!/rel=["']stylesheet["']/i.test(m[0])) continue;
    const href = /href=["']([^"']+)["']/i.exec(m[0])?.[1];
    if (!href) continue;
    try {
      const abs = new URL(decodeEntities(href), baseUrl).href;
      if (/fonts\.googleapis\.com/i.test(abs)) googleFontsUrls.push(abs);
      else cssLinks.push(abs);
    } catch {
      // Unresolvable href — skip.
    }
  }

  const fetched = await Promise.all(
    [...cssLinks.slice(0, MAX_CSS_FILES), ...googleFontsUrls.slice(0, 2)].map((u) =>
      fetchText(u, CSS_CAP, CSS_TIMEOUT_MS),
    ),
  );
  for (const css of fetched) if (css) chunks.push(css);
  return { css: chunks.join('\n'), googleFontsUrls };
}

/**
 * Harvest the site's CSS server-side and seed an initial palette + typography
 * into `seed` when those fields are still empty. Mutates and returns
 * `{ changed }`. No-op when the seed already carries colors/typography or when
 * nothing measurable could be fetched. Best-effort; never throws.
 */
export async function ensureBrandSeed(siteUrl: string, seed: SeedSlot): Promise<{ changed: boolean }> {
  const hasColors = Array.isArray(seed.colors) && seed.colors.length > 0;
  const hasType = Boolean(seed.typography && (seed.typography.display || seed.typography.body));
  if (hasColors && hasType) return { changed: false };

  let baseUrl: string;
  try {
    baseUrl = new URL(siteUrl).href;
  } catch {
    return { changed: false };
  }

  const html = await fetchText(baseUrl, HTML_CAP, HTML_TIMEOUT_MS);
  if (!html) return { changed: false };

  const { css, googleFontsUrls } = await gatherCss(html, baseUrl);
  let changed = false;

  if (!hasColors) {
    const palette = deriveSeedPalette(extractColors(css), metaContent(html, 'theme-color'));
    if (palette.length > 0) {
      seed.colors = palette;
      changed = true;
    }
  }

  if (!hasType) {
    const { fonts, fontFaceFamilies } = extractFonts(css);
    const typography = deriveSeedTypography(fonts, fontFaceFamilies, googleFontsUrls);
    if (typography) {
      seed.typography = { ...(seed.typography ?? {}), ...typography };
      changed = true;
    }
  }

  return { changed };
}
