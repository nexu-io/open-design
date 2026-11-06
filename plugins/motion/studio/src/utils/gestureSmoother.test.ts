import { describe, expect, it } from "vitest";
import { smoothGestureKeyframes } from "./gestureSmoother";

describe("smoothGestureKeyframes", () => {
  it("returns input unchanged for ≤2 keyframes", () => {
    const kfs = [
      { percentage: 0, properties: { x: 0, y: 0 } },
      { percentage: 100, properties: { x: 100, y: 100 } },
    ];
    expect(smoothGestureKeyframes(kfs, 3)).toEqual(kfs);
  });

  it("pins first and last keyframes", () => {
    const kfs = [
      { percentage: 0, properties: { x: 0 } },
      { percentage: 50, properties: { x: 999 } },
      { percentage: 100, properties: { x: 200 } },
    ];
    const result = smoothGestureKeyframes(kfs, 3);
    expect(result[0].properties.x).toBe(0);
    expect(result[result.length - 1].properties.x).toBe(200);
  });

  it("smooths a zigzag into a gentler curve", () => {
    const kfs = [
      { percentage: 0, properties: { x: 0 } },
      { percentage: 25, properties: { x: 100 } },
      { percentage: 50, properties: { x: 0 } },
      { percentage: 75, properties: { x: 100 } },
      { percentage: 100, properties: { x: 0 } },
    ];
    const result = smoothGestureKeyframes(kfs, 2);
    const mid = result[2].properties.x as number;
    // The sharp 0→100→0 zigzag should be softened — mid should be
    // pulled toward the neighbors, not stay at exactly 0.
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
  });

  it("returns input unchanged with radius 0", () => {
    const kfs = [
      { percentage: 0, properties: { x: 0 } },
      { percentage: 50, properties: { x: 999 } },
      { percentage: 100, properties: { x: 0 } },
    ];
    expect(smoothGestureKeyframes(kfs, 0)).toEqual(kfs);
  });
});
