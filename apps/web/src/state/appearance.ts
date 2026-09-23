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
 * The one appearance OpenDesign ships.
 *
 * Product removed the theme setting: the workspace surfaces have no dark
 * tokens, so a dark app is a broken app. `data-theme` is therefore a constant
 * rather than a preference — and it must always be PRESENT, not merely
 * non-dark. Every dark rule in the app is gated on the attribute being absent
 * (`html:not([data-theme])` in CSS) or falls back to `prefers-color-scheme`
 * when the attribute is missing (`shiki`, `ConnectorLogo`, `SketchEditor`,
 * `TerminalViewer`, `connectorBrandColor`, `MentionNode`). Stamping it
 * unconditionally is what keeps a dark OS from leaking through.
 */
export const FORCED_APP_THEME = 'light' as const;

/**
 * Coerce any persisted theme to the only one that still exists.
 *
 * Changing the default alone cannot fix an existing install: every user who
 * ever opened the old picker has `'dark'` — or `'system'`, which resolves dark
 * on a dark OS — written to localStorage, and a stored value does not move
 * when the default does. Config reads funnel through here so those installs
 * come back light.
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
