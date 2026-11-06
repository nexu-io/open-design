import type {
  TimelineMeta,
  TimelineContainerProps,
  TimelineViewportProps,
} from "./TimelineProvider";
import type { ResizingClipState } from "./useTimelineClipDrag";
import type { DraggedClipState } from "./timelineClipDragTypes";
import { resolveGroupMovers, type MultiDragPreviewInput } from "./timelineMultiDragPreview";
import { getTimelineElementIdentity } from "../lib/timelineElementHelpers";
import type { TimelineElement } from "../store/playerStore";

export function resolveMultiDragPreview(
  draggedClip: DraggedClipState | null,
  selectedKeys: ReadonlySet<string>,
  elements: readonly TimelineElement[],
): MultiDragPreviewInput | null {
  // The dragged clip is a free ghost; the clips that move with it follow the same
  // clamped delta so the formation stays rigid. A locked selected clip stays put.
  if (!draggedClip?.started) return null;
  const draggedKey = getTimelineElementIdentity(draggedClip.element);
  const movers = resolveGroupMovers(elements, selectedKeys, draggedKey);
  return {
    dragStarted: true,
    draggedKey,
    draggedOriginStart: draggedClip.element.start,
    draggedPreviewStart: draggedClip.previewStart,
    selectedKeys: movers ? new Set(movers.map(getTimelineElementIdentity)) : selectedKeys,
  };
}

export function resolveResizingElementIds(
  resizingClip: ResizingClipState | null,
): readonly string[] | undefined {
  if (resizingClip?.groupPreview) return resizingClip.groupPreview.map((change) => change.key);
  if (resizingClip) return [resizingClip.element.key ?? resizingClip.element.id];
  return undefined;
}

export function shouldIgnoreTimelinePointerDown(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, input, select, a") !== null;
}

type ContainerInputs = Omit<TimelineContainerProps, "className"> & {
  isDragOver: boolean;
  activeTool: string;
  shiftHeld: boolean;
  accentClass: string;
};

type ViewportInputs = Omit<
  TimelineViewportProps,
  | "className"
  | "data-timeline-scroll-viewport"
  | "data-timeline-auto-scroll-left-inset"
  | "data-timeline-content-origin"
> & {
  labelMode: boolean;
  contentOrigin: number;
  zoomMode: "fit" | "manual";
};

export interface TimelineMetaBuilderInputs {
  emptyState: TimelineMeta["emptyState"];
  container: ContainerInputs;
  viewport: ViewportInputs;
  elementCount: number;
  labelColumnWidth: number;
  razorGuide: TimelineMeta["razorGuide"];
}

export function buildTimelineMeta({
  emptyState,
  container,
  viewport,
  elementCount,
  labelColumnWidth,
  razorGuide,
}: TimelineMetaBuilderInputs): TimelineMeta {
  const { labelMode, zoomMode, contentOrigin, ...viewportProps } = viewport;
  const containerClassName = `relative border-t select-none h-full overflow-hidden ${container.isDragOver ? container.accentClass : ""} ${container.activeTool === "razor" ? "cursor-crosshair" : container.shiftHeld ? "cursor-crosshair" : "cursor-default"}`;
  const viewportClassName = `${zoomMode === "fit" ? "overflow-x-hidden" : "overflow-x-auto"} overflow-y-auto h-full outline-hidden`;
  return {
    emptyState,
    containerProps: {
      ref: container.ref,
      "aria-label": container["aria-label"],
      "data-timeline-element-count": elementCount,
      className: containerClassName,
      onMouseMove: container.onMouseMove,
      onMouseLeave: container.onMouseLeave,
      style: container.style,
    },
    viewportProps: {
      ...viewportProps,
      "data-timeline-scroll-viewport": true,
      "data-timeline-auto-scroll-left-inset": labelMode ? labelColumnWidth : 0,
      "data-timeline-content-origin": contentOrigin,
      className: viewportClassName,
    },
    razorGuide,
  };
}
