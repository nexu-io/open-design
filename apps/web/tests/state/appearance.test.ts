// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_ACCENT_COLOR,
  applyAppearanceToDocument,
  normalizeAccentColor,
  resolveAccentColor,
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

  it('applies the forced light theme and accent variables to the root element', () => {
    applyAppearanceToDocument({ accentColor: '#4F46E5' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#4f46e5');
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toContain('#4f46e5');
  });

  it('does not apply appearance colors to global background variables', () => {
    document.documentElement.style.setProperty('--bg', '#fafafa');
    document.documentElement.style.setProperty('--bg-app', '#f7f7f7');

    applyAppearanceToDocument({ accentColor: '#059669' });

    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#fafafa');
    expect(document.documentElement.style.getPropertyValue('--bg-app')).toBe('#f7f7f7');

    document.documentElement.style.removeProperty('--bg');
    document.documentElement.style.removeProperty('--bg-app');
  });

  it('applies accent variables while forcing a stale dark theme back to light', () => {
    document.documentElement.setAttribute('data-theme', 'dark');

    applyAppearanceToDocument({ accentColor: '#10B981' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-strong')).toContain('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-soft')).toContain('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-tint')).toContain('#10b981');
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toContain('#10b981');
  });

  it('replaces existing accent variables when the saved color changes', () => {
    applyAppearanceToDocument({ accentColor: '#4F46E5' });

    applyAppearanceToDocument({ accentColor: '#EF4444' });

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-strong')).toContain('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-strong')).not.toContain('#4f46e5');
    expect(document.documentElement.style.getPropertyValue('--accent-soft')).toContain('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-tint')).toContain('#ef4444');
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toContain('#ef4444');
  });

  it('clears stale accent variables when no valid accent is configured', () => {
    document.documentElement.style.setProperty('--accent', '#4f46e5');
    document.documentElement.style.setProperty('--accent-strong', 'stale strong');
    document.documentElement.style.setProperty('--accent-soft', 'stale soft');
    document.documentElement.style.setProperty('--accent-tint', 'stale tint');
    document.documentElement.style.setProperty('--accent-hover', 'stale hover');
    document.documentElement.setAttribute('data-theme', 'dark');

    applyAppearanceToDocument({ theme: 'dark', accentColor: 'not-a-color' });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    for (const name of ['--accent', '--accent-strong', '--accent-soft', '--accent-tint', '--accent-hover']) {
      expect(document.documentElement.style.getPropertyValue(name)).toBe('');
    }
  });

  it('leaves inline accent variables unset for system theme and default accent', () => {
    document.documentElement.style.setProperty('--accent', '#4f46e5');

    applyAppearanceToDocument({ theme: 'system', accentColor: DEFAULT_ACCENT_COLOR });

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });
});
