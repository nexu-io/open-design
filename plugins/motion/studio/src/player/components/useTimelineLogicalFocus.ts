import type { RefObject } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { TimelineElement } from "../store/playerStore";
import type { TimelineRowGeometry } from "./timelineLayout";
import type { TimelineScrollViewportSnapshot } from "./useTimelineScrollViewport";
import type { TimelineTrackGroupInfo } from "./useTimelineTrackDerivations";
import { useTimelineFocusCoordinator } from "./useTimelineFocusCoordinator";
import { usePlayerStore } from "../store/playerStore";
import { useTimelineLogicalRows } from "./useTimelineLogicalRows";
import { useTimelineRowVirtualization } from "./useTimelineRowVirtualization";

interface TimelineLogicalFocusInput {
  scrollRef: RefObject<HTMLDivElement | null>;
  tracks: readonly (readonly [number, readonly TimelineElement[]])[];
  layout: { displayTrackOrder: readonly number[]; rowGeometry: TimelineRowGeometry };
  laneCounts: ReadonlyMap<string, number>;
  selectedElementId: string | null;
  selectedElementIds: ReadonlySet<string>;
  groups: readonly TimelineTrackGroupInfo[];
  trackGroupOf: ReadonlyMap<number, TimelineTrackGroupInfo>;
  gsapAnimations: ReadonlyMap<string, readonly GsapAnimation[]>;
  elements: readonly TimelineElement[];
  pixelsPerSecond: number;
  contentOrigin: number;
  allowHorizontal: boolean;
  viewport: TimelineScrollViewportSnapshot;
  sessionEpoch: number;
  draggedRowKey?: number;
  resizingElementIds?: readonly string[];
  clipContextMenuRowKey?: number;
  keyframeContextMenuRowKey?: number;
  lastScrollLeftRef: RefObject<number>;
  syncScrollViewport: (element: HTMLDivElement) => void;
}

export function useTimelineLogicalFocus(input: TimelineLogicalFocusInput) {
  const expandedClipIds = usePlayerStore((state) => state.expandedClipIds);
  const collapsedGroupIds = usePlayerStore((state) => state.collapsedGroupIds);
  const expandedLaneOwnerIds = usePlayerStore((state) => state.expandedLaneOwnerIds);
  const projectId = usePlayerStore((state) => state.timelineProjectId);
  const logicalRows = useTimelineLogicalRows({
    tracks: input.tracks,
    displayTrackOrder: input.layout.displayTrackOrder,
    laneCounts: input.laneCounts,
    selectedElementId: input.selectedElementId,
    selectedElementIds: input.selectedElementIds,
    expandedClipIds,
    collapsedGroupIds,
    expandedLaneOwnerIds,
    groups: input.groups,
    trackGroupOf: input.trackGroupOf,
    gsapAnimations: input.gsapAnimations,
  });
  const focus = useTimelineFocusCoordinator({
    scrollRef: input.scrollRef,
    logicalRows,
    elements: input.elements,
    rowGeometry: input.layout.rowGeometry,
    pixelsPerSecond: input.pixelsPerSecond,
    contentOrigin: input.contentOrigin,
    allowHorizontal: input.allowHorizontal,
    viewportVersion: input.viewport,
    projectId,
    sessionEpoch: input.sessionEpoch,
    syncScrollViewport: input.syncScrollViewport,
    lastScrollLeftRef: input.lastScrollLeftRef,
  });
  const rows = useTimelineRowVirtualization({
    scrollRef: input.scrollRef,
    viewport: input.viewport,
    rowGeometry: input.layout.rowGeometry,
    sessionEpoch: input.sessionEpoch,
    elements: input.elements,
    selectedElementId: input.selectedElementId,
    focusedRowKey: focus.focusedRowKey,
    draggedRowKey: input.draggedRowKey,
    resizingElementIds: input.resizingElementIds,
    clipContextMenuRowKey: input.clipContextMenuRowKey,
    keyframeContextMenuRowKey: input.keyframeContextMenuRowKey,
    lastScrollLeftRef: input.lastScrollLeftRef,
    syncScrollViewport: input.syncScrollViewport,
  });
  return {
    logicalRows,
    ...focus,
    rowVirtualizationActive: rows.enabled,
    virtualRows: rows.virtualRows,
    timelineFocusProps: rows.timelineFocusProps,
  };
}
