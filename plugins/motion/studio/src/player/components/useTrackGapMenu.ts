import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import type { DragCommitDeps } from "./timelineClipDragCommit";
import {
  laneGapFloor,
  resolveAllGapIntervals,
  resolveAllTrackGaps,
  resolveCloseGapShifts,
  resolveTrackGapAt,
  type TrackGapInterval,
} from "./timelineGaps";
import {
  canShiftTrackGapClips,
  commitCloseAllTrackGaps,
  commitCloseTrackGap,
} from "./timelineGapCommit";

/** Right-click anchor on EMPTY lane space: pointer position + clicked lane/time. */
interface TrackGapMenuAnchor {
  x: number;
  y: number;
  track: number;
  time: number;
  sessionEpoch: number;
}

/** Gap strips to paint on one lane while a menu row is hovered. */
export interface TrackGapHighlight {
  track: number;
  intervals: TrackGapInterval[];
}

/**
 * Track-gap context menu (right-click on empty lane space) — state, the
 * derived menu model, and the two commit actions. Extracted from Timeline.tsx
 * as a cohesive unit (600-line studio cap).
 *
 * Only the session-stamped ANCHOR (and the hovered row) is state; the menu model (gap under
 * the pointer, compaction, movability) derives from live `tracks` so an open
 * menu reflects concurrent edits. `gapHighlight` — the strips TimelineCanvas
 * paints while "Close gap" / "Close all gaps" is hovered — derives the same
 * way. Commits are ONE atomic batch each via the existing move-persist
 * pipeline (see timelineGapCommit.ts).
 */
export function useTrackGapMenu({
  tracks,
  expandedElementsRef,
  trackOrderRef,
  onMoveElement,
  onMoveElements,
}: {
  tracks: [number, TimelineElement[]][];
  expandedElementsRef: MutableRefObject<TimelineElement[]>;
  trackOrderRef: MutableRefObject<number[]>;
  onMoveElement: DragCommitDeps["onMoveElement"];
  onMoveElements: DragCommitDeps["onMoveElements"];
}) {
  const updateElement = usePlayerStore((s) => s.updateElement);
  const sessionEpoch = usePlayerStore((s) => s.timelineSessionEpoch);
  const [gapContextMenu, setGapContextMenu] = useState<TrackGapMenuAnchor | null>(null);
  const [hoveredGapAction, setHoveredGapAction] = useState<"close-gap" | "close-all" | null>(null);

  const gapMenuLaneElements = useMemo(
    () =>
      gapContextMenu?.sessionEpoch === sessionEpoch
        ? (tracks.find(([t]) => t === gapContextMenu.track)?.[1] ?? [])
        : null,
    [gapContextMenu, sessionEpoch, tracks],
  );
  const gapMenuModel = useMemo(() => {
    if (!gapContextMenu || !gapMenuLaneElements) return null;
    const floor = laneGapFloor(gapMenuLaneElements);
    const gap = resolveTrackGapAt(gapMenuLaneElements, gapContextMenu.time, undefined, floor);
    const allShifts = resolveAllTrackGaps(gapMenuLaneElements, undefined, floor);
    return {
      x: gapContextMenu.x,
      y: gapContextMenu.y,
      gapWidth: gap ? gap.gapEnd - gap.gapStart : null,
      canCloseGap:
        gap != null &&
        canShiftTrackGapClips(gapMenuLaneElements, resolveCloseGapShifts(gapMenuLaneElements, gap)),
      hasAnyGaps: allShifts.length > 0,
      canCloseAllGaps:
        allShifts.length > 0 && canShiftTrackGapClips(gapMenuLaneElements, allShifts),
    };
  }, [gapContextMenu, gapMenuLaneElements]);

  // The strips to paint while a menu row is hovered: the one gap under the
  // pointer for "Close gap", every current gap (leading included) for
  // "Close all gaps". Null when nothing is hovered / nothing would close.
  const gapHighlight = useMemo<TrackGapHighlight | null>(() => {
    if (!gapContextMenu || !gapMenuLaneElements || !hoveredGapAction) return null;
    const floor = laneGapFloor(gapMenuLaneElements);
    if (hoveredGapAction === "close-gap") {
      const gap = resolveTrackGapAt(gapMenuLaneElements, gapContextMenu.time, undefined, floor);
      if (!gap) return null;
      return {
        track: gapContextMenu.track,
        intervals: [{ start: gap.gapStart, end: gap.gapEnd }],
      };
    }
    const intervals = resolveAllGapIntervals(gapMenuLaneElements, undefined, floor);
    return intervals.length > 0 ? { track: gapContextMenu.track, intervals } : null;
  }, [gapContextMenu, gapMenuLaneElements, hoveredGapAction]);

  const closeTrackGap = useCallback(() => {
    if (
      !gapContextMenu ||
      !gapMenuLaneElements ||
      gapContextMenu.sessionEpoch !== usePlayerStore.getState().timelineSessionEpoch
    )
      return;
    commitCloseTrackGap(gapMenuLaneElements, gapContextMenu.time, {
      elements: expandedElementsRef.current,
      trackOrder: trackOrderRef.current,
      updateElement,
      onMoveElement,
      onMoveElements,
    });
  }, [
    gapContextMenu,
    gapMenuLaneElements,
    expandedElementsRef,
    trackOrderRef,
    updateElement,
    onMoveElement,
    onMoveElements,
  ]);
  const closeAllTrackGaps = useCallback(() => {
    if (
      !gapContextMenu ||
      !gapMenuLaneElements ||
      gapContextMenu.sessionEpoch !== usePlayerStore.getState().timelineSessionEpoch
    )
      return;
    commitCloseAllTrackGaps(gapMenuLaneElements, {
      elements: expandedElementsRef.current,
      trackOrder: trackOrderRef.current,
      updateElement,
      onMoveElement,
      onMoveElements,
    });
  }, [
    gapContextMenu,
    gapMenuLaneElements,
    expandedElementsRef,
    trackOrderRef,
    updateElement,
    onMoveElement,
    onMoveElements,
  ]);

  const openGapMenu = useCallback((anchor: Omit<TrackGapMenuAnchor, "sessionEpoch">) => {
    setHoveredGapAction(null);
    setGapContextMenu({
      ...anchor,
      sessionEpoch: usePlayerStore.getState().timelineSessionEpoch,
    });
  }, []);
  const dismissGapMenu = useCallback(() => {
    setHoveredGapAction(null);
    setGapContextMenu(null);
  }, []);

  useEffect(() => {
    if (gapContextMenu && gapContextMenu.sessionEpoch !== sessionEpoch) dismissGapMenu();
  }, [dismissGapMenu, gapContextMenu, sessionEpoch]);

  return {
    gapMenuModel,
    gapHighlight,
    setHoveredGapAction,
    openGapMenu,
    dismissGapMenu,
    closeTrackGap,
    closeAllTrackGaps,
  };
}
