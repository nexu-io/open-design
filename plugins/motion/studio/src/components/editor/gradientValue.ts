import { roundToCenti } from "../../utils/rounding";
import { parseCssColor, type ParsedColor } from "./colorValue";

export type GradientKind = "linear" | "radial" | "conic";

export type RadialSizeKeyword =
  | "closest-side"
  | "closest-corner"
  | "farthest-side"
  | "farthest-corner";

export interface GradientStop {
  color: string;
  position: number;
}

export interface GradientModel {
  kind: GradientKind;
  repeating: boolean;
  angle: number;
  centerX: number;
  centerY: number;
  shape: "circle" | "ellipse";
  radialSize: RadialSizeKeyword;
  stops: GradientStop[];
}

const RADIAL_SIZE_KEYWORDS: RadialSizeKeyword[] = [
  "closest-side",
  "closest-corner",
  "farthest-side",
  "farthest-corner",
];

function isWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t" || char === "\f";
}

function isDigit(char: string | undefined): boolean {
  return char != null && char >= "0" && char <= "9";
}

function isSimpleNumber(value: string): boolean {
  if (!value) return false;
  let index = value[0] === "-" ? 1 : 0;
  let digits = 0;

  while (isDigit(value[index])) {
    index += 1;
    digits += 1;
  }

  if (value[index] === ".") {
    index += 1;
    while (isDigit(value[index])) {
      index += 1;
      digits += 1;
    }
  }

  return digits > 0 && index === value.length;
}

function parseCssNumber(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!isSimpleNumber(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitCssWhitespace(value: string): string[] {
  const tokens: string[] = [];
  let current = "";

  for (const char of value) {
    if (isWhitespace(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}

function hasCssWord(value: string, word: string): boolean {
  return splitCssWhitespace(value.toLowerCase()).includes(word);
}

function parsePercentToken(value: string | undefined, fallback: number): number {
  if (!value?.endsWith("%")) return fallback;
  const parsed = parseCssNumber(value.slice(0, -1));
  return parsed == null ? fallback : clamp(parsed, 0, 100);
}

function parseAngleToken(value: string | undefined): number | null {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed?.endsWith("deg")) return null;
  return parseCssNumber(trimmed.slice(0, -3));
}

function trailingPercentStart(value: string): number | null {
  if (!value.endsWith("%")) return null;
  const withoutUnit = value.slice(0, -1).trimEnd();
  let start = withoutUnit.length;

  while (start > 0 && (isDigit(withoutUnit[start - 1]) || withoutUnit[start - 1] === ".")) {
    start -= 1;
  }

  if (start > 0 && withoutUnit[start - 1] === "-") {
    start -= 1;
  }

  const token = withoutUnit.slice(start);
  if (!isSimpleNumber(token)) return null;
  if (start === 0 || !isWhitespace(withoutUnit[start - 1])) return null;
  return start;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const round = roundToCenti;

function parsePercent(value: string | undefined, fallback: number): number {
  const parsed = parseCssNumber(value);
  return parsed == null ? fallback : clamp(parsed, 0, 100);
}

function parseColorStop(raw: string): { color: string; position: number | null } {
  const trimmed = raw.trim();
  const percentStart = trailingPercentStart(trimmed);
  if (percentStart == null) return { color: trimmed, position: null };

  const withoutUnit = trimmed.slice(0, -1).trimEnd();
  return {
    color: withoutUnit.slice(0, percentStart).trim(),
    position: parsePercent(withoutUnit.slice(percentStart), 0),
  };
}

function normalizeStops(stops: Array<{ color: string; position: number | null }>): GradientStop[] {
  if (stops.length === 0) {
    return [
      { color: "rgba(60, 230, 172, 0.18)", position: 0 },
      { color: "rgba(255, 255, 255, 0.04)", position: 100 },
    ];
  }

  if (stops.length === 1) {
    return [
      { color: stops[0].color, position: 0 },
      { color: stops[0].color, position: 100 },
    ];
  }

  const result = stops.map((stop, index) => ({
    color: stop.color,
    position: stop.position ?? (index / (stops.length - 1)) * 100,
  }));

  return result.map((stop) => ({
    color: stop.color,
    position: round(clamp(stop.position, 0, 100)),
  }));
}

function splitGradientArgs(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);

    if (char === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function directionToAngle(value: string): number | null {
  const normalized = value.trim().toLowerCase();
  const map: Record<string, number> = {
    "to top": 0,
    "to top right": 45,
    "to right top": 45,
    "to right": 90,
    "to bottom right": 135,
    "to right bottom": 135,
    "to bottom": 180,
    "to bottom left": 225,
    "to left bottom": 225,
    "to left": 270,
    "to top left": 315,
    "to left top": 315,
  };
  return normalized in map ? map[normalized] : null;
}

function parseLinearArgs(parts: string[]): GradientModel {
  const first = parts[0] ?? "";
  const angleFromDirection = directionToAngle(first);
  const parsedAngle = parseAngleToken(first);
  const firstIsAngle = parsedAngle != null;
  const angle = parsedAngle ?? angleFromDirection ?? 180;
  const stopParts = firstIsAngle || angleFromDirection != null ? parts.slice(1) : parts;

  return {
    kind: "linear",
    repeating: false,
    angle,
    centerX: 50,
    centerY: 50,
    shape: "ellipse",
    radialSize: "farthest-corner",
    stops: normalizeStops(stopParts.map(parseColorStop)),
  };
}

function parseRadialArgs(parts: string[]): GradientModel {
  const first = parts[0] ?? "";
  const firstLower = first.toLowerCase();
  const hasConfig =
    hasCssWord(firstLower, "at") ||
    hasCssWord(firstLower, "circle") ||
    hasCssWord(firstLower, "ellipse") ||
    firstLower.includes("closest-") ||
    firstLower.includes("farthest-");
  const config = hasConfig ? first : "";
  const stopParts = hasConfig ? parts.slice(1) : parts;
  const configLower = config.toLowerCase();
  const configTokens = splitCssWhitespace(configLower);
  const atIndex = configTokens.indexOf("at");

  const shape = hasCssWord(configLower, "circle") ? "circle" : "ellipse";
  const radialSize =
    RADIAL_SIZE_KEYWORDS.find((keyword) => configTokens.includes(keyword)) ?? "farthest-corner";

  return {
    kind: "radial",
    repeating: false,
    angle: 180,
    centerX: parsePercentToken(configTokens[atIndex + 1], 50),
    centerY: parsePercentToken(configTokens[atIndex + 2], 50),
    shape,
    radialSize,
    stops: normalizeStops(stopParts.map(parseColorStop)),
  };
}

function parseConicArgs(parts: string[]): GradientModel {
  const first = parts[0] ?? "";
  const firstLower = first.toLowerCase();
  const hasConfig = hasCssWord(firstLower, "from") || hasCssWord(firstLower, "at");
  const config = hasConfig ? first : "";
  const stopParts = hasConfig ? parts.slice(1) : parts;
  const configTokens = splitCssWhitespace(config.toLowerCase());
  const fromIndex = configTokens.indexOf("from");
  const atIndex = configTokens.indexOf("at");
  const angle = parseAngleToken(configTokens[fromIndex + 1]);

  return {
    kind: "conic",
    repeating: false,
    angle: angle ?? 0,
    centerX: parsePercentToken(configTokens[atIndex + 1], 50),
    centerY: parsePercentToken(configTokens[atIndex + 2], 50),
    shape: "ellipse",
    radialSize: "farthest-corner",
    stops: normalizeStops(stopParts.map(parseColorStop)),
  };
}

export function buildDefaultGradientModel(fallbackColor?: string): GradientModel {
  return {
    kind: "linear",
    repeating: false,
    angle: 135,
    centerX: 50,
    centerY: 50,
    shape: "ellipse",
    radialSize: "farthest-corner",
    stops: normalizeStops([
      {
        color:
          fallbackColor && fallbackColor !== "transparent"
            ? fallbackColor
            : "rgba(60, 230, 172, 0.18)",
        position: 0,
      },
      { color: "rgba(255, 255, 255, 0.04)", position: 100 },
    ]),
  };
}

export function parseGradient(value: string | undefined): GradientModel | null {
  if (!value || value === "none") return null;
  const trimmed = value.trim();
  const openParenIndex = trimmed.indexOf("(");
  if (openParenIndex <= 0 || !trimmed.endsWith(")")) return null;

  const functionName = trimmed.slice(0, openParenIndex).toLowerCase();
  const kindByFunctionName: Record<string, { kind: GradientKind; repeating: boolean }> = {
    "linear-gradient": { kind: "linear", repeating: false },
    "radial-gradient": { kind: "radial", repeating: false },
    "conic-gradient": { kind: "conic", repeating: false },
    "repeating-linear-gradient": { kind: "linear", repeating: true },
    "repeating-radial-gradient": { kind: "radial", repeating: true },
    "repeating-conic-gradient": { kind: "conic", repeating: true },
  };
  const parsedFunction = kindByFunctionName[functionName];
  if (!parsedFunction) return null;

  const { kind, repeating } = parsedFunction;
  const parts = splitGradientArgs(trimmed.slice(openParenIndex + 1, -1));

  const parsed =
    kind === "linear"
      ? parseLinearArgs(parts)
      : kind === "radial"
        ? parseRadialArgs(parts)
        : parseConicArgs(parts);

  return { ...parsed, repeating };
}

function formatStop(stop: GradientStop): string {
  return `${stop.color} ${round(stop.position)}%`;
}

export function serializeGradient(model: GradientModel): string {
  const fn = `${model.repeating ? "repeating-" : ""}${model.kind}-gradient`;
  const stops = model.stops.map(formatStop).join(", ");

  if (model.kind === "linear") {
    return `${fn}(${round(model.angle)}deg, ${stops})`;
  }

  if (model.kind === "radial") {
    return `${fn}(${model.shape} ${model.radialSize} at ${round(model.centerX)}% ${round(
      model.centerY,
    )}%, ${stops})`;
  }

  return `${fn}(from ${round(model.angle)}deg at ${round(model.centerX)}% ${round(
    model.centerY,
  )}%, ${stops})`;
}

function blendChannel(start: number, end: number, ratio: number): number {
  return Math.round(start + (end - start) * ratio);
}

function formatHex(channel: number): string {
  return channel.toString(16).padStart(2, "0");
}

function interpolateGradientStopColor(model: GradientModel, position: number): string {
  const clampedPosition = clamp(position, 0, 100);
  const sortedStops = [...model.stops].sort((a, b) => a.position - b.position);
  const exact = sortedStops.find((stop) => Math.abs(stop.position - clampedPosition) < 0.001);
  if (exact) return exact.color;

  const right = sortedStops.find((stop) => stop.position > clampedPosition) ?? sortedStops.at(-1);
  const left =
    [...sortedStops].reverse().find((stop) => stop.position < clampedPosition) ?? sortedStops[0];
  if (!left || !right) return sortedStops[0]?.color ?? "rgba(255, 255, 255, 1)";
  if (left === right) return left.color;

  const leftColor = left.color;
  const rightColor = right.color;
  const ratio = (clampedPosition - left.position) / Math.max(1, right.position - left.position);
  const mixed = parseCssColor(mixLikeTheGradient(sortedStops, leftColor, rightColor, ratio));
  if (mixed) return formatStopColor(mixed);

  const leftParsed = leftColor ? parseCssColor(leftColor) : null;
  const rightParsed = rightColor ? parseCssColor(rightColor) : null;
  if (!leftParsed || !rightParsed) return left.color;

  const red = blendChannel(leftParsed.red, rightParsed.red, ratio);
  const green = blendChannel(leftParsed.green, rightParsed.green, ratio);
  const blue = blendChannel(leftParsed.blue, rightParsed.blue, ratio);
  const alpha = leftParsed.alpha + (rightParsed.alpha - leftParsed.alpha) * ratio;
  return formatStopColor({ red, green, blue, alpha });
}

const LEGACY_COLOR = /^(?:#|(?:rgba?|hsla?|hwb)\(|[a-z]+$)/i;

const isLegacy = (color: string) => LEGACY_COLOR.test(color.trim());
const isModern = (color: string) => !isLegacy(color) && !/^var\(/i.test(color.trim());

function mixLikeTheGradient(
  stops: GradientStop[],
  left: string,
  right: string,
  ratio: number,
): string {
  const space = stops.some((stop) => isModern(stop.color)) ? "oklab" : "srgb";
  return `color-mix(in ${space}, ${left}, ${right} ${round(ratio * 100)}%)`;
}

function formatStopColor(color: ParsedColor): string {
  const { red, green, blue } = color;
  const alpha = round(color.alpha);
  if (alpha >= 1) {
    return `#${formatHex(red)}${formatHex(green)}${formatHex(blue)}`.toUpperCase();
  }
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function insertGradientStop(model: GradientModel, position: number): GradientModel {
  const clampedPosition = round(clamp(position, 0, 100));
  const color = interpolateGradientStopColor(model, clampedPosition);
  const nextStops = [...model.stops, { color, position: clampedPosition }].sort(
    (a, b) => a.position - b.position,
  );
  return {
    ...model,
    stops: nextStops,
  };
}
