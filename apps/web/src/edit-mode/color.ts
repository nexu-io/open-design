/**
 * Pure color math for the manual-edit color picker: parse CSS color strings
 * (hex / rgb / rgba), convert between RGB and HSV, and format the picked
 * value back to CSS. Kept DOM-free so it stays unit-testable.
 */

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  /** 0..1 */
  a: number;
}

export interface HsvColor {
  /** 0..360 */
  h: number;
  /** 0..1 */
  s: number;
  /** 0..1 */
  v: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function channel(value: number): number {
  return clamp(Math.round(value), 0, 255);
}

export function parseCssColor(value: string | undefined | null): RgbaColor | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const hex = raw.match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a] = hex.split('');
      return {
        r: parseInt(`${r}${r}`, 16),
        g: parseInt(`${g}${g}`, 16),
        b: parseInt(`${b}${b}`, 16),
        a: a ? parseInt(`${a}${a}`, 16) / 255 : 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }
  const rgb = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgb) {
    return {
      r: channel(Number(rgb[1])),
      g: channel(Number(rgb[2])),
      b: channel(Number(rgb[3])),
      a: rgb[4] === undefined ? 1 : clamp(Number(rgb[4]), 0, 1),
    };
  }
  return null;
}

export function rgbToHsv({ r, g, b }: Pick<RgbaColor, 'r' | 'g' | 'b'>): HsvColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb({ h, s, v }: HsvColor): Pick<RgbaColor, 'r' | 'g' | 'b'> {
  const hn = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = v - c;
  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (hn < 60) [rn, gn, bn] = [c, x, 0];
  else if (hn < 120) [rn, gn, bn] = [x, c, 0];
  else if (hn < 180) [rn, gn, bn] = [0, c, x];
  else if (hn < 240) [rn, gn, bn] = [0, x, c];
  else if (hn < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];
  return { r: channel((rn + m) * 255), g: channel((gn + m) * 255), b: channel((bn + m) * 255) };
}

export function rgbToHex({ r, g, b }: Pick<RgbaColor, 'r' | 'g' | 'b'>): string {
  const part = (v: number) => channel(v).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** CSS output: opaque colors stay hex; translucent ones become rgba(). */
export function formatCssColor(color: RgbaColor): string {
  const a = clamp(color.a, 0, 1);
  if (a >= 1) return rgbToHex(color);
  return `rgba(${channel(color.r)}, ${channel(color.g)}, ${channel(color.b)}, ${Math.round(a * 100) / 100})`;
}
