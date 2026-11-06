// @vitest-environment happy-dom
import { act, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import { usePlayerStore } from "../store/playerStore";
import { type KeyframeDiamondContextMenuState } from "./KeyframeDiamondContextMenu";
import { TimelineOverlays, resolveTimelineContextElement } from "./TimelineOverlays";
import {
  TimelineContextProvider,
  type TimelineContextValue,
  type TimelineOverlaysState,
} from "./TimelineProvider";
import { defaultTimelineTheme } from "./timelineTheme";
import { createHappyDomRootHarness } from "./testRootHarness";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { mount } = createHappyDomRootHarness();
afterEach(() => {
  usePlayerStore.setState({ selectedElementId: null, timelineSessionEpoch: 0 });
});

const captured: TimelineElement = {
  id: "child",
  key: "parent::child",
  tag: "div",
  start: 1,
  duration: 2,
  track: 3,
};

describe("resolveTimelineContextElement", () => {
  it("returns the current expanded model instead of the captured snapshot", () => {
    const current = { ...captured, start: 4, track: 7 };

    expect(
      resolveTimelineContextElement({
        capturedElement: captured,
        targetSessionEpoch: 2,
        sessionEpoch: 2,
        selectedElementId: "parent::child",
        elements: [current],
      }),
    ).toBe(current);
  });

  it("resolves synthetic expanded children that are absent from raw store elements", () => {
    expect(
      resolveTimelineContextElement({
        capturedElement: captured,
        targetSessionEpoch: 2,
        sessionEpoch: 2,
        selectedElementId: "parent::child",
        elements: [captured],
      }),
    ).toBe(captured);
  });

  it("rejects stale sessions, changed selection, and removed elements", () => {
    const input = {
      capturedElement: captured,
      targetSessionEpoch: 2,
      sessionEpoch: 2,
      selectedElementId: "parent::child",
      elements: [captured],
    };

    expect(resolveTimelineContextElement({ ...input, sessionEpoch: 3 })).toBeNull();
    expect(resolveTimelineContextElement({ ...input, selectedElementId: "other" })).toBeNull();
    expect(resolveTimelineContextElement({ ...input, elements: [] })).toBeNull();
  });
});

function renderOverlay(options: {
  capturedElement: TimelineElement;
  currentElement: TimelineElement;
  setKfContextMenu?: ReturnType<typeof vi.fn>;
  onDeleteAllKeyframes?: ReturnType<typeof vi.fn>;
  overlays?: Partial<TimelineOverlaysState>;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = mount(container);
  const elements = [options.currentElement];
  const setKfContextMenu = options.setKfContextMenu ?? vi.fn();
  const onDeleteAllKeyframes = options.onDeleteAllKeyframes ?? vi.fn();
  const menu: KeyframeDiamondContextMenuState = {
    x: 10,
    y: 10,
    sessionEpoch: 2,
    element: options.capturedElement,
    elementId: options.capturedElement.key ?? options.capturedElement.id,
    percentage: 50,
    animationId: "child-position",
  };
  const overlays = {
    elements,
    elementsRef: { current: elements },
    theme: defaultTimelineTheme,
    showShortcutHint: false,
    showPopover: false,
    rangeSelection: null,
    setShowPopover: vi.fn(),
    setRangeSelection: vi.fn(),
    kfContextMenu: menu,
    setKfContextMenu,
    onDeleteKeyframe: vi.fn(),
    onDeleteAllKeyframes,
    onMoveKeyframeToPlayhead: vi.fn(),
    clipContextMenu: null,
    setClipContextMenu: vi.fn(),
    currentTime: 0,
    onSplitElement: vi.fn(),
    pinZoomBeforeEdit: vi.fn(),
    onDeleteElement: vi.fn(),
    gapContextMenu: null,
    onDismissGapContextMenu: vi.fn(),
    onCloseTrackGap: vi.fn(),
    onCloseAllTrackGaps: vi.fn(),
    onHoverGapAction: vi.fn(),
    ...options.overlays,
  } satisfies TimelineOverlaysState;
  const contextValue = {
    state: {
      timelineReady: true,
      elements,
      selectedElementId: null,
      sessionEpoch: 0,
      keyframeCache: new Map(),
      canvas: {} as TimelineContextValue["state"]["canvas"],
      overlays,
    },
    actions: {
      renderClipContent: undefined,
      renderClipOverlay: undefined,
      setFocusedEaseSegment: vi.fn(),
    },
    meta: {} as TimelineContextValue["meta"],
  } satisfies TimelineContextValue;

  function TestTimelineContext({ value }: { value: TimelineContextValue }) {
    const selectedElementId = usePlayerStore((state) => state.selectedElementId);
    const sessionEpoch = usePlayerStore((state) => state.timelineSessionEpoch);
    return createElement(
      TimelineContextProvider,
      {
        value: {
          ...value,
          state: { ...value.state, selectedElementId, sessionEpoch },
        },
      },
      createElement(TimelineOverlays),
    );
  }

  const render = () =>
    root.render(
      createElement(TestTimelineContext, { value: contextValue }, createElement(TimelineOverlays)),
    );
  act(() => {
    usePlayerStore.setState({
      selectedElementId: options.capturedElement.key ?? options.capturedElement.id,
      timelineSessionEpoch: 2,
    });
    render();
  });
  return { setKfContextMenu, onDeleteAllKeyframes, rerender: () => act(render) };
}

describe("TimelineOverlays context lifecycle", () => {
  it("dismisses a keyframe menu when its selected target becomes stale", () => {
    const setKfContextMenu = vi.fn();
    renderOverlay({
      capturedElement: captured,
      currentElement: captured,
      setKfContextMenu,
    });

    act(() => usePlayerStore.setState({ selectedElementId: "other" }));

    expect(setKfContextMenu).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("dispatches a menu action with the current model element", () => {
    const current = { ...captured, start: 4, track: 7 };
    const onDeleteAllKeyframes = vi.fn();
    renderOverlay({
      capturedElement: captured,
      currentElement: current,
      onDeleteAllKeyframes,
    });
    const button = Array.from(document.body.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Delete All Keyframes",
    );

    act(() => button?.click());

    expect(onDeleteAllKeyframes).toHaveBeenCalledExactlyOnceWith(current, "child-position");
  });

  it("builds the host's clip menu items once for the current model element and lists them first", () => {
    const current = { ...captured, start: 4, track: 7 };
    const clipMenuItems = vi.fn(() => [{ id: "ask", label: "Ask", onSelect: vi.fn() }]);
    const { rerender } = renderOverlay({
      capturedElement: captured,
      currentElement: current,
      overlays: {
        kfContextMenu: null,
        clipContextMenu: { x: 10, y: 10, sessionEpoch: 2, element: captured },
        clipMenuItems,
      },
    });

    rerender();

    expect(clipMenuItems).toHaveBeenCalledExactlyOnceWith(current);
    expect(document.body.querySelector('[role="menuitem"]')?.textContent).toBe("Ask");
  });

  it("hints Split in the clip menu with the host's key", () => {
    const video = { ...captured, domId: "child", tag: "video" };
    renderOverlay({
      capturedElement: video,
      currentElement: video,
      overlays: {
        kfContextMenu: null,
        clipContextMenu: { x: 10, y: 10, sessionEpoch: 2, element: video },
        currentTime: 2,
        splitShortcut: "⌥S",
      },
    });
    const rows = [...document.body.querySelectorAll('[role="menuitem"]')].map(
      (row) => row.textContent,
    );
    expect(rows).toContain("Split at 2.00s⌥S");
  });
});
