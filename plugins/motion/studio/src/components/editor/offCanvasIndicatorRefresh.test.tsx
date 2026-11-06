// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DomEditOverlay } from "./DomEditOverlay";
import { RECOMPUTE_INTERVAL_MS } from "./offCanvasIndicatorRefresh";
import { usePlayerStore } from "../../player/store/playerStore";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

// happy-dom (20.x) holds each MutationObserver's delivery callback ONLY via a
// WeakRef (MutationObserverListener: `callback: new WeakRef(...)` — the arrow
// has no strong referent). If V8 runs a GC between observe() and a mutation,
// deref() returns undefined and mutation delivery silently stops — the
// indicator-refresh loop never sees its dirty flag and these tests flake under
// full-suite memory pressure (passing in isolation). Pin WeakRef to a strong
// ref for this file so the real observer path stays deterministic.
const RealWeakRef = globalThis.WeakRef;
class StrongRef<T extends WeakKey> {
  #value: T;
  constructor(value: T) {
    this.#value = value;
  }
  deref(): T {
    return this.#value;
  }
}
beforeAll(() => {
  (globalThis as { WeakRef: unknown }).WeakRef = StrongRef;
});
afterAll(() => {
  globalThis.WeakRef = RealWeakRef;
});

const INDICATOR = '[aria-label="Select off-canvas element index.html:headline:0"]';

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

// The refresh rebuilds at most every RECOMPUTE_INTERVAL_MS — it walks the whole
// preview and reads layout per element, which is too much to do per frame while
// animation is writing inline styles. Waiting past that window is what makes
// consecutive frames here represent consecutive rebuilds.
async function flushAnimationFrames(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, RECOMPUTE_INTERVAL_MS + 5));
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

// The refresh waits on MutationObserver delivery and then on its own throttle, so no fixed
// number of frames is guaranteed to be enough on a loaded runner. Flush until the indicator
// reaches the state under test.
async function untilIndicator(host: HTMLElement, check: (indicator: Element | null) => void) {
  await vi.waitFor(
    async () => {
      await act(async () => {
        await flushAnimationFrames();
      });
      check(host.querySelector(INDICATOR));
    },
    { timeout: 4000, interval: 0 },
  );
}

// Delivers each batch of mutation records `ms` late, as a busy runner can.
function lateObserver(Base: typeof MutationObserver, ms: number): typeof MutationObserver {
  return class extends Base {
    constructor(callback: MutationCallback) {
      super((records, observer) => setTimeout(() => callback(records, observer), ms));
    }
  };
}

interface OverlayHarness {
  host: HTMLElement;
  movedElement: HTMLElement;
  cleanup: () => void;
}

// Mount DomEditOverlay over an iframe whose #headline sits at `initialLeft`, with a
// getBoundingClientRect stub that reads the element's live inline geometry (so a
// style mutation moves it) and reports the composition/overlay as 800x450 at origin.
function mountOverlayWithHeadline(initialLeft: number, observerDelayMs = 0): OverlayHarness {
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  const host = document.createElement("div");
  document.body.append(host);
  const root: Root = createRoot(host);
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const doc = iframe.contentDocument;
  if (!doc) throw new Error("Expected iframe content document");

  doc.body.innerHTML = `
    <div data-composition-id="root" data-width="800" data-height="450">
      <div id="headline" style="position:absolute; left:${initialLeft}px; top:40px; width:100px; height:40px;">Headline</div>
    </div>
  `;
  const movedElement = doc.getElementById("headline");
  if (!movedElement) throw new Error("Expected test element");
  const view = doc.defaultView?.MutationObserver ? doc.defaultView : globalThis;
  const RealObserver = view.MutationObserver;
  if (observerDelayMs > 0) view.MutationObserver = lateObserver(RealObserver, observerDelayMs);

  Element.prototype.getBoundingClientRect = function (): DOMRect {
    if (this === movedElement) {
      return domRect(
        Number.parseFloat(movedElement.style.left),
        Number.parseFloat(movedElement.style.top),
        Number.parseFloat(movedElement.style.width),
        Number.parseFloat(movedElement.style.height),
      );
    }
    return domRect(0, 0, 800, 450);
  };

  act(() => {
    root.render(
      <DomEditOverlay
        iframeRef={{ current: iframe }}
        activeCompositionPath={null}
        selection={null}
        hoverSelection={null}
        groupSelections={[]}
        onCanvasMouseDown={() => {}}
        onCanvasPointerMove={() => Promise.resolve(null)}
        onCanvasPointerLeave={() => {}}
        onSelectionChange={() => {}}
        onBlockedMove={() => {}}
        onPathOffsetCommit={() => {}}
        onGroupPathOffsetCommit={() => {}}
        onBoxSizeCommit={() => {}}
        onRotationCommit={() => {}}
      />,
    );
  });

  return {
    host,
    movedElement,
    cleanup: () => {
      act(() => root.unmount());
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
      view.MutationObserver = RealObserver;
      iframe.remove();
      host.remove();
    },
  };
}

beforeEach(() => {
  usePlayerStore.setState({ previewBooted: true });
});

describe("off-canvas indicator refresh", () => {
  for (const [label, delayMs] of [
    ["", 0],
    [" when mutation delivery lags past a fixed wait", 300],
  ] as const) {
    it(`removes the indicator when an off-canvas element moves in-canvas (off->on)${label}`, async () => {
      const h = mountOverlayWithHeadline(760, delayMs);
      try {
        await untilIndicator(h.host, (indicator) => expect(indicator).toBeTruthy());

        act(() => {
          h.movedElement.style.left = "120px";
        });
        await untilIndicator(h.host, (indicator) => expect(indicator).toBeNull());
      } finally {
        h.cleanup();
      }
    });
  }

  it("tracks the indicator to the new position when it stays off-canvas (off->off)", async () => {
    const h = mountOverlayWithHeadline(760);
    try {
      await untilIndicator(h.host, (indicator) => expect(indicator).toBeTruthy());
      const before = h.host.querySelector(INDICATOR);
      const leftBefore = (before!.parentElement as HTMLElement).style.left;

      // Move further off-canvas (still outside the 800px-wide composition).
      act(() => {
        h.movedElement.style.left = "1200px";
      });
      await untilIndicator(h.host, (indicator) => {
        expect(indicator).toBeTruthy();
        expect((indicator!.parentElement as HTMLElement).style.left).not.toEqual(leftBefore);
      });
    } finally {
      h.cleanup();
    }
  });
});
