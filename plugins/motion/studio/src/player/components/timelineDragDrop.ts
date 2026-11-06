import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { TIMELINE_ASSET_MIME, TIMELINE_BLOCK_MIME } from "../../utils/timelineAssetDrop";
import {
  parseTimelineCompositionPayload,
  TIMELINE_COMPOSITION_MIME,
} from "../../utils/timelineCompositionDrop";
import {
  getTimelineRowFromY,
  resolveTimelineAssetDrop,
  type TimelineRowGeometry,
} from "./timelineLayout";
import { resolveInsertRow } from "./timelineCollision";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { collectTimelineSnapTargets, snapTimelineTime, TIMELINE_SNAP_PX } from "./timelineSnapping";
import type { TimelineDropCallbacks, TimelineDropPlacement } from "./timelineCallbacks";
import {
  applyTimelineAutoScrollStep,
  resolveTimelineAutoScrollLoopAction,
} from "./timelineEditing";

interface UseTimelineAssetDropOptions extends TimelineDropCallbacks {
  scrollRef: RefObject<HTMLDivElement | null>;
  ppsRef: RefObject<number>;
  trackOrderRef: RefObject<number[]>;
  elementsRef: RefObject<readonly TimelineElement[]>;
  rowGeometryRef: RefObject<TimelineRowGeometry>;
  contentOrigin: number;
  sessionEpoch: number;
  readOnlyPress?: (() => void) | null;
}

/**
 * Parse a JSON drag payload and, if it yields a value, forward it to the drop
 * callback. Malformed payloads are ignored. Shared by the asset + block paths so
 * the parse/guard/dispatch shape lives in one place.
 */
function applyJsonDropPayload(
  raw: string,
  pick: (parsed: Record<string, string | undefined>) => string | undefined,
  apply: (value: string, placement: TimelineDropPlacement) => void,
  placement: TimelineDropPlacement,
): boolean {
  try {
    const value = pick(JSON.parse(raw) as Record<string, string | undefined>);
    if (!value) return false;
    apply(value, placement);
    return true;
  } catch {
    return false;
  }
}

/** Only file and asset drops are written by the asset op that can open a track. */
function canInsertTrackFor(types: readonly string[]): boolean {
  return types.includes("Files") || types.includes(TIMELINE_ASSET_MIME);
}

/** The row boundary a pointer at `contentY` opens a new track at, or null over a row. */
export function resolveDropInsertRow(
  contentY: number,
  rowHeights: readonly number[] | undefined,
  trackCount: number,
): number | null {
  if (trackCount === 0) return null;
  const rowFloat = getTimelineRowFromY(contentY, rowHeights);
  // Past the last lane the drop already appends a track (getDefaultDroppedTrack).
  if (rowFloat >= trackCount) return null;
  return resolveInsertRow(rowFloat, trackCount);
}

function alignDropStart(
  placement: TimelineDropPlacement,
  elements: readonly TimelineElement[],
  pixelsPerSecond: number,
): TimelineDropPlacement {
  const laneHasClips =
    placement.insertRow == null && elements.some((el) => el.track === placement.track);
  if (!laneHasClips) return { ...placement, start: 0 };
  if (!usePlayerStore.getState().timelineSnapEnabled) return placement;
  const targets = collectTimelineSnapTargets({ elements, playheadTime: null, beatTimes: [] });
  const threshold = TIMELINE_SNAP_PX / Math.max(pixelsPerSecond, 1);
  return { ...placement, start: snapTimelineTime(placement.start, targets, threshold).time };
}

function placeDrop(
  geometry: Parameters<typeof resolveTimelineAssetDrop>[0],
  elements: readonly TimelineElement[],
  clientX: number,
  clientY: number,
  // Blocks and compositions are written by their own installers, which only take a track.
  canInsertTrack: boolean,
): TimelineDropPlacement {
  const placement = resolveTimelineAssetDrop(geometry, clientX, clientY);
  const contentY = clientY - geometry.rectTop + geometry.scrollTop;
  const insertRow = canInsertTrack
    ? resolveDropInsertRow(contentY, geometry.rowHeights, geometry.trackOrder.length)
    : null;
  const aimed =
    insertRow == null ? placement : { ...placement, insertRow, trackOrder: geometry.trackOrder };
  return alignDropStart(aimed, elements, geometry.pixelsPerSecond);
}

function invokeDropCallback(callback: () => Promise<void> | void): void {
  try {
    void Promise.resolve(callback()).catch(() => undefined);
  } catch {
    // A rejected external producer never keeps a timeline drop actor alive.
  }
}

function applyFileDrop(
  transfer: DataTransfer,
  onFileDrop: TimelineDropCallbacks["onFileDrop"],
  placement: TimelineDropPlacement,
): boolean {
  if (!onFileDrop || transfer.files.length === 0) return false;
  invokeDropCallback(() => onFileDrop(Array.from(transfer.files), placement));
  return true;
}

function applyTypedJsonDrop(
  transfer: DataTransfer,
  mime: string,
  field: "name" | "path",
  apply: ((value: string, placement: TimelineDropPlacement) => Promise<void> | void) | undefined,
  placement: TimelineDropPlacement,
): boolean {
  if (!apply || !Array.from(transfer.types).includes(mime)) return false;
  const payload = transfer.getData(mime);
  if (!payload) return false;
  return applyJsonDropPayload(
    payload,
    (parsed) => parsed[field],
    (value, nextPlacement) => invokeDropCallback(() => apply(value, nextPlacement)),
    placement,
  );
}

/**
 * Dropping an asset/file/block/composition places it on the row at 0 on an empty lane, else at
 * the pointer snapped to a near clip edge; an asset moves to that row's nearest free time.
 * Supersedes the prior playhead decision (#2291); see useAddAssetAtPlayhead.
 */
export function useTimelineAssetDrop({
  scrollRef,
  ppsRef,
  trackOrderRef,
  elementsRef,
  rowGeometryRef,
  contentOrigin,
  onFileDrop,
  onAssetDrop,
  onBlockDrop,
  onCompositionDrop,
  sessionEpoch,
  readOnlyPress,
}: UseTimelineAssetDropOptions) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPreview, setDropPreview] = useState<TimelineDropPlacement | null>(null);
  const dragPointerRef = useRef<{ clientX: number; clientY: number; sessionEpoch: number } | null>(
    null,
  );
  const autoScrollRafRef = useRef(0);
  const activeDropEpochRef = useRef<number | null>(null);
  const refusedDragRef = useRef(false);

  const stopAutoScroll = useCallback(() => {
    dragPointerRef.current = null;
    if (autoScrollRafRef.current) cancelAnimationFrame(autoScrollRafRef.current);
    autoScrollRafRef.current = 0;
  }, []);

  const stepAutoScroll = useCallback(
    function stepAutoScroll() {
      autoScrollRafRef.current = 0;
      const pointer = dragPointerRef.current;
      const scroll = scrollRef.current;
      if (!pointer || pointer.sessionEpoch !== sessionEpoch || !scroll) return;
      if (!applyTimelineAutoScrollStep(scroll, pointer.clientX, pointer.clientY)) return;
      autoScrollRafRef.current = requestAnimationFrame(stepAutoScroll);
    },
    [scrollRef, sessionEpoch],
  );

  const syncAutoScroll = useCallback(
    (clientX: number, clientY: number) => {
      dragPointerRef.current = { clientX, clientY, sessionEpoch };
      const scroll = scrollRef.current;
      const action = resolveTimelineAutoScrollLoopAction(
        scroll,
        clientX,
        clientY,
        autoScrollRafRef.current !== 0,
      );
      if (action === "stop") {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = 0;
      } else if (action === "start") {
        autoScrollRafRef.current = requestAnimationFrame(stepAutoScroll);
      }
    },
    [scrollRef, sessionEpoch, stepAutoScroll],
  );

  const resolveDropPlacement = useCallback(
    (clientX: number, clientY: number, canInsertTrack: boolean): TimelineDropPlacement => {
      const scroll = scrollRef.current;
      const rect = scroll?.getBoundingClientRect();
      return placeDrop(
        {
          rectLeft: rect?.left ?? 0,
          rectTop: rect?.top ?? 0,
          scrollLeft: scroll?.scrollLeft ?? 0,
          scrollTop: scroll?.scrollTop ?? 0,
          contentOrigin,
          pixelsPerSecond: ppsRef.current,
          rowHeights: rowGeometryRef.current.rowHeights,
          trackOrder: trackOrderRef.current,
        },
        elementsRef.current,
        clientX,
        clientY,
        canInsertTrack,
      );
    },
    [scrollRef, ppsRef, trackOrderRef, elementsRef, rowGeometryRef, contentOrigin],
  );

  const handleAssetDragOver = useCallback(
    (e: React.DragEvent) => {
      const types = Array.from(e.dataTransfer.types);
      const hasFiles = types.includes("Files");
      const hasAsset = types.includes(TIMELINE_ASSET_MIME);
      const hasBlock = types.includes(TIMELINE_BLOCK_MIME);
      const hasComposition = types.includes(TIMELINE_COMPOSITION_MIME);
      if (!hasFiles && !hasAsset && !hasBlock && !hasComposition) return;
      if (readOnlyPress) {
        e.dataTransfer.dropEffect = "none";
        if (!refusedDragRef.current) readOnlyPress();
        refusedDragRef.current = true;
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      activeDropEpochRef.current = sessionEpoch;
      setIsDragOver(true);
      const next = resolveDropPlacement(e.clientX, e.clientY, canInsertTrackFor(types));
      setDropPreview((prev) =>
        prev?.start === next.start && prev.track === next.track && prev.insertRow === next.insertRow
          ? prev
          : next,
      );
      syncAutoScroll(e.clientX, e.clientY);
    },
    [readOnlyPress, resolveDropPlacement, sessionEpoch, syncAutoScroll],
  );

  const clearDropPreview = useCallback(() => {
    activeDropEpochRef.current = null;
    refusedDragRef.current = false;
    stopAutoScroll();
    setIsDragOver(false);
    setDropPreview(null);
  }, [stopAutoScroll]);

  const handleAssetDragLeave = useCallback(
    (e: React.DragEvent) => {
      const related = e.relatedTarget;
      if (related instanceof Node && e.currentTarget.contains(related)) return;
      clearDropPreview();
    },
    [clearDropPreview],
  );

  const handleAssetDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const canCommit = activeDropEpochRef.current === sessionEpoch;
      clearDropPreview();
      if (!canCommit) return;
      const types = Array.from(e.dataTransfer.types);
      const placement = resolveDropPlacement(e.clientX, e.clientY, canInsertTrackFor(types));

      const compositionPayload = parseTimelineCompositionPayload(
        e.dataTransfer.getData(TIMELINE_COMPOSITION_MIME),
      );
      if (compositionPayload && onCompositionDrop) {
        invokeDropCallback(() => onCompositionDrop(compositionPayload.sourcePath, placement));
        return;
      }

      if (applyFileDrop(e.dataTransfer, onFileDrop, placement)) return;
      if (applyTypedJsonDrop(e.dataTransfer, TIMELINE_ASSET_MIME, "path", onAssetDrop, placement)) {
        return;
      }
      applyTypedJsonDrop(e.dataTransfer, TIMELINE_BLOCK_MIME, "name", onBlockDrop, placement);
    },
    [
      clearDropPreview,
      onAssetDrop,
      onBlockDrop,
      onCompositionDrop,
      onFileDrop,
      resolveDropPlacement,
      sessionEpoch,
    ],
  );

  useEffect(() => {
    window.addEventListener("dragend", clearDropPreview);
    return () => {
      window.removeEventListener("dragend", clearDropPreview);
      clearDropPreview();
    };
  }, [clearDropPreview]);
  useEffect(() => clearDropPreview(), [clearDropPreview, sessionEpoch]);

  return {
    isDragOver,
    dropPreview,
    handleAssetDragOver,
    handleAssetDragLeave,
    handleAssetDrop,
    clearDropPreview,
  };
}
