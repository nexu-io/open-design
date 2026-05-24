import type { AppTheme } from '../types';

const ACCENT_VARS = [
  '--accent',
  '--accent-strong',
  '--accent-soft',
  '--accent-tint',
  '--accent-hover',
] as const;

export const DEFAULT_ACCENT_COLOR = '#c96442';
export const ACCENT_SWATCHES = [
  DEFAULT_ACCENT_COLOR,
  '#2563eb',
  '#7c3aed',
  '#059669',
  '#dc2626',
  '#d97706',
  '#0891b2',
  '#db2777',
] as const;

export function normalizeAccentColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function resolveAccentColor(value: unknown): string {
  return normalizeAccentColor(value) ?? DEFAULT_ACCENT_COLOR;
}

// App-UI zoom (web only). 1 = 100%. The desktop build relies on Electron's
// native View-menu zoom instead, so this never applies there. Presets double
// as the keyboard +/- ladder and the Settings segmented control.
export const DEFAULT_UI_SCALE = 1;
export const MIN_UI_SCALE = 0.8;
export const MAX_UI_SCALE = 2;
export const UI_SCALE_PRESETS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

export function normalizeUiScale(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_UI_SCALE;
  return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, n));
}

// Step to the adjacent preset. dir > 0 zooms in, dir < 0 zooms out. Snaps an
// off-ladder value to the nearest preset first so the step is predictable.
export function stepUiScale(current: number, dir: 1 | -1): number {
  const scale = normalizeUiScale(current);
  const presets: readonly number[] = UI_SCALE_PRESETS;
  let nearestIdx = 0;
  let nearestDist = Infinity;
  presets.forEach((preset, i) => {
    const dist = Math.abs(preset - scale);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIdx = i;
    }
  });
  const nextIdx = Math.min(presets.length - 1, Math.max(0, nearestIdx + dir));
  return presets[nextIdx] ?? DEFAULT_UI_SCALE;
}

function accentVars(accentColor: string): Record<(typeof ACCENT_VARS)[number], string> {
  return {
    '--accent': accentColor,
    // Keep these mix ratios in sync with the pre-hydration script in app/layout.tsx.
    '--accent-strong': `color-mix(in srgb, ${accentColor} 86%, var(--text-strong))`,
    '--accent-soft': `color-mix(in srgb, ${accentColor} 22%, var(--bg-panel))`,
    '--accent-tint': `color-mix(in srgb, ${accentColor} 12%, var(--bg-panel))`,
    '--accent-hover': `color-mix(in srgb, ${accentColor} 90%, var(--text-strong))`,
  };
}

export function applyAppearanceToDocument({
  theme,
  accentColor,
  uiScale,
}: {
  theme?: AppTheme;
  accentColor?: string;
  // Omit on desktop, where native Electron zoom owns scaling. When provided,
  // applies `zoom` on <html> and publishes `--ui-scale` so the artifact
  // preview can counter-scale itself back to its own size.
  uiScale?: number;
}): void {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }

  const normalized = resolveAccentColor(accentColor);
  const vars = accentVars(normalized);
  for (const name of ACCENT_VARS) {
    root.style.setProperty(name, vars[name]);
  }

  if (uiScale != null) {
    const scale = normalizeUiScale(uiScale);
    root.style.setProperty('--ui-scale', String(scale));
    root.style.setProperty('zoom', String(scale));
    // Chromium does not shrink vw/vh when CSS zoom is on <html>, so the
    // zoomed <html> overflows the physical viewport. Compensate by sizing
    // <html> to (100/scale) so that after zoom it fills exactly 100vw×100vh.
    // At scale=1 remove the overrides so the default CSS rule wins.
    if (scale !== 1) {
      const pct = (100 / scale).toFixed(4);
      root.style.setProperty('width', `${pct}vw`);
      root.style.setProperty('height', `${pct}vh`);
      root.style.setProperty('overflow', 'hidden');
    } else {
      root.style.removeProperty('width');
      root.style.removeProperty('height');
      root.style.removeProperty('overflow');
    }
  }
}
