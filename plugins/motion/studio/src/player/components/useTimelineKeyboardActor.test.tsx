// @vitest-environment happy-dom

import React, { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { createTimelineRowGeometry } from "./timelineLayout";
import type { TimelineLogicalRow } from "./timelineKeyboardNavigation";
import { useTimelineKeyboardActor } from "./useTimelineKeyboardActor";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const rows: readonly TimelineLogicalRow[] = [
  {
    id: "track-1",
    kind: "row",
    physicalTrackKey: 1,
    logicalIndex: 0,
    level: 1,
    parentId: null,
    elementId: "clip-1",
    expandable: true,
    expanded: false,
    items: [{ id: "clip-1", kind: "clip", rowId: "track-1", elementId: "clip-1", time: 1 }],
  },
  {
    id: "track-2",
    kind: "row",
    physicalTrackKey: 2,
    logicalIndex: 1,
    level: 1,
    parentId: null,
    elementId: "clip-2",
    expandable: false,
    expanded: false,
    items: [{ id: "clip-2", kind: "clip", rowId: "track-2", elementId: "clip-2", time: 2 }],
  },
  {
    id: "track-3",
    kind: "row",
    physicalTrackKey: 3,
    logicalIndex: 2,
    level: 1,
    parentId: null,
    elementId: null,
    expandable: false,
    expanded: false,
    items: [],
  },
];

interface HarnessProps {
  focusedTargetId?: string | null;
  logicalRows?: readonly TimelineLogicalRow[];
  rowHeights?: readonly number[];
  onToggleRow?: (target: TimelineLogicalRow) => void;
  onDrillDown?: (element: TimelineElement) => void;
}

function Harness({
  focusedTargetId = null,
  logicalRows = rows,
  rowHeights = logicalRows.map(() => 48),
  onToggleRow = vi.fn(),
  onDrillDown,
}: HarnessProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const keyboard = useTimelineKeyboardActor({
    logicalRows,
    focusedTargetId,
    rowGeometry: createTimelineRowGeometry(
      [...new Set(logicalRows.map((row) => row.physicalTrackKey))],
      rowHeights,
    ),
    scrollRef,
    onToggleRow,
    onDrillDown,
  });
  return (
    <div ref={scrollRef} onFocus={keyboard.onFocus} onKeyDown={keyboard.onKeyDown}>
      {logicalRows
        .flatMap((row) => [row, ...row.items])
        .map((target) =>
          target.kind === "row" ? (
            <div
              key={target.id}
              data-timeline-focus-id={target.id}
              tabIndex={target.id === keyboard.rovingTargetId ? 0 : -1}
            >
              {target.id}
              <button data-native-control={target.id} type="button">
                Action
              </button>
            </div>
          ) : (
            <button
              key={target.id}
              data-timeline-focus-id={target.id}
              tabIndex={target.id === keyboard.rovingTargetId ? 0 : -1}
            >
              {target.id}
            </button>
          ),
        )}
    </div>
  );
}

function renderHarness(props: React.ComponentProps<typeof Harness> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<Harness {...props} />));
  return { host, root };
}

function key(target: Element, value: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: value,
    ...init,
  });
  act(() => target.dispatchEvent(event));
  return event;
}

afterEach(() => {
  document.body.innerHTML = "";
  usePlayerStore.setState({ timelineFocus: null, timelineFocusNonce: 0 });
});

describe("useTimelineKeyboardActor", () => {
  it("exposes exactly one roving target and persists focused logical identity", () => {
    const { host, root } = renderHarness({ focusedTargetId: "clip-2" });
    expect(host.querySelectorAll('[data-timeline-focus-id][tabindex="0"]')).toHaveLength(1);
    expect(host.querySelectorAll("[data-native-control]")).toHaveLength(3);
    expect(
      [...host.querySelectorAll<HTMLElement>("[data-native-control]")].every(
        (el) => el.tabIndex === 0,
      ),
    ).toBe(true);
    const target = host.querySelector<HTMLElement>('[data-timeline-focus-id="track-3"]')!;
    act(() => target.focus());
    expect(usePlayerStore.getState().timelineFocus?.id).toBe("track-3");
    act(() => root.unmount());
  });

  it("requests navigation focus without clicking or seeking", () => {
    const { host, root } = renderHarness({ focusedTargetId: "clip-1" });
    const target = host.querySelector<HTMLElement>('[data-timeline-focus-id="clip-1"]')!;
    const click = vi.fn();
    target.addEventListener("click", click);
    const event = key(target, "ArrowDown");
    expect(event.defaultPrevented).toBe(true);
    expect(usePlayerStore.getState().timelineFocus?.id).toBe("clip-2");
    expect(usePlayerStore.getState().requestedSeekTime).toBeNull();
    expect(click).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("supports modified timeline boundaries and viewport-sized paging", () => {
    const { host, root } = renderHarness({ focusedTargetId: "clip-2" });
    const viewport = host.firstElementChild as HTMLDivElement;
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 48 });
    const target = host.querySelector<HTMLElement>('[data-timeline-focus-id="clip-2"]')!;
    key(target, "End", { metaKey: true });
    expect(usePlayerStore.getState().timelineFocus?.id).toBe("track-3");
    key(target, "PageUp");
    expect(usePlayerStore.getState().timelineFocus?.id).toBe("clip-1");
    act(() => root.unmount());
  });

  it("sizes paging around off-screen focus instead of the current viewport", () => {
    const logicalRows: readonly TimelineLogicalRow[] = [
      rows[0]!,
      {
        ...rows[0]!,
        id: "property-1",
        logicalIndex: 1,
        level: 2,
        parentId: "track-1",
        expandable: false,
        items: [],
      },
      {
        ...rows[0]!,
        id: "property-2",
        logicalIndex: 2,
        level: 2,
        parentId: "track-1",
        expandable: false,
        items: [],
      },
      { ...rows[1]!, logicalIndex: 3 },
      { ...rows[2]!, logicalIndex: 4 },
    ];
    const { host, root } = renderHarness({
      focusedTargetId: "track-3",
      logicalRows,
      rowHeights: [104, 48, 48],
    });
    const viewport = host.firstElementChild as HTMLDivElement;
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 47 });
    const target = host.querySelector<HTMLElement>('[data-timeline-focus-id="track-3"]')!;
    key(target, "PageUp");
    expect(usePlayerStore.getState().timelineFocus?.id).toBe("track-2");
    act(() => root.unmount());
  });

  it("supports APG disclosure arrows plus Enter and Space", () => {
    const onToggleRow = vi.fn();
    const { host, root } = renderHarness({ focusedTargetId: "track-1", onToggleRow });
    const row = host.querySelector<HTMLElement>('[data-timeline-focus-id="track-1"]')!;
    const clip = host.querySelector<HTMLElement>('[data-timeline-focus-id="clip-1"]')!;
    const nativeClick = vi.fn();
    clip.addEventListener("click", nativeClick);
    expect(key(row, "ArrowRight").defaultPrevented).toBe(true);
    expect(onToggleRow).toHaveBeenCalledWith(rows[0]);
    expect(key(row, " ").defaultPrevented).toBe(true);
    expect(onToggleRow).toHaveBeenCalledWith(rows[0]);
    const enter = key(clip, "Enter");
    expect(enter.defaultPrevented).toBe(false);
    // dispatchEvent does not synthesize a browser default action, so model it explicitly.
    if (!enter.defaultPrevented) act(() => clip.click());
    expect(nativeClick).toHaveBeenCalledOnce();
    expect(onToggleRow).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });

  it("drills into a composition clip on Enter and leaves a plain clip alone", () => {
    const scene = { id: "scene", tag: "div", start: 0, duration: 2, track: 1 };
    const withElements = rows.map((row, index) => ({
      ...row,
      items: row.items.map((item) => ({
        ...item,
        element: index === 0 ? { ...scene, compositionSrc: "scene.html" } : scene,
      })),
    }));
    const onDrillDown = vi.fn();
    const { host, root } = renderHarness({ logicalRows: withElements, onDrillDown });
    const composition = host.querySelector<HTMLElement>('[data-timeline-focus-id="clip-1"]')!;
    const plain = host.querySelector<HTMLElement>('[data-timeline-focus-id="clip-2"]')!;
    expect(key(plain, "Enter").defaultPrevented).toBe(false);
    expect(onDrillDown).not.toHaveBeenCalled();
    expect(key(composition, "Enter").defaultPrevented).toBe(true);
    expect(onDrillDown).toHaveBeenCalledWith(withElements[0]!.items[0]!.element);
    act(() => root.unmount());
  });

  it("collapses expanded rows and leaves native header controls to the browser", () => {
    const onToggleRow = vi.fn();
    const expandedRows = [{ ...rows[0]!, expanded: true }, ...rows.slice(1)];
    const { host, root } = renderHarness({
      focusedTargetId: "track-1",
      logicalRows: expandedRows,
      onToggleRow,
    });
    const row = host.querySelector<HTMLElement>('[data-timeline-focus-id="track-1"]')!;
    expect(key(row, "ArrowLeft").defaultPrevented).toBe(true);
    expect(onToggleRow).toHaveBeenCalledWith(expandedRows[0]);

    usePlayerStore.setState({ timelineFocus: null, timelineFocusNonce: 0 });
    const control = host.querySelector<HTMLElement>('[data-native-control="track-1"]')!;
    const nativeClick = vi.fn();
    control.addEventListener("click", nativeClick);
    act(() => control.focus());
    expect(usePlayerStore.getState().timelineFocus).toBeNull();
    const enter = key(control, "Enter");
    expect(enter.defaultPrevented).toBe(false);
    // dispatchEvent does not synthesize a browser default action, so model it explicitly.
    if (!enter.defaultPrevented) act(() => control.click());
    expect(nativeClick).toHaveBeenCalledOnce();
    expect(onToggleRow).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("dispatches the existing scoped context-menu callback", () => {
    const { host, root } = renderHarness({ focusedTargetId: "clip-1" });
    const target = host.querySelector<HTMLElement>('[data-timeline-focus-id="clip-1"]')!;
    const context = vi.fn((event: Event) => event.preventDefault());
    target.addEventListener("contextmenu", context);
    key(target, "F10", { shiftKey: true });
    expect(context).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});
