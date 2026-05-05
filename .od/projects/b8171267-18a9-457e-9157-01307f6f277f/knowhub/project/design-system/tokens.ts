/**
 * Knowledge Hub — Typed token module
 *
 * Mirrors `tokens.css`. Use these from TypeScript when you need
 * tokens at runtime (animation values, inline styles, canvas, etc.).
 *
 * In CSS / className contexts prefer the variables directly:
 *   color: var(--foreground)
 *
 * To read a token at runtime against the active theme:
 *   getComputedStyle(document.documentElement).getPropertyValue('--primary')
 */

export const palette = {
  // Brand
  primary:        "#5e6ad2",
  primaryFg:      "#ffffff",

  // Status (dark-theme values; light overrides via CSS vars)
  success:        "#7dd3a0",
  info:           "#82c7ff",
  warning:        "#f0c674",
  danger:         "#e5736e",
} as const;

export const themes = {
  dark: {
    background:       "#08090a",
    backgroundElev:   "#0c0d0f",
    card:             "#0f1011",
    cardHover:        "#131417",
    foreground:       "#f7f8f8",
    foregroundDim:    "#c7c9cd",
    muted:            "#8a8f98",
    mutedDim:         "#5b5f66",
    border:           "rgba(255,255,255,0.08)",
    borderStrong:     "rgba(255,255,255,0.14)",
    pillBg:           "rgba(255,255,255,0.04)",
    navBg:            "rgba(8,9,10,0.72)",
    headerBg:         "rgba(8,9,10,0.78)",
    thumb:            "#16181c",
    thumbAccent:      "#1c1f26",
    scrim:            "rgba(0,0,0,0.4)",
  },
  light: {
    background:       "#f7f8f8",
    backgroundElev:   "#ffffff",
    card:             "#ffffff",
    cardHover:        "#fafafa",
    foreground:       "#1a1a1e",
    foregroundDim:    "#3a3a40",
    muted:            "#62666d",
    mutedDim:         "#8f9399",
    border:           "#e6e6e6",
    borderStrong:     "#d1d1d1",
    pillBg:           "#f1f2f3",
    navBg:            "rgba(247,248,248,0.82)",
    headerBg:         "rgba(247,248,248,0.85)",
    thumb:            "#e9eaec",
    thumbAccent:      "#dfe1e4",
    scrim:            "rgba(20,22,28,0.32)",
  },
} as const;

export type ThemeName = keyof typeof themes;
export type ThemeTokens = typeof themes.dark;

export const fonts = {
  sans: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  mono: '"Geist Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  featureSettings: '"cv01", "ss03"',
} as const;

export const text = {
  size: {
    "2xs": 10, xs: 11, sm: 12, base: 13, md: 14,
    lg: 15, xl: 17, "2xl": 20, "3xl": 24, "4xl": 32,
  },
  leading: { tight: 1.25, snug: 1.4, normal: 1.55, relaxed: 1.65 },
  tracking: { tight: -0.4, snug: -0.2, flat: -0.1, wide: 0.1, caps: 0.8 },
} as const;

export const space = {
  0: 0, 1: 4, 2: 8, 3: 10, 4: 12, 5: 14, 6: 16,
  7: 20, 8: 24, 9: 28, 10: 32, 12: 40, 14: 48, 16: 64,
} as const;

export const radius = {
  xs: 4, sm: 6, md: 8, lg: 10, xl: 12, "2xl": 16, full: 9999,
} as const;

export const density = {
  rowCompact: 44,
  rowDefault: 56,
  rowLoose: 72,
  hitMin: 44,
} as const;

export const shadows = {
  xs:  "0 1px 2px rgba(0,0,0,0.18)",
  sm:  "0 2px 6px rgba(0,0,0,0.22)",
  md:  "0 8px 20px rgba(0,0,0,0.30)",
  lg:  "0 18px 40px rgba(0,0,0,0.40)",
  fab: "0 8px 20px rgba(94,106,210,0.35), 0 2px 4px rgba(0,0,0,0.2)",
  fabPressed: "0 2px 8px rgba(94,106,210,0.45), 0 0 0 6px rgba(94,106,210,0.18)",
} as const;

export const z = {
  base: 0, sticky: 30, fab: 40, overlay: 60, modal: 70, toast: 80,
} as const;

export const motion = {
  ease: {
    out: "cubic-bezier(0.2, 0.7, 0.2, 1)",
    inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
  },
  duration: { 1: 80, 2: 140, 3: 220, 4: 320 },
} as const;

export const blur = { sm: 12, md: 18, lg: 24 } as const;

/** CSS variable names — use with `var(NAME)` in styles. */
export const cssVar = {
  background:        "--background",
  backgroundElev:    "--background-elev",
  card:              "--card",
  cardHover:         "--card-hover",
  popover:           "--popover",
  foreground:        "--foreground",
  foregroundDim:     "--foreground-dim",
  muted:             "--muted",
  mutedDim:          "--muted-dim",
  border:            "--border",
  borderStrong:      "--border-strong",
  ring:              "--ring",
  primary:           "--primary",
  primaryForeground: "--primary-foreground",
  primaryTint:       "--primary-tint",
  primaryTintStrong: "--primary-tint-strong",
  success:           "--success",
  info:              "--info",
  warning:           "--warning",
  danger:            "--danger",
  pillBg:            "--pill-bg",
  navBg:             "--nav-bg",
  headerBg:          "--header-bg",
  thumb:             "--thumb",
  thumbAccent:       "--thumb-accent",
  scrim:             "--scrim",
} as const;

export type CssVarKey = keyof typeof cssVar;

/** Helper: `v("primary")` → `"var(--primary)"` */
export const v = (key: CssVarKey): string => `var(${cssVar[key]})`;
