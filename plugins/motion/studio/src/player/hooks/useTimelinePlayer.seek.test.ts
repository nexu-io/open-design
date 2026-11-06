// @vitest-environment happy-dom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { useTimelinePlayer } from "./useTimelinePlayer";
import {
  attachIframeAdapter,
  attachIframeWindow,
  makeAdapterWindow,
  makeFakeIframe,
  renderTimelinePlayerHarness,
  resetPlayerStore,
} from "./timelinePlayerTestHarness";
import { liveTime, usePlayerStore } from "../store/playerStore";
import { setPreviewFrame } from "../store/previewFrameStore";
import { setTimelinePerformanceFixtureLease } from "../lib/timelinePerformanceFixture";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  setTimelinePerformanceFixtureLease(false);
  document.body.innerHTML = "";
  resetPlayerStore();
});

function renderAttachedTimelinePlayer() {
  const { api, root } = renderTimelinePlayerHarness();
  const adapter = attachIframeAdapter(api);
  return { api, root, adapter };
}

function setStorePlaying() {
  act(() => {
    usePlayerStore.setState({ isPlaying: true });
  });
}

function seekWithAct(
  api: ReturnType<typeof useTimelinePlayer>,
  time: number,
  options?: { keepPlaying?: boolean },
) {
  act(() => {
    api.seek(time, options);
  });
}

function unmountWithAct(root: ReturnType<typeof createRoot>) {
  act(() => {
    root.unmount();
  });
}

function expectStorePlaybackState(
  root: ReturnType<typeof createRoot>,
  expected: { isPlaying: boolean; currentTime: number },
) {
  expect(usePlayerStore.getState().isPlaying).toBe(expected.isPlaying);
  expect(usePlayerStore.getState().currentTime).toBe(expected.currentTime);
  unmountWithAct(root);
}

describe("useTimelinePlayer seek hydration", () => {
  it("ignores runtime timeline work while the performance fixture lease is active", () => {
    const { api, root } = renderTimelinePlayerHarness();
    attachIframeAdapter(api);
    const iframeWindow = api.iframeRef.current?.contentWindow;
    const iframeDocument = api.iframeRef.current?.contentDocument;
    if (!iframeWindow || !iframeDocument) throw new Error("iframe did not attach");
    const querySelector = vi.spyOn(iframeDocument, "querySelector");
    const clips = [
      {
        id: "runtime-clip",
        label: "Runtime clip",
        start: 0,
        duration: 1,
        track: 0,
        kind: "element",
        tagName: "div",
        compositionId: null,
        parentCompositionId: null,
        compositionSrc: null,
        assetUrl: null,
      },
    ];
    const dispatchTimeline = () =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source: iframeWindow,
          data: {
            source: "hf-preview",
            type: "timeline",
            clips,
            durationInFrames: 30,
            fps: 30,
          },
        }),
      );
    try {
      act(() => {
        usePlayerStore.setState({ clipManifest: null });
        setTimelinePerformanceFixtureLease(true);
        dispatchTimeline();
      });
      expect(usePlayerStore.getState().clipManifest).toBeNull();
      expect(querySelector).not.toHaveBeenCalled();

      act(() => {
        setTimelinePerformanceFixtureLease(false);
        dispatchTimeline();
      });
      expect(usePlayerStore.getState().clipManifest).toEqual(clips);
      expect(querySelector).toHaveBeenCalled();
    } finally {
      unmountWithAct(root);
    }
  });

  it("keeps an external seek request until the iframe adapter is ready", () => {
    const observedTimes: number[] = [];
    const unsubscribe = liveTime.subscribe((time) => {
      observedTimes.push(time);
    });
    const { api, root } = renderTimelinePlayerHarness();

    act(() => {
      usePlayerStore.getState().requestSeek(4.2);
    });

    expect(usePlayerStore.getState().currentTime).toBe(0);
    expect(usePlayerStore.getState().requestedSeekTime).toBeNull();

    const adapter = attachIframeAdapter(api);

    expect(adapter.getTime()).toBe(4.2);
    expect(usePlayerStore.getState().currentTime).toBe(4.2);
    expect(usePlayerStore.getState().timelineReady).toBe(true);
    expect(observedTimes).toContain(4.2);

    unmountWithAct(root);
    unsubscribe();
  });

  it("does not settle from an unsupported runtime protocol message", () => {
    const { api, root } = renderTimelinePlayerHarness();
    const iframeWindow = {
      postMessage: vi.fn(),
      scrollTo: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as Record<string, unknown>;
    attachIframeWindow(api, iframeWindow);
    expect(usePlayerStore.getState().timelineReady).toBe(false);

    iframeWindow.__player = {
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
      getTime: () => 0,
      getDuration: () => 30,
      isPlaying: () => false,
    };
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: iframeWindow as unknown as Window,
          data: { source: "hf-preview", type: "state", protocolVersion: 999 },
        }),
      );
    });
    expect(usePlayerStore.getState().timelineReady).toBe(false);

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: iframeWindow as unknown as Window,
          data: { source: "hf-preview", type: "state" },
        }),
      );
    });
    expect(usePlayerStore.getState().timelineReady).toBe(true);

    unmountWithAct(root);
  });
});

describe("useTimelinePlayer audio controls (#835)", () => {
  it("applies playback-rate changes immediately and keeps audio unmuted above 1x", () => {
    const { api, root } = renderTimelinePlayerHarness();
    const postMessage = vi.fn();
    const timeScale = vi.fn();

    attachIframeAdapter(api, {
      postMessage,
      timelines: {
        root: { timeScale },
      },
    });
    postMessage.mockClear();
    timeScale.mockClear();

    act(() => {
      usePlayerStore.getState().setAudioMuted(false);
      usePlayerStore.getState().setPlaybackRate(2);
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "hf-parent",
        type: "control",
        action: "set-playback-rate",
        playbackRate: 2,
      }),
      "*",
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "hf-parent",
        type: "control",
        action: "set-muted",
        muted: false,
      }),
      "*",
    );
    expect(timeScale).toHaveBeenCalledWith(2);

    postMessage.mockClear();

    act(() => {
      usePlayerStore.getState().setPlaybackRate(1);
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "set-muted",
        muted: false,
      }),
      "*",
    );

    unmountWithAct(root);
  });

  it("keeps explicit Studio mute active at 1x", () => {
    const { api, root } = renderTimelinePlayerHarness();
    const postMessage = vi.fn();

    attachIframeAdapter(api, { postMessage });
    postMessage.mockClear();

    act(() => {
      usePlayerStore.getState().setPlaybackRate(1);
      usePlayerStore.getState().setAudioMuted(true);
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "set-muted",
        muted: true,
      }),
      "*",
    );

    unmountWithAct(root);
  });
});

describe("useTimelinePlayer seek keepPlaying option (#834)", () => {
  it("publishes a seek as a person's seek, so a paused timeline follows it", () => {
    const { root, api } = renderAttachedTimelinePlayer();
    const before = liveTime.seekCount();
    seekWithAct(api, 5);
    expect(liveTime.seekCount()).toBe(before + 1);
    expect(liveTime.latest()).toBe(5);
    unmountWithAct(root);
  });

  it("does not count a reload's hand-over as a person's seek", () => {
    const { getApi, root } = renderTimelinePlayerHarness();
    act(() => {
      getApi().iframeRef.current = makeFakeIframe(makeAdapterWindow().win);
      getApi().onIframeLoad();
    });
    seekWithAct(getApi(), 7);
    act(() => getApi().refreshPlayer());
    const seeks = liveTime.seekCount();
    const gen = getApi().previewSlots.find((s) => s.role === "shadow")!.gen;
    const shadow = makeFakeIframe(makeAdapterWindow().win);
    shadow.src = "http://localhost/api/projects/demo/preview?_t=1";
    act(() => {
      getApi().setShadowIframeNode(shadow);
      getApi().onShadowIframeLoad(gen);
      getApi().onShadowReadyChange(gen, true);
    });
    expect(getApi().iframeRef.current).toBe(shadow);
    expect(liveTime.latest()).toBe(7);
    expect(liveTime.seekCount()).toBe(seeks);
    unmountWithAct(root);
  });

  it("does not count the audition's return to the paused time as a person's seek", () => {
    const { api, root } = renderAttachedTimelinePlayer();
    seekWithAct(api, 4);
    const seeks = liveTime.seekCount();
    act(() => usePlayerStore.getState().requestPlayback(false, 2));
    expect(liveTime.latest()).toBe(2);
    expect(liveTime.seekCount()).toBe(seeks);
    unmountWithAct(root);
  });

  it("default seek() clears isPlaying when the store reports playing", () => {
    const { api, root } = renderAttachedTimelinePlayer();
    setStorePlaying();

    seekWithAct(api, 5);

    expectStorePlaybackState(root, { isPlaying: false, currentTime: 5 });
  });

  it("seek(time, { keepPlaying: true }) preserves isPlaying=true so A/E shortcuts don't pause the timeline", () => {
    const { api, root, adapter } = renderAttachedTimelinePlayer();
    setStorePlaying();

    seekWithAct(api, 5, { keepPlaying: true });

    expect(adapter.play).toHaveBeenCalledTimes(1);
    expectStorePlaybackState(root, { isPlaying: true, currentTime: 5 });
  });

  it("seek(time, { keepPlaying: true }) from paused state stays paused (no spurious resume)", () => {
    const { api, root } = renderAttachedTimelinePlayer();

    expect(usePlayerStore.getState().isPlaying).toBe(false);

    seekWithAct(api, 5, { keepPlaying: true });

    expectStorePlaybackState(root, { isPlaying: false, currentTime: 5 });
  });

  it("seek(time, { keepPlaying: true }) restarts playback when the iframe adapter was paused", () => {
    const { api, root, adapter } = renderAttachedTimelinePlayer();
    setStorePlaying();

    expect(adapter.isPlaying()).toBe(false);

    seekWithAct(api, 0, { keepPlaying: true });

    expect(adapter.play).toHaveBeenCalledTimes(1);
    expect(adapter.isPlaying()).toBe(true);
    expectStorePlaybackState(root, { isPlaying: true, currentTime: 0 });
  });
});

describe("useTimelinePlayer preview frame (a trim's dragged edge)", () => {
  function previewFrame(time: number | null) {
    act(() => setPreviewFrame(time));
  }

  it("shows the frame without moving the playhead, then puts the playhead's frame back", () => {
    const { api, root, adapter } = renderAttachedTimelinePlayer();
    seekWithAct(api, 1.25);
    const seeks = liveTime.seekCount();
    previewFrame(3.4);
    expect(adapter.getTime()).toBe(3.4);
    expect(usePlayerStore.getState().currentTime).toBe(1.25);
    expect(liveTime.latest()).toBe(1.25);
    previewFrame(null);
    expect(adapter.getTime()).toBe(1.25);
    expect(liveTime.seekCount()).toBe(seeks);
    unmountWithAct(root);
  });

  it("keeps the playhead's time when paused, played or reloaded over the frame", () => {
    const { getApi, root } = renderTimelinePlayerHarness();
    attachIframeWindow(getApi(), makeAdapterWindow().win);
    seekWithAct(getApi(), 1.25);
    previewFrame(3.4);
    act(() => getApi().pause());
    expect(usePlayerStore.getState().currentTime).toBe(1.25);
    act(() => getApi().refreshPlayer());
    const gen = getApi().previewSlots.find((s) => s.role === "shadow")!.gen;
    const shadow = makeFakeIframe(makeAdapterWindow().win);
    shadow.src = "http://localhost/api/projects/demo/preview?_t=1";
    act(() => {
      getApi().setShadowIframeNode(shadow);
      getApi().onShadowIframeLoad(gen);
      getApi().onShadowReadyChange(gen, true);
    });
    expect(getApi().iframeRef.current).toBe(shadow);
    expect(usePlayerStore.getState().currentTime).toBe(1.25);
    previewFrame(3.5);
    const live = (shadow.contentWindow as unknown as { __player: { getTime(): number } }).__player;
    expect(live.getTime()).toBe(3.5);
    act(() => getApi().play());
    expect(live.getTime()).toBe(1.25);
    unmountWithAct(root);
  });

  it("plays from the in-point when play rewinds from the end over the frame", () => {
    const { api, root, adapter } = renderAttachedTimelinePlayer();
    seekWithAct(api, 30);
    act(() => usePlayerStore.setState({ inPoint: 3 }));
    previewFrame(12);
    act(() => api.play());
    expect(adapter.getTime()).toBe(3);
    unmountWithAct(root);
  });

  it("reads the playing transport's own time, not the playhead's, under a preview frame", () => {
    const { api, root, adapter } = renderAttachedTimelinePlayer();
    seekWithAct(api, 2);
    setStorePlaying();
    previewFrame(5);
    adapter.seek(7);
    act(() => api.pause());
    expect(usePlayerStore.getState().currentTime).toBe(7);
    unmountWithAct(root);
  });

  it("leaves live playback alone", () => {
    const { api, root, adapter } = renderAttachedTimelinePlayer();
    seekWithAct(api, 2);
    setStorePlaying();
    previewFrame(5);
    expect(adapter.getTime()).toBe(2);
    unmountWithAct(root);
  });
});

describe("useTimelinePlayer RAF loop wrap-around", () => {
  type SeekCall = { time: number; options?: { keepPlaying?: boolean } };

  function attachInstrumentedAdapter(
    api: ReturnType<typeof useTimelinePlayer>,
    duration = 30,
    hooks: object = {},
  ) {
    let currentTime = 0;
    let playing = false;
    const seekCalls: SeekCall[] = [];
    const adapter = {
      play: vi.fn(() => {
        playing = true;
      }),
      pause: vi.fn(() => {
        playing = false;
      }),
      seek: vi.fn((time: number, options?: { keepPlaying?: boolean }) => {
        currentTime = time;
        seekCalls.push({ time, options });
      }),
      getTime: () => currentTime,
      getDuration: () => duration,
      isPlaying: () => playing,
      setTime: (t: number) => {
        currentTime = t;
      },
    };
    attachIframeWindow(api, {
      __player: adapter,
      __hf: hooks,
      postMessage: () => {},
      scrollTo: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    return { adapter, seekCalls };
  }

  function installRafCapture(): {
    flushOne: () => boolean;
    restore: () => void;
  } {
    const callbacks: FrameRequestCallback[] = [];
    const originalRAF = globalThis.requestAnimationFrame;
    const originalCancel = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
    return {
      flushOne: () => {
        const next = callbacks.shift();
        if (!next) return false;
        next(performance.now());
        return true;
      },
      restore: () => {
        globalThis.requestAnimationFrame = originalRAF;
        globalThis.cancelAnimationFrame = originalCancel;
      },
    };
  }

  it("passes { keepPlaying: true } when forward playback wraps around loopEnd", () => {
    const raf = installRafCapture();
    try {
      const { api, root } = renderTimelinePlayerHarness();
      const { adapter, seekCalls } = attachInstrumentedAdapter(api);

      act(() => {
        usePlayerStore.getState().setInPoint(2);
        usePlayerStore.getState().setOutPoint(5);
      });
      expect(usePlayerStore.getState().loopEnabled).toBe(true);

      act(() => {
        api.play();
      });
      adapter.seek.mockClear();
      seekCalls.length = 0;

      adapter.setTime(6); // past outPoint=5
      act(() => {
        raf.flushOne();
      });

      const wrapSeek = seekCalls.find((call) => call.time === 2);
      expect(wrapSeek).toBeDefined();
      expect(wrapSeek?.options).toEqual({ keepPlaying: true });
      expect(adapter.play).toHaveBeenCalled();
      expect(usePlayerStore.getState().isPlaying).toBe(true);

      unmountWithAct(root);
    } finally {
      raf.restore();
    }
  });

  it("tells the preview where the loop wraps to while it plays, and that it stopped looping", () => {
    const raf = installRafCapture();
    try {
      const { api, root } = renderTimelinePlayerHarness();
      const setLoopStart = vi.fn();
      const { adapter } = attachInstrumentedAdapter(api, 30, { setLoopStart });
      act(() => {
        usePlayerStore.getState().setInPoint(2);
        usePlayerStore.getState().setOutPoint(5);
        api.play();
      });
      adapter.setTime(3);
      act(() => void raf.flushOne());
      expect(setLoopStart).toHaveBeenLastCalledWith(2);
      act(() => usePlayerStore.getState().setLoopEnabled(false));
      act(() => void raf.flushOne());
      expect(setLoopStart).toHaveBeenLastCalledWith(null);
      unmountWithAct(root);
    } finally {
      raf.restore();
    }
  });

  it("does not seek and pauses cleanly when forward playback reaches the end without loop", () => {
    const raf = installRafCapture();
    try {
      const { api, root } = renderTimelinePlayerHarness();
      const { adapter, seekCalls } = attachInstrumentedAdapter(api);

      act(() => {
        usePlayerStore.getState().setLoopEnabled(false);
      });

      act(() => {
        api.play();
      });
      adapter.seek.mockClear();
      seekCalls.length = 0;
      adapter.play.mockClear();
      adapter.pause.mockClear();

      adapter.setTime(adapter.getDuration() + 1); // past end
      act(() => {
        raf.flushOne();
      });

      expect(seekCalls).toHaveLength(0);
      expect(adapter.pause).toHaveBeenCalled();
      expect(usePlayerStore.getState().isPlaying).toBe(false);

      unmountWithAct(root);
    } finally {
      raf.restore();
    }
  });
});
