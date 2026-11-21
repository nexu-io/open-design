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
 * Theme a fresh install lands on. `light` preserves the app's long-standing
 * default; users opt into `dark` or `system` from Settings → General.
 */
export const DEFAULT_APP_THEME: AppTheme = 'light';

export const APP_THEMES: readonly AppTheme[] = ['light', 'dark', 'system'] as const;

/** Coerce any unknown value (persisted payload, URL param) to a real theme. */
export function normalizeAppTheme(value: unknown): AppTheme {
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : DEFAULT_APP_THEME;
}

/**
 * The OS appearance, as the only signal for a `system` theme. Must stay in
 * step with the pre-hydration script in `app/layout.tsx`, which cannot import
 * application modules and inlines the same query.
 */
export function resolveSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * A persisted theme is a preference again, so this only normalizes the shape —
 * `'dark'` / `'system'` used to be coerced back to light on every read while
 * the product shipped light-only, and old installs still carry those values.
 */
export function resolveAppTheme(persisted?: AppTheme | null): AppTheme {
  return normalizeAppTheme(persisted);
}

/** The theme actually painted on screen — `system` resolved against the OS. */
export function resolveEffectiveTheme(theme: AppTheme): 'light' | 'dark' {
  if (theme === 'system') return resolveSystemTheme();
  return theme === 'light' ? 'light' : 'dark';
}

export function applyAppearanceToDocument({
  theme,
  accentColor,
}: {
  theme?: AppTheme;
  accentColor?: string;
}): void {
  const root = document.documentElement;
  const resolved = resolveEffectiveTheme(normalizeAppTheme(theme));
  // The attribute is always stamped, never merely left dark-free: every JS
  // theme reader (shiki, ConnectorLogo, SketchEditor, TerminalViewer,
  // connectorBrandColor, MentionNode) checks `data-theme` first and only
  // falls back to `prefers-color-scheme` when it is absent, so an explicit
  // stamp keeps every surface in step — including mid-session switches.
  root.setAttribute('data-theme', resolved);
  // Desktop shell: keep the native window appearance (the macOS vibrancy
  // glass material) in step with the app theme. Without this the glass
  // follows the OS appearance, so a light app over a dark OS sat on dark
  // glass and read as a muddy gray (#94). The raw preference is forwarded so
  // `system` lets Electron follow the OS natively. Feature-detected —
  // browsers and older host builds have no appearance capability.
  getOpenDesignHost()?.appearance?.setTheme(normalizeAppTheme(theme));

  const normalized = resolveAccentColor(accentColor);
  const vars = accentVars(normalized);
  for (const name of ACCENT_VARS) {
    root.style.setProperty(name, vars[name]);
  }
}

/**
 * Re-apply the appearance whenever the OS appearance flips — only fires while
 * the user is on the `system` theme, so an explicit `light` / `dark` choice
 * never changes under them.
 */
export function subscribeToSystemThemeChanges(
  onChange: (theme: 'light' | 'dark') => void,
): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = (): void => onChange(resolveSystemTheme());
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
