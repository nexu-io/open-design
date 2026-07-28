import { describe, expect, it } from 'vitest';
import { formatCssColor, hsvToRgb, parseCssColor, rgbToHex, rgbToHsv } from '../../src/edit-mode/color';

describe('manual edit color math', () => {
  it('parses hex colors in 3/4/6/8 digit forms', () => {
    expect(parseCssColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor('#2563eb')).toEqual({ r: 37, g: 99, b: 235, a: 1 });
    expect(parseCssColor('#00000080')?.a).toBeCloseTo(0.5, 1);
    expect(parseCssColor('#f00c')?.a).toBeCloseTo(0.8, 1);
  });

  it('parses rgb()/rgba() strings and rejects garbage', () => {
    expect(parseCssColor('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseCssColor('rgba(17, 24, 39, 0.5)')).toEqual({ r: 17, g: 24, b: 39, a: 0.5 });
    expect(parseCssColor('')).toBeNull();
    expect(parseCssColor('#12345')).toBeNull();
    expect(parseCssColor('tomato')).toBeNull();
    expect(parseCssColor(undefined)).toBeNull();
  });

  it('round-trips rgb through hsv', () => {
    for (const rgb of [
      { r: 255, g: 0, b: 0 },
      { r: 37, g: 99, b: 235 },
      { r: 17, g: 24, b: 39 },
      { r: 255, g: 255, b: 255 },
      { r: 0, g: 0, b: 0 },
    ]) {
      const back = hsvToRgb(rgbToHsv(rgb));
      expect(back.r).toBeCloseTo(rgb.r, -0.6);
      expect(back.g).toBeCloseTo(rgb.g, -0.6);
      expect(back.b).toBeCloseTo(rgb.b, -0.6);
    }
  });

  it('keeps hue stable across desaturated values', () => {
    const rgb = hsvToRgb({ h: 210, s: 0, v: 1 });
    expect(rgb).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('formats opaque colors as hex and translucent ones as rgba', () => {
    expect(formatCssColor({ r: 37, g: 99, b: 235, a: 1 })).toBe('#2563eb');
    expect(formatCssColor({ r: 37, g: 99, b: 235, a: 0.4 })).toBe('rgba(37, 99, 235, 0.4)');
    expect(rgbToHex({ r: 0, g: 128, b: 255 })).toBe('#0080ff');
  });
});
