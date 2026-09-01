import { getOpenDesignHost } from '@open-design/host';
import type { AppTheme } from '../types';

const ACCENT_VARS = [
  '--accent',
  '--accent-strong',
  '--accent-soft',
  '--accent-tint',
  '--accent-hover',
] as const;

export const DEFAULT_ACCENT_COLOR = '#22d3ee';
// Orbit · Morph accent family only — the retired bridge hues (amber #ffb36b,
// #00f3ff, dark teal #0f6b5b) were dropped entirely. Keep in lockstep with
// the pre-hydration allowlist in `app/layout.tsx`.
export const ACCENT_SWATCHES = [
  DEFAULT_ACCENT_COLOR,
  '#67e8f9',
  '#1f9cb0',
  '#d8ffff',
  '#8b5cf6',
  '#a3b5c0',
  '#f4fafc',
  '#04211b',
] as const;

export function normalizeAccentColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function resolveAccentColor(value: unknown): string {
  return normalizeAccentColor(value) ?? DEFAULT_ACCENT_COLOR;
}

function accentVars(accentColor: string): Record<(typeof ACCENT_VARS)[number], string> {
  return {
    '--accent': accentColor,
    // Keep these mix ratios in sync with the pre-hydration script in app/layout.tsx.
    '--accent-strong': `color-mix(in srgb, ${accentColor} 82%, var(--text-strong))`,
    // Soft/tint ratios match the Orbit · Morph token layer in `tokens.css`
    // (14% soft / 7% tint). Keep in sync with the pre-hydration script in
    // `app/layout.tsx`.
    '--accent-soft': `color-mix(in srgb, ${accentColor} 14%, var(--bg-subtle))`,
    '--accent-tint': `color-mix(in srgb, ${accentColor} 7%, var(--bg-panel))`,
    '--accent-hover': `color-mix(in srgb, ${accentColor} 86%, var(--text-strong))`,
  };
}

/**
 * The one appearance LeastGen Studio ships.
 *
 * Product removed the theme setting: the workspace is themed dark-first
 * (LeastGen dark shell + bridge-gradient brand accents in `tokens.css`).
 * `data-theme` is therefore a constant rather than a preference — and it must
 * always be PRESENT, not merely non-light. Stamping it unconditionally keeps a
 * light OS from leaking through: every stray `html:not([data-theme])` fallback
 * (`shiki`, `ConnectorLogo`, `SketchEditor`, `TerminalViewer`,
 * `connectorBrandColor`, `MentionNode`) resolves dark on a dark OS anyway, and
 * the light `:root` token block is legacy fallback only.
 */
export const FORCED_APP_THEME = 'dark' as const;

/**
 * Coerce any persisted theme to the only one that still exists.
 *
 * Changing the default alone cannot fix an existing install: every user who
 * ever opened the old picker has `'light'` — or `'system'`, which resolves
 * light on a light OS — written to localStorage, and a stored value does not
 * move when the default does. Config reads funnel through here so those
 * installs come back dark.
 */
export function resolveAppTheme(persisted?: AppTheme | null): AppTheme {
  return persisted === FORCED_APP_THEME ? persisted : FORCED_APP_THEME;
}

export function applyAppearanceToDocument({
  accentColor,
}: {
  accentColor?: string;
}): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', FORCED_APP_THEME);
  // Desktop shell: keep the native window appearance (the macOS vibrancy
  // glass material) in step with the app theme. Without this the glass
  // follows the OS appearance, so the light app over a dark OS sat on dark
  // glass and read as a muddy gray (#94). Feature-detected — browsers and
  // older host builds have no appearance capability.
  getOpenDesignHost()?.appearance?.setTheme(FORCED_APP_THEME);

  const normalized = resolveAccentColor(accentColor);
  const vars = accentVars(normalized);
  for (const name of ACCENT_VARS) {
    root.style.setProperty(name, vars[name]);
  }
}
