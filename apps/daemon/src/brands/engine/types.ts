// @ts-nocheck
/**
 * FROZEN CONTRACT for the brand engine. Every engine module imports its types
 * and the css-var helpers from here, so the independently-built modules
 * (palette / seed / derive / export / kit / artifacts) stay coherent.
 *
 * Pipeline:  URL ──prefetch──▶ material ──synthesize──▶ SeedToken
 *            SeedToken ──derive(algorithm)──▶ DesignTokens   (the "style system")
 *            DesignTokens ──export──▶ tokens.json / variables.css / theme.json
 *            DesignTokens ──kit──▶ themed components (HTML)
 *            kit + Brand ──artifacts──▶ products (landing / email / poster …)
 *
 * Design choices that make this a *minimal* Ant-Design-style engine:
 *  - The brand is reduced to a tiny SeedToken (~20 fields); everything else is
 *    deterministically DERIVED. This is why one URL yields a whole system.
 *  - Variants (light / dark / compact) are the SAME seed run through a
 *    different algorithm — never hand-authored.
 */

// ─────────────────────────── Seed (the minimal input surface) ───────────────

export interface SeedToken {
  /** The single brand seed color. Becomes palette index 5 (the 6th step). */
  colorPrimary: string;
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
  colorInfo: string;
  /** Empty string => falls back to colorInfo at derive time. */
  colorLink: string;
  /** "#000000" on light themes, "#ffffff" on dark — neutral text is derived from this via alpha. */
  colorTextBase: string;
  /** "#ffffff" on light themes, "#000000" on dark. */
  colorBgBase: string;
  fontFamily: string;
  fontFamilyCode: string;
  /** Base body font size in px (14). The whole modular scale derives from this. */
  fontSize: number;
  /** Base corner radius in px (6). */
  borderRadius: number;
  /** Spacing base unit / step in px (4 / 4). The 8px grid is sizeUnit*2. */
  sizeUnit: number;
  sizeStep: number;
  /** Default control height in px (32). */
  controlHeight: number;
  lineWidth: number;
  /** Motion duration unit in seconds (0.1) and base offset (0). */
  motionUnit: number;
  motionBase: number;
  /** Outline-only (wireframe) mode and global motion on/off. */
  wireframe: boolean;
  motion: boolean;
}

export type ThemeAlgorithm = "default" | "dark" | "compact";

// ─────────────────────────── Derived design tokens (the style system) ───────

/** Full color ladder for one semantic color (primary or a functional color). */
export interface ColorTokenSet {
  /** The 10-step palette, index 0 = lightest, 5 = base, 9 = darkest. */
  palette: string[];
  base: string; // palette[5]
  bg: string; // palette[0]
  bgHover: string; // palette[1]
  border: string; // palette[2]
  borderHover: string; // palette[3]
  hover: string; // palette[4]
  active: string; // palette[6]
  text: string; // palette[8] (dark enough to sit on light bg)
}

/**
 * The complete, ready-to-consume token set. Flat antd-style names so it maps
 * 1:1 onto CSS custom properties (see flattenTokens / cssVar). Lengths are px
 * numbers, line-heights & font-weights are unitless numbers, durations are
 * second-strings ("0.2s"), colors & families are strings.
 */
export interface DesignTokens {
  algorithm: ThemeAlgorithm;

  // primary
  colorPrimary: string;
  colorPrimaryBg: string;
  colorPrimaryBgHover: string;
  colorPrimaryBorder: string;
  colorPrimaryBorderHover: string;
  colorPrimaryHover: string;
  colorPrimaryActive: string;
  colorPrimaryText: string;

  // functional
  colorSuccess: string;
  colorSuccessBg: string;
  colorSuccessBorder: string;
  colorSuccessHover: string;
  colorSuccessActive: string;
  colorWarning: string;
  colorWarningBg: string;
  colorWarningBorder: string;
  colorWarningHover: string;
  colorWarningActive: string;
  colorError: string;
  colorErrorBg: string;
  colorErrorBorder: string;
  colorErrorHover: string;
  colorErrorActive: string;
  colorInfo: string;
  colorInfoBg: string;
  colorInfoBorder: string;
  colorLink: string;
  colorLinkHover: string;
  colorLinkActive: string;

  // neutral text (alpha ladder over colorTextBase: 88 / 65 / 45 / 25 %)
  colorText: string;
  colorTextSecondary: string;
  colorTextTertiary: string;
  colorTextQuaternary: string;

  // neutral fill (alpha ladder: 15 / 6 / 4 / 2 %)
  colorFill: string;
  colorFillSecondary: string;
  colorFillTertiary: string;
  colorFillQuaternary: string;

  // backgrounds & borders
  colorBgLayout: string;
  colorBgContainer: string;
  colorBgElevated: string;
  colorBorder: string;
  colorBorderSecondary: string;

  // typography
  fontFamily: string;
  fontFamilyCode: string;
  fontSize: number;
  fontSizeSM: number;
  fontSizeLG: number;
  fontSizeXL: number;
  fontSizeHeading1: number;
  fontSizeHeading2: number;
  fontSizeHeading3: number;
  fontSizeHeading4: number;
  fontSizeHeading5: number;
  lineHeight: number;
  lineHeightHeading: number;
  fontWeightStrong: number;

  // spacing scale (px): the 8 steps [4,8,12,16,20,24,32,48]
  sizeXXS: number;
  sizeXS: number;
  sizeSM: number;
  size: number;
  sizeMD: number;
  sizeLG: number;
  sizeXL: number;
  sizeXXL: number;

  // geometry
  borderRadiusXS: number;
  borderRadiusSM: number;
  borderRadius: number;
  borderRadiusLG: number;
  lineWidth: number;
  controlHeightXS: number;
  controlHeightSM: number;
  controlHeight: number;
  controlHeightLG: number;

  // motion
  motionDurationFast: string;
  motionDurationMid: string;
  motionDurationSlow: string;
  motionEaseInOut: string;
  motionEaseOut: string;

  // raw palettes (for swatches / charts / sub-brands)
  primaryPalette: string[];
  presets: Record<string, string[]>;
}

// ─────────────────────────── Output bundle ──────────────────────────────────

/** Everything the engine produces for one brand, as in-memory files. */
export interface BrandSystem {
  slug: string;
  seed: SeedToken;
  themes: Record<ThemeAlgorithm, DesignTokens>;
  /** relative path → file contents, ready to write to disk. */
  files: Record<string, string>;
}

// ─────────────────────────── CSS-var helpers (single source of truth) ───────

export const CSS_VAR_PREFIX = "brand";

/** "colorPrimaryBg" → "--brand-color-primary-bg"; "fontSizeHeading1" → "--brand-font-size-heading-1". */
export function cssVar(tokenKey: string): string {
  const kebab = tokenKey
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Za-z])([0-9])/g, "$1-$2")
    .toLowerCase();
  return `--${CSS_VAR_PREFIX}-${kebab}`;
}

/** Convenience for kit/artifacts: `varRef("colorPrimary")` → "var(--brand-color-primary)". */
export function varRef(tokenKey: string, fallback?: string): string {
  return fallback ? `var(${cssVar(tokenKey)}, ${fallback})` : `var(${cssVar(tokenKey)})`;
}

const PX_TOKEN = /^(fontSize|size|borderRadius|lineWidth|controlHeight)/;
const UNITLESS_TOKEN = /^(lineHeight|fontWeight)/;

/** Format a single token value into a CSS-ready string (adds px / leaves unitless / passes strings through). */
export function formatTokenValue(key: string, value: string | number): string {
  if (typeof value === "string") return value;
  if (UNITLESS_TOKEN.test(key)) return String(value);
  if (PX_TOKEN.test(key)) return `${value}px`;
  return String(value);
}

/**
 * Flatten DesignTokens into ordered { cssVarName → css-ready value } pairs.
 * Arrays (palettes) expand to `<name>-<1-based-index>`. Objects (presets)
 * expand to `<name>-<key>-<1-based-index>`. `algorithm` is skipped.
 */
export function flattenTokens(tokens: DesignTokens): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  for (const [key, value] of Object.entries(tokens)) {
    if (key === "algorithm" || value == null) continue;
    if (Array.isArray(value)) {
      value.forEach((v, i) => out.push({ name: `${cssVar(key)}-${i + 1}`, value: String(v) }));
    } else if (typeof value === "object") {
      for (const [sub, arr] of Object.entries(value as Record<string, string[]>)) {
        (arr ?? []).forEach((v, i) =>
          out.push({ name: `${cssVar(key)}-${sub}-${i + 1}`, value: String(v) }),
        );
      }
    } else {
      out.push({ name: cssVar(key), value: formatTokenValue(key, value) });
    }
  }
  return out;
}
