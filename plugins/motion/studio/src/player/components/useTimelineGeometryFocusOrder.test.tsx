// @vitest-environment happy-dom

import React, { act, useMemo, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usePlayerStore } from "../store/playerStore";
import { createTimelineRowGeometry } from "./timelineLayout";
import type { TimelineLogicalRow } from "./timelineKeyboardNavigation";
import { timelineClipFocusId, timelineTrackRowId } from "./timelineNavigationIdentity";
import { useTimelineFocusCoordinator } from "./useTimelineFocusCoordinator";
import { useTimelineGeometry } from "./useTimelineGeometry";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

const oldElement = { id: "old", tag: "div", start: 0, duration: 1, track: 1 };
const heroElement = { id: "hero", tag: "div", start: 20, duration: 2, track: 1 };
const clipId = timelineClipFocusId("hero");
const rowId = timelineTrackRowId(1);
const beforeRows: readonly TimelineLogicalRow[] = [
  {
    id: rowId,
    kind: "row",
    physicalTrackKey: 1,
    logicalIndex: 0,
    level: 1,
    parentId: null,
    elementId: null,
    expandable: false,
    expanded: false,
    items: [],
  },
];
const afterRows: readonly TimelineLogicalRow[] = [
  {
    id: rowId,
    kind: "row",
    physicalTrackKey: 1,
    logicalIndex: 0,
    level: 1,
    parentId: null,
    elementId: null,
    expandable: false,
    expanded: false,
    items: [{ id: clipId, kind: "clip", rowId, elementId: "hero", time: 21 }],
  },
];

// Renders the two real production hooks side by side, in a caller-chosen call
// order, to test whether their interaction actually depends on that order —
// as opposed to simulating one hook's effect by hand.
function OrderHarness({
  order,
  expandedElements,
  logicalRows,
  lastScrollLeftRef,
}: {
  order: "geometry-first" | "coordinator-first";
  expandedElements: (typeof oldElement)[];
  logicalRows: readonly TimelineLogicalRow[];
  lastScrollLeftRef: React.RefObject<number>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const ppsRef = useRef(0);
  const fitPpsRef = useRef(0);
  const rowGeometry = useMemo(() => createTimelineRowGeometry([1], [48]), []);

  const runGeometry = () =>
    useTimelineGeometry({
      viewportWidth: 300,
      effectiveDuration: 60,
      zoomMode: "manual",
      manualZoomPercent: 100,
      ppsRef,
      fitPpsRef,
      draggedClip: null,
      resizingClip: null,
      expandedElements,
      isDragging,
      scrollRef,
      lastScrollLeftRef,
      contentOrigin: 32,
    });
  const runFocus = () =>
    useTimelineFocusCoordinator({
      scrollRef,
      logicalRows,
      elements: expandedElements,
      rowGeometry,
      pixelsPerSecond: 100,
      contentOrigin: 32,
      allowHorizontal: true,
      viewportVersion: logicalRows.length,
      projectId: "project-a",
      sessionEpoch: 1,
      syncScrollViewport: () => {},
      lastScrollLeftRef,
    });

  // `order` is fixed for the lifetime of one mounted harness, so this call
  // order is stable across that instance's renders.
  if (order === "geometry-first") {
    runGeometry();
    runFocus();
  } else {
    runFocus();
    runGeometry();
  }

  return (
    <div
      ref={(node) => {
        scrollRef.current = node;
        if (node) {
          Object.defineProperty(node, "clientWidth", { configurable: true, value: 300 });
          Object.defineProperty(node, "clientHeight", { configurable: true, value: 100 });
          Object.defineProperty(node, "scrollWidth", { configurable: true, value: 20_000 });
        }
      }}
    />
  );
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  usePlayerStore.setState({ timelineProjectId: "project-a", timelineSessionEpoch: 1 });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  usePlayerStore.getState().reset();
  document.body.replaceChildren();
});

describe.each(["geometry-first", "coordinator-first"] as const)(
  "useTimelineGeometry + useTimelineFocusCoordinator, %s",
  (order) => {
    it("a same-commit reveal survives the geometry restore effect regardless of hook registration order", async () => {
      const lastScrollLeftRef = { current: 132 };
      await act(async () => {
        root.render(
          <OrderHarness
            order={order}
            expandedElements={[oldElement]}
            logicalRows={beforeRows}
            lastScrollLeftRef={lastScrollLeftRef}
          />,
        );
      });
      const scroll = host.firstElementChild as HTMLDivElement;
      scroll.scrollLeft = 132;
      await act(async () => {
        await nextFrame();
      });
      expect(scroll.scrollLeft).toBe(132);

      // One commit: the drop both adds the element (expandedElements changes,
      // arming the geometry restore effect) and resolves the focus request
      // (arming the coordinator's reveal), exactly as Timeline.tsx renders them.
      usePlayerStore.getState().requestTimelineFocus(clipId);
      await act(async () => {
        root.render(
          <OrderHarness
            order={order}
            expandedElements={[oldElement, heroElement]}
            logicalRows={afterRows}
            lastScrollLeftRef={lastScrollLeftRef}
          />,
        );
      });
      await act(async () => {
        await nextFrame();
      });

      expect(scroll.scrollLeft).toBe(1_944);
      expect(lastScrollLeftRef.current).toBe(1_944);
    });
  },
);
