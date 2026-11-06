import { describe, expect, it, vi, type Mock } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import type { DraggedClipState } from "./useTimelineClipDrag";
import {
  commitDraggedClipMove,
  commitZMirrorLaneMove,
  persistMoveEdits,
  type DragCommitDeps,
  type TimelineMoveEdit,
} from "./timelineClipDragCommit";
import { normalizeToZones } from "./timelineZones";
import { resolveZMirrorLaneMove } from "./timelineZMirror";
import type { StackingPatch } from "./timelineStackingSync";
import { isStudioEditSaving, revertNewestStudioPendingEdit } from "../../utils/studioPendingEdits";

function el(
  id: string,
  track: number,
  start: number,
  duration: number,
  tag = "video",
): TimelineElement {
  // domId gives the row a patchable target so getTimelineEditCapabilities().canMove
  // is true (the capabilities gate in commitDraggedClipMove filters on it).
  return { id, key: id, tag, start, duration, track, domId: id };
}

/** Flush the microtask chain: the z-sync now fires only after the move persist
 *  promise resolves (serialized), so tests asserting on it must await. */
async function flushMicrotasks(): Promise<void> {
  for (let step = 0; step < 8; step += 1) await Promise.resolve();
}

function drag(
  element: TimelineElement,
  opts: {
    previewStart: number;
    previewTrack: number;
    desiredTrack?: number;
    insertRow?: number | null;
  },
): DraggedClipState {
  return {
    element,
    originClientX: 0,
    originClientY: 0,
    originScrollLeft: 0,
    originScrollTop: 0,
    pointerClientX: 0,
    pointerClientY: 0,
    pointerOffsetX: 0,
    pointerOffsetY: 0,
    previewStart: opts.previewStart,
    previewTrack: opts.previewTrack,
    // Defaults to previewTrack (a lane change) when a test doesn't distinguish a
    // horizontal collision bump — the commit's `desiredTrack ?? previewTrack`.
    desiredTrack: opts.desiredTrack,
    insertRow: opts.insertRow ?? null,
    snapTime: null,
    snapType: null,
    started: true,
  };
}

function editMap(edits: TimelineMoveEdit[]): Record<string, { start: number; track: number }> {
  const out: Record<string, { start: number; track: number }> = {};
  for (const e of edits)
    out[e.element.key ?? e.element.id] = {
      start: e.updates.start,
      track: e.updates.track,
    };
  return out;
}

/**
 * Run a drag commit with fresh spies for the three persist callbacks, returning
 * them so a test can assert on whichever path it exercised. Any other dep
 * (trackOrder, selectedKeys, readZIndex, onStackingPatches, …) is passed through.
 */
function runClipMove(
  dragState: DraggedClipState,
  deps: Omit<DragCommitDeps, "onMoveElement" | "onMoveElements" | "updateElement">,
): { updateElement: Mock; onMoveElement: Mock; onMoveElements: Mock } {
  const updateElement = vi.fn();
  const onMoveElement = vi.fn();
  const onMoveElements = vi.fn();
  commitDraggedClipMove(dragState, {
    ...deps,
    updateElement,
    onMoveElement,
    onMoveElements,
  });
  return { updateElement, onMoveElement, onMoveElements };
}

/** A drag onto another lane where the two clips do NOT time-overlap must issue no
 *  stacking patch (the dragged clip is elements[0]). Awaits the serialized z-sync. */
async function expectNoStackingPatchOnNonOverlapLaneChange(
  elements: TimelineElement[],
): Promise<void> {
  const onStackingPatches = vi.fn();
  runClipMove(drag(elements[0], { previewStart: 0, previewTrack: 0 }), {
    elements,
    trackOrder: [0, 1],
    readZIndex: () => 0,
    onStackingPatches,
  });
  await flushMicrotasks();
  expect(onStackingPatches).not.toHaveBeenCalled();
}

type MoveMap = Record<string, { start: number; track: number }>;

/** Assert a lane change persisted atomically (single onMoveElements, no single
 *  onMoveElement) and return the resulting id → {start, track} edit map. */
function expectAtomicMoveMap(spies: { onMoveElement: Mock; onMoveElements: Mock }): MoveMap {
  expect(spies.onMoveElement).not.toHaveBeenCalled();
  expect(spies.onMoveElements).toHaveBeenCalledTimes(1);
  return editMap(spies.onMoveElements.mock.calls[0][0]);
}

// Two time-overlapping clips carrying authored z (a below at z=1, b on top at
// z=5) — the bed for the z-sync / lane-change tests.
const overlapping = (): TimelineElement[] => [
  {
    id: "a",
    key: "a",
    tag: "video",
    start: 0,
    duration: 10,
    track: 1,
    zIndex: 1,
    domId: "a",
  },
  {
    id: "b",
    key: "b",
    tag: "video",
    start: 0,
    duration: 10,
    track: 0,
    zIndex: 5,
    domId: "b",
  },
];
const zOf = (e: TimelineElement) => ({ a: 1, b: 5 })[e.key ?? e.id] ?? 0;

// Commit an "insert a above b" lane change: the drop lifts a's z, so both the
// move persist and the z-sync fire. Tests drive onMoveElements differently
// (immediate / pending / rejecting), so the persist deps are supplied per call.
function commitInsertAbove(
  elements: TimelineElement[],
  deps: Partial<DragCommitDeps> & Pick<DragCommitDeps, "onMoveElements" | "onStackingPatches">,
): void {
  commitDraggedClipMove(drag(elements[0], { previewStart: 0, previewTrack: 1, insertRow: 0 }), {
    elements,
    trackOrder: [0, 1],
    updateElement: vi.fn(),
    onMoveElement: vi.fn(),
    readZIndex: zOf,
    ...deps,
  });
}

// The edited clip `a` is lifted above b(5) → 6, issued as one stacking patch.
function expectZLiftedToSix(onStackingPatches: Mock): void {
  expect(onStackingPatches).toHaveBeenCalledTimes(1);
  expect(onStackingPatches.mock.calls[0][0]).toEqual([{ key: "a", zIndex: 6 }]);
}

// A marquee (a+b selected) time-move of the dragged clip; returns the persist
// spies plus the resulting id → {start, track} edit map.
function runMarqueeMove(
  dragged: TimelineElement,
  previewStart: number,
  elements: TimelineElement[],
): {
  updateElement: Mock;
  onMoveElement: Mock;
  onMoveElements: Mock;
  map: MoveMap;
} {
  const spies = runClipMove(drag(dragged, { previewStart, previewTrack: 0 }), {
    elements,
    trackOrder: [0, 1],
    selectedKeys: new Set(["a", "b"]),
  });
  return { ...spies, map: editMap(spies.onMoveElements.mock.calls[0][0]) };
}

describe("commitDraggedClipMove", () => {
  it("pure time-move (same lane) persists just the dragged clip (single, SDK-aware)", () => {
    const elements = [el("v1", 1, 0, 5)];
    // previewTrack === element.track → no topology change → single move.
    const { onMoveElement, onMoveElements } = runClipMove(
      drag(elements[0], { previewStart: 6, previewTrack: 1 }),
      { elements, trackOrder: [1] },
    );
    expect(onMoveElements).not.toHaveBeenCalled();
    expect(onMoveElement).toHaveBeenCalledTimes(1);
    expect(onMoveElement.mock.calls[0][1]).toEqual({ start: 6, track: 1 });
  });

  it("a plain lane change persists ONLY the dragged clip (CapCut: never re-lanes others)", () => {
    // Move 'a' from lane 0 down onto lane 1 (b's lane) at a non-overlapping time.
    // The CapCut rule: editing one clip must never rewrite another. Only 'a' is
    // persisted — with its new lane (previewTrack 1) — and 'b' is left untouched.
    const elements = [el("a", 0, 0, 3), el("b", 1, 10, 3)];
    const { onMoveElements } = runClipMove(
      drag(elements[0], { previewStart: 20, previewTrack: 1, desiredTrack: 1 }),
      { elements, trackOrder: [0, 1] },
    );
    const map = editMap(onMoveElements.mock.calls[0][0]);
    expect(onMoveElements.mock.calls[0][2]).toBe("lane-reorder");
    expect(map.a).toEqual({ start: 20, track: 1 });
    expect(map.b).toBeUndefined(); // the other clip is NOT rewritten
  });

  it("persists a lane change in AUTHORED track space when the file is sparse", () => {
    // Discovery normalized authored tracks {1, 2} to display lanes {0, 1}
    // (authoredTrack records the file value). Moving 'a' onto b's lane must
    // write b's AUTHORED track (2) — writing the display lane (1) would target
    // a's own authored row and silently no-op in the file.
    const elements = [
      { ...el("a", 0, 0, 3), authoredTrack: 1 },
      { ...el("b", 1, 10, 3), authoredTrack: 2 },
    ];
    const { updateElement, onMoveElements } = runClipMove(
      drag(elements[0], { previewStart: 20, previewTrack: 1, desiredTrack: 1 }),
      { elements, trackOrder: [0, 1] },
    );
    // Store stays in display-lane space, but authoredTrack is refreshed to the
    // value just written to the file so a SECOND drag before any reload resolves
    // authored tracks from current data, not the stale pre-edit value.
    expect(updateElement).toHaveBeenCalledWith("a", { start: 20, track: 1, authoredTrack: 2 });
    // ...while the persist is translated to the target lane's authored track.
    const map = editMap(onMoveElements.mock.calls[0][0]);
    expect(map.a).toEqual({ start: 20, track: 2 });
  });

  it("resolves the authored track from occupants of the dragged clip's OWN source file", () => {
    // Expanded sub-comp children live on synthetic display lanes next to host
    // clips. Their authoredTrack is in THEIR file's coordinate space, so a lane
    // occupied by a clip from a DIFFERENT file must never lend its authored
    // value. Here lane 1 holds both a host-file clip (authored 12) and a
    // same-file sibling (authored 7): the sibling answers.
    const child3 = { ...el("c3", 0, 0, 3), authoredTrack: 3, sourceFile: "scene.html" };
    const child7 = { ...el("c7", 1, 10, 3), authoredTrack: 7, sourceFile: "scene.html" };
    const hostClip = { ...el("h", 1, 20, 3), authoredTrack: 12, sourceFile: "index.html" };
    const elements = [child3, child7, hostClip];
    const { onMoveElements } = runClipMove(
      drag(child3, { previewStart: 0, previewTrack: 1, desiredTrack: 1 }),
      { elements, trackOrder: [0, 1] },
    );
    const map = editMap(onMoveElements.mock.calls[0][0]);
    expect(map.c3).toEqual({ start: 0, track: 7 });
  });

  it("never persists the display-lane integer when the target lane has no same-file occupant", () => {
    // Reviewer scenario: an expanded child of a SPARSE file (authored tracks 3
    // and 7 → display lanes 4 and 5) dragged onto display lane 6, which holds
    // only another file's clip. Persisting 6 (the display integer) or 12 (the
    // foreign authored value) would corrupt the sparse file; the fallback
    // offsets from the NEAREST same-file lane instead: authored 7 at lane 5,
    // one lane further down → 8.
    const child3 = { ...el("c3", 4, 0, 3), authoredTrack: 3, sourceFile: "scene.html" };
    const child7 = { ...el("c7", 5, 10, 3), authoredTrack: 7, sourceFile: "scene.html" };
    const foreign = { ...el("f", 6, 20, 3), authoredTrack: 12, sourceFile: "index.html" };
    const elements = [child3, child7, foreign];
    const { onMoveElements } = runClipMove(
      drag(child3, { previewStart: 0, previewTrack: 6, desiredTrack: 6 }),
      { elements, trackOrder: [4, 5, 6] },
    );
    const map = editMap(onMoveElements.mock.calls[0][0]);
    expect(map.c3.track).not.toBe(6); // not the display-lane integer
    expect(map.c3.track).not.toBe(12); // not the foreign file's authored value
    expect(map.c3).toEqual({ start: 0, track: 8 });
  });

  it("dropping onto an overlap spill sub-lane persists the base lane's shared authored track", () => {
    // Authored track 2 holds two time-overlapping clips, which packTrackLanes
    // spills onto display sub-lanes 1 and 2 (both authoredTrack 2). Dropping
    // 'a' onto the spill sub-lane (2) is a legitimate same-track join: the
    // persisted value is the shared authored track (2), even though the clip
    // may re-pack onto a different sub-lane on the next normalize.
    const elements = normalizeToZones([
      { ...el("a", 0, 30, 3), authoredTrack: 1 },
      { ...el("b1", 2, 0, 5), authoredTrack: 2 },
      { ...el("b2", 2, 3, 5), authoredTrack: 2 }, // overlaps b1 → spills
    ]);
    expect(elements.map((e) => e.track)).toEqual([0, 1, 2]); // spill happened
    const spillLane = elements.find((e) => e.id === "b2")!.track;
    const { onMoveElements } = runClipMove(
      drag(elements[0], { previewStart: 30, previewTrack: spillLane, desiredTrack: spillLane }),
      { elements, trackOrder: [0, 1, 2] },
    );
    const map = editMap(onMoveElements.mock.calls[0][0]);
    expect(map.a).toEqual({ start: 30, track: 2 });
  });

  it("multi-selection time-move shifts EVERY selected clip by the drag delta (atomic)", () => {
    const elements = [el("a", 0, 2, 3), el("b", 1, 10, 3), el("c", 2, 20, 3)];
    // Drag 'a' +5s on its own lane while {a, b} are marquee-selected.
    const { onMoveElement, onMoveElements } = runClipMove(
      drag(elements[0], { previewStart: 7, previewTrack: 0 }),
      { elements, trackOrder: [0, 1, 2], selectedKeys: new Set(["a", "b"]) },
    );
    const map = expectAtomicMoveMap({ onMoveElement, onMoveElements });
    expect(map.a).toEqual({ start: 7, track: 0 });
    expect(map.b).toEqual({ start: 15, track: 1 }); // same +5 delta, keeps its lane
    expect(map.c).toBeUndefined(); // unselected clips untouched
  });

  it("collapses a selected expanded child onto its authored composition host", () => {
    const host = { ...el("host", 0, 10, 8), kind: "composition" as const };
    const child = {
      ...el("scene.html#title", 0.25, 12, 2),
      sourceFile: "scene.html",
      expandedHostKey: "host",
    };
    const { updateElement, onMoveElement, onMoveElements } = runClipMove(
      drag(child, { previewStart: 15, previewTrack: child.track }),
      {
        elements: [host],
        trackOrder: [0, child.track],
        selectedKeys: new Set(["host", "scene.html#title"]),
      },
    );

    expect(onMoveElements).not.toHaveBeenCalled();
    expect(onMoveElement).toHaveBeenCalledWith(host, { start: 13, track: 0 });
    expect(updateElement).toHaveBeenCalledWith("host", { start: 13, track: 0 });
    expect(updateElement).not.toHaveBeenCalledWith("scene.html#title", expect.anything());
  });

  it("drops a selected expanded child alias when the authored host initiates the drag", () => {
    const host = { ...el("host", 0, 10, 8), kind: "composition" as const };
    const child = {
      ...el("scene.html#title", 0.25, 12, 2),
      sourceFile: "scene.html",
      expandedHostKey: "host",
    };
    const { onMoveElement, onMoveElements } = runClipMove(
      drag(host, { previewStart: 13, previewTrack: host.track }),
      {
        elements: [host, child],
        trackOrder: [0, child.track],
        selectedKeys: new Set(["host", "scene.html#title"]),
      },
    );

    expect(onMoveElements).not.toHaveBeenCalled();
    expect(onMoveElement).toHaveBeenCalledOnce();
    expect(onMoveElement).toHaveBeenCalledWith(host, { start: 13, track: 0 });
  });

  it("keeps an expanded child as the edit target when its host is not selected", () => {
    const host = { ...el("host", 0, 10, 8), kind: "composition" as const };
    const child = {
      ...el("scene.html#title", 0.25, 12, 2),
      sourceFile: "scene.html",
      expandedHostKey: "host",
    };
    const { onMoveElement, onMoveElements } = runClipMove(
      drag(child, { previewStart: 15, previewTrack: child.track }),
      {
        elements: [host],
        trackOrder: [0, child.track],
        selectedKeys: new Set(["scene.html#title"]),
      },
    );

    expect(onMoveElements).not.toHaveBeenCalled();
    expect(onMoveElement).toHaveBeenCalledWith(child, { start: 15, track: child.track });
  });

  it("moves a host alias and an ordinary selected clip once each in one batch", () => {
    const host = { ...el("host", 0, 10, 8), kind: "composition" as const };
    const ordinary = el("ordinary", 1, 20, 3);
    const child = {
      ...el("scene.html#title", 0.25, 12, 2),
      sourceFile: "scene.html",
      expandedHostKey: "host",
    };
    const { onMoveElement, onMoveElements } = runClipMove(
      drag(child, { previewStart: 14, previewTrack: child.track }),
      {
        elements: [host, ordinary],
        trackOrder: [0, child.track, 1],
        selectedKeys: new Set(["host", "scene.html#title", "ordinary"]),
      },
    );

    const map = expectAtomicMoveMap({ onMoveElement, onMoveElements });
    expect(map).toEqual({
      host: { start: 12, track: 0 },
      ordinary: { start: 22, track: 1 },
    });
  });

  it("applies an expanded-child vertical drag to the selected host lane", () => {
    const host = { ...el("host", 0, 10, 8), kind: "composition" as const };
    const child = {
      ...el("scene.html#title", 0.25, 12, 2),
      sourceFile: "scene.html",
      expandedHostKey: "host",
    };
    const { onMoveElement, onMoveElements } = runClipMove(
      drag(child, { previewStart: 12, previewTrack: 1, desiredTrack: 1 }),
      {
        elements: [host],
        trackOrder: [0, child.track, 1],
        selectedKeys: new Set(["host", "scene.html#title"]),
      },
    );

    const map = expectAtomicMoveMap({ onMoveElement, onMoveElements });
    expect(map).toEqual({ host: { start: 10, track: 1 } });
  });

  it("multi-selection move clamps shifted clips at 0 and applies the store update optimistically", () => {
    const elements = [el("a", 0, 6, 3), el("b", 1, 2, 3)];
    // Drag 'a' −5s: b would land at −3 → clamps to 0.
    const { updateElement, map } = runMarqueeMove(elements[0], 1, elements);
    expect(map.a).toEqual({ start: 1, track: 0 });
    expect(map.b).toEqual({ start: 0, track: 1 });
    expect(updateElement).toHaveBeenCalledWith("a", { start: 1, track: 0 });
    expect(updateElement).toHaveBeenCalledWith("b", { start: 0, track: 1 });
  });

  it("a multi-selection that does NOT include the dragged clip moves only the dragged clip", () => {
    const elements = [el("a", 0, 0, 3), el("b", 1, 10, 3)];
    const { onMoveElement, onMoveElements } = runClipMove(
      drag(elements[0], { previewStart: 6, previewTrack: 0 }),
      { elements, trackOrder: [0, 1], selectedKeys: new Set(["b", "x"]) },
    );
    expect(onMoveElements).not.toHaveBeenCalled();
    expect(onMoveElement).toHaveBeenCalledTimes(1);
    expect(onMoveElement.mock.calls[0][1]).toEqual({ start: 6, track: 0 });
  });

  it("multi-selection lane change: dragged clip changes track, selection shifts in time, others untouched", () => {
    const elements = [el("a", 0, 0, 3), el("b", 1, 10, 3), el("c", 2, 20, 3)];
    // Drag 'a' +4s down onto lane 1 (non-overlapping with b) while {a, c} selected.
    const { onMoveElements } = runClipMove(
      drag(elements[0], { previewStart: 4, previewTrack: 1, desiredTrack: 1 }),
      { elements, trackOrder: [0, 1, 2], selectedKeys: new Set(["a", "c"]) },
    );
    const map = editMap(onMoveElements.mock.calls[0][0]);
    expect(onMoveElements.mock.calls[0][2]).toBe("lane-reorder");
    expect(map.a).toEqual({ start: 4, track: 1 }); // dragged: new time + new lane
    expect(map.c).toEqual({ start: 24, track: 2 }); // passenger: same +4 delta, own lane
    expect(map.b).toBeUndefined(); // unselected clip is NOT rewritten
  });

  it("inserting a new lane places the dragged clip at the aimed row and +1-shifts the clips below", () => {
    // a,b,c all start=0 dur=5 → mutually overlapping. Insert drops c on a NEW lane
    // at row 1 (between a and b). The CapCut renumber: c lands at row 1, a keeps
    // row 0, and b (at/below the insert) shifts down by one to row 2. Lane order
    // now follows track-index (a, c, b) — the ONLY sanctioned multi-clip write,
    // index-only. Contiguous 0..2, one atomic persist.
    const elements = [el("a", 0, 0, 5), el("b", 1, 0, 5), el("c", 2, 0, 5)];
    const { onMoveElements } = runClipMove(
      drag(elements[2], { previewStart: 0, previewTrack: 2, insertRow: 1 }),
      { elements, trackOrder: [0, 1, 2] },
    );
    expect(onMoveElements).toHaveBeenCalledTimes(1);
    expect(onMoveElements.mock.calls[0][2]).toBe("track-insert");
    const map = editMap(onMoveElements.mock.calls[0][0]);
    // Lanes are contiguous and distinct (no two overlapping clips share a lane).
    expect(new Set([map.a.track, map.b.track, map.c.track])).toEqual(new Set([0, 1, 2]));
    expect(map.a.track).toBe(0); // above the insert → unchanged
    expect(map.c.track).toBe(1); // dragged clip lands on the new lane
    expect(map.b.track).toBe(2); // at/below the insert → +1 shift
  });

  it("a selected audio passenger moves in time during a visual insert without being renumbered", () => {
    const a = { ...el("a", 0, 0, 5), sourceFile: "scene.html" };
    const b = { ...el("b", 1, 10, 5), sourceFile: "scene.html" };
    const t = { ...el("t", 1, 0, 5), sourceFile: "scene.html" };
    const audio = {
      ...el("audio", 2, 4, 20, "audio"),
      sourceFile: "scene.html",
      authoredTrack: 7,
    };

    const { onMoveElements } = runClipMove(
      drag(t, { previewStart: 5, previewTrack: 1, insertRow: 1 }),
      {
        elements: [a, b, t, audio],
        trackOrder: [0, 1, 2],
        selectedKeys: new Set(["t", "audio"]),
      },
    );

    const map = editMap(onMoveElements.mock.calls[0][0]);
    expect(map.audio).toEqual({ start: 9, track: 7 });
  });

  it("an audio insert persists zone-local tracks without rewriting visual lanes", () => {
    const v0 = el("v0", 0, 0, 5);
    const v1 = el("v1", 1, 0, 5);
    const a = { ...el("a", 2, 0, 5, "audio"), authoredTrack: 0 };
    const b = { ...el("b", 3, 10, 5, "audio"), authoredTrack: 1 };
    const t = { ...el("t", 3, 0, 5, "audio"), authoredTrack: 1 };

    const { onMoveElements } = runClipMove(
      drag(t, { previewStart: 0, previewTrack: 3, insertRow: 3 }),
      { elements: [v0, v1, a, b, t], trackOrder: [0, 1, 2, 3] },
    );

    expect(editMap(onMoveElements.mock.calls[0][0])).toEqual({
      a: { start: 0, track: 0 },
      t: { start: 0, track: 1 },
      b: { start: 10, track: 2 },
    });
  });

  it("refuses an audio insert when it would renumber a locked authored row", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const visual = el("visual", 0, 0, 5);
    const locked = {
      ...el("locked", 1, 0, 5, "audio"),
      authoredTrack: 0,
      timelineLocked: true,
    };
    const target = { ...el("target", 2, 0, 5, "audio"), authoredTrack: 1 };

    try {
      const { onMoveElements } = runClipMove(
        drag(target, { previewStart: 0, previewTrack: 2, insertRow: 1 }),
        { elements: [visual, locked, target], trackOrder: [0, 1, 2] },
      );

      expect(onMoveElements).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("locked clip locked would need renumbering"),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  describe("lane ↔ stacking sync", () => {
    it("lane change raises the edited clip's z above a time-overlapping lower-lane clip", async () => {
      // a & b overlap in time. Elements carry their authored z (as real discovery
      // populates TimelineElement.zIndex from the DOM), so the per-clip pack lays
      // them out by z: b (z=5) tops, a (z=1) below. The user drags a UP onto the
      // TOP lane (row 0, above b) via an insert — expressing "a should stack above
      // b". The z-sync must lift a above b (5) → 6 so the lane move is realised.
      // (Was: equal-z candidate + drop onto b's track; that relied on the old
      // key-order tie-break placing a on top, which contradicted canvas paint for
      // equal z — the elements now carry z and the drop intent is an insert above.)
      const elements: TimelineElement[] = [
        {
          id: "a",
          key: "a",
          tag: "video",
          start: 0,
          duration: 10,
          track: 1,
          zIndex: 1,
          domId: "a",
        },
        {
          id: "b",
          key: "b",
          tag: "video",
          start: 0,
          duration: 10,
          track: 0,
          zIndex: 5,
          domId: "b",
        },
      ];
      const z: Record<string, number> = { a: 1, b: 5 };
      const onStackingPatches = vi.fn();
      // Insert a new lane at row 0 (above the top lane) with a → a lands above b.
      runClipMove(drag(elements[0], { previewStart: 0, previewTrack: 1, insertRow: 0 }), {
        elements,
        trackOrder: [0, 1],
        readZIndex: (e) => z[e.key ?? e.id] ?? 0,
        onStackingPatches,
      });
      // z-sync is serialized after the move persist → deferred to a microtask.
      await flushMicrotasks();
      // Only `a` (the edited clip) is patched, lifted above b(5) → 6.
      expectZLiftedToSix(onStackingPatches);
    });

    it("a multi-selection lane move restacks only the dragged clip", async () => {
      // a moves up from row 2 to row 1 over c; the selected scene keeps its row, so it keeps its z.
      const elements = [
        el("scene", 0, 0, 10),
        el("b", 1, 5, 5),
        el("a", 2, 0, 4),
        el("c", 3, 0, 4),
      ];
      const z: Record<string, number> = { scene: 0, b: 2, a: 1, c: 3 };
      const onStackingPatches = vi.fn();
      runClipMove(drag(elements[2], { previewStart: 0, previewTrack: 1 }), {
        elements,
        trackOrder: [0, 1, 2, 3],
        selectedKeys: new Set(["a", "scene"]),
        readZIndex: (e) => z[e.key ?? e.id] ?? 0,
        onStackingPatches,
      });
      await flushMicrotasks();
      expect(onStackingPatches).toHaveBeenCalledTimes(1);
      expect(onStackingPatches.mock.calls[0][0]).toEqual([{ key: "a", zIndex: 4 }]);
    });

    it("partial z-sync deps (no readZIndex) → move persists but no stacking call", async () => {
      const elements = [el("a", 1, 0, 10), el("b", 0, 0, 10)];
      // onStackingPatches present but readZIndex absent → syncStackingForEdit needs
      // BOTH, so it must issue zero patches even though this IS a lane change.
      const onStackingPatches = vi.fn();
      const { onMoveElements } = runClipMove(
        drag(elements[0], { previewStart: 0, previewTrack: 0 }),
        { elements, trackOrder: [0, 1], onStackingPatches },
      );
      await flushMicrotasks();
      // The move still persists atomically; no z patch is issued, no stacking call.
      expect(onMoveElements).toHaveBeenCalledTimes(1);
      expect(onStackingPatches).not.toHaveBeenCalled();
    });

    it("no time overlap → no stacking patch even on a lane change", async () => {
      await expectNoStackingPatchOnNonOverlapLaneChange([el("a", 1, 0, 5), el("b", 0, 10, 5)]);
    });

    it("pure time-move (no lane change) never triggers a stacking patch", () => {
      const elements = [el("a", 0, 0, 10), el("b", 0, 0, 10)];
      const onStackingPatches = vi.fn();
      // same track → not a topology change → z-sync branch not reached.
      runClipMove(drag(elements[0], { previewStart: 3, previewTrack: 0 }), {
        elements,
        trackOrder: [0],
        readZIndex: () => 0,
        onStackingPatches,
      });
      expect(onStackingPatches).not.toHaveBeenCalled();
    });
  });

  describe("drop-intent lane realization — the dragged clip DISPLAYS on the aimed lane", () => {
    // CapCut-stable lanes follow the track-index, so a gap INSERT lands the dragged
    // clip exactly where aimed: it takes the new lane at the insert row and the
    // clips at/below shift down by one (the sanctioned renumber). z never enters
    // lane assignment, so a low-z clip aimed at the top gets the top lane regardless
    // of z. These are full preview→commit→normalize round trips: apply the persisted
    // track edits (and any z patches), then re-normalize — the lanes come purely
    // from the track-index renumber, never from z.
    const vz = (
      id: string,
      track: number,
      start: number,
      duration: number,
      zIndex: number,
    ): TimelineElement => ({
      id,
      key: id,
      tag: "video",
      start,
      duration,
      track,
      zIndex,
      domId: id,
    });

    async function roundTripLane(
      elements: TimelineElement[],
      dragState: DraggedClipState,
      trackOrder: number[],
    ): Promise<Record<string, number>> {
      let edits: TimelineMoveEdit[] = [];
      let patches: StackingPatch[] = [];
      const z = new Map(elements.map((e) => [e.key ?? e.id, (e.zIndex as number) ?? 0]));
      commitDraggedClipMove(dragState, {
        elements,
        trackOrder,
        updateElement: vi.fn(),
        onMoveElement: vi.fn(),
        onMoveElements: (e: TimelineMoveEdit[]) => {
          edits = e;
        },
        readZIndex: (el) => z.get(el.key ?? el.id) ?? 0,
        onStackingPatches: (p: StackingPatch[]) => {
          patches = p;
        },
      });
      await flushMicrotasks();
      const te = new Map(edits.map((e) => [e.element.key ?? e.element.id, e.updates]));
      const ze = new Map(patches.map((p) => [p.key, p.zIndex]));
      const persisted = elements.map((e) => {
        const k = e.key ?? e.id;
        const t = te.get(k);
        return {
          ...e,
          start: t ? t.start : e.start,
          track: t ? t.track : e.track,
          zIndex: ze.has(k) ? ze.get(k)! : e.zIndex,
        };
      });
      const lane: Record<string, number> = {};
      for (const e of normalizeToZones(persisted)) lane[e.key ?? e.id] = e.track;
      return lane;
    }

    it("TOP-insert of a clip that OVERLAPS NOTHING lands it on the top lane (not its z-rank)", async () => {
      // top(z20)/mid(z15) share the upper lanes; dragged(z2) is sequential (no time
      // overlap with anything) and low-z, so a global z-sort would sink it. Aim: top.
      const elements = [vz("top", 0, 0, 3, 20), vz("mid", 5, 3, 1, 15), vz("dragged", 1, 30, 3, 2)];
      const lane = await roundTripLane(
        elements,
        drag(elements[2], { previewStart: 30, previewTrack: 1, insertRow: 0 }),
        [0, 1],
      );
      expect(lane.dragged).toBe(0); // aimed at the very top
      expect(lane.top).toBe(1);
      expect(lane.mid).toBe(2);
    });

    it("BETWEEN-insert of a non-overlapping clip lands it between its neighbours", async () => {
      const elements = [vz("a", 0, 0, 3, 9), vz("b", 1, 0, 3, 5), vz("x", 2, 20, 5, 1)];
      const lane = await roundTripLane(
        elements,
        drag(elements[2], { previewStart: 20, previewTrack: 2, insertRow: 1 }),
        [0, 1, 2],
      );
      expect(lane.a).toBe(0);
      expect(lane.x).toBe(1); // between a and b, as aimed
      expect(lane.b).toBe(2);
    });

    it("TOP-insert clears a NON-overlapping clip that currently tops the timeline", async () => {
      // X overlaps M but NOT T (T tops the timeline, disjoint in time). Aiming X at
      // the top must lift it past T even though they never overlap.
      const elements = [vz("T", 0, 0, 3, 9), vz("M", 1, 10, 5, 5), vz("X", 2, 10, 5, 1)];
      const lane = await roundTripLane(
        elements,
        drag(elements[2], { previewStart: 10, previewTrack: 2, insertRow: 0 }),
        [0, 1, 2],
      );
      expect(lane.X).toBe(0); // aimed top, cleared the non-overlapping T
    });

    it("dragging X among overlapping neighbours preserves the RELATIVE order of the others (symptom 2)", async () => {
      // Four mutually-overlapping clips. Baseline lanes by z: n1,n2,x,n3. Drag x to
      // the top. Everything above x shifts down by one to make room (unavoidable),
      // but no TWO non-dragged clips may swap — a lane change of X must not reshuffle
      // its neighbours among themselves.
      const elements = [
        vz("n1", 0, 0, 10, 4),
        vz("n2", 1, 0, 10, 3),
        vz("x", 2, 0, 10, 2),
        vz("n3", 3, 0, 10, 1),
      ];
      const baseOrder = normalizeToZones(elements)
        .slice()
        .sort((a, b) => a.track - b.track)
        .map((e) => e.id)
        .filter((id) => id !== "x");
      const lane = await roundTripLane(
        elements,
        drag(elements[2], { previewStart: 0, previewTrack: 2, insertRow: 0 }),
        [0, 1, 2, 3],
      );
      expect(lane.x).toBe(0); // X lands where aimed
      const finalOrder = Object.keys(lane)
        .sort((a, b) => lane[a] - lane[b])
        .filter((id) => id !== "x");
      expect(finalOrder).toEqual(baseOrder); // neighbours keep their relative order
    });

    it("a drop that merely SHARES a lane with a non-overlapping neighbour issues no z nudge", async () => {
      // a → b's lane; they don't overlap → they share the lane, aim already met, so
      // no stacking patch (byte-identical to the pre-fix no-op path).
      await expectNoStackingPatchOnNonOverlapLaneChange([
        vz("a", 1, 0, 5, 0),
        vz("b", 0, 10, 5, 0),
      ]);
    });
  });

  describe("BUG 1 — a plain horizontal move never patches z (fixture repro)", () => {
    // Mirror the user's index.html: v-moodboard alone on the top display lane (0),
    // highest z, over lower-lane clips it OVERLAPS in time. A horizontal drag (the
    // preview yields insertRow=null, previewTrack unchanged) must be a pure time
    // move: single-clip persist, and NOT a single z patch or history entry — even
    // with the z-sync deps fully wired and time-overlapping neighbours present.
    const fixture = (): TimelineElement[] => [
      {
        id: "v-moodboard",
        key: "v-moodboard",
        tag: "video",
        start: 19,
        duration: 5.5,
        track: 0,
        zIndex: 37,
        domId: "v-moodboard",
      },
      {
        id: "v-dashboard",
        key: "v-dashboard",
        tag: "video",
        start: 19,
        duration: 4,
        track: 1,
        zIndex: 16,
        domId: "v-dashboard",
      },
      {
        id: "v-globe",
        key: "v-globe",
        tag: "video",
        start: 23,
        duration: 1.5,
        track: 1,
        zIndex: 17,
        domId: "v-globe",
      },
      {
        id: "cap",
        key: "cap",
        tag: "text",
        start: 20.82,
        duration: 1.78,
        track: 2,
        zIndex: 0,
        domId: "cap",
      },
    ];

    it("+2s on its own lane → single onMoveElement, zero stacking patches", async () => {
      const elements = fixture();
      const z: Record<string, number> = {
        "v-moodboard": 37,
        "v-dashboard": 16,
        "v-globe": 17,
      };
      const onStackingPatches = vi.fn();
      // previewTrack === element.track (0) and insertRow null → pure time move.
      const { onMoveElement, onMoveElements } = runClipMove(
        drag(elements[0], { previewStart: 21, previewTrack: 0 }),
        {
          elements,
          trackOrder: [0, 1, 2],
          readZIndex: (e) => z[e.key ?? e.id] ?? 0,
          onStackingPatches,
        },
      );
      await flushMicrotasks();
      expect(onMoveElement).toHaveBeenCalledTimes(1);
      expect(onMoveElement.mock.calls[0][1]).toEqual({ start: 21, track: 0 });
      expect(onMoveElements).not.toHaveBeenCalled();
      expect(onStackingPatches).not.toHaveBeenCalled(); // zero z patches / history entries
    });

    it("guard: a topology call that AIMS at the clip's own display lane issues no z nudge", async () => {
      // Belt-and-suspenders: even if a spurious insert whose boundary equals the
      // clip's own lane slips into the topology branch, aiming at the current lane
      // must never restack (syncStackingForEdit's aimedLane === currentLane no-op).
      const elements = fixture();
      const z: Record<string, number> = {
        "v-moodboard": 37,
        "v-dashboard": 16,
        "v-globe": 17,
      };
      const onStackingPatches = vi.fn();
      // insertRow 0 === v-moodboard's own display lane (0).
      runClipMove(drag(elements[0], { previewStart: 21, previewTrack: 0, insertRow: 0 }), {
        elements,
        trackOrder: [0, 1, 2],
        readZIndex: (e) => z[e.key ?? e.id] ?? 0,
        onStackingPatches,
      });
      await flushMicrotasks();
      expect(onStackingPatches).not.toHaveBeenCalled();
    });
  });

  describe("horizontal drag among overlapping neighbours touches exactly ONE clip (live repro)", () => {
    // The disease: a plain horizontal drag of one caption rewrote its own track,
    // added a z-index, and rewrote FOUR other clips' track-indexes. The cure: a
    // horizontal move writes ONLY the dragged clip's start — no other clip's
    // start/track, no z — even surrounded by time-overlapping clips.
    it("writes only the dragged clip's start; no other clip, no z", async () => {
      const elements: TimelineElement[] = [
        {
          id: "cap",
          key: "cap",
          tag: "text",
          start: 4.5,
          duration: 1.2,
          track: 0,
          zIndex: 26,
          domId: "cap",
        },
        {
          id: "n1",
          key: "n1",
          tag: "video",
          start: 4,
          duration: 3,
          track: 1,
          zIndex: 12,
          domId: "n1",
        },
        {
          id: "n2",
          key: "n2",
          tag: "video",
          start: 4,
          duration: 3,
          track: 2,
          zIndex: 19,
          domId: "n2",
        },
        {
          id: "n3",
          key: "n3",
          tag: "text",
          start: 5,
          duration: 2,
          track: 3,
          zIndex: 25,
          domId: "n3",
        },
      ];
      const onStackingPatches = vi.fn();
      // Pure horizontal: previewTrack === element.track (0), no insert.
      const { updateElement, onMoveElement, onMoveElements } = runClipMove(
        drag(elements[0], {
          previewStart: 5.5,
          previewTrack: 0,
          desiredTrack: 0,
        }),
        {
          elements,
          trackOrder: [0, 1, 2, 3],
          readZIndex: (e) => (e.zIndex as number) ?? 0,
          onStackingPatches,
        },
      );
      await flushMicrotasks();
      // Exactly one clip written, start only, no z entry.
      expect(updateElement).toHaveBeenCalledTimes(1);
      expect(updateElement).toHaveBeenCalledWith("cap", {
        start: 5.5,
        track: 0,
      });
      expect(onMoveElement).toHaveBeenCalledTimes(1);
      expect(onMoveElements).not.toHaveBeenCalled();
      expect(onStackingPatches).not.toHaveBeenCalled();
    });
  });

  describe("horizontal collision relocation (ITEM 2 — dragged clip only, never z)", () => {
    it("a horizontal drag bumped to a free lane writes ONLY the dragged clip, and never z", async () => {
      // The pointer stayed on lane 0 (desiredTrack === element.track), but the
      // target span was occupied there, so the collision rules relocated the DRAGGED
      // clip to lane 1 (previewTrack 1). That is not a deliberate vertical move:
      // persist just the dragged clip (new start + relocated lane), rewrite no other
      // clip, and issue zero z patches even though it now overlaps a neighbour.
      const elements: TimelineElement[] = [
        {
          id: "a",
          key: "a",
          tag: "video",
          start: 0,
          duration: 5,
          track: 0,
          zIndex: 2,
          domId: "a",
        },
        {
          id: "d",
          key: "d",
          tag: "video",
          start: 0,
          duration: 5,
          track: 2,
          zIndex: 0,
          domId: "d",
        },
      ];
      const onStackingPatches = vi.fn();
      const { onMoveElements } = runClipMove(
        // desiredTrack 0 (pointer never left lane 0) but previewTrack 1 (bumped).
        drag(elements[0], {
          previewStart: 2,
          previewTrack: 1,
          desiredTrack: 0,
        }),
        {
          elements,
          trackOrder: [0, 1, 2],
          readZIndex: (e) => (e.zIndex as number) ?? 0,
          onStackingPatches,
        },
      );
      await flushMicrotasks();
      const map = editMap(onMoveElements.mock.calls[0][0]);
      expect(map.a).toEqual({ start: 2, track: 1 }); // dragged clip relocated
      expect(map.d).toBeUndefined(); // untouched
      expect(onStackingPatches).not.toHaveBeenCalled(); // horizontal → never z
    });
  });

  describe("capabilities gate (ITEM 2)", () => {
    const locked = (
      id: string,
      track: number,
      start: number,
      duration: number,
    ): TimelineElement => ({
      ...el(id, track, start, duration),
      timelineLocked: true,
    });

    it("a marquee containing a locked clip never persists an edit for the locked clip", () => {
      const dragged = el("a", 0, 2, 3);
      const elements = [dragged, locked("b", 1, 10, 3)];
      // Pure time-move +5 on the same lane while {a, b} are marquee-selected.
      const { map } = runMarqueeMove(dragged, 7, elements);
      expect(map.a).toEqual({ start: 7, track: 0 });
      expect(map.b).toBeUndefined(); // locked → filtered out of the moving set
    });

    it("a plain lane change never persists a locked neighbour (only the dragged clip is written)", async () => {
      const dragged = el("a", 0, 0, 3);
      const elements = [dragged, locked("b", 1, 0, 3)];
      // Drag a onto b's lane. A plain lane change writes ONLY the dragged clip, so
      // the locked neighbour b is inherently untouched (never even a candidate).
      const { onMoveElements } = runClipMove(drag(dragged, { previewStart: 0, previewTrack: 1 }), {
        elements,
        trackOrder: [0, 1],
      });
      await flushMicrotasks();
      const map = editMap(onMoveElements.mock.calls[0][0]);
      expect(map.a).toBeDefined(); // movable dragged clip persists
      expect(map.b).toBeUndefined(); // locked clip receives no patch
    });

    it("a lane change that produces ZERO move edits fires no z-sync (no orphaned z entry, ITEM 5)", async () => {
      // Every clip in the set is locked (including the dragged one), so the moving
      // set filters down to nothing. persistMoveEdits resolves true for the empty
      // batch, but the z-sync must NOT fire — otherwise a "Reorder layers" history
      // entry lands with no corresponding move.
      const dragged = locked("a", 0, 0, 5);
      const elements = [dragged, locked("b", 0, 0, 5)];
      const onMoveElements = vi.fn();
      const onStackingPatches = vi.fn();
      // Drag onto lane 1 (a topology change) so the lane-change branch runs.
      commitDraggedClipMove(drag(dragged, { previewStart: 0, previewTrack: 1, insertRow: 0 }), {
        elements,
        trackOrder: [0],
        updateElement: vi.fn(),
        onMoveElement: vi.fn(),
        onMoveElements,
        readZIndex: () => 0,
        onStackingPatches,
      });
      await flushMicrotasks();
      expect(onMoveElements).not.toHaveBeenCalled(); // empty batch → no persist call
      expect(onStackingPatches).not.toHaveBeenCalled(); // and no orphaned z entry
    });
  });

  describe("z-sync serialization + rollback (ITEM 3)", () => {
    it("defers the z-sync until the move persist resolves (no clobbering pre-write)", async () => {
      const elements = overlapping();
      let resolveMove!: () => void;
      const onMoveElements = vi.fn(() => new Promise<void>((r) => (resolveMove = r)));
      const onStackingPatches = vi.fn();
      commitInsertAbove(elements, { onMoveElements, onStackingPatches });
      await flushMicrotasks();
      // Move persist still pending → the z patch must NOT have been issued yet.
      expect(onMoveElements).toHaveBeenCalledTimes(1);
      expect(onStackingPatches).not.toHaveBeenCalled();
      resolveMove();
      await flushMicrotasks();
      // Only after the write lands does the z patch fire — once, for the edited clip.
      expectZLiftedToSix(onStackingPatches);
    });

    it("refreshes the preview only after the complete lane and z transaction", async () => {
      const order: string[] = [];
      commitInsertAbove(overlapping(), {
        onMoveElements: vi.fn(async () => {
          order.push("lane");
        }),
        onStackingPatches: vi.fn(async () => {
          order.push("z");
        }),
        refreshAfterLaneMove: () => order.push("refresh"),
      });

      await flushMicrotasks();

      expect(order).toEqual(["lane", "z", "refresh"]);
    });

    it("rolls back the move and skips the z-sync when the persist fails", async () => {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const elements = overlapping();
      const onMoveElements = vi.fn(() => Promise.reject(new Error("write failed")));
      const onStackingPatches = vi.fn();
      const refreshAfterLaneMove = vi.fn();
      const updateElement = vi.fn();
      commitInsertAbove(elements, {
        updateElement,
        onMoveElements,
        onStackingPatches,
        refreshAfterLaneMove,
      });
      await flushMicrotasks();
      // Failed move → z patch never issued (no orphaned z change left behind)...
      expect(onStackingPatches).not.toHaveBeenCalled();
      expect(refreshAfterLaneMove).not.toHaveBeenCalled();
      // ...and the optimistic start/track edit for the dragged clip is rolled back.
      expect(updateElement).toHaveBeenCalledWith("a", { start: 0, track: 1 });
      errSpy.mockRestore();
    });

    it("does not let an older rejected move roll back a newer optimistic gesture", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const element = el("a", 0, 0, 5);
      let rejectFirst!: (error: Error) => void;
      const onMoveElement = vi
        .fn()
        .mockImplementationOnce(
          () => new Promise<void>((_resolve, reject) => (rejectFirst = reject)),
        )
        .mockResolvedValueOnce(undefined);
      const current = new Map([["a", { start: 0, track: 0 }]]);
      const updateElement = vi.fn((key: string, updates: Partial<TimelineElement>) => {
        current.set(key, { ...current.get(key)!, ...updates });
      });
      const deps = {
        elements: [element],
        trackOrder: [0],
        updateElement,
        onMoveElement,
      };

      commitDraggedClipMove(drag(element, { previewStart: 1, previewTrack: 0 }), deps);
      commitDraggedClipMove(drag(element, { previewStart: 2, previewTrack: 0 }), deps);
      await flushMicrotasks();
      rejectFirst(new Error("older write failed"));
      await flushMicrotasks();

      expect(current.get("a")).toEqual({ start: 2, track: 0 });
      errorSpy.mockRestore();
    });
  });

  describe("lane-change undo coalescing (ITEM 3c)", () => {
    const commitLaneChange = (elements: TimelineElement[]) => {
      const onMoveElements = vi.fn();
      const onStackingPatches = vi.fn();
      commitInsertAbove(elements, { onMoveElements, onStackingPatches });
      return { onMoveElements, onStackingPatches };
    };

    it("threads ONE shared coalesceKey to both the move persist and the z-sync, so the server can fold them into a single undo entry", async () => {
      const { onMoveElements, onStackingPatches } = commitLaneChange(overlapping());
      await flushMicrotasks();

      // Both sides receive the SAME non-empty gesture key (second arg). That
      // shared, non-empty coalesceKey is what lets the server
      // (projectHistory.ts, "claim: a writer that records after writing")
      // fold the "Move timeline clips" write and the "Reorder layers" z patch,
      // both to the same file, into one undo entry — folding itself is the
      // server's own tested behaviour, not re-proven here via a reducer.
      const moveKey = onMoveElements.mock.calls[0][1];
      const zKey = onStackingPatches.mock.calls[0][1];
      expect(typeof moveKey).toBe("string");
      expect(moveKey).not.toBe("");
      expect(zKey).toBe(moveKey);
    });

    it("distinct gestures get distinct keys (independent moves never cross-merge)", async () => {
      const { onMoveElements: first } = commitLaneChange(overlapping());
      const { onMoveElements: second } = commitLaneChange(overlapping());
      await flushMicrotasks();
      expect(first.mock.calls[0][1]).not.toBe(second.mock.calls[0][1]);
    });

    it("a plain move that issues no z patch persists once and records no second entry (unchanged)", async () => {
      // a & b do NOT overlap in time → the z-sync produces zero patches.
      const elements = [el("a", 1, 0, 5), el("b", 0, 10, 5)];
      const onMoveElements = vi.fn();
      const onStackingPatches = vi.fn();
      commitDraggedClipMove(drag(elements[0], { previewStart: 0, previewTrack: 0 }), {
        elements,
        trackOrder: [0, 1],
        updateElement: vi.fn(),
        onMoveElement: vi.fn(),
        onMoveElements,
        readZIndex: () => 0,
        onStackingPatches,
      });
      await flushMicrotasks();
      // Move persists exactly once; no z entry is created → nothing to merge, so
      // the single "Move timeline clips" entry stands alone as before.
      expect(onMoveElements).toHaveBeenCalledTimes(1);
      expect(onStackingPatches).not.toHaveBeenCalled();
    });
  });

  describe("a clip landing on an empty main track keeps its released start", () => {
    it("a top-gutter insert that renumbers to literal track 0 commits at the released start", () => {
      const elements = [el("v1", 1, 0, 5)];
      const { onMoveElements } = runClipMove(
        drag(elements[0], { previewStart: 8, previewTrack: 1, insertRow: 0 }),
        { elements, trackOrder: [1] },
      );
      expect(editMap(onMoveElements.mock.calls[0][0]).v1).toEqual({ start: 8, track: 0 });
    });

    it("a plain lane change onto the empty main track commits at the released start", () => {
      const elements = [el("v1", 1, 0, 5)];
      const spies = runClipMove(drag(elements[0], { previewStart: 8, previewTrack: 0 }), {
        elements,
        trackOrder: [0, 1],
      });
      expect(expectAtomicMoveMap(spies).v1).toEqual({ start: 8, track: 0 });
    });

    it("a top-gutter insert that pushes the old track-0 clip down keeps the released start", () => {
      const oldMain = el("old", 0, 0, 3);
      const dragged = el("v1", 2, 0, 5);
      const { onMoveElements } = runClipMove(
        drag(dragged, { previewStart: 8, previewTrack: 2, insertRow: 0 }),
        { elements: [oldMain, dragged], trackOrder: [0, 2] },
      );
      const map = editMap(onMoveElements.mock.calls[0][0]);
      expect(map.old.track).toBe(1);
      expect(map.v1).toEqual({ start: 8, track: 0 });
    });

    it("an expanded child dragged with its host onto the main track keeps the host's start", () => {
      for (const [hostStart, childStart] of [
        [30, 32],
        [20, 22],
      ]) {
        const host = el("host", 1, hostStart, 10);
        const child: TimelineElement = {
          ...el("child", 2, childStart, 4),
          expandedHostKey: "host",
        };
        const { onMoveElements } = runClipMove(
          drag(child, { previewStart: childStart, previewTrack: 0 }),
          {
            elements: [host, child],
            trackOrder: [0, 1, 2],
            selectedKeys: new Set(["host", "child"]),
          },
        );
        expect(editMap(onMoveElements.mock.calls[0][0]).host).toEqual({
          start: hostStart,
          track: 0,
        });
      }
    });

    it("a multi-selection top-gutter insert keeps the grabbed clip's start", () => {
      const dragged = el("v1", 1, 0, 5);
      const sibling = el("v2", 1, 10, 5);
      const elements = [dragged, sibling];
      const { onMoveElements } = runClipMove(
        drag(dragged, { previewStart: 8, previewTrack: 1, insertRow: 0 }),
        { elements, trackOrder: [1], selectedKeys: new Set(["v1", "v2"]) },
      );
      const map = editMap(onMoveElements.mock.calls[0][0]);
      expect(map.v1.start).toBe(8);
    });
  });
});

describe("commitZMirrorLaneMove", () => {
  const mirrorDeps = (elements: TimelineElement[], trackOrder: number[]) => {
    const updateElement = vi.fn();
    const onMoveElements = vi.fn();
    return {
      updateElement,
      onMoveElements,
      deps: { elements, trackOrder, updateElement, onMoveElements } as DragCommitDeps,
    };
  };

  it("kind:move persists start + display lane with the persistTrack override (same shape as a lane drag)", async () => {
    // t sits at lane 2 in a sparse file (authored 7); the mirror lands it on
    // lane 0 whose authored track is 3.
    const t = { ...el("t", 2, 0, 10), authoredTrack: 7 };
    const elements = [{ ...el("a", 0, 20, 5), authoredTrack: 3 }, el("b", 1, 0, 10), t];
    const { updateElement, onMoveElements, deps } = mirrorDeps(elements, [0, 1, 2]);
    const moved = await commitZMirrorLaneMove(
      t,
      { kind: "move", displayTrack: 0, persistTrack: 3 },
      deps,
      "z-reorder:bring-forward:t",
    );
    expect(moved).toBe(true);
    // Optimistic store update: DISPLAY lane + the written authoredTrack mirror.
    expect(updateElement).toHaveBeenCalledWith("t", {
      start: 0,
      track: 0,
      authoredTrack: 3,
    });
    // Persist: authored-space track, the z persist's coalesce key, lane-reorder op.
    expect(onMoveElements).toHaveBeenCalledTimes(1);
    const [persistEdits, coalesceKey, operation] = onMoveElements.mock.calls[0];
    expect(editMap(persistEdits)).toEqual({ t: { start: 0, track: 3 } });
    expect(coalesceKey).toBe("z-reorder:bring-forward:t");
    expect(operation).toBe("lane-reorder");
  });

  it("kind:insert reuses the track-insert renumber core (+1 shift below the new lane)", async () => {
    // a,b,c mutually overlapping on lanes 0/1/2. Mirror-insert c at row 1: c
    // lands on the new lane, b (at/below) shifts down — identical to the drag
    // insert test above, proving the shared core (no duplicated renumber logic).
    const elements = [el("a", 0, 0, 5), el("b", 1, 0, 5), el("c", 2, 0, 5)];
    const { onMoveElements, deps } = mirrorDeps(elements, [0, 1, 2]);
    const moved = await commitZMirrorLaneMove(
      elements[2],
      { kind: "insert", insertRow: 1 },
      deps,
      "z-reorder:bring-forward:c",
    );
    expect(moved).toBe(true);
    expect(onMoveElements).toHaveBeenCalledTimes(1);
    expect(onMoveElements.mock.calls[0][1]).toBe("z-reorder:bring-forward:c");
    expect(onMoveElements.mock.calls[0][2]).toBe("track-insert");
    const map = editMap(onMoveElements.mock.calls[0][0]);
    expect(map.a.track).toBe(0);
    expect(map.c.track).toBe(1);
    expect(map.b.track).toBe(2);
  });

  it("visual mirror inserts never persist or renumber same-file audio", async () => {
    // b and t share a visual lane because they do not overlap. Inserting t between
    // a and b creates one extra visual lane, so whole-timeline normalization moves
    // audio from display lane 2 to 3. That display-only shift must not be written.
    const a = { ...el("a", 0, 0, 5), sourceFile: "scene.html" };
    const b = { ...el("b", 1, 10, 5), sourceFile: "scene.html" };
    const t = { ...el("t", 1, 0, 5), sourceFile: "scene.html" };
    const audio = { ...el("audio", 2, 0, 20, "audio"), sourceFile: "scene.html" };
    const { onMoveElements, deps } = mirrorDeps([a, b, t, audio], [0, 1, 2]);

    const moved = await commitZMirrorLaneMove(
      t,
      { kind: "insert", insertRow: 1 },
      deps,
      "z-reorder:bring-forward:t",
    );

    expect(moved).toBe(true);
    const map = editMap(onMoveElements.mock.calls[0][0]);
    expect(map.audio).toBeUndefined();
    expect(map).toEqual({
      a: { start: 0, track: 0 },
      b: { start: 10, track: 2 },
      t: { start: 0, track: 1 },
    });
  });

  it("foreign expanded rows never distort the root-file insert topology", async () => {
    const host = { ...el("host", 0, 0, 5), sourceFile: "index.html" };
    const child1 = {
      ...el("child-1", 0.25, 0, 5),
      sourceFile: "scene.html",
    };
    const child2 = {
      ...el("child-2", 0.5, 0, 5),
      sourceFile: "scene.html",
    };
    const b = { ...el("b", 1, 0, 5), sourceFile: "index.html" };
    const t = { ...el("t", 2, 0, 5), sourceFile: "index.html" };
    const elements = [host, child1, child2, b, t];
    const { onMoveElements, deps } = mirrorDeps(elements, [0, 0.25, 0.5, 1, 2]);

    const moved = await commitZMirrorLaneMove(
      t,
      { kind: "insert", insertRow: 1 },
      deps,
      "z-reorder:bring-forward:t",
    );

    expect(moved).toBe(true);
    expect(editMap(onMoveElements.mock.calls[0][0])).toEqual({
      host: { start: 0, track: 0 },
      t: { start: 0, track: 1 },
      b: { start: 0, track: 2 },
    });
  });

  it("never triggers the lane→z stacking sync (it would fight the just-set z values)", async () => {
    // Even with BOTH z-sync deps supplied (the drag paths would engage them for
    // a vertical move like this), the mirror commit must not emit stacking
    // patches — the z values were just written by the user's menu action.
    const t = el("t", 2, 0, 10);
    const elements = [el("a", 0, 20, 5), el("b", 1, 0, 10), t];
    const { deps } = mirrorDeps(elements, [0, 1, 2]);
    const onStackingPatches = vi.fn();
    const moved = await commitZMirrorLaneMove(
      t,
      { kind: "move", displayTrack: 0, persistTrack: 0 },
      { ...deps, readZIndex: () => 0, onStackingPatches },
      "z-reorder:bring-forward:t",
    );
    await flushMicrotasks();
    expect(moved).toBe(true);
    expect(onStackingPatches).not.toHaveBeenCalled();
  });

  it("resolves false and rolls the store back when the persist rejects", async () => {
    const t = el("t", 1, 0, 10);
    const elements = [el("a", 0, 20, 5), t];
    const updateElement = vi.fn();
    const onMoveElements = vi.fn().mockRejectedValue(new Error("boom"));
    const moved = await commitZMirrorLaneMove(
      t,
      { kind: "move", displayTrack: 0, persistTrack: 0 },
      { elements, trackOrder: [0, 1], updateElement, onMoveElements },
      "z-reorder:send-backward:t",
    );
    expect(moved).toBe(false);
    // Optimistic write then rollback to the original lane.
    expect(updateElement).toHaveBeenLastCalledWith("t", {
      start: 0,
      track: 1,
      authoredTrack: undefined,
    });
  });

  it("END-TO-END one-element step: resolver insertRow renumbers the clip strictly between the two neighbors", async () => {
    // 3 stacked back-to-back clips + a free lane beyond the far one. Send t
    // (top) backward past b: the resolver must bound at c and produce the
    // insert row IMMEDIATELY below b, and commitZMirrorLaneMove's renumber must
    // land t strictly between b and c — never on the farther free lane 3.
    const t = el("t", 0, 0, 10);
    const b = el("b", 1, 0, 10);
    const c = el("c", 2, 0, 10);
    const far = el("far", 3, 20, 5); // free over t's span, beyond c
    const elements = [t, b, c, far];
    const move = resolveZMirrorLaneMove({
      action: "send-backward",
      element: t,
      elements,
      crossedKey: "b",
    });
    expect(move).toEqual({ kind: "insert", insertRow: 2 });
    const { onMoveElements, deps } = mirrorDeps(elements, [0, 1, 2, 3]);
    const moved = await commitZMirrorLaneMove(t, move!, deps, "z-reorder:send-backward:t");
    expect(moved).toBe(true);
    const map = editMap(onMoveElements.mock.calls[0][0]);
    // The renumber compacts t's vacated top lane, so the whole set shifts up by
    // one while t lands on the b/c boundary — strictly between the two.
    expect(map).toEqual({
      b: { start: 0, track: 0 },
      t: { start: 0, track: 1 },
      c: { start: 0, track: 2 },
      far: { start: 20, track: 3 },
    });
    expect(map.b.track).toBeLessThan(map.t.track);
    expect(map.t.track).toBeLessThan(map.c.track);
  });

  it("resolves false for a refused insert (locked clip would need renumbering)", async () => {
    // b is locked and sits at/below the insert row, so the whole-set renumber
    // is refused — no persist call.
    const a = el("a", 0, 0, 5);
    const b: TimelineElement = { ...el("b", 1, 0, 5), timelineLocked: true };
    const c = el("c", 2, 0, 5);
    const { onMoveElements, deps } = mirrorDeps([a, b, c], [0, 1, 2]);
    const moved = await commitZMirrorLaneMove(
      c,
      { kind: "insert", insertRow: 1 },
      deps,
      "z-reorder:bring-forward:c",
    );
    expect(moved).toBe(false);
    expect(onMoveElements).not.toHaveBeenCalled();
  });
});

describe("persistMoveEdits: a nested row dropped before its host", () => {
  it("lands at the host's start in the store and in the persist", async () => {
    const logo = { ...el("logo", 0, 5, 5, "div"), parentCompositionStart: 2 };
    const updateElement = vi.fn();
    const onMoveElements = vi.fn(async (_edits: TimelineMoveEdit[]) => {});
    await persistMoveEdits([{ element: logo, updates: { start: 1, track: 0 } }], {
      elements: [logo],
      trackOrder: [0],
      updateElement,
      onMoveElements,
    });
    expect(updateElement).toHaveBeenCalledWith("logo", { start: 2, track: 0 });
    expect(onMoveElements.mock.calls[0]?.[0]).toEqual([
      { element: logo, updates: { start: 2, track: 0 } },
    ]);
  });
});

describe("persistMoveEdits convergence", () => {
  it.each([
    { successor: "timing", detach: false, expectedGroup: "G" },
    { successor: "detach", detach: true, expectedGroup: undefined },
  ])(
    "preserves newer $successor while rolling back a refused detach",
    async ({ detach, expectedGroup }) => {
      let current: TimelineElement = { ...el("grouped", 0, 0, 4), audioGroup: "G" };
      let rejectDetach!: (error: Error) => void;
      let resolveSuccessor!: () => void;
      const refused = new Promise<void>((_resolve, reject) => {
        rejectDetach = reject;
      });
      const successor = new Promise<void>((resolve) => {
        resolveSuccessor = resolve;
      });
      const updateElement = (_key: string, updates: Partial<TimelineElement>) => {
        current = { ...current, ...updates };
      };
      const deps = { elements: [current], trackOrder: [0, 1], updateElement };
      const first = persistMoveEdits(
        [{ element: current, updates: { start: 0, track: 1, audioGroup: null } }],
        { ...deps, onMoveElements: () => refused },
        undefined,
        "track-insert",
      );
      expect(current.audioGroup).toBeUndefined();
      const second = persistMoveEdits(
        [
          {
            element: current,
            updates: { start: 5, track: 1, ...(detach ? { audioGroup: null } : {}) },
          },
        ],
        { ...deps, onMoveElements: () => successor },
      );
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        rejectDetach(new Error("save refused"));
        await expect(first).resolves.toBe(false);
        expect(current).toMatchObject({ start: 5, track: 1 });
        expect(current.audioGroup).toBe(expectedGroup);
        resolveSuccessor();
        await expect(second).resolves.toBe(true);
        expect(current).toMatchObject({ start: 5, track: 1 });
        expect(current.audioGroup).toBe(expectedGroup);
      } finally {
        consoleError.mockRestore();
      }
    },
  );

  it("registers a revert for the save in flight, and a reverted move is not reasserted", async () => {
    let current = el("clip", 0, 1, 2);
    let releaseSave!: () => void;
    const pendingSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const updateElement = (_key: string, updates: Partial<TimelineElement>) => {
      current = { ...current, ...updates };
    };
    const persisted = persistMoveEdits([{ element: current, updates: { start: 4, track: 0 } }], {
      elements: [current],
      trackOrder: [0],
      updateElement,
      onMoveElements: () => pendingSave,
    });
    expect(current.start).toBe(4);
    expect(isStudioEditSaving()).toBe(true);

    const reapply = revertNewestStudioPendingEdit();
    expect(reapply).not.toBeNull();
    expect(current.start).toBe(1);

    releaseSave();
    await expect(persisted).resolves.toBe(true);
    expect(current.start).toBe(1);
    expect(isStudioEditSaving()).toBe(false);
    reapply?.();
    expect(current.start).toBe(4);
  });

  it("reasserts a saved lane after a stale runtime sync", async () => {
    const clip = { ...el("headline", 2, 0.5, 4.9), authoredTrack: 2 };
    let releaseSave: (() => void) | undefined;
    const pendingSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let liveTrack = clip.track;
    let liveAuthoredTrack = clip.authoredTrack;
    const updateElement = vi.fn((_key: string, updates: Partial<TimelineElement>) => {
      if (updates.track != null) liveTrack = updates.track;
      if (updates.authoredTrack != null) liveAuthoredTrack = updates.authoredTrack;
    });

    const persisted = persistMoveEdits(
      [
        {
          element: clip,
          updates: { start: clip.start, track: 0 },
          persistTrack: 0,
        },
      ],
      {
        elements: [clip],
        trackOrder: [0, 1, 2],
        updateElement,
        onMoveElements: () => pendingSave,
      },
    );
    expect([liveTrack, liveAuthoredTrack]).toEqual([0, 0]);

    // Reproduce the real failure: the preview emits its cached pre-drag lane
    // while the file write is still pending.
    liveTrack = 2;
    liveAuthoredTrack = 2;
    releaseSave?.();

    await expect(persisted).resolves.toBe(true);
    expect([liveTrack, liveAuthoredTrack]).toEqual([0, 0]);
    expect(updateElement).toHaveBeenCalledTimes(2);
  });
});
