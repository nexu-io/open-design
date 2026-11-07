import { getOpenDesignHost } from '@open-design/host';
import type { AppTheme } from '../types';

const ACCENT_VARS = [
  '--accent',
  '--accent-strong',
  '--accent-soft',
  '--accent-tint',
  '--accent-hover',
] as const;

export const DEFAULT_ACCENT_COLOR = '#353535';
export const ACCENT_SWATCHES = [
  DEFAULT_ACCENT_COLOR,
  '#202020',
  '#848484',
  '#87ea5c',
  '#0d5400',
  '#1A74FF',
  '#FFBA12',
  '#FF7528',
  '#F04142',
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
    '--accent-soft': `color-mix(in srgb, ${accentColor} 12%, var(--bg-subtle))`,
    '--accent-tint': `color-mix(in srgb, ${accentColor} 6%, var(--bg-panel))`,
    '--accent-hover': `color-mix(in srgb, ${accentColor} 86%, var(--text-strong))`,
  };
}

/**
 * The app ships a theme preference: light / dark / system (follow the OS).
 *
 * `data-theme` carries the explicit choice: `'light'` / `'dark'` are stamped
 * on `<html>`, while `'system'` is represented by the attribute being ABSENT —
 * every dark rule in the app pairs `[data-theme="dark"]` with
 * `@media (prefers-color-scheme: dark) { html:not([data-theme]) … }`, so an
 * unstamped document follows the OS automatically. The attribute must always
 * be *decided* (stamped or deliberately removed), never left over from a
 * previous choice: a stored `'dark'` leaking into a light session (or vice
 * versa) paints the wrong tokens.
 */
export const APP_THEME_DEFAULT = 'light' as const;

const APP_THEMES = ['system', 'light', 'dark'] as const;

export function isAppTheme(value: unknown): value is AppTheme {
  return (
    value === 'system' || value === 'light' || value === 'dark'
  );
}

/**
 * Coerce any persisted theme to a valid choice.
 *
 * Unknown / missing values fall back to the default; valid stored choices
 * (including `'dark'` and `'system'`) are honored as-is.
 */
export function resolveAppTheme(persisted?: AppTheme | null): AppTheme {
  return isAppTheme(persisted) ? persisted : APP_THEME_DEFAULT;
}

export function applyAppearanceToDocument({
  theme,
  accentColor,
}: {
  theme?: AppTheme | null;
  accentColor?: string;
}): void {
  const root = document.documentElement;
  const next = resolveAppTheme(
    theme ?? (root.getAttribute('data-theme') as AppTheme | null),
  );
  if (next === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', next);
  // Desktop shell: keep the native window appearance (the macOS vibrancy
  // glass material) in step with the app theme. Without this the glass
  // follows the OS appearance, so the light app over a dark OS sat on dark
  // glass and read as a muddy gray (#94). Feature-detected — browsers and
  // older host builds have no appearance capability.
  getOpenDesignHost()?.appearance?.setTheme(next);

  const normalized = resolveAccentColor(accentColor);
  const vars = accentVars(normalized);
  for (const name of ACCENT_VARS) {
    root.style.setProperty(name, vars[name]);
  }
}
