// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Timeline } from "./Timeline";
import { usePlayerStore } from "../store/playerStore";
import { useTimelineContext } from "./TimelineProvider";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  usePlayerStore.getState().reset();
});

function TimelinePartsVariant() {
  const { meta } = useTimelineContext();
  return React.createElement(
    "div",
    meta.containerProps,
    React.createElement(
      "div",
      meta.viewportProps,
      React.createElement(Timeline.Frame),
      React.createElement(Timeline.RazorGuide),
    ),
    React.createElement(Timeline.Overlays),
  );
}

describe("Timeline provider boundary", () => {
  it("keeps the composed Timeline markup equal to its provider parts", () => {
    usePlayerStore.setState({
      duration: 4,
      timelineReady: true,
      elements: [{ id: "parity-clip", tag: "div", start: 0, duration: 2, track: 0 }],
    });
    const composedHost = document.createElement("div");
    const partsHost = document.createElement("div");
    document.body.append(composedHost, partsHost);
    const composedRoot = createRoot(composedHost);
    const partsRoot = createRoot(partsHost);
    act(() => {
      composedRoot.render(React.createElement(Timeline));
      partsRoot.render(
        React.createElement(Timeline.Provider, null, React.createElement(TimelinePartsVariant)),
      );
    });
    const normalizeMarkup = (markup: string) =>
      markup.replaceAll(/timeline-lanes_[^"]+/g, "timeline-lanes");
    expect(normalizeMarkup(partsHost.innerHTML)).toBe(normalizeMarkup(composedHost.innerHTML));
    act(() => {
      composedRoot.unmount();
      partsRoot.unmount();
    });
  });
});
