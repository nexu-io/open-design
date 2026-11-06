import { describe, expect, it } from "vitest";
import { clipAudioOnItsClock, readClipClock } from "./clipAudioClock";

const RATE = 48000;
const sine = (seconds: number, hz: number) =>
  Float32Array.from({ length: RATE * seconds }, (_, i) => Math.sin((2 * Math.PI * hz * i) / RATE));
const zeroCrossingsPerSecond = (x: Float32Array) => {
  let n = 0;
  for (let i = 1; i < x.length; i += 1) if (x[i - 1]! < 0 !== x[i]! < 0) n += 1;
  return n / (x.length / RATE);
};

describe("readClipClock", () => {
  it("reads the in-point, the rate lane over the constant, and a positive duration", () => {
    const attrs: Record<string, string> = {
      "data-playback-start": "1.5",
      "data-media-start": "9",
      "data-playback-rate": "3",
      "data-automation":
        '{"version":1,"lanes":[{"target":"rate","points":[{"t":0,"v":2},{"t":4,"v":2}]}]}',
      "data-duration": "4",
    };
    const clock = readClipClock((name) => attrs[name]);
    expect({ ...clock, rate: typeof clock.rate }).toEqual({
      inPoint: 1.5,
      rate: "object",
      duration: 4,
    });
    expect(readClipClock((name) => (name === "data-duration" ? "0" : null))).toEqual({
      inPoint: 0,
      rate: 1,
      duration: null,
    });
  });
});

describe("clipAudioOnItsClock", () => {
  it("is the exact slice the clip plays at rate 1", () => {
    const samples = sine(4, 440);
    const out = clipAudioOnItsClock(samples, RATE, { inPoint: 1, rate: 1, duration: 2 });
    expect(Array.from(out)).toEqual(Array.from(samples.subarray(RATE, 3 * RATE)));
  });

  it("lasts the clip's duration at 2x, consuming twice as much source", () => {
    // Each sample holds its own source time, so the output reads back where it was taken from.
    const samples = Float32Array.from({ length: RATE * 6 }, (_, i) => i / RATE);
    const out = clipAudioOnItsClock(samples, RATE, { inPoint: 1, rate: 2, duration: 2 });
    expect({ length: out.length, atOneSecond: Number(out[RATE]!.toFixed(1)) }).toEqual({
      length: 2 * RATE,
      atOneSecond: 3,
    });
  });

  it("keeps the pitch at 2x and 0.5x", () => {
    const samples = sine(4, 440);
    for (const rate of [2, 0.5]) {
      const out = clipAudioOnItsClock(samples, RATE, { inPoint: 0, rate, duration: 1.5 });
      expect(zeroCrossingsPerSecond(out) / 880).toBeCloseTo(1, 1);
    }
  });
});
