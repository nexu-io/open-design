import { describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import {
  computeDragPreview,
  computeResizePreview,
  guideIfSaved,
  getTimelineDragOverlayPosition,
  trimPreviewTime,
  type DragPreviewContext,
} from "./timelineClipDragPreview";
import { useLinkedClipPreferences } from "../../utils/linkedClipPreferences";
import type { DraggedClipState } from "./timelineClipDragTypes";
import {
  commitDraggedClipMove,
  persistMoveEdits,
  type TimelineMoveEdit,
} from "./timelineClipDragCommit";
import {
  LANE_H,
  RULER_H,
  TRACKS_TOP_PAD,
  TRACK_H,
  createTimelineRowGeometry,
} from "./timelineLayout";
import { isMultiDragPassenger } from "./timelineMultiDragPreview";
import { resolveMultiDragPreview } from "./timelineProviderStateBuilders";

// ─────────────────────────────────────────────────────────────────────────────
// Regression bed for the live-reproduced BUG 1: a PLAIN HORIZONTAL drag of a clip
// on its own top lane armed a phantom new-track insert (the old 0.32 insert band
// reached deep into the clip body). That insert flipped the commit into the
// lane-change branch, which nudged the clip's z-index and re-sorted it off its
// lane. The invariant: a horizontal drag over a clip BODY → insertRow === null,
// previewTrack unchanged (a pure time move — zero topology change, zero z sync).
//
// Elements mirror the user's index.html shapes: a high-z "v-moodboard" alone on
// the top display lane, over several lower-lane video clips it overlaps in time,
// plus a caption. Tracks here are already the normalized DISPLAY lanes (the store
// runs normalizeToZones on discovery), matching what the drag hook passes in.
// ─────────────────────────────────────────────────────────────────────────────

const PPS = 40;

function clip(
  id: string,
  track: number,
  start: number,
  duration: number,
  zIndex: number,
  tag = "video",
): TimelineElement {
  return { id, key: id, tag, start, duration, track, zIndex, domId: id };
}

// v-moodboard: own top lane (0). Lower lane (1) carries overlapping video clips;
// captions sit on lane 2. trackOrder = [0, 1, 2].
const moodboard = clip("v-moodboard", 0, 19, 5.5, 37);
const fixtureElements: TimelineElement[] = [
  moodboard,
  clip("v-dashboard", 1, 19, 4, 16),
  clip("v-globe", 1, 23, 1.5, 17),
  clip("cap", 2, 20.82, 1.78, 0, "text"),
];

// A scroll container whose content-space y equals clientY (rect top 0, no scroll).
function fakeScroll(): HTMLDivElement {
  return {
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: 100000,
  } as unknown as HTMLDivElement;
}

function ctx(
  rowHeights?: readonly number[],
  elements: TimelineElement[] = fixtureElements,
): DragPreviewContext {
  return {
    scroll: fakeScroll(),
    pps: PPS,
    duration: 44.5,
    trackOrder: [0, 1, 2],
    elements,
    rowHeights,
    selectedKeys: new Set<string>(),
    buildSnapTargets: () => [],
    audioTracks: new Set<number>(),
  };
}

// content-space y for a fractional row index (inverse of getTimelineRowFromY).
const yForRow = (rowFloat: number) => RULER_H + TRACKS_TOP_PAD + rowFloat * TRACK_H;

// A drag grabbing `element` at vertical position `grabRowFloat` within its lane.
function horizontalDrag(
  element: TimelineElement,
  grabRowFloat: number,
  deltaSeconds: number,
): { drag: DraggedClipState; clientX: number; clientY: number } {
  const originClientX = 800;
  const originClientY = yForRow(grabRowFloat);
  const drag: DraggedClipState = {
    pointerId: 0,
    element,
    originClientX,
    originClientY,
    originScrollLeft: 0,
    originScrollTop: 0,
    pointerClientX: originClientX,
    pointerClientY: originClientY,
    pointerOffsetX: 0,
    pointerOffsetY: 0,
    previewStart: element.start,
    previewTrack: element.track,
    insertRow: null,
    snapTime: null,
    snapType: null,
    started: true,
  };
  // Horizontal: clientY stays at the grab point; only x advances by the delta.
  return { drag, clientX: originClientX + deltaSeconds * PPS, clientY: originClientY };
}

describe("computeDragPreview — plain horizontal drag never arms a phantom insert (BUG 1)", () => {
  it("opens the physical seam below a zero-padding ruler and keeps it armed inside the new lane", () => {
    const geometry = createTimelineRowGeometry([0, 1, 2], [104, 48, 48], { top: 0 });
    const context = { ...ctx(geometry.rowHeights), rowGeometry: geometry };
    const { drag, clientX } = horizontalDrag(moodboard, 0.5, 2);
    const top = computeDragPreview(drag, clientX, 24, context);
    expect(top.insertRow).toBe(0);
    const between = computeDragPreview(drag, clientX, 128, context);
    expect(between.insertRow).toBe(1);
    const inside = computeDragPreview(between, clientX, 150, context);
    expect(inside.insertRow).toBe(1);
    const below = computeDragPreview(inside, clientX, 202, context);
    expect(below.insertRow).toBeNull();
  });

  it("dragging v-moodboard +2s while grabbing its clip body keeps it a pure time move", () => {
    const { drag, clientX, clientY } = horizontalDrag(moodboard, 0.5, 2);
    const next = computeDragPreview(drag, clientX, clientY, ctx());
    expect(next.insertRow).toBeNull(); // no phantom new-track insert
    expect(next.previewTrack).toBe(0); // stays on its own lane
    expect(next.desiredTrack).toBe(0); // pointer never left lane 0 → not a vertical aim
    expect(next.previewStart).toBeCloseTo(21, 5); // +2s moved
  });

  it("grabbing ANYWHERE across the clip body (not just dead-center) stays a pure time move", () => {
    // Sweep the whole clip body of lane 0; a horizontal drag must never insert.
    for (let grab = 0.1; grab <= 0.9 + 1e-9; grab += 0.1) {
      const { drag, clientX, clientY } = horizontalDrag(moodboard, grab, 2);
      const next = computeDragPreview(drag, clientX, clientY, ctx());
      expect(next.insertRow).toBeNull();
      expect(next.previewTrack).toBe(0);
    }
  });

  it("aiming the gutter ABOVE the top lane arms a top insert (UX rule 2)", () => {
    // Drag v-moodboard up into the top breathing pad → insert a new top track.
    const originClientX = 800;
    const originClientY = yForRow(0.5);
    const drag: DraggedClipState = {
      pointerId: 0,
      element: moodboard,
      originClientX,
      originClientY,
      originScrollLeft: 0,
      originScrollTop: 0,
      pointerClientX: originClientX,
      pointerClientY: originClientY,
      pointerOffsetX: 0,
      pointerOffsetY: 0,
      previewStart: moodboard.start,
      previewTrack: moodboard.track,
      insertRow: null,
      snapTime: null,
      snapType: null,
      started: true,
    };
    // Pointer well above the first lane (into the top pad → rowFloat < 0).
    const next = computeDragPreview(drag, originClientX, yForRow(-0.6), ctx());
    expect(next.insertRow).toBe(0); // a new TOP track will be created on drop
  });

  it("keeps a horizontal drag in the body of an expanded row out of insert mode", () => {
    const rowHeights = [TRACK_H + 2 * LANE_H, TRACK_H, TRACK_H];
    const clientY = RULER_H + TRACKS_TOP_PAD + rowHeights[0] - 8;
    const { drag, clientX } = horizontalDrag(moodboard, 0.5, 2);
    const next = computeDragPreview(
      { ...drag, originClientY: clientY, pointerClientY: clientY },
      clientX,
      clientY,
      ctx(rowHeights),
    );
    expect(next.insertRow).toBeNull();
    expect(next.previewTrack).toBe(0);
  });

  it("an occupied aim in an expanded row stays on that row at the nearest free time", () => {
    const rowHeights = [TRACK_H + 2 * LANE_H, TRACK_H];
    const dragged = clip("dragged", 0, 0, 1, 3);
    const occupied = [dragged, clip("block-0", 0, 0, 1, 2), clip("block-1", 1, 0, 1, 1)];
    const clientY = RULER_H + TRACKS_TOP_PAD + 30;
    const drag: DraggedClipState = {
      pointerId: 0,
      element: dragged,
      originClientX: 0,
      originClientY: clientY,
      originScrollLeft: 0,
      originScrollTop: 0,
      pointerClientX: 0,
      pointerClientY: clientY,
      pointerOffsetX: 0,
      pointerOffsetY: 0,
      previewStart: 0,
      previewTrack: 0,
      insertRow: null,
      snapTime: null,
      snapType: null,
      started: true,
    };
    const next = computeDragPreview(drag, 0, clientY, {
      ...ctx(rowHeights, occupied),
      trackOrder: [0, 1],
    });
    expect(next.insertRow).toBeNull();
    expect(next.previewTrack).toBe(0);
    expect(next.previewStart).toBe(1);
  });
});

describe("computeDragPreview — a clip landing on an empty main track keeps its released start", () => {
  // v-lower sits alone on lane 1; lane 0 (the main track) is empty.
  const vLower = clip("v-lower", 1, 10, 4, 5);

  // Grab v-lower mid-body on lane 1, aim at `targetRowFloat` (same x — no
  // horizontal move), against the given sibling elements and selection.
  function dragUpToMainTrack(
    elements: TimelineElement[],
    targetRowFloat = 0.5,
    selectedKeys: ReadonlySet<string> = new Set(),
  ) {
    const originClientY = yForRow(1.5);
    const drag: DraggedClipState = {
      pointerId: 0,
      element: vLower,
      originClientX: 800,
      originClientY,
      originScrollLeft: 0,
      originScrollTop: 0,
      pointerClientX: 800,
      pointerClientY: originClientY,
      pointerOffsetX: 0,
      pointerOffsetY: 0,
      previewStart: vLower.start,
      previewTrack: vLower.track,
      insertRow: null,
      snapTime: null,
      snapType: null,
      started: true,
    };
    return computeDragPreview(drag, 800, yForRow(targetRowFloat), {
      ...ctx(undefined, elements),
      trackOrder: [0, 1],
      selectedKeys,
    });
  }

  it("dragging straight up onto the empty main track keeps the start", () => {
    const next = dragUpToMainTrack([vLower]);
    expect(next.previewTrack).toBe(0);
    expect(next.insertRow).toBeNull();
    expect(next.previewStart).toBe(10);
  });

  it("does not touch the start once the main track already holds a clip", () => {
    const vMain = clip("v-main", 0, 0, 3, 5);
    const next = dragUpToMainTrack([vLower, vMain]);
    expect(next.previewStart).toBe(10); // unchanged — main track wasn't empty
  });

  it("aiming the space above an empty main track opens a track there and keeps the start", () => {
    const next = dragUpToMainTrack([vLower], -0.6);
    expect(next.insertRow).toBe(0);
    expect(next.previewStart).toBe(10);
  });

  it("does not retime a multi-selection whose grabbed clip lands on the empty main track", () => {
    const vOther = clip("v-other", 1, 15, 3, 5);
    const next = dragUpToMainTrack([vLower, vOther], 0.5, new Set(["v-lower", "v-other"]));
    expect(next.previewTrack).toBe(0);
    // The grabbed clip's OWN vertical-only move must not force a horizontal
    // shift that resolveMultiSelection would then apply to v-other.
    expect(next.previewStart).toBe(10);
  });
});

describe("guideIfSaved — a guide only where the clip saves", () => {
  const grid = { time: 3.25, type: "grid" as const };

  it("drops the guide when start and duration round apart from the target", () => {
    // 1440 px/s: 1.125s + 2.125s saves as 1.13s + 2.13s, 14px past the 3.25s guide.
    const el = clip("a", 0, 1.125, 2, 0, "div");
    expect(guideIfSaved(el, { start: 1.125, duration: 2.125 }, grid, 1440)).toBeNull();
  });

  it("drops the guide when a nested clip's local start rounds off it", () => {
    const el = { ...clip("a", 0, 2, 1, 0, "div"), parentCompositionStart: 1 / 30 };
    const target = { time: 2.1, type: "playhead" as const };
    expect(guideIfSaved(el, { start: 2.1, duration: 1 }, target, 1440)).toBeNull();
  });

  it("keeps the guide when the saved edge is on it", () => {
    const el = clip("a", 0, 1, 2, 0, "div");
    expect(guideIfSaved(el, { start: 1, duration: 2.25 }, grid, 1440)).toBe(grid);
  });

  it("judges a move by the duration it keeps, not a rounded one", () => {
    // A 31/30 s clip moved so its end meets 3.25s saves its start at 2.22s and ends 4.8px past.
    const el = clip("a", 0, 1, 31 / 30, 0, "div");
    const edge = { time: 3.25, type: "clip-edge" as const };
    expect(guideIfSaved(el, { start: 2.217 }, edge, 1440)).toBeNull();
  });

  it("keeps the pointer's start when a move's snap would save off the target", () => {
    // 1440 px/s: a 31/30 s clip whose end snaps to 3.25s would save at 2.22s and jump 4px on release.
    const el = clip("a", 0, 1, 31 / 30, 0, "div");
    const { drag } = horizontalDrag(el, 0.5, 0);
    const context = {
      ...ctx(undefined, [el]),
      pps: 1440,
      buildSnapTargets: () => [{ time: 3.25, type: "clip-edge" as const }],
    };
    const x = drag.originClientX + 1.22 * 1440;
    const next = computeDragPreview(drag, x, drag.originClientY, context);
    expect(next).toMatchObject({ previewStart: 2.22, snapTime: null, snapType: null });
  });

  it("draws no guide for a move whose saved start misses the target", () => {
    const nested = { ...moodboard, parentCompositionStart: 1 / 30 };
    const { drag } = horizontalDrag(nested, 0.5, 0);
    const context = {
      ...ctx(),
      pps: 1440,
      buildSnapTargets: () => [{ time: 21, type: "playhead" as const }],
    };
    const next = computeDragPreview(
      drag,
      drag.originClientX + 2 * 1440,
      drag.originClientY,
      context,
    );
    expect(next.previewStart).toBe(21);
    expect(next.snapTime).toBeNull();
  });
});

describe("computeResizePreview — composition source continuity", () => {
  it("seeds a legacy composition offset and advances it at playback rate", () => {
    const element = {
      ...clip("comp", 0, 2, 4, 0, "div"),
      kind: "composition" as const,
      playbackRate: 2,
    };
    const result = computeResizePreview(
      {
        element,
        edge: "start",
        originClientX: 0,
        previewStart: 2,
        previewDuration: 4,
        started: true,
      },
      100,
      { scroll: fakeScroll(), pps: 100, buildSnapTargets: () => [] },
    );

    expect(result).toMatchObject({
      previewStart: 3,
      previewDuration: 3,
      previewPlaybackStart: 2,
    });
  });

  it("draws no guide when the trimmed start cannot save onto the target", () => {
    // 1440 px/s: a playhead on frame 31 (1.033s) saves a start of 1.03s, 4px off the guide.
    const result = computeResizePreview(
      {
        element: clip("a", 0, 1, 2, 0, "div"),
        edge: "start",
        originClientX: 0,
        previewStart: 1,
        previewDuration: 2,
        started: true,
      },
      48,
      {
        scroll: fakeScroll(),
        pps: 1440,
        buildSnapTargets: () => [{ time: 1.033, type: "playhead" }],
      },
    );
    expect(result).toMatchObject({ previewStart: 1.03, snapTime: null, snapType: null });
  });

  it("keeps the pointer's end when a tail snap would save off the target", () => {
    // 1440 px/s: snapping 1.125s + 2.12s to 3.25s needs a 2.125s duration, which saves 7px off.
    const result = computeResizePreview(
      {
        element: clip("a", 0, 1.125, 2, 0, "div"),
        edge: "end",
        originClientX: 0,
        previewStart: 1.125,
        previewDuration: 2,
        started: true,
      },
      173,
      { scroll: fakeScroll(), pps: 1440, buildSnapTargets: () => [{ time: 3.25, type: "grid" }] },
    );
    expect(result).toMatchObject({ previewDuration: 2.12, snapTime: null, snapType: null });
  });

  it("does not let a tail snap shrink a clip below the drag's minimum duration", () => {
    const result = computeResizePreview(
      {
        element: clip("vo", 0, 2, 1, 0),
        edge: "end",
        originClientX: 0,
        previewStart: 2,
        previewDuration: 1,
        started: true,
      },
      -95,
      { scroll: fakeScroll(), pps: 100, buildSnapTargets: () => [{ time: 2.07, type: "beat" }] },
    );

    expect(result).toMatchObject({ previewDuration: 0.1, snapTime: null });
  });

  it("keeps a slowed clip's media clock when its head snaps to a beat", () => {
    const element = { ...clip("vo", 0, 2, 4, 0), playbackStart: 3, playbackRate: 0.8 };
    const result = computeResizePreview(
      {
        element,
        edge: "start",
        originClientX: 0,
        previewStart: 2,
        previewDuration: 4,
        started: true,
      },
      30,
      {
        scroll: fakeScroll(),
        pps: 100,
        buildSnapTargets: () => [{ time: 2.3456, type: "beat" }],
      },
    );

    expect(result.snapTime).toBe(2.3456);
    const clock = result.previewStart - result.previewPlaybackStart! / 0.8;
    expect(clock).toBeCloseTo(2 - 3 / 0.8, 9);
  });
});

describe("getTimelineDragOverlayPosition", () => {
  it("keeps the gesture actor under the pointer across two-axis autoscroll", () => {
    const { drag } = horizontalDrag(moodboard, 0.5, 2);
    const scroll = {
      scrollLeft: 500,
      scrollTop: 300,
      getBoundingClientRect: () => ({ left: 20, top: 40 }),
    } as Pick<HTMLDivElement, "scrollLeft" | "scrollTop" | "getBoundingClientRect">;
    expect(
      getTimelineDragOverlayPosition(
        {
          ...drag,
          pointerClientX: 900,
          pointerClientY: 700,
          pointerOffsetX: 25,
          pointerOffsetY: 10,
        },
        scroll,
      ),
    ).toEqual({ left: 1_355, top: 950 });
  });

  it("does not mount an actor before threshold or without the stable viewport", () => {
    const { drag } = horizontalDrag(moodboard, 0.5, 2);
    expect(getTimelineDragOverlayPosition({ ...drag, started: false }, fakeScroll())).toBeNull();
    expect(getTimelineDragOverlayPosition(drag, null)).toBeNull();
  });
});

describe("computeDragPreview — the ghost start is the committed start", () => {
  function preview(
    element: TimelineElement,
    elements: TimelineElement[],
    originRow: number,
    targetRowFloat: number,
    selectedKeys: ReadonlySet<string> = new Set(),
  ): DraggedClipState {
    const originClientY = yForRow(originRow + 0.5);
    const drag: DraggedClipState = {
      pointerId: 0,
      element,
      originClientX: 800,
      originClientY,
      originScrollLeft: 0,
      originScrollTop: 0,
      pointerClientX: 800,
      pointerClientY: originClientY,
      pointerOffsetX: 0,
      pointerOffsetY: 0,
      previewStart: element.start,
      previewTrack: element.track,
      insertRow: null,
      snapTime: null,
      snapType: null,
      started: true,
    };
    return computeDragPreview(drag, 800, yForRow(targetRowFloat), {
      ...ctx(undefined, elements),
      trackOrder: [0, 1, 2],
      selectedKeys,
    });
  }

  function committedStart(
    ghost: DraggedClipState,
    committed: TimelineElement,
    elements: TimelineElement[],
    selectedKeys: ReadonlySet<string> = new Set(),
  ): number | undefined {
    const onMoveElement = vi.fn();
    const onMoveElements = vi.fn();
    commitDraggedClipMove(ghost, {
      elements,
      trackOrder: [0, 1, 2],
      updateElement: vi.fn(),
      onMoveElement,
      onMoveElements,
      selectedKeys,
    });
    const edits = onMoveElements.mock.calls[0]?.[0] as
      | Array<{ element: TimelineElement; updates: { start: number } }>
      | undefined;
    const single = onMoveElement.mock.calls[0];
    if (single) return single[1].start;
    return edits?.find((e) => e.element.id === committed.id)?.updates.start;
  }

  const lower = clip("lower", 1, 10, 4, 5);

  it("plain move onto the empty main track", () => {
    const ghost = preview(lower, [lower], 1, 0.5);
    expect(ghost.previewStart).toBe(10);
    expect(committedStart(ghost, lower, [lower])).toBe(ghost.previewStart);
  });

  it("top-gutter insert that pushes the old track-0 clip down keeps the pointer start", () => {
    const oldMain = clip("old-main", 0, 0, 3, 5);
    const elements = [oldMain, lower];
    const ghost = preview(lower, elements, 1, -0.6);
    expect(ghost.insertRow).toBe(0);
    expect(ghost.previewStart).toBe(10);
    expect(committedStart(ghost, lower, elements)).toBe(10);
  });

  it("a move onto an occupied row lands at its nearest free time, ghost and commit alike", () => {
    const blocker = clip("blocker", 0, 8, 4, 5);
    const elements = [blocker, lower];
    const ghost = preview(lower, elements, 1, 0.5);
    expect(ghost.insertRow).toBeNull();
    expect(ghost.previewTrack).toBe(0);
    expect(ghost.previewStart).toBe(12);
    expect(committedStart(ghost, lower, elements)).toBe(12);
  });

  describe("a drop onto an occupied row stays on that row", () => {
    const title = clip("title", 0, 0, 10, 3, "text");
    const subtitle = clip("subtitle", 1, 0, 6, 2, "text");
    const tag = clip("tag", 2, 2, 5, 1, "text");
    const rows = [title, subtitle, tag];

    it("Tag dropped on the Subtitle row lands right after Subtitle, with no new track", () => {
      const ghost = preview(tag, rows, 2, 1.5);
      expect(ghost).toMatchObject({ insertRow: null, previewTrack: 1, previewStart: 6 });
      expect(committedStart(ghost, tag, rows)).toBe(6);
    });

    it("Tag dropped on the top Title row stays on track 0 after Title, not snapped to 0", () => {
      const ghost = preview(tag, rows, 2, 0.5);
      expect(ghost).toMatchObject({ insertRow: null, previewTrack: 0, previewStart: 10 });
      expect(committedStart(ghost, tag, rows)).toBe(10);
    });

    it("a clip aimed at a seam opens a new track at that boundary", () => {
      for (const edge of [0.02, 0.98, 1.02]) {
        const ghost = preview(tag, rows, 2, edge);
        expect(ghost.insertRow).toBe(Math.round(edge));
      }
    });
  });

  describe("a clip released on or near its own spot stays there", () => {
    // Frame-aligned edges with three decimals: no centisecond start fits m's own slot.
    const a = clip("a", 0, 0, 3.333, 1);
    const m = clip("m", 0, 3.333, 3.333, 1);
    const b = clip("b", 0, 6.666, 4, 1);
    const row = [a, m, b];

    it("keeps its start and writes nothing when released where it started", () => {
      const ghost = preview(m, row, 0, 0.5);
      expect(ghost).toMatchObject({ previewTrack: 0, insertRow: null, previewStart: 3.333 });
      expect(committedStart(ghost, m, row)).toBeUndefined();
    });

    it("goes back to its own spot from a small nudge, snapped or not", () => {
      const snapped = [{ time: 3.333, type: "clip-edge" as const }];
      for (const targets of [[], snapped]) {
        const { drag, clientX, clientY } = horizontalDrag(m, 0.5, 0.1);
        const ghost = computeDragPreview(drag, clientX, clientY, {
          ...ctx(undefined, row),
          buildSnapTargets: () => targets,
        });
        expect(ghost).toMatchObject({ previewTrack: 0, previewStart: 3.333 });
      }
    });

    it("counts its own start only on its own row, where keeping it rewrites nothing", () => {
      // Row 1 has the same off-grid slot, but a move there writes a rounded start that would overlap.
      const c = clip("c", 1, 0, 3.333, 1);
      const d = clip("d", 1, 6.666, 4, 1);
      const ghost = preview(m, [...row, c, d], 0, 1.5);
      expect(ghost).toMatchObject({ previewTrack: 1, insertRow: null, previewStart: 10.67 });
    });
  });

  it("drops the snap guide when the row moves the clip off the snapped time", () => {
    const a = clip("a", 0, 0, 6, 1);
    const b = clip("b", 1, 3, 2, 1);
    const { drag, clientX } = horizontalDrag(b, 1.5, 0);
    const ghost = computeDragPreview(drag, clientX, yForRow(0.5), {
      ...ctx(undefined, [a, b]),
      buildSnapTargets: () => [{ time: 3, type: "beat" }],
    });
    expect(ghost).toMatchObject({
      previewTrack: 0,
      previewStart: 6,
      snapTime: null,
      snapType: null,
    });
  });

  it("expanded child dragged with its host: the host keeps its start and the ghost matches", () => {
    for (const [hostStart, childStart] of [
      [30, 32],
      [20, 22],
    ]) {
      const host = clip("host", 1, hostStart, 10, 5);
      const child: TimelineElement = {
        ...clip("child", 2, childStart, 4, 5),
        expandedHostKey: "host",
      };
      const elements = [host, child];
      const keys = new Set(["host", "child"]);
      const ghost = preview(child, elements, 2, 0.5, keys);
      expect(ghost.previewTrack).toBe(0);
      expect(ghost.previewStart).toBe(childStart);
      expect(committedStart(ghost, host, elements, keys)).toBe(hostStart);
    }
  });
});

describe("computeDragPreview — a group move keeps its shape", () => {
  function commitPreview(
    ghost: DraggedClipState,
    elements: TimelineElement[],
    selectedKeys: ReadonlySet<string>,
  ) {
    const onMoveElements = vi.fn<(edits: TimelineMoveEdit[]) => void>();
    commitDraggedClipMove(ghost, {
      elements,
      trackOrder: [0, 1, 2],
      updateElement: vi.fn(),
      onMoveElement: vi.fn(),
      onMoveElements,
      selectedKeys,
    });
    return onMoveElements.mock.calls[0][0];
  }

  it("never bumps the grabbed clip further left than the group's 0 limit", () => {
    const a = clip("a", 1, 0.5, 1, 1);
    const b = clip("b", 2, 7, 2, 1);
    const c = clip("c", 0, 6.4, 3.6, 1);
    const elements = [c, a, b];
    const selectedKeys = new Set(["a", "b"]);
    const { drag } = horizontalDrag(b, 2.5, 0);
    // Up two rows and 0.5 s left: the group limit allows 6.5 s, which overlaps c.
    const ghost = computeDragPreview(drag, 800 - 0.5 * PPS, yForRow(0.5), {
      ...ctx(undefined, elements),
      selectedKeys,
    });
    expect(ghost).toMatchObject({ previewTrack: 0, insertRow: null, previewStart: 10 });
    const edits = commitPreview(ghost, elements, selectedKeys);
    const moved = Object.fromEntries(
      edits.map((e) => [e.element.id, e.updates.start - e.element.start]),
    );
    expect(moved).toEqual({ a: 3, b: 3 });
  });

  // Drags `grabbed` by `seconds` onto `row` and commits; returns each written clip's start.
  function groupMove(
    grabbed: TimelineElement,
    elements: TimelineElement[],
    selectedKeys: ReadonlySet<string>,
    row: number,
    seconds: number,
  ) {
    const { drag } = horizontalDrag(grabbed, grabbed.track + 0.5, 0);
    const ghost = computeDragPreview(drag, 800 + seconds * PPS, yForRow(row + 0.5), {
      ...ctx(undefined, elements),
      selectedKeys,
    });
    const edits = commitPreview(ghost, elements, selectedKeys);
    return Object.fromEntries(edits.map((e) => [e.element.id, e.updates]));
  }

  it("lets a group whose leftmost clip starts off the centisecond grid reach 0 exactly", () => {
    const a = clip("a", 1, 0.333, 1, 1);
    const b = clip("b", 0, 7, 2, 1);
    const written = groupMove(b, [a, b], new Set(["a", "b"]), 0, -20);
    expect(written.a.start).toBe(0);
    expect(written.b.start).toBeCloseTo(6.667, 6);
  });

  it("does not treat the clips moving with it as obstacles", () => {
    const a = clip("a", 0, 0, 2, 1);
    const b = clip("b", 0, 3, 2, 1);
    const { drag, clientX, clientY } = horizontalDrag(a, 0.5, 2);
    const ghost = computeDragPreview(drag, clientX, clientY, {
      ...ctx(undefined, [a, b]),
      selectedKeys: new Set(["a", "b"]),
    });
    // b moves 2 s too, so a may take 2 to 4 s; were b an obstacle, a would stop at 1 s.
    expect(ghost).toMatchObject({ previewTrack: 0, previewStart: 2 });
  });

  it("treats a locked clip swept into the selection as an obstacle, since it does not move", () => {
    const locked: TimelineElement = { ...clip("locked", 0, 4, 2, 1), timelineLocked: true };
    const b = clip("b", 1, 0, 1, 1);
    const written = groupMove(b, [locked, b], new Set(["locked", "b"]), 0, 4.5);
    // 4.5 s overlaps the locked 4-6 s clip; 3 s and 6 s are equally near, and a tie goes later.
    expect(written).toEqual({ b: { start: 6, track: 0 } });
  });
});

describe("resolveMultiDragPreview — the live ghosts follow the clips that move", () => {
  it("slides the movable selected clips but not a locked one swept into the selection", () => {
    const locked: TimelineElement = { ...clip("locked", 0, 4, 2, 1), timelineLocked: true };
    const b = clip("b", 1, 0, 1, 1);
    const rider = clip("rider", 2, 8, 1, 1);
    const elements = [locked, b, rider];
    const selectedKeys = new Set(["locked", "b", "rider"]);
    const { drag } = horizontalDrag(b, 1.5, 0);
    const ghost = computeDragPreview(drag, 800 + 4.5 * PPS, yForRow(0.5), {
      ...ctx(undefined, elements),
      selectedKeys,
    });
    const preview = resolveMultiDragPreview(ghost, selectedKeys, elements);
    expect(preview && isMultiDragPassenger("rider", preview)).toBe(true);
    expect(preview && isMultiDragPassenger("locked", preview)).toBe(false);
  });
});

describe("a nested clip's drop stops at its host's start in the preview", () => {
  // Host at 2 s: the clip may not start before 2 unless it was authored there.
  const logo: TimelineElement = { ...clip("logo", 0, 5, 5, 0, "div"), parentCompositionStart: 2 };
  const saved = async (element: TimelineElement, start: number) => {
    const updateElement = vi.fn();
    await persistMoveEdits([{ element, updates: { start, track: element.track } }], {
      elements: [element],
      trackOrder: [0, 1, 2],
      updateElement,
      onMoveElements: vi.fn(async () => {}),
    });
    return updateElement.mock.calls[0]?.[1]?.start;
  };

  it("holds a drop that snapping would put before the host, and saves the same start", async () => {
    const { drag, clientX, clientY } = horizontalDrag(logo, 0.5, -3.9);
    const next = computeDragPreview(drag, clientX, clientY, {
      ...ctx(undefined, [logo]),
      buildSnapTargets: () => [{ time: 1.9, type: "beat" }],
    });
    expect(next.previewStart).toBe(2);
    expect(next.snapTime).toBeNull();
    expect(await saved(logo, next.previewStart)).toBe(2);
  });

  it("snaps from the floor, so an edge just past the host's start still catches", () => {
    const { drag, clientX, clientY } = horizontalDrag(logo, 0.5, -3.9);
    const next = computeDragPreview(drag, clientX, clientY, {
      ...ctx(undefined, [logo]),
      buildSnapTargets: () => [{ time: 2.1, type: "beat" }],
    });
    expect(next).toMatchObject({ previewStart: 2.1, snapTime: 2.1 });
  });

  it("keeps a mixed group's spacing when the nested member meets its floor", () => {
    // Grab the top-level member: only the group clamp knows the nested one's floor.
    const outro = clip("outro", 1, 8, 2, 0, "div");
    const { drag, clientX, clientY } = horizontalDrag(outro, 1.5, -7);
    const next = computeDragPreview(drag, clientX, clientY, {
      ...ctx(undefined, [logo, outro]),
      selectedKeys: new Set(["logo", "outro"]),
    });
    expect(next.previewStart).toBe(5);
  });

  it("leaves a clip authored before its host's start in place when grabbed", async () => {
    const early: TimelineElement = { ...logo, id: "early", key: "early", domId: "early", start: 1 };
    const { drag, clientX, clientY } = horizontalDrag(early, 0.5, 0);
    expect(computeDragPreview(drag, clientX, clientY, ctx(undefined, [early])).previewStart).toBe(
      1,
    );
    const trim = computeResizePreview(
      {
        element: early,
        edge: "start",
        originClientX: 0,
        previewStart: 1,
        previewDuration: 5,
        started: true,
        pointerId: 0,
      },
      0,
      { scroll: fakeScroll(), pps: PPS, buildSnapTargets: () => [] },
    );
    expect(trim).toMatchObject({ previewStart: 1, previewDuration: 5 });
    expect(await saved(early, 1)).toBe(1);
  });
});

describe("an audio clip stays inside its partner video", () => {
  const video = (extra: Partial<TimelineElement> = {}) => ({
    ...clip("v", 0, 10, 20, 1),
    syncOrigin: "lk-1",
    ...extra,
  });
  const audio = (extra: Partial<TimelineElement> = {}) => ({
    ...clip("a", 1, 12, 8, 0, "audio"),
    syncOrigin: "lk-1",
    ...extra,
  });
  const audioCtx = (elements: TimelineElement[], selected: string[] = []) => ({
    ...ctx(undefined, elements),
    trackOrder: [0, 1],
    audioTracks: new Set([1]),
    selectedKeys: new Set(selected),
  });

  it("a drag past the video's end stops with the audio's end on it", () => {
    const a = audio();
    const { drag, clientX, clientY } = horizontalDrag(a, 1.5, 30);
    const next = computeDragPreview(drag, clientX, clientY, audioCtx([video(), a]));
    expect(next.previewStart).toBe(22);
    expect(next.pointerClientX).toBe(drag.originClientX + 10 * PPS);
  });

  it("a drag before the video's start stops at it, linked or same-source", () => {
    const linked = audio({ syncOrigin: undefined, link: "lk-9" });
    const { drag, clientX, clientY } = horizontalDrag(linked, 1.5, -10);
    const elements = [video({ syncOrigin: undefined, link: "lk-9" }), linked];
    expect(computeDragPreview(drag, clientX, clientY, audioCtx(elements)).previewStart).toBe(10);
  });

  it("moves freely with no partner video, or when the video moves with it", () => {
    const loose = audio({ syncOrigin: undefined });
    const free = horizontalDrag(loose, 1.5, 30);
    expect(
      computeDragPreview(free.drag, free.clientX, free.clientY, audioCtx([video(), loose]))
        .previewStart,
    ).toBe(42);
    const a = audio();
    const both = horizontalDrag(a, 1.5, 30);
    expect(
      computeDragPreview(both.drag, both.clientX, both.clientY, audioCtx([video(), a], ["v", "a"]))
        .previewStart,
    ).toBe(42);
  });

  it("rejects a drop that collision placement would push outside the video", () => {
    const a = audio();
    const obstacle = clip("o", 1, 20, 10, 0, "audio");
    const { drag, clientX, clientY } = horizontalDrag(a, 1.5, 10);
    const next = computeDragPreview(drag, clientX, clientY, audioCtx([video(), a, obstacle]));
    expect(next.previewStart).toBeGreaterThanOrEqual(10);
    expect(next.previewStart + a.duration).toBeLessThanOrEqual(30);
  });

  it("keeps an audio carried in a multi-selection inside its video", () => {
    const a = audio();
    const title = clip("t", 0, 40, 4, 0, "text");
    const { drag, clientX, clientY } = horizontalDrag(title, 0.5, 30);
    const elements = [video(), a, title];
    const next = computeDragPreview(drag, clientX, clientY, audioCtx(elements, ["t", "a"]));
    expect(next.previewStart).toBe(50);
  });

  const trim = (edge: "start" | "end", deltaSeconds: number, gestureKeys: string[] = []) =>
    computeResizePreview(
      {
        element: audio({ sourceDuration: 100, playbackStart: 20 }),
        edge,
        originClientX: 0,
        previewStart: 12,
        previewDuration: 8,
        started: true,
      },
      deltaSeconds * 100,
      {
        scroll: fakeScroll(),
        pps: 100,
        buildSnapTargets: () => [],
        elements: [video(), audio()],
        gestureKeys: new Set(["a", ...gestureKeys]),
      },
    );

  it("a trim cannot extend past the video's start or end", () => {
    expect(trim("end", 50)).toMatchObject({ previewStart: 12, previewDuration: 18 });
    expect(trim("start", -10)).toMatchObject({ previewStart: 10, previewDuration: 10 });
  });

  it("a trim carried by the video too is not held to the video's old span", () => {
    expect(trim("end", 50, ["v"]).previewDuration).toBe(58);
  });
});

describe("trimPreviewTime", () => {
  it.each([25, 60])("shows the last frame of the clip at %s fps", (fps) => {
    useLinkedClipPreferences.getState().setCompositionFps(fps);
    expect(trimPreviewTime("end", 1, 2)).toBeCloseTo(3 - 1 / fps, 9);
    useLinkedClipPreferences.getState().setCompositionFps(30);
  });
});
