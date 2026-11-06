import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import { buildStackingTimelineLayers, insertPreviewTrackOrder } from "./timelineTrackOrder";

// fallow-ignore-next-line complexity
function rowElement(input: {
  id: string;
  track?: number;
  zIndex?: number;
  hasExplicitZIndex?: boolean;
  start?: number;
  duration?: number;
  tag?: string;
  stackingContextId?: string | null;
  parentCompositionId?: string | null;
  compositionAncestors?: string[];
}): TimelineElement {
  return {
    id: input.id,
    tag: input.tag ?? "div",
    start: input.start ?? 0,
    duration: input.duration ?? 1,
    track: input.track ?? 0,
    zIndex: input.zIndex ?? 0,
    hasExplicitZIndex: input.hasExplicitZIndex ?? true,
    stackingContextId: input.stackingContextId ?? "root",
    parentCompositionId: input.parentCompositionId ?? null,
    compositionAncestors: input.compositionAncestors ?? ["root"],
  };
}

function rowIds(rows: readonly { elements: readonly TimelineElement[] }[]): string[][] {
  return rows.map((row) => row.elements.map((element) => element.id));
}

describe("buildStackingTimelineLayers", () => {
  it("splits non-overlapping clips into separate lanes when their z-index differs", () => {
    // A lane is a z-band: differing z must land on different rows even when the
    // clips don't overlap in time, so a vertical (z) restack actually moves the
    // clip's row. Rows are ordered by descending z.
    const result = buildStackingTimelineLayers([
      rowElement({ id: "back", zIndex: 1, start: 0, duration: 1 }),
      rowElement({ id: "front", zIndex: 10, start: 1, duration: 1 }),
    ]);

    expect(rowIds(result.visualLayers)).toEqual([["front"], ["back"]]);
    expect(result.visualLayers[0]?.zIndex).toBe(10);
  });

  it("packs non-overlapping clips into one lane when they share a z-index", () => {
    const result = buildStackingTimelineLayers([
      rowElement({ id: "back", zIndex: 5, start: 0, duration: 1 }),
      rowElement({ id: "front", zIndex: 5, start: 1, duration: 1 }),
    ]);

    expect(rowIds(result.visualLayers)).toEqual([["back", "front"]]);
    expect(result.visualLayers[0]?.zIndex).toBe(5);
  });

  it("splits clips into separate lanes when they overlap in time", () => {
    const result = buildStackingTimelineLayers([
      rowElement({ id: "front", zIndex: 10, start: 0, duration: 2 }),
      rowElement({ id: "back", zIndex: 1, start: 1, duration: 2 }),
    ]);

    expect(rowIds(result.visualLayers)).toEqual([["front"], ["back"]]);
  });

  it("uses DOM order to break stacking ties before lane packing", () => {
    const result = buildStackingTimelineLayers([
      rowElement({ id: "first", track: 2, zIndex: 5, start: 0, duration: 2 }),
      rowElement({ id: "second", track: 0, zIndex: 5, start: 1, duration: 2 }),
    ]);

    expect(rowIds(result.visualLayers)).toEqual([["first"], ["second"]]);
  });

  it("packs auto-z clips by time instead of forcing one row per clip", () => {
    const result = buildStackingTimelineLayers([
      rowElement({ id: "a", zIndex: 0, hasExplicitZIndex: false, start: 0, duration: 1 }),
      rowElement({ id: "b", zIndex: 0, hasExplicitZIndex: false, start: 1, duration: 1 }),
    ]);

    expect(rowIds(result.visualLayers)).toEqual([["a", "b"]]);
  });

  it("does not merge equal z-index clips across stacking contexts", () => {
    const result = buildStackingTimelineLayers([
      rowElement({ id: "root", zIndex: 4, start: 0, duration: 1 }),
      rowElement({
        id: "nested",
        zIndex: 4,
        start: 1,
        duration: 1,
        stackingContextId: "scene",
        parentCompositionId: "scene",
        compositionAncestors: ["root", "scene"],
      }),
    ]);

    expect(rowIds(result.visualLayers)).toEqual([["root"], ["nested"]]);
  });

  it("returns audio clips as separate bottom rows without merging them into z layers", () => {
    const result = buildStackingTimelineLayers([
      rowElement({ id: "front", zIndex: 10 }),
      rowElement({ id: "music-a", tag: "audio", track: 4 }),
      rowElement({ id: "music-b", tag: "audio", track: 2 }),
    ]);

    expect(rowIds(result.visualLayers)).toEqual([["front"]]);
    expect(rowIds(result.audioLayers)).toEqual([["music-a"], ["music-b"]]);
    expect(rowIds(result.rows)).toEqual([["front"], ["music-a"], ["music-b"]]);
  });

  it("orders rows by descending z-index with auto-z clips ranked at computed zero", () => {
    const result = buildStackingTimelineLayers([
      rowElement({ id: "auto-a", zIndex: 0, hasExplicitZIndex: false }),
      rowElement({ id: "back", zIndex: -1 }),
      rowElement({ id: "front", zIndex: 10 }),
      rowElement({ id: "auto-b", zIndex: 0, hasExplicitZIndex: false }),
    ]);

    expect(rowIds(result.visualLayers)).toEqual([["front"], ["auto-a"], ["auto-b"], ["back"]]);
  });

  it("keeps a row key stable when a clip's z-index changes but membership does not", () => {
    const before = buildStackingTimelineLayers([rowElement({ id: "hero", zIndex: 1 })]);
    const after = buildStackingTimelineLayers([rowElement({ id: "hero", zIndex: 20 })]);

    expect(after.visualLayers[0]?.id).toBe(before.visualLayers[0]?.id);
  });
});

describe("insertPreviewTrackOrder", () => {
  it("inserts preview layer ids by target row index", () => {
    expect(insertPreviewTrackOrder(["a", "b", "c"], "preview", 1)).toEqual([
      "a",
      "preview",
      "b",
      "c",
    ]);
  });
});
