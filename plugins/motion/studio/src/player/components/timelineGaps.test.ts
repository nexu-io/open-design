import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import {
  laneGapFloor,
  resolveAllGapIntervals,
  resolveAllTrackGaps,
  resolveCloseGapShifts,
  resolveTrackGapAt,
  trackHasGaps,
} from "./timelineGaps";

function el(id: string, start: number, duration: number): TimelineElement {
  return { id, tag: "video", start, duration, track: 0, domId: id };
}

describe("resolveTrackGapAt", () => {
  it("resolves a middle gap between two clips", () => {
    const els = [el("a", 0, 2), el("b", 5, 3)];
    const gap = resolveTrackGapAt(els, 3);
    expect(gap).toEqual({ gapStart: 2, gapEnd: 5, followingKeys: ["b"] });
  });

  it("resolves the leading gap before the first clip (gapStart = 0)", () => {
    const els = [el("a", 2, 3), el("b", 6, 1)];
    const gap = resolveTrackGapAt(els, 1);
    expect(gap).toEqual({ gapStart: 0, gapEnd: 2, followingKeys: ["a", "b"] });
  });

  it("includes EVERY clip at/after the gap in followingKeys", () => {
    const els = [el("a", 0, 1), el("b", 3, 1), el("c", 5, 1), el("d", 8, 1)];
    const gap = resolveTrackGapAt(els, 2);
    expect(gap).toEqual({ gapStart: 1, gapEnd: 3, followingKeys: ["b", "c", "d"] });
  });

  it("returns null when there is no clip to the right of the point", () => {
    const els = [el("a", 0, 2)];
    expect(resolveTrackGapAt(els, 5)).toBeNull();
    expect(resolveTrackGapAt([], 1)).toBeNull(); // empty lane
  });

  it("returns null when the point is inside a clip (half-open interval)", () => {
    const els = [el("a", 1, 2), el("b", 5, 1)];
    expect(resolveTrackGapAt(els, 2)).toBeNull(); // strictly inside
    expect(resolveTrackGapAt(els, 1)).toBeNull(); // at clip start (occupied)
    // At clip END (half-open) the point is free — the gap to "b" resolves.
    expect(resolveTrackGapAt(els, 3)).toEqual({ gapStart: 3, gapEnd: 5, followingKeys: ["b"] });
  });

  it("resolves the leading gap for a single clip", () => {
    const gap = resolveTrackGapAt([el("a", 4, 2)], 1);
    expect(gap).toEqual({ gapStart: 0, gapEnd: 4, followingKeys: ["a"] });
  });

  it("treats epsilon-adjacent clips as gapless (float drift)", () => {
    // 8.4 + 2.7 = 11.100000000000001 — the classic drift: no point near the
    // seam resolves a gap.
    const drifted = [el("a", 8.4, 2.7), el("b", 11.1, 2)];
    expect(resolveTrackGapAt(drifted, 11.0999)).toBeNull();
    expect(resolveTrackGapAt(drifted, 11.1005)).toBeNull();
    // A sub-epsilon sliver between clips is not a closable gap either.
    const sliver = [el("a", 0, 2.0004), el("b", 2.001, 1)];
    expect(resolveTrackGapAt(sliver, 1.9995)).toBeNull();
  });

  it("handles overlapping clips sanely (uses the max end left of the point)", () => {
    const els = [el("a", 0, 4), el("b", 1, 2), el("c", 6, 1)];
    const gap = resolveTrackGapAt(els, 5);
    expect(gap).toEqual({ gapStart: 4, gapEnd: 6, followingKeys: ["c"] });
  });

  it("prefers the key over the id when present", () => {
    const withKey = { ...el("a", 3, 1), key: "a-key" };
    const gap = resolveTrackGapAt([withKey], 1);
    expect(gap?.followingKeys).toEqual(["a-key"]);
  });
});

describe("resolveCloseGapShifts", () => {
  it("shifts the following clips left by exactly the gap width", () => {
    const els = [el("a", 0, 2), el("b", 5, 3), el("c", 10, 1)];
    const gap = resolveTrackGapAt(els, 3)!;
    expect(resolveCloseGapShifts(els, gap)).toEqual([
      { key: "b", newStart: 2 },
      { key: "c", newStart: 7 },
    ]);
  });

  it("closing the leading gap lands the first clip at 0", () => {
    const els = [el("a", 2, 3), el("b", 6, 1)];
    const gap = resolveTrackGapAt(els, 1)!;
    expect(resolveCloseGapShifts(els, gap)).toEqual([
      { key: "a", newStart: 0 },
      { key: "b", newStart: 4 },
    ]);
  });

  it("rounds shifted starts to millisecond precision", () => {
    const els = [el("a", 0, 1.1), el("b", 3.3000000000000003, 1)];
    const gap = resolveTrackGapAt(els, 2)!;
    const shifts = resolveCloseGapShifts(els, gap);
    expect(shifts).toEqual([{ key: "b", newStart: 1.1 }]);
  });
});

describe("resolveAllTrackGaps", () => {
  it("compacts every gap: contiguous from 0, order and durations preserved", () => {
    const els = [el("a", 1, 2), el("b", 5, 3), el("c", 10, 1)];
    expect(resolveAllTrackGaps(els)).toEqual([
      { key: "a", newStart: 0 },
      { key: "b", newStart: 2 },
      { key: "c", newStart: 5 },
    ]);
  });

  it("includes the leading gap for a single clip", () => {
    expect(resolveAllTrackGaps([el("a", 4, 2)])).toEqual([{ key: "a", newStart: 0 }]);
  });

  it("returns only the clips whose start actually changes", () => {
    const els = [el("a", 0, 2), el("b", 2, 1), el("c", 5, 1)];
    expect(resolveAllTrackGaps(els)).toEqual([{ key: "c", newStart: 3 }]);
  });

  it("returns [] for an already-contiguous track and for an empty lane", () => {
    expect(resolveAllTrackGaps([el("a", 0, 2), el("b", 2, 3)])).toEqual([]);
    expect(resolveAllTrackGaps([])).toEqual([]);
  });

  it("ignores epsilon-level drift instead of emitting no-op shifts", () => {
    const els = [el("a", 0, 8.4), el("b", 8.4, 2.7), el("c", 11.100000000000001, 2)];
    expect(resolveAllTrackGaps(els)).toEqual([]);
  });

  it("serializes overlapping clips in start order (sum-of-durations rule)", () => {
    const els = [el("a", 0, 4), el("b", 2, 2)];
    expect(resolveAllTrackGaps(els)).toEqual([{ key: "b", newStart: 4 }]);
  });

  it("is deterministic for identical starts (key tie-break)", () => {
    const els = [el("b", 3, 1), el("a", 3, 2)];
    expect(resolveAllTrackGaps(els)).toEqual([
      { key: "a", newStart: 0 },
      { key: "b", newStart: 2 },
    ]);
  });
});

describe("resolveAllGapIntervals", () => {
  it("reports every current gap, leading gap included, left to right", () => {
    const els = [el("a", 1, 2), el("b", 5, 3), el("c", 10, 1)];
    expect(resolveAllGapIntervals(els)).toEqual([
      { start: 0, end: 1 },
      { start: 3, end: 5 },
      { start: 8, end: 10 },
    ]);
  });

  it("returns [] for contiguous or empty lanes", () => {
    expect(resolveAllGapIntervals([el("a", 0, 2), el("b", 2, 3)])).toEqual([]);
    expect(resolveAllGapIntervals([])).toEqual([]);
  });

  it("never fabricates an interval from overlapping clips (cursor = max end)", () => {
    const els = [el("a", 0, 4), el("b", 1, 2), el("c", 6, 1)];
    expect(resolveAllGapIntervals(els)).toEqual([{ start: 4, end: 6 }]);
  });

  it("ignores epsilon-level drift seams", () => {
    const els = [el("a", 0, 8.4), el("b", 8.4, 2.7), el("c", 11.100000000000001, 2)];
    expect(resolveAllGapIntervals(els)).toEqual([]);
  });
});

describe("trackHasGaps", () => {
  it("detects gaps, including the leading gap", () => {
    expect(trackHasGaps([el("a", 1, 2)])).toBe(true);
    expect(trackHasGaps([el("a", 0, 2), el("b", 4, 1)])).toBe(true);
  });

  it("is false for contiguous or empty tracks", () => {
    expect(trackHasGaps([el("a", 0, 2), el("b", 2, 1)])).toBe(false);
    expect(trackHasGaps([])).toBe(false);
  });
});

describe("lane floor", () => {
  it("laneGapFloor is always 0", () => {
    expect(laneGapFloor([el("a", 0, 2)])).toBe(0);
    expect(laneGapFloor([])).toBe(0);
  });
});
