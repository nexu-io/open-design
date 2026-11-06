// @vitest-environment happy-dom

import type { SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { mountTimelineClipDragGestureLifecycle } from "./timelineClipDragGestureLifecycle";
import type { DraggedClipState, ResizingClipState } from "./timelineClipDragTypes";

afterEach(() => {
  document.body.replaceChildren();
  usePlayerStore.getState().reset();
});

const element: TimelineElement = {
  id: "clip-1",
  tag: "div",
  start: 0,
  duration: 2,
  track: 0,
};

function mountGesture(kind: "drag" | "resize") {
  const drag: DraggedClipState = {
    pointerId: 0,
    element,
    originClientX: 0,
    originClientY: 0,
    originScrollLeft: 0,
    originScrollTop: 0,
    pointerClientX: 0,
    pointerClientY: 0,
    pointerOffsetX: 0,
    pointerOffsetY: 0,
    previewStart: 1,
    previewTrack: 0,
    desiredTrack: 0,
    insertRow: null,
    snapTime: null,
    snapType: null,
    started: true,
  };
  const resize: ResizingClipState = {
    pointerId: 0,
    element,
    edge: "end",
    originClientX: 0,
    previewStart: 0,
    previewDuration: 3,
    started: true,
  };
  const draggedClipRef = { current: kind === "drag" ? drag : null };
  const resizingClipRef = { current: kind === "resize" ? resize : null };
  const setDraggedClip = (next: SetStateAction<DraggedClipState | null>) => {
    draggedClipRef.current = typeof next === "function" ? next(draggedClipRef.current) : next;
  };
  const updateDraggedClipPreview = vi.fn((previous: DraggedClipState) => ({
    ...previous,
    previewStart: 3,
  }));
  const onMoveElement = vi.fn();
  const onResizeElement = vi.fn();
  const updateElement = vi.fn();
  const stopAutoScroll = vi.fn();
  const cancelGestureRef = { current: () => false };
  const dispose = mountTimelineClipDragGestureLifecycle({
    lifecycleRef: { current: { kind, phase: "active", pointerId: null, sessionEpoch: 0 } },
    sessionEpochRef: { current: 0 },
    cancelGestureRef,
    scrollRef: { current: null },
    draggedClipRef,
    resizingClipRef,
    blockedClipRef: { current: null },
    groupResizeRef: { current: null },
    suppressClickRef: { current: false },
    gestureSelectedKeysRef: { current: new Set() },
    elementsRef: { current: [element] },
    trackOrderRef: { current: [0] },
    setDraggedClipState: setDraggedClip,
    setResizingClipState: () => {},
    setShowPopover: () => {},
    setRangeSelectionRef: { current: null },
    applyResizePointerRef: { current: () => {} },
    syncClipDragAutoScrollRef: { current: () => {} },
    stopClipDragAutoScrollRef: { current: stopAutoScroll },
    updateDraggedClipPreviewRef: { current: updateDraggedClipPreview },
    publishDraggedClip: setDraggedClip,
    updateElement,
    onMoveElementRef: { current: onMoveElement },
    onMoveElementsRef: { current: undefined },
    onResizeElementRef: { current: onResizeElement },
    onResizeElementsRef: { current: undefined },
    onBlockedEditAttemptRef: { current: undefined },
    readZIndexRef: { current: undefined },
    onStackingPatchesRef: { current: undefined },
    refreshAfterLaneMoveRef: { current: undefined },
  });
  return {
    draggedClipRef,
    resizingClipRef,
    updateDraggedClipPreview,
    onMoveElement,
    onResizeElement,
    updateElement,
    stopAutoScroll,
    cancelGestureRef,
    dispose,
  };
}

const release = (clientX: number, clientY: number) =>
  window.dispatchEvent(new MouseEvent("pointerup", { clientX, clientY }));

describe("timeline clip drag gesture lifecycle", () => {
  it("finishes a drag after virtualization unmounts its source row", () => {
    const g = mountGesture("drag");
    const sourceRow = document.createElement("div");
    sourceRow.dataset.timelineRow = "";
    sourceRow.append(document.createElement("div"));
    document.body.append(sourceRow);
    sourceRow.remove();

    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 20, clientY: 10 }));
    expect(g.updateDraggedClipPreview).toHaveBeenCalledTimes(1);
    expect(g.draggedClipRef.current?.previewStart).toBe(3);

    window.dispatchEvent(new MouseEvent("pointerup"));
    expect(g.onMoveElement).toHaveBeenCalledWith(element, { start: 3, track: 0 });
    expect(g.draggedClipRef.current).toBeNull();
    expect(g.stopAutoScroll).toHaveBeenCalledTimes(1);

    g.dispose();
    expect(g.cancelGestureRef.current()).toBe(false);
  });

  it.each([
    ["above the window", 20, -40],
    ["past the window's right edge", window.innerWidth + 40, 10],
    ["on the window's right edge", window.innerWidth, 10],
    ["on the window's bottom edge", 20, window.innerHeight],
  ])("cancels a drag released %s and leaves the clip where it was", (_, clientX, clientY) => {
    const g = mountGesture("drag");
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 20, clientY: 10 }));
    release(clientX, clientY);
    expect(g.onMoveElement).not.toHaveBeenCalled();
    expect(g.updateElement).not.toHaveBeenCalled();
    expect(g.draggedClipRef.current).toBeNull();
    // The cancel ended the gesture, so a later release has nothing to commit.
    release(20, 10);
    expect(g.onMoveElement).not.toHaveBeenCalled();
    g.dispose();
  });

  it("cancels a trim released outside the window", () => {
    const g = mountGesture("resize");
    release(20, -40);
    expect(g.onResizeElement).not.toHaveBeenCalled();
    expect(g.updateElement).not.toHaveBeenCalled();
    expect(g.resizingClipRef.current).toBeNull();
    g.dispose();
  });

  it("still commits a drag released on the window's last pixel", () => {
    const g = mountGesture("drag");
    release(window.innerWidth - 1, window.innerHeight - 1);
    expect(g.onMoveElement).toHaveBeenCalledWith(element, { start: 1, track: 0 });
    g.dispose();
  });
});
