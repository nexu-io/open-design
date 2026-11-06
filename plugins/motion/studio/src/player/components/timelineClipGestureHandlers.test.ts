// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { PointerEvent as ReactPointerEvent } from "react";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { createClipGestureHandlers, type ClipGestureDeps } from "./timelineClipGestureHandlers";

afterEach(() => usePlayerStore.getState().reset());

const clips: TimelineElement[] = Array.from({ length: 6 }, (_, i) => ({
  id: `clip-${i}`,
  domId: `clip-${i}`,
  tag: "div",
  start: i,
  duration: 1,
  track: i,
}));
const capabilities = { canMove: true, canTrimStart: true, canTrimEnd: true, readOnly: false };

function grabFirstClip(count: number, gesture: "move" | "resize") {
  const store = usePlayerStore.getState();
  store.setElements(clips);
  store.setSelectedElementIds(new Set(clips.slice(0, count).map((c) => c.id)));
  const setDraggedClip = vi.fn();
  const setResizingClip = vi.fn();
  const blockedClipRef = { current: null as { intent: string } | null };
  const deps = {
    pps: 100,
    onMoveElement: vi.fn(),
    onResizeElement: vi.fn(),
    blockedClipRef,
    suppressClickRef: { current: false },
    scrollRef: { current: null },
    setShowPopover: vi.fn(),
    setRangeSelection: vi.fn(),
    setResizingClip,
    setDraggedClip,
    setSelectedElementId: vi.fn(),
  } as unknown as ClipGestureDeps;
  const handlers = createClipGestureHandlers(clips[0], clips[0].id, clips[0], capabilities, deps);
  const event = {
    button: 0,
    clientX: 50,
    clientY: 5,
    pointerId: 1,
    stopPropagation: vi.fn(),
    currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 100 }) },
  } as unknown as ReactPointerEvent;
  if (gesture === "move") handlers.onPointerDown(event);
  else handlers.onResizeStart("end", event);
  return { setDraggedClip, setResizingClip, blockedClipRef };
}

describe("hand-editing a multi-selection", () => {
  it.each([1, 3, 4, 6])("moves %i selected clips by hand", (count) => {
    const { setDraggedClip, blockedClipRef } = grabFirstClip(count, "move");
    expect(setDraggedClip).toHaveBeenCalledOnce();
    expect(blockedClipRef.current).toBeNull();
  });

  it.each([1, 3, 4, 6])("resizes %i selected clips by hand", (count) => {
    const { setResizingClip, blockedClipRef } = grabFirstClip(count, "resize");
    expect(setResizingClip).toHaveBeenCalledOnce();
    expect(blockedClipRef.current).toBeNull();
  });
});
