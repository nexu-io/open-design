// @vitest-environment happy-dom

import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineLanes } from "./TimelineLanes";
import { getTrackStyle } from "./timelineIcons";
import { defaultTimelineTheme } from "./timelineTheme";
import { TRACK_H, getTimelineRowGeometry } from "./timelineLayout";
import { createTimelineClipIndex } from "../lib/timelineClipIndex";
import { buildTimelineLogicalRows } from "./timelineKeyboardNavigation";
import {
  usePlayerStore,
  type KeyframeCacheEntry,
  type TimelineElement,
} from "../store/playerStore";
import type { MultiDragPreviewInput } from "./timelineMultiDragPreview";
import type { TimelineEditCallbacks } from "./timelineCallbacks";
import type { DraggedClipState, BlockedClipState } from "./useTimelineClipDrag";
import * as transitionSeams from "./timelineTransitionSeams";

vi.mock("./timelineTransitionSeams", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./timelineTransitionSeams")>();
  return {
    ...actual,
    deriveTimelineTransitionSeams: vi.fn(actual.deriveTimelineTransitionSeams),
    deriveTimelineTransitionSeamsByTrack: vi.fn(actual.deriveTimelineTransitionSeamsByTrack),
  };
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  usePlayerStore.getState().reset();
});

/** The z-order sort keys really are fractional: a clip nudged between two lanes
 *  lands on the midpoint. These are the values that used to reach aria-label. */
const TRACK_A = 1 / 6;
const TRACK_B = 0.5;

/** Every string a screen reader or a sighted user actually reads. */
function visibleText(host: HTMLElement): string {
  return host.textContent ?? "";
}

function ariaLabels(host: HTMLElement): string {
  return Array.from(host.querySelectorAll("[aria-label]"))
    .map((el) => el.getAttribute("aria-label") ?? "")
    .join(" ");
}

function element(id: string, track: number): TimelineElement {
  return { id, label: id, tag: "div", start: 0, duration: 2, track };
}

function positionTween(id: string): GsapAnimation {
  return {
    id: `${id}-tween`,
    targetSelector: `#${id}`,
    method: "to",
    position: 0,
    duration: 2,
    properties: {},
    propertyGroup: "position",
    keyframes: {
      format: "percentage",
      keyframes: [
        { percentage: 0, properties: { x: 0 } },
        { percentage: 100, properties: { x: 100 } },
      ],
    },
  };
}

interface RenderLanesOptions {
  elements?: TimelineElement[];
  keyframeCache?: Map<string, KeyframeCacheEntry>;
  animations?: Map<string, GsapAnimation[]>;
  expandedClipIds?: string[];
  selectedElementIds?: Set<string>;
  multiDragPreview?: MultiDragPreviewInput | null;
  draggedClip?: DraggedClipState | null;
  onToggleTrackHidden?: TimelineEditCallbacks["onToggleTrackHidden"];
  onContextMenuLane?: (e: React.MouseEvent, track: number, time: number) => void;
  hoveredClip?: string | null;
  renderClipContent?: React.ComponentProps<typeof TimelineLanes>["renderClipContent"];
  snapGuide?: { time: number; type: "beat" | "clip-edge" | "playhead" } | null;
  withoutSelectHandler?: boolean;
  pps?: number;
}

const lanePps = (options: RenderLanesOptions) => options.pps ?? 100;

const selectHandlerFor = (
  options: RenderLanesOptions,
  handler: (element: TimelineElement | null) => void,
) => (options.withoutSelectHandler ? undefined : handler);

function renderLanes(options: RenderLanesOptions = {}): {
  host: HTMLDivElement;
  root: Root;
  rerender: (next: RenderLanesOptions) => void;
  setSelectedElementId: ReturnType<typeof vi.fn>;
  onSelectElement: ReturnType<typeof vi.fn>;
  onRazorSplit: ReturnType<typeof vi.fn>;
} {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const setSelectedElementId = vi.fn();
  const onSelectElement = vi.fn();
  const onRazorSplit = vi.fn();
  const render = (next: RenderLanesOptions) => {
    const elements = next.elements ?? [element("clip-a", TRACK_A)];
    const gsapAnimations = next.animations ?? new Map<string, GsapAnimation[]>();
    const displayTrackOrder = [...new Set(elements.map((el) => el.track))].sort((a, b) => a - b);
    const tracks: [number, TimelineElement[]][] = displayTrackOrder.map((track) => [
      track,
      elements.filter((el) => el.track === track),
    ]);
    const laneCounts = new Map(
      elements.map((el) => [el.id, (gsapAnimations.get(el.id) ?? []).length]),
    );
    const rowHeights = displayTrackOrder.map(() => TRACK_H);
    act(() => {
      usePlayerStore.setState({ expandedClipIds: new Set(next.expandedClipIds ?? []) });
      root.render(
        <TimelineLanes
          pps={lanePps(next)}
          contentOrigin={232}
          contentGutter={32}
          trackContentWidth={800}
          theme={defaultTimelineTheme}
          displayTrackOrder={displayTrackOrder}
          rowHeights={rowHeights}
          rowGeometry={getTimelineRowGeometry(rowHeights)}
          virtualRows={displayTrackOrder.map((_, index) => ({ index, rowKey: index }))}
          rowsVirtualized={false}
          focusedTargetId={null}
          logicalRows={buildTimelineLogicalRows({
            tracks,
            displayTrackOrder,
            laneCounts,
            selectedElementId: null,
            selectedElementIds: next.selectedElementIds ?? new Set(),
            expandedClipIds: new Set(next.expandedClipIds ?? []),
            collapsedGroupIds: new Set(),
            expandedLaneOwnerIds: new Set(),
            groups: [],
            trackGroupOf: new Map(),
            gsapAnimations,
          })}
          clipIndex={createTimelineClipIndex(tracks)}
          renderTimeRange={{ start: 0, end: Number.POSITIVE_INFINITY }}
          visibleTimeRange={{ start: 0, end: Number.POSITIVE_INFINITY }}
          pinnedClipIdentities={new Set()}
          trackOrder={displayTrackOrder}
          tracks={tracks}
          trackStyles={new Map()}
          groups={[]}
          laneCounts={laneCounts}
          selectedElementId={null}
          selectedElementIds={next.selectedElementIds ?? new Set()}
          hoveredClip={next.hoveredClip ?? null}
          renderClipContent={next.renderClipContent}
          draggedClip={next.draggedClip ?? null}
          draggedElement={null}
          snapGuide={next.snapGuide ?? null}
          multiDragPreview={next.multiDragPreview ?? null}
          blockedClipRef={createRef<BlockedClipState | null>()}
          suppressClickRef={{ current: false }}
          scrollRef={createRef<HTMLDivElement>()}
          setHoveredClip={vi.fn()}
          setShowPopover={vi.fn()}
          setRangeSelection={vi.fn()}
          setResizingClip={vi.fn()}
          setDraggedClip={vi.fn()}
          setSelectedElementId={setSelectedElementId}
          getPreviewElement={(el) => el}
          getTrackStyle={getTrackStyle}
          gsapAnimations={gsapAnimations}
          keyframeCache={next.keyframeCache}
          selectedKeyframes={new Set()}
          currentTime={0}
          onContextMenuLane={next.onContextMenuLane}
          onToggleTrackHidden={next.onToggleTrackHidden}
          onTogglePropertyGroupKeyframe={vi.fn()}
          onResizeElement={vi.fn()}
          onMoveElement={vi.fn()}
          onSelectElement={selectHandlerFor(next, onSelectElement)}
          onRazorSplit={onRazorSplit}
          onRazorSplitAll={vi.fn()}
        />,
      );
    });
  };
  render(options);
  return { host, root, rerender: render, setSelectedElementId, onSelectElement, onRazorSplit };
}

function visibilityLabels(host: HTMLElement): (string | null)[] {
  return Array.from(host.querySelectorAll("button[aria-label^='Hide track ']")).map((button) =>
    button.getAttribute("aria-label"),
  );
}

/** The beat guide's own highlight div, keyed by the green glow every other beat lacks. */
function beatHighlight(host: HTMLElement): HTMLElement | undefined {
  return Array.from(host.querySelectorAll("div")).find((div) =>
    (div.style.boxShadow ?? "").includes("34,197,94"),
  );
}

describe("TimelineLanes beat guide", () => {
  it("draws the beat highlight from snapGuide, not from the stale draggedClip prop", () => {
    const view = renderLanes({
      elements: [element("clip-a", TRACK_A)],
      snapGuide: { time: 1.5, type: "beat" },
    });

    expect(beatHighlight(view.host)?.style.left).toBe("150px");
    act(() => view.root.unmount());
  });

  it("clears the highlight once the trim it belonged to ends", () => {
    const view = renderLanes({
      elements: [element("clip-a", TRACK_A)],
      snapGuide: { time: 1.5, type: "beat" },
    });
    view.rerender({ elements: [element("clip-a", TRACK_A)], snapGuide: null });

    expect(beatHighlight(view.host)).toBeUndefined();
    act(() => view.root.unmount());
  });
});

describe("TimelineLanes track numbering", () => {
  // Screen readers literally announced "Hide track 0.16666666666666666".
  it("numbers tracks contiguously from 1 regardless of the fractional sort keys", () => {
    const view = renderLanes({
      elements: [element("clip-a", TRACK_A), element("clip-b", TRACK_B)],
    });

    expect(visibilityLabels(view.host)).toEqual(["Hide track 1", "Hide track 2"]);
    expect(view.host.querySelectorAll("[data-timeline-row]")).toHaveLength(2);
    // Only what a user reads. The fractional key still identifies the row in
    // `id` / `data-` attributes, which is exactly where an opaque sort key
    // belongs.
    expect(visibleText(view.host)).not.toContain("0.16666666666666666");
    expect(ariaLabels(view.host)).not.toContain("0.16666666666666666");
    act(() => view.root.unmount());
  });

  it("hands the visibility toggle the real track key, not the display index", () => {
    const onToggleTrackHidden = vi.fn();
    const view = renderLanes({
      elements: [element("clip-a", TRACK_A), element("clip-b", TRACK_B)],
      onToggleTrackHidden,
    });

    const second = view.host.querySelector<HTMLButtonElement>('button[aria-label="Hide track 2"]');
    act(() => second?.click());

    // Both, and they are different numbers: the real key acts, the display row
    // is what the undo-history label must announce (see `onToggleTrackHidden`).
    expect(onToggleTrackHidden).toHaveBeenCalledWith(TRACK_B, true, 2);
    act(() => view.root.unmount());
  });

  // The gap menu inserts at the track it is given, so a display index here would
  // drop the new clip on the wrong lane.
  it("hands the lane context menu the real track key, not the display index", () => {
    const onContextMenuLane = vi.fn();
    const view = renderLanes({
      elements: [element("clip-a", TRACK_A), element("clip-b", TRACK_B)],
      onContextMenuLane,
    });

    // The lane's own content cell: the track row's second child, after the
    // sticky header column.
    const secondTrackContent = view.host
      .querySelectorAll("[data-timeline-row]")[1]
      ?.querySelector('[role="row"]')
      ?.children.item(1);
    act(() => {
      secondTrackContent?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 100 }),
      );
    });

    expect(onContextMenuLane).toHaveBeenCalledOnce();
    expect(onContextMenuLane.mock.calls[0]?.[1]).toBe(TRACK_B);
    act(() => view.root.unmount());
  });
});

describe("TimelineLanes disclosure target", () => {
  const ANIMATIONS = new Map([["clip-a", [positionTween("clip-a")]]]);

  /**
   * `aria-controls` is an ID LIST, and the caret needs one: it reveals the
   * active clip's keyframe lanes AND the track's automation lanes, which cannot
   * be one element — one belongs to a clip, the other to the row.
   */
  function ariaControlsIds(host: HTMLElement): string[] {
    const caret = host.querySelector("button[aria-controls]");
    return (caret?.getAttribute("aria-controls") ?? "").split(/\s+/).filter(Boolean);
  }

  function ariaControlsTargets(host: HTMLElement): (HTMLElement | null)[] {
    return ariaControlsIds(host).map((id) => host.querySelector<HTMLElement>(`#${id}`));
  }

  /** The first region named, which is the keyframe lanes. */
  function ariaControlsTarget(host: HTMLElement): HTMLElement | null {
    return ariaControlsTargets(host)[0] ?? null;
  }

  // aria-controls used to name a div in the sticky label column: it computed to
  // 0x0 and held no diamonds at all.
  it("resolves the caret's aria-controls to an element holding the property lanes", () => {
    const view = renderLanes({ animations: ANIMATIONS, expandedClipIds: ["clip-a"] });
    const target = ariaControlsTarget(view.host);

    expect(target).not.toBeNull();
    expect(target?.querySelectorAll("[data-timeline-property-lane]").length).toBeGreaterThan(0);
    // Every region it names has to exist, or the caret points at nothing.
    expect(ariaControlsTargets(view.host).length).toBeGreaterThan(1);
    expect(ariaControlsTargets(view.host).every(Boolean)).toBe(true);
    act(() => view.root.unmount());
  });

  it("still resolves the caret's aria-controls while the layer is collapsed", () => {
    const view = renderLanes({ animations: ANIMATIONS, expandedClipIds: [] });
    const target = ariaControlsTarget(view.host);

    expect(target).not.toBeNull();
    expect(target?.querySelectorAll("[data-timeline-property-lane]")).toHaveLength(0);
    // Including the automation region, which is mounted empty while collapsed
    // for exactly this reason.
    expect(ariaControlsTargets(view.host).every(Boolean)).toBe(true);
    act(() => view.root.unmount());
  });

  // Two timelines on one page (a mini-timeline in a modal beside the main one)
  // both minted `timeline-lanes-track-0`, so every caret's aria-controls
  // resolved to whichever instance mounted first.
  it("mints lane ids that do not collide with a second TimelineLanes on the page", () => {
    const first = renderLanes({ animations: ANIMATIONS, expandedClipIds: ["clip-a"] });
    const second = renderLanes({ animations: ANIMATIONS, expandedClipIds: ["clip-a"] });

    const idsFor = (host: HTMLElement) =>
      Array.from(host.querySelectorAll("button[aria-controls]")).flatMap((caret) =>
        (caret.getAttribute("aria-controls") ?? "").split(/\s+/).filter(Boolean),
      );
    const firstIds = idsFor(first.host);
    const secondIds = idsFor(second.host);
    const cellIdsFor = (host: HTMLElement) =>
      new Set(
        Array.from(host.querySelectorAll<HTMLElement>("[data-property-group][id]"), (cell) =>
          cell.getAttribute("id"),
        ).filter((id): id is string => id !== null),
      );
    const ownedIdsFor = (host: HTMLElement) =>
      Array.from(host.querySelectorAll("[aria-owns]"), (owner) =>
        owner.getAttribute("aria-owns"),
      ).filter((id): id is string => id !== null);
    const firstCellIds = cellIdsFor(first.host);
    const secondCellIds = cellIdsFor(second.host);

    for (const { host } of [first, second]) {
      const treegrid = host.querySelector<HTMLElement>('[role="treegrid"]');
      expect(treegrid?.getAttribute("aria-colcount")).toBe("2");
      expect(treegrid?.hasAttribute("aria-multiselectable")).toBe(false);
      expect(
        [...host.querySelectorAll('[role="rowheader"]')].every(
          (cell) => cell.getAttribute("aria-colindex") === "1",
        ),
      ).toBe(true);
      expect(
        [...host.querySelectorAll('[role="gridcell"]')].every(
          (cell) => cell.getAttribute("aria-colindex") === "2",
        ),
      ).toBe(true);
    }
    expect(firstIds.length).toBeGreaterThan(0);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
    expect(firstCellIds.size).toBeGreaterThan(0);
    expect([...firstCellIds].some((id) => secondCellIds.has(id))).toBe(false);
    expect(ownedIdsFor(first.host).every((id) => firstCellIds.has(id))).toBe(true);
    expect(ownedIdsFor(second.host).every((id) => secondCellIds.has(id))).toBe(true);
    // Still a legal CSS id selector: the aria-controls lookups above use `#id`.
    for (const id of [...firstIds, ...secondIds]) {
      expect(id).toMatch(/^[A-Za-z][\w-]*$/);
    }
    act(() => first.root.unmount());
    act(() => second.root.unmount());
  });

  it("does not remount a clip when it becomes, then stops being, a drag passenger", () => {
    const elements = [element("clip-a", TRACK_A), element("clip-b", TRACK_A)];
    const selectedElementIds = new Set(["clip-a", "clip-b"]);
    const dragging: MultiDragPreviewInput = {
      dragStarted: true,
      draggedKey: "clip-b",
      draggedOriginStart: 0,
      draggedPreviewStart: 0.5,
      selectedKeys: selectedElementIds,
    };
    const keyframeCache = new Map<string, KeyframeCacheEntry>([
      [
        "clip-a",
        {
          format: "percentage",
          keyframes: [
            { percentage: 0, properties: { x: 0 } },
            { percentage: 100, properties: { x: 50 } },
          ],
        },
      ],
    ]);
    const view = renderLanes({ elements, selectedElementIds, keyframeCache });
    const clipA = view.host.querySelector<HTMLElement>('[data-el-id="clip-a"]');
    const diamonds = () =>
      view.host
        .querySelector('[data-el-id="clip-a"] ~ div button[aria-label*="keyframe at"]')
        ?.closest<HTMLElement>("div.pointer-events-none");
    expect(clipA).not.toBeNull();
    expect(clipA?.parentElement).toBe(
      view.host.querySelector('[data-el-id="clip-b"]')?.parentElement,
    );

    expect(diamonds()).not.toBeNull();
    view.rerender({ elements, selectedElementIds, keyframeCache, multiDragPreview: dragging });
    expect(view.host.querySelector('[data-el-id="clip-a"]')).toBe(clipA);
    expect(clipA?.style.transform).toMatch(/^translateX\([1-9]/);
    // Its keyframe diamonds ride with it.
    expect(diamonds()?.style.transform).toBe(clipA?.style.transform);

    view.rerender({ elements, selectedElementIds, keyframeCache });
    expect(view.host.querySelector('[data-el-id="clip-a"]')).toBe(clipA);
    expect(clipA?.style.transform).toBe("");
    act(() => view.root.unmount());
  });

  // A passenger re-renders on every pointer move. An unstable key there remounts
  // the lanes and drops the in-flight drag.
  it("does not remount the lanes while a multi-clip drag slides the formation", () => {
    const elements = [element("clip-a", TRACK_A), element("clip-b", TRACK_A)];
    const selectedElementIds = new Set(["clip-a", "clip-b"]);
    const preview = (draggedPreviewStart: number): MultiDragPreviewInput => ({
      dragStarted: true,
      draggedKey: "clip-b",
      draggedOriginStart: 0,
      draggedPreviewStart,
      selectedKeys: selectedElementIds,
    });
    const view = renderLanes({
      elements,
      animations: ANIMATIONS,
      expandedClipIds: ["clip-a"],
      selectedElementIds,
      multiDragPreview: preview(0.25),
    });

    const before = ariaControlsTarget(view.host);
    const beforeLane = before?.querySelector<HTMLElement>("[data-timeline-property-lane]");
    expect(before).not.toBeNull();
    expect(beforeLane).not.toBeNull();
    const startOffset = beforeLane?.style.transform;
    expect(startOffset).toMatch(/^translateX\([1-9]/);

    view.rerender({
      elements,
      animations: ANIMATIONS,
      expandedClipIds: ["clip-a"],
      selectedElementIds,
      multiDragPreview: preview(0.75),
    });

    // Node identity, not just presence: a remount replaces these nodes.
    expect(ariaControlsTarget(view.host)).toBe(before);
    expect(before?.querySelector("[data-timeline-property-lane]")).toBe(beforeLane);
    // The lanes ride with the formation, not just the clip.
    expect(beforeLane?.style.transform).toMatch(/^translateX\([1-9]/);
    expect(beforeLane?.style.transform).not.toBe(startOffset);
    act(() => view.root.unmount());
  });
});

describe("TimelineLanes selection", () => {
  it("keeps a selected clip selected when it is clicked again", () => {
    const selected = element("clip-a", TRACK_A);
    const view = renderLanes({
      elements: [selected],
      selectedElementIds: new Set([selected.id]),
    });

    act(() => view.host.querySelector<HTMLButtonElement>('[data-el-id="clip-a"]')?.click());

    expect(view.setSelectedElementId).toHaveBeenCalledWith(selected.id);
    expect(view.onSelectElement).toHaveBeenCalledWith(selected);
    act(() => view.root.unmount());
  });

  it.each([["shiftKey"], ["metaKey"], ["ctrlKey"]])(
    "%s-click adds a clip to the selection instead of replacing it",
    (modifier) => {
      const first = element("clip-a", TRACK_A);
      const second = element("clip-b", TRACK_B);
      usePlayerStore.getState().setElements([first, second]);
      usePlayerStore.getState().setSelection([first.id], first.id);
      const view = renderLanes({ elements: [first, second] });
      const clipB = view.host.querySelector('[data-el-id="clip-b"]');
      const click = (init: MouseEventInit) =>
        act(() => clipB?.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init })));

      click({ [modifier]: true });
      expect(usePlayerStore.getState().selectedElementIds).toEqual(new Set(["clip-a", "clip-b"]));
      expect(view.setSelectedElementId).not.toHaveBeenCalled();
      expect(view.onSelectElement).toHaveBeenLastCalledWith(second);

      click({ [modifier]: true });
      expect(usePlayerStore.getState().selectedElementIds).toEqual(new Set(["clip-a"]));
      expect(view.onSelectElement).toHaveBeenLastCalledWith(first);
      act(() => view.root.unmount());
    },
  );
  it("Cmd-click adds a clip in a host that passes no onSelectElement", () => {
    const first = element("clip-a", TRACK_A);
    const second = element("clip-b", TRACK_B);
    usePlayerStore.getState().setElements([first, second]);
    usePlayerStore.getState().setSelection([first.id], first.id);
    const view = renderLanes({ elements: [first, second], withoutSelectHandler: true });
    act(() =>
      view.host
        .querySelector('[data-el-id="clip-b"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true })),
    );
    expect(usePlayerStore.getState().selectedElementIds).toEqual(new Set(["clip-a", "clip-b"]));
    act(() => view.root.unmount());
  });
});

describe("TimelineLanes clip thumbnails", () => {
  it("keeps thumbnail content inside a selected clip", () => {
    const selected = element("clip-a", TRACK_A);
    const view = renderLanes({
      elements: [selected],
      selectedElementIds: new Set([selected.id]),
      renderClipContent: () => <div className="absolute inset-0 bg-neutral-900" data-thumbnail />,
    });

    const clip = view.host.querySelector('[data-el-id="clip-a"]');
    expect(clip?.classList.contains("is-selected")).toBe(true);
    expect(clip?.querySelector("[data-thumbnail]")).not.toBeNull();
    act(() => view.root.unmount());
  });

  it("asks for the same frames at rest, hovered and selected", () => {
    const rich: unknown[] = [];
    const renderClipContent = vi.fn(
      (_el: TimelineElement, _style: unknown, context: { rich: boolean }) => {
        rich.push(context.rich);
        return null;
      },
    );
    const elements = [element("clip-a", TRACK_A)];
    const view = renderLanes({ elements, renderClipContent });
    view.rerender({ elements, renderClipContent, hoveredClip: "clip-a" });
    view.rerender({ elements, renderClipContent, selectedElementIds: new Set(["clip-a"]) });
    expect(new Set(rich)).toEqual(new Set([false]));
    act(() => view.root.unmount());
  });
});

describe("TimelineLanes clip joins", () => {
  const at = (id: string, start: number, duration: number): TimelineElement => ({
    ...element(id, TRACK_A),
    start,
    duration,
  });

  it("draws one row-coloured hairline where clips touch, and leaves the clips where they are", () => {
    const view = renderLanes({
      elements: [at("clip-a", 0, 2), at("clip-b", 2, 1.5), at("clip-c", 4, 1)],
    });

    const joins = view.host.querySelectorAll<HTMLElement>("[data-timeline-clip-join]");
    expect(joins).toHaveLength(1);
    // Both sit in one-second layers 100px wide: 200% is 200px, at the 2 s join.
    const layerWidth = (el: Element | null | undefined) =>
      (el?.closest("[data-timeline-time-layer]") as HTMLElement | null)?.style.width;
    expect(joins[0]?.style.left).toBe("200%");
    expect(layerWidth(joins[0])).toBe("100px");
    expect(joins[0]?.style.width).toBe("1px");
    expect(joins[0]?.style.background).toBe(defaultTimelineTheme.rowBackground);
    const clipB = view.host.querySelector<HTMLElement>('[data-el-id="clip-b"]');
    expect(clipB?.style.left).toBe("200%");
    expect(clipB?.style.width).toBe("150%");
    expect(clipB?.style.minWidth).toBe("4px");
    expect(layerWidth(clipB)).toBe("100px");
    act(() => view.root.unmount());
  });

  it("draws no join while a clip is being moved, since the moved clip is drawn elsewhere", () => {
    const clipA = at("clip-a", 0, 2);
    const view = renderLanes({
      elements: [clipA, at("clip-b", 2, 1.5)],
      draggedClip: { element: clipA, started: true } as DraggedClipState,
    });

    expect(view.host.querySelectorAll("[data-timeline-clip-join]")).toHaveLength(0);
    act(() => view.root.unmount());
  });
});

describe("TimelineLanes transition seams", () => {
  it("derives transition seams once for every row, not once per row", () => {
    const derivations = [
      transitionSeams.deriveTimelineTransitionSeams,
      transitionSeams.deriveTimelineTransitionSeamsByTrack,
    ].map((derive) => vi.mocked(derive));
    for (const derive of derivations) derive.mockClear();

    const view = renderLanes({
      elements: [element("clip-a", 0), element("clip-b", TRACK_A), element("clip-c", TRACK_B)],
    });

    expect(view.host.querySelectorAll("[data-timeline-row]").length).toBeGreaterThanOrEqual(3);
    expect(derivations.reduce((calls, derive) => calls + derive.mock.calls.length, 0)).toBe(1);
    act(() => view.root.unmount());
  });
});

describe("TimelineLanes clips during a zoom", () => {
  afterEach(() => {
    usePlayerStore.setState({ activeTool: "select" });
  });

  it("leaves a clip unrendered by a zoom step that does not change what it draws", () => {
    const renderClipContent = vi.fn(() => null);
    const clip = { ...element("clip-a", TRACK_A), start: 0, duration: 2 };
    const view = renderLanes({ elements: [clip], renderClipContent, pps: 100 });
    const drawn = renderClipContent.mock.calls.length;
    // 200px to 220px: still a labelled clip with handles.
    view.rerender({ elements: [clip], renderClipContent, pps: 110 });
    expect(renderClipContent.mock.calls.length).toBe(drawn);
    // 40px: the clip drops its label, so it draws again.
    view.rerender({ elements: [clip], renderClipContent, pps: 20 });
    expect(renderClipContent.mock.calls.length).toBeGreaterThan(drawn);
    act(() => view.root.unmount());
  });

  it("splits with the razor at the time under the pointer at the current zoom", () => {
    usePlayerStore.setState({ activeTool: "razor" });
    const clip = { ...element("clip-a", TRACK_A), start: 0, duration: 2 };
    const view = renderLanes({ elements: [clip], pps: 100 });
    view.rerender({ elements: [clip], pps: 105 });
    act(() => {
      view.host
        .querySelector('[data-el-id="clip-a"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 105 }));
    });
    expect(view.onRazorSplit).toHaveBeenCalledWith(expect.objectContaining({ id: "clip-a" }), 1);
    act(() => view.root.unmount());
  });
});
