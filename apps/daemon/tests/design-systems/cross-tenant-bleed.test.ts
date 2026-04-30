// Spec 101 T059 — Cross-tenant brand bleed test.
// Verifies that loading multiple design systems in the same process does NOT
// mutate or cross-contaminate each other's tokens.
// NO network calls — pure module-load + deep-equality assertions.

import { describe, it, expect } from 'vitest';
import { loadDesignSystem } from '../../src/design-systems/_loader.js';

describe('cross-tenant brand bleed (T059)', () => {

  // --- Palette intersection: brand-defining colors must NOT bleed ---

  it("Eric's bronze accent (#B08D57) is NOT in Ceremonia's palette", () => {
    const ceremonia = loadDesignSystem('ceremonia');
    const ceremoniaColors = Object.values(ceremonia.palette);
    expect(ceremoniaColors).not.toContain('#B08D57');
  });

  it("Ceremonia's teal accent (#14B8A6) is NOT in Eric's palette", () => {
    const eric = loadDesignSystem('ericedmeades');
    const ericColors = Object.values(eric.palette);
    expect(ericColors).not.toContain('#14B8A6');
  });

  it("Eric's palette and Ceremonia's palette have empty intersection on brand-defining colors", () => {
    const eric = loadDesignSystem('ericedmeades');
    const ceremonia = loadDesignSystem('ceremonia');
    const ericColors = new Set(Object.values(eric.palette));
    const ceremoniaColors = new Set(Object.values(ceremonia.palette));

    // Brand-defining colors: accent is the single strongest differentiator
    const brandDefining = ['#B08D57', '#14B8A6', '#F0FDFA'];
    for (const color of brandDefining) {
      const inEric = ericColors.has(color);
      const inCeremonia = ceremoniaColors.has(color);
      // A brand-defining color that appears in one must NOT appear in the other
      if (inEric || inCeremonia) {
        expect(inEric && inCeremonia).toBe(false);
      }
    }
  });

  // --- Immutability: loading Ceremonia must not mutate Eric's object ---

  it("loading Ceremonia after Eric does not mutate Eric's design system object", () => {
    const eric = loadDesignSystem('ericedmeades');
    // Capture Eric's state via deep clone before loading Ceremonia
    const ericSnapshot = JSON.parse(JSON.stringify(eric));

    // Now load Ceremonia (potential mutation risk if REGISTRY holds mutable refs)
    loadDesignSystem('ceremonia');

    // Eric's object should be unchanged
    const ericAfter = loadDesignSystem('ericedmeades');
    expect(ericAfter).toEqual(ericSnapshot);
  });

  it("loading Eric after Ceremonia does not mutate Ceremonia's design system object", () => {
    const ceremonia = loadDesignSystem('ceremonia');
    const ceremoniaSnapshot = JSON.parse(JSON.stringify(ceremonia));

    loadDesignSystem('ericedmeades');

    const ceremoniaAfter = loadDesignSystem('ceremonia');
    expect(ceremoniaAfter).toEqual(ceremoniaSnapshot);
  });

  // --- Stable tokens across 100 alternating loads ---
  // This catches any module-level mutable state that could accumulate across calls.

  it('tokens are stable across 100 alternating Eric/Ceremonia loads', () => {
    // Capture baseline snapshots before the storm
    const ericBaseline = JSON.parse(JSON.stringify(loadDesignSystem('ericedmeades')));
    const ceremoniaBaseline = JSON.parse(JSON.stringify(loadDesignSystem('ceremonia')));

    const keys: Array<'ericedmeades' | 'ceremonia'> = [];
    for (let i = 0; i < 100; i++) {
      keys.push(i % 2 === 0 ? 'ericedmeades' : 'ceremonia');
    }

    for (const key of keys) {
      const ds = loadDesignSystem(key);
      if (key === 'ericedmeades') {
        expect(ds).toEqual(ericBaseline);
      } else {
        expect(ds).toEqual(ceremoniaBaseline);
      }
    }
  });

  // --- Voice avoid lists must not bleed between tenants ---

  it("Eric's voice_avoid does not contain any Ceremonia voice_avoid phrases", () => {
    const eric = loadDesignSystem('ericedmeades');
    const ceremonia = loadDesignSystem('ceremonia');
    for (const phrase of ceremonia.voice_avoid) {
      expect(eric.voice_avoid).not.toContain(phrase);
    }
  });

  it("Ceremonia's voice_avoid does not contain any Eric-specific avoid phrases", () => {
    const eric = loadDesignSystem('ericedmeades');
    const ceremonia = loadDesignSystem('ceremonia');
    for (const phrase of eric.voice_avoid) {
      expect(ceremonia.voice_avoid).not.toContain(phrase);
    }
  });

  it("loading Eric returns Eric's exact voice_avoid list (no Ceremonia bleed)", () => {
    // Load Ceremonia first to maximize bleed risk, then assert Eric is clean
    loadDesignSystem('ceremonia');
    const eric = loadDesignSystem('ericedmeades');

    // Eric's actual avoid list per ericedmeades/index.ts:
    expect(eric.voice_avoid).toContain('WildFit');
    expect(eric.voice_avoid).toContain('wellness coach');
    expect(eric.voice_avoid).toContain('green gradient');

    // None of Ceremonia's avoid phrases should appear in Eric's list
    const ceremoniaAvoid = ['sacred container', 'held space', 'divine', 'quantum', 'alignment', 'activation'];
    for (const phrase of ceremoniaAvoid) {
      expect(eric.voice_avoid).not.toContain(phrase);
    }
  });

  it("loading Ceremonia returns Ceremonia's exact voice_avoid list (no Eric bleed)", () => {
    // Load Eric first to maximize bleed risk, then assert Ceremonia is clean
    loadDesignSystem('ericedmeades');
    const ceremonia = loadDesignSystem('ceremonia');

    // Ceremonia's actual avoid list per ceremonia/index.ts:
    expect(ceremonia.voice_avoid).toContain('sacred container');
    expect(ceremonia.voice_avoid).toContain('held space');
    expect(ceremonia.voice_avoid).toContain('divine');
    expect(ceremonia.voice_avoid).toContain('quantum');
    expect(ceremonia.voice_avoid).toContain("don't miss out");

    // None of Eric's avoid phrases should appear in Ceremonia's list
    const ericAvoid = ['WildFit', 'wellness coach', 'green gradient'];
    for (const phrase of ericAvoid) {
      expect(ceremonia.voice_avoid).not.toContain(phrase);
    }
  });

  // --- Voice tokens do not bleed across tenants ---

  it("Eric's voice_tokens do not appear in Ceremonia's voice_tokens", () => {
    const eric = loadDesignSystem('ericedmeades');
    const ceremonia = loadDesignSystem('ceremonia');
    for (const token of eric.voice_tokens) {
      expect(ceremonia.voice_tokens).not.toContain(token);
    }
  });

  it("Ceremonia's voice_tokens do not appear in Eric's voice_tokens", () => {
    const eric = loadDesignSystem('ericedmeades');
    const ceremonia = loadDesignSystem('ceremonia');
    for (const token of ceremonia.voice_tokens) {
      expect(eric.voice_tokens).not.toContain(token);
    }
  });

  // --- Typography does not bleed ---

  it('heading_family differs between tenants', () => {
    const eric = loadDesignSystem('ericedmeades');
    const ceremonia = loadDesignSystem('ceremonia');
    expect(eric.typography.heading_family).not.toBe(ceremonia.typography.heading_family);
  });

  it('typography.case differs between tenants (Eric=all-caps, Ceremonia=sentence)', () => {
    const eric = loadDesignSystem('ericedmeades');
    const ceremonia = loadDesignSystem('ceremonia');
    expect(eric.typography.case).toBe('all-caps');
    expect(ceremonia.typography.case).toBe('sentence');
    expect(eric.typography.case).not.toBe(ceremonia.typography.case);
  });

  // --- Logo URLs are tenant-specific ---

  it('logo URLs are distinct per tenant', () => {
    const eric = loadDesignSystem('ericedmeades');
    const ceremonia = loadDesignSystem('ceremonia');
    expect(eric.logo.url).not.toBe(ceremonia.logo.url);
  });

  it("Eric's logo URL references ericedmeades.com domain", () => {
    const eric = loadDesignSystem('ericedmeades');
    expect(eric.logo.url).toContain('ericedmeades.com');
  });

  it("Ceremonia's logo URL references ceremoniacircle.org domain", () => {
    const ceremonia = loadDesignSystem('ceremonia');
    expect(ceremonia.logo.url).toContain('ceremoniacircle.org');
  });
});
