import { roundToCenti } from "../../utils/rounding";

export interface ClipPathInsetSides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type ParsedInsetClipPathSides = ClipPathInsetSides & { radius: number };

function formatClipNumber(value: number): string {
  const rounded = roundToCenti(value);
  return Number.isInteger(rounded)
    ? `${rounded}`
    : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatClipPx(value: number): string {
  return `${formatClipNumber(Math.max(0, value))}px`;
}

function parseInsetLengthPx(value: string): number | null {
  const normalized = value.trim();
  if (normalized === "0") return 0;
  const match = /^(-?\d+(?:\.\d+)?)px$/i.exec(normalized);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function sidesFromInsetTokens(tokens: number[]): ClipPathInsetSides | null {
  if (tokens.length < 1 || tokens.length > 4) return null;
  // CSS shorthand expansion: T | T R | T R B | T R B L
  const [top, right = top, bottom = top, left = right] = tokens;
  if (top === undefined || right === undefined || bottom === undefined || left === undefined) {
    return null;
  }
  return { top, right, bottom, left };
}

export function inferClipPathPreset(
  value: string | undefined,
): "none" | "inset" | "circle" | "custom" {
  const normalized = value?.trim();
  if (!normalized || normalized === "none") return "none";
  if (/^inset\(/i.test(normalized)) return "inset";
  if (/^circle\(/i.test(normalized)) return "circle";
  return "custom";
}

export function parseInsetClipPathSides(
  value: string | undefined,
): ParsedInsetClipPathSides | null {
  // Unambiguous pattern (no nested optional whitespace) to avoid polynomial
  // backtracking on adversarial input; trim the payload instead.
  const match = /^inset\(([^()]*)\)$/i.exec(value?.trim() ?? "");
  if (!match) return null;
  const parts = match[1]
    .trim()
    .replace(/\s+/g, " ")
    .split(/ round /i);
  const insetPart = parts[0]?.trim();
  if (!insetPart || parts.length > 2) return null;

  const tokens = insetPart.split(/\s+/).map(parseInsetLengthPx);
  if (tokens.some((token) => token == null)) return null;
  const numericTokens: number[] = [];
  for (const token of tokens) {
    if (token == null) return null;
    numericTokens.push(token);
  }
  const sides = sidesFromInsetTokens(numericTokens);
  if (!sides) return null;

  const radiusPart = parts[1]?.trim();
  const radius = radiusPart ? parseInsetLengthPx(radiusPart) : 0;
  if (radius == null) return null;
  return { ...sides, radius };
}

export function getClipPathInsetPx(value: string | undefined): number {
  const parsed = parseInsetClipPathSides(value);
  if (!parsed) return 0;
  const { top, right, bottom, left } = parsed;
  return top === right && top === bottom && top === left ? top : 0;
}

export function buildClipPathValue(
  preset: "none" | "inset" | "circle" | "custom",
  radiusValue: number,
  fallback: string | undefined,
) {
  if (preset === "custom") return fallback?.trim() || "none";
  if (preset === "circle") return "circle(50% at 50% 50%)";
  if (preset === "inset") {
    return `inset(0 round ${formatClipNumber(Math.max(0, radiusValue))}px)`;
  }
  return "none";
}

export function buildInsetClipPathSides(sides: ClipPathInsetSides, radiusPx: number = 0): string {
  const values = [sides.top, sides.right, sides.bottom, sides.left].map(formatClipPx);
  const [top, right, bottom, left] = values;
  const inset =
    top === right && top === bottom && top === left ? top : `${top} ${right} ${bottom} ${left}`;
  const radius = Math.max(0, radiusPx);
  return radius > 0 ? `inset(${inset} round ${formatClipNumber(radius)}px)` : `inset(${inset})`;
}

export function buildInsetClipPathValue(insetPx: number, radiusValue: number): string {
  return `inset(${formatClipPx(insetPx)} round ${formatClipNumber(Math.max(0, radiusValue))}px)`;
}
