// @vitest-environment happy-dom

// Regression guard for the ruler-click seek. `handlePointerUp` replays
// `pendingClientXRef`, which only `updateScrubDrag` (pointermove) used to write,
// so a press with no move settled on the ref's initial 0 and clamped the
// playhead to t=0 — silently discarding the correct pointerdown seek.
import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountReactHarness } from "../../hooks/domSelectionTestHarness";
import { useTimelineRangeSelection } from "./useTimelineRangeSelection";
import { getTimelineRowGeometry } from "./timelineLayout";
import { createTimelineClipIndex } from "../lib/timelineClipIndex";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Scroll container top; a press within RULER_H of this counts as a ruler press. */
const SCROLL_TOP = 100;
/** Comfortably inside the ruler band (RULER_H is 28 at time of writing). */
const RULER_Y = SCROLL_TOP + 4;

type Handlers = ReturnType<typeof useTimelineRangeSelection>;

function makeScrollEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({ top: SCROLL_TOP, left: 0, width: 1000, height: 400 }) as DOMRect;
  return el;
}

function makePointerEvent(clientX: number, clientY: number): React.PointerEvent {
  const currentTarget = document.createElement("div");
  currentTarget.setPointerCapture = vi.fn();
  return {
    button: 0,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    pointerId: 1,
    clientX,
    clientY,
    target: document.createElement("div"),
    currentTarget,
  } as unknown as React.PointerEvent;
}

const roots: Array<{ unmount: () => void }> = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
});

function setup(): { handlers: () => Handlers; seekFromX: ReturnType<typeof vi.fn> } {
  const seekFromX = vi.fn();
  const scrollEl = makeScrollEl();
  let latest: Handlers | null = null;

  // Hoisted so they survive re-renders. The hook mutates `isDragging.current`
  // across the press, and a fresh object per render would reset it to false.
  const scrollRef = { current: scrollEl };
  const ppsRef = { current: 25 };
  const dragScrollRaf = { current: 0 };
  const isDragging = { current: false };
  const elementsRef = { current: [] };
  const rowGeometryRef = { current: getTimelineRowGeometry([]) };

  function Probe(): null {
    latest = useTimelineRangeSelection({
      scrollRef,
      ppsRef,
      effectiveDuration: 30,
      pps: 25,
      seekFromX,
      autoScrollDuringDrag: vi.fn(),
      dragScrollRaf,
      isDragging,
      setShowPopover: vi.fn(),
      elementsRef,
      clipIndex: createTimelineClipIndex([]),
      sessionEpoch: 0,
      rowGeometryRef,
      contentOrigin: 0,
    });
    return null;
  }

  roots.push(mountReactHarness(<Probe />));
  return {
    handlers: () => {
      if (!latest) throw new Error("hook did not render");
      return latest;
    },
    seekFromX,
  };
}

describe("useTimelineRangeSelection — ruler press seek", () => {
  it("replays the pressed x on pointerup when the pointer never moved", () => {
    const { handlers, seekFromX } = setup();

    act(() => handlers().handlePointerDown(makePointerEvent(1000, RULER_Y)));
    act(() => handlers().handlePointerUp());

    // Both the press and the settle must land on the SAME x. The bug settled on
    // 0, so the LAST call is the one that decides where the playhead ends up.
    expect(seekFromX).toHaveBeenCalledWith(1000);
    expect(seekFromX).not.toHaveBeenCalledWith(0);
    expect(seekFromX.mock.calls.at(-1)).toEqual([1000]);
  });

  it("does not fall back to x=0 for a press nearer the left edge either", () => {
    const { handlers, seekFromX } = setup();

    act(() => handlers().handlePointerDown(makePointerEvent(400, RULER_Y)));
    act(() => handlers().handlePointerUp());

    expect(seekFromX.mock.calls.at(-1)).toEqual([400]);
  });

  it("settles on the final pointermove x when the pointer did move", () => {
    const { handlers, seekFromX } = setup();

    act(() => handlers().handlePointerDown(makePointerEvent(700, RULER_Y)));
    act(() => handlers().handlePointerMove(makePointerEvent(760, RULER_Y)));
    act(() => handlers().handlePointerUp());

    // The move must win over the seeded press coordinate.
    expect(seekFromX.mock.calls.at(-1)).toEqual([760]);
  });
});
