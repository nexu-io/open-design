// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../store/playerStore";
import {
  attachIframeWindow,
  makeAdapterWindow,
  renderTimelinePlayerHarness,
  resetPlayerStore,
} from "./timelinePlayerTestHarness";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  resetPlayerStore();
});

describe("useTimelinePlayer tab hidden while playing", () => {
  it("pauses on the adapter's time, like any other pause", () => {
    const { api, root } = renderTimelinePlayerHarness();
    const { adapter, win } = makeAdapterWindow();
    attachIframeWindow(api, win);
    act(() => api.play());
    adapter.seek(6);

    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));

    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(usePlayerStore.getState().currentTime).toBe(6);
    act(() => root.unmount());
  });

  it("stops a reverse shuttle for good", async () => {
    const { api, root } = renderTimelinePlayerHarness();
    const { adapter, win } = makeAdapterWindow();
    attachIframeWindow(api, win);
    adapter.seek(20);
    act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyJ", key: "j" })));
    await act(() => new Promise((r) => setTimeout(r, 100)));
    expect(usePlayerStore.getState().isPlaying).toBe(true);

    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    const stoppedAt = adapter.getTime();
    await act(() => new Promise((r) => setTimeout(r, 200)));

    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(adapter.getTime()).toBe(stoppedAt);
    expect(usePlayerStore.getState().currentTime).toBe(stoppedAt);
    act(() => root.unmount());
  });

  it("does not carry the shuttle speed past the pause", () => {
    const { api, root } = renderTimelinePlayerHarness();
    attachIframeWindow(api, makeAdapterWindow().win);
    const pressL = () =>
      act(
        () => void window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL", key: "l" })),
      );
    pressL();
    pressL();
    expect(usePlayerStore.getState().playbackRate).toBe(2);

    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    pressL();

    expect(usePlayerStore.getState().playbackRate).toBe(1);
    act(() => root.unmount());
  });
});
