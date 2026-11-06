import { useCallback, useMemo, useRef, type RefObject } from "react";
import { usePlayerStore } from "../store/playerStore";
import type { TimelineDropCallbacks, TimelineEditCallbacks } from "./timelineCallbacks";

interface UseTimelineEditPinningInput {
  ppsRef: RefObject<number>;
  fitPpsRef: RefObject<number>;
  onMoveElement: TimelineEditCallbacks["onMoveElement"];
  onMoveElements: TimelineEditCallbacks["onMoveElements"];
  onResizeElement: TimelineEditCallbacks["onResizeElement"];
  onResizeElements: TimelineEditCallbacks["onResizeElements"];
  onFileDrop: TimelineDropCallbacks["onFileDrop"];
  onAssetDrop: TimelineDropCallbacks["onAssetDrop"];
  onBlockDrop: TimelineDropCallbacks["onBlockDrop"];
  onCompositionDrop: TimelineDropCallbacks["onCompositionDrop"];
}

// Wrap every mutating timeline edit so the zoom pins to the current on-screen
// scale right before the edit commits — the reload the edit triggers then keeps
// the current scale instead of rescaling every clip (the blink-fix symptom).
// Each wrapper forwards its args unchanged and preserves the original's absence
// (an unset callback stays unset → the timeline's own fallbacks kick in).
export function useTimelineEditPinning({
  ppsRef,
  fitPpsRef,
  onMoveElement,
  onMoveElements,
  onResizeElement,
  onResizeElements,
  onFileDrop,
  onAssetDrop,
  onBlockDrop,
  onCompositionDrop,
}: UseTimelineEditPinningInput) {
  const pinTimelineZoom = usePlayerStore((s) => s.pinTimelineZoom);
  // Pin the timeline zoom to the current on-screen scale on the FIRST edit, so a
  // duration change from that edit (drops/moves/deletes recompute the fit basis)
  // stops rescaling every clip. `pinTimelineZoom` is a no-op once already pinned
  // (or after a manual zoom), so the user's own zoom is never clobbered; Fit
  // re-fits. Reads refs at call time for the latest scale.
  const pinZoomBeforeEdit = useCallback(() => {
    pinTimelineZoom(ppsRef.current, fitPpsRef.current);
  }, [pinTimelineZoom, ppsRef, fitPpsRef]);

  // Stable ref so useTimelineClipDrag can clear rangeSelection without circular dep
  const setRangeSelectionRef = useRef<((sel: null) => void) | null>(null);

  const pinnedOnMoveElement = useMemo(
    () =>
      onMoveElement &&
      ((...args: Parameters<typeof onMoveElement>) => {
        pinZoomBeforeEdit();
        return onMoveElement(...args);
      }),
    [onMoveElement, pinZoomBeforeEdit],
  );
  const pinnedOnMoveElements = useMemo(
    () =>
      onMoveElements &&
      ((...args: Parameters<typeof onMoveElements>) => {
        pinZoomBeforeEdit();
        return onMoveElements(...args);
      }),
    [onMoveElements, pinZoomBeforeEdit],
  );
  const pinnedOnResizeElement = useMemo(
    () =>
      onResizeElement &&
      ((...args: Parameters<typeof onResizeElement>) => {
        pinZoomBeforeEdit();
        return onResizeElement(...args);
      }),
    [onResizeElement, pinZoomBeforeEdit],
  );
  const pinnedOnResizeElements = useMemo(
    () =>
      onResizeElements &&
      ((...args: Parameters<typeof onResizeElements>) => {
        pinZoomBeforeEdit();
        return onResizeElements(...args);
      }),
    [onResizeElements, pinZoomBeforeEdit],
  );
  const pinnedOnFileDrop = useMemo(
    () =>
      onFileDrop &&
      ((...args: Parameters<typeof onFileDrop>) => {
        pinZoomBeforeEdit();
        return onFileDrop(...args);
      }),
    [onFileDrop, pinZoomBeforeEdit],
  );
  const pinnedOnAssetDrop = useMemo(
    () =>
      onAssetDrop &&
      ((...args: Parameters<typeof onAssetDrop>) => {
        pinZoomBeforeEdit();
        return onAssetDrop(...args);
      }),
    [onAssetDrop, pinZoomBeforeEdit],
  );
  const pinnedOnBlockDrop = useMemo(
    () =>
      onBlockDrop &&
      ((...args: Parameters<typeof onBlockDrop>) => {
        pinZoomBeforeEdit();
        return onBlockDrop(...args);
      }),
    [onBlockDrop, pinZoomBeforeEdit],
  );
  const pinnedOnCompositionDrop = useMemo(
    () =>
      onCompositionDrop &&
      ((...args: Parameters<typeof onCompositionDrop>) => {
        pinZoomBeforeEdit();
        return onCompositionDrop(...args);
      }),
    [onCompositionDrop, pinZoomBeforeEdit],
  );

  return {
    pinZoomBeforeEdit,
    setRangeSelectionRef,
    pinnedOnMoveElement,
    pinnedOnMoveElements,
    pinnedOnResizeElement,
    pinnedOnResizeElements,
    pinnedOnFileDrop,
    pinnedOnAssetDrop,
    pinnedOnBlockDrop,
    pinnedOnCompositionDrop,
  };
}
