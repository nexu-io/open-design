export interface PickerColor { h: number; s: number; v: number; a: number }
export type PickerFormat = 'hex' | 'rgb' | 'hsl' | 'css';

/** The HEX field shows RGB only; opacity has its own control. */
export function formatPickerDisplay(color: PickerColor, format: PickerFormat): string {
  return format === 'hex' ? pickerHex(color) : formatPickerColor(color, format);
}

export function formatPickerColor(color: PickerColor, format: PickerFormat): string {
  const alpha = Math.round(color.a * 1000) / 1000;
  if (format === 'css') return pickerCss(color);
  if (format === 'rgb') return color.a === 1 ? `rgb(${pickerRgb(color).join(', ')})` : `rgba(${pickerRgb(color).join(', ')}, ${alpha})`;
  if (format === 'hsl') {
    const [h, s, l] = pickerHsl(color);
    return color.a === 1 ? `hsl(${h}, ${s}%, ${l}%)` : `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
  }
  return pickerHex(color) + (color.a === 1 ? '' : Math.round(color.a * 255).toString(16).padStart(2, '0'));
}
export const clampColor = (n: number, max = 1) => Math.min(max, Math.max(0, n));

export function rgbToPicker(r: number, g: number, b: number, a = 1): PickerColor {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: max === 0 ? 0 : d / max, v: max, a };
}

export function pickerRgb({ h, s, v }: PickerColor): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}

export function pickerHex(color: PickerColor): string {
  return '#' + pickerRgb(color).map(n => n.toString(16).padStart(2, '0')).join('');
}

export function pickerCss(color: PickerColor): string {
  return color.a === 1 ? pickerHex(color) : `rgba(${pickerRgb(color).join(', ')}, ${Math.round(color.a * 1000) / 1000})`;
}

export function pickerHsl(color: PickerColor): [number, number, number] {
  const l = color.v * (1 - color.s / 2);
  const s = l === 0 || l === 1 ? 0 : (color.v - l) / Math.min(l, 1 - l);
  return [Math.round(color.h), Math.round(s * 100), Math.round(l * 100)];
}

/** Canvas resolves modern CSS colors (including OKLCH) in the same browser as the preview. */
export function parsePickerColor(input: string): PickerColor | null {
  const text = input.trim();
  const hex = text.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (hex) {
    let raw = hex[1]!;
    if (raw.length < 5) raw = [...raw].map(c => c + c).join('');
    return rgbToPicker(parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16), raw.length === 8 ? parseInt(raw.slice(6), 16) / 255 : 1);
  }
  if (text === 'transparent') return rgbToPicker(0, 0, 0, 0);
  if (!text || typeof CSS === 'undefined' || typeof CSS.supports !== 'function' || !CSS.supports('color', text) || /^(inherit|initial|unset|revert|currentcolor)$|var\(/i.test(text)) return null;
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = text;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return rgbToPicker(r!, g!, b!, a! / 255);
}
