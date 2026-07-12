import { describe, expect, it } from 'vitest';

import {
  evalSwiftNumber,
  extractSwiftColors,
  hsbToHex,
  rgbUnitToHex,
} from '../../src/design-systems/swift-colors.js';

describe('evalSwiftNumber', () => {
  it('reads decimals, ints, hex bytes, and single divisions', () => {
    expect(evalSwiftNumber('0.99')).toBeCloseTo(0.99, 5);
    expect(evalSwiftNumber('255')).toBe(255);
    expect(evalSwiftNumber('0xF4')).toBe(244);
    expect(evalSwiftNumber('0xF4 / 255')).toBeCloseTo(244 / 255, 5);
    expect(evalSwiftNumber('220 / 360')).toBeCloseTo(220 / 360, 5);
  });

  it('returns null for anything it cannot evaluate safely', () => {
    expect(evalSwiftNumber('someVar')).toBeNull();
    expect(evalSwiftNumber('1 / 0')).toBeNull();
    expect(evalSwiftNumber('1 + 2 + 3')).toBeNull();
  });
});

describe('hsbToHex / rgbUnitToHex', () => {
  it('converts the SwiftUI HSB grey50 token to hex', () => {
    // static let grey50 = Color(hue: 220 / 360, saturation: 0.02, brightness: 0.99)
    expect(hsbToHex(220 / 360, 0.02, 0.99)).toBe('#f7f9fc');
  });

  it('converts unit RGB to hex', () => {
    expect(rgbUnitToHex(0xf4 / 255, 0xf4 / 255, 0xf4 / 255)).toBe('#f4f4f4');
    expect(rgbUnitToHex(0, 0, 0)).toBe('#000000');
    expect(rgbUnitToHex(1, 1, 1)).toBe('#ffffff');
  });
});

describe('extractSwiftColors', () => {
  it('parses HSB and RGB Color declarations with names', () => {
    const src = [
      'enum ColorSystem {',
      '  static let grey50 = Color(hue: 220 / 360, saturation: 0.02, brightness: 0.99)',
      '  static let appShellLight = Color(red: 0xF4 / 255, green: 0xF4 / 255, blue: 0xF4 / 255)',
      '  static let scrim = Color(white: 0.0, opacity: 0.4)',
      '}',
    ].join('\n');
    expect(extractSwiftColors(src)).toEqual([
      { name: 'grey50', hex: '#f7f9fc' },
      { name: 'appShellLight', hex: '#f4f4f4' },
      { name: 'scrim', hex: '#000000' },
    ]);
  });

  it('skips named asset colors that carry no component values', () => {
    expect(extractSwiftColors('let accent = Color("AccentColor")')).toEqual([]);
  });

  it('does not backtrack catastrophically on a long modifier run', () => {
    // Regression: the optional `(?:static|public|private|internal)*` prefix
    // re-scanned at every offset, so a run of `static ` with no `let`/`var`
    // was O(n^2) (a large DESIGN.md could hang the daemon during listing).
    // Bounding the modifier group to {0,4} keeps the global scan linear.
    const src = 'static '.repeat(16000);
    const start = performance.now();
    const result = extractSwiftColors(src);
    const elapsedMs = performance.now() - start;
    expect(result).toEqual([]);
    expect(elapsedMs).toBeLessThan(500);
  });
});
