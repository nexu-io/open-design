import type { MutableRefObject, PointerEvent } from "react";
import type {
  TimelineContainerProps,
  TimelineMeta,
  TimelineViewportProps,
} from "./TimelineProvider";
import {
  buildTimelineMeta,
  shouldIgnoreTimelinePointerDown,
} from "./timelineProviderStateBuilders";
import { TimelineRazorGuideOverlay } from "./TimelineRazorInteraction";
import { LABEL_COL_W } from "./timelineLayout";
import type { TimelineTheme } from "./timelineTheme";

type ViewportHandlers = Pick<
  TimelineViewportProps,
  "onDragOver" | "onDragLeave" | "onDrop" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
>;

export interface TimelineShellMetaInputs {
  isDragOver: boolean;
  hasFileDrop: boolean;
  drop: Pick<ViewportHandlers, "onDragOver" | "onDragLeave" | "onDrop">;
  pointer: Pick<ViewportHandlers, "onPointerMove" | "onPointerUp" | "onPointerCancel"> & {
    onPointerDown: TimelineViewportProps["onPointerDown"];
  };
  setContainerRef: TimelineContainerProps["ref"];
  setScrollRef: TimelineViewportProps["ref"];
  focusProps: Pick<TimelineViewportProps, "onFocus" | "onBlur">;
  elementCount: number;
  activeTool: string;
  shiftHeld: boolean;
  labelMode: boolean;
  contentOrigin: number;
  zoomMode: "fit" | "manual";
  theme: Pick<TimelineTheme, "shellBackground" | "shellBorder">;
  razor: {
    razorGuideX: number | null;
    updateRazorGuide: TimelineContainerProps["onMouseMove"];
    clearRazorGuide: () => void;
    splitAllAtPointer: (event: PointerEvent<HTMLDivElement>) => boolean;
  };
  lastScrollLeftRef: MutableRefObject<number>;
  recordTimelineScroll: (scroll: HTMLDivElement) => void;
  syncScrollViewport: (scroll: HTMLDivElement, isScrolling?: boolean) => void;
}

/** The timeline shell's container and scroll viewport props: drop, pointer, scroll and razor wiring. */
export function buildTimelineShellMeta(input: TimelineShellMetaInputs): TimelineMeta {
  const { drop, pointer, razor, theme, activeTool } = input;
  return buildTimelineMeta({
    emptyState: { isDragOver: input.isDragOver, onFileDrop: input.hasFileDrop, ...drop },
    container: {
      ref: input.setContainerRef,
      "aria-label": "Timeline track view",
      "data-timeline-element-count": input.elementCount,
      isDragOver: input.isDragOver,
      activeTool,
      shiftHeld: input.shiftHeld,
      accentClass: "ring-1 ring-inset ring-studio-accent/60",
      onMouseMove: razor.updateRazorGuide,
      onMouseLeave: razor.clearRazorGuide,
      style: {
        touchAction: "pan-x pan-y",
        background: theme.shellBackground,
        borderColor: theme.shellBorder,
      },
    },
    viewport: {
      ref: input.setScrollRef,
      tabIndex: -1,
      labelMode: input.labelMode,
      contentOrigin: input.contentOrigin,
      zoomMode: input.zoomMode,
      onScroll: (e) => {
        input.lastScrollLeftRef.current = e.currentTarget.scrollLeft;
        input.recordTimelineScroll(e.currentTarget);
        input.syncScrollViewport(e.currentTarget, true);
      },
      ...input.focusProps,
      ...drop,
      onPointerDown: (e) => {
        if (shouldIgnoreTimelinePointerDown(e.target)) return;
        if (razor.splitAllAtPointer(e)) return;
        pointer.onPointerDown(e);
      },
      onPointerMove: pointer.onPointerMove,
      onPointerUp: pointer.onPointerUp,
      onPointerCancel: pointer.onPointerCancel,
      onLostPointerCapture: pointer.onPointerCancel,
    },
    elementCount: input.elementCount,
    labelColumnWidth: LABEL_COL_W,
    razorGuide:
      activeTool === "razor" && razor.razorGuideX !== null ? (
        <TimelineRazorGuideOverlay x={razor.razorGuideX} />
      ) : null,
  });
}
