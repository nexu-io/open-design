import { roundToCenti } from "../../utils/rounding";

export interface ParsedColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface HsvColor {
  hue: number;
  saturation: number;
  value: number;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampAlpha(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toHex(value: number): string {
  return clampChannel(value).toString(16).padStart(2, "0");
}

function formatAlpha(value: number): string {
  return `${roundToCenti(clampAlpha(value))}`;
}

function parseComponent(value: string, scale: number): number {
  return value.endsWith("%") ? (Number(value.slice(0, -1)) * scale) / 100 : Number(value);
}

const NUMBER = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const COMMA_RGB = new RegExp(
  String.raw`^rgba?\(\s*(${NUMBER})\s*,\s*(${NUMBER})\s*,\s*(${NUMBER})(?:\s*,\s*(${NUMBER}))?\s*\)$`,
);
const SPACE_RGB = new RegExp(
  String.raw`^rgba?\(\s*(${NUMBER}%?)\s+(${NUMBER}%?)\s+(${NUMBER}%?)(?:\s*\/\s*(${NUMBER}%?))?\s*\)$`,
);

function parseSerializedColor(value: string): ParsedColor | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === "transparent") {
    return { red: 0, green: 0, blue: 0, alpha: 0 };
  }

  const hex = trimmed.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex) {
    const digits = hex[1].length <= 4 ? [...hex[1]].map((digit) => digit + digit).join("") : hex[1];
    return {
      red: Number.parseInt(digits.slice(0, 2), 16),
      green: Number.parseInt(digits.slice(2, 4), 16),
      blue: Number.parseInt(digits.slice(4, 6), 16),
      alpha: digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgba = trimmed.match(COMMA_RGB) ?? trimmed.match(SPACE_RGB);
  if (rgba) {
    return {
      red: clampChannel(parseComponent(rgba[1], 255)),
      green: clampChannel(parseComponent(rgba[2], 255)),
      blue: clampChannel(parseComponent(rgba[3], 255)),
      alpha: clampAlpha(rgba[4] != null ? parseComponent(rgba[4], 1) : 1),
    };
  }

  return null;
}

let colorContext: CanvasRenderingContext2D | null = null;

function canResolveInBrowser(value: string): boolean {
  return (
    typeof document !== "undefined" &&
    typeof CSS !== "undefined" &&
    CSS.supports("color", value) &&
    !/\bcurrentcolor\b|\bvar\s*\(|\blight-dark\s*\(/i.test(value)
  );
}

function parseBrowserColor(value: string): ParsedColor | null {
  try {
    if (!canResolveInBrowser(value)) return null;
    colorContext ??= document.createElement("canvas").getContext("2d");
    if (!colorContext) return null;
    return (
      parseCanvasColor(
        colorContext,
        `color(from ${value} srgb r g b / alpha)`,
        parseSrgbSerialization,
      ) ?? parseCanvasColor(colorContext, value, parseSerializedColor)
    );
  } catch {
    return null;
  }
}

function parseCanvasColor(
  context: CanvasRenderingContext2D,
  value: string,
  parse: (serialized: string) => ParsedColor | null,
): ParsedColor | null {
  const serialized = readCanvasColor(context, value);
  return serialized === null ? null : parse(serialized);
}

function readCanvasColor(context: CanvasRenderingContext2D, value: string): string | null {
  context.fillStyle = "transparent";
  context.fillStyle = value;
  const first = context.fillStyle;
  context.fillStyle = "white";
  context.fillStyle = value;
  return typeof first === "string" && first === context.fillStyle ? first : null;
}

function parseSrgbSerialization(serialized: string): ParsedColor | null {
  const match = serialized.match(/^color\(srgb ([^ ]+) ([^ ]+) ([^ /)]+)(?: \/ ([^)]+))?\)$/);
  if (!match) return null;
  const channels = match.slice(1, 4).map(Number);
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (!channels.every(Number.isFinite) || !Number.isFinite(alpha)) return null;
  return {
    red: clampChannel(channels[0] * 255),
    green: clampChannel(channels[1] * 255),
    blue: clampChannel(channels[2] * 255),
    alpha: clampAlpha(alpha),
  };
}

export function parseCssColor(value: string): ParsedColor | null {
  return parseSerializedColor(value) ?? parseBrowserColor(value.trim());
}

export function resolvePickerColor(
  value: string | undefined,
  element: Element | null,
  fallback: string,
): string {
  const view = element?.ownerDocument.defaultView;
  const parsed =
    (value ? parseCssColor(value) : null) ??
    (element && view ? parseCssColor(view.getComputedStyle(element).color) : null);
  return parsed ? toHexColor(parsed) : fallback;
}

export function toColorPickerValue(value: string): string {
  const parsed = parseCssColor(value);
  if (!parsed) return "#000000";
  return toHexColor(parsed);
}

export function toHexColor(color: Pick<ParsedColor, "red" | "green" | "blue">): string {
  return `#${toHex(color.red)}${toHex(color.green)}${toHex(color.blue)}`;
}

export function formatCssColor(color: ParsedColor): string {
  const red = clampChannel(color.red);
  const green = clampChannel(color.green);
  const blue = clampChannel(color.blue);
  const alpha = clampAlpha(color.alpha);

  if (alpha >= 1) {
    return `rgb(${red}, ${green}, ${blue})`;
  }

  return `rgba(${red}, ${green}, ${blue}, ${formatAlpha(alpha)})`;
}

export function rgbToHsv(color: Pick<ParsedColor, "red" | "green" | "blue">): HsvColor {
  const red = clampChannel(color.red) / 255;
  const green = clampChannel(color.green) / 255;
  const blue = clampChannel(color.blue) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }

  if (hue < 0) hue += 360;

  return {
    hue,
    saturation: max === 0 ? 0 : delta / max,
    value: max,
  };
}

export function hsvToRgb(color: HsvColor): Pick<ParsedColor, "red" | "green" | "blue"> {
  const hue = (((color.hue % 360) + 360) % 360) / 60;
  const saturation = Math.max(0, Math.min(1, color.saturation));
  const value = Math.max(0, Math.min(1, color.value));
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const m = value - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue >= 0 && hue < 1) {
    red = chroma;
    green = x;
  } else if (hue >= 1 && hue < 2) {
    red = x;
    green = chroma;
  } else if (hue >= 2 && hue < 3) {
    green = chroma;
    blue = x;
  } else if (hue >= 3 && hue < 4) {
    green = x;
    blue = chroma;
  } else if (hue >= 4 && hue < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  return {
    red: clampChannel((red + m) * 255),
    green: clampChannel((green + m) * 255),
    blue: clampChannel((blue + m) * 255),
  };
}

export function mergeColorWithExistingAlpha(nextHex: string, previousValue: string): string {
  const hex = nextHex.trim();
  const match = hex.match(/^#([0-9a-f]{6})$/i);
  if (!match) return previousValue;

  const previous = parseCssColor(previousValue);
  const red = Number.parseInt(match[1].slice(0, 2), 16);
  const green = Number.parseInt(match[1].slice(2, 4), 16);
  const blue = Number.parseInt(match[1].slice(4, 6), 16);
  const alpha = previous?.alpha ?? 1;

  return formatCssColor({ red, green, blue, alpha });
}
