// @ts-nocheck
/**
 * Palette engine — a faithful, dependency-free port of @ant-design/colors'
 * `generate()` HSV algorithm (the L1 "color algorithm" of the brand framework,
 * see docs/brand-framework.md §1/§5).
 *
 * One seed color → a deterministic 10-step ladder `[5 lighter, base, 4 darker]`
 * where index 5 ≈ the seed. The same algorithm, run on a dark background with
 * the `darkColorMap` blend, yields the dark-theme ladder. This is the single
 * source of color for the whole derived token system: derive.ts feeds primary
 * and every functional color through `generate()`; the 13 `presets` give ready
 * palettes for charts / tags / sub-brands.
 *
 * No external packages: the HSV/RGB conversions are inlined to match
 * tinycolor's rounding so the canonical blue ladder reproduces exactly.
 */

// ─────────────────────────── Algorithm constants (Ant Design) ───────────────

const hueStep = 2; // 色相阶梯
const saturationStep = 0.16; // 饱和度阶梯,浅色部分
const saturationStep2 = 0.05; // 饱和度阶梯,深色部分
const brightnessStep1 = 0.05; // 亮度阶梯,浅色部分
const brightnessStep2 = 0.15; // 亮度阶梯,深色部分
const lightColorCount = 5; // 浅色数量,主色上
const darkColorCount = 4; // 深色数量,主色下

/** Dark-theme blend recipe: { index into the light ladder (1-based), opacity % }. */
const darkColorMap: Array<{ index: number; opacity: number }> = [
  { index: 7, opacity: 0.15 },
  { index: 6, opacity: 0.25 },
  { index: 5, opacity: 0.3 },
  { index: 5, opacity: 0.45 },
  { index: 5, opacity: 0.65 },
  { index: 5, opacity: 0.85 },
  { index: 4, opacity: 0.9 },
  { index: 3, opacity: 0.95 },
  { index: 2, opacity: 0.97 },
  { index: 1, opacity: 0.98 },
];

// ─────────────────────────── Color math (inlined, tinycolor-compatible) ─────

interface RGB {
  r: number;
  g: number;
  b: number;
}
interface HSV {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

function clampHex(component: number): number {
  return Math.max(0, Math.min(255, Math.round(component)));
}

function parseHex(input: string): RGB {
  let hex = input.trim().replace(/^#/, "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (c: number) => clampHex(c).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** RGB (0..255) → HSV, matching tinycolor (h in degrees, s/v in 0..1). */
function rgbToHsv({ r, g, b }: RGB): HSV {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    switch (max) {
      case rr:
        h = (gg - bb) / d + (gg < bb ? 6 : 0);
        break;
      case gg:
        h = (bb - rr) / d + 2;
        break;
      default:
        h = (rr - gg) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s, v };
}

/** HSV → RGB (0..255), matching tinycolor. */
function hsvToRgb({ h, s, v }: HSV): RGB {
  const hh = (h / 360) * 6;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const mod = i % 6;
  const r = [v, q, p, p, t, v][mod];
  const g = [t, v, v, q, p, p][mod];
  const b = [p, p, t, v, v, q][mod];
  return { r: r * 255, g: g * 255, b: b * 255 };
}

/** Alpha-composite `front` over `back` (both opaque RGB), `amount` = front opacity 0..1. */
function mix(back: RGB, front: RGB, amount: number): RGB {
  return {
    r: front.r * amount + back.r * (1 - amount),
    g: front.g * amount + back.g * (1 - amount),
    b: front.b * amount + back.b * (1 - amount),
  };
}

// ─────────────────────────── generate() — the Ant HSV ladder ────────────────

/** Hue step: cooler region (60–240°) shifts opposite to the warm region. */
function getHue(hsv: HSV, i: number, light: boolean): number {
  let hue: number;
  // 根据色相不同,色相转向不同
  if (hsv.h >= 60 && hsv.h <= 240) {
    hue = light ? hsv.h - hueStep * i : hsv.h + hueStep * i;
  } else {
    hue = light ? hsv.h + hueStep * i : hsv.h - hueStep * i;
  }
  if (hue < 0) {
    hue += 360;
  } else if (hue >= 360) {
    hue -= 360;
  }
  return hue;
}

function getSaturation(hsv: HSV, i: number, light: boolean): number {
  // grey color don't change saturation
  if (hsv.h === 0 && hsv.s === 0) {
    return hsv.s;
  }
  let saturation: number;
  if (light) {
    saturation = hsv.s - saturationStep * i;
  } else if (i === darkColorCount) {
    saturation = hsv.s + saturationStep;
  } else {
    saturation = hsv.s + saturationStep2 * i;
  }
  // 边界值修正
  if (saturation > 1) {
    saturation = 1;
  }
  // 第一格的 s 限制在 0.06-0.1 之间
  if (light && i === lightColorCount && saturation > 0.1) {
    saturation = 0.1;
  }
  if (saturation < 0.06) {
    saturation = 0.06;
  }
  return Number(saturation.toFixed(2));
}

function getValue(hsv: HSV, i: number, light: boolean): number {
  let value: number;
  if (light) {
    value = hsv.v + brightnessStep1 * i;
  } else {
    value = hsv.v - brightnessStep2 * i;
  }
  if (value > 1) {
    value = 1;
  }
  return Number(value.toFixed(2));
}

/**
 * Generate the 10-step palette for a seed color.
 * Returns lowercase `#rrggbb`, index 5 ≈ the input. In dark mode each light
 * step is re-blended onto `backgroundColor` (default #141414) via darkColorMap.
 */
export function generate(
  baseColor: string,
  opts: { theme?: "default" | "dark"; backgroundColor?: string } = {},
): string[] {
  const patterns: string[] = [];
  const baseHsv = rgbToHsv(parseHex(baseColor));

  // 5 lighter steps, descending so the lightest ends up at index 0
  for (let i = lightColorCount; i > 0; i -= 1) {
    const hsv: HSV = {
      h: getHue(baseHsv, i, true),
      s: getSaturation(baseHsv, i, true),
      v: getValue(baseHsv, i, true),
    };
    patterns.push(rgbToHex(hsvToRgb(hsv)));
  }

  // the base color itself at index 5
  patterns.push(rgbToHex(hsvToRgb(baseHsv)));

  // 4 darker steps
  for (let i = 1; i <= darkColorCount; i += 1) {
    const hsv: HSV = {
      h: getHue(baseHsv, i, false),
      s: getSaturation(baseHsv, i, false),
      v: getValue(baseHsv, i, false),
    };
    patterns.push(rgbToHex(hsvToRgb(hsv)));
  }

  // dark theme patterns: blend each light pattern onto the dark background
  if (opts.theme === "dark") {
    const bg = parseHex(opts.backgroundColor || "#141414");
    return darkColorMap.map(({ index, opacity }) =>
      rgbToHex(mix(bg, parseHex(patterns[index - 1]), opacity)),
    );
  }

  return patterns;
}

// ─────────────────────────── 13 preset palettes (12 + grey) ─────────────────
//
// Base colors are the real Ant Design seeds (docs/brand-framework.md §1, "12+1
// 预设色板"). Each ladder is computed by generate() so it stays in lockstep
// with the algorithm above rather than being hand-typed.

const presetSeeds: Record<string, string> = {
  red: "#F5222D",
  volcano: "#FA541C",
  orange: "#FA8C16",
  gold: "#FAAD14",
  yellow: "#FADB14",
  lime: "#A0D911",
  green: "#52C41A",
  cyan: "#13C2C2",
  blue: "#1677FF",
  geekblue: "#2F54EB",
  purple: "#722ED1",
  magenta: "#EB2F96",
  grey: "#666666",
};

export const presets: Record<string, string[]> = Object.fromEntries(
  Object.entries(presetSeeds).map(([name, seed]) => [name, generate(seed)]),
);
