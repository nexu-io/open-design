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

/** Valid theme preferences, in picker order. */
export const THEME_PREFERENCES: readonly AppTheme[] = ['system', 'light', 'dark'] as const;

export function normalizeThemePreference(value: unknown): AppTheme | null {
  return value === 'system' || value === 'light' || value === 'dark' ? value : null;
}

const DEFAULT_THEME: AppTheme = 'system';

/** The browser chrome / title-bar color for each resolved appearance. */
const LIGHT_THEME_COLOR = '#f7f7f7';
const DARK_THEME_COLOR = '#202020';

/**
 * Resolve a persisted theme preference. Absent or unknown falls back to
 * `system`, so a fresh install follows the OS and a hand-edited config can
 * never pin a broken value.
 */
export function resolveAppTheme(persisted?: AppTheme | null): AppTheme {
  return normalizeThemePreference(persisted) ?? DEFAULT_THEME;
}

function applyThemeDocument(theme: AppTheme): void {
  const root = document.documentElement;
  // Absence IS system mode. tokens.css carries the full dark set both in
  // `[data-theme="dark"]` and in `@media (prefers-color-scheme: dark)
  // html:not([data-theme])`, so removing the attribute is what makes the
  // document follow the OS live. Attribute consumers (ConnectorLogo,
  // SketchEditor, TerminalViewer, MentionNode, shiki) already treat absence
  // as OS-following.
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
  const dark = theme === 'dark'
    || (theme === 'system'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
}

export function applyAppearanceToDocument({
  accentColor,
  theme,
}: {
  accentColor?: string;
  theme?: AppTheme | null;
}): void {
  const resolved = resolveAppTheme(theme);
  applyThemeDocument(resolved);
  // Desktop shell: keep the native window appearance (the macOS vibrancy
  // glass material) in step with the app theme. Without this the glass
  // follows the OS appearance, so the light app over a dark OS sat on dark
  // glass and read as a muddy gray (#94). Feature-detected — browsers and
  // older host builds have no appearance capability. `system` hands the
  // decision to `nativeTheme.themeSource` so the window tracks the OS live.
  getOpenDesignHost()?.appearance?.setTheme(resolved);

  const root = document.documentElement;
  // A CUSTOM accent is stamped inline; the color-mix ratios resolve against
  // the live theme tokens, so one stamp covers both themes. The DEFAULT
  // accent must stay UNSTAMPED: tokens.css owns all five values per theme
  // (#353535 light / #ededed dark with a matching contrast), and an inline
  // light-default stamp would override the dark palette and leave primary
  // buttons dark-on-dark.
  const custom = normalizeAccentColor(accentColor);
  if (custom) {
    const vars = accentVars(custom);
    for (const name of ACCENT_VARS) {
      root.style.setProperty(name, vars[name]);
    }
  } else {
    for (const name of ACCENT_VARS) {
      root.style.removeProperty(name);
    }
  }
}
