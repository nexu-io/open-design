// @vitest-environment happy-dom
// A full-reload edit must never hide the live iframe until the shadow has painted.

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SHADOW_READY_BUDGETS, SHADOW_READY_TIMEOUT_MS } from "./useShadowPreviewReload";
import { refusedPreviewMessage } from "@hyperframes/core/studio-preview-mark";
import { usePlayerStore } from "../store/playerStore";
import { isPreviewChanging } from "../previewReloading";
import { studioWriteHeaders } from "../../utils/studioFileVersion";
import { NLEProvider, useNLEContext, type NLEContextValue } from "../../components/nle/NLEContext";
import {
  makeAdapterWindow,
  makeFakeIframe,
  renderTimelinePlayerHarness,
  resetPlayerStore,
} from "./timelinePlayerTestHarness";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FULL_WAIT_MS = SHADOW_READY_TIMEOUT_MS * SHADOW_READY_BUDGETS;

vi.mock("../../utils/gsapSoftReload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/gsapSoftReload")>()),
  ensureMotionPathPluginLoaded: vi.fn(),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  resetPlayerStore();
});

function makeLiveIframe(): HTMLIFrameElement {
  const iframe = makeFakeIframe(makeAdapterWindow().win);
  iframe.src = "http://localhost/api/projects/demo/preview";
  return iframe;
}

function makeShadowWithSpies() {
  const { adapter, win } = makeAdapterWindow();
  adapter.seek = vi.fn(adapter.seek);
  const iframe = makeFakeIframe(win);
  iframe.src = "http://localhost/api/projects/demo/preview?_t=1";
  return { adapter, iframe };
}

describe("useTimelinePlayer shadow reload", () => {
  it("never hides or removes the live iframe before the shadow signals it has painted", () => {
    const { getApi, root } = renderTimelinePlayerHarness();
    const liveIframe = makeLiveIframe();

    act(() => {
      getApi().iframeRef.current = liveIframe;
      getApi().onIframeLoad();
    });

    expect(getApi().previewSlots).toEqual([{ gen: 0, role: "live" }]);
    expect(liveIframe.style.visibility).toBe("");

    // A lane-move drop persists, then bumps refreshKey -> refreshPlayer().
    act(() => {
      getApi().refreshPlayer();
    });

    // The live iframe must be untouched: still the ref target, still visible,
    // still in the slot list as "live". A shadow slot appears alongside it —
    // this is the queued background reload, not a swap.
    expect(getApi().iframeRef.current).toBe(liveIframe);
    expect(liveIframe.style.visibility).toBe("");
    expect(getApi().previewSlots).toHaveLength(2);
    const liveSlot = getApi().previewSlots.find((s) => s.role === "live");
    const shadowSlot = getApi().previewSlots.find((s) => s.role === "shadow");
    expect(liveSlot).toEqual({ gen: 0, role: "live" });
    expect(shadowSlot?.role).toBe("shadow");
    expect(shadowSlot?.url).toBeTruthy();

    // The shadow iframe loads and its restore-seek finds a ready adapter —
    // the readiness signal this whole mechanism hangs off.
    const shadowIframe = makeLiveIframe();
    act(() => {
      getApi().setShadowIframeNode(shadowIframe);
    });

    // Still untouched right up to the instant before the ready signal.
    expect(getApi().iframeRef.current).toBe(liveIframe);
    expect(liveIframe.style.visibility).toBe("");

    act(() => {
      getApi().onShadowIframeLoad(shadowSlot!.gen);
      getApi().onShadowReadyChange(shadowSlot!.gen, true);
    });

    // Promotion: a single atomic swap. Exactly one live slot, pointing at the
    // shadow's iframe; the old live slot is gone, not merely hidden.
    expect(getApi().previewSlots).toEqual([
      { gen: shadowSlot!.gen, role: "live", url: shadowSlot!.url },
    ]);
    expect(getApi().iframeRef.current).toBe(shadowIframe);

    unmount(root);
  });

  it("replaces a superseded shadow rather than accumulating extra slots (repeated lane-moves)", () => {
    const { getApi, root } = renderTimelinePlayerHarness();
    const liveIframe = makeLiveIframe();
    act(() => {
      getApi().iframeRef.current = liveIframe;
      getApi().onIframeLoad();
    });

    act(() => {
      getApi().refreshPlayer();
    });
    const firstShadowGen = getApi().previewSlots.find((s) => s.role === "shadow")?.gen;
    expect(firstShadowGen).toBeDefined();

    // The first shadow's iframe finishes loading and is fully adapter-ready
    // (a real "would have painted correctly" candidate) before it is
    // superseded.
    const firstShadow = makeShadowWithSpies();
    act(() => {
      getApi().setShadowIframeNode(firstShadow.iframe);
    });

    // A second edit lands before the first shadow's readiness was consumed.
    act(() => {
      getApi().refreshPlayer();
    });

    // Never more than one extra (shadow) slot alive at a time.
    expect(getApi().previewSlots).toHaveLength(2);
    const secondShadow = getApi().previewSlots.find((s) => s.role === "shadow");
    expect(secondShadow?.gen).not.toBe(firstShadowGen);

    // The first shadow's readiness signal now arrives late (its own iframe is
    // still referenced, fully ready). It must NOT promote — that content was
    // replaced before it ever painted, and gen no longer matches the current
    // pending shadow.
    act(() => {
      getApi().onShadowIframeLoad(firstShadowGen!);
      getApi().onShadowReadyChange(firstShadowGen!, true);
    });
    expect(getApi().previewSlots.find((s) => s.role === "live")).toEqual({ gen: 0, role: "live" });
    expect(getApi().iframeRef.current).toBe(liveIframe);
    expect(firstShadow.adapter.seek).not.toHaveBeenCalled();

    unmount(root);
  });
});

describe("drop that removes a covered clip (reloadPreview -> refreshKey bump)", () => {
  it("swaps in the reloaded document without ever hiding the live iframe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    let ctx: NLEContextValue | null = null;
    const Probe = () => {
      ctx = useNLEContext();
      return null;
    };
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = (refreshKey: number) =>
      act(async () => {
        root.render(
          React.createElement(
            NLEProvider,
            { projectId: "demo", refreshKey },
            React.createElement(Probe),
          ),
        );
        await Promise.resolve();
      });
    await render(0);
    const live = makeLiveIframe();
    await act(async () => {
      ctx!.iframeRef.current = live;
      ctx!.onIframeLoad();
    });

    // runPlacementSteps ends in exactly one reloadPreview: App bumps refreshKey.
    await render(1);
    expect(live.style.visibility).toBe("");
    expect(ctx!.iframeRef.current).toBe(live);
    const shadow = ctx!.previewSlots.find((s) => s.role === "shadow");
    expect(shadow).toBeDefined();
    expect(ctx!.previewSlots).toHaveLength(2);

    const shadowIframe = makeLiveIframe();
    await act(async () => {
      ctx!.setShadowIframeNode(shadowIframe);
      ctx!.onShadowIframeLoad(shadow!.gen);
      ctx!.onShadowReadyChange(shadow!.gen, true);
    });
    expect(ctx!.previewSlots).toEqual([{ ...shadow!, role: "live" }]);
    expect(ctx!.iframeRef.current).toBe(shadowIframe);

    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });
});

describe("shadow reload readiness and failure", () => {
  function beginReload(options: Parameters<typeof renderTimelinePlayerHarness>[0] = {}) {
    const harness = renderTimelinePlayerHarness(options);
    const { adapter, win } = makeAdapterWindow();
    adapter.seek = vi.fn(adapter.seek);
    const live = makeFakeIframe(win);
    act(() => {
      harness.getApi().iframeRef.current = live;
      harness.getApi().onIframeLoad();
    });
    adapter.pause.mockClear();
    act(() => harness.getApi().refreshPlayer());
    const gen = harness.getApi().previewSlots.find((s) => s.role === "shadow")!.gen;
    return { ...harness, live, liveAdapter: adapter, gen };
  }

  it("pauses the live adapter when a reload starts", () => {
    const { liveAdapter, root } = beginReload();
    expect(liveAdapter.pause).toHaveBeenCalled();
    unmount(root);
  });

  it("keeps a playing film playing through a reload, from where the live frame had reached", () => {
    const { getApi, root } = renderTimelinePlayerHarness();
    const { adapter: liveAdapter, win } = makeAdapterWindow();
    act(() => {
      getApi().iframeRef.current = makeFakeIframe(win);
      getApi().onIframeLoad();
    });
    usePlayerStore.setState({ timelineReady: true });
    act(() => getApi().play());
    liveAdapter.pause.mockClear();
    liveAdapter.seek(4.2);

    act(() => getApi().refreshPlayer());
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(liveAdapter.pause).not.toHaveBeenCalled();

    liveAdapter.seek(5.5);
    const gen = getApi().previewSlots.find((s) => s.role === "shadow")!.gen;
    const shadow = makeShadowWithSpies();
    act(() => {
      getApi().setShadowIframeNode(shadow.iframe);
      getApi().onShadowIframeLoad(gen);
      getApi().onShadowReadyChange(gen, true);
    });
    expect(getApi().iframeRef.current).toBe(shadow.iframe);
    expect(liveAdapter.pause).toHaveBeenCalled();
    expect(shadow.adapter.getTime()).toBe(5.5);
    expect(shadow.adapter.isPlaying()).toBe(true);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    unmount(root);
  });

  it("keeps where a film was paused while the reload loaded", () => {
    const { getApi, root } = renderTimelinePlayerHarness();
    const { adapter: liveAdapter, win } = makeAdapterWindow();
    act(() => {
      getApi().iframeRef.current = makeFakeIframe(win);
      getApi().onIframeLoad();
    });
    usePlayerStore.setState({ timelineReady: true });
    act(() => getApi().play());
    liveAdapter.seek(4.2);
    act(() => getApi().refreshPlayer());

    liveAdapter.seek(7);
    act(() => getApi().pause());
    const gen = getApi().previewSlots.find((s) => s.role === "shadow")!.gen;
    const shadow = makeShadowWithSpies();
    act(() => {
      getApi().setShadowIframeNode(shadow.iframe);
      getApi().onShadowIframeLoad(gen);
      getApi().onShadowReadyChange(gen, true);
    });
    expect(getApi().iframeRef.current).toBe(shadow.iframe);
    expect(shadow.adapter.getTime()).toBe(7);
    expect(shadow.adapter.isPlaying()).toBe(false);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    unmount(root);
  });

  it("stops a playing film at the new end when the edit cut it short of the live time", () => {
    const { getApi, root } = renderTimelinePlayerHarness();
    const { adapter: liveAdapter, win } = makeAdapterWindow();
    act(() => {
      getApi().iframeRef.current = makeFakeIframe(win);
      getApi().onIframeLoad();
    });
    usePlayerStore.setState({ timelineReady: true });
    act(() => getApi().play());
    act(() => getApi().refreshPlayer());

    liveAdapter.seek(12);
    const gen = getApi().previewSlots.find((s) => s.role === "shadow")!.gen;
    const shorter = makeAdapterWindow({ duration: 10 });
    act(() => {
      getApi().setShadowIframeNode(makeFakeIframe(shorter.win));
      getApi().onShadowIframeLoad(gen);
      getApi().onShadowReadyChange(gen, true);
    });
    expect(shorter.adapter.getTime()).toBe(10);
    expect(shorter.adapter.isPlaying()).toBe(false);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    unmount(root);
  });

  it("does not promote a shadow whose loader is still up, and promotes once it clears", () => {
    const { getApi, live, gen, root } = beginReload();
    const shadow = makeShadowWithSpies();
    act(() => {
      getApi().setShadowIframeNode(shadow.iframe);
      getApi().onShadowIframeLoad(gen);
    });
    expect(getApi().iframeRef.current).toBe(live);
    expect(getApi().previewSlots).toHaveLength(2);

    act(() => getApi().onShadowReadyChange(gen, true));
    expect(getApi().iframeRef.current).toBe(shadow.iframe);
    expect(getApi().previewSlots).toEqual([{ gen, role: "live", url: expect.any(String) }]);
    unmount(root);
  });

  it("promotes only once the shadow's restore seek has painted its frame", async () => {
    const { getApi, live, gen, root } = beginReload();
    const shadow = makeShadowWithSpies();
    let seekPainted = () => {};
    Object.assign(shadow.iframe.contentWindow!, {
      __hfWaitForSeekCompletion: () => new Promise<void>((resolve) => (seekPainted = resolve)),
    });
    act(() => {
      getApi().setShadowIframeNode(shadow.iframe);
      getApi().onShadowIframeLoad(gen);
      getApi().onShadowReadyChange(gen, true);
    });
    expect(getApi().iframeRef.current).toBe(live);

    await act(async () => seekPainted());
    expect(getApi().iframeRef.current).toBe(shadow.iframe);
    unmount(root);
  });

  it("promotes when the loader clears before the adapter is ready", () => {
    const { getApi, gen, root } = beginReload();
    const shadow = makeShadowWithSpies();
    act(() => {
      getApi().setShadowIframeNode(shadow.iframe);
      getApi().onShadowReadyChange(gen, true);
    });
    expect(getApi().previewSlots).toHaveLength(2);
    act(() => getApi().onShadowIframeLoad(gen));
    expect(getApi().iframeRef.current).toBe(shadow.iframe);
    unmount(root);
  });

  it("drops a shadow that never becomes ready, keeps the live frame and reports why", () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onPreviewReloadFailed = vi.fn();
    const { getApi, live, root } = beginReload({ onPreviewReloadFailed });
    expect(getApi().previewSlots).toHaveLength(2);

    act(() => void vi.advanceTimersByTime(FULL_WAIT_MS));

    expect(getApi().previewSlots).toEqual([{ gen: 0, role: "live" }]);
    expect(getApi().iframeRef.current).toBe(live);
    expect(live.style.visibility).toBe("");
    expect(onPreviewReloadFailed).toHaveBeenCalledWith(expect.stringContaining("too long"));
    expect(onPreviewReloadFailed).toHaveBeenCalledWith(
      expect.stringContaining("still waiting for the page and its runtime to load"),
    );
    expect(consoleError).toHaveBeenCalled();
    unmount(root);
  });

  it("keeps a slow shadow pending past 5s and fails it only once all budgets are spent", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onPreviewReloadFailed = vi.fn();
    const { getApi, gen, root } = beginReload({ onPreviewReloadFailed });
    const silent = makeFakeIframe({});
    act(() => {
      getApi().setShadowIframeNode(silent);
      getApi().onShadowIframeLoad(gen);
    });

    act(() => void vi.advanceTimersByTime(5001));
    expect(getApi().previewSlots).toHaveLength(2);
    expect(onPreviewReloadFailed).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(FULL_WAIT_MS - 5001 - 1));
    expect(onPreviewReloadFailed).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(getApi().previewSlots).toEqual([{ gen: 0, role: "live" }]);
    expect(onPreviewReloadFailed).toHaveBeenCalledWith(expect.stringContaining("too long"));
    expect(onPreviewReloadFailed).toHaveBeenCalledWith(
      expect.stringContaining("still waiting for the page and its runtime to load"),
    );
    unmount(root);
  });

  const loaded = { URL: "http://127.0.0.1/preview", readyState: "complete" };
  it.each([
    ["no-page", {}, { ...loaded, URL: "about:blank" }],
    ["page-loading", {}, { ...loaded, readyState: "loading" }],
    ["startup-error", { __hfStartupError: "failed", __hyperframes: {} }, loaded],
    ["runtime-not-run", {}, loaded],
    // Its runtime ran, but the composition's scripts never finished (fonts that never load, say).
    ["scripts-waiting", { __hyperframes: {} }, loaded],
    ["no-player", { __hyperframes: {}, __hyperframeRuntimeBootstrapped: true }, loaded],
  ])(
    "says its page got to %s when a shadow gives up waiting for the runtime",
    (phase, win, doc) => {
      vi.useFakeTimers();
      vi.spyOn(console, "error").mockImplementation(() => {});
      const onPreviewReloadFailed = vi.fn();
      const { getApi, gen, root } = beginReload({ onPreviewReloadFailed });
      const shadow = makeFakeIframe(win);
      Object.defineProperty(shadow, "contentDocument", { value: doc });
      act(() => {
        getApi().setShadowIframeNode(shadow);
        getApi().onShadowIframeLoad(gen);
      });
      act(() => void vi.advanceTimersByTime(FULL_WAIT_MS));
      expect(onPreviewReloadFailed).toHaveBeenCalledWith(
        expect.stringContaining(`Its page had got to: ${phase}.`),
      );
      unmount(root);
    },
  );

  it("names the timeline when a shadow's runtime runs but never reports a length", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onPreviewReloadFailed = vi.fn();
    const { getApi, gen, root } = beginReload({ onPreviewReloadFailed });
    const lengthless = makeFakeIframe(makeAdapterWindow({ duration: 0 }).win);
    act(() => {
      getApi().setShadowIframeNode(lengthless);
      getApi().onShadowIframeLoad(gen);
      getApi().onShadowReadyChange(gen, true);
    });

    act(() => void vi.advanceTimersByTime(FULL_WAIT_MS));

    expect(onPreviewReloadFailed).toHaveBeenCalledWith(
      expect.stringContaining("still waiting for its timeline to be ready"),
    );
    unmount(root);
  });

  it("names the loaders when a shadow with a ready timeline never clears them", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onPreviewReloadFailed = vi.fn();
    const { getApi, gen, root } = beginReload({ onPreviewReloadFailed });
    const shadow = makeShadowWithSpies();
    act(() => {
      getApi().setShadowIframeNode(shadow.iframe);
      getApi().onShadowIframeLoad(gen);
    });

    act(() => void vi.advanceTimersByTime(FULL_WAIT_MS));

    expect(onPreviewReloadFailed).toHaveBeenCalledWith(
      expect.stringContaining("still waiting for its loaders to clear"),
    );
    unmount(root);
  });

  // A busy machine: the edit's shadow paints after one budget; dropping it left the stage on the pre-edit file.
  it("promotes a shadow that paints after its first budget instead of dropping the edit", () => {
    vi.useFakeTimers();
    const onPreviewReloadFailed = vi.fn();
    const { getApi, gen, root } = beginReload({ onPreviewReloadFailed });
    const shadow = makeShadowWithSpies();
    act(() => {
      getApi().setShadowIframeNode(shadow.iframe);
      getApi().onShadowIframeLoad(gen);
    });

    act(() => void vi.advanceTimersByTime(SHADOW_READY_TIMEOUT_MS + 2000));
    expect(onPreviewReloadFailed).not.toHaveBeenCalled();
    act(() => getApi().onShadowReadyChange(gen, true));
    expect(getApi().iframeRef.current).toBe(shadow.iframe);
    unmount(root);
  });

  it("promotes a shadow whose runtime boots after Studio's own 5 s readiness wait", () => {
    vi.useFakeTimers();
    const onPreviewReloadFailed = vi.fn();
    const { getApi, gen, root } = beginReload({ onPreviewReloadFailed });
    const { win } = makeAdapterWindow();
    const booting: Record<string, unknown> = { ...win, __player: undefined };
    const iframe = makeFakeIframe(booting);
    act(() => {
      getApi().setShadowIframeNode(iframe);
      getApi().onShadowIframeLoad(gen);
    });

    act(() => void vi.advanceTimersByTime(10_000));
    booting.__player = win.__player;
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", { data: { source: "hf-preview", type: "state" } }),
      );
      getApi().onShadowReadyChange(gen, true);
    });
    expect(getApi().iframeRef.current).toBe(iframe);
    expect(onPreviewReloadFailed).not.toHaveBeenCalled();
    unmount(root);
  });

  it("gives a reload that replaces a slow one its own full set of budgets", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onPreviewReloadFailed = vi.fn();
    const { getApi, root } = beginReload({ onPreviewReloadFailed });
    act(() => void vi.advanceTimersByTime(SHADOW_READY_TIMEOUT_MS + 1000));

    act(() => getApi().refreshPlayer());
    act(() => void vi.advanceTimersByTime(FULL_WAIT_MS - 1));
    expect(onPreviewReloadFailed).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onPreviewReloadFailed).toHaveBeenCalledWith(expect.stringContaining("too long"));
    unmount(root);
  });

  it("does not spend the budget while the tab is hidden, and promotes once it is visible", () => {
    vi.useFakeTimers();
    const onPreviewReloadFailed = vi.fn();
    const setVisibility = stubVisibility("hidden");
    const { getApi, gen, root } = beginReload({ onPreviewReloadFailed });
    const shadow = makeShadowWithSpies();
    act(() => {
      getApi().setShadowIframeNode(shadow.iframe);
      getApi().onShadowIframeLoad(gen);
    });

    // A hidden tab renders no frames, so readiness cannot arrive; the wall clock must not fail it.
    act(() => void vi.advanceTimersByTime(SHADOW_READY_TIMEOUT_MS * 3));
    expect(onPreviewReloadFailed).not.toHaveBeenCalled();
    expect(getApi().previewSlots).toHaveLength(2);

    act(() => setVisibility("visible"));
    act(() => getApi().onShadowReadyChange(gen, true));
    expect(getApi().iframeRef.current).toBe(shadow.iframe);
    expect(onPreviewReloadFailed).not.toHaveBeenCalled();
    unmount(root);
  });

  it("restarts the full budget when a hidden tab becomes visible, then fails a shadow that stays silent", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onPreviewReloadFailed = vi.fn();
    const setVisibility = stubVisibility("visible");
    const { getApi, live, root } = beginReload({ onPreviewReloadFailed });

    act(() => void vi.advanceTimersByTime(SHADOW_READY_TIMEOUT_MS - 1000));
    act(() => setVisibility("hidden"));
    act(() => void vi.advanceTimersByTime(SHADOW_READY_TIMEOUT_MS));
    expect(onPreviewReloadFailed).not.toHaveBeenCalled();

    act(() => setVisibility("visible"));
    act(() => void vi.advanceTimersByTime(FULL_WAIT_MS - 1));
    expect(onPreviewReloadFailed).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onPreviewReloadFailed).toHaveBeenCalledWith(expect.stringContaining("too long"));
    expect(getApi().iframeRef.current).toBe(live);
    unmount(root);
  });

  // A window behind others on some Linux desktops draws no frames yet reports visible; readiness needs frames.
  it("does not spend the budget while the window draws no frames, and promotes once they return", () => {
    vi.useFakeTimers();
    const frames = holdFrames();
    const onPreviewReloadFailed = vi.fn();
    const { getApi, gen, root } = beginReload({ onPreviewReloadFailed });
    const shadow = makeShadowWithSpies();
    act(() => {
      getApi().setShadowIframeNode(shadow.iframe);
      getApi().onShadowIframeLoad(gen);
    });

    act(() => void vi.advanceTimersByTime(FULL_WAIT_MS * 2));
    expect(onPreviewReloadFailed).not.toHaveBeenCalled();
    expect(getApi().previewSlots).toHaveLength(2);

    act(() => frames.resume());
    act(() => getApi().onShadowReadyChange(gen, true));
    expect(getApi().iframeRef.current).toBe(shadow.iframe);
    unmount(root);
  });

  it("gives a shadow its full budget once frames return, then fails one that stays silent", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const frames = holdFrames();
    const onPreviewReloadFailed = vi.fn();
    const { getApi, live, root } = beginReload({ onPreviewReloadFailed });

    act(() => void vi.advanceTimersByTime(FULL_WAIT_MS));
    act(() => frames.resume());
    act(() => void vi.advanceTimersByTime(FULL_WAIT_MS - 1));
    expect(onPreviewReloadFailed).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onPreviewReloadFailed).toHaveBeenCalledWith(expect.stringContaining("too long"));
    expect(getApi().iframeRef.current).toBe(live);
    unmount(root);
  });

  it("keeps a reload's own budget when the frames a replaced one waited on return", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const frames = holdFrames();
    const onPreviewReloadFailed = vi.fn();
    const { getApi, root } = beginReload({ onPreviewReloadFailed });
    act(() => void vi.advanceTimersByTime(SHADOW_READY_TIMEOUT_MS + 1000));

    act(() => getApi().refreshPlayer());
    act(() => frames.resume());
    act(() => void vi.advanceTimersByTime(FULL_WAIT_MS));
    expect(onPreviewReloadFailed).toHaveBeenCalledWith(expect.stringContaining("too long"));
    unmount(root);
  });

  it("still drops and reports a shadow whose window throws on access", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onPreviewReloadFailed = vi.fn();
    const { getApi, live, gen, root } = beginReload({ onPreviewReloadFailed });
    const crossOrigin = makeFakeIframe(
      Object.defineProperty({}, "__player", {
        get: () => {
          throw new DOMException("Blocked a frame", "SecurityError");
        },
      }),
    );
    act(() => getApi().setShadowIframeNode(crossOrigin));

    act(() => getApi().onShadowError(gen, "Composition timeline not found after 8s"));

    expect(getApi().previewSlots).toEqual([{ gen: 0, role: "live" }]);
    expect(getApi().iframeRef.current).toBe(live);
    expect(isPreviewChanging()).toBe(false);
    expect(onPreviewReloadFailed).toHaveBeenCalledTimes(1);
    expect(onPreviewReloadFailed).toHaveBeenCalledWith(
      expect.stringContaining("still waiting for the page and its runtime to load"),
    );
    unmount(root);
  });

  it("drops a shadow whose document reports an error and reports the cause", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onPreviewReloadFailed = vi.fn();
    const { getApi, live, gen, root } = beginReload({ onPreviewReloadFailed });

    act(() => getApi().onShadowError(gen, "Composition timeline not found after 8s"));

    expect(getApi().previewSlots).toEqual([{ gen: 0, role: "live" }]);
    expect(getApi().iframeRef.current).toBe(live);
    expect(onPreviewReloadFailed).toHaveBeenCalledWith(
      expect.stringContaining("Composition timeline not found after 8s"),
    );
    unmount(root);
  });

  // An agent's edit moves the page away for a few saves: each reload is refused until it is back.
  it.each([
    [404, "warn"],
    [500, "error"],
  ] as const)("reports a reload the server refused with %i as a console %s", (status, level) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const onPreviewReloadFailed = vi.fn();
    const { getApi, live, gen, root } = beginReload({ onPreviewReloadFailed });

    act(() => getApi().onShadowError(gen, refusedPreviewMessage(status)));

    expect(getApi().iframeRef.current).toBe(live);
    expect(onPreviewReloadFailed).toHaveBeenCalledOnce();
    const said = (spy: typeof warn) =>
      spy.mock.calls.some(([text]) => String(text).includes(`(HTTP ${status})`));
    expect([said(warn), said(error)]).toEqual([level === "warn", level === "error"]);
    unmount(root);
  });

  it("runs no load side effects for a superseded shadow", () => {
    const { getApi, gen, root } = beginReload();
    usePlayerStore.getState().setCurrentTime(7);
    const stale = makeShadowWithSpies();
    act(() => {
      getApi().setShadowIframeNode(stale.iframe);
      getApi().refreshPlayer();
    });
    act(() => getApi().onShadowIframeLoad(gen));
    expect(stale.adapter.seek).not.toHaveBeenCalled();
    unmount(root);
  });
});

describe("shadow reload store ownership and readiness", () => {
  function setup(options?: Parameters<typeof renderTimelinePlayerHarness>[0]) {
    const harness = renderTimelinePlayerHarness(options);
    const live = makeAdapterWindow({ duration: 10 });
    const liveIframe = makeFakeIframe(live.win);
    act(() => {
      harness.getApi().iframeRef.current = liveIframe;
      harness.getApi().onIframeLoad();
    });
    act(() => harness.getApi().refreshPlayer());
    const gen = harness.getApi().previewSlots.find((s) => s.role === "shadow")!.gen;
    const shadow = makeAdapterWindow({ duration: 42 });
    const shadowIframe = makeFakeIframe(shadow.win);
    act(() => harness.getApi().setShadowIframeNode(shadowIframe));
    return { ...harness, gen, shadowIframe, liveIframe };
  }

  it("does not promote when the loader re-raises after it had cleared", () => {
    const { getApi, gen, liveIframe, root } = setup();
    act(() => {
      getApi().onShadowReadyChange(gen, true);
      getApi().onShadowReadyChange(gen, false);
      getApi().onShadowIframeLoad(gen);
    });
    expect(getApi().iframeRef.current).toBe(liveIframe);
    act(() => getApi().onShadowReadyChange(gen, true));
    expect(getApi().iframeRef.current).not.toBe(liveIframe);
    unmount(root);
  });

  it("keeps the old timeline in the store until the shadow is promoted", () => {
    const { getApi, gen, root } = setup();
    const before = usePlayerStore.getState().duration;
    act(() => getApi().onShadowIframeLoad(gen));
    expect(usePlayerStore.getState().duration).toBe(before);
    act(() => getApi().onShadowReadyChange(gen, true));
    expect(usePlayerStore.getState().duration).toBe(42);
    unmount(root);
  });

  it("takes a section the edit removed off the timeline, though the old document still has it", () => {
    const { getApi, gen, liveIframe, shadowIframe, root } = setup();
    const host = (id: string) =>
      `<div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="0" data-duration="3"></div>`;
    liveIframe.contentDocument!.body.innerHTML = `<div data-composition-id="main">${host("benefit")}<p id="a"></p></div>`;
    shadowIframe.contentDocument!.body.innerHTML = `<div data-composition-id="main"><p id="a"></p></div>`;
    const a = { id: "a", domId: "a", tag: "p", start: 0, duration: 3, track: 0 };
    const benefit = {
      id: "benefit",
      domId: "benefit",
      tag: "div",
      kind: "composition" as const,
      start: 0,
      duration: 3,
      track: 1,
      compositionSrc: "compositions/benefit.html",
    };
    act(() => usePlayerStore.getState().setElements([a, benefit]));
    (shadowIframe.contentWindow as Record<string, unknown>).__clipManifest = {
      source: "hf-preview",
      type: "timeline",
      durationInFrames: 1260,
      clips: [
        { id: "a", label: "A", start: 0, duration: 3, track: 0, kind: "element", tagName: "p" },
      ],
    };
    act(() => getApi().onShadowIframeLoad(gen));
    act(() => getApi().onShadowReadyChange(gen, true));
    expect(usePlayerStore.getState().elements.map((element) => element.id)).toEqual(["a"]);
    unmount(root);
  });

  it("keeps a section the new document still hosts but its manifest misses, without dropping it once", () => {
    const { getApi, gen, liveIframe, shadowIframe, root } = setup();
    const film = `<div data-composition-id="main"><div id="benefit" data-composition-id="benefit"
      data-composition-src="compositions/benefit.html" data-start="0" data-duration="3"></div><p id="a"></p></div>`;
    liveIframe.contentDocument!.body.innerHTML = film;
    shadowIframe.contentDocument!.body.innerHTML = film;
    const a = { id: "a", domId: "a", tag: "p", start: 0, duration: 3, track: 0 };
    // As enrichment adds it: no kind.
    const benefit = {
      id: "benefit",
      domId: "benefit",
      tag: "div",
      start: 0,
      duration: 3,
      track: 1,
      compositionSrc: "compositions/benefit.html",
    };
    act(() => usePlayerStore.getState().setElements([a, benefit]));
    const seen: string[][] = [];
    const stop = usePlayerStore.subscribe((state) =>
      seen.push(state.elements.map((element) => element.id)),
    );
    (shadowIframe.contentWindow as Record<string, unknown>).__clipManifest = {
      source: "hf-preview",
      type: "timeline",
      durationInFrames: 1260,
      clips: [
        { id: "a", label: "A", start: 0, duration: 3, track: 0, kind: "element", tagName: "p" },
      ],
    };
    act(() => getApi().onShadowIframeLoad(gen));
    act(() => getApi().onShadowReadyChange(gen, true));
    stop();
    expect(seen.every((ids) => ids.includes("benefit"))).toBe(true);
    unmount(root);
  });

  it("never writes a failed shadow's timeline into the store", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { getApi, gen, root } = setup();
    const before = usePlayerStore.getState().duration;
    act(() => getApi().onShadowIframeLoad(gen));
    act(() => getApi().onShadowError(gen, "boom"));
    expect(usePlayerStore.getState().duration).toBe(before);
    unmount(root);
  });

  it("a composition switch clears the refresh flags so the next load restores the store playhead", () => {
    const { getApi, liveIframe, root } = setup();
    const seek = vi.fn();
    (liveIframe.contentWindow as unknown as { __player: { seek: unknown } }).__player.seek = seek;
    usePlayerStore.getState().setCurrentTime(7);
    act(() => getApi().resetPreviewSlots());
    act(() => getApi().onIframeLoad());
    expect(seek).toHaveBeenCalledWith(7);
    unmount(root);
  });

  it("uses the latest failure callback for a timer armed before it changed", () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const first = vi.fn();
    const latest = vi.fn();
    const { getApi, rerender, root } = setup({ onPreviewReloadFailed: first });
    expect(getApi().previewSlots).toHaveLength(2);
    rerender({ onPreviewReloadFailed: latest });
    act(() => void vi.advanceTimersByTime(FULL_WAIT_MS));
    expect(latest).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    unmount(root);
  });
});

describe("NLEProvider iframe ref notifications", () => {
  it("tells the consumer about the reloaded iframe once, on promotion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    const { ensureMotionPathPluginLoaded } = await import("../../utils/gsapSoftReload");
    const onIframeRef = vi.fn();
    let ctx: NLEContextValue | null = null;
    const Probe = () => {
      ctx = useNLEContext();
      return null;
    };
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = (refreshKey: number) =>
      act(async () => {
        root.render(
          React.createElement(
            NLEProvider,
            { projectId: "demo", refreshKey, onIframeRef },
            React.createElement(Probe),
          ),
        );
        await Promise.resolve();
      });
    await render(0);
    const live = makeLiveIframe();
    await act(async () => {
      ctx!.iframeRef.current = live;
      ctx!.onIframeLoad();
    });
    onIframeRef.mockClear();
    vi.mocked(ensureMotionPathPluginLoaded).mockClear();

    await render(1);
    const callsAtBegin = onIframeRef.mock.calls.length;
    expect(onIframeRef.mock.calls.every(([iframe]) => iframe === live)).toBe(true);

    const shadow = ctx!.previewSlots.find((s) => s.role === "shadow")!;
    const shadowIframe = makeLiveIframe();
    await act(async () => {
      ctx!.setShadowIframeNode(shadowIframe);
      ctx!.onShadowIframeLoad(shadow.gen);
      ctx!.onShadowReadyChange(shadow.gen, true);
    });
    expect(onIframeRef).toHaveBeenCalledTimes(callsAtBegin + 1);
    expect(onIframeRef).toHaveBeenLastCalledWith(shadowIframe);
    expect(ensureMotionPathPluginLoaded).toHaveBeenCalledWith(shadowIframe);

    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });
});

function unmount(root: ReturnType<typeof createRoot>) {
  act(() => {
    root.unmount();
  });
}

/** A window that draws no frames although it reports visible: frames are held until `resume`, then one per 16 ms. */
function holdFrames() {
  let held: FrameRequestCallback[] = [];
  let flowing = false;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    if (flowing) return Number(setTimeout(() => callback(performance.now()), 16));
    held.push(callback);
    return held.length;
  });
  return {
    resume: () => {
      flowing = true;
      const waiting = held;
      held = [];
      for (const callback of waiting) callback(performance.now());
    },
  };
}

function stubVisibility(initial: DocumentVisibilityState) {
  let state = initial;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => state);
  return (next: DocumentVisibilityState) => {
    state = next;
    document.dispatchEvent(new Event("visibilitychange"));
  };
}

describe("a shadow reload loading while a write lands", () => {
  it("loads the file again instead of promoting the one it asked for", () => {
    const { getApi, root } = renderTimelinePlayerHarness();
    const liveIframe = makeLiveIframe();
    act(() => {
      getApi().iframeRef.current = liveIframe;
      getApi().onIframeLoad();
    });
    act(() => getApi().refreshPlayer());
    const asked = getApi().previewSlots.find((slot) => slot.role === "shadow")!;
    act(() => getApi().setShadowIframeNode(makeLiveIframe()));

    // An undo writes while that shadow is still loading.
    studioWriteHeaders();
    act(() => {
      getApi().onShadowIframeLoad(asked.gen);
      getApi().onShadowReadyChange(asked.gen, true);
    });

    expect(getApi().iframeRef.current).toBe(liveIframe);
    const loading = getApi().previewSlots.find((slot) => slot.role === "shadow")!;
    expect(loading.gen).not.toBe(asked.gen);
    unmount(root);
  });
});

describe("useTimelinePlayer scene swap", () => {
  function liveFilm(swap?: (html: string) => Promise<void>) {
    const { adapter, win } = makeAdapterWindow();
    const iframe = makeFakeIframe(swap ? { ...win, __hfSwapScenes: swap } : win);
    iframe.src = "http://localhost/api/projects/demo/preview";
    const harness = renderTimelinePlayerHarness();
    act(() => {
      harness.getApi().iframeRef.current = iframe;
      harness.getApi().onIframeLoad();
    });
    return { ...harness, adapter };
  }
  function playingFilm(swap: (html: string) => Promise<void>) {
    const film = liveFilm(swap);
    usePlayerStore.setState({ timelineReady: true });
    act(() => film.getApi().play());
    film.adapter.pause.mockClear();
    return film;
  }
  const roles = (api: ReturnType<ReturnType<typeof liveFilm>["getApi"]>) =>
    api.previewSlots.map((slot) => slot.role);
  const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

  it("swaps the rebuilt preview's scenes into the live preview with no shadow reload", async () => {
    const swap = vi.fn(async () => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>v2</html>"));
    const { getApi } = liveFilm(swap);
    act(() => getApi().refreshPlayer());
    await settle();
    expect(swap).toHaveBeenCalledWith("<html>v2</html>", expect.anything());
    expect(roles(getApi())).toEqual(["live"]);
  });

  it("counts as a preview change until the swap lands, so a canvas press waits for the new scenes", async () => {
    let reply: (r: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>((resolve) => (reply = resolve)),
    );
    const { getApi } = liveFilm(vi.fn(async () => {}));
    act(() => getApi().refreshPlayer());
    expect(isPreviewChanging()).toBe(true);
    reply(new Response("<html>v2</html>"));
    await settle();
    expect(isPreviewChanging()).toBe(false);
  });

  it("swaps the composition as it is now when a write lands while the HTML is loading", async () => {
    const swap = vi.fn(async () => {});
    const replies: Array<(r: Response) => void> = [];
    const bodies = ["<html>undone-once</html>", "<html>undone-twice</html>"];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>((resolve) => replies.push(resolve)),
    );
    const { getApi } = liveFilm(swap);

    act(() => getApi().refreshPlayer());
    // A second undo writes while the first one's preview HTML is still loading.
    studioWriteHeaders();
    replies[0]!(new Response(bodies[0]));
    await settle();

    expect(swap).not.toHaveBeenCalledWith(bodies[0], expect.anything());
    expect(replies).toHaveLength(2);
    replies[1]!(new Response(bodies[1]));
    await settle();
    expect(swap).toHaveBeenCalledWith(bodies[1], expect.anything());
  });

  it("gives up refetching and swaps what it has when writes never stop", async () => {
    const swap = vi.fn(async () => {});
    let fetches = 0;
    // The project stops moving well past the bound, so a swap that never gave up still ends.
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetches += 1;
      if (fetches < 20) studioWriteHeaders();
      return new Response("<html>vN</html>");
    });
    const { getApi } = liveFilm(swap);

    act(() => getApi().refreshPlayer());
    await settle();

    expect(fetches).toBe(6);
    expect(swap).toHaveBeenCalledWith("<html>vN</html>", expect.anything());
  });

  it("falls back to the full reload when the preview refuses the swap", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>v2</html>"));
    const { getApi } = liveFilm(async () => {
      throw new Error("the film changed outside its scenes");
    });
    act(() => getApi().refreshPlayer());
    await settle();
    expect(roles(getApi())).toEqual(["live", "shadow"]);
  });

  it("reloads the whole film at once when the preview cannot swap", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { getApi } = liveFilm();
    act(() => getApi().refreshPlayer());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(roles(getApi())).toEqual(["live", "shadow"]);
  });

  it("never swaps in an older document that arrives after a newer reload started", async () => {
    const swap = vi.fn(async () => {});
    const replies: Array<(r: Response) => void> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>((resolve) => replies.push(resolve)),
    );
    const { getApi } = liveFilm(swap);
    act(() => getApi().refreshPlayer());
    act(() => getApi().refreshPlayer());
    replies[1]!(new Response("<html>v3</html>"));
    await settle();
    replies[0]!(new Response("<html>v2</html>"));
    await settle();
    expect(swap.mock.calls).toEqual([["<html>v3</html>", expect.anything()]]);
    expect(roles(getApi())).toEqual(["live"]);
  });

  it("cancels an older swap still waiting when a newer edit starts, so it cannot land after that edit's reload", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("<html>v</html>"));
    let captionsArrive = () => {};
    const captions = new Promise<void>((resolve) => (captionsArrive = resolve));
    const landed: string[] = [];
    let calls = 0;
    // As the runtime does: the first waits for caption overrides, then refuses if cancelled; the second is refused.
    const swap = async (_html: string, signal?: AbortSignal) => {
      if (++calls > 1) throw new Error("the film changed outside its scenes");
      await captions;
      if (signal?.aborted) throw new Error("the swap was cancelled");
      landed.push("edit 1");
    };
    const { getApi } = liveFilm(swap);
    act(() => getApi().refreshPlayer());
    await settle();
    act(() => getApi().refreshPlayer());
    await settle();
    expect(roles(getApi())).toContain("shadow");
    captionsArrive();
    await settle();
    expect(landed).toEqual([]);
  });

  it("drops a pending swap's fallback once the preview was replaced, e.g. by a composition switch", async () => {
    let refuse!: (e: Error) => void;
    const swap = vi.fn(() => new Promise<void>((_, reject) => (refuse = reject)));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>v2</html>"));
    const { getApi } = liveFilm(swap);
    act(() => getApi().refreshPlayer());
    await settle();
    expect(swap).toHaveBeenCalledTimes(1);
    act(() => getApi().resetPreviewSlots());
    const next = makeFakeIframe(makeAdapterWindow().win);
    next.src = "http://localhost/api/projects/demo/preview/comp/compositions/intro.html";
    act(() => {
      getApi().iframeRef.current = next;
      getApi().onIframeLoad();
    });
    refuse(new Error("the preview was torn down during the swap"));
    await settle();
    expect(roles(getApi())).toEqual(["live"]);
  });

  it("skips the swap for an edit made while a full reload is in flight", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("<html>v2</html>"));
    const { getApi } = liveFilm(async () => {
      throw new Error("the film changed outside its scenes");
    });
    act(() => getApi().refreshPlayer());
    await settle();
    expect(roles(getApi())).toEqual(["live", "shadow"]);
    const firstShadow = getApi().previewSlots[1]!.gen;
    fetchSpy.mockClear();
    act(() => getApi().refreshPlayer());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getApi().previewSlots[1]!.gen).toBeGreaterThan(firstShadow);
  });

  it("keeps a playing film playing through a swap, ready to swap the next edit", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("<html>v2</html>"));
    const swap = vi.fn(async () => {});
    const { getApi, adapter } = playingFilm(swap);
    act(() => getApi().refreshPlayer());
    await settle();
    expect(adapter.pause).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(roles(getApi())).toEqual(["live"]);
    act(() => getApi().refreshPlayer());
    await settle();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(swap).toHaveBeenCalledTimes(2);
  });

  it("shows a playing film stopped at its new end when a swap cuts it short of the playhead", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>v2</html>"));
    let length = 6;
    // As the runtime's swap does when the edit ends the film at or before the playhead.
    const cutShort = async () => {
      length = 5;
      adapter.pause();
      adapter.seek(5);
    };
    const { getApi, adapter } = playingFilm(cutShort);
    adapter.getDuration = () => length;
    adapter.seek(5.5);
    act(() => getApi().refreshPlayer());
    await settle();
    await act(async () => void (await new Promise((r) => setTimeout(r, 50))));
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(usePlayerStore.getState().currentTime).toBe(5);
    expect(adapter.play).toHaveBeenCalledTimes(1);
    expect(roles(getApi())).toEqual(["live"]);
  });

  it("keeps a playing film playing through a refused swap, from where the live frame had reached", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>v2</html>"));
    const { getApi, adapter } = playingFilm(async () => {
      throw new Error("the film changed outside its scenes");
    });
    adapter.seek(3);
    act(() => getApi().refreshPlayer());
    // The live frame plays on while the swap is tried; the fallback reload starts from here.
    adapter.seek(4.5);
    await settle();
    expect(adapter.pause).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    const gen = getApi().previewSlots.find((s) => s.role === "shadow")!.gen;
    const shadow = makeShadowWithSpies();
    act(() => {
      getApi().setShadowIframeNode(shadow.iframe);
      getApi().onShadowIframeLoad(gen);
      getApi().onShadowReadyChange(gen, true);
    });
    expect(shadow.adapter.getTime()).toBe(4.5);
    expect(shadow.adapter.isPlaying()).toBe(true);
  });
});
