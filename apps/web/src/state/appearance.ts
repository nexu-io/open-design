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
    '--accent-strong': `color-mix(in srgb, ${accentColor} 82%, var(--text-strong))`,
    '--accent-soft': `color-mix(in srgb, ${accentColor} 12%, var(--bg-subtle))`,
    '--accent-tint': `color-mix(in srgb, ${accentColor} 6%, var(--bg-panel))`,
    '--accent-hover': `color-mix(in srgb, ${accentColor} 86%, var(--text-strong))`,
  };
}

export const DEFAULT_APP_THEME: AppTheme = 'light';

/**
 * Resolve persisted theme into a valid AppTheme ('light' | 'dark' | 'system').
 * Defaults to 'light' for invalid or uninitialized values.
 */
export function resolveAppTheme(persisted?: AppTheme | null): AppTheme {
  if (persisted === 'light' || persisted === 'dark' || persisted === 'system') {
    return persisted;
  }
  return DEFAULT_APP_THEME;
}

export function getEffectiveAppTheme(theme: AppTheme = 'light'): 'light' | 'dark' {
  if (theme === 'system') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  return theme;
}

let systemThemeMediaQueryList: MediaQueryList | null = null;
let systemThemeListenerAttached = false;

export function applyAppearanceToDocument({
  accentColor,
  theme = 'light',
}: {
  accentColor?: string;
  theme?: AppTheme;
}): void {
  const root = document.documentElement;
  const resolvedTheme = resolveAppTheme(theme);

  root.setAttribute('data-theme', resolvedTheme);

  const effectiveTheme = getEffectiveAppTheme(resolvedTheme);
  getOpenDesignHost()?.appearance?.setTheme(effectiveTheme);

  const normalized = resolveAccentColor(accentColor);
  const vars = accentVars(normalized);
  for (const name of ACCENT_VARS) {
    root.style.setProperty(name, vars[name]);
  }

  if (typeof window !== 'undefined' && window.matchMedia) {
    if (!systemThemeMediaQueryList) {
      systemThemeMediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    }
    if (!systemThemeListenerAttached) {
      systemThemeListenerAttached = true;
      const handleOsThemeChange = () => {
        const currentAttr = root.getAttribute('data-theme');
        if (currentAttr === 'system') {
          const newEffective = systemThemeMediaQueryList?.matches ? 'dark' : 'light';
          getOpenDesignHost()?.appearance?.setTheme(newEffective);
          window.dispatchEvent(
            new CustomEvent('opendesign:themechange', {
              detail: { theme: 'system', effectiveTheme: newEffective },
            })
          );
        }
      };
      systemThemeMediaQueryList.addEventListener?.('change', handleOsThemeChange);
    }
  }
}
