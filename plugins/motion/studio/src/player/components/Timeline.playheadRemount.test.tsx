// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Timeline } from "./Timeline";
import { installTimelineMountEnv } from "./timelineMountTestEnv";
import { liveTime, usePlayerStore } from "../store/playerStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

installTimelineMountEnv();

const clips = [{ id: "intro", tag: "div", start: 2, duration: 10, track: 0 }];
const needle = (host: HTMLElement) =>
  host.querySelector<HTMLElement>("[data-timeline-playhead-layer] > div")?.style.transform;

describe("Timeline playhead across a composition switch", () => {
  it("places the remounted playhead at the restored time", async () => {
    usePlayerStore.setState({ duration: 20, currentTime: 0, timelineReady: true, elements: clips });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<Timeline />));
    const atZero = needle(host);
    await act(async () => usePlayerStore.getState().setCurrentTime(4));
    const atFour = needle(host);
    expect(atFour).not.toBe(atZero);

    await act(async () => usePlayerStore.setState({ elements: [], timelineReady: false }));
    await act(async () => usePlayerStore.getState().setCurrentTime(1.5));
    await act(async () => {
      usePlayerStore.getState().setCurrentTime(4);
      liveTime.notify(4);
    });
    await act(async () => usePlayerStore.setState({ elements: clips, timelineReady: true }));

    expect(needle(host)).toBe(atFour);
    act(() => root.unmount());
  });
});
