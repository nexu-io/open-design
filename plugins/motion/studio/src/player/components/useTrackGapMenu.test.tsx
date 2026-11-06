// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { useTrackGapMenu } from "./useTrackGapMenu";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lane: TimelineElement[] = [
  { id: "first", tag: "div", start: 0, duration: 1, track: 0 },
  { id: "second", tag: "div", start: 3, duration: 1, track: 0 },
];

afterEach(() => {
  usePlayerStore.getState().reset();
  document.body.innerHTML = "";
});

describe("useTrackGapMenu", () => {
  it("does not commit an anchor captured in a previous project session", () => {
    usePlayerStore.setState({ elements: lane, timelineSessionEpoch: 1 });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onMoveElement = vi.fn();
    const onMoveElements = vi.fn();
    let api: ReturnType<typeof useTrackGapMenu> | null = null;

    function getApi(): ReturnType<typeof useTrackGapMenu> {
      if (!api) throw new Error("gap menu harness did not render");
      return api;
    }

    function Probe() {
      api = useTrackGapMenu({
        tracks: [[0, lane]],
        expandedElementsRef: { current: lane },
        trackOrderRef: { current: [0] },
        onMoveElement,
        onMoveElements,
      });
      return null;
    }

    act(() => root.render(<Probe />));
    act(() => getApi().openGapMenu({ x: 10, y: 20, track: 0, time: 2 }));
    expect(getApi().gapMenuModel).not.toBeNull();
    const staleCloseTrackGap = getApi().closeTrackGap;
    const staleCloseAllTrackGaps = getApi().closeAllTrackGaps;

    act(() => {
      usePlayerStore.setState({ timelineSessionEpoch: 2 });
      staleCloseTrackGap();
      staleCloseAllTrackGaps();
    });
    expect(getApi().gapMenuModel).toBeNull();

    expect(onMoveElement).not.toHaveBeenCalled();
    expect(onMoveElements).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
