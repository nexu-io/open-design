// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LAYER_REVEAL_LIFT_Z,
  LAYER_REVEAL_PENDING_COMMIT_ATTR,
  beginLayerRevealCommit,
  completeLayerRevealCommit,
  liftElementToTop,
  restoreLiftedElement,
  useLayerRevealOverride,
} from "./useLayerRevealOverride";
import { readEffectiveZIndex } from "./canvasContextMenuZOrder";
import { getElementZIndex } from "../../player/lib/layerOrdering";
import {
  LAYER_REVEAL_PRIOR_Z_ATTR,
  readTimelineElementZIndex,
} from "../../player/lib/timelineElementHelpers";
import { installReactActEnvironment } from "../../hooks/domSelectionTestHarness";
import { CLIP_HIDDEN_ATTR } from "@hyperframes/core/runtime/clip-reveal";

installReactActEnvironment();

function makeEl(zIndex?: string, position?: string): HTMLElement {
  const el = document.createElement("div");
  if (zIndex != null) el.style.zIndex = zIndex;
  if (position != null) el.style.position = position;
  document.body.appendChild(el);
  return el;
}

describe("liftElementToTop / restoreLiftedElement", () => {
  it("paints on top but every z reader keeps reporting the TRUE z", () => {
    const el = makeEl("6", "absolute");
    const lift = liftElementToTop(el);
    expect(lift).not.toBeNull();
    // The renderer sees the lifted value…
    expect(el.style.zIndex).toBe(LAYER_REVEAL_LIFT_Z);
    // …every studio reader sees the true z.
    expect(readEffectiveZIndex(el)).toBe(6);
    expect(getElementZIndex(el)).toBe(6);
    expect(readTimelineElementZIndex(el)).toBe(6);

    restoreLiftedElement(el, lift!);
    expect(el.style.zIndex).toBe("6");
    expect(el.hasAttribute(LAYER_REVEAL_PRIOR_Z_ATTR)).toBe(false);
  });

  it("gives a static element a temporary position:relative and restores it", () => {
    const el = makeEl();
    const lift = liftElementToTop(el)!;
    expect(el.style.position).toBe("relative");
    expect(lift.positionLifted).toBe(true);
    restoreLiftedElement(el, lift);
    expect(el.style.position).toBe("");
    expect(el.style.zIndex).toBe("");
  });

  it("keeps a position a move authored while the element was lifted", () => {
    const el = makeEl();
    const lift = liftElementToTop(el)!;
    el.removeAttribute("data-hf-reveal-prior-pos");
    restoreLiftedElement(el, lift);
    expect(el.style.position).toBe("relative");
  });

  it("a z-reorder commit consumes the lift: restore becomes a no-op", () => {
    const el = makeEl("3", "absolute");
    const lift = liftElementToTop(el)!;
    // Simulate handleDomZIndexReorderCommit: real z written, attrs removed.
    el.removeAttribute(LAYER_REVEAL_PRIOR_Z_ATTR);
    el.style.zIndex = "8";
    restoreLiftedElement(el, lift);
    expect(el.style.zIndex).toBe("8"); // the commit's value survives
    expect(readEffectiveZIndex(el)).toBe(8);
  });

  it("durable z persistence consumes its pending reveal ownership", () => {
    const el = makeEl("3", "absolute");
    const lift = liftElementToTop(el)!;
    const ownership = beginLayerRevealCommit(el)!;
    el.style.zIndex = "8";

    expect(el.hasAttribute(LAYER_REVEAL_PENDING_COMMIT_ATTR)).toBe(true);
    completeLayerRevealCommit(el, ownership);
    restoreLiftedElement(el, lift);

    expect(el.style.zIndex).toBe("8");
    expect(el.hasAttribute(LAYER_REVEAL_PENDING_COMMIT_ATTR)).toBe(false);
    expect(el.hasAttribute(LAYER_REVEAL_PRIOR_Z_ATTR)).toBe(false);
  });

  it("does not clobber a z someone else wrote while lifted", () => {
    const el = makeEl("3", "absolute");
    const lift = liftElementToTop(el)!;
    el.style.zIndex = "42"; // e.g. a GSAP seek or manual edit
    restoreLiftedElement(el, lift);
    expect(el.style.zIndex).toBe("42");
  });
});

describe("useLayerRevealOverride — delayed reveal ownership", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("cancels a pending reveal when selection changes or playback begins", () => {
    const host = document.createElement("div");
    const selected = makeEl("2", "absolute");
    const other = makeEl("3", "absolute");
    document.body.appendChild(host);
    const root = createRoot(host);
    let scheduleReveal: ((element: HTMLElement, delayMs: number) => void) | undefined;

    function Harness({ element, isPlaying }: { element: HTMLElement; isPlaying: boolean }) {
      ({ scheduleReveal } = useLayerRevealOverride({
        isPlaying,
        selectedElement: element,
      }));
      return null;
    }

    act(() => {
      root.render(React.createElement(Harness, { element: selected, isPlaying: false }));
    });
    act(() => scheduleReveal!(selected, 150));
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      root.render(React.createElement(Harness, { element: other, isPlaying: false }));
    });
    expect(vi.getTimerCount()).toBe(0);

    act(() => scheduleReveal!(other, 150));
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      root.render(React.createElement(Harness, { element: other, isPlaying: true }));
    });
    expect(vi.getTimerCount()).toBe(0);

    act(() => vi.advanceTimersByTime(150));
    expect(selected.style.zIndex).toBe("2");
    expect(other.style.zIndex).toBe("3");
    act(() => root.unmount());
  });

  it("lifts the runtime's hidden-clip mark with the visibility it forces, and puts both back", () => {
    const host = document.createElement("div");
    const clip = makeEl("2", "absolute");
    clip.style.visibility = "hidden";
    clip.setAttribute(CLIP_HIDDEN_ATTR, "");
    document.body.appendChild(host);
    const root = createRoot(host);
    let scheduleReveal: ((element: HTMLElement, delayMs: number) => void) | undefined;

    function Harness({ isPlaying }: { isPlaying: boolean }) {
      ({ scheduleReveal } = useLayerRevealOverride({ isPlaying, selectedElement: clip }));
      return null;
    }

    act(() => root.render(React.createElement(Harness, { isPlaying: false })));
    act(() => scheduleReveal!(clip, 0));
    act(() => vi.advanceTimersByTime(0));
    expect([clip.style.visibility, clip.hasAttribute(CLIP_HIDDEN_ATTR)]).toEqual([
      "visible",
      false,
    ]);

    act(() => root.render(React.createElement(Harness, { isPlaying: true })));
    expect([clip.style.visibility, clip.hasAttribute(CLIP_HIDDEN_ATTR)]).toEqual(["hidden", true]);
    act(() => root.unmount());
  });

  it("revalidates the current selection before a delayed reveal runs", () => {
    const host = document.createElement("div");
    const selected = makeEl("2", "absolute");
    const stale = makeEl("3", "absolute");
    document.body.appendChild(host);
    const root = createRoot(host);
    let scheduleReveal: ((element: HTMLElement, delayMs: number) => void) | undefined;

    function Harness() {
      ({ scheduleReveal } = useLayerRevealOverride({
        isPlaying: false,
        selectedElement: selected,
      }));
      return null;
    }

    act(() => root.render(React.createElement(Harness)));
    act(() => scheduleReveal!(stale, 150));
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(150));

    expect(stale.style.zIndex).toBe("3");
    expect(stale.hasAttribute(LAYER_REVEAL_PRIOR_Z_ATTR)).toBe(false);
    act(() => root.unmount());
  });
});
