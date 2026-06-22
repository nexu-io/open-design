// @ts-nocheck
/**
 * SEED synthesis — the narrow front door of the brand engine.
 *
 * The whole point of an Ant-Design-style engine is that a brand collapses into
 * a tiny ~20-field `SeedToken`; everything downstream (the full token system,
 * the themed kit, the artifacts) is DERIVED from it. This module is the only
 * place that *produces* a seed, by three routes:
 *
 *   defaultSeed         — the frozen Ant baseline (light theme).
 *   seedFromBrand       — map an already-synthesized Brand kit onto a seed.
 *   seedFromMaterial    — deterministically infer a seed from raw prefetch
 *                         material (the URL → seed path, no LLM in the loop).
 *
 * Functional colors (success/warning/error) stay at their stable Ant defaults
 * unless the brand clearly carries a semantic color; neutral text/bg are the
 * two base colors that the derive step expands into the full neutral ladder.
 *
 * Color parsing helpers are inlined on purpose: this module imports ONLY the
 * frozen `SeedToken` type from ./types and the adjacent Brand / PrefetchResult
 * contracts. It never reaches into palette/derive — keeping the seed surface
 * independent of how tokens are later computed.
 */

import type { SeedToken } from "./types.js";
import type { Brand, BrandColor } from "../schema.js";
import type { PrefetchResult } from "../prefetch.js";

// ─────────────────────────── font stacks (Ant baseline) ─────────────────────

/** Ant's default system UI stack (incl. CJK + emoji), used as the fallback tail. */
const SYSTEM_UI_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, " +
  "'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'";

/** Ant's default monospace stack. */
const CODE_STACK =
  "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace";

// ─────────────────────────── default seed ───────────────────────────────────

/** The frozen Ant light-theme seed — also the source of every untouched field. */
export const defaultSeed: SeedToken = {
  colorPrimary: "#1677ff",
  colorSuccess: "#52c41a",
  colorWarning: "#faad14",
  colorError: "#ff4d4f",
  colorInfo: "#1677ff",
  colorLink: "",
  colorTextBase: "#000000",
  colorBgBase: "#ffffff",
  fontFamily: SYSTEM_UI_STACK,
  fontFamilyCode: CODE_STACK,
  fontSize: 14,
  borderRadius: 6,
  sizeUnit: 4,
  sizeStep: 4,
  controlHeight: 32,
  lineWidth: 1,
  motionUnit: 0.1,
  motionBase: 0,
  wireframe: false,
  motion: true,
};

// ─────────────────────────── inline color utils ─────────────────────────────

/** Normalize a #rgb/#rrggbb (with optional alpha) string to lowercase #rrggbb, or null. */
function normalizeHex(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  const m = /^#?([0-9a-f]{3,8})$/.exec(v);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3 || h.length === 4) {
    h = h
      .slice(0, 3)
      .split("")
      .map((c) => c + c)
      .join("");
  } else if (h.length === 8) {
    h = h.slice(0, 6);
  } else if (h.length !== 6) {
    return null;
  }
  return `#${h}`;
}

type RGB = { r: number; g: number; b: number };

function hexToRgb(hex: string): RGB {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** Perceptual lightness 0..1 (Rec.709 luma). 1 = white, 0 = black. */
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** HSV saturation 0..1 (chroma / max channel). Greys → ~0. */
function saturation(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** HSV value 0..1 (max channel). */
function value(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return Math.max(r, g, b) / 255;
}

/** HSV hue in degrees 0..360. */
function hue(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** True when a hex is so light or dark it reads as near-white / near-black. */
function isExtreme(hex: string): boolean {
  const l = luminance(hex);
  return l > 0.92 || l < 0.06;
}

/** Greenish hue band (used to decide whether accent-secondary can stand in for success). */
function isGreenish(hex: string): boolean {
  const h = hue(hex);
  return h >= 75 && h <= 165 && saturation(hex) > 0.25;
}

// ─────────────────────────── Brand → Seed ───────────────────────────────────

function findRole(colors: BrandColor[], role: BrandColor["role"]): BrandColor | undefined {
  return colors.find((c) => c.role === role);
}

/** Compose a font stack from a face family + its fallbacks, tailing the Ant system stack. */
function fontStack(primaryFamily: string | undefined, fallbacks: string[]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const fam = raw.trim();
    if (!fam) return;
    const key = fam.toLowerCase().replace(/^["']|["']$/g, "");
    if (seen.has(key)) return;
    seen.add(key);
    // Quote multi-word family names that aren't already quoted.
    const needsQuote = /\s/.test(fam) && !/^["'].*["']$/.test(fam);
    parts.push(needsQuote ? `'${fam}'` : fam);
  };
  if (primaryFamily) push(primaryFamily);
  for (const f of fallbacks) push(f);
  const lead = parts.join(", ");
  return lead ? `${lead}, ${SYSTEM_UI_STACK}` : SYSTEM_UI_STACK;
}

/**
 * Map an already-synthesized Brand kit onto a SeedToken.
 *  - colorPrimary  ← role "accent" (else the first non-neutral color, else default)
 *  - colorInfo     ← same as primary
 *  - colorLink     ← role "accent-secondary" (else "")
 *  - colorSuccess  ← accent-secondary if it reads green, else default
 *  - colorTextBase ← role "foreground"
 *  - colorBgBase   ← role "background"
 *  - fontFamily    ← body face + fallbacks + system tail
 *  - borderRadius  ← parseInt(layout.radius) || 6
 *  - everything else ← defaultSeed
 */
export function seedFromBrand(brand: Brand): SeedToken {
  const colors = brand.colors ?? [];
  const NEUTRAL_ROLES = new Set<BrandColor["role"]>([
    "background",
    "surface",
    "foreground",
    "muted",
    "border",
  ]);

  const accent = findRole(colors, "accent");
  const accentSecondary = findRole(colors, "accent-secondary");
  const foreground = findRole(colors, "foreground");
  const background = findRole(colors, "background");

  const primaryHex =
    normalizeHex(accent?.hex ?? "") ??
    normalizeHex(colors.find((c) => !NEUTRAL_ROLES.has(c.role))?.hex ?? "") ??
    defaultSeed.colorPrimary;

  const linkHex = normalizeHex(accentSecondary?.hex ?? "");
  const successHex =
    linkHex && isGreenish(linkHex) ? linkHex : defaultSeed.colorSuccess;

  const radius = parseInt(brand.layout?.radius ?? "", 10);

  return {
    ...defaultSeed,
    colorPrimary: primaryHex,
    colorInfo: primaryHex,
    colorLink: linkHex ?? "",
    colorSuccess: successHex,
    colorTextBase: normalizeHex(foreground?.hex ?? "") ?? defaultSeed.colorTextBase,
    colorBgBase: normalizeHex(background?.hex ?? "") ?? defaultSeed.colorBgBase,
    fontFamily: fontStack(brand.typography?.body?.family, brand.typography?.body?.fallbacks ?? []),
    borderRadius: Number.isFinite(radius) && radius > 0 ? radius : defaultSeed.borderRadius,
  };
}

// ─────────────────────────── Material → Seed ────────────────────────────────

/**
 * Score a color candidate as a brand-primary contender. Higher is better.
 * Rewards usage frequency (log-damped so a single ubiquitous border color
 * can't dominate) and mid/high saturation in a comfortable value band; hard
 * rejects extremes and washed-out greys by returning a very negative score.
 */
function primaryScore(hex: string, count: number): number {
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

/**
 * Deterministically infer a SeedToken from raw prefetch material (no LLM).
 *  - colorPrimary  ← highest-scoring chromatic color (skip extremes + greys),
 *                    weighted by frequency. Falls back to defaultSeed.
 *  - colorInfo     ← same as primary.
 *  - colorTextBase / colorBgBase ← decided by the site's overall light/dark cast
 *                    (mean luminance of its measured colors).
 *  - colorSuccess/Warning/Error/Link ← stable defaults (semantic colors aren't
 *                    reliably inferable from frequency alone).
 *  - fontFamily    ← fonts[0] / first @font-face family + system tail.
 *  - everything else ← defaultSeed.
 */
export function seedFromMaterial(material: PrefetchResult): SeedToken {
  const candidates = (material.colors ?? [])
    .map((c) => ({ hex: normalizeHex(c.hex), count: c.count }))
    .filter((c): c is { hex: string; count: number } => c.hex !== null);

  // ── primary: best-scoring chromatic candidate ──
  let primaryHex = defaultSeed.colorPrimary;
  let best = -Infinity;
  for (const c of candidates) {
    const s = primaryScore(c.hex, c.count);
    if (s > best) {
      best = s;
      primaryHex = c.hex;
    }
  }

  // ── light vs dark cast: count-weighted mean luminance over the measured
  // colors. Extremes are kept here on purpose — they reveal whether the canvas
  // itself is light or dark, which is exactly the background/text decision.
  // Weighting by declaration count matters: an unweighted mean lets a long
  // tail of one-off dark greys outvote the near-white the page actually sits
  // on. The threshold is biased light (0.45) — a wrong dark canvas is far
  // more jarring than a wrong light one.
  let dark = false;
  const totalCount = candidates.reduce((sum, c) => sum + c.count, 0);
  if (totalCount > 0) {
    const meanLuma =
      candidates.reduce((sum, c) => sum + luminance(c.hex) * c.count, 0) / totalCount;
    dark = meanLuma < 0.45;
  }

  // ── font: first measured family, else first @font-face family ──
  const primaryFamily = material.fonts?.[0]?.family ?? material.fontFaceFamilies?.[0];

  return {
    ...defaultSeed,
    colorPrimary: primaryHex,
    colorInfo: primaryHex,
    colorTextBase: dark ? "#ffffff" : "#000000",
    colorBgBase: dark ? "#000000" : "#ffffff",
    fontFamily: fontStack(primaryFamily, []),
  };
}
