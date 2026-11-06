// @vitest-environment happy-dom
// Drives Studio's snapping and marquee by package name with a host's own iframe and overlay.
import { act, type PointerEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectSnapContext,
  resolveSnapAdjustment,
  SNAP_THRESHOLD_PX,
  SnapGuideOverlay,
  useMarqueeGestures,
  usePlayerStore,
  type MarqueeGestures,
  type MarqueeGesturesDeps,
  type MarqueeRect,
} from "@hyperframes/studio";
import { installReactActEnvironment, mountReactHarness } from "./hooks/domSelectionTestHarness";
import {
  collectDomEditLayerItems,
  resolveDomEditSelection,
} from "./components/editor/domEditingLayers";

const rects = new Map<string, MarqueeRect>([
  ["a", { left: 0, top: 0, width: 10, height: 10 }],
  ["b", { left: 100, top: 100, width: 10, height: 10 }],
]);

vi.mock("./components/editor/domEditOverlayGeometry", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isElementVisibleForOverlay: () => true,
  toVisibleOverlayRect: (_overlay: unknown, _iframe: unknown, el: HTMLElement) => {
    const rect = rects.get(el.id);
    return rect ? { ...rect, editScaleX: 1, editScaleY: 1 } : null;
  },
}));
vi.mock("./components/editor/domEditingElement", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isElementComputedVisible: () => true,
}));
vi.mock("./components/editor/domEditingLayers", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  collectDomEditLayerItems: vi.fn((root: HTMLElement) =>
    Array.from(root.children).map((element) => ({ element })),
  ),
  resolveDomEditSelection: vi.fn(async (element: HTMLElement) => ({ id: element.id })),
}));

installReactActEnvironment();

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
  usePlayerStore.setState({ previewBooted: false });
});

function MarqueeHost<T>(props: {
  deps: MarqueeGesturesDeps<T>;
  onState: (state: MarqueeGestures) => void;
}) {
  props.onState(useMarqueeGestures(props.deps as unknown as MarqueeGesturesDeps));
  return null;
}

function mountMarquee<T>(extra: Partial<MarqueeGesturesDeps<T>> = {}) {
  document.body.innerHTML = `<div data-composition-id="main" data-width="1920" data-height="1080">
    <div id="a"></div><div id="b"></div></div>`;
  const overlay = document.createElement("div");
  overlay.setPointerCapture = vi.fn();
  overlay.releasePointerCapture = vi.fn();
  document.body.append(overlay);
  const onSelect = vi.fn();
  const deps: MarqueeGesturesDeps<T> = {
    iframeRef: { current: { contentDocument: document } as unknown as HTMLIFrameElement },
    overlayRef: { current: overlay },
    activeCompositionPathRef: { current: "index.html" },
    onMarqueeSelectRef: { current: onSelect },
    ...extra,
  };
  let state: MarqueeGestures | undefined;
  const root = mountReactHarness(<MarqueeHost deps={deps} onState={(next) => (state = next)} />);
  const at = (x: number, y: number, shiftKey = false) =>
    ({
      clientX: x,
      clientY: y,
      pointerId: 7,
      buttons: 1,
      shiftKey,
      currentTarget: overlay,
    }) as unknown as PointerEvent<HTMLDivElement>;
  const marquee = () => state as MarqueeGestures;
  return { overlay, onSelect, root, at, marquee };
}

describe("marquee package export, driven by a host", () => {
  const byId = { resolveHits: (elements: HTMLElement[]) => elements.map((el) => el.id) };

  it("hands the elements a drag touched to the host's resolveHits and selects what it returns", async () => {
    const { overlay, onSelect, at, marquee } = mountMarquee<string>(byId);
    act(() => marquee().begin(at(1, 1)));
    expect(overlay.setPointerCapture).toHaveBeenCalledWith(7);
    act(() => marquee().onPointerMove(at(20, 20)));
    expect(marquee().marqueeRect).toEqual({ left: 1, top: 1, width: 19, height: 19 });
    expect(marquee().candidateRects).toEqual([rects.get("a")]);
    await act(async () => marquee().onPointerUp(at(20, 20, true)));
    expect(onSelect).toHaveBeenCalledWith(["a"], true);
    expect(overlay.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(marquee().marqueeRect).toBeNull();
  });

  it("measures the candidates once per drag", async () => {
    const { at, marquee } = mountMarquee<string>(byId);
    act(() => marquee().begin(at(1, 1)));
    act(() => marquee().onPointerMove(at(20, 20)));
    act(() => marquee().onPointerMove(at(120, 120)));
    await act(async () => marquee().onPointerUp(at(120, 120)));
    expect(collectDomEditLayerItems).toHaveBeenCalledTimes(1);
  });

  it("selects nothing on a release under the threshold, as a click", async () => {
    const resolveHits = vi.fn(byId.resolveHits);
    const { onSelect, at, marquee } = mountMarquee<string>({ resolveHits });
    act(() => marquee().begin(at(1, 1)));
    await act(async () => marquee().onPointerUp(at(2, 2)));
    expect(onSelect).toHaveBeenCalledWith([], false);
    expect(resolveHits).not.toHaveBeenCalled();
  });

  it("cancel() drops an active marquee and the release that follows selects nothing", async () => {
    const { overlay, onSelect, at, marquee } = mountMarquee<string>(byId);
    act(() => marquee().begin(at(1, 1)));
    act(() => marquee().onPointerMove(at(20, 20)));
    act(() => marquee().cancel());
    expect(marquee().marqueeRect).toBeNull();
    expect(marquee().candidateRects).toEqual([]);
    expect(overlay.releasePointerCapture).toHaveBeenCalledWith(7);
    await act(async () => marquee().onPointerUp(at(20, 20)));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("a pointercancel mid-drag drops the marquee without selecting", async () => {
    const { onSelect, at, marquee } = mountMarquee<string>(byId);
    act(() => marquee().begin(at(1, 1)));
    act(() => marquee().onPointerMove(at(20, 20)));
    act(() => marquee().onPointerCancel());
    expect(marquee().marqueeRect).toBeNull();
    await act(async () => marquee().onPointerUp(at(20, 20)));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("will not hand a host Studio's selections under the host's own pick type", () => {
    const hostDeps: MarqueeGesturesDeps<string> = {
      iframeRef: { current: null },
      overlayRef: { current: null },
      activeCompositionPathRef: { current: null },
      onMarqueeSelectRef: { current: undefined },
    };
    // @ts-expect-error a host pick type needs its own resolveHits
    const typed = () => useMarqueeGestures<string>(hostDeps);
    expect(typed).toBeTypeOf("function");
  });

  it("resolves Studio edit selections when the host passes no resolveHits", async () => {
    const { onSelect, at, marquee } = mountMarquee();
    act(() => marquee().begin(at(1, 1)));
    act(() => marquee().onPointerMove(at(20, 20)));
    await act(async () => marquee().onPointerUp(at(20, 20)));
    expect(resolveDomEditSelection).toHaveBeenCalledWith(
      document.getElementById("a"),
      expect.objectContaining({ skipSourceProbe: true }),
    );
    expect(onSelect).toHaveBeenCalledWith([{ id: "a" }], false);
  });

  it("passes pointer events that are not a marquee to Studio's gestures, and needs none", () => {
    const gestures = { onPointerMove: vi.fn(), onPointerUp: vi.fn(), clearPointerState: vi.fn() };
    const selectionRef = { current: null };
    const withGestures = mountMarquee<string>({ ...byId, gestures, selectionRef });
    act(() => withGestures.marquee().onPointerMove(withGestures.at(5, 5)));
    act(() => withGestures.marquee().onPointerUp(withGestures.at(5, 5)));
    act(() => withGestures.marquee().onPointerCancel());
    expect(gestures.onPointerMove).toHaveBeenCalledTimes(1);
    expect(gestures.onPointerUp).toHaveBeenCalledTimes(1);
    expect(gestures.clearPointerState).toHaveBeenCalledWith(selectionRef);

    const bare = mountMarquee<string>(byId);
    expect(() => {
      bare.marquee().onPointerMove(bare.at(5, 5));
      bare.marquee().onPointerUp(bare.at(5, 5));
      bare.marquee().onPointerCancel();
    }).not.toThrow();
  });
});

describe("snapping package export, driven by a host", () => {
  it("snaps a host's drag to another element and draws the guide", async () => {
    document.body.innerHTML = `<div data-composition-id="main" data-width="1920" data-height="1080">
      <div id="a"></div><div id="b"></div></div>`;
    const overlay = document.createElement("div");
    const iframe = {
      contentDocument: document,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
    } as unknown as HTMLIFrameElement;
    const moving = document.getElementById("a") as HTMLElement;
    const context = collectSnapContext({
      overlayEl: overlay,
      iframe,
      excludeElements: new Set([moving]),
    });
    const snap = resolveSnapAdjustment({
      movingRect: rects.get("a")!,
      proposedDx: 98,
      proposedDy: 0,
      targets: context.targets,
      threshold: SNAP_THRESHOLD_PX,
      disabled: !context.snapEnabled,
    });
    expect(snap.dx).toBe(100);
    expect(snap.guides.length).toBeGreaterThan(0);

    // The guides draw once the host's preview has booted, as NLEPreview's player marks it.
    usePlayerStore.setState({ previewBooted: true });
    const snapGuidesRef = { current: { guides: snap.guides, spacingGuides: snap.spacingGuides } };
    const root = mountReactHarness(
      <SnapGuideOverlay
        snapGuidesRef={snapGuidesRef}
        compositionLeft={0}
        compositionTop={0}
        compositionWidth={1920}
        compositionHeight={1080}
      />,
    );
    await vi.waitFor(() => {
      const guide = document.querySelector<HTMLElement>('[aria-hidden="true"] > div');
      expect(guide?.style.display).toBe("");
    });
    await act(async () => root.unmount());
  });
});
