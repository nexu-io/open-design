import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type RefObject,
} from "react";
import type { TimelineElement } from "../store/playerStore";
import { sameData } from "../../utils/sameData";
import { resolveTimelineFocusIdentity } from "./timelineFocusIdentity";
import { getTimelineScrollTopForGeometryChange } from "./timelineViewportGeometry";
import type { TimelineRowGeometry } from "./timelineLayout";
import type { TimelineScrollViewportSnapshot } from "./useTimelineScrollViewport";
import { STUDIO_TIMELINE_ROW_VIRTUALIZATION_ENABLED } from "./timelineRowVirtualizationFlag";
import { useTimelineVirtualRows } from "./useTimelineVirtualRows";

interface UseTimelineRowVirtualizationInput {
  scrollRef: RefObject<HTMLDivElement | null>;
  viewport: TimelineScrollViewportSnapshot;
  rowGeometry: TimelineRowGeometry;
  sessionEpoch: number;
  elements: readonly TimelineElement[];
  selectedElementId: string | null;
  focusedRowKey?: number;
  draggedRowKey?: number;
  resizingElementIds?: readonly string[];
  clipContextMenuRowKey?: number;
  keyframeContextMenuRowKey?: number;
  lastScrollLeftRef: RefObject<number>;
  syncScrollViewport: (element: HTMLDivElement, isScrolling?: boolean) => void;
}

function getFocusedTimelineRowKey(target: EventTarget | null): number | undefined {
  if (!(target instanceof Element)) return undefined;
  const value = target.closest<HTMLElement>("[data-timeline-row-key]")?.dataset.timelineRowKey;
  if (value === undefined) return undefined;
  const rowKey = Number(value);
  return Number.isFinite(rowKey) ? rowKey : undefined;
}

const rowTops = (g: TimelineRowGeometry) => [g.rowKeys, g.rowOffsets, g.padding.top];

export function useTimelineRowVirtualization({
  scrollRef,
  viewport,
  rowGeometry,
  sessionEpoch,
  elements,
  selectedElementId,
  focusedRowKey,
  draggedRowKey,
  resizingElementIds,
  clipContextMenuRowKey,
  keyframeContextMenuRowKey,
  lastScrollLeftRef,
  syncScrollViewport,
}: UseTimelineRowVirtualizationInput) {
  const enabled = STUDIO_TIMELINE_ROW_VIRTUALIZATION_ENABLED;
  const [domFocusedRowKey, setDomFocusedRowKey] = useState<number>();
  const onTimelineFocus = useCallback((event: ReactFocusEvent<HTMLDivElement>) => {
    setDomFocusedRowKey(getFocusedTimelineRowKey(event.target));
  }, []);
  const onTimelineBlur = useCallback((event: ReactFocusEvent<HTMLDivElement>) => {
    setDomFocusedRowKey(getFocusedTimelineRowKey(event.relatedTarget));
  }, []);
  const selectedIdentity = useMemo(
    () => resolveTimelineFocusIdentity(elements, selectedElementId),
    [elements, selectedElementId],
  );
  const resizingRowKeys = useMemo(
    () =>
      resizingElementIds
        ?.map((elementId) => resolveTimelineFocusIdentity(elements, elementId)?.rowKey)
        .filter((rowKey): rowKey is number => rowKey !== undefined) ?? [],
    [elements, resizingElementIds],
  );
  const pinnedRowKeys = useMemo(
    () =>
      [
        draggedRowKey,
        ...resizingRowKeys,
        selectedIdentity?.rowKey,
        focusedRowKey,
        clipContextMenuRowKey,
        keyframeContextMenuRowKey,
      ].filter((rowKey): rowKey is number => rowKey !== undefined),
    [
      clipContextMenuRowKey,
      draggedRowKey,
      focusedRowKey,
      keyframeContextMenuRowKey,
      resizingRowKeys,
      selectedIdentity,
    ],
  );
  const virtualRows = useTimelineVirtualRows({
    enabled,
    scrollRef,
    viewport,
    rowGeometry,
    sessionEpoch,
    pinnedRowKeys,
    focusedRowKey: domFocusedRowKey ?? focusedRowKey,
  });

  const previousLayoutRef = useRef(rowGeometry);
  const previousDraggedRowKeyRef = useRef(draggedRowKey);
  const previousSessionEpochRef = useRef(sessionEpoch);
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const previousGeometry = previousLayoutRef.current;
    if (previousSessionEpochRef.current !== sessionEpoch) {
      previousSessionEpochRef.current = sessionEpoch;
      lastScrollLeftRef.current = 0;
      if (scroll) {
        scroll.scrollLeft = 0;
        scroll.scrollTop = 0;
        syncScrollViewport(scroll);
      }
    } else if (scroll && !sameData(rowTops(previousGeometry), rowTops(rowGeometry))) {
      const nextScrollTop = getTimelineScrollTopForGeometryChange(
        previousGeometry,
        rowGeometry,
        scroll.scrollTop,
        draggedRowKey !== undefined || previousDraggedRowKeyRef.current !== undefined,
      );
      if (nextScrollTop !== scroll.scrollTop) {
        scroll.scrollTop = nextScrollTop;
        syncScrollViewport(scroll);
      }
    }
    previousLayoutRef.current = rowGeometry;
    previousDraggedRowKeyRef.current = draggedRowKey;
  }, [draggedRowKey, lastScrollLeftRef, rowGeometry, scrollRef, sessionEpoch, syncScrollViewport]);

  return {
    enabled,
    virtualRows,
    timelineFocusProps: { onFocus: onTimelineFocus, onBlur: onTimelineBlur },
  };
}
