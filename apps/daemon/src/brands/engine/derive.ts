// @ts-nocheck
/**
 * derive.ts — the heart of the engine.
 *
 * Takes a tiny SeedToken (~20 fields) and DERIVES the full DesignTokens style
 * system, exactly the way Ant Design turns ~30 seeds into hundreds of map
 * tokens. Nothing here is hand-authored; every value traces back to a seed via
 * a deterministic algorithm. The three theme algorithms (default / dark /
 * compact) are the SAME seed run through different math — that is what makes
 * "light / dark / compact" variants instead of three separate hand-built sets.
 *
 * Pipeline (see types.ts):  SeedToken ──deriveTokens(algorithm)──▶ DesignTokens
 *
 * Algorithms implemented inline (no separate algorithms.ts):
 *   - "default": light theme, neutral alpha over #000 / #fff.
 *   - "dark":    colorTextBase/colorBgBase flipped (white text on near-black
 *                #141414); palettes built with generate(c,{theme:"dark",...});
 *                darker neutral alpha ladder.
 *   - "compact": same colors as default; size / control / padding ladders
 *                tightened (controlHeight 28, smaller spacing steps).
 *
 * The color ladder → semantic mapping uses the 0-based indices documented on
 * ColorTokenSet in types.ts: bg=[0] bgHover=[1] border=[2] borderHover=[3]
 * hover=[4] base=[5] active=[6] text=[8].
 */

import { generate, presets } from "./palette.js";
import type { DesignTokens, SeedToken, ThemeAlgorithm } from "./types.js";

// ─────────────────────────── color math (inlined, no deps) ──────────────────

interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Parse "#rgb" / "#rrggbb" into an RGB triple (0–255). Falls back to black. */
function parseHex(input: string): RGB {
  let hex = input.trim().replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (hex.length !== 6 || /[^0-9a-fA-F]/.test(hex)) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex({ r, g, b }: RGB): string {
  const h = (n: number) => clamp255(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Composite `fg` over `bg` at the given alpha (0–1), returning an opaque hex.
 * This is how Ant turns its "neutral text uses transparency" rule into the
 * solid token values consumers can paint with on the known base background.
 */
function alphaOver(fg: RGB, bg: RGB, alpha: number): string {
  return toHex({
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
  });
}

function luminance(rgb: RGB): number {
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

function lightThemeBgBase(input: string | undefined): string {
  const hex = input || "#ffffff";
  return luminance(parseHex(hex)) >= 0.72 ? hex : "#ffffff";
}

function lightThemeTextBase(input: string | undefined): string {
  const hex = input || "#000000";
  return luminance(parseHex(hex)) <= 0.45 ? hex : "#000000";
}

// ─────────────────────────── color ladder mapping ───────────────────────────

/** A semantic color's full interaction-state set, mapped off a 10-step ramp. */
interface ColorStates {
  base: string;
  bg: string;
  bgHover: string;
  border: string;
  borderHover: string;
  hover: string;
  active: string;
  text: string;
}

/**
 * Map a 10-step palette onto interaction states using the 0-based indices from
 * ColorTokenSet (types.ts). In dark mode the hover/active steps shift the way
 * Ant's dark algorithm does (hover lighter, active = base) so states stay
 * legible on the dark canvas.
 */
function statesFromPalette(palette: string[], algorithm: ThemeAlgorithm): ColorStates {
  const at = (i: number) => palette[i] ?? palette[palette.length - 1] ?? "#000000";
  if (algorithm === "dark") {
    return {
      bg: at(0),
      bgHover: at(1),
      border: at(2),
      borderHover: at(3),
      hover: at(6),
      base: at(5),
      active: at(4),
      text: at(8),
    };
  }
  return {
    bg: at(0),
    bgHover: at(1),
    border: at(2),
    borderHover: at(3),
    hover: at(4),
    base: at(5),
    active: at(6),
    text: at(8),
  };
}

// ─────────────────────────── numeric ladders ────────────────────────────────

/**
 * Snap a px size to an even integer — this is Ant's own genFontSizes helper
 * (`size % 2 ? size + 1 : size`): round, then bump odd up to the next even.
 */
function toEven(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r + 1;
}

/**
 * The modular type scale. index 1 is forced to the base size; every other step
 * is round(base * e^((i-1)/5)) snapped even (see toEven). Returns 10 steps
 * (indices 0–9), matching Ant's genFontSizes output shape.
 *
 * Note: this is a faithful port of the *formula* the spec mandates, so for
 * base 14 it yields [12,14,18,22,26,32,38,46,58,70]. Ant's published v5 ladder
 * is the hand-tuned [12,14,16,20,24,30,38,46,56,68]; the two agree on the base,
 * SM and several heading steps but diverge a few px on the mid steps because
 * the published list is curve-fitted rather than pure e^((i-1)/5). Per the
 * brand-framework guidance ("以你忠实移植的算法输出为准") we keep the algorithmic
 * output as the single source of truth.
 */
function fontSizeLadder(base: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 10; i++) {
    if (i === 1) {
      out.push(base);
    } else {
      out.push(toEven(base * Math.E ** ((i - 1) / 5)));
    }
  }
  return out;
}

/** Round a duration in seconds to a tidy "0.2s"-style string. */
function durationStr(seconds: number): string {
  // Strip floating-point fuzz, keep at most 2 decimals, drop trailing zeros.
  const rounded = Math.round(seconds * 100) / 100;
  return `${rounded}s`;
}

// ─────────────────────────── neutral ladders per algorithm ──────────────────

interface NeutralAlphas {
  text: [number, number, number, number];
  fill: [number, number, number, number];
  /** alpha used for the solid default border. */
  border: number;
  borderSecondary: number;
  /** alpha used to tint colorBgLayout off the base bg. */
  layout: number;
}

function neutralAlphas(algorithm: ThemeAlgorithm): NeutralAlphas {
  if (algorithm === "dark") {
    return {
      text: [0.85, 0.65, 0.45, 0.25],
      fill: [0.18, 0.12, 0.08, 0.04],
      border: 0.18,
      borderSecondary: 0.12,
      layout: 0.04,
    };
  }
  // default & compact share the light neutral ladder (color layer is orthogonal
  // to the density layer — see brand-framework.md §2a).
  return {
    text: [0.88, 0.65, 0.45, 0.25],
    fill: [0.15, 0.06, 0.04, 0.02],
    border: 0.15,
    borderSecondary: 0.06,
    layout: 0.04,
  };
}

// ─────────────────────────── main entry ─────────────────────────────────────

/**
 * Derive the complete DesignTokens style system from a SeedToken.
 *
 * @param seed       the minimal brand input surface.
 * @param algorithm  "default" (light) | "dark" | "compact". Defaults to "default".
 */
export function deriveTokens(seed: SeedToken, algorithm: ThemeAlgorithm = "default"): DesignTokens {
  const isDark = algorithm === "dark";
  const isCompact = algorithm === "compact";

  // --- resolve the light/dark base canvas ------------------------------------
  // Light and compact themes must stay visually light even when the source site
  // is dark-native and the extractor records black as the observed background.
  // Dark mode owns the near-black canvas; default/compact keep a light base and
  // only preserve brand-provided neutral bases when they are already light/dark
  // enough for readable light-mode contrast.
  const textBaseHex = isDark ? "#ffffff" : lightThemeTextBase(seed.colorTextBase);
  const bgBaseHex = isDark ? "#141414" : lightThemeBgBase(seed.colorBgBase);
  const textBase = parseHex(textBaseHex);
  const bgBase = parseHex(bgBaseHex);

  const paletteOpts = isDark
    ? ({ theme: "dark", backgroundColor: bgBaseHex } as const)
    : undefined;

  // --- color palettes (primary + functional) ---------------------------------
  const primaryPalette = generate(seed.colorPrimary, paletteOpts);
  const primary = statesFromPalette(primaryPalette, algorithm);

  const successStates = statesFromPalette(generate(seed.colorSuccess, paletteOpts), algorithm);
  const warningStates = statesFromPalette(generate(seed.colorWarning, paletteOpts), algorithm);
  const errorStates = statesFromPalette(generate(seed.colorError, paletteOpts), algorithm);
  const infoStates = statesFromPalette(generate(seed.colorInfo, paletteOpts), algorithm);

  // colorLink falls back to colorInfo when empty (per SeedToken contract).
  const linkSeed = seed.colorLink && seed.colorLink.length > 0 ? seed.colorLink : seed.colorInfo;
  const linkStates = statesFromPalette(generate(linkSeed, paletteOpts), algorithm);

  // --- neutral text / fill / bg / border via alpha over the base canvas -------
  const na = neutralAlphas(algorithm);
  const text = (a: number) => alphaOver(textBase, bgBase, a);

  const colorText = text(na.text[0]);
  const colorTextSecondary = text(na.text[1]);
  const colorTextTertiary = text(na.text[2]);
  const colorTextQuaternary = text(na.text[3]);

  const colorFill = text(na.fill[0]);
  const colorFillSecondary = text(na.fill[1]);
  const colorFillTertiary = text(na.fill[2]);
  const colorFillQuaternary = text(na.fill[3]);

  const colorBorder = text(na.border);
  const colorBorderSecondary = text(na.borderSecondary);

  // Layout is the page canvas (slightly off the container); container & elevated
  // sit on the pure base. In dark mode elevated is lifted one notch lighter.
  const colorBgLayout = text(na.layout);
  const colorBgContainer = bgBaseHex;
  const colorBgElevated = isDark ? alphaOver(textBase, bgBase, 0.08) : bgBaseHex;

  // --- typography -------------------------------------------------------------
  const fontSize = seed.fontSize;
  const sizes = fontSizeLadder(fontSize);
  const lineHeight = (fontSize + 8) / fontSize;
  const lineHeightHeading = (sizes[5] + 8) / sizes[5];

  // --- spacing ladder ---------------------------------------------------------
  // Each of the 8 steps is sizeUnit*(sizeStep + n). With the default 4/4 seed the
  // offsets below produce exactly [4,8,12,16,20,24,32,48]. Compact drops the
  // effective sizeStep (4 -> 2) so the whole ladder collapses to a denser rhythm
  // [4,8,8,12,16,16,24,32] — colors stay identical, only density changes.
  const unit = seed.sizeUnit;
  const step = isCompact ? Math.max(2, seed.sizeStep - 2) : seed.sizeStep;
  const spacingOffsets = isCompact
    ? [-1, 0, 0, 1, 2, 2, 4, 6] // -> [4,8,8,12,16,16,24,32]
    : [-3, -2, -1, 0, 1, 2, 4, 8]; // -> [4,8,12,16,20,24,32,48]
  const [sizeXXS, sizeXS, sizeSM, size, sizeMD, sizeLG, sizeXL, sizeXXL] = spacingOffsets.map(
    (n) => unit * (step + n),
  ) as [number, number, number, number, number, number, number, number];

  // --- geometry ---------------------------------------------------------------
  const borderRadius = seed.borderRadius;
  // XS / SM / LG ratios off the seed radius (Ant: ~0.33× / ~0.66× / +2px).
  const borderRadiusXS = Math.max(1, Math.round(borderRadius / 3)); // 6 -> 2
  const borderRadiusSM = Math.max(2, Math.round((borderRadius * 2) / 3)); // 6 -> 4
  const borderRadiusLG = borderRadius + 2; // 6 -> 8

  // Compact shrinks the control height; XS/SM/LG keep their ratios off it.
  const controlHeight = isCompact ? 28 : seed.controlHeight;
  const controlHeightXS = Math.round(controlHeight * 0.5);
  const controlHeightSM = Math.round(controlHeight * 0.75);
  const controlHeightLG = Math.round(controlHeight * 1.25);

  // --- motion -----------------------------------------------------------------
  const mu = seed.motionUnit;
  const mb = seed.motionBase;
  const motionDurationFast = durationStr(mb + mu * 1);
  const motionDurationMid = durationStr(mb + mu * 2);
  const motionDurationSlow = durationStr(mb + mu * 3);
  // Ant's signature easing curves (brand-framework.md §L1 motion).
  const motionEaseInOut = "cubic-bezier(0.645, 0.045, 0.355, 1)";
  const motionEaseOut = "cubic-bezier(0.215, 0.61, 0.355, 1)";

  return {
    algorithm,

    // primary
    colorPrimary: primary.base,
    colorPrimaryBg: primary.bg,
    colorPrimaryBgHover: primary.bgHover,
    colorPrimaryBorder: primary.border,
    colorPrimaryBorderHover: primary.borderHover,
    colorPrimaryHover: primary.hover,
    colorPrimaryActive: primary.active,
    colorPrimaryText: primary.text,

    // functional — success / warning / error / info / link
    colorSuccess: successStates.base,
    colorSuccessBg: successStates.bg,
    colorSuccessBorder: successStates.border,
    colorSuccessHover: successStates.hover,
    colorSuccessActive: successStates.active,
    colorWarning: warningStates.base,
    colorWarningBg: warningStates.bg,
    colorWarningBorder: warningStates.border,
    colorWarningHover: warningStates.hover,
    colorWarningActive: warningStates.active,
    colorError: errorStates.base,
    colorErrorBg: errorStates.bg,
    colorErrorBorder: errorStates.border,
    colorErrorHover: errorStates.hover,
    colorErrorActive: errorStates.active,
    colorInfo: infoStates.base,
    colorInfoBg: infoStates.bg,
    colorInfoBorder: infoStates.border,
    colorLink: linkStates.base,
    colorLinkHover: linkStates.hover,
    colorLinkActive: linkStates.active,

    // neutral text (alpha ladder over colorTextBase)
    colorText,
    colorTextSecondary,
    colorTextTertiary,
    colorTextQuaternary,

    // neutral fill
    colorFill,
    colorFillSecondary,
    colorFillTertiary,
    colorFillQuaternary,

    // backgrounds & borders
    colorBgLayout,
    colorBgContainer,
    colorBgElevated,
    colorBorder,
    colorBorderSecondary,

    // typography
    fontFamily: seed.fontFamily,
    fontFamilyCode: seed.fontFamilyCode,
    fontSize,
    fontSizeSM: sizes[0],
    fontSizeLG: sizes[2],
    fontSizeXL: sizes[3],
    fontSizeHeading1: sizes[6],
    fontSizeHeading2: sizes[5],
    fontSizeHeading3: sizes[4],
    fontSizeHeading4: sizes[3],
    fontSizeHeading5: sizes[2],
    lineHeight,
    lineHeightHeading,
    fontWeightStrong: 600,

    // spacing scale
    sizeXXS,
    sizeXS,
    sizeSM,
    size,
    sizeMD,
    sizeLG,
    sizeXL,
    sizeXXL,

    // geometry
    borderRadiusXS,
    borderRadiusSM,
    borderRadius,
    borderRadiusLG,
    lineWidth: seed.lineWidth,
    controlHeightXS,
    controlHeightSM,
    controlHeight,
    controlHeightLG,

    // motion
    motionDurationFast,
    motionDurationMid,
    motionDurationSlow,
    motionEaseInOut,
    motionEaseOut,

    // raw palettes (for swatches / charts / sub-brands)
    primaryPalette,
    presets,
  };
}
