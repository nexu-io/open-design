import { describe, expect, it } from 'vitest';
import { formatPickerColor, parsePickerColor, pickerCss, pickerHex, pickerHsl, rgbToPicker } from '../../src/edit-mode/color-picker';
import { normalizeManualEditStyles } from '../../src/components/ManualEditPanel';

describe('manual edit color conversion', () => {
  it('formats the same color consistently in the field and picker without losing alpha', () => {
    const color = parsePickerColor('#625d5680')!;
    expect(formatPickerColor(color, 'hex')).toBe('#625d5680');
    expect(formatPickerColor(color, 'rgb')).toBe('rgba(98, 93, 86, 0.502)');
    expect(formatPickerColor(color, 'css')).toBe('rgba(98, 93, 86, 0.502)');
    expect(formatPickerColor(color, 'hsl')).toMatch(/^hsla\(.+, 0\.502\)$/);
  });
  it.each(['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#16130d'])('round trips %s without changing dark or neutral colors', hex => {
    expect(pickerHex(parsePickerColor(hex)!)).toBe(hex);
  });
  it('preserves fully transparent black and shorthand alpha', () => {
    expect(parsePickerColor('#0000')).toEqual({ h: 0, s: 0, v: 0, a: 0 });
    expect(pickerCss(parsePickerColor('#0000')!)).toBe('rgba(0, 0, 0, 0)');
    expect(parsePickerColor('#f008')?.a).toBeCloseTo(136 / 255);
  });
  it('maps horizontal saturation and vertical brightness independently', () => {
    expect(pickerHex({ h: 0, s: 0, v: 1, a: 1 })).toBe('#ffffff');
    expect(pickerHex({ h: 0, s: 1, v: 1, a: 1 })).toBe('#ff0000');
    expect(pickerHex({ h: 0, s: 1, v: 0, a: 1 })).toBe('#000000');
    expect(pickerHsl(rgbToPicker(255, 0, 0))).toEqual([0, 100, 50]);
  });
  it('allows alpha colors through the editor patch validator', () => {
    expect(normalizeManualEditStyles({ color: '#ff000080', backgroundColor: '#00000000' }, { layoutEnabled: false })).toEqual({ ok: true, styles: { color: '#ff000080', backgroundColor: '#00000000' } });
  });
  it('rejects incomplete colors', () => {
    expect(parsePickerColor('#12')).toBeNull();
    expect(parsePickerColor('')).toBeNull();
  });
});
