import {
  calculateHfColorGradingSecondaryMask,
  type NormalizedHfColorGradingSecondary,
} from "@hyperframes/core/color-grading";
import { clampNumber } from "../../utils/studioHelpers";

const BYTE_MAX = 255;
const SCOPE_SIZE = 256;

export type ColorGradingScopeMode = "histogram" | "waveform" | "parade" | "vectorscope";

export interface ColorGradingScopeAnalysis {
  width: number;
  histogram: Uint32Array;
  waveform: Uint32Array;
  parade: Uint32Array;
  vectorscope: Uint32Array;
}

export async function readColorGradingFramePixels(frame: {
  dataUrl: string;
  width: number;
  height: number;
}): Promise<Uint8ClampedArray | null> {
  const image = new Image();
  image.src = frame.dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, frame.width, frame.height);
  return context.getImageData(0, 0, frame.width, frame.height).data;
}

function rec709Luma(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function rgbToHsv(red: number, green: number, blue: number) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const chroma = max - min;
  let hue = 0;
  if (chroma > 0) {
    if (max === red) hue = ((green - blue) / chroma) % 6;
    else if (max === green) hue = (blue - red) / chroma + 2;
    else hue = (red - green) / chroma + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return {
    hue,
    saturation: max === 0 ? 0 : chroma / max,
    value: max,
  };
}

export function colorGradingSecondaryMask(
  red: number,
  green: number,
  blue: number,
  key: NormalizedHfColorGradingSecondary["key"],
): number {
  const hsv = rgbToHsv(red / BYTE_MAX, green / BYTE_MAX, blue / BYTE_MAX);
  return calculateHfColorGradingSecondaryMask(
    hsv.hue,
    hsv.saturation,
    rec709Luma(red / BYTE_MAX, green / BYTE_MAX, blue / BYTE_MAX),
    key,
  );
}

export function buildColorGradingSecondaryMatte(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  key: NormalizedHfColorGradingSecondary["key"],
): Uint8ClampedArray {
  const matte = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3] ?? 0;
    const mask =
      alpha === 0
        ? 0
        : colorGradingSecondaryMask(
            pixels[offset] ?? 0,
            pixels[offset + 1] ?? 0,
            pixels[offset + 2] ?? 0,
            key,
          );
    const value = Math.round(mask * BYTE_MAX);
    matte[offset] = value;
    matte[offset + 1] = value;
    matte[offset + 2] = value;
    matte[offset + 3] = alpha;
  }
  return matte;
}

function pixelOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function byteIndex(value: number): number {
  return Math.round(clampNumber(value, 0, 1) * BYTE_MAX);
}

export function analyzeColorGradingFrame(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): ColorGradingScopeAnalysis {
  const histogram = new Uint32Array(SCOPE_SIZE);
  const waveform = new Uint32Array(width * SCOPE_SIZE);
  const parade = new Uint32Array(width * SCOPE_SIZE * 3);
  const vectorscope = new Uint32Array(SCOPE_SIZE * SCOPE_SIZE);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = pixelOffset(width, x, y);
      const alpha = pixels[offset + 3] ?? 0;
      if (alpha === 0) continue;
      const red = (pixels[offset] ?? 0) / BYTE_MAX;
      const green = (pixels[offset + 1] ?? 0) / BYTE_MAX;
      const blue = (pixels[offset + 2] ?? 0) / BYTE_MAX;
      const normalizedLuma = rec709Luma(red, green, blue);
      const luma = byteIndex(normalizedLuma);
      histogram[luma] += alpha;
      waveform[x * SCOPE_SIZE + (BYTE_MAX - luma)] += alpha;
      parade[x * SCOPE_SIZE + (BYTE_MAX - byteIndex(red))] += alpha;
      parade[width * SCOPE_SIZE + x * SCOPE_SIZE + (BYTE_MAX - byteIndex(green))] += alpha;
      parade[width * SCOPE_SIZE * 2 + x * SCOPE_SIZE + (BYTE_MAX - byteIndex(blue))] += alpha;

      const chromaBlue = (blue - normalizedLuma) / 1.8556;
      const chromaRed = (red - normalizedLuma) / 1.5748;
      const vectorX = byteIndex(chromaBlue + 0.5);
      const vectorY = BYTE_MAX - byteIndex(chromaRed + 0.5);
      vectorscope[vectorY * SCOPE_SIZE + vectorX] += alpha;
    }
  }

  return { width, histogram, waveform, parade, vectorscope };
}

export function sampleColorGradingSecondary(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  radius = 2,
): NormalizedHfColorGradingSecondary["key"] | null {
  const minX = clampNumber(Math.floor(x) - radius, 0, width - 1);
  const maxX = clampNumber(Math.floor(x) + radius, 0, width - 1);
  const minY = clampNumber(Math.floor(y) - radius, 0, height - 1);
  const maxY = clampNumber(Math.floor(y) + radius, 0, height - 1);
  let hueX = 0;
  let hueY = 0;
  let saturation = 0;
  let luma = 0;
  let weight = 0;

  for (let sampleY = minY; sampleY <= maxY; sampleY += 1) {
    for (let sampleX = minX; sampleX <= maxX; sampleX += 1) {
      const offset = pixelOffset(width, sampleX, sampleY);
      const alpha = (pixels[offset + 3] ?? 0) / BYTE_MAX;
      if (alpha === 0) continue;
      const red = (pixels[offset] ?? 0) / BYTE_MAX;
      const green = (pixels[offset + 1] ?? 0) / BYTE_MAX;
      const blue = (pixels[offset + 2] ?? 0) / BYTE_MAX;
      const hsv = rgbToHsv(red, green, blue);
      const hueRadians = (hsv.hue * Math.PI) / 180;
      const hueWeight = hsv.saturation * alpha;
      hueX += Math.cos(hueRadians) * hueWeight;
      hueY += Math.sin(hueRadians) * hueWeight;
      saturation += hsv.saturation * alpha;
      luma += rec709Luma(red, green, blue) * alpha;
      weight += alpha;
    }
  }

  if (weight === 0) return null;
  const averageHue = ((Math.atan2(hueY, hueX) * 180) / Math.PI + 360) % 360;
  const averageSaturation = saturation / weight;
  const averageLuma = luma / weight;
  const neutralSample = averageSaturation < 0.02;
  return {
    hue: neutralSample
      ? { center: 0, range: 180, softness: 0 }
      : { center: averageHue, range: 18, softness: 12 },
    saturation: {
      min: clampNumber(averageSaturation - 0.2, 0, 1),
      max: clampNumber(averageSaturation + 0.2, 0, 1),
      softness: 0.1,
    },
    luma: {
      min: clampNumber(averageLuma - 0.2, 0, 1),
      max: clampNumber(averageLuma + 0.2, 0, 1),
      softness: 0.1,
    },
  };
}
