// Brand colors for connector mention pills. Neither ConnectorDetail nor the
// upstream Composio catalog expose a brand color, so we keep a small curated
// map of common connectors and fall back to a deterministic hash → palette for
// everything else. The curated values are tuned to read on the light panel; the
// dark theme adjustment below lightens near-black hues so they stay legible
// against the dark pill background (chat.css derives the pill text as
// `color-mix(in srgb, var(--m-hue) 72%, var(--text))`, so a near-black hue
// against the light dark-mode `--text` would otherwise collapse to unreadable
// dark-on-dark text).

const CURATED: Record<string, string> = {
  notion: '#0B0B0B',
  chrome: '#1A73E8',
  claudeinchrome: '#1A73E8',
  googlesheets: '#188038',
  google_sheets: '#188038',
  spreadsheets: '#188038',
  github: '#1F2328',
  figma: '#A259FF',
  slack: '#4A154B',
  linear: '#5E6AD2',
  posthog: '#C8401A',
  gmail: '#C5221F',
  googledrive: '#1A73E8',
  airtable: '#D54402',
};

const FALLBACK_PALETTE = [
  '#1F6FEB',
  '#B5360F',
  '#2E7D32',
  '#6A4FB6',
  '#B0337A',
  '#0F766E',
  '#9A6A00',
  '#334155',
];

export type BrandTheme = 'light' | 'dark';

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

/** Stable FNV-style hash → palette index. */
function hashIndex(seed: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % modulo;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1]!, 16);
  return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Relative luminance (0 dark → 1 light) using the sRGB coefficients. */
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// In dark mode the pill text mixes the hue 72% with the light `--text`, so a
// hue too dark stays dark after the mix. Lighten any hue below this luminance
// toward white until it clears the floor, preserving the brand chroma. The
// floor is tuned to lift near-black brands (Notion, GitHub, Slack) while
// leaving already-bright hues (Figma, Linear) untouched.
const DARK_THEME_MIN_LUMINANCE = 0.4;

function lightenForDark(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const lum = relativeLuminance(rgb);
  if (lum >= DARK_THEME_MIN_LUMINANCE) return hex;
  // Blend toward white by the shortfall so darker hues get lifted more. Pure
  // black (lum 0) lands at the floor; mid hues only nudge up.
  const t = (DARK_THEME_MIN_LUMINANCE - lum) / (1 - lum);
  return toHex({
    r: rgb.r + (255 - rgb.r) * t,
    g: rgb.g + (255 - rgb.g) * t,
    b: rgb.b + (255 - rgb.b) * t,
  });
}

/**
 * Resolve a brand hue for a connector pill, adjusted so it stays readable in the
 * given theme. Pass the live theme (see {@link resolveBrandTheme}); dark themes
 * lighten near-black hues so the derived pill text is not dark-on-dark.
 */
export function connectorBrandColor(
  connector: { id: string; name: string },
  theme: BrandTheme = 'light',
): string {
  const idKey = normalizeKey(connector.id);
  const nameKey = normalizeKey(connector.name);
  const base =
    CURATED[idKey] ??
    CURATED[nameKey] ??
    FALLBACK_PALETTE[hashIndex(connector.id || connector.name, FALLBACK_PALETTE.length)]!;
  return theme === 'dark' ? lightenForDark(base) : base;
}

/**
 * Read the live theme from `<html data-theme>`, falling back to the OS
 * `prefers-color-scheme` when no explicit theme is set (system mode).
 */
export function resolveBrandTheme(): BrandTheme {
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
