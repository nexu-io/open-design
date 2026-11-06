// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { liveTime, usePlayerStore } from "../player";
import { useFrameCapture } from "./useFrameCapture";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let renders = 0;
let capture: ReturnType<typeof useFrameCapture>;

function Harness() {
  renders += 1;
  capture = useFrameCapture({
    projectId: "p",
    activeCompPath: null,
    showToast: () => {},
    waitForPendingDomEditSaves: async () => {},
  });
  return null;
}

const shownTime = () => new URL(capture.captureFrameHref).searchParams.get("t");

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  usePlayerStore.setState({ isPlaying: false, currentTime: 2 });
  renders = 0;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(React.createElement(Harness)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("useFrameCapture", () => {
  it("does not re-render on playback frames", () => {
    usePlayerStore.setState({ isPlaying: true });
    const before = renders;
    act(() => {
      for (let i = 1; i <= 30; i++) liveTime.notify(2 + i / 60);
    });
    expect(renders).toBe(before);
  });

  it("points the capture at the live playhead while playing", () => {
    usePlayerStore.setState({ isPlaying: true });
    act(() => liveTime.notify(7.5));
    act(() => capture.refreshCaptureFrameTime());
    expect(shownTime()).toBe("7.500");
  });

  it("points the capture at the store time while paused", () => {
    act(() => liveTime.notify(7.5));
    usePlayerStore.setState({ isPlaying: false, currentTime: 3 });
    act(() => capture.refreshCaptureFrameTime());
    expect(shownTime()).toBe("3.000");
  });
});
