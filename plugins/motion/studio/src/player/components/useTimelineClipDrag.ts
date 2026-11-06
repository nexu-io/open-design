import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { matchesKey } from "./studioShortcuts";
import { useMountEffect } from "../../hooks/useMountEffect";
import { markTimelineMotion } from "./timelineMotion";
import {
  applyTimelineAutoScrollStep,
  resolveTimelineAutoScrollLoopAction,
} from "./timelineEditing";
import { usePlayerStore } from "../store/playerStore";
import type { TimelineElement } from "../store/playerStore";
import { mergeUserBeats } from "../../utils/beatEditing";
import {
  buildTimelineGroupResizeMembers,
  type TimelineGroupResizeSession,
} from "./timelineGroupEditing";
import { collectTimelineSnapTargets, type TimelineSnapTarget } from "./timelineSnapping";
import { getTimelineGridStep, rulerFrameRate } from "./timelineRulerGeometry";
import { setPreviewFrame } from "../store/previewFrameStore";
import type { StackingPatch } from "./timelineStackingSync";
import type { TimelineEditCallbacks } from "./timelineCallbacks";
import {
  computeDragPreview,
  createKeyboardClipDrag,
  computeResizePreview,
  trimPreviewTime,
  previewGroupResize,
  type ResizePreviewResult,
} from "./timelineClipDragPreview";
import type {
  DraggedClipState,
  ResizingClipState,
  BlockedClipState,
} from "./timelineClipDragTypes";
import { getTimelineElementIndexes } from "../lib/timelineElementIndexes";
import { dropMisalignedTrimPartners, linkedGestureKeys } from "./audioClipLink";
import { isLinkedSelectionOn, useLinkedClipPreferences } from "../../utils/linkedClipPreferences";
import { useTimelineClipCapabilities } from "./timelineReadOnly";
import { timelineClipFocusId } from "./timelineNavigationIdentity";
import {
  handleClipPickupKeyboardEvent,
  scrollKeyboardInsertRow,
  timelineKeyboardEventTarget,
} from "./useTimelineKeyboardActor";
import {
  timelineTrackOrderChanged,
  nextKeyboardInsertRow,
  keyboardPickupInsertRow,
  type TimelineTrackInsertLayout,
} from "./timelineTrackInsertLayout";
import type { TimelineRowGeometry } from "./timelineLayout";
import {
  mountTimelineClipDragGestureLifecycle,
  type TimelineGestureKind,
  type TimelineGestureLifecycle,
} from "./timelineClipDragGestureLifecycle";

export type {
  DraggedClipState,
  ResizingClipState,
  BlockedClipState,
} from "./timelineClipDragTypes";

const EMPTY_BEAT_TIMES: number[] = [];

/* ── Hook ───────────────────────────────────────────────────────── */
interface UseTimelineClipDragInput {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  ppsRef: React.RefObject<number>;
  durationRef: React.RefObject<number>;
  trackOrderRef: React.RefObject<number[]>;
  trackInsertLayoutRef?: React.RefObject<TimelineTrackInsertLayout | undefined>;
  rowGeometryRef?: React.RefObject<TimelineRowGeometry>;
  onMoveElement?: TimelineEditCallbacks["onMoveElement"];
  onMoveElements?: TimelineEditCallbacks["onMoveElements"];
  onResizeElement?: (
    element: TimelineElement,
    updates: Pick<TimelineElement, "start" | "duration" | "playbackStart">,
  ) => Promise<void> | void;
  onResizeElements?: NonNullable<TimelineEditCallbacks["onResizeElements"]>;
  onBlockedEditAttempt?: (element: TimelineElement, intent: BlockedClipState["intent"]) => void;
  onLinkEdit?: TimelineEditCallbacks["onLinkEdit"];
  setShowPopover: (show: boolean) => void;
  /** Stable ref to the range selection setter — wired after mount to break circular dependency. */
  setRangeSelectionRef: React.RefObject<((sel: null) => void) | null>;
  /**
   * Lane ↔ stacking unification (see research/STAGE3-NEEDED-WIRING.md). When both
   * are supplied and a lane-change drag commits, the edited clip(s) get z-index
   * patches so their stacking matches lane order relative to time-overlapping
   * clips. Provisioned by the timeline layer (Timeline.tsx) from the preview
   * iframe + the canvas z-order persist path; forwarded straight to
   * commitDraggedClipMove. Both optional → absent = no-op (backward compatible).
   */
  readZIndex?: (element: TimelineElement) => number;
  onStackingPatches?: (patches: StackingPatch[]) => Promise<unknown> | void;
  refreshAfterLaneMove?: () => void;
  sessionEpoch?: number;
}

export function useTimelineClipDrag({
  scrollRef,
  ppsRef,
  durationRef,
  trackOrderRef,
  trackInsertLayoutRef,
  rowGeometryRef,
  onMoveElement,
  onMoveElements,
  onResizeElement,
  onResizeElements,
  onBlockedEditAttempt,
  onLinkEdit,
  setShowPopover,
  setRangeSelectionRef,
  readZIndex,
  onStackingPatches,
  refreshAfterLaneMove,
  sessionEpoch = 0,
}: UseTimelineClipDragInput) {
  const getClipCapabilities = useTimelineClipCapabilities();
  const commitGestureRef = useRef<() => void>(() => {});
  const updateElement = usePlayerStore((s) => s.updateElement);
  const rawBeatTimes = usePlayerStore((s) => s.beatAnalysis?.beatTimes ?? EMPTY_BEAT_TIMES);
  const rawBeatStrengths = usePlayerStore((s) => s.beatAnalysis?.beatStrengths ?? EMPTY_BEAT_TIMES);
  const beatEdits = usePlayerStore((s) => s.beatEdits);
  const musicElement = usePlayerStore((s) => getTimelineElementIndexes(s.elements).musicElement);
  const musicStart = musicElement?.start ?? 0;
  const musicPlaybackStart = musicElement?.playbackStart ?? 0;
  const musicDuration = musicElement?.duration ?? 0;
  const musicSrc = musicElement?.src ?? null;

  const adjustedBeatTimes = useMemo(() => {
    if (rawBeatTimes === EMPTY_BEAT_TIMES || musicDuration === 0) return EMPTY_BEAT_TIMES;
    const merged = mergeUserBeats(rawBeatTimes, rawBeatStrengths, beatEdits, musicSrc);
    const clipEnd = musicPlaybackStart + musicDuration;
    const offset = musicStart - musicPlaybackStart;
    return merged.times
      .filter((t) => t >= musicPlaybackStart && t <= clipEnd)
      .map((t) => Math.round((t + offset) * 1000) / 1000);
  }, [
    rawBeatTimes,
    rawBeatStrengths,
    beatEdits,
    musicSrc,
    musicStart,
    musicPlaybackStart,
    musicDuration,
  ]);

  const elements = usePlayerStore((s) => s.elements);
  const timelineSnapEnabled = usePlayerStore((s) => s.timelineSnapEnabled);
  const snapContextRef = useRef<{ beatTimes: number[]; enabled: boolean }>({
    beatTimes: [],
    enabled: true,
  });
  snapContextRef.current = {
    beatTimes: adjustedBeatTimes,
    enabled: timelineSnapEnabled,
  };
  const elementsRef = useRef(elements);
  elementsRef.current = elements;

  // The snap-target and audio-track sets are fixed for one drag/resize (the store is not
  // re-authored mid gesture): built once, reused per pointermove, cleared at teardown.
  const snapTargetsCacheRef = useRef<Map<string, TimelineSnapTarget[]>>(new Map());
  const dragAudioTracksRef = useRef<ReadonlySet<number> | null>(null);

  const buildSnapTargets = useCallback(
    (excludeElementKey: string | null, includeBeats: boolean): TimelineSnapTarget[] => {
      // Magnet off ⇒ no targets and no scan; do NOT cache so a mid-gesture toggle
      // back on starts scanning immediately (preserves the existing skip).
      if (!snapContextRef.current.enabled) return [];
      const cacheKey = `${excludeElementKey ?? ""}|${includeBeats ? 1 : 0}`;
      const cached = snapTargetsCacheRef.current.get(cacheKey);
      if (cached) return cached;
      const targets = collectTimelineSnapTargets({
        elements: elementsRef.current,
        playheadTime: usePlayerStore.getState().currentTime,
        beatTimes: includeBeats ? snapContextRef.current.beatTimes : [],
        excludeElementKey,
      });
      snapTargetsCacheRef.current.set(cacheKey, targets);
      return targets;
    },
    [],
  );
  // The ruler's line spacing at the current zoom; 0 with the magnet off, like the targets.
  const snapGridStep = useCallback(() => {
    if (!snapContextRef.current.enabled) return 0;
    const frameRate = rulerFrameRate(
      usePlayerStore.getState().timeDisplayMode,
      useLinkedClipPreferences.getState().compositionFps,
    );
    return getTimelineGridStep(durationRef.current, ppsRef.current, frameRate);
  }, [durationRef, ppsRef]);

  const [draggedClip, setDraggedClipState] = useState<DraggedClipState | null>(null);
  const draggedClipRef = useRef<DraggedClipState | null>(null);
  const publishDraggedClip = useCallback((next: DraggedClipState | null) => {
    draggedClipRef.current = next;
    setDraggedClipState(next);
  }, []);

  const [resizingClip, setResizingClipState] = useState<ResizingClipState | null>(null);
  const resizingClipRef = useRef<ResizingClipState | null>(null);
  const publishResizingClip = useCallback((next: ResizingClipState | null) => {
    if (next) markTimelineMotion();
    resizingClipRef.current = next;
    setResizingClipState(next);
  }, []);

  const lifecycleRef = useRef<TimelineGestureLifecycle>({
    kind: null,
    phase: "complete",
    pointerId: null,
    sessionEpoch,
  });
  const sessionEpochRef = useRef(sessionEpoch);
  sessionEpochRef.current = sessionEpoch;
  const gestureSelectedKeysRef = useRef<ReadonlySet<string>>(new Set());
  const cancelGestureRef = useRef<
    (options?: { updateReact?: boolean; suppressClick?: boolean }) => boolean
  >(() => false);
  const beginGesture = useCallback((kind: TimelineGestureKind, pointerId: number | null) => {
    if (lifecycleRef.current.phase === "active") cancelGestureRef.current();
    lifecycleRef.current = {
      kind,
      phase: "active",
      pointerId,
      sessionEpoch: sessionEpochRef.current,
    };
    gestureSelectedKeysRef.current = new Set(usePlayerStore.getState().selectedElementIds);
  }, []);
  const setDraggedClip = useCallback(
    (next: DraggedClipState | null) => {
      if (!next) {
        cancelGestureRef.current();
        return;
      }
      beginGesture("drag", next.pointerId);
      gestureSelectedKeysRef.current = linkedGestureKeys(
        gestureSelectedKeysRef.current,
        next.element,
        elementsRef.current,
        next.altKey === true,
        isLinkedSelectionOn(),
      );
      publishDraggedClip(next);
    },
    [beginGesture, publishDraggedClip],
  );
  const setResizingClip = useCallback(
    (next: ResizingClipState | null) => {
      if (!next) {
        cancelGestureRef.current();
        return;
      }
      beginGesture("resize", next.pointerId);
      gestureSelectedKeysRef.current = dropMisalignedTrimPartners(
        linkedGestureKeys(
          gestureSelectedKeysRef.current,
          next.element,
          elementsRef.current,
          next.altKey === true,
          isLinkedSelectionOn(),
        ),
        next.element,
        elementsRef.current,
        next.edge,
      );
      publishResizingClip(next);
    },
    [beginGesture, publishResizingClip],
  );

  const blockedClipRef = useRef<BlockedClipState | null>(null);
  const suppressClickRef = useRef(false);

  // Group-resize session, created on first movement; a projection only, committed at the end.
  const groupResizeRef = useRef<TimelineGroupResizeSession | null>(null);

  const onMoveElementRef = useRef(onMoveElement);
  onMoveElementRef.current = onMoveElement;
  const onMoveElementsRef = useRef(onMoveElements);
  onMoveElementsRef.current = onMoveElements;
  const onBlockedEditAttemptRef = useRef(onBlockedEditAttempt);
  onBlockedEditAttemptRef.current = onBlockedEditAttempt;
  const onLinkEditRef = useRef(onLinkEdit);
  onLinkEditRef.current = onLinkEdit;
  const onResizeElementRef = useRef(onResizeElement);
  onResizeElementRef.current = onResizeElement;
  const onResizeElementsRef = useRef(onResizeElements);
  onResizeElementsRef.current = onResizeElements;
  const readZIndexRef = useRef(readZIndex);
  readZIndexRef.current = readZIndex;
  const onStackingPatchesRef = useRef(onStackingPatches);
  onStackingPatchesRef.current = onStackingPatches;
  const refreshAfterLaneMoveRef = useRef(refreshAfterLaneMove);
  refreshAfterLaneMoveRef.current = refreshAfterLaneMove;

  const clipDragScrollRaf = useRef(0);
  const clipDragPointerRef = useRef<{
    clientX: number;
    clientY: number;
  } | null>(null);

  // Recompute the dragged-clip preview for a pointer position. The heavy lifting
  // (move + snap + group clamp + drop placement) is a tested pure function so
  // what runs here is what's verified — see timelineClipDragPreview.
  const updateDraggedClipPreview = useCallback(
    (drag: DraggedClipState, clientX: number, clientY: number): DraggedClipState => {
      // Build the audio-track set once per gesture (see snapTargetsCacheRef): it
      // only feeds zone-aware drop placement and is frozen while dragging.
      if (!dragAudioTracksRef.current) {
        dragAudioTracksRef.current = getTimelineElementIndexes(elementsRef.current).audioTracks;
      }
      return computeDragPreview(drag, clientX, clientY, {
        scroll: scrollRef.current,
        pps: ppsRef.current,
        duration: durationRef.current,
        trackOrder: trackOrderRef.current,
        allowedInsertRows: trackInsertLayoutRef?.current?.allowedRows,
        groupTracks: trackInsertLayoutRef?.current?.groupTracks,
        rowHeights: rowGeometryRef?.current.rowHeights,
        rowGeometry: rowGeometryRef?.current,
        elements: elementsRef.current,
        selectedKeys: gestureSelectedKeysRef.current,
        buildSnapTargets,
        audioTracks: dragAudioTracksRef.current,
        gridStep: snapGridStep(),
      });
    },
    [
      scrollRef,
      ppsRef,
      durationRef,
      trackOrderRef,
      trackInsertLayoutRef,
      rowGeometryRef,
      buildSnapTargets,
      snapGridStep,
    ],
  );

  // Recompute the trim preview for a pointer x. Shared by the pointermove resize
  // branch and the edge auto-scroll stepper (re-runs as content scrolls under a
  // stationary pointer). computeResizePreview is pure; here we only apply state.
  const applyResizePointer = useCallback(
    (resize: ResizingClipState, clientX: number) => {
      const next = computeResizePreview(resize, clientX, {
        scroll: scrollRef.current,
        pps: ppsRef.current,
        buildSnapTargets,
        elements: elementsRef.current,
        gestureKeys: gestureSelectedKeysRef.current,
        gridStep: snapGridStep(),
      });
      const setResizeState = (v: ResizePreviewResult) => {
        // The preview shows the dragged edge's frame; the playhead stays where it was.
        setPreviewFrame(trimPreviewTime(resize.edge, v.previewStart, v.previewDuration));
        publishResizingClip(
          resizingClipRef.current ? { ...resizingClipRef.current, started: true, ...v } : null,
        );
      };

      // Group resize: a capability-clean multi-selection resizes rigidly by one
      // shared, member-clamped delta (legacy main 36413da7f). The grabbed clip
      // drives the raw delta; every member renders from the coordinator projection.
      const grabbedKey = resize.element.key ?? resize.element.id;
      let session = groupResizeRef.current;
      if (!session || session.grabbedKey !== grabbedKey || session.edge !== resize.edge) {
        const members = buildTimelineGroupResizeMembers(
          elementsRef.current,
          gestureSelectedKeysRef.current,
          grabbedKey,
          resize.edge,
        );
        session = members
          ? {
              grabbedKey,
              edge: resize.edge,
              members,
              changes: [],
              hasChanged: false,
            }
          : null;
        groupResizeRef.current = session;
      }

      if (!session) {
        setResizeState(next);
        return;
      }
      previewGroupResize(session, next, setResizeState);
    },
    [scrollRef, ppsRef, buildSnapTargets, snapGridStep, publishResizingClip],
  );
  const applyResizePointerRef = useRef(applyResizePointer);
  applyResizePointerRef.current = applyResizePointer;

  const stopClipDragAutoScroll = useCallback(() => {
    clipDragPointerRef.current = null;
    if (clipDragScrollRaf.current) {
      cancelAnimationFrame(clipDragScrollRaf.current);
      clipDragScrollRaf.current = 0;
    }
    setPreviewFrame(null);
    // Gesture teardown: drop frozen caches so the next gesture reads fresh state.
    snapTargetsCacheRef.current.clear();
    dragAudioTracksRef.current = null;
  }, []);

  const stepClipDragAutoScroll = useCallback(() => {
    clipDragScrollRaf.current = 0;
    const drag = draggedClipRef.current;
    const resize = resizingClipRef.current;
    const pointer = clipDragPointerRef.current;
    const scroll = scrollRef.current;
    if ((!drag && !resize) || !pointer || !scroll) return;
    if (!applyTimelineAutoScrollStep(scroll, pointer.clientX, pointer.clientY)) return;

    if (drag) {
      publishDraggedClip(updateDraggedClipPreview(drag, pointer.clientX, pointer.clientY));
    } else if (resize) {
      // Re-run the trim preview so the edge keeps tracking while the content
      // scrolls under the stationary pointer (scroll-compensated pointer x).
      applyResizePointerRef.current(resize, pointer.clientX);
    }
    clipDragScrollRaf.current = requestAnimationFrame(stepClipDragAutoScroll);
  }, [publishDraggedClip, scrollRef, updateDraggedClipPreview]);

  const syncClipDragAutoScroll = useCallback(
    (clientX: number, clientY: number) => {
      clipDragPointerRef.current = { clientX, clientY };
      const action = resolveTimelineAutoScrollLoopAction(
        scrollRef.current,
        clientX,
        clientY,
        clipDragScrollRaf.current !== 0,
      );
      if (action === "stop") {
        cancelAnimationFrame(clipDragScrollRaf.current);
        clipDragScrollRaf.current = 0;
      } else if (action === "start") {
        clipDragScrollRaf.current = requestAnimationFrame(stepClipDragAutoScroll);
      }
    },
    [scrollRef, stepClipDragAutoScroll],
  );

  const updateDraggedClipPreviewRef = useRef(updateDraggedClipPreview);
  updateDraggedClipPreviewRef.current = updateDraggedClipPreview;
  const syncClipDragAutoScrollRef = useRef(syncClipDragAutoScroll);
  syncClipDragAutoScrollRef.current = syncClipDragAutoScroll;
  const stopClipDragAutoScrollRef = useRef(stopClipDragAutoScroll);
  stopClipDragAutoScrollRef.current = stopClipDragAutoScroll;

  useMountEffect(() =>
    mountTimelineClipDragGestureLifecycle({
      trackInsertLayoutRef,
      commitGestureRef,
      onStackingPatchesRef,
      refreshAfterLaneMoveRef,
      readZIndexRef,
      onBlockedEditAttemptRef,
      onLinkEditRef,
      onResizeElementsRef,
      onResizeElementRef,
      onMoveElementsRef,
      onMoveElementRef,
      updateElement,
      publishDraggedClip,
      updateDraggedClipPreviewRef,
      stopClipDragAutoScrollRef,
      syncClipDragAutoScrollRef,
      applyResizePointerRef,
      setRangeSelectionRef,
      setShowPopover,
      setResizingClipState,
      setDraggedClipState,
      trackOrderRef,
      elementsRef,
      gestureSelectedKeysRef,
      suppressClickRef,
      groupResizeRef,
      blockedClipRef,
      resizingClipRef,
      draggedClipRef,
      scrollRef,
      cancelGestureRef,
      sessionEpochRef,
      lifecycleRef,
    }),
  );

  useEffect(() => {
    const movePickup = (drag: DraggedClipState, step: -1 | 1, viewport: HTMLDivElement | null) => {
      const audioTracks = getTimelineElementIndexes(elementsRef.current).audioTracks;
      const row = nextKeyboardInsertRow({
        current: drag.insertRow ?? 0,
        step,
        order: trackOrderRef.current,
        layout: trackInsertLayoutRef?.current,
        audioTracks,
        isAudio: audioTracks.has(drag.element.track),
      });
      if (row === null) return;
      publishDraggedClip({ ...drag, insertRow: row });
      if (viewport && rowGeometryRef)
        scrollKeyboardInsertRow(viewport, rowGeometryRef.current, row);
    };
    const activePickup = (
      event: KeyboardEvent,
      drag: DraggedClipState,
      viewport: HTMLDivElement | null,
    ) => {
      handleClipPickupKeyboardEvent(event, {
        move: (step) => movePickup(drag, step, viewport),
        commit: commitGestureRef.current,
        cancel: cancelGestureRef.current,
        focus: () =>
          usePlayerStore
            .getState()
            .requestTimelineFocus(timelineClipFocusId(drag.element.key ?? drag.element.id)),
      });
    };
    const pickup = (event: KeyboardEvent, viewport: HTMLDivElement) => {
      const target = timelineKeyboardEventTarget(event.target, viewport);
      const key = target?.dataset.elId;
      if (key === undefined || !onMoveElementRef.current) return;
      const element = getTimelineElementIndexes(elementsRef.current).byKey.get(key);
      if (!element || !getClipCapabilities(element).canMove) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setShowPopover(false);
      setRangeSelectionRef.current?.(null);
      const row = keyboardPickupInsertRow(
        trackOrderRef.current.indexOf(element.track),
        trackInsertLayoutRef?.current?.allowedRows,
      );
      setDraggedClip(createKeyboardClipDrag(element, row, viewport.scrollLeft, viewport.scrollTop));
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const drag = draggedClipRef.current;
      const viewport = scrollRef.current;
      if (drag) {
        if (drag.pointerId === null) activePickup(event, drag, viewport);
        return;
      }
      if (resizingClipRef.current) return;
      if (!matchesKey(event, "pickupClip") || event.repeat) return;
      if (viewport) pickup(event, viewport);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    getClipCapabilities,
    publishDraggedClip,
    rowGeometryRef,
    scrollRef,
    setDraggedClip,
    setRangeSelectionRef,
    setShowPopover,
    trackOrderRef,
    trackInsertLayoutRef,
  ]);

  useEffect(() => {
    cancelGestureRef.current();
  }, [sessionEpoch]);

  const previousOrderRef = useRef(trackOrderRef.current);
  useEffect(() => {
    const order = trackOrderRef.current;
    const previous = previousOrderRef.current;
    previousOrderRef.current = order;
    if (draggedClipRef.current && timelineTrackOrderChanged(previous, order))
      cancelGestureRef.current();
  });

  return {
    draggedClip,
    setDraggedClip,
    resizingClip,
    setResizingClip,
    blockedClipRef,
    suppressClickRef,
    stopClipDragAutoScroll,
  };
}
