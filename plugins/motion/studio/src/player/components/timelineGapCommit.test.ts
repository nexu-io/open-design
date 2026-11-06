import { describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import type { DragCommitDeps } from "./timelineClipDragCommit";
import {
  canShiftTrackGapClips,
  commitCloseAllTrackGaps,
  commitCloseTrackGap,
  resolveMainTrackDeleteRippleShifts,
  resolveShiftedElements,
} from "./timelineGapCommit";
import { resolveAllTrackGaps } from "./timelineGaps";

function el(id: string, start: number, duration: number, track = 0): TimelineElement {
  // domId + video tag → getTimelineEditCapabilities(...).canMove === true
  return { id, tag: "video", start, duration, track, domId: id };
}

function lockedEl(id: string, start: number, duration: number): TimelineElement {
  return { ...el(id, start, duration), timelineLocked: true };
}

function makeDeps(laneElements: TimelineElement[]) {
  const onMoveElements = vi.fn(() => Promise.resolve());
  const updateElement = vi.fn();
  const deps: DragCommitDeps = {
    elements: laneElements,
    trackOrder: [0],
    updateElement,
    onMoveElements,
  };
  return { deps, onMoveElements, updateElement };
}

/** Assert exactly ONE atomic persist batch; return its flattened edits + coalesce key. */
function singleBatch(onMoveElements: ReturnType<typeof vi.fn>) {
  expect(onMoveElements).toHaveBeenCalledTimes(1);
  const [edits, coalesceKey] = onMoveElements.mock.calls[0] as unknown as [
    Array<{ element: TimelineElement; updates: { start: number; track: number } }>,
    string,
  ];
  return { coalesceKey, edits: edits.map((e) => ({ id: e.element.id, ...e.updates })) };
}

describe("commitCloseTrackGap", () => {
  it("persists ONE atomic batch shifting the next clip and every clip after it", () => {
    const lane = [el("a", 0, 2), el("b", 5, 3), el("c", 10, 1)];
    const { deps, onMoveElements } = makeDeps(lane);

    expect(commitCloseTrackGap(lane, 3, deps)).toBe(true);

    const { edits, coalesceKey } = singleBatch(onMoveElements);
    // Gap is [2, 5) → width 3; b and c shift left by 3, tracks unchanged.
    expect(edits).toEqual([
      { id: "b", start: 2, track: 0 },
      { id: "c", start: 7, track: 0 },
    ]);
    expect(typeof coalesceKey).toBe("string");
    expect(coalesceKey).toMatch(/^track-gap-close:\d+$/);
  });

  it("optimistically applies the same starts to the store", () => {
    const lane = [el("a", 0, 2), el("b", 5, 3)];
    const { deps, updateElement } = makeDeps(lane);
    commitCloseTrackGap(lane, 3, deps);
    expect(updateElement).toHaveBeenCalledWith("b", { start: 2, track: 0 });
  });

  it("closes the leading gap (first clip lands at 0)", () => {
    const lane = [el("a", 2, 3), el("b", 6, 1)];
    const { deps, onMoveElements } = makeDeps(lane);

    expect(commitCloseTrackGap(lane, 1, deps)).toBe(true);
    const [edits] = onMoveElements.mock.calls[0] as unknown as [
      Array<{ element: TimelineElement; updates: { start: number; track: number } }>,
    ];
    expect(edits.map((e) => ({ id: e.element.id, start: e.updates.start }))).toEqual([
      { id: "a", start: 0 },
      { id: "b", start: 4 },
    ]);
  });

  it("uses a fresh coalesce key per gesture", () => {
    const lane = [el("a", 0, 2), el("b", 5, 3)];
    const first = makeDeps(lane);
    const second = makeDeps(lane);
    commitCloseTrackGap(lane, 3, first.deps);
    commitCloseTrackGap(lane, 3, second.deps);
    const keyA = first.onMoveElements.mock.calls[0][1 as never];
    const keyB = second.onMoveElements.mock.calls[0][1 as never];
    expect(keyA).not.toEqual(keyB);
  });

  it("refuses (no write) when there is no clip right of the point", () => {
    const lane = [el("a", 0, 2)];
    const { deps, onMoveElements, updateElement } = makeDeps(lane);
    expect(commitCloseTrackGap(lane, 5, deps)).toBe(false);
    expect(onMoveElements).not.toHaveBeenCalled();
    expect(updateElement).not.toHaveBeenCalled();
  });

  it("refuses (no partial compaction) when ANY shifting clip is unmovable", () => {
    const lane = [el("a", 0, 2), el("b", 5, 3), lockedEl("c", 10, 1)];
    const { deps, onMoveElements, updateElement } = makeDeps(lane);
    expect(commitCloseTrackGap(lane, 3, deps)).toBe(false);
    expect(onMoveElements).not.toHaveBeenCalled();
    expect(updateElement).not.toHaveBeenCalled();
  });
});

describe("commitCloseAllTrackGaps", () => {
  it("compacts the whole lane in ONE atomic batch (leading gap included)", () => {
    const lane = [el("a", 1, 2), el("b", 5, 3), el("c", 10, 1)];
    const { deps, onMoveElements } = makeDeps(lane);

    expect(commitCloseAllTrackGaps(lane, deps)).toBe(true);

    const { edits, coalesceKey } = singleBatch(onMoveElements);
    expect(edits).toEqual([
      { id: "a", start: 0, track: 0 },
      { id: "b", start: 2, track: 0 },
      { id: "c", start: 5, track: 0 },
    ]);
    expect(coalesceKey).toMatch(/^track-gap-close:\d+$/);
  });

  it("refuses when the track is already contiguous (no gaps)", () => {
    const lane = [el("a", 0, 2), el("b", 2, 3)];
    const { deps, onMoveElements } = makeDeps(lane);
    expect(commitCloseAllTrackGaps(lane, deps)).toBe(false);
    expect(onMoveElements).not.toHaveBeenCalled();
  });

  it("refuses when any shifting clip is unmovable, even if others could move", () => {
    const lane = [lockedEl("a", 1, 2), el("b", 5, 3)];
    const { deps, onMoveElements, updateElement } = makeDeps(lane);
    expect(commitCloseAllTrackGaps(lane, deps)).toBe(false);
    expect(onMoveElements).not.toHaveBeenCalled();
    expect(updateElement).not.toHaveBeenCalled();
  });

  it("proceeds when an unmovable clip does NOT need to shift", () => {
    // Locked clip already sits flush at 0 — only movable clips shift.
    const lane = [lockedEl("a", 0, 2), el("b", 4, 1)];
    const { deps, onMoveElements } = makeDeps(lane);
    expect(commitCloseAllTrackGaps(lane, deps)).toBe(true);
    const [edits] = onMoveElements.mock.calls[0] as unknown as [
      Array<{ element: TimelineElement; updates: { start: number } }>,
    ];
    expect(edits.map((e) => ({ id: e.element.id, start: e.updates.start }))).toEqual([
      { id: "b", start: 2 },
    ]);
  });
});

describe("resolveShiftedElements", () => {
  it("maps each shift to its element and new start", () => {
    const elements = [el("a", 0, 2), el("c", 8, 1)];
    const resolved = resolveShiftedElements(elements, [{ key: "c", newStart: 2 }]);
    expect(resolved).toEqual([{ element: elements[1], start: 2 }]);
  });

  it("resolves by key when present, falling back to id", () => {
    const withKey: TimelineElement = { ...el("a", 0, 2), key: "a-key" };
    const resolved = resolveShiftedElements([withKey], [{ key: "a-key", newStart: 5 }]);
    expect(resolved).toEqual([{ element: withKey, start: 5 }]);
  });

  it("drops a shift whose key matches no element", () => {
    const elements = [el("a", 0, 2)];
    expect(resolveShiftedElements(elements, [{ key: "ghost", newStart: 0 }])).toEqual([]);
  });
});

describe("canShiftTrackGapClips", () => {
  it("is true only when every named clip is movable", () => {
    const lane = [el("a", 1, 2), lockedEl("b", 5, 3)];
    expect(canShiftTrackGapClips(lane, [{ key: "a", newStart: 0 }])).toBe(true);
    expect(canShiftTrackGapClips(lane, resolveAllTrackGaps(lane))).toBe(false);
  });

  it("is false for unknown keys", () => {
    expect(canShiftTrackGapClips([el("a", 0, 1)], [{ key: "ghost", newStart: 0 }])).toBe(false);
  });
});

describe("resolveMainTrackDeleteRippleShifts", () => {
  it("closes the gap left by a deleted main-track clip", () => {
    const deleted = [el("b", 2, 2)];
    const survivors = [el("a", 0, 2), el("c", 8, 1)]; // "b" already removed from this set
    // "c" shifts left by exactly "b"'s 2s duration (8 -> 6), not all the way
    // to 2: the 4-6..8 span was already an open gap before the delete, and
    // ripple must not also swallow it.
    expect(resolveMainTrackDeleteRippleShifts(survivors, deleted, true)).toEqual([
      { key: "c", newStart: 6 },
    ]);
  });

  it("does not also close a pre-existing gap the delete never touched", () => {
    // a(0-2), b(2-4)[deleted], GAP(4-6), c(6-7): deleting b should slide c
    // left by b's 2s only, landing at 4 — flush against a, the pre-existing
    // gap collapsed only because it's now adjacent, not doubly-counted.
    const deleted = [el("b", 2, 2)];
    const survivors = [el("a", 0, 2), el("c", 6, 1)];
    expect(resolveMainTrackDeleteRippleShifts(survivors, deleted, true)).toEqual([
      { key: "c", newStart: 4 },
    ]);
  });

  it("leaves an untouched clip before the delete point exactly where it was", () => {
    // a(0-2), GAP(2-5), b(5-7)[deleted]: nothing follows b, so nothing
    // shifts — a keeps its own leading position, ripple included.
    const deleted = [el("b", 5, 2)];
    const survivors = [el("a", 0, 2)];
    expect(resolveMainTrackDeleteRippleShifts(survivors, deleted, true)).toBeNull();
  });

  it("returns null when ripple is off", () => {
    const deleted = [el("b", 2, 2)];
    const survivors = [el("a", 0, 2), el("c", 8, 1)];
    expect(resolveMainTrackDeleteRippleShifts(survivors, deleted, false)).toBeNull();
  });

  it("returns null when nothing deleted was on the main track", () => {
    const deletedOverlay = [el("o", 2, 2, 1)]; // track 1, not main
    const survivors = [el("a", 0, 2), el("c", 8, 1)];
    expect(resolveMainTrackDeleteRippleShifts(survivors, deletedOverlay, true)).toBeNull();
  });

  it("returns null when the survivors are already gapless", () => {
    const deleted = [el("b", 100, 1)]; // deleted from far off the end
    const survivors = [el("a", 0, 2), el("c", 2, 1)]; // already contiguous
    expect(resolveMainTrackDeleteRippleShifts(survivors, deleted, true)).toBeNull();
  });

  it("refuses the whole ripple (not a partial one) when a shifting survivor is locked", () => {
    const deleted = [el("b", 2, 2)];
    const survivors = [el("a", 0, 2), lockedEl("c", 8, 1)];
    expect(resolveMainTrackDeleteRippleShifts(survivors, deleted, true)).toBeNull();
  });

  it("ignores audio and non-main-track survivors even when a main-track clip was deleted", () => {
    const deleted = [el("b", 2, 2)];
    const survivors = [el("a", 0, 2), el("c", 8, 1), el("overlay", 3, 1, 1)];
    const shifts = resolveMainTrackDeleteRippleShifts(survivors, deleted, true);
    expect(shifts).toEqual([{ key: "c", newStart: 6 }]); // "overlay" (track 1) untouched
  });

  it("sums only the deleted spans that precede each survivor, for a multi-select delete", () => {
    // a(0-2), b(2-4)[deleted], c(4-6), d(6-8)[deleted], e(8-9): a marquee
    // delete of b and d in one batch. "c" sits before d, so it shifts by
    // b's 2s alone; "e" sits after both, so it shifts by their 4s combined.
    const deleted = [el("b", 2, 2), el("d", 6, 2)];
    const survivors = [el("a", 0, 2), el("c", 4, 2), el("e", 8, 1)];
    expect(resolveMainTrackDeleteRippleShifts(survivors, deleted, true)).toEqual([
      { key: "c", newStart: 2 },
      { key: "e", newStart: 4 },
    ]);
  });
});
