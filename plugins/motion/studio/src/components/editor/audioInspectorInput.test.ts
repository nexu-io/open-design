import { describe, expect, it } from "vitest";
import { MAX_AUDIO_GAIN } from "@hyperframes/core/audio-gain";
import { RATE_RANGE } from "@hyperframes/core/audio-automation";
import { parseGainInput, parseRateInput, parseSecondsInput } from "./audioInspectorInput";

describe("parseGainInput", () => {
  it("reads decibels as the readout shows them", () => {
    expect(parseGainInput("0")).toBeCloseTo(1, 6);
    expect(parseGainInput("+0.5 dB")).toBeCloseTo(10 ** (0.5 / 20), 6);
    expect(parseGainInput("-6")).toBeCloseTo(10 ** (-6 / 20), 6);
    expect(parseGainInput("-6dB")).toBeCloseTo(10 ** (-6 / 20), 6);
    expect(parseGainInput("-inf")).toBe(0);
  });
  it("also takes a linear multiplier or a percentage", () => {
    expect(parseGainInput("x0.8")).toBeCloseTo(0.8, 6);
    expect(parseGainInput("0.8x")).toBeCloseTo(0.8, 6);
    expect(parseGainInput("80%")).toBeCloseTo(0.8, 6);
  });
  it("clamps to the fader's ceiling and refuses nonsense", () => {
    expect(parseGainInput("+40 dB")).toBeCloseTo(MAX_AUDIO_GAIN, 6);
    expect(parseGainInput("loud")).toBeNull();
    expect(parseGainInput("")).toBeNull();
    expect(parseGainInput("x-1")).toBeNull();
  });
});

describe("parseRateInput", () => {
  it("reads a multiplier with or without the x, and a percentage", () => {
    expect(parseRateInput("1.5x")).toBe(1.5);
    expect(parseRateInput("1.5")).toBe(1.5);
    expect(parseRateInput("x2")).toBe(2);
    expect(parseRateInput("150%")).toBe(1.5);
  });
  it("clamps to the rate range and refuses zero or text", () => {
    expect(parseRateInput("100x")).toBe(RATE_RANGE.max);
    expect(parseRateInput("0.001")).toBe(RATE_RANGE.min);
    expect(parseRateInput("0")).toBeNull();
    expect(parseRateInput("fast")).toBeNull();
  });
});

describe("parseSecondsInput", () => {
  it("reads seconds, milliseconds and minutes:seconds", () => {
    expect(parseSecondsInput("2.5")).toBe(2.5);
    expect(parseSecondsInput("2.5s")).toBe(2.5);
    expect(parseSecondsInput("500ms")).toBe(0.5);
    expect(parseSecondsInput("1:02.5")).toBe(62.5);
    expect(parseSecondsInput("0")).toBe(0);
  });
  it("refuses negatives and text", () => {
    expect(parseSecondsInput("-1")).toBeNull();
    expect(parseSecondsInput("soon")).toBeNull();
    expect(parseSecondsInput("")).toBeNull();
  });
});
