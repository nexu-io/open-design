// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useTimelinePlayer } from "./useTimelinePlayer";
import { usePlayerStore } from "../store/playerStore";
import { getMediaProbeDiagnostics, resetMediaProbeRegistry } from "../lib/mediaProbe";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

it("publishes resolved metadata only for clips that still need it", async () => {
  vi.useFakeTimers({
    toFake: ["setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame"],
  });
  const { promise: ready, resolve: release } = Promise.withResolvers<void>();
  const requested = new Set<string>();
  const bytes = new Uint8Array(44 + 192000);
  const view = new DataView(bytes.buffer);
  const word = (at: number, text: string) =>
    [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  word(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, 192000, true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      requested.add(String(input));
      await ready;
      return new Response(bytes, {
        headers: { "content-type": "audio/wav", "content-length": String(bytes.length) },
      });
    }),
  );
  resetMediaProbeRegistry();
  usePlayerStore.getState().reset();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const current: { value?: ReturnType<typeof useTimelinePlayer> } = {};
  function Harness() {
    current.value = useTimelinePlayer();
    return null;
  }
  act(() => root.render(React.createElement(Harness)));
  const api = current.value;
  if (!api) throw new Error("player hook did not mount");
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const frame = iframe.contentWindow;
  if (!frame) throw new Error("preview frame did not attach");
  Object.assign(frame, {
    __player: {
      play() {},
      pause() {},
      seek() {},
      getTime: () => 0,
      getDuration: () => 600,
      isPlaying: () => false,
    },
    postMessage() {},
    scrollTo() {},
  });
  act(() => {
    api.iframeRef.current = iframe;
    api.onIframeLoad();
  });
  const clips = Array.from({ length: 600 }, (_, index) => ({
    id: `clip-${index}`,
    label: `Clip ${index}`,
    start: index,
    duration: 1,
    track: 0,
    kind: "audio",
    tagName: "audio",
    compositionId: null,
    parentCompositionId: null,
    compositionSrc: null,
    assetUrl: `https://example.test/source-${index % 30}.wav`,
  }));
  const dispatch = () =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source: frame,
        data: { source: "hf-preview", type: "timeline", clips, durationInFrames: 18000, fps: 30 },
      }),
    );
  let stop = () => {};
  try {
    act(() => {
      dispatch();
      dispatch();
    });
    expect(usePlayerStore.getState().elements).toHaveLength(600);
    act(() => usePlayerStore.getState().setTimelineReady(true));
    act(() =>
      usePlayerStore.setState((state) => ({
        elements: state.elements
          .slice(20)
          .map((element, index) => (index < 20 ? { ...element, sourceDuration: 99 } : element)),
      })),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    let changed = 0;
    let unchanged = 0;
    let other = 0;
    stop = usePlayerStore.subscribe((state, before) => {
      if (state.elements !== before.elements) changed++;
      else if (Object.entries(state).every(([key, value]) => value === Reflect.get(before, key)))
        unchanged++;
      else other++;
    });
    await act(async () => {
      release();
      const started = Date.now();
      while (getMediaProbeDiagnostics().cached < 30 && Date.now() - started < 4000)
        await new Promise((resolve) => setTimeout(resolve, 10));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const elements = usePlayerStore.getState().elements;
    expect(elements).toHaveLength(580);
    expect(requested.size).toBe(30);
    expect(getMediaProbeDiagnostics()).toEqual({ cached: 30, failed: 0, inflight: 0 });
    expect(elements.slice(0, 20).every((element) => element.sourceDuration === 99)).toBe(true);
    expect(elements.slice(20).every((element) => element.sourceDuration === 12)).toBe(true);
    expect(changed).toBe(560);
    expect(unchanged).toBe(0);
    expect(other).toBe(0);
  } finally {
    stop();
    act(() => root.unmount());
    usePlayerStore.getState().reset();
    resetMediaProbeRegistry();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = "";
  }
});
