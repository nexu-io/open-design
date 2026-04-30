// Spec 101 T058 — Ceremonia brand fidelity test.
// Verifies that loadDesignSystem('ceremonia') returns the correct tokens per
// apps/daemon/src/design-systems/ceremonia/index.ts.
// NO network calls, NO HTML generation — pure module-load assertions.

import { describe, it, expect } from 'vitest';
import { loadDesignSystem } from '../../src/design-systems/_loader.js';

describe('ceremonia brand fidelity (T058)', () => {
  const ds = loadDesignSystem('ceremonia');

  // --- Palette — warm/grounded, NOT B&W monochrome ---

  it('palette accent is Ceremonia teal (#14B8A6), a warm-organic color', () => {
    // Teal is the primary brand differentiator: --site-accent from DESIGN.md
    expect(ds.palette.accent).toBe('#14B8A6');
  });

  it('palette subtle_bg is warm tint (#F0FDFA)', () => {
    // --site-bg-tint: a faint teal/cream, NOT a gray
    expect(ds.palette.subtle_bg).toBe('#F0FDFA');
  });

  it('palette contains at least one warm/organic color (teal or cream family)', () => {
    const values = Object.values(ds.palette);
    // Warm-organic colors: teal accent + teal-tinted subtle_bg
    const warmColors = ['#14B8A6', '#F0FDFA'];
    const found = warmColors.filter((c) => values.includes(c));
    expect(found.length).toBeGreaterThan(0);
  });

  it('palette does NOT use Eric bronze accent (#B08D57)', () => {
    const values = Object.values(ds.palette);
    expect(values).not.toContain('#B08D57');
  });

  it('palette.body_text is muted gray (#4A4A4A), NOT pure black', () => {
    expect(ds.palette.body_text).toBe('#4A4A4A');
  });

  // --- Typography — Merriweather + Open Sans, NOT Inter all-caps ---

  it('typography heading_family includes "Merriweather" (serif, NOT Inter)', () => {
    expect(ds.typography.heading_family).toContain('Merriweather');
    expect(ds.typography.heading_family).not.toContain('Inter');
  });

  it('typography body_family includes "Open Sans"', () => {
    expect(ds.typography.body_family).toContain('Open Sans');
  });

  it('typography case is "sentence" (NOT all-caps like Eric)', () => {
    expect(ds.typography.case).toBe('sentence');
  });

  it('typography tracking is "normal" (NOT tight like Eric)', () => {
    expect(ds.typography.tracking).toBe('normal');
  });

  it('typography differs from Eric: heading_family is Merriweather (serif), Eric uses Inter (sans-serif)', () => {
    const eric = loadDesignSystem('ericedmeades');
    expect(ds.typography.heading_family).not.toBe(eric.typography.heading_family);
    // Ceremonia heading family starts with Merriweather (a serif font)
    expect(ds.typography.heading_family).toContain('Merriweather');
    // Eric heading family does NOT contain Merriweather
    expect(eric.typography.heading_family).not.toContain('Merriweather');
    // Eric heading family contains Inter; Ceremonia does NOT
    expect(eric.typography.heading_family).toContain('Inter');
    expect(ds.typography.heading_family).not.toContain('Inter');
  });

  // --- Logo ---

  it('logo URL is the Ceremonia SVG at ceremoniacircle.org', () => {
    expect(ds.logo.url).toBe('https://ceremoniacircle.org/images/ceremonia-logo.svg');
  });

  it('logo URL is HTTPS', () => {
    expect(ds.logo.url).toMatch(/^https:\/\//);
  });

  // --- Voice tokens — warm + grounded ---

  it('voice_tokens contains "warm"', () => {
    expect(ds.voice_tokens).toContain('warm');
  });

  it('voice_tokens contains "grounded"', () => {
    expect(ds.voice_tokens).toContain('grounded');
  });

  it('voice_tokens contains "human"', () => {
    expect(ds.voice_tokens).toContain('human');
  });

  it('voice_tokens is non-empty', () => {
    expect(ds.voice_tokens.length).toBeGreaterThan(0);
  });

  // --- Voice avoid — constitution principle IV kill list ---

  it('voice_avoid contains "sacred container"', () => {
    expect(ds.voice_avoid).toContain('sacred container');
  });

  it('voice_avoid contains "held space"', () => {
    expect(ds.voice_avoid).toContain('held space');
  });

  it('voice_avoid contains "divine"', () => {
    expect(ds.voice_avoid).toContain('divine');
  });

  it('voice_avoid contains "quantum"', () => {
    expect(ds.voice_avoid).toContain('quantum');
  });

  it('voice_avoid contains "alignment"', () => {
    expect(ds.voice_avoid).toContain('alignment');
  });

  it('voice_avoid contains "activation"', () => {
    expect(ds.voice_avoid).toContain('activation');
  });

  it('voice_avoid contains "exciting news"', () => {
    expect(ds.voice_avoid).toContain('exciting news');
  });

  it("voice_avoid contains \"don't miss out\"", () => {
    expect(ds.voice_avoid).toContain("don't miss out");
  });

  // --- Sanity guard: voice_tokens must not contain any voice_avoid phrase ---
  // This prevents accidentally including forbidden phrases in the allowed list.
  // We simulate how a prompt-builder would enforce this at runtime.

  it('sanity: no voice_avoid phrase appears in voice_tokens (forbidden-list cross-check)', () => {
    const forbiddenSubstrings = ds.voice_avoid;
    for (const token of ds.voice_tokens) {
      for (const forbidden of forbiddenSubstrings) {
        expect(
          token.toLowerCase().includes(forbidden.toLowerCase()),
          `voice_token "${token}" contains forbidden phrase "${forbidden}"`,
        ).toBe(false);
      }
    }
  });

  // --- Structural completeness ---

  it('has all required DesignSystem top-level fields', () => {
    expect(ds).toHaveProperty('key');
    expect(ds).toHaveProperty('palette');
    expect(ds).toHaveProperty('typography');
    expect(ds).toHaveProperty('logo');
    expect(ds).toHaveProperty('hero_style');
    expect(ds).toHaveProperty('voice_tokens');
    expect(ds).toHaveProperty('voice_avoid');
  });

  it('hero_style is warm-organic', () => {
    expect(ds.hero_style).toBe('warm-organic');
  });
});
