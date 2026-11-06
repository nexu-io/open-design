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

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  resetPlayerStore();
});

it("does not start playback before the timeline is ready, so iframe load cannot swallow it", () => {
  const { api, root } = renderTimelinePlayerHarness();
  const { adapter, win } = makeAdapterWindow();
  // The runtime has booted (adapter exists) but the iframe's load event has not fired yet.
  act(() => {
    api.iframeRef.current = makeFakeIframe(win);
  });

  act(() => api.play());
  expect(adapter.play).not.toHaveBeenCalled();
  expect(usePlayerStore.getState().isPlaying).toBe(false);

  act(() => {
    api.onIframeLoad();
    usePlayerStore.setState({ timelineReady: true });
  });
  act(() => api.play());
  expect(adapter.play).toHaveBeenCalledTimes(1);
  expect(usePlayerStore.getState().isPlaying).toBe(true);
  act(() => root.unmount());
});

it("does not start playback while a switched-to composition's preview is still loading", () => {
  const { api, root } = renderTimelinePlayerHarness();
  act(() => {
    api.iframeRef.current = makeFakeIframe(makeAdapterWindow().win);
    api.onIframeLoad();
    usePlayerStore.setState({ timelineReady: true });
  });

  // Drill into another composition: a fresh preview whose runtime is up but whose load step hasn't run.
  const next = makeAdapterWindow();
  act(() => {
    api.resetPreviewSlots();
    api.iframeRef.current = makeFakeIframe(next.win);
  });
  act(() => api.play());
  expect(next.adapter.play).not.toHaveBeenCalled();
  expect(usePlayerStore.getState().isPlaying).toBe(false);
  act(() => root.unmount());
});

function postFromRuntime(win: object, data: Record<string, unknown>) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        source: win as unknown as Window,
        data: { source: "hf-preview", ...data },
      }),
    );
  });
}

async function expectPlayStillOff() {
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(usePlayerStore.getState().timelineReady).toBe(false);
}

// Duration 0: the adapter cannot enable Play itself, so only the message path can, after the load step.
it.each([30, 0])(
  "waits for the preview's load step before a timeline message enables Play (adapter duration %i)",
  async (duration) => {
    const { api, root } = renderTimelinePlayerHarness();
    const { win } = makeAdapterWindow({ duration });
    act(() => {
      api.iframeRef.current = makeFakeIframe(win);
    });
    // The runtime reports its timeline before the document's load event, as a film with large images does.
    const clip = { id: "clip", label: "Clip", start: 0, duration: 1, track: 0, kind: "element" };
    postFromRuntime(win, { type: "timeline", clips: [clip], durationInFrames: 30, fps: 30 });
    await expectPlayStillOff();

    act(() => api.onIframeLoad());
    await vi.waitFor(() => expect(usePlayerStore.getState().timelineReady).toBe(true));
    act(() => root.unmount());
  },
);

it("settles a load whose runtime learns its duration after its only readiness post", async () => {
  const { api, root } = renderTimelinePlayerHarness();
  let duration = 0;
  const { adapter, win } = makeAdapterWindow();
  adapter.getDuration = () => duration;
  act(() => {
    api.iframeRef.current = makeFakeIframe(win);
    api.onIframeLoad();
  });
  postFromRuntime(win, { type: "state" });
  expect(adapter.pause).not.toHaveBeenCalled();

  // No further post comes: a paused low-power preview checks in only once a second.
  duration = 30;
  await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
  expect(adapter.pause).toHaveBeenCalled();
  act(() => root.unmount());
});

it.each(["unmounts", "resets"])("stops retrying a pending load once the player %s", async (how) => {
  const { api, root } = renderTimelinePlayerHarness();
  const { adapter, win } = makeAdapterWindow();
  let lookups = 0;
  adapter.getDuration = () => (lookups++, 0);
  act(() => {
    api.iframeRef.current = makeFakeIframe(win);
    api.onIframeLoad();
  });
  postFromRuntime(win, { type: "state" });
  act(() => (how === "resets" ? api.resetPlayer() : root.unmount()));
  const atStop = lookups;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  expect(lookups).toBe(atStop);
  if (how === "resets") act(() => root.unmount());
});

it("does not let the blank page's load step enable Play for the preview that replaces it", async () => {
  const { api, root } = renderTimelinePlayerHarness();
  // The iframe's first load is about:blank, before the runtime exists; its load step waits for runtime messages.
  const iframe = makeFakeIframe({ ...makeAdapterWindow().win, __player: undefined });
  act(() => {
    api.iframeRef.current = iframe;
    api.onIframeLoad();
  });

  // The same iframe navigates to the preview, whose runtime reports ready before its own load event.
  const { win } = makeAdapterWindow();
  Object.defineProperty(iframe, "contentWindow", { value: win, configurable: true });
  Object.defineProperty(iframe, "contentDocument", {
    value: document.implementation.createHTMLDocument("preview"),
    configurable: true,
  });
  postFromRuntime(win, { type: "state" });
  await expectPlayStillOff();

  act(() => api.onIframeLoad());
  await vi.waitFor(() => expect(usePlayerStore.getState().timelineReady).toBe(true));
  act(() => root.unmount());
});
