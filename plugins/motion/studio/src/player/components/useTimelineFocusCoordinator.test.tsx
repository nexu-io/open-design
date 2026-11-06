// @vitest-environment happy-dom

import React, { act, useMemo, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../store/playerStore";
import { createTimelineRowGeometry } from "./timelineLayout";
import type { TimelineLogicalRow } from "./timelineKeyboardNavigation";
import { timelineClipFocusId, timelineTrackRowId } from "./timelineNavigationIdentity";
import { useTimelineFocusCoordinator } from "./useTimelineFocusCoordinator";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const element = { id: "hero", tag: "div", start: 20, duration: 2, track: 1 };
const elements = [element];
const syncScrollViewport = () => {};
const clipId = timelineClipFocusId("hero");
const rowId = timelineTrackRowId(1);
const rows: readonly TimelineLogicalRow[] = [
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

function Harness({
  mountedId,
  logicalRows = rows,
  projectId = "project-a",
  lastScrollLeftRef: sharedLastScrollLeftRef,
}: {
  mountedId?: string;
  logicalRows?: readonly TimelineLogicalRow[];
  projectId?: string;
  lastScrollLeftRef?: React.RefObject<number>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const ownLastScrollLeftRef = useRef(0);
  const lastScrollLeftRef = sharedLastScrollLeftRef ?? ownLastScrollLeftRef;
  const rowGeometry = useMemo(() => {
    const rowKeys = [...new Set(logicalRows.map((row) => row.physicalTrackKey))];
    return createTimelineRowGeometry(
      rowKeys,
      rowKeys.map(() => 48),
    );
  }, [logicalRows]);
  const focus = useTimelineFocusCoordinator({
    scrollRef,
    logicalRows,
    elements,
    rowGeometry,
    pixelsPerSecond: 100,
    contentOrigin: 32,
    allowHorizontal: true,
    viewportVersion: mountedId,
    projectId,
    sessionEpoch: 1,
    syncScrollViewport,
    lastScrollLeftRef,
  });
  return (
    <div
      ref={(node) => {
        scrollRef.current = node;
        if (node) {
          Object.defineProperty(node, "clientWidth", { configurable: true, value: 300 });
          Object.defineProperty(node, "clientHeight", { configurable: true, value: 100 });
        }
      }}
      data-focus={`${focus.focusedRowKey}:${focus.pinnedElementId}`}
    >
      {mountedId && <div data-timeline-focus-id={mountedId} tabIndex={-1} />}
    </div>
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

describe("useTimelineFocusCoordinator", () => {
  it("pins and scrolls from model coordinates until mount, then permits repeat reveal", async () => {
    usePlayerStore.getState().requestTimelineFocus(clipId);
    await act(async () => root.render(<Harness />));
    const scroll = host.firstElementChild as HTMLDivElement;
    expect(scroll.scrollLeft).toBe(1_944);
    expect(scroll.dataset.focus).toBe("1:hero");
    expect(usePlayerStore.getState().timelineFocus?.id).toBe(clipId);

    await act(async () => root.render(<Harness mountedId={clipId} />));
    const firstNonce = usePlayerStore.getState().timelineFocus?.nonce;
    expect(usePlayerStore.getState().timelineFocus?.id).toBe(clipId);
    expect(document.activeElement?.getAttribute("data-timeline-focus-id")).toBe(clipId);

    scroll.scrollLeft = 0;
    await act(async () => usePlayerStore.getState().requestTimelineFocus(clipId));
    await act(async () => root.render(<Harness mountedId={clipId} />));
    expect(scroll.scrollLeft).toBe(1_944);
    expect(usePlayerStore.getState().timelineFocus?.nonce).toBe((firstNonce ?? 0) + 1);
  });

  it("focuses the latest request when it replaces an unmounted request", async () => {
    usePlayerStore.getState().requestTimelineFocus(rowId);
    usePlayerStore.getState().requestTimelineFocus(clipId);

    await act(async () => root.render(<Harness mountedId={clipId} />));
    expect(document.activeElement?.getAttribute("data-timeline-focus-id")).toBe(clipId);
  });

  it("does not retry an unchanged unmounted target on an unrelated render", async () => {
    usePlayerStore.getState().requestTimelineFocus(clipId);
    await act(async () => root.render(<Harness />));
    const scroll = host.firstElementChild as HTMLDivElement;
    const querySelector = vi.spyOn(scroll, "querySelector");

    await act(async () => root.render(<Harness />));

    expect(querySelector).not.toHaveBeenCalled();
  });

  it("ignores stale scope and never queries outside its own viewport", async () => {
    usePlayerStore.getState().requestTimelineFocus(clipId);
    await act(async () => root.render(<Harness mountedId={clipId} projectId="project-b" />));
    expect(document.activeElement).not.toBe(host.querySelector("[data-timeline-focus-id]"));
    expect(usePlayerStore.getState().timelineFocus?.id).toBe(clipId);

    const externalTarget = document.createElement("div");
    externalTarget.dataset.timelineFocusId = clipId;
    externalTarget.tabIndex = -1;
    document.body.append(externalTarget);
    await act(async () => root.render(<Harness />));
    expect(document.activeElement).not.toBe(externalTarget);
  });

  it("persists a deterministic parent-row fallback when a focused clip disappears", async () => {
    usePlayerStore.getState().requestTimelineFocus(clipId);
    await act(async () => root.render(<Harness />));

    const collapsedRows: readonly TimelineLogicalRow[] = [{ ...rows[0]!, items: [] }];
    await act(async () => root.render(<Harness logicalRows={collapsedRows} mountedId={rowId} />));
    expect(usePlayerStore.getState().timelineFocus?.id).toBe(rowId);
    expect(document.activeElement?.getAttribute("data-timeline-focus-id")).toBe(rowId);
  });

  it("persists the next surviving row when both a clip and its parent track disappear", async () => {
    const nextRowId = timelineTrackRowId(2);
    const nextRow: TimelineLogicalRow = {
      ...rows[0]!,
      id: nextRowId,
      physicalTrackKey: 2,
      items: [],
    };
    usePlayerStore.getState().requestTimelineFocus(clipId);
    await act(async () => root.render(<Harness logicalRows={[...rows, nextRow]} />));

    await act(async () => root.render(<Harness logicalRows={[nextRow]} mountedId={nextRowId} />));

    expect(usePlayerStore.getState().timelineFocus?.id).toBe(nextRowId);
    expect(document.activeElement?.getAttribute("data-timeline-focus-id")).toBe(nextRowId);
  });

  it("keeps a request alive across a few renders where its target hasn't landed yet", async () => {
    // A request issued the same tick as its own element's creation (a fresh
    // drop) can race logicalRows by a render or two; it must not be dropped
    // before the element actually appears.
    usePlayerStore.getState().requestTimelineFocus(clipId);
    for (let attempt = 0; attempt < 2; attempt++) {
      const notYetRows: readonly TimelineLogicalRow[] = [{ ...rows[0]!, items: [] }];
      await act(async () => root.render(<Harness logicalRows={notYetRows} />));
    }
    expect(usePlayerStore.getState().timelineFocus?.id).toBe(clipId);

    await act(async () => root.render(<Harness logicalRows={rows} mountedId={clipId} />));
    expect(usePlayerStore.getState().timelineFocus?.id).toBe(clipId);
    expect(document.activeElement?.getAttribute("data-timeline-focus-id")).toBe(clipId);
  });

  it("gives up once a target never lands after its retry budget", async () => {
    usePlayerStore.getState().requestTimelineFocus(clipId);
    for (let attempt = 0; attempt < 6; attempt++) {
      // A fresh array reference each render, like a real re-render caused by
      // unrelated state, or the memoized resolution never recomputes at all.
      const neverRows: readonly TimelineLogicalRow[] = [{ ...rows[0]!, items: [] }];
      await act(async () => root.render(<Harness logicalRows={neverRows} />));
    }
    expect(usePlayerStore.getState().timelineFocus).toBeNull();
  });

  it("clears an unresolved request on a timeout even if nothing else ever re-renders", async () => {
    // The render-count retry budget can't advance without a rerun; if the
    // target never lands and nothing else re-renders, only a wall-time
    // backstop clears it — otherwise it sits forever, eligible to resolve
    // against an unrelated element that later reuses its id.
    vi.useFakeTimers();
    try {
      usePlayerStore.getState().requestTimelineFocus(clipId);
      const neverRows: readonly TimelineLogicalRow[] = [{ ...rows[0]!, items: [] }];
      await act(async () => root.render(<Harness logicalRows={neverRows} />));
      expect(usePlayerStore.getState().timelineFocus?.id).toBe(clipId);

      await act(async () => {
        vi.advanceTimersByTime(4001);
      });

      expect(usePlayerStore.getState().timelineFocus).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps lastScrollLeftRef in sync with a reveal so a sibling restore effect doesn't undo it", async () => {
    // Timeline.tsx's own "restore scroll after an edit re-derives the elements"
    // effect reads this ref to decide what to scroll back to. A reveal that
    // doesn't update it looks, to that effect, like scroll drift to undo.
    const lastScrollLeftRef = { current: 999 };
    usePlayerStore.getState().requestTimelineFocus(clipId);
    await act(async () => root.render(<Harness lastScrollLeftRef={lastScrollLeftRef} />));
    const scroll = host.firstElementChild as HTMLDivElement;

    expect(lastScrollLeftRef.current).toBe(scroll.scrollLeft);
  });
});
