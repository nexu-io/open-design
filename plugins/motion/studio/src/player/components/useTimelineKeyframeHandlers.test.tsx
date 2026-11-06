// @vitest-environment happy-dom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountReactHarness } from "../../hooks/domSelectionTestHarness";
import type { TimelineElement } from "../store/playerStore";
import { usePlayerStore } from "../store/playerStore";
import * as telemetry from "../../telemetry/events";
import type { TimelineKeyframeTarget } from "./timelineKeyframeIdentity";
import { useTimelineKeyframeHandlers } from "./useTimelineKeyframeHandlers";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ELEMENT: TimelineElement = {
  id: "clip-1",
  label: "Hero card",
  tag: "div",
  start: 1,
  duration: 2,
  track: 0,
};

const TARGET: TimelineKeyframeTarget = {
  percentage: 50,
  tweenPercentage: 50,
  propertyGroup: "position",
  animationId: "position-tween",
};

const FLAT_TWEEN_TARGET: TimelineKeyframeTarget = {
  percentage: 100,
  tweenPercentage: 100,
  propertyGroup: "position",
  animationId: "position-tween",
};

const COLLIDING_TARGET: TimelineKeyframeTarget = {
  ...FLAT_TWEEN_TARGET,
  collidingAnimationTargets: [
    { animationId: "position-tween", tweenPercentage: 100 },
    { animationId: "scale-tween", tweenPercentage: 75 },
  ],
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  usePlayerStore.setState({ focusedEaseSegment: null, timelineSessionEpoch: 0 });
});

/**
 * Mount the hook on its own and hand back the handlers it returned, with the
 * options every test shares already filled in. Each test overrides only the
 * inputs its assertion is about.
 */
function mountHandlers(options: Partial<Parameters<typeof useTimelineKeyframeHandlers>[0]> = {}) {
  const handlers: Partial<ReturnType<typeof useTimelineKeyframeHandlers>> = {};

  function Harness() {
    Object.assign(
      handlers,
      useTimelineKeyframeHandlers({
        expandedElements: [ELEMENT],
        keyframeCache: new Map(),
        setSelectedElementId: vi.fn(),
        setKfContextMenu: vi.fn(),
        toggleSelectedKeyframe: vi.fn(),
        ...options,
      }),
    );
    return null;
  }

  return { root: mountReactHarness(<Harness />), handlers };
}

describe("useTimelineKeyframeHandlers", () => {
  it("tracks opening the segment ease editor when a timeline segment is selected", () => {
    const trackStudioSegmentEaseEdit = vi
      .spyOn(telemetry, "trackStudioSegmentEaseEdit")
      .mockImplementation(() => {});
    const { root, handlers } = mountHandlers();
    act(() => handlers.onSelectSegment?.(ELEMENT.id, TARGET));

    expect(trackStudioSegmentEaseEdit).toHaveBeenCalledOnce();
    expect(trackStudioSegmentEaseEdit).toHaveBeenCalledWith({ action: "open" });
    act(() => root.unmount());
  });

  it("focuses a merged segment with its colliding animation targets", () => {
    const { root, handlers } = mountHandlers();
    act(() => handlers.onSelectSegment?.(ELEMENT.id, COLLIDING_TARGET));

    expect(usePlayerStore.getState().focusedEaseSegment).toMatchObject({
      animationId: "position-tween",
      collidingAnimationTargets: [
        { animationId: "position-tween", tweenPercentage: 100 },
        { animationId: "scale-tween", tweenPercentage: 75 },
      ],
      tweenPercentage: 100,
      elementId: ELEMENT.id,
    });
    act(() => root.unmount());
  });

  it("focuses a flat tween segment without seeking, while keyframe clicks still seek", () => {
    const onSeek = vi.fn();
    const onSelectElement = vi.fn();
    const setSelectedElementId = vi.fn();
    const { root, handlers } = mountHandlers({ onSelectElement, onSeek, setSelectedElementId });

    // Selecting a segment must NOT move the playhead.
    act(() => handlers.onSelectSegment?.(ELEMENT.id, FLAT_TWEEN_TARGET));
    expect(onSeek).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().focusedEaseSegment).toMatchObject({
      animationId: "position-tween",
      tweenPercentage: 100,
      elementId: ELEMENT.id,
    });
    expect(usePlayerStore.getState().focusedEaseSegment?.collidingAnimationTargets).toBeUndefined();
    expect(setSelectedElementId).toHaveBeenCalledWith(ELEMENT.id);
    expect(onSelectElement).toHaveBeenCalledWith(ELEMENT);

    // Clicking the keyframe itself still seeks to it (start 1 + 50% of 2 = 2).
    act(() => handlers.onClickKeyframe?.(ELEMENT, TARGET));
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(2);
    act(() => root.unmount());
  });

  it("scopes a keyframe context target to the opening timeline session", () => {
    const setKfContextMenu = vi.fn();
    usePlayerStore.setState({ timelineSessionEpoch: 4 });

    function Harness() {
      const { onContextMenuKeyframe } = useTimelineKeyframeHandlers({
        expandedElements: [ELEMENT],
        keyframeCache: new Map(),
        setSelectedElementId: vi.fn(),
        setKfContextMenu,
        toggleSelectedKeyframe: vi.fn(),
      });
      return (
        <button
          type="button"
          onContextMenu={(event) => onContextMenuKeyframe(event, ELEMENT.id, TARGET)}
        />
      );
    }

    const root = mountReactHarness(<Harness />);
    const button = document.querySelector("button");
    expect(button).not.toBeNull();
    act(() => {
      button?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 20 }),
      );
    });

    expect(setKfContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({ elementId: ELEMENT.id, sessionEpoch: 4, x: 14, y: 22 }),
    );
    act(() => root.unmount());
  });
});
