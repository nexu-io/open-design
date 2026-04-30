// Spec 101 T057 — Eric Edmeades brand fidelity test.
// Verifies that loadDesignSystem('ericedmeades') returns the correct tokens per
// apps/daemon/src/design-systems/ericedmeades/index.ts.
// NO network calls, NO HTML generation — pure module-load assertions.

import { describe, it, expect } from 'vitest';
import { loadDesignSystem } from '../../src/design-systems/_loader.js';

describe('ericedmeades brand fidelity (T057)', () => {
  const ds = loadDesignSystem('ericedmeades');

  // --- Palette ---

  it('palette includes #000000 (primary black)', () => {
    const values = Object.values(ds.palette);
    expect(values).toContain('#000000');
  });

  it('palette includes #FFFFFF (white background)', () => {
    const values = Object.values(ds.palette);
    expect(values).toContain('#FFFFFF');
  });

  it('palette includes #B08D57 (warm bronze accent)', () => {
    const values = Object.values(ds.palette);
    expect(values).toContain('#B08D57');
  });

  it('palette.primary is black (#000000)', () => {
    expect(ds.palette.primary).toBe('#000000');
  });

  it('palette.bg is white (#FFFFFF)', () => {
    expect(ds.palette.bg).toBe('#FFFFFF');
  });

  it('palette.accent is warm bronze (#B08D57)', () => {
    expect(ds.palette.accent).toBe('#B08D57');
  });

  // --- Typography ---

  it('typography heading_family includes "Inter"', () => {
    expect(ds.typography.heading_family).toContain('Inter');
  });

  it('typography body_family includes "Inter"', () => {
    expect(ds.typography.body_family).toContain('Inter');
  });

  it('typography case is all-caps (uppercase enforced)', () => {
    expect(ds.typography.case).toBe('all-caps');
  });

  it('typography weights are non-empty', () => {
    expect(Array.isArray(ds.typography.weights)).toBe(true);
    expect(ds.typography.weights.length).toBeGreaterThan(0);
  });

  // --- Logo ---

  it('logo URL matches the expected Eric Edmeades full-logo path', () => {
    // Exact value from ericedmeades/index.ts:
    expect(ds.logo.url).toBe('https://ericedmeades.com/images/ee-logo-full.png');
  });

  it('logo URL is HTTPS', () => {
    expect(ds.logo.url).toMatch(/^https:\/\//);
  });

  // --- Voice tokens ---

  it('voice_tokens contains "BRING STOP IT TO YOUR EVENT"', () => {
    expect(ds.voice_tokens).toContain('BRING STOP IT TO YOUR EVENT');
  });

  it('voice_tokens contains "BUILT FOR THE STAGE"', () => {
    expect(ds.voice_tokens).toContain('BUILT FOR THE STAGE');
  });

  it('voice_tokens contains "TRANSFORMATION ARCHITECT"', () => {
    expect(ds.voice_tokens).toContain('TRANSFORMATION ARCHITECT');
  });

  it('voice_tokens has at least one expected brand phrase', () => {
    const expectedPhrases = [
      'BRING STOP IT TO YOUR EVENT',
      'BUILT FOR THE STAGE',
      'TRANSFORMATION ARCHITECT',
    ];
    const found = expectedPhrases.filter((p) => ds.voice_tokens.includes(p));
    expect(found.length).toBeGreaterThan(0);
  });

  // --- Voice avoid ---

  // NOTE: Eric's voice_avoid is NOT empty — it contains WildFit cross-contamination
  // guard and green-gradient leakage guard. The spec says "empty or undefined";
  // however the actual file has 3 entries for legitimate cross-contamination reasons.
  // We assert on the actual file values here and flag the discrepancy.
  //
  // FINDING: voice_avoid for Eric is NOT empty. It contains:
  //   ['WildFit', 'wellness coach', 'green gradient']
  // These guard against WildFit brand bleed and saturated-color leakage.
  // The spec task says "empty or undefined" — this is a spec/impl discrepancy.
  // Writing the test against actual file values; the design system file is NOT modified.

  it('voice_avoid is an array (may contain WildFit cross-contamination guards)', () => {
    expect(Array.isArray(ds.voice_avoid)).toBe(true);
  });

  it('voice_avoid does NOT contain Ceremonia-specific phrases', () => {
    // Eric's avoid list should not bleed in any Ceremonia tokens
    const ceremoniaTokens = ['sacred container', 'held space', 'divine', 'quantum', 'alignment'];
    for (const token of ceremoniaTokens) {
      expect(ds.voice_avoid).not.toContain(token);
    }
  });

  it('voice_avoid contains WildFit cross-contamination guard (per design system file)', () => {
    // FINDING: Eric voice_avoid is not empty; it guards against WildFit brand bleed.
    expect(ds.voice_avoid).toContain('WildFit');
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

  it('hero_style is dark-editorial (editorial brand)', () => {
    expect(ds.hero_style).toBe('dark-editorial');
  });
});
