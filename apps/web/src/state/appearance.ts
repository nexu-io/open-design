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

/** Keep supported saved preferences and use light for missing/invalid values. */
export function resolveAppTheme(persisted?: unknown): AppTheme {
  return persisted === 'light' || persisted === 'dark' || persisted === 'system'
    ? persisted
    : 'light';
}

export function resolveSystemTheme(): 'light' | 'dark' {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function resolveEffectiveTheme(theme?: unknown): 'light' | 'dark' {
  const preference = resolveAppTheme(theme);
  return preference === 'system' ? resolveSystemTheme() : preference;
}

/** Subscribe only while the app follows the system; return listener cleanup. */
export function subscribeToSystemThemeChanges(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }
  mediaQuery.addListener(onChange);
  return () => mediaQuery.removeListener(onChange);
}

export function applyAppearanceToDocument({
  theme,
  accentColor,
}: {
  theme?: unknown;
  accentColor?: string;
}): void {
  const root = document.documentElement;
  const resolvedTheme = resolveAppTheme(theme);
  root.setAttribute('data-theme', resolveEffectiveTheme(resolvedTheme));
  // Pass the saved preference so the native desktop window can follow the OS.
  getOpenDesignHost()?.appearance?.setTheme(resolvedTheme);

  const normalized = normalizeAccentColor(accentColor);
  if (!normalized || normalized === DEFAULT_ACCENT_COLOR) {
    for (const name of ACCENT_VARS) root.style.removeProperty(name);
    return;
  }
  const vars = accentVars(normalized);
  for (const name of ACCENT_VARS) {
    root.style.setProperty(name, vars[name]);
  }
}
