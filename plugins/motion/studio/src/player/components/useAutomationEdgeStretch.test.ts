import { describe, expect, it } from "vitest";
import { clampEdge } from "./useAutomationEdgeStretch";

describe("clampEdge", () => {
  it("keeps the dragged edge inside the clip", () => {
    expect(clampEdge("t0", -5, { t0: 1, t1: 3 }, 4)).toBe(0);
    expect(clampEdge("t1", 99, { t0: 1, t1: 3 }, 4)).toBe(4);
  });

  it("keeps the dragged edge clear of its partner", () => {
    expect(clampEdge("t0", 3.5, { t0: 1, t1: 3 }, 4)).toBeCloseTo(2.98, 5);
    expect(clampEdge("t1", 0.5, { t0: 1, t1: 3 }, 4)).toBeCloseTo(1.02, 5);
  });

  it("never yields a negative time, even when the partner bound is itself below zero", () => {
    // A selection thinner than the minimum width has no legal t0 at all. Bounding
    // against the partner AFTER the 0-floor returned that illegal value, and
    // core's cleanPoint collapses a negative time onto a duplicate t=0 on the
    // next serialize round-trip — silent envelope corruption, not a visible bug.
    expect(clampEdge("t0", -1, { t0: 0.004, t1: 0.01 }, 4)).toBe(0);
    expect(clampEdge("t0", 0.008, { t0: 0.004, t1: 0.01 }, 4)).toBe(0);
  });

  it("never yields a time past the clip when the partner bound is past it", () => {
    expect(clampEdge("t1", 99, { t0: 3.995, t1: 4 }, 4)).toBe(4);
  });
});
