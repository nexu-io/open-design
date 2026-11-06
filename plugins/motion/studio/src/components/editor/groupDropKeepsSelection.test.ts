// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createDomEditOverlayGestureHandlers } from "./useDomEditOverlayGestures";
import type { GroupGestureState } from "./domEditOverlayGestures";

/**
 * A group drag ended by deselecting the group it had just moved.
 *
 * Every pointerup trails a click. The gesture ref is cleared before the commit,
 * so by the time that click arrives the box no longer looks busy and it reaches
 * the canvas as an ordinary click — landing in the gap between the members,
 * resolving to nothing, and clearing the selection. Captured live as a
 * `[hf-select] clear` with `hadGroup: 3` two milliseconds after the drop.
 *
 * The under-threshold path already ate that click; the committed path has to as
 * well, and the flag is set before the two diverge so neither can forget.
 */
describe("dropping a dragged group eats the click that follows", () => {
  function harness(travel: { dx: number; dy: number }) {
    const suppressNextBoxClickRef = { current: false };
    const groupGestureRef = {
      current: {
        startX: 0,
        startY: 0,
        originItems: [],
        members: [],
      } as unknown as GroupGestureState,
    };
    const handlers = createDomEditOverlayGestureHandlers({
      overlayRef: { current: null },
      iframeRef: { current: null },
      boxRef: { current: null },
      selectionRef: { current: null },
      hoverSelectionRef: { current: null },
      overlayRectRef: { current: null },
      groupOverlayItemsRef: { current: [] },
      gestureRef: { current: null },
      groupGestureRef,
      blockedMoveRef: { current: null },
      waitingPressRef: { current: null },
      rafPausedRef: { current: false },
      suppressNextBoxClickRef,
      setOverlayRect: vi.fn(),
      setGroupOverlayItems: vi.fn(),
      onBlockedMoveRef: { current: vi.fn() },
      onManualDragStartRef: { current: vi.fn() },
      onPathOffsetCommitRef: { current: vi.fn() },
      onGroupPathOffsetCommitRef: { current: vi.fn() },
      onBoxSizeCommitRef: { current: vi.fn() },
      onRotationCommitRef: { current: vi.fn() },
      onCanvasPointerMoveRef: { current: vi.fn() },
      onCanvasMouseDown: vi.fn(),
      snapGuidesRef: { current: null },
    } as never);

    handlers.onPointerUp({
      clientX: travel.dx,
      clientY: travel.dy,
      currentTarget: { releasePointerCapture: vi.fn() },
    } as never);
    return suppressNextBoxClickRef;
  }

  it("eats the click after a drag that moved", () => {
    expect(harness({ dx: 120, dy: 60 }).current).toBe(true);
  });

  it("still eats it after a press that never travelled", () => {
    expect(harness({ dx: 1, dy: 0 }).current).toBe(true);
  });
});
