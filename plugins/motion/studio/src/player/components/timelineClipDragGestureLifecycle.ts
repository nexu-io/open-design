import type { TimelineTrackInsertLayout } from "./timelineTrackInsertLayout";
import { matchesKey } from "./studioShortcuts";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { resolveTimelineDragEscape } from "./timelineEditing";
import { commitDraggedClipMove } from "./timelineClipDragCommit";
import type {
  BlockedClipState,
  DraggedClipState,
  ResizingClipState,
} from "./timelineClipDragTypes";
import type { TimelineGroupResizeSession } from "./timelineGroupEditing";
import { commitTimelineGroupResize } from "./timelineGroupResizeCommit";
import { releasedOutsideWindow } from "./timelinePointerRelease";
import {
  beginTimelineOptimisticGesture,
  rollbackLatestTimelineOptimisticGesture,
} from "./timelineOptimisticRevision";
import type { TimelineEditCallbacks } from "./timelineCallbacks";
import type { StackingPatch } from "./timelineStackingSync";
import type { TimelineElement, usePlayerStore } from "../store/playerStore";

export type TimelineGestureKind = "drag" | "resize";
type TimelineGesturePhase = "active" | "committing" | "cancelled" | "complete";

export interface TimelineGestureLifecycle {
  kind: TimelineGestureKind | null;
  phase: TimelineGesturePhase;
  pointerId: number | null;
  sessionEpoch: number;
}

interface TimelineGestureCommit {
  kind: TimelineGestureKind;
  drag: DraggedClipState | null;
  resize: ResizingClipState | null;
  groupResize: TimelineGroupResizeSession | null;
}

type UpdateElement = ReturnType<typeof usePlayerStore.getState>["updateElement"];

interface TimelineClipDragGestureLifecycleInput {
  commitGestureRef?: RefObject<() => void>;
  trackInsertLayoutRef?: RefObject<TimelineTrackInsertLayout | undefined>;
  lifecycleRef: RefObject<TimelineGestureLifecycle>;
  sessionEpochRef: RefObject<number>;
  cancelGestureRef: RefObject<
    (options?: { updateReact?: boolean; suppressClick?: boolean }) => boolean
  >;
  scrollRef: RefObject<HTMLDivElement | null>;
  draggedClipRef: RefObject<DraggedClipState | null>;
  resizingClipRef: RefObject<ResizingClipState | null>;
  blockedClipRef: RefObject<BlockedClipState | null>;
  groupResizeRef: RefObject<TimelineGroupResizeSession | null>;
  suppressClickRef: RefObject<boolean>;
  gestureSelectedKeysRef: RefObject<ReadonlySet<string>>;
  elementsRef: RefObject<TimelineElement[]>;
  trackOrderRef: RefObject<number[]>;
  setDraggedClipState: Dispatch<SetStateAction<DraggedClipState | null>>;
  setResizingClipState: Dispatch<SetStateAction<ResizingClipState | null>>;
  setShowPopover: (show: boolean) => void;
  setRangeSelectionRef: RefObject<((selection: null) => void) | null>;
  applyResizePointerRef: RefObject<(resize: ResizingClipState, clientX: number) => void>;
  syncClipDragAutoScrollRef: RefObject<(clientX: number, clientY: number) => void>;
  stopClipDragAutoScrollRef: RefObject<() => void>;
  updateDraggedClipPreviewRef: RefObject<
    (drag: DraggedClipState, clientX: number, clientY: number) => DraggedClipState
  >;
  publishDraggedClip: (next: DraggedClipState | null) => void;
  updateElement: UpdateElement;
  onMoveElementRef: RefObject<TimelineEditCallbacks["onMoveElement"]>;
  onMoveElementsRef: RefObject<TimelineEditCallbacks["onMoveElements"]>;
  onResizeElementRef: RefObject<TimelineEditCallbacks["onResizeElement"]>;
  onResizeElementsRef: RefObject<TimelineEditCallbacks["onResizeElements"]>;
  onBlockedEditAttemptRef: RefObject<
    ((element: TimelineElement, intent: BlockedClipState["intent"]) => void) | undefined
  >;
  onLinkEditRef: RefObject<TimelineEditCallbacks["onLinkEdit"]>;
  readZIndexRef: RefObject<((element: TimelineElement) => number) | undefined>;
  onStackingPatchesRef: RefObject<
    ((patches: StackingPatch[]) => Promise<unknown> | void) | undefined
  >;
  refreshAfterLaneMoveRef: RefObject<(() => void) | undefined>;
}

export function mountTimelineClipDragGestureLifecycle({
  // The explicit destructuring mirrors the single call site's dependency object by design.
  // fallow-ignore-next-line code-duplication
  commitGestureRef,
  trackInsertLayoutRef,
  lifecycleRef,
  sessionEpochRef,
  cancelGestureRef,
  scrollRef,
  draggedClipRef,
  resizingClipRef,
  blockedClipRef,
  groupResizeRef,
  suppressClickRef,
  gestureSelectedKeysRef,
  elementsRef,
  trackOrderRef,
  setDraggedClipState,
  setResizingClipState,
  setShowPopover,
  setRangeSelectionRef,
  applyResizePointerRef,
  syncClipDragAutoScrollRef,
  stopClipDragAutoScrollRef,
  updateDraggedClipPreviewRef,
  publishDraggedClip,
  updateElement,
  onMoveElementRef,
  onMoveElementsRef,
  onResizeElementRef,
  onResizeElementsRef,
  onBlockedEditAttemptRef,
  onLinkEditRef,
  readZIndexRef,
  onStackingPatchesRef,
  refreshAfterLaneMoveRef,
}: TimelineClipDragGestureLifecycleInput): () => void {
  const clearSuppressedClick = () => {
    requestAnimationFrame(() => {
      suppressClickRef.current = false;
    });
  };

  const pointerMatchesGesture = (event: PointerEvent): boolean => {
    if (draggedClipRef.current?.pointerId === null) return false;
    const pointerId = lifecycleRef.current.pointerId;
    return pointerId === null || event.pointerId === pointerId;
  };

  const releasePointerCapture = (pointerId: number | null) => {
    if (pointerId === null) return;
    const scroll = scrollRef.current;
    try {
      if (scroll?.hasPointerCapture(pointerId)) scroll.releasePointerCapture(pointerId);
    } catch {
      // Window listeners are authoritative when native capture is unavailable.
    }
  };

  const capturePointer = (pointerId: number | null) => {
    if (pointerId === null) return;
    try {
      scrollRef.current?.setPointerCapture(pointerId);
    } catch {
      // Window listeners remain authoritative when native capture is unavailable.
    }
  };

  const clearGestureProjection = (updateReact: boolean) => {
    draggedClipRef.current = null;
    resizingClipRef.current = null;
    groupResizeRef.current = null;
    if (updateReact) {
      setDraggedClipState(null);
      setResizingClipState(null);
    }
  };

  const cancelGesture = ({
    updateReact = true,
    suppressClick = false,
  }: {
    updateReact?: boolean;
    suppressClick?: boolean;
  } = {}): boolean => {
    const lifecycle = lifecycleRef.current;
    if (lifecycle.phase !== "active") return false;
    lifecycle.phase = "cancelled";
    stopClipDragAutoScrollRef.current();
    clearGestureProjection(updateReact);
    releasePointerCapture(lifecycle.pointerId);
    if (suppressClick) suppressClickRef.current = true;
    lifecycle.kind = null;
    lifecycle.pointerId = null;
    lifecycle.phase = "complete";
    return true;
  };
  cancelGestureRef.current = cancelGesture;

  const handleResizePointerMove = (event: PointerEvent, resize: ResizingClipState) => {
    const distance = Math.abs(event.clientX - resize.originClientX);
    if (!resize.started && distance < 2) return;
    if (!resize.started) capturePointer(resize.pointerId);
    setShowPopover(false);
    setRangeSelectionRef.current?.(null);
    applyResizePointerRef.current(resize, event.clientX);
    syncClipDragAutoScrollRef.current(event.clientX, event.clientY);
  };

  const handleBlockedPointerMove = (event: PointerEvent, blocked: BlockedClipState) => {
    const distance = Math.hypot(
      event.clientX - blocked.originClientX,
      event.clientY - blocked.originClientY,
    );
    const threshold = blocked.intent === "move" ? 4 : 2;
    if (!blocked.started && distance < threshold) return;
    if (!blocked.started) {
      blocked.started = true;
      blockedClipRef.current = blocked;
      capturePointer(blocked.pointerId);
      suppressClickRef.current = true;
      setShowPopover(false);
      setRangeSelectionRef.current?.(null);
      onBlockedEditAttemptRef.current?.(blocked.element, blocked.intent);
    }
  };

  const handleDragPointerMove = (event: PointerEvent, drag: DraggedClipState) => {
    const distance = Math.hypot(
      event.clientX - drag.originClientX,
      event.clientY - drag.originClientY,
    );
    if (!drag.started && distance < 4) return;
    if (!drag.started) capturePointer(drag.pointerId);
    setShowPopover(false);
    setRangeSelectionRef.current?.(null);
    publishDraggedClip(updateDraggedClipPreviewRef.current(drag, event.clientX, event.clientY));
    syncClipDragAutoScrollRef.current(event.clientX, event.clientY);
  };

  const handleWindowPointerMove = (event: PointerEvent) => {
    const resize = resizingClipRef.current;
    if (resize) {
      if (!pointerMatchesGesture(event)) return;
      return handleResizePointerMove(event, resize);
    }
    const blocked = blockedClipRef.current;
    if (blocked) {
      if (blocked.pointerId !== event.pointerId) return;
      return handleBlockedPointerMove(event, blocked);
    }
    const drag = draggedClipRef.current;
    if (drag && pointerMatchesGesture(event)) handleDragPointerMove(event, drag);
  };

  const unlinkAltEdited = (gesture: { element: TimelineElement; altKey?: boolean }) => {
    if (!gesture.altKey || !gesture.element.link) return;
    void onLinkEditRef.current?.({ kind: "unlink", elements: [gesture.element] });
  };

  const commitResizePointerUp = (
    resize: ResizingClipState,
    groupSession: TimelineGroupResizeSession | null,
  ) => {
    if (!resize.started) return;
    suppressClickRef.current = true;
    clearSuppressedClick();
    if (groupSession) {
      commitTimelineGroupResize(groupSession, updateElement, onResizeElementsRef.current);
      return;
    }
    const hasChanged =
      resize.previewStart !== resize.element.start ||
      resize.previewDuration !== resize.element.duration ||
      resize.previewPlaybackStart !== resize.element.playbackStart;
    if (!hasChanged) return;

    const resizeKey = resize.element.key ?? resize.element.id;
    const revision = beginTimelineOptimisticGesture(updateElement, [resizeKey]);
    updateElement(resizeKey, {
      start: resize.previewStart,
      duration: resize.previewDuration,
      playbackStart: resize.previewPlaybackStart,
    });
    Promise.resolve(
      onResizeElementRef.current?.(resize.element, {
        start: resize.previewStart,
        duration: resize.previewDuration,
        playbackStart: resize.previewPlaybackStart,
      }),
    ).catch((error) => {
      rollbackLatestTimelineOptimisticGesture(updateElement, revision, [
        {
          key: resizeKey,
          updates: {
            start: resize.element.start,
            duration: resize.element.duration,
            playbackStart: resize.element.playbackStart,
          },
        },
      ]);
      console.error("[Timeline] Failed to persist clip resize", error);
    });
    unlinkAltEdited(resize);
  };

  const finishBlockedPointerUp = (blocked: BlockedClipState) => {
    blockedClipRef.current = null;
    if (blocked.started) clearSuppressedClick();
  };

  const commitDragPointerUp = (drag: DraggedClipState) => {
    if (!drag.started) return;
    suppressClickRef.current = true;
    clearSuppressedClick();
    commitDraggedClipMove(drag, {
      elements: elementsRef.current,
      trackOrder: trackOrderRef.current,
      trackInsertLayout: trackInsertLayoutRef?.current,
      updateElement,
      onMoveElement: onMoveElementRef.current,
      onMoveElements: onMoveElementsRef.current,
      selectedKeys: gestureSelectedKeysRef.current,
      readZIndex: readZIndexRef.current,
      onStackingPatches: onStackingPatchesRef.current,
      refreshAfterLaneMove: refreshAfterLaneMoveRef.current,
    });
    unlinkAltEdited(drag);
  };

  /** Group gestures commit atomically: one missing member cancels the whole resize. */
  const gestureSourcesStillExist = (): boolean => {
    const gestureElements = groupResizeRef.current?.members.map((member) => member.element) ?? [
      resizingClipRef.current?.element ?? draggedClipRef.current?.element,
    ];
    const liveKeys = new Set(elementsRef.current.map((element) => element.key ?? element.id));
    return gestureElements.every(
      (element) => element === undefined || liveKeys.has(element.key ?? element.id),
    );
  };

  const claimActiveGesture = (
    event: PointerEvent | null,
  ): TimelineGestureCommit | "ignored" | null => {
    const lifecycle = lifecycleRef.current;
    if (lifecycle.phase !== "active") return null;
    if (event && !pointerMatchesGesture(event)) return "ignored";
    if (lifecycle.sessionEpoch !== sessionEpochRef.current) {
      cancelGesture();
      return "ignored";
    }
    if (!gestureSourcesStillExist()) {
      cancelGesture();
      return "ignored";
    }
    lifecycle.phase = "committing";
    const claimed = lifecycle.kind
      ? {
          kind: lifecycle.kind,
          drag: draggedClipRef.current,
          resize: resizingClipRef.current,
          groupResize: groupResizeRef.current,
        }
      : "ignored";
    stopClipDragAutoScrollRef.current();
    clearGestureProjection(true);
    releasePointerCapture(lifecycle.pointerId);
    if (claimed === "ignored") lifecycle.phase = "complete";
    return claimed;
  };

  const commitClaimedGesture = (gesture: TimelineGestureCommit) => {
    try {
      if (gesture.kind === "resize" && gesture.resize) {
        commitResizePointerUp(gesture.resize, gesture.groupResize);
      } else if (gesture.kind === "drag" && gesture.drag) {
        commitDragPointerUp(gesture.drag);
      }
    } finally {
      const lifecycle = lifecycleRef.current;
      lifecycle.kind = null;
      lifecycle.pointerId = null;
      lifecycle.phase = "complete";
    }
  };

  if (commitGestureRef)
    commitGestureRef.current = () => {
      const claimed = claimActiveGesture(null);
      if (claimed && claimed !== "ignored") commitClaimedGesture(claimed);
    };

  const handleWindowPointerUp = (event: PointerEvent) => {
    if (releasedOutsideWindow(event)) return handleWindowPointerCancel(event);
    const claimed = claimActiveGesture(event);
    if (claimed === "ignored") return;
    if (claimed) {
      commitClaimedGesture(claimed);
      return;
    }
    const blocked = blockedClipRef.current;
    if (blocked) {
      if (blocked.pointerId !== event.pointerId) return;
      return finishBlockedPointerUp(blocked);
    }
    if (suppressClickRef.current) clearSuppressedClick();
  };

  const handleWindowPointerCancel = (event: PointerEvent) => {
    if (lifecycleRef.current.phase === "active" && pointerMatchesGesture(event)) {
      if (cancelGesture({ suppressClick: true })) clearSuppressedClick();
    }
    const blocked = blockedClipRef.current;
    if (blocked && blocked.pointerId !== event.pointerId) return;
    blockedClipRef.current = null;
    if (suppressClickRef.current) clearSuppressedClick();
  };

  const handleLostPointerCapture = (event: PointerEvent) => {
    if (lifecycleRef.current.phase === "active" && pointerMatchesGesture(event)) {
      if (cancelGesture({ suppressClick: true })) clearSuppressedClick();
    }
  };

  const handleWindowKeyDown = (event: KeyboardEvent) => {
    const decision = resolveTimelineDragEscape({
      cancelPressed: matchesKey(event, "cancel"),
      drag: draggedClipRef.current,
      resize: resizingClipRef.current,
      blocked: blockedClipRef.current,
    });
    if (!decision.cancel) return;
    event.preventDefault();
    blockedClipRef.current = null;
    cancelGesture({ suppressClick: decision.suppressClick });
  };

  window.addEventListener("pointermove", handleWindowPointerMove);
  window.addEventListener("pointerup", handleWindowPointerUp);
  window.addEventListener("pointercancel", handleWindowPointerCancel);
  window.addEventListener("lostpointercapture", handleLostPointerCapture);
  window.addEventListener("keydown", handleWindowKeyDown);
  return () => {
    cancelGesture({ updateReact: false });
    cancelGestureRef.current = () => false;
    if (commitGestureRef) commitGestureRef.current = () => {};
    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", handleWindowPointerUp);
    window.removeEventListener("pointercancel", handleWindowPointerCancel);
    window.removeEventListener("lostpointercapture", handleLostPointerCapture);
    window.removeEventListener("keydown", handleWindowKeyDown);
  };
}
