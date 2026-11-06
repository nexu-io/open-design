// @vitest-environment happy-dom

import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Window } from "happy-dom";
import { usePreviewIframeStore } from "../../player/store/previewIframeStore";
import type { DomEditLayerItem } from "./domEditingTypes";
import { createRafThrottle, LayersPanel, sortLayersByZIndex } from "./LayersPanel";
import { isLayerDraggable } from "./useLayerDrag";
import { liveTime } from "../../player";
import { announcePreviewDocumentLoaded, sceneSwapFor } from "../../player/sceneSwap";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  previewIframeRef: { current: null } as { current: unknown },
  collect: vi.fn(),
  setActiveGroupElement: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("../../contexts/StudioContext", () => ({
  useStudioShellContextOptional: () => ({
    previewIframeRef: mocks.previewIframeRef,
    activeCompPath: "index.html",
    showToast: mocks.showToast,
  }),
  useStudioPlaybackContextOptional: () => ({
    refreshKey: 0,
    compositionLoading: true,
    timelineElements: [],
    isPlaying: false,
  }),
}));
vi.mock("../../contexts/DomEditContext", () => ({
  useDomEditContext: () => ({
    domEditSelection: null,
    activeGroupElement: null,
    applyDomSelection: vi.fn(),
    updateDomEditHoverSelection: vi.fn(),
    handleDomZIndexReorderCommit: vi.fn(),
    setActiveGroupElement: mocks.setActiveGroupElement,
  }),
}));
vi.mock("../nle/useCanvasZOrderTimelineMirror", () => ({
  useLayerReorderTimelineMirror: () => vi.fn(),
}));
vi.mock("./domEditing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./domEditing")>()),
  collectDomEditLayerItems: mocks.collect,
}));

function makeLayer(
  overrides: Partial<DomEditLayerItem> & { zIndex?: string; locked?: boolean },
): DomEditLayerItem {
  const win = new Window();
  const doc = win.document;
  const parent = doc.createElement("div") as unknown as HTMLElement;
  if (overrides.locked) {
    (parent as unknown as Element).setAttribute("data-timeline-locked", "true");
  }
  const el = doc.createElement("div") as unknown as HTMLElement;
  parent.appendChild(el as unknown as Node);
  if (overrides.zIndex != null) {
    (el as unknown as { style: { zIndex: string } }).style.zIndex = overrides.zIndex;
  }
  if (overrides.id) {
    (el as unknown as Element).setAttribute("id", overrides.id);
  }
  return {
    key: overrides.key ?? `layer-${Math.random()}`,
    element: el,
    label: overrides.label ?? "div",
    tagName: overrides.tagName ?? "div",
    depth: overrides.depth ?? 0,
    childCount: overrides.childCount ?? 0,
    id: overrides.id,
    selector: overrides.selector,
    selectorIndex: overrides.selectorIndex,
    sourceFile: overrides.sourceFile ?? "index.html",
  };
}

describe("sortLayersByZIndex", () => {
  it("sorts siblings by z-index descending", () => {
    const a = makeLayer({ key: "a", zIndex: "1", depth: 0 });
    const b = makeLayer({ key: "b", zIndex: "3", depth: 0 });
    const c = makeLayer({ key: "c", zIndex: "2", depth: 0 });

    const sorted = sortLayersByZIndex([a, b, c]);
    expect(sorted.map((l) => l.key)).toEqual(["b", "c", "a"]);
  });

  it("preserves DOM order (reversed) for siblings with auto z-index", () => {
    const a = makeLayer({ key: "a", depth: 0 });
    const b = makeLayer({ key: "b", depth: 0 });
    const c = makeLayer({ key: "c", depth: 0 });

    const sorted = sortLayersByZIndex([a, b, c]);
    expect(sorted.map((l) => l.key)).toEqual(["c", "b", "a"]);
  });

  it("sorts explicit z-index above auto, auto elements maintain reversed DOM order", () => {
    const a = makeLayer({ key: "a", depth: 0 });
    const b = makeLayer({ key: "b", zIndex: "5", depth: 0 });
    const c = makeLayer({ key: "c", depth: 0 });

    const sorted = sortLayersByZIndex([a, b, c]);
    expect(sorted.map((l) => l.key)).toEqual(["b", "c", "a"]);
  });

  it("sorts children independently of their parent's siblings", () => {
    const parent1 = makeLayer({ key: "p1", zIndex: "1", depth: 0, childCount: 2 });
    const child1a = makeLayer({ key: "c1a", zIndex: "3", depth: 1 });
    const child1b = makeLayer({ key: "c1b", zIndex: "1", depth: 1 });
    const parent2 = makeLayer({ key: "p2", zIndex: "2", depth: 0, childCount: 1 });
    const child2a = makeLayer({ key: "c2a", zIndex: "1", depth: 1 });

    const sorted = sortLayersByZIndex([parent1, child1a, child1b, parent2, child2a]);
    expect(sorted.map((l) => l.key)).toEqual(["p2", "c2a", "p1", "c1a", "c1b"]);
  });

  it("handles single-element groups without crash", () => {
    const single = makeLayer({ key: "only", zIndex: "5", depth: 0 });
    const sorted = sortLayersByZIndex([single]);
    expect(sorted).toEqual([single]);
  });

  it("returns empty array for empty input", () => {
    expect(sortLayersByZIndex([])).toEqual([]);
  });

  it("handles duplicate z-index values with reverse DOM order tiebreak", () => {
    const a = makeLayer({ key: "a", zIndex: "2", depth: 0 });
    const b = makeLayer({ key: "b", zIndex: "1", depth: 0 });
    const c = makeLayer({ key: "c", zIndex: "2", depth: 0 });

    const sorted = sortLayersByZIndex([a, b, c]);
    expect(sorted.map((l) => l.key)).toEqual(["c", "a", "b"]);
  });

  it("preserves deeply nested structure with sorting at each level", () => {
    const root = makeLayer({ key: "root", depth: 0, childCount: 2 });
    const a = makeLayer({ key: "a", zIndex: "1", depth: 1, childCount: 2 });
    const a1 = makeLayer({ key: "a1", zIndex: "10", depth: 2 });
    const a2 = makeLayer({ key: "a2", zIndex: "20", depth: 2 });
    const b = makeLayer({ key: "b", zIndex: "2", depth: 1 });

    const sorted = sortLayersByZIndex([root, a, a1, a2, b]);
    expect(sorted.map((l) => l.key)).toEqual(["root", "b", "a", "a2", "a1"]);
  });
});

describe("isLayerDraggable", () => {
  it("returns false for layers without id or selector", () => {
    const layer = makeLayer({ key: "anon" });
    expect(isLayerDraggable(layer)).toBe(false);
  });

  it("returns true for layers with an id", () => {
    const layer = makeLayer({ key: "with-id", id: "my-el" });
    expect(isLayerDraggable(layer)).toBe(true);
  });

  it("returns true for layers with a selector", () => {
    const layer = makeLayer({ key: "with-sel", selector: ".my-class" });
    expect(isLayerDraggable(layer)).toBe(true);
  });

  it("returns false for layers inside a locked composition", () => {
    const layer = makeLayer({ key: "locked", id: "locked-el", locked: true });
    expect(isLayerDraggable(layer)).toBe(false);
  });

  it("returns true for layers with id and no locked ancestor", () => {
    const layer = makeLayer({ key: "free", id: "free-el" });
    expect(isLayerDraggable(layer)).toBe(true);
  });
});

// ── liveTime throttle contract (mirrors the useEffect in LayersPanel) ──────
// The panel subscribes to liveTime with a rAF + 100 ms trailing throttle so
// it refreshes during scrubbing without a collectLayers call every frame.
// These tests exercise the subscribe/unsubscribe contract that the effect
// relies on.

describe("liveTime subscribe / unsubscribe (LayersPanel scrub contract)", () => {
  let rafCallbacks: FrameRequestCallback[];
  let originalRaf: typeof requestAnimationFrame;
  let originalCancelRaf: typeof cancelAnimationFrame;

  beforeEach(() => {
    rafCallbacks = [];
    originalRaf = globalThis.requestAnimationFrame;
    originalCancelRaf = globalThis.cancelAnimationFrame;
    let nextId = 1;
    globalThis.requestAnimationFrame = (cb) => {
      const id = nextId++;
      rafCallbacks.push(cb);
      return id;
    };
    globalThis.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
  });

  it("unsubscribing stops the callback from receiving further notifications", () => {
    const cb = vi.fn();
    const unsubscribe = liveTime.subscribe(cb);

    liveTime.notify(1);
    expect(cb).toHaveBeenCalledTimes(1);

    unsubscribe();
    liveTime.notify(2);
    expect(cb).toHaveBeenCalledTimes(1); // no new call after unsubscribe
  });

  it("queuing a rAF on liveTime notify then flushing calls the refresh exactly once", () => {
    const refresh = vi.fn();
    const throttle = createRafThrottle(refresh, 100);
    const unsubscribe = liveTime.subscribe(throttle.invoke);

    // First notify enqueues one rAF
    liveTime.notify(0.1);
    expect(rafCallbacks).toHaveLength(1);
    expect(refresh).not.toHaveBeenCalled();

    // Second notify before rAF flush is ignored (rafId is set)
    liveTime.notify(0.2);
    expect(rafCallbacks).toHaveLength(1);

    // Flush the rAF
    rafCallbacks[0](performance.now());
    expect(refresh).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});

describe("LayersPanel preview promotion", () => {
  let root: Root;
  let host: HTMLDivElement;

  function makeIframe(compId: string): HTMLIFrameElement {
    const iframe = document.createElement("iframe");
    const doc = new Window().document;
    doc.body.innerHTML = `<div data-composition-id="${compId}"></div>`;
    Object.defineProperty(iframe, "contentDocument", { value: doc });
    return iframe;
  }

  const collectedRootIds = () =>
    mocks.collect.mock.calls.map((call) => (call[0] as HTMLElement).dataset.compositionId);

  beforeEach(() => {
    mocks.collect.mockReset().mockReturnValue([]);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    usePreviewIframeStore.setState({ iframe: null });
  });

  it("recollects layers from the promoted document's load, not the replaced one", () => {
    const a = makeIframe("a");
    const b = makeIframe("b");
    mocks.previewIframeRef.current = a;
    usePreviewIframeStore.setState({ iframe: a });
    act(() => root.render(createElement(LayersPanel)));

    act(() => {
      mocks.previewIframeRef.current = b;
      usePreviewIframeStore.getState().setIframe(b);
    });
    mocks.collect.mockClear();

    act(() => {
      announcePreviewDocumentLoaded(a);
    });
    expect(mocks.collect).not.toHaveBeenCalled();

    act(() => {
      announcePreviewDocumentLoaded(b);
    });
    expect(collectedRootIds()).toEqual(["b"]);
  });
  it("recollects layers when edited scenes are swapped into the live document", async () => {
    const a = makeIframe("a");
    Object.defineProperty(a, "contentWindow", { value: { __hfSwapScenes: async () => {} } });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html></html>"));
    mocks.previewIframeRef.current = a;
    usePreviewIframeStore.setState({ iframe: a });
    act(() => root.render(createElement(LayersPanel)));
    mocks.collect.mockClear();

    await act(() => sceneSwapFor(a)!("/preview", () => true));
    expect(collectedRootIds()).toEqual(["a"]);
    fetchSpy.mockRestore();
  });

  it("a row press starts no text selection, so dragging a row leaves no letters highlighted", () => {
    const doc = new Window().document;
    doc.body.innerHTML = `<div data-composition-id="a"><div id="back"></div><div id="front"></div></div>`;
    const iframe = document.createElement("iframe");
    Object.defineProperty(iframe, "contentDocument", { value: doc });
    const item = (id: string) =>
      ({
        key: id,
        element: doc.getElementById(id),
        label: id,
        depth: 0,
        childCount: 0,
        id,
      }) as unknown as DomEditLayerItem;
    mocks.collect.mockReset().mockReturnValue([item("back"), item("front")]);
    mocks.previewIframeRef.current = iframe;
    usePreviewIframeStore.setState({ iframe });
    act(() => root.render(createElement(LayersPanel)));
    act(() => void announcePreviewDocumentLoaded(iframe));

    const rows = [...host.querySelectorAll("[data-layer-index]")];
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.closest(".select-none"))).toBe(true);
  });
});
