// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_UI_SCALE,
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  UI_SCALE_PRESETS,
  applyAppearanceToDocument,
  normalizeAccentColor,
  normalizeUiScale,
  resolveAccentColor,
  stepUiScale,
} from '../../src/state/appearance';

describe('normalizeAccentColor', () => {
  it('accepts six-digit hex colors and normalizes casing', () => {
    expect(normalizeAccentColor('  #4F46E5  ')).toBe('#4f46e5');
  });

  it('rejects invalid accent colors', () => {
    expect(normalizeAccentColor('blue')).toBeNull();
    expect(normalizeAccentColor('#123')).toBeNull();
    expect(normalizeAccentColor('#12345g')).toBeNull();
  });
});

describe('resolveAccentColor', () => {
  it('falls back to the first appearance color for missing or invalid values', () => {
    expect(resolveAccentColor(undefined)).toBe(DEFAULT_ACCENT_COLOR);
    expect(resolveAccentColor('blue')).toBe(DEFAULT_ACCENT_COLOR);
  });
});

describe('applyAppearanceToDocument', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('--accent');
    document.documentElement.style.removeProperty('--accent-strong');
    document.documentElement.style.removeProperty('--accent-soft');
    document.documentElement.style.removeProperty('--accent-tint');
    document.documentElement.style.removeProperty('--accent-hover');
  });

  it('applies the saved theme and accent variables to the root element', () => {
    applyAppearanceToDocument({ theme: 'dark', accentColor: '#4F46E5' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#4f46e5');
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toContain('#4f46e5');
  });

  it('does not apply appearance colors to global background variables', () => {
    document.documentElement.style.setProperty('--bg', '#faf9f7');
    document.documentElement.style.setProperty('--bg-app', '#faf9f7');

    applyAppearanceToDocument({ theme: 'light', accentColor: '#059669' });

    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#faf9f7');
    expect(document.documentElement.style.getPropertyValue('--bg-app')).toBe('#faf9f7');

    document.documentElement.style.removeProperty('--bg');
    document.documentElement.style.removeProperty('--bg-app');
  });

  it('applies accent variables while clearing an explicit theme for system mode', () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    applyAppearanceToDocument({ theme: 'system', accentColor: '#10B981' });

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-strong')).toContain('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-soft')).toContain('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-tint')).toContain('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toContain('#10b981');
  });

  it('replaces existing accent variables when the saved color changes', () => {
    applyAppearanceToDocument({ theme: 'light', accentColor: '#4F46E5' });

    applyAppearanceToDocument({ theme: 'light', accentColor: '#EF4444' });

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-strong')).toContain('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-strong')).not.toContain('#4f46e5');
    expect(document.documentElement.style.getPropertyValue('--accent-soft')).toContain('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-tint')).toContain('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toContain('#ef4444');
  });

  it('falls back to the default accent when no valid accent is configured', () => {
    document.documentElement.style.setProperty('--accent', '#4f46e5');

    applyAppearanceToDocument({ theme: 'system', accentColor: 'not-a-color' });

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(DEFAULT_ACCENT_COLOR);
  });

  it('applies the UI scale as zoom, CSS variable, and viewport compensation', () => {
    applyAppearanceToDocument({ theme: 'system', accentColor: DEFAULT_ACCENT_COLOR, uiScale: 1.25 });

    const s = document.documentElement.style;
    expect(s.getPropertyValue('--ui-scale')).toBe('1.25');
    expect(s.getPropertyValue('zoom')).toBe('1.25');
    // html dimensions compensated so (100/1.25 = 80) * zoom = 100vw/vh
    // jsdom may strip trailing zeros (80.0000 → 80)
    expect(parseFloat(s.getPropertyValue('width'))).toBeCloseTo(80, 2);
    expect(parseFloat(s.getPropertyValue('height'))).toBeCloseTo(80, 2);
    expect(s.getPropertyValue('overflow')).toBe('hidden');

    s.removeProperty('--ui-scale');
    s.removeProperty('zoom');
    s.removeProperty('width');
    s.removeProperty('height');
    s.removeProperty('overflow');
  });

  it('removes compensation overrides when reset to scale 1', () => {
    // First set a non-1 scale, then reset to 1
    applyAppearanceToDocument({ theme: 'system', accentColor: DEFAULT_ACCENT_COLOR, uiScale: 1.5 });
    applyAppearanceToDocument({ theme: 'system', accentColor: DEFAULT_ACCENT_COLOR, uiScale: 1 });

    const s = document.documentElement.style;
    expect(s.getPropertyValue('zoom')).toBe('1');
    expect(s.getPropertyValue('width')).toBe('');
    expect(s.getPropertyValue('height')).toBe('');
    expect(s.getPropertyValue('overflow')).toBe('');

    s.removeProperty('zoom');
    s.removeProperty('--ui-scale');
  });

  it('leaves zoom untouched when no UI scale is provided (desktop path)', () => {
    applyAppearanceToDocument({ theme: 'system', accentColor: DEFAULT_ACCENT_COLOR });

    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('');
    expect(document.documentElement.style.getPropertyValue('zoom')).toBe('');
  });
});

describe('normalizeUiScale', () => {
  it('clamps to the supported range and defaults invalid input', () => {
    expect(normalizeUiScale(5)).toBe(MAX_UI_SCALE);
    expect(normalizeUiScale(0.1)).toBe(MIN_UI_SCALE);
    expect(normalizeUiScale('nope')).toBe(DEFAULT_UI_SCALE);
    expect(normalizeUiScale(1.25)).toBe(1.25);
  });
});

describe('stepUiScale', () => {
  it('steps up and down through the preset ladder', () => {
    expect(stepUiScale(1, 1)).toBe(UI_SCALE_PRESETS[UI_SCALE_PRESETS.indexOf(1) + 1]);
    expect(stepUiScale(1, -1)).toBe(UI_SCALE_PRESETS[UI_SCALE_PRESETS.indexOf(1) - 1]);
  });

  it('snaps an off-ladder value to the nearest preset before stepping', () => {
    // 1.12 is nearest to 1.1; stepping up lands on the next preset (1.25).
    expect(stepUiScale(1.12, 1)).toBe(1.25);
    // 1.18 is nearest to 1.25; stepping down lands on 1.1.
    expect(stepUiScale(1.18, -1)).toBe(1.1);
  });

  it('clamps at the ends of the ladder', () => {
    expect(stepUiScale(MAX_UI_SCALE, 1)).toBe(MAX_UI_SCALE);
    expect(stepUiScale(MIN_UI_SCALE, -1)).toBe(MIN_UI_SCALE);
  });
});
