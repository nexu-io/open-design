// @vitest-environment happy-dom

import React, { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimelinePlayer } from "../../player/hooks/useTimelinePlayer";
import { NLEPreview, getPreviewPlayerKey } from "./NLEPreview";
import { resolvePreviewStageSize } from "./previewStage";
import { readPreviewComplexity } from "../../player/hooks/usePreviewFirstFrameTelemetry";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const playerMounts: string[] = [];
let livePlayerProps: { onReadyToShowChange?: (ready: boolean) => void } = {};

const measured = vi.hoisted(() => ({ size: null as { width: number; height: number } | null }));
vi.mock("../../utils/previewCompositionSize", async (original) => ({
  ...(await original<typeof import("../../utils/previewCompositionSize")>()),
  readPreviewCompositionSize: () => measured.size,
}));

vi.mock("../../player", async () => {
  const React = await import("react");

  return {
    Player: React.forwardRef(function MockPlayer(
      props: {
        onLoad?: () => void;
        onReadyToShowChange?: (ready: boolean) => void;
        suppressLoadingOverlay?: boolean;
        style?: React.CSSProperties;
      },
      ref: React.ForwardedRef<HTMLIFrameElement>,
    ) {
      if (!props.suppressLoadingOverlay) livePlayerProps = props;
      React.useEffect(() => {
        props.onLoad?.();
      }, [props]);
      React.useState(() => playerMounts.push(props.suppressLoadingOverlay ? "shadow" : "live"));

      return React.createElement("div", {
        ref: ref as React.ForwardedRef<HTMLDivElement>,
        "data-testid": "mock-player",
        style: props.style,
      });
    }),
  };
});

let resizeCallbacks: Array<() => void> = [];

class MockResizeObserver {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe() {
    const fire = () => this.cb([], this as unknown as ResizeObserver);
    resizeCallbacks.push(fire);
    fire();
  }
  disconnect() {}
}

const originalResizeObserver = globalThis.ResizeObserver;

function setRect(node: Element, rect: { width: number; height: number }) {
  Object.defineProperty(node, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: rect.width,
      bottom: rect.height,
      width: rect.width,
      height: rect.height,
      toJSON: () => ({}),
    }),
  });
}

function renderPreview(
  previewSlots: Array<{ gen: number; role: "live" | "shadow"; url?: string }> = [
    { gen: 0, role: "live" },
  ],
  {
    box = { width: 800, height: 600 },
    fillBox,
    compositionSizeHint,
  }: {
    box?: { width: number; height: number };
    fillBox?: boolean;
    compositionSizeHint?: { width: number; height: number };
  } = {},
) {
  resizeCallbacks = [];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const iframeRef = createRef<HTMLIFrameElement>();
  const render = (directUrl?: string, projectId = "timeline-edit-playground") =>
    act(() => {
      root.render(
        React.createElement(NLEPreview, {
          projectId,
          directUrl,
          iframeRef,
          onIframeLoad: () => {},
          previewSlots,
          onShadowIframeLoad: () => {},
          onShadowReadyChange: () => {},
          onShadowError: () => {},
          setShadowIframeNode: () => {},
          resetPreviewSlots: () => {},
          fillBox,
          compositionSizeHint,
        }),
      );
    });
  render();

  const viewport = host.querySelector('[aria-label="Composition preview"]') as HTMLDivElement;
  const stage = host.querySelector('[data-testid="preview-zoom-stage"]') as HTMLDivElement;
  expect(viewport).toBeTruthy();
  expect(stage).toBeTruthy();

  setRect(viewport, box);
  act(() => {
    for (const fire of resizeCallbacks) fire();
  });

  return {
    host,
    root,
    render,
    viewport,
    stage,
    openProject(projectId: string) {
      render(undefined, projectId);
    },
    cleanup() {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe("getPreviewPlayerKey", () => {
  it("uses projectId as key when no directUrl", () => {
    expect(getPreviewPlayerKey({ projectId: "timeline-edit-playground" })).toBe(
      "timeline-edit-playground",
    );
  });

  it("switches identity when drilling into a different directUrl", () => {
    expect(
      getPreviewPlayerKey({
        projectId: "timeline-edit-playground",
        directUrl: "/api/projects/timeline-edit-playground/preview",
      }),
    ).not.toBe(
      getPreviewPlayerKey({
        projectId: "timeline-edit-playground",
        directUrl: "/api/projects/timeline-edit-playground/preview/comp/compositions/intro.html",
      }),
    );
  });
});

describe("resolvePreviewStageSize", () => {
  it("reserves the ruler gutter on both sides of both axes", () => {
    const wide = { width: 1920, height: 1080 };
    const tall = { width: 1080, height: 1920 };
    expect(resolvePreviewStageSize(512, 402, wide, undefined, 16)).toEqual({
      width: 464,
      height: 261,
    });
    expect(resolvePreviewStageSize(512, 402, tall, undefined, 16)).toEqual({
      width: 199.125,
      height: 354,
    });
  });

  it("fits portrait composition dimensions by height in a narrow viewport", () => {
    expect(resolvePreviewStageSize(512, 402, { width: 1080, height: 1920 }, undefined)).toEqual({
      width: 217.125,
      height: 386,
    });
  });

  it("uses composition dimensions ahead of the legacy portrait fallback", () => {
    expect(resolvePreviewStageSize(512, 402, { width: 1920, height: 1080 }, true)).toEqual({
      width: 496,
      height: 279,
    });
  });
});

describe("NLEPreview", () => {
  it("counts timeline clips and media clips from the painted document", () => {
    const doc = new DOMParser().parseFromString(
      '<div data-composition-id="main" data-duration="10"><video data-start="0" data-duration="2"></video><audio data-start="2" data-duration="3"></audio><div data-start="5" data-duration="1"></div></div>',
      "text/html",
    );
    expect(readPreviewComplexity(doc)).toEqual({ clip_count: 3, media_clip_count: 2 });
  });
  beforeEach(() => {
    globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it("draws the canvas boundary on the preview stage", () => {
    const view = renderPreview();

    expect(view.stage.className).toContain(
      "shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_4px_32px_rgba(0,0,0,0.7)]",
    );
    view.cleanup();
  });

  it("pans the preview with middle mouse drag", () => {
    const view = renderPreview();
    const target = document.createElement("div");
    view.stage.appendChild(target);

    act(() => {
      target.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 1,
          button: 1,
          clientX: 240,
          clientY: 180,
        }),
      );
      document.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientX: 300,
          clientY: 220,
        }),
      );
      document.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 1,
        }),
      );
    });

    expect(view.stage.style.transform).toContain("translate3d(48px, 40px, 0)");
    view.cleanup();
  });

  it("pans the preview with a two-finger wheel gesture", () => {
    const view = renderPreview();
    const target = document.createElement("div");
    view.stage.appendChild(target);

    act(() => {
      target.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: 240,
          clientY: 180,
          deltaX: -30,
          deltaY: 24,
        }),
      );
    });

    expect(view.stage.style.transform).toContain("translate3d(30px, -24px, 0)");
    view.cleanup();
  });

  describe("zoom", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      localStorage.clear();
    });
    afterEach(() => {
      vi.useRealTimers();
      localStorage.clear();
    });

    /** A pinch (ctrl + wheel) over the preview, then the settle that follows it. */
    function pinchIn(view: ReturnType<typeof renderPreview>, steps: number) {
      act(() => {
        for (let step = 0; step < steps; step += 1) {
          const pinch = new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: 400,
            clientY: 300,
            deltaY: -10,
          });
          // happy-dom drops ctrlKey from the WheelEvent init; a trackpad pinch sets it.
          Object.defineProperty(pinch, "ctrlKey", { value: true });
          view.stage.dispatchEvent(pinch);
        }
      });
      act(() => vi.advanceTimersByTime(300));
    }
    const chip = (view: ReturnType<typeof renderPreview>) =>
      view.host.querySelector('[data-testid="preview-zoom-chip"]');
    const navigator = (view: ReturnType<typeof renderPreview>) =>
      view.host.querySelector('[data-testid="preview-zoom-navigator"]');

    it("labels a pan away from Fit without a zoom as panned", () => {
      const view = renderPreview();
      act(() => {
        view.stage.dispatchEvent(
          new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: -30, deltaY: 0 }),
        );
      });
      act(() => vi.advanceTimersByTime(300));
      expect(chip(view)?.textContent).toBe("Panned·Fit");
      view.cleanup();
    });

    it("keeps a click on Fit from reaching the pane behind it", () => {
      const view = renderPreview();
      // Above React's root, as the preview pane's handler is: React stops the event before either.
      const pane = vi.fn();
      document.body.addEventListener("pointerdown", pane);
      pinchIn(view, 10);
      act(() => {
        view.host
          .querySelector('[data-testid="preview-zoom-fit"]')!
          .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      });
      document.body.removeEventListener("pointerdown", pane);
      expect(pane).not.toHaveBeenCalled();
      view.cleanup();
    });

    it("opens at Fit even when an older Studio saved a zoom", () => {
      localStorage.setItem(
        "hf-studio-ui-preferences",
        JSON.stringify({ previewZoom: { zoomPercent: 245, panX: 0, panY: 0 } }),
      );
      const view = renderPreview();
      expect(view.stage.style.transform).toContain("scale(1)");
      expect(chip(view)).toBeNull();
      view.cleanup();
    });

    it("tells the preview how large it shows once a zoom settles, which the player cannot see", () => {
      const view = renderPreview();
      const frame = view.host.querySelector<HTMLElement>('[data-testid="mock-player"]')!;
      const postMessage = vi.fn();
      Object.defineProperty(frame, "contentWindow", { value: { postMessage } });
      Object.defineProperty(frame, "offsetWidth", { value: 800 });
      frame.getBoundingClientRect = () => ({ width: 1600 }) as DOMRect;

      pinchIn(view, 10);
      expect(postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: "set-display-scale", scale: 2 }),
        "*",
      );
      view.cleanup();
    });

    it("says how far it is zoomed, shows where in the frame, and Fit puts it back", () => {
      const view = renderPreview();
      expect([chip(view), navigator(view)]).toEqual([null, null]);

      pinchIn(view, 10);
      expect(chip(view)?.textContent).toMatch(/^Zoomed 2\d\d%·Fit$/);
      const region = view.host.querySelector<HTMLElement>(
        '[data-testid="preview-zoom-navigator-region"]',
      );
      expect(Number.parseFloat(region!.style.width)).toBeLessThan(100);

      act(() => {
        view.host.querySelector<HTMLButtonElement>('[data-testid="preview-zoom-fit"]')!.click();
      });
      act(() => vi.advanceTimersByTime(300));
      expect(view.stage.style.transform).toContain("scale(1)");
      expect([chip(view), navigator(view)]).toEqual([null, null]);
      view.cleanup();
    });

    it("keeps a zoom only while the project is open: nothing is saved, and another project opens at Fit", () => {
      const view = renderPreview();
      pinchIn(view, 10);
      expect(chip(view)).not.toBeNull();
      expect(localStorage.getItem("hf-studio-ui-preferences") ?? "").not.toContain("previewZoom");

      view.openProject("another-project");
      expect(view.stage.style.transform).toContain("scale(1)");
      expect(chip(view)).toBeNull();
      view.cleanup();
    });
  });

  it("insets the picture by default and fills a same-shape box when fillBox is on", () => {
    const box = { width: 640, height: 360 };
    const inset = renderPreview(undefined, { box });
    expect([inset.stage.style.width, inset.stage.style.height]).toEqual(["611.5556px", "344px"]);
    expect(parseFloat(inset.stage.parentElement!.style.inset)).toBe(8);
    inset.cleanup();

    const filled = renderPreview(undefined, { box, fillBox: true });
    expect([filled.stage.style.width, filled.stage.style.height]).toEqual(["640px", "360px"]);
    expect(parseFloat(filled.stage.parentElement!.style.inset)).toBe(0);
    filled.cleanup();
  });

  it("takes the host's composition size as the stage's shape until the preview measures its own", () => {
    const box = { width: 800, height: 600 };
    const plain = renderPreview(undefined, { box });
    expect([plain.stage.style.width, plain.stage.style.height]).toEqual(["784px", "441px"]);
    plain.cleanup();

    const hinted = renderPreview(undefined, {
      box,
      compositionSizeHint: { width: 1276, height: 1078 },
    });
    const shape = parseFloat(hinted.stage.style.width) / parseFloat(hinted.stage.style.height);
    expect(shape).toBeCloseTo(1276 / 1078, 3);
    expect(hinted.stage.style.height).toBe("584px");
    hinted.cleanup();
  });

  it("lets the size the preview measures win over the host's hint", () => {
    measured.size = { width: 1920, height: 1080 };
    try {
      const box = { width: 800, height: 600 };
      const hinted = renderPreview(undefined, {
        box,
        compositionSizeHint: { width: 1276, height: 1078 },
      });
      expect([hinted.stage.style.width, hinted.stage.style.height]).toEqual(["784px", "441px"]);
      hinted.cleanup();
    } finally {
      measured.size = null;
    }
  });

  it("clips a shadow reload so its own loading overlay cannot paint over the live frame", () => {
    const view = renderPreview([
      { gen: 0, role: "live" },
      { gen: 1, role: "shadow", url: "/api/projects/p/preview?_t=1" },
    ]);
    const players = [...view.stage.querySelectorAll<HTMLElement>('[data-testid="mock-player"]')];
    expect(players).toHaveLength(2);
    expect(players[0].style.clipPath).toBe("");
    expect(players[1].style.clipPath).toBe("inset(100%)");
    expect(players[1].style.visibility).toBe("hidden");
    expect(players[1].style.pointerEvents).toBe("none");
    view.cleanup();
  });

  it("covers the live preview with the cached frame-0 poster until it is ready to show", () => {
    const view = renderPreview();
    const poster = () =>
      view.stage.querySelector<HTMLImageElement>('[data-testid="preview-poster"]');
    expect(poster()?.getAttribute("src")).toBe(
      "/api/projects/timeline-edit-playground/thumbnail/index.html?t=0&output=source&cached=1",
    );
    expect(poster()?.style.zIndex).toBe("2");

    act(() => livePlayerProps.onReadyToShowChange?.(false));
    expect(poster()?.hidden).toBe(false);
    act(() => livePlayerProps.onReadyToShowChange?.(true));
    expect(poster()?.hidden).toBe(true);
    act(() => poster()?.dispatchEvent(new Event("load")));
    expect(poster()).toBeNull();
    view.cleanup();
  });

  describe("a missing poster", () => {
    const renderUrl =
      "/api/projects/timeline-edit-playground/thumbnail/index.html?t=0&output=source";
    const fetchSpy = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response()));
    beforeEach(() => {
      fetchSpy.mockClear();
      vi.stubGlobal("fetch", fetchSpy);
    });
    afterEach(() => vi.unstubAllGlobals());

    const renders = () => fetchSpy.mock.calls.map(([url]) => url);
    const settle = (
      view: ReturnType<typeof renderPreview>,
      steps: Array<"ready" | "missing" | "loaded">,
    ) => {
      for (const step of steps) {
        const poster = view.stage.querySelector('[data-testid="preview-poster"]');
        act(() =>
          step === "ready"
            ? livePlayerProps.onReadyToShowChange?.(true)
            : poster?.dispatchEvent(new Event(step === "missing" ? "error" : "load")),
        );
      }
    };

    it("is rendered for the next open when the live frame is ready first", () => {
      const view = renderPreview();
      settle(view, ["ready", "missing"]);
      expect(renders()).toEqual([renderUrl]);
      expect(fetchSpy.mock.calls[0]?.[1]?.signal, "rendered as scheduler work").toBeInstanceOf(
        AbortSignal,
      );
      expect(view.stage.querySelector('[data-testid="preview-poster"]')).toBeNull();
      view.cleanup();
    });

    it("is rendered once the live frame is ready when it is missing first", () => {
      const view = renderPreview();
      settle(view, ["missing"]);
      expect(fetchSpy).not.toHaveBeenCalled();
      settle(view, ["ready", "ready"]);
      expect(renders()).toEqual([renderUrl]);
      view.cleanup();
    });

    it("is rendered on a return from a sub-composition when the live frame is ready first", () => {
      const view = renderPreview();
      settle(view, ["loaded", "ready"]);
      view.render("/api/projects/timeline-edit-playground/preview/comp/compositions/intro.html");
      settle(view, ["ready"]);
      view.render();
      settle(view, ["ready", "missing"]);
      expect(renders()).toEqual([renderUrl]);
      view.cleanup();
    });
  });

  it("mounts the live player once when the composition switches", () => {
    playerMounts.length = 0;
    const Harness = ({ projectId }: { projectId: string }) => {
      const api = useTimelinePlayer();
      return React.createElement(NLEPreview, {
        projectId,
        iframeRef: api.iframeRef,
        onIframeLoad: api.onIframeLoad,
        previewSlots: api.previewSlots,
        onShadowIframeLoad: api.onShadowIframeLoad,
        onShadowReadyChange: api.onShadowReadyChange,
        onShadowError: api.onShadowError,
        setShadowIframeNode: api.setShadowIframeNode,
        resetPreviewSlots: api.resetPreviewSlots,
      });
    };
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(React.createElement(Harness, { projectId: "a" })));
    expect(playerMounts).toEqual(["live"]);

    act(() => root.render(React.createElement(Harness, { projectId: "b" })));
    expect(playerMounts).toEqual(["live", "live"]);

    act(() => root.unmount());
    host.remove();
  });
});
