// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { createTimelineRowGeometry, getTimelineRowTop } from "./timelineLayout";
import { createTimelineClipIndex } from "../lib/timelineClipIndex";
import { useTimelineRangeSelection } from "./useTimelineRangeSelection";
import { configureTimelineTestViewport } from "./timelineTestViewport";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const elements: TimelineElement[] = [
  { id: "first", tag: "div", start: 1, duration: 1, track: 0 },
  { id: "offscreen", tag: "div", start: 2, duration: 1, track: 50 },
  { id: "base", tag: "div", start: 8, duration: 1, track: 99 },
];
const tracks = Array.from({ length: 100 }, (_, index) => index);
const geometry = createTimelineRowGeometry(
  tracks,
  tracks.map(() => 48),
);
const clipIndex = createTimelineClipIndex(
  tracks.map((track) => [track, elements.filter((element) => element.track === track)]),
);
const FIRST_ROW_Y = getTimelineRowTop(0) + 4;
const OFFSCREEN_ROW_Y = getTimelineRowTop(50) + 40;

function pointer(
  currentTarget: HTMLElement,
  pointerId: number,
  clientX: number,
  clientY: number,
  init: Partial<React.PointerEvent> = {},
): React.PointerEvent {
  return {
    button: 0,
    clientX,
    clientY,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    pointerId,
    currentTarget,
    target: currentTarget,
    ...init,
  } as React.PointerEvent;
}

function renderHarness(sessionEpoch = 1) {
  usePlayerStore.setState({ timelineSessionEpoch: sessionEpoch });
  const host = document.createElement("div");
  const scroll = document.createElement("div");
  scroll.setPointerCapture = vi.fn();
  configureTimelineTestViewport(scroll, geometry.canvasHeight);
  host.append(scroll);
  document.body.append(host);
  const root = createRoot(host);
  let api: ReturnType<typeof useTimelineRangeSelection> | null = null;
  const ppsRef = { current: 100 };
  const dragScrollRaf = { current: 0 };
  const isDragging = { current: false };
  const elementsRef = { current: elements };
  const rowGeometryRef = { current: geometry };
  const seekFromX = vi.fn();

  function Probe({ epoch }: { epoch: number }) {
    api = useTimelineRangeSelection({
      scrollRef: { current: scroll },
      ppsRef,
      effectiveDuration: 60,
      pps: 100,
      seekFromX,
      autoScrollDuringDrag: vi.fn(),
      dragScrollRaf,
      isDragging,
      setShowPopover: vi.fn(),
      elementsRef,
      clipIndex,
      rowGeometryRef,
      contentOrigin: 0,
      sessionEpoch: epoch,
    });
    return null;
  }

  act(() => root.render(<Probe epoch={sessionEpoch} />));
  return {
    scroll,
    root,
    get api() {
      if (!api) throw new Error("selection harness did not render");
      return api;
    },
    rerender(epoch: number) {
      usePlayerStore.setState({ timelineSessionEpoch: epoch });
      act(() => root.render(<Probe epoch={epoch} />));
    },
    seekFromX,
  };
}

function dragMarquee(
  view: ReturnType<typeof renderHarness>,
  options: { secondPointer?: boolean; release?: boolean } = {},
): void {
  act(() => {
    view.api.handlePointerDown(pointer(view.scroll, 7, 0, FIRST_ROW_Y));
    if (options.secondPointer) {
      view.api.handlePointerDown(pointer(view.scroll, 8, 500, FIRST_ROW_Y));
    }
    view.api.handlePointerMove(pointer(view.scroll, 7, 400, OFFSCREEN_ROW_Y));
    if (options.release) {
      view.api.handlePointerUp(pointer(view.scroll, 7, 400, OFFSCREEN_ROW_Y));
    }
  });
}

function expectSelectedIds(...ids: string[]): void {
  expect(usePlayerStore.getState().selectedElementIds).toEqual(new Set(ids));
}

function unmountHarness(view: ReturnType<typeof renderHarness>): void {
  act(() => view.root.unmount());
}

afterEach(() => {
  usePlayerStore.getState().reset();
  document.body.innerHTML = "";
});

describe("useTimelineRangeSelection", () => {
  it("marquee-selects model clips across unmounted virtual rows", () => {
    const view = renderHarness();
    dragMarquee(view);

    expect(document.querySelectorAll("[data-clip]")).toHaveLength(0);
    expectSelectedIds("first", "offscreen");
    unmountHarness(view);
  });

  it("ignores another pointer and restores the pre-drag selection on cancellation", () => {
    usePlayerStore.getState().setSelectedElementId("base");
    const view = renderHarness();
    dragMarquee(view);
    act(() => view.api.handlePointerUp(pointer(view.scroll, 8, 400, OFFSCREEN_ROW_Y)));
    expectSelectedIds("first", "offscreen");

    act(() => view.api.handlePointerCancel(pointer(view.scroll, 7, 400, OFFSCREEN_ROW_Y)));
    expect(usePlayerStore.getState().selectedElementId).toBe("base");
    expectSelectedIds("base");
    unmountHarness(view);
  });

  it("keeps the original pointer owner when a second pointer presses", () => {
    const view = renderHarness();
    dragMarquee(view, { secondPointer: true, release: true });

    expectSelectedIds("first", "offscreen");
    unmountHarness(view);
  });

  it("commits a ruler click at its pointerdown position without requiring pointer movement", () => {
    const view = renderHarness();

    act(() => {
      view.api.handlePointerDown(pointer(view.scroll, 7, 375, 5));
      view.api.handlePointerUp(pointer(view.scroll, 7, 375, 5));
    });

    expect(view.seekFromX).toHaveBeenNthCalledWith(1, 375);
    expect(view.seekFromX).toHaveBeenNthCalledWith(2, 375);
    unmountHarness(view);
  });

  it("does not clear a finalized range when capture is lost after pointerup", () => {
    const view = renderHarness();

    act(() => {
      view.api.handlePointerDown(pointer(view.scroll, 7, 100, 80, { shiftKey: true }));
      view.api.handlePointerMove(pointer(view.scroll, 7, 300, 80, { shiftKey: true }));
      view.api.handlePointerUp(pointer(view.scroll, 7, 300, 80, { shiftKey: true }));
    });
    const finalized = view.api.rangeSelection;
    expect(finalized).toMatchObject({ start: 1, end: 3 });

    act(() => view.api.handlePointerCancel(pointer(view.scroll, 7, 300, 80)));
    expect(view.api.rangeSelection).toEqual(finalized);
    unmountHarness(view);
  });

  it("cancels a live marquee when the project session changes", () => {
    usePlayerStore.getState().setSelectedElementId("base");
    const view = renderHarness(1);
    dragMarquee(view);
    usePlayerStore.getState().setSelectedElementId("base");
    view.rerender(2);

    expect(usePlayerStore.getState().selectedElementId).toBe("base");
    expectSelectedIds("base");
    unmountHarness(view);
  });
});
