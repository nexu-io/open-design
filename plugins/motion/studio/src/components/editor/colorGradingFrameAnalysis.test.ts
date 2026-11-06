import { describe, expect, it } from "vitest";
import {
  normalizeHfColorGrading,
  type HfColorGradingSecondary,
} from "@hyperframes/core/color-grading";
import {
  analyzeColorGradingFrame,
  buildColorGradingSecondaryMatte,
  colorGradingSecondaryMask,
  sampleColorGradingSecondary,
} from "./colorGradingFrameAnalysis";

function pixels(...rgba: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(rgba);
}

function secondaryKey(key: HfColorGradingSecondary["key"]) {
  const secondary = normalizeHfColorGrading({
    secondaries: [{ key, correction: {} }],
  })?.secondaries?.[0];
  if (!secondary) throw new Error("Expected a normalized secondary");
  return secondary.key;
}

describe("colorGradingFrameAnalysis", () => {
  it("places black and white at the Rec.709 scope endpoints", () => {
    const result = analyzeColorGradingFrame(pixels(0, 0, 0, 255, 255, 255, 255, 255), 2, 1);

    expect(result.histogram[0]).toBe(255);
    expect(result.histogram[255]).toBe(255);
    expect(result.waveform[255]).toBe(255);
    expect(result.waveform[256]).toBe(255);
    expect(result.parade.reduce((sum, value) => sum + value, 0)).toBe(6 * 255);
  });

  it("alpha-weights all scopes and excludes transparent pixels", () => {
    const result = analyzeColorGradingFrame(pixels(0, 0, 0, 0, 255, 255, 255, 64), 2, 1);

    expect(result.histogram.reduce((sum, value) => sum + value, 0)).toBe(64);
    expect(result.waveform.reduce((sum, value) => sum + value, 0)).toBe(64);
    expect(result.parade.reduce((sum, value) => sum + value, 0)).toBe(3 * 64);
    expect(result.vectorscope.reduce((sum, value) => sum + value, 0)).toBe(64);
  });

  it("averages hue circularly when an eyedropper sample crosses red", () => {
    const sampled = sampleColorGradingSecondary(
      pixels(255, 0, 10, 255, 255, 10, 0, 255),
      2,
      1,
      0.5,
      0,
      1,
    );

    expect(sampled).not.toBeNull();
    if (!sampled) throw new Error("Expected a sample");
    expect(Math.min(sampled.hue.center, 360 - sampled.hue.center)).toBeLessThan(3);
    expect(sampled.hue.range).toBe(18);
  });

  it("does not invent a hue qualifier for a neutral sample", () => {
    const sampled = sampleColorGradingSecondary(pixels(128, 128, 128, 255), 1, 1, 0, 0);

    expect(sampled?.hue).toEqual({ center: 0, range: 180, softness: 0 });
    expect(sampled?.saturation.max).toBeCloseTo(0.2);
  });

  it("matches the runtime softness on saturation and luma feather edges", () => {
    const saturationKey = secondaryKey({
      hue: { center: 0, range: 180, softness: 0 },
      saturation: { min: 0.5, max: 1, softness: 0.4 },
      luma: { min: 0, max: 1, softness: 0 },
    });
    const lumaKey = secondaryKey({
      hue: { center: 0, range: 180, softness: 0 },
      saturation: { min: 0, max: 1, softness: 0 },
      luma: { min: 0.5, max: 1, softness: 0.4 },
    });

    expect(colorGradingSecondaryMask(255, 204, 204, saturationKey)).toBeCloseTo(0.15625, 5);
    expect(colorGradingSecondaryMask(51, 51, 51, lumaKey)).toBeCloseTo(0.15625, 5);
  });

  it("builds an alpha-preserving black-and-white selection matte", () => {
    const key = secondaryKey({
      hue: { center: 0, range: 15, softness: 0 },
      saturation: { min: 0.5, max: 1, softness: 0 },
      luma: { min: 0, max: 1, softness: 0 },
    });
    const matte = buildColorGradingSecondaryMatte(
      pixels(255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 0, 0),
      3,
      1,
      key,
    );

    expect([...matte.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    expect([...matte.slice(4, 8)]).toEqual([0, 0, 0, 128]);
    expect([...matte.slice(8, 12)]).toEqual([0, 0, 0, 0]);
  });
});
