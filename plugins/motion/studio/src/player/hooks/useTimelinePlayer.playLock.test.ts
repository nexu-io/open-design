// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  makeAdapterWindow,
  makeFakeIframe,
  renderTimelinePlayerHarness,
  resetPlayerStore,
} from "./timelinePlayerTestHarness";
import { usePlayerStore } from "../store/playerStore";
import { scrubMusicAtSeek } from "../lib/playbackScrub";

vi.mock("../lib/playbackScrub", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/playbackScrub")>()),
  scrubMusicAtSeek: vi.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  resetPlayerStore();
  usePlayerStore.setState({ playLocked: false, loopEnabled: false, playbackRate: 1 });
  vi.mocked(scrubMusicAtSeek).mockClear();
});

function readyPlayer() {
  const { api, root } = renderTimelinePlayerHarness();
  const { adapter, win } = makeAdapterWindow();
  act(() => {
    api.iframeRef.current = makeFakeIframe(win);
    api.onIframeLoad();
    usePlayerStore.setState({ timelineReady: true });
  });
  return { api, root, adapter };
}

const press = (key: string) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, code: `Key${key.toUpperCase()}` }));
  });

it("starts nothing while the host holds playback: Play, a playback request or play backward", () => {
  const { api, root, adapter } = readyPlayer();
  act(() => usePlayerStore.getState().setPlayLocked(true));
  act(() => api.play());
  act(() => usePlayerStore.getState().requestPlayback(true));
  press("j");
  expect(adapter.play).not.toHaveBeenCalled();
  expect(usePlayerStore.getState().isPlaying).toBe(false);
  act(() => root.unmount());
});

it("J and L keep the chosen speed while the host holds playback", () => {
  const { root } = readyPlayer();
  act(() => usePlayerStore.getState().setPlaybackRate(0.5));
  act(() => usePlayerStore.getState().setPlayLocked(true));
  press("l");
  press("j");
  expect(usePlayerStore.getState().playbackRate).toBe(0.5);
  act(() => root.unmount());
});

it("a looping film reaching its end while held stops instead of starting again", () => {
  const frames: FrameRequestCallback[] = [];
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((tick) => {
    frames.push(tick);
    return frames.length;
  });
  const { api, root, adapter } = readyPlayer();
  act(() => usePlayerStore.setState({ loopEnabled: true }));
  act(() => api.play());
  // Held with the store already reading stopped, so nothing pauses the frame loop first.
  act(() => usePlayerStore.setState({ playLocked: true, isPlaying: false }));
  adapter.seek(30);
  act(() => frames.at(-1)!(0));
  expect(adapter.play).toHaveBeenCalledTimes(1);
  expect(usePlayerStore.getState().isPlaying).toBe(false);
  raf.mockRestore();
  act(() => root.unmount());
});

it("turning the hold on before the preview has a player still clears playing", () => {
  const { root } = renderTimelinePlayerHarness();
  act(() => usePlayerStore.setState({ isPlaying: true }));
  act(() => usePlayerStore.getState().setPlayLocked(true));
  expect(usePlayerStore.getState().isPlaying).toBe(false);
  act(() => root.unmount());
});

it("a seek that would keep playing does not resume while the host holds playback", () => {
  const { api, root, adapter } = readyPlayer();
  act(() => usePlayerStore.getState().setPlayLocked(true));
  // The store still reads playing (a host that set the hold before the player caught up): only the hold stops it.
  act(() => usePlayerStore.setState({ isPlaying: true }));
  act(() => {
    api.seek(5, { keepPlaying: true });
  });
  expect(adapter.play).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it("a seek while the host holds playback moves the picture without scrub audio", () => {
  const { api, root, adapter } = readyPlayer();
  act(() => {
    api.seek(2);
  });
  expect(scrubMusicAtSeek).toHaveBeenCalledTimes(1);
  act(() => usePlayerStore.getState().setPlayLocked(true));
  act(() => {
    api.seek(4);
  });
  expect(adapter.getTime()).toBe(4);
  expect(scrubMusicAtSeek).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});

it("a timeline reset keeps the hold: the host owns it", () => {
  act(() => usePlayerStore.getState().setPlayLocked(true));
  act(() => usePlayerStore.getState().reset());
  expect(usePlayerStore.getState().playLocked).toBe(true);
});

it("turning the hold on pauses a playing film; turning it off lets Play start again", () => {
  const { api, root, adapter } = readyPlayer();
  act(() => api.play());
  expect(usePlayerStore.getState().isPlaying).toBe(true);
  act(() => usePlayerStore.getState().setPlayLocked(true));
  expect(adapter.pause).toHaveBeenCalled();
  expect(usePlayerStore.getState().isPlaying).toBe(false);
  act(() => usePlayerStore.getState().setPlayLocked(false));
  act(() => api.play());
  expect(adapter.play).toHaveBeenCalledTimes(2);
  expect(usePlayerStore.getState().isPlaying).toBe(true);
  act(() => root.unmount());
});
