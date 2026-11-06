import { describe, expect, it } from "vitest";
import { generateShape } from "./automationShapes";
import { resolveAutomationRange, VOLUME_RANGE } from "@hyperframes/core/audio-automation";
import type { HfAutomationLane } from "@hyperframes/core/audio-automation";

const flat: HfAutomationLane = {
  target: "volume",
  points: [
    { t: 0, v: 0.8 },
    { t: 6, v: 0.8 },
  ],
};

describe("generateShape", () => {
  it("ramp-up fades in from the floor to the envelope's own value", () => {
    const pts = generateShape({ shape: "ramp-up", lane: flat, range: VOLUME_RANGE, t0: 1, t1: 3 });
    expect(pts).toEqual([
      { t: 1, v: VOLUME_RANGE.min },
      { t: 3, v: 0.8 },
    ]);
  });

  it("ramp-down fades out from the envelope's own value", () => {
    const pts = generateShape({
      shape: "ramp-down",
      lane: flat,
      range: VOLUME_RANGE,
      t0: 1,
      t1: 3,
    });
    expect(pts).toEqual([
      { t: 1, v: 0.8 },
      { t: 3, v: VOLUME_RANGE.min },
    ]);
  });

  it("swell peaks at range max mid-selection, smoothed", () => {
    const pts = generateShape({ shape: "swell", lane: flat, range: VOLUME_RANGE, t0: 1, t1: 3 });
    expect(pts).toHaveLength(3);
    expect(pts[1]).toMatchObject({ t: 2, v: VOLUME_RANGE.max });
    expect(pts[0]?.curve).toBeDefined(); // eased, not a triangle
  });

  it("dip ducks to a quarter of the edge value in unit space", () => {
    const pts = generateShape({ shape: "dip", lane: flat, range: VOLUME_RANGE, t0: 1, t1: 3 });
    // volume is linear 0..1: unit(0.8) = 0.8, floor = 0.2
    expect(pts[1]?.v).toBeCloseTo(0.2, 5);
  });

  it("computes in unit space on a log lane", () => {
    const range = resolveAutomationRange("fx.n1.frequency", {
      version: 1,
      nodes: [{ type: "lowpass", id: "n1", params: {} }],
    });
    expect(range?.scale).toBe("log");
    if (!range) return;
    const lane: HfAutomationLane = {
      target: "fx.n1.frequency",
      points: [
        { t: 0, v: 2000 },
        { t: 6, v: 2000 },
      ],
    };
    const pts = generateShape({ shape: "dip", lane, range, t0: 1, t1: 3 });
    const floor = pts[1]?.v ?? 0;
    // A quarter of the way up the LOG axis, not 500 Hz.
    expect(floor).toBeGreaterThan(range.min);
    expect(floor).toBeLessThan(2000 * 0.25);
  });

  it("uses the range default when the lane is empty", () => {
    const empty: HfAutomationLane = { target: "volume", points: [] };
    const pts = generateShape({
      shape: "ramp-down",
      lane: empty,
      range: VOLUME_RANGE,
      t0: 1,
      t1: 3,
    });
    expect(pts[0]?.v).toBe(VOLUME_RANGE.default);
  });
});
