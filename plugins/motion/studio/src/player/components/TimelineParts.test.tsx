// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimelineContextValue } from "./TimelineProvider";
import { TimelineContextProvider, useTimelineContext } from "./TimelineProvider";
import { TimelineClipMenu, TimelineLanes, TimelinePlayhead, TimelineRuler } from "./TimelineParts";
import { createHappyDomRootHarness } from "./testRootHarness";

vi.mock("./TimelineRuler", () => ({
  TimelineRuler: () => <div data-testid="timeline-ruler" />,
}));
vi.mock("./TimelineLanes", () => ({
  TimelineLanes: ({ renderClipContent }: { renderClipContent?: unknown }) => {
    const { state } = useTimelineContext();
    return (
      <div data-testid="timeline-clip">
        {state.elements[0]?.id}
        {renderClipContent ? <span data-testid="lane-render-bridge" /> : null}
      </div>
    );
  },
}));

const { mount } = createHappyDomRootHarness();

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Timeline parts composition", () => {
  it("reads a shared provider context when composed without Timeline or Frame", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = mount(host);
    const onSplitElement = vi.fn();
    const element = { id: "clip-a", key: "clip-a", tag: "video", start: 0, duration: 2, track: 0 };
    const value = {
      state: {
        timelineReady: true,
        elements: [element],
        selectedElementId: "clip-a",
        sessionEpoch: 1,
        keyframeCache: new Map(),
        canvas: { isScrubbing: false } as TimelineContextValue["state"]["canvas"],
        overlays: {
          elements: [element],
          elementsRef: { current: [element] },
          theme: {} as TimelineContextValue["state"]["overlays"]["theme"],
          showShortcutHint: false,
          showPopover: false,
          rangeSelection: null,
          setShowPopover: vi.fn(),
          setRangeSelection: vi.fn(),
          kfContextMenu: null,
          setKfContextMenu: vi.fn(),
          onDeleteKeyframe: vi.fn(),
          onDeleteAllKeyframes: vi.fn(),
          onMoveKeyframeToPlayhead: vi.fn(),
          clipContextMenu: { x: 10, y: 10, element, sessionEpoch: 1 },
          setClipContextMenu: vi.fn(),
          currentTime: 1,
          onSplitElement,
          pinZoomBeforeEdit: vi.fn(),
          gapContextMenu: null,
          onDismissGapContextMenu: vi.fn(),
          onCloseTrackGap: vi.fn(),
          onCloseAllTrackGaps: vi.fn(),
          onHoverGapAction: vi.fn(),
        },
      },
      actions: {
        renderClipContent: vi.fn(),
        renderClipOverlay: undefined,
        setFocusedEaseSegment: vi.fn(),
      },
      meta: { razorGuide: null } as TimelineContextValue["meta"],
    } satisfies TimelineContextValue;

    try {
      act(() => {
        root.render(
          <TimelineContextProvider value={value}>
            <TimelineRuler />
            <TimelineLanes />
            <TimelinePlayhead />
            <TimelineClipMenu />
          </TimelineContextProvider>,
        );
      });

      expect(host.querySelector("[data-testid='timeline-ruler']")).not.toBeNull();
      expect(host.querySelector("[data-testid='timeline-clip']")?.textContent).toBe("clip-a");
      expect(host.querySelector("[data-testid='lane-render-bridge']")).not.toBeNull();
      expect(document.querySelector("[role='menu'][aria-label='Clip actions']")).not.toBeNull();
    } finally {
      act(() => root.unmount());
    }
  });
});
