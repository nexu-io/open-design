import { describe, it, expect } from "vitest";
import type { TimelineElement } from "../player/store/playerStore";
import {
  SPLIT_BOUNDARY_EPSILON_S,
  canSplitElementAt,
  isSplitTimeWithinBounds,
  selectSplittableElements,
} from "./timelineElementSplit";

function element(overrides: Partial<TimelineElement> = {}): TimelineElement {
  return {
    id: "el-1",
    tag: "div",
    start: 1,
    duration: 4,
    track: 0,
    domId: "el-1",
    ...overrides,
  };
}

describe("isSplitTimeWithinBounds", () => {
  const start = 1;
  const duration = 4;
  const end = start + duration;

  it("accepts the exact lower clamp boundary", () => {
    // The timeline canvas clamps an edge click to exactly
    // start + SPLIT_BOUNDARY_EPSILON_S, so that value must be splittable.
    expect(isSplitTimeWithinBounds(start + SPLIT_BOUNDARY_EPSILON_S, start, duration)).toBe(true);
  });

  it("accepts the exact upper clamp boundary", () => {
    expect(
      isSplitTimeWithinBounds(start + duration - SPLIT_BOUNDARY_EPSILON_S, start, duration),
    ).toBe(true);
  });

  it("accepts an interior split time", () => {
    expect(isSplitTimeWithinBounds(3, start, duration)).toBe(true);
  });

  it("rejects times at or outside the clip edges", () => {
    expect(isSplitTimeWithinBounds(start, start, duration)).toBe(false);
    expect(isSplitTimeWithinBounds(end, start, duration)).toBe(false);
    expect(isSplitTimeWithinBounds(start - 1, start, duration)).toBe(false);
    expect(isSplitTimeWithinBounds(end + 1, start, duration)).toBe(false);
  });

  it("rejects times inside the epsilon margins", () => {
    expect(isSplitTimeWithinBounds(start + SPLIT_BOUNDARY_EPSILON_S / 2, start, duration)).toBe(
      false,
    );
    expect(isSplitTimeWithinBounds(end - SPLIT_BOUNDARY_EPSILON_S / 2, start, duration)).toBe(
      false,
    );
  });

  it("rejects every time on a clip shorter than two epsilons", () => {
    // Math.max(min, Math.min(max, t)) collapses to min when the clip is too
    // short for the clamp range; that collapsed value must still be rejected.
    const shortDuration = SPLIT_BOUNDARY_EPSILON_S;
    expect(isSplitTimeWithinBounds(start + SPLIT_BOUNDARY_EPSILON_S, start, shortDuration)).toBe(
      false,
    );
    expect(isSplitTimeWithinBounds(start + shortDuration / 2, start, shortDuration)).toBe(false);
  });
});

describe("canSplitElementAt", () => {
  it("accepts a splittable element at an interior time", () => {
    expect(canSplitElementAt(element({ start: 1, duration: 4 }), 3)).toBe(true);
  });

  it("rejects a time inside the boundary epsilon", () => {
    expect(
      canSplitElementAt(element({ start: 1, duration: 4 }), 1 + SPLIT_BOUNDARY_EPSILON_S / 2),
    ).toBe(false);
  });

  it("rejects locked elements while allowing identified compositions", () => {
    expect(canSplitElementAt(element({ timelineLocked: true }), 3)).toBe(false);
    expect(
      canSplitElementAt(
        element({ kind: "composition", compositionSrc: "child.html", playbackRate: 2 }),
        3,
      ),
    ).toBe(true);
  });

  it("rejects missing identity and invalid playback rates", () => {
    expect(canSplitElementAt(element({ domId: undefined }), 3)).toBe(false);
    expect(canSplitElementAt(element({ playbackRate: 0 }), 3)).toBe(false);
    expect(canSplitElementAt(element({ playbackRate: Number.NaN }), 3)).toBe(false);
  });
});

describe("selectSplittableElements", () => {
  it("excludes a clip shorter than two epsilons even when the time is inside it", () => {
    // Regression: split-all used raw start < t < end, so a clip too short for
    // the epsilon margin was still selected and produced a degenerate slice.
    const tiny = element({ id: "tiny", start: 1, duration: SPLIT_BOUNDARY_EPSILON_S + 0.01 });
    const interiorTime = tiny.start + tiny.duration / 2;
    expect(interiorTime).toBeGreaterThan(tiny.start);
    expect(interiorTime).toBeLessThan(tiny.start + tiny.duration);
    expect(selectSplittableElements([tiny], interiorTime)).toEqual([]);
  });

  it("keeps only the elements whose epsilon-bounded range contains the time", () => {
    const inside = element({ id: "inside", start: 0, duration: 4 });
    const outside = element({ id: "outside", start: 5, duration: 4 });
    const locked = element({ id: "locked", start: 0, duration: 4, timelineLocked: true });
    const result = selectSplittableElements([inside, outside, locked], 2);
    expect(result.map((el) => el.id)).toEqual(["inside"]);
  });

  it("accepts an element at the exact lower clamp boundary", () => {
    const el = element({ start: 2, duration: 4 });
    expect(selectSplittableElements([el], 2 + SPLIT_BOUNDARY_EPSILON_S)).toEqual([el]);
  });
});
