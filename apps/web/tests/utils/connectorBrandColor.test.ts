import { describe, expect, it } from 'vitest';

import { connectorBrandColor } from '../../src/utils/connectorBrandColor';

function parseHex(hex: string): { r: number; g: number; b: number } {
  const int = parseInt(hex.replace('#', ''), 16);
  return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
}

function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// chat.css derives the pill text as `color-mix(in srgb, var(--m-hue) 72%, var(--text))`.
// Mirror that here so the regression checks the value users actually read, not
// just the raw hue. Dark theme `--text` is the light `#e8e4dc`.
const DARK_TEXT = { r: 0xe8, g: 0xe4, b: 0xdc };
function pillTextLuminance(hue: string): number {
  const { r, g, b } = parseHex(hue);
  const mix = {
    r: r * 0.72 + DARK_TEXT.r * 0.28,
    g: g * 0.72 + DARK_TEXT.g * 0.28,
    b: b * 0.72 + DARK_TEXT.b * 0.28,
  };
  return (0.2126 * mix.r + 0.7152 * mix.g + 0.0722 * mix.b) / 255;
}

describe('connectorBrandColor', () => {
  it('returns the curated brand color verbatim in light mode', () => {
    expect(connectorBrandColor({ id: 'notion', name: 'Notion' }, 'light')).toBe('#0B0B0B');
    expect(connectorBrandColor({ id: 'figma', name: 'Figma' }, 'light')).toBe('#A259FF');
  });

  it('matches curated colors by id or by name, case-insensitively', () => {
    expect(connectorBrandColor({ id: 'GitHub', name: 'GitHub' }, 'light')).toBe('#1F2328');
    expect(connectorBrandColor({ id: 'unknown-id', name: 'Linear' }, 'light')).toBe('#5E6AD2');
  });

  it('returns a deterministic fallback for unknown connectors', () => {
    const a = connectorBrandColor({ id: 'acme-crm', name: 'Acme CRM' }, 'light');
    const b = connectorBrandColor({ id: 'acme-crm', name: 'Acme CRM' }, 'light');
    expect(a).toBe(b);
    expect(a).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  // Regression for the dark-theme contrast bug: a near-black curated brand
  // (Notion `#0B0B0B`) used to make the pill text `color-mix(hue 72%, --text)`
  // collapse to dark-on-dark against the dark `--green-bg`. The dark hue must
  // be lightened enough that the derived pill text stays clearly legible.
  it('keeps near-black curated connectors readable in dark mode', () => {
    for (const c of [
      { id: 'notion', name: 'Notion' },
      { id: 'github', name: 'GitHub' },
      { id: 'slack', name: 'Slack' },
    ]) {
      const light = connectorBrandColor(c, 'light');
      const dark = connectorBrandColor(c, 'dark');
      // The dark variant is lighter than the (near-black) light curated value…
      expect(luminance(dark)).toBeGreaterThan(luminance(light));
      // …and the text users actually see reads light against the dark pill bg.
      expect(pillTextLuminance(dark)).toBeGreaterThan(0.45);
    }
  });

  it('leaves already-light brand colors unchanged in dark mode', () => {
    // Figma purple is bright enough to read as-is; do not over-lighten it.
    expect(connectorBrandColor({ id: 'figma', name: 'Figma' }, 'dark')).toBe('#A259FF');
  });
});
