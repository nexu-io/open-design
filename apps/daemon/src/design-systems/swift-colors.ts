// Parse SwiftUI Color(...) declarations into named hex swatches.
//
// SwiftUI repos express palette tokens in source rather than CSS, e.g.
//   static let grey50 = Color(hue: 220 / 360, saturation: 0.02, brightness: 0.99)
//   static let appShellLight = Color(red: 0xF4 / 255, green: 0xF4 / 255, blue: 0xF4 / 255)
// so the design-system swatch extraction needs to read these forms and convert
// them to hex. Component values can be plain decimals (0.99), hex bytes (0xF4),
// or simple divisions (0xF4 / 255, 220 / 360).
//
// Note: Color(hue:saturation:brightness:) is HSB (brightness/value), not HSL,
// so the conversion uses the HSV math.

export interface SwiftColorToken {
  name: string;
  hex: string;
}

/**
 * Evaluate a single SwiftUI color component expression: a hex byte (`0xF4`), a
 * decimal (`0.99`), an integer (`255`), or a single division of those
 * (`0xF4 / 255`, `220 / 360`). Returns null when the expression is anything
 * more complex so callers can skip it rather than guess.
 */
export function evalSwiftNumber(expr: string): number | null {
  const parts = expr.split('/');
  if (parts.length > 2) return null;
  const values = parts.map((part) => {
    const token = part.trim();
    if (/^0x[0-9a-f]+$/i.test(token)) return Number.parseInt(token, 16);
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(token)) return Number.parseFloat(token);
    return Number.NaN;
  });
  if (values.some((value) => Number.isNaN(value))) return null;
  if (values.length === 1) return values[0]!;
  if (values[1] === 0) return null;
  return values[0]! / values[1]!;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function byteHex(unit: number): string {
  return Math.round(clampUnit(unit) * 255)
    .toString(16)
    .padStart(2, '0');
}

/** Build #rrggbb from red/green/blue unit floats (0..1). */
export function rgbUnitToHex(red: number, green: number, blue: number): string {
  return `#${byteHex(red)}${byteHex(green)}${byteHex(blue)}`;
}

/** Convert HSB/HSV unit floats (0..1) to #rrggbb. */
export function hsbToHex(hue: number, saturation: number, brightness: number): string {
  const h = ((hue % 1) + 1) % 1;
  const s = clampUnit(saturation);
  const v = clampUnit(brightness);
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let red = 0;
  let green = 0;
  let blue = 0;
  switch (i % 6) {
    case 0: red = v; green = t; blue = p; break;
    case 1: red = q; green = v; blue = p; break;
    case 2: red = p; green = v; blue = t; break;
    case 3: red = p; green = q; blue = v; break;
    case 4: red = t; green = p; blue = v; break;
    default: red = v; green = p; blue = q; break;
  }
  return rgbUnitToHex(red, green, blue);
}

function namedArg(args: string, key: string): number | null {
  const match = args.match(new RegExp(`\\b${key}\\s*:\\s*([^,)]+)`, 'u'));
  if (!match) return null;
  return evalSwiftNumber(match[1]!.trim());
}

function swiftColorArgsToHex(args: string): string | null {
  const red = namedArg(args, 'red');
  const green = namedArg(args, 'green');
  const blue = namedArg(args, 'blue');
  if (red !== null && green !== null && blue !== null) return rgbUnitToHex(red, green, blue);

  const hue = namedArg(args, 'hue');
  const saturation = namedArg(args, 'saturation');
  const brightness = namedArg(args, 'brightness');
  if (hue !== null && saturation !== null && brightness !== null) {
    return hsbToHex(hue, saturation, brightness);
  }

  // Color(white:) is grayscale.
  const white = namedArg(args, 'white');
  if (white !== null) return rgbUnitToHex(white, white, white);

  return null;
}

/**
 * Find SwiftUI `Color(...)` declarations in source/markdown and return them as
 * named hex swatches. Handles the `red:green:blue:`, `hue:saturation:brightness:`,
 * and `white:` initializers (a trailing `opacity:`/`alpha:` arg is ignored for
 * the swatch hex). A leading `let name =` / `var name =` / `static let name =`
 * names the swatch; named asset colors like `Color("Accent")` carry no value
 * and are skipped.
 */
export function extractSwiftColors(raw: string): SwiftColorToken[] {
  const tokens: SwiftColorToken[] = [];
  // The modifier run is bounded ({0,4}, not *) so a long line of `static ` with
  // no `let`/`var` can't force quadratic backtracking across the global scan.
  // Real Swift declarations carry at most a couple of leading modifiers.
  const declRe = /(?:(?:static\s+|public\s+|private\s+|internal\s+){0,4}(?:let|var)\s+([A-Za-z_]\w*)\s*(?::[^=\n]+)?=\s*)?\bColor\s*\(([^)]*)\)/gu;
  let match: RegExpExecArray | null;
  while ((match = declRe.exec(raw)) !== null) {
    const name = match[1] ?? '';
    const hex = swiftColorArgsToHex(match[2] ?? '');
    if (hex) tokens.push({ name, hex });
  }
  return tokens;
}
