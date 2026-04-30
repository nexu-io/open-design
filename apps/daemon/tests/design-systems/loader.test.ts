// Spec 101 T030 — design-system loader tests.

import { describe, it, expect } from 'vitest';
import {
  loadDesignSystem,
  listDesignSystemKeys,
  validateAllRegistered,
  DesignSystemNotFoundError,
  DesignSystemMalformedError,
} from '../../src/design-systems/_loader.js';

describe('design-systems loader (T030)', () => {
  it('(a) loadDesignSystem("ericedmeades") returns Eric tokens', () => {
    const ds = loadDesignSystem('ericedmeades');
    expect(ds.key).toBe('ericedmeades');
    expect(ds.palette.accent).toBe('#B08D57');
    expect(ds.palette.bg).toBe('#FFFFFF');
    expect(ds.hero_style).toBe('dark-editorial');
    expect(ds.typography.case).toBe('all-caps');
    expect(ds.voice_tokens).toContain('BUILT FOR THE STAGE');
  });

  it('(b) unknown key throws DesignSystemNotFoundError', () => {
    expect(() => loadDesignSystem('nonexistent')).toThrowError(DesignSystemNotFoundError);
  });

  it('(c) Ceremonia entry is loadable + has voice_avoid kill list', () => {
    const ds = loadDesignSystem('ceremonia');
    expect(ds.key).toBe('ceremonia');
    expect(ds.palette.accent).toBe('#14B8A6'); // Ceremonia teal
    expect(ds.hero_style).toBe('warm-organic');
    expect(ds.voice_avoid).toContain('sacred container');
    expect(ds.voice_avoid).toContain('held space');
    expect(ds.voice_avoid).toContain('quantum');
  });

  it('(d) types match DesignSystem interface (compiles + structural fields)', () => {
    const eric = loadDesignSystem('ericedmeades');
    // structural assertions on required keys
    expect(eric).toHaveProperty('palette.primary');
    expect(eric).toHaveProperty('palette.bg');
    expect(eric).toHaveProperty('palette.subtle_bg');
    expect(eric).toHaveProperty('palette.accent');
    expect(eric).toHaveProperty('palette.body_text');
    expect(eric).toHaveProperty('typography.weights');
    expect(eric).toHaveProperty('logo');
    expect(eric).toHaveProperty('hero_style');
    expect(eric).toHaveProperty('voice_tokens');
    expect(eric).toHaveProperty('voice_avoid');
  });

  it('listDesignSystemKeys returns both initial entries', () => {
    const keys = listDesignSystemKeys();
    expect(keys).toEqual(expect.arrayContaining(['ericedmeades', 'ceremonia']));
    expect(keys.length).toBe(2);
  });

  it('validateAllRegistered passes for shipped entries', () => {
    expect(() => validateAllRegistered()).not.toThrow();
  });

  it('Ceremonia palette values are valid 6-digit hex', () => {
    const ds = loadDesignSystem('ceremonia');
    const HEX = /^#[0-9A-Fa-f]{6}$/;
    for (const [field, value] of Object.entries(ds.palette)) {
      expect(value, `${field} should be hex`).toMatch(HEX);
    }
  });

  it('Eric palette values are valid 6-digit hex', () => {
    const ds = loadDesignSystem('ericedmeades');
    const HEX = /^#[0-9A-Fa-f]{6}$/;
    for (const [field, value] of Object.entries(ds.palette)) {
      expect(value, `${field} should be hex`).toMatch(HEX);
    }
  });

  it('logo.url uses HTTPS for both tenants', () => {
    expect(loadDesignSystem('ericedmeades').logo.url).toMatch(/^https:\/\//);
    expect(loadDesignSystem('ceremonia').logo.url).toMatch(/^https:\/\//);
  });
});
