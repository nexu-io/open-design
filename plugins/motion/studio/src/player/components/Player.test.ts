// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasUnloadedAssets,
  Player,
  readPreviewErrorMessage,
  shouldShowCompositionLoadingOverlay,
} from "./Player";
import { usePlayerStore } from "../store/playerStore";
import { onPreviewDocumentLoaded } from "../sceneSwap";

vi.mock("@hyperframes/player", () => ({}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let lifecycleLog: string[] = [];

class TestHyperframesPlayer extends HTMLElement {
  readonly iframeElement = document.createElement("iframe");

  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    const addIframeListener = this.iframeElement.addEventListener.bind(this.iframeElement);
    this.iframeElement.addEventListener = ((type, listener, options) => {
      lifecycleLog.push(`iframe:${type}`);
      addIframeListener(type, listener, options);
    }) as typeof this.iframeElement.addEventListener;

    const addPlayerListener = this.addEventListener.bind(this);
    this.addEventListener = ((type, listener, options) => {
      lifecycleLog.push(`player:${type}`);
      addPlayerListener(type, listener, options);
    }) as typeof this.addEventListener;

    const setPlayerAttribute = this.setAttribute.bind(this);
    this.setAttribute = (name, value) => {
      if (name === "src") lifecycleLog.push("src");
      setPlayerAttribute(name, value);
    };
  }
}

if (!customElements.get("hyperframes-player")) {
  customElements.define("hyperframes-player", TestHyperframesPlayer);
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  lifecycleLog = [];
  document.body.innerHTML = "";
});

type PlayerProps = Parameters<typeof Player>[0];

async function mountPlayer(props: Partial<PlayerProps> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const render = () =>
    act(async () => {
      root?.render(
        createElement(Player, {
          directUrl: "/api/projects/demo/preview",
          onLoad: vi.fn(),
          suppressLoadingOverlay: true,
          ...props,
        }),
      );
      await Promise.resolve();
    });
  await render();

  const player = host.querySelector<TestHyperframesPlayer>("hyperframes-player");
  if (!player) throw new Error("player did not mount");
  const rerender = (next: Partial<PlayerProps>) => {
    Object.assign(props, next);
    return render();
  };
  return { host, player, rerender };
}

const twoFrames = () => act(async () => void (await new Promise((r) => setTimeout(r, 80))));

const flushEffects = () => act(async () => await Promise.resolve());

function createAudioIframe() {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const audio = iframe.contentDocument?.createElement("audio");
  expect(audio).toBeDefined();
  iframe.contentDocument?.body.appendChild(audio!);
  return { audio: audio!, iframe };
}

describe("preview errors", () => {
  it("reads the player probe error for the visible retry state", () => {
    expect(
      readPreviewErrorMessage(
        new CustomEvent("error", {
          detail: { message: "Composition timeline not found after 8s" },
        }),
      ),
    ).toBe("Composition timeline not found after 8s");
  });

  it("falls back when the player emits an unstructured error", () => {
    expect(readPreviewErrorMessage(new Event("error"))).toBe(
      "The composition preview did not become ready.",
    );
  });

  it("unmounts cleanly when the player element is already detached", async () => {
    const { player } = await mountPlayer();

    // A container re-render, a crossfade swap, or a page-translation extension
    // can detach the element before React tears the Player down. Cleanup must
    // not throw NotFoundError — the error boundary turns that into a
    // full-screen "Something went wrong".
    player.remove();

    expect(() => act(() => root?.unmount())).not.toThrow();
    root = null;
  });

  it("puts the preview on the player's once-a-second paused heartbeat", async () => {
    const { player } = await mountPlayer();
    expect(player.hasAttribute("low-power-idle")).toBe(true);
  });

  it("attaches lifecycle listeners before navigating the player", async () => {
    await mountPlayer();
    const srcIndex = lifecycleLog.indexOf("src");

    expect(srcIndex).toBeGreaterThan(-1);
    for (const listener of [
      "iframe:load",
      "player:click",
      "player:shadertransitionstate",
      "player:ready",
      "player:painted",
      "player:error",
    ]) {
      expect(lifecycleLog.indexOf(listener)).toBeGreaterThan(-1);
      expect(lifecycleLog.indexOf(listener)).toBeLessThan(srcIndex);
    }
  });

  it("retries a failed preview with a fresh player URL", async () => {
    const onPainted = vi.fn();
    const { host, player } = await mountPlayer({ onPainted });

    act(() => void player.dispatchEvent(new Event("painted")));

    act(() => {
      player.dispatchEvent(
        new CustomEvent("error", {
          detail: { message: "Composition timeline not found after 8s" },
        }),
      );
    });

    expect(host.querySelector('[data-testid="composition-preview-error"]')).not.toBeNull();
    const retry = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Retry preview",
    );
    if (!retry) throw new Error("retry action did not render");

    act(() => retry.click());

    const retryUrl = new URL(player.getAttribute("src") ?? "", window.location.origin);
    expect(retryUrl.searchParams.get("_hfStudioRetry")).toBe("1");
    expect(host.querySelector('[data-testid="composition-preview-error"]')).toBeNull();

    act(() => void player.dispatchEvent(new Event("painted")));
    expect(onPainted.mock.calls.map(([details]) => details.loadId)).toEqual([1, 2]);
  });
});

describe("callbacks after the player is already mounted", () => {
  it("runs the latest onLoad on a later load, not the one captured at mount", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { player, rerender } = await mountPlayer({ onLoad: first });
    await rerender({ onLoad: second });

    act(
      () => void (player as TestHyperframesPlayer).iframeElement.dispatchEvent(new Event("load")),
    );

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("loads the preview on the runtime's ready while a stalled font holds the window's load", async () => {
    const onLoad = vi.fn();
    const { player } = await mountPlayer({ onLoad });
    const iframe = (player as TestHyperframesPlayer).iframeElement;
    let page = {};
    Object.defineProperty(iframe, "contentDocument", { get: () => page });
    Object.defineProperty(iframe, "contentWindow", { get: () => ({ __playerReady: true }) });
    const announced = vi.fn();
    onPreviewDocumentLoaded(iframe, announced);

    act(() => void player.dispatchEvent(new Event("ready")));
    expect(onLoad).toHaveBeenCalledTimes(1);

    act(() => void iframe.dispatchEvent(new Event("load")));
    act(() => void player.dispatchEvent(new Event("ready")));
    expect(onLoad).toHaveBeenCalledTimes(1);

    page = {};
    act(() => void player.dispatchEvent(new Event("ready")));
    expect(onLoad).toHaveBeenCalledTimes(2);
    expect(announced).toHaveBeenCalledTimes(2);
  });

  it("leaves a ready that arrives before the page's runtime boots to the page's own load", async () => {
    const onLoad = vi.fn();
    const { player } = await mountPlayer({ onLoad });
    const iframe = (player as TestHyperframesPlayer).iframeElement;
    const page = {};
    let runtime: { __playerReady?: boolean } = {};
    Object.defineProperty(iframe, "contentDocument", { get: () => page });
    Object.defineProperty(iframe, "contentWindow", { get: () => runtime });

    act(() => void player.dispatchEvent(new Event("ready")));
    expect(onLoad).not.toHaveBeenCalled();

    act(() => void iframe.dispatchEvent(new Event("load")));
    expect(onLoad).toHaveBeenCalledTimes(1);

    runtime = { __playerReady: true };
    act(() => void player.dispatchEvent(new Event("ready")));
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it("reports the preview error cause", async () => {
    const onPreviewError = vi.fn();
    const { player } = await mountPlayer({ onPreviewError });
    act(() => {
      player.dispatchEvent(new CustomEvent("error", { detail: { message: "boom" } }));
    });
    expect(onPreviewError).toHaveBeenCalledWith("boom");
  });
});

describe("ready to show", () => {
  const loadAndReady = (player: TestHyperframesPlayer) =>
    act(() => {
      player.iframeElement.dispatchEvent(new Event("load"));
      player.dispatchEvent(new Event("ready"));
    });
  const shaderState = (player: TestHyperframesPlayer, loading: boolean) =>
    act(() => {
      player.dispatchEvent(
        new CustomEvent("shadertransitionstate", {
          detail: { state: { loading, ready: !loading } },
        }),
      );
    });

  const painted = (player: TestHyperframesPlayer) =>
    act(() => void player.dispatchEvent(new Event("painted")));

  it("waits two animation frames before notifying that the preview can show", async () => {
    const callbacks: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callbacks.push(callback);
        return callbacks.length;
      });
    try {
      const onReadyToShowChange = vi.fn();
      const { player } = await mountPlayer({ onReadyToShowChange });
      const el = player as TestHyperframesPlayer;

      loadAndReady(el);
      painted(el);
      await flushEffects();
      expect(onReadyToShowChange).not.toHaveBeenCalledWith(true);
      expect(callbacks).toHaveLength(1);

      act(() => callbacks.shift()?.(0));
      await flushEffects();
      expect(onReadyToShowChange).not.toHaveBeenCalledWith(true);
      expect(callbacks).toHaveLength(1);

      act(() => callbacks.shift()?.(16));
      await flushEffects();
      expect(onReadyToShowChange).toHaveBeenLastCalledWith(true);
    } finally {
      requestAnimationFrame.mockRestore();
    }
  });

  it("promotes only once the player reports painted, not at ready or assetsready", async () => {
    const onReadyToShowChange = vi.fn();
    const { player } = await mountPlayer({ onReadyToShowChange });
    const el = player as TestHyperframesPlayer;

    loadAndReady(el);
    await twoFrames();
    expect(onReadyToShowChange).not.toHaveBeenCalledWith(true);

    act(() => void el.dispatchEvent(new Event("assetsready")));
    await twoFrames();
    expect(onReadyToShowChange).not.toHaveBeenCalledWith(true);

    painted(el);
    await twoFrames();
    expect(onReadyToShowChange).toHaveBeenLastCalledWith(true);

    act(() => void el.iframeElement.dispatchEvent(new Event("load")));
    expect(onReadyToShowChange).toHaveBeenLastCalledWith(false);
  });

  it("can show a document whose player was ready and painted before its load event", async () => {
    const onReadyToShowChange = vi.fn();
    const { player } = await mountPlayer({ onReadyToShowChange });
    const el = Object.assign(player as TestHyperframesPlayer, { ready: true, painted: true });

    act(() => {
      el.dispatchEvent(new Event("ready"));
      el.dispatchEvent(new Event("painted"));
      el.iframeElement.dispatchEvent(new Event("load"));
    });
    await twoFrames();
    expect(onReadyToShowChange).toHaveBeenLastCalledWith(true);

    for (const state of [
      { ready: false, painted: true },
      { ready: true, painted: false },
    ]) {
      Object.assign(el, state);
      act(() => void el.iframeElement.dispatchEvent(new Event("load")));
      expect(onReadyToShowChange).toHaveBeenLastCalledWith(false);
    }
  });

  it("marks the preview booted when it can show and play, not at ready", async () => {
    usePlayerStore.setState({ previewBooted: false });
    const { player } = await mountPlayer({});
    const el = player as TestHyperframesPlayer;

    loadAndReady(el);
    act(() => void el.dispatchEvent(new Event("assetsready")));
    await twoFrames();
    expect(usePlayerStore.getState().previewBooted).toBe(false);

    painted(el);
    await twoFrames();
    expect(usePlayerStore.getState().previewBooted).toBe(true);
  });

  it("marks the preview booted at its first frame while media is still buffering", async () => {
    usePlayerStore.setState({ previewBooted: false });
    const onReadyToShowChange = vi.fn();
    const { player } = await mountPlayer({ onReadyToShowChange });
    const el = player as TestHyperframesPlayer;
    document.body.appendChild(el.iframeElement);
    const doc = el.iframeElement.contentDocument!;
    const audio = doc.createElement("audio");
    Object.defineProperty(audio, "readyState", { value: 0, configurable: true });
    Object.defineProperty(audio, "networkState", { value: 2, configurable: true });
    doc.body.appendChild(audio);

    loadAndReady(el);
    painted(el);
    await twoFrames();
    expect(onReadyToShowChange).not.toHaveBeenCalledWith(true);
    expect(usePlayerStore.getState().previewBooted).toBe(true);
  });

  /** A first load whose one audio has no data yet: Studio's asset wait. */
  async function loadWithUnloadedMedia(props: Partial<PlayerProps>) {
    const { host, player } = await mountPlayer(props);
    const el = player as TestHyperframesPlayer;
    document.body.appendChild(el.iframeElement);
    const doc = el.iframeElement.contentDocument!;
    const audio = doc.createElement("audio");
    Object.defineProperty(audio, "readyState", { value: 0, configurable: true });
    Object.defineProperty(audio, "networkState", { value: 2, configurable: true });
    doc.body.appendChild(audio);
    loadAndReady(el);
    painted(el);
    await flushEffects();
    return host;
  }

  it("keeps its asset wait on a later load that only skips the composition cover", async () => {
    const host = await loadWithUnloadedMedia({ suppressLoadingOverlay: true });
    expect(host.textContent).toContain("Preparing preview assets");
  });

  it("draws no loader of its own when the host draws one, and still says the preview is loading", async () => {
    const onCompositionLoadingChange = vi.fn();
    const host = await loadWithUnloadedMedia({
      suppressLoadingOverlay: false,
      loadingUi: "host",
      onCompositionLoadingChange,
    });
    expect(host.textContent).not.toContain("Preparing preview assets");
    expect(host.textContent).not.toContain("Loading composition");
    expect(onCompositionLoadingChange).toHaveBeenLastCalledWith(true);
  });

  it("stops deferring editing work when the preview never shows", async () => {
    vi.useFakeTimers();
    try {
      usePlayerStore.setState({ previewBooted: false });
      await mountPlayer({});
      act(() => void vi.advanceTimersByTime(4999));
      expect(usePlayerStore.getState().previewBooted).toBe(false);
      act(() => void vi.advanceTimersByTime(1));
      expect(usePlayerStore.getState().previewBooted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports the document start time with the painted iframe", async () => {
    const onPainted = vi.fn();
    const now = vi.spyOn(performance, "now").mockReturnValue(100);
    const { player } = await mountPlayer({ onPainted });

    painted(player as TestHyperframesPlayer);

    expect(onPainted).toHaveBeenCalledWith({
      iframe: (player as TestHyperframesPlayer).iframeElement,
      startedAt: 100,
      loadId: 1,
    });
    now.mockRestore();
  });

  it("holds while the shader transition loader is up and fires once it clears", async () => {
    const onReadyToShowChange = vi.fn();
    const { player } = await mountPlayer({ onReadyToShowChange });
    const el = player as TestHyperframesPlayer;

    shaderState(el, true);
    loadAndReady(el);
    shaderState(el, true);
    await twoFrames();
    expect(onReadyToShowChange).not.toHaveBeenCalledWith(true);

    shaderState(el, false);
    painted(el);
    await twoFrames();
    expect(onReadyToShowChange).toHaveBeenLastCalledWith(true);

    shaderState(el, true);
    expect(onReadyToShowChange).toHaveBeenLastCalledWith(false);
  });

  it("does not fire for a document that failed to load", async () => {
    const onReadyToShowChange = vi.fn();
    const { player } = await mountPlayer({ onReadyToShowChange });
    act(() => {
      player.dispatchEvent(new CustomEvent("error", { detail: { message: "boom" } }));
    });
    await twoFrames();
    expect(onReadyToShowChange).not.toHaveBeenCalledWith(true);
  });
});

describe("preview canvas chrome", () => {
  it("does not paint Studio chrome on the scaled composition iframe", async () => {
    const { player } = await mountPlayer();
    const injectedStyles = Array.from(player.shadowRoot?.querySelectorAll("style") ?? []);

    expect(injectedStyles.some((style) => style.textContent?.includes("box-shadow"))).toBe(false);
  });
});

describe("composition loading overlay", () => {
  it("shows while the composition is loading", () => {
    expect(shouldShowCompositionLoadingOverlay(true)).toBe(true);
  });

  it("hides after the composition is ready", () => {
    expect(shouldShowCompositionLoadingOverlay(false)).toBe(false);
  });

  it("keeps the asset overlay up while media is still buffering", () => {
    const { audio, iframe } = createAudioIframe();
    Object.defineProperty(audio, "readyState", {
      value: 0,
      configurable: true,
    });
    Object.defineProperty(audio, "networkState", {
      value: 2,
      configurable: true,
    });

    expect(hasUnloadedAssets(iframe, false)).toBe(true);

    iframe.remove();
  });

  it("does not keep the asset overlay stuck on failed media sources", () => {
    const { audio, iframe } = createAudioIframe();
    Object.defineProperty(audio, "error", {
      value: { code: 4, message: "format error" },
      configurable: true,
    });
    Object.defineProperty(audio, "readyState", {
      value: 0,
      configurable: true,
    });
    Object.defineProperty(audio, "networkState", {
      value: 3,
      configurable: true,
    });

    expect(hasUnloadedAssets(iframe, false)).toBe(false);

    iframe.remove();
  });
});

describe("accelerated canvases", () => {
  it("are tracked in Studio's window, whose prototype a preview canvas gets when Studio reaches it first", () => {
    expect("__hfAccelTracked" in HTMLCanvasElement.prototype.getContext).toBe(true);
    expect(Reflect.get(window, "__hfAcceleratedCanvases")).toBeInstanceOf(WeakSet);
  });
});
