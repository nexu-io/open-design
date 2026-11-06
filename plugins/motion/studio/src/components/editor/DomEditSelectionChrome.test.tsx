// @vitest-environment happy-dom

import React, { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "./domEditing";
import { DomEditGroupChrome, DomEditSelectionChrome } from "./DomEditSelectionChrome";
import { RESIZE_HANDLE_HIT_PX } from "./domEditOverlayGeometry";
import { SELECTION_CHROME } from "./motionPathLayerNode";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A selection whose capabilities are all on or all off, plus a host to render into. */
function selectionFixture(
  element: HTMLElement,
  selector: string,
  enabled: boolean,
  extra: Record<string, unknown> = {},
) {
  const selection = {
    element,
    selector,
    ...extra,
    capabilities: {
      canCrop: enabled,
      canApplyManualOffset: enabled,
      canApplyManualSize: enabled,
      canApplyManualRotation: enabled,
    },
  } as unknown as DomEditSelection;
  const host = document.createElement("div");
  document.body.append(host);
  return { selection, host, root: createRoot(host) };
}

describe("DomEditSelectionChrome crop composition", () => {
  it("renders overlay-only transparent chrome at headline geometry without changing composition bytes", () => {
    const composition = document.implementation.createHTMLDocument();
    composition.body.innerHTML = `
      <section class="hl-block"><div class="hl-mask" style="overflow:hidden;background:transparent">
        <h1 class="hl-text">Launch title</h1>
      </div></section>
    `;
    const headline = composition.querySelector<HTMLElement>(".hl-text")!;
    const before = composition.documentElement.outerHTML;
    const { selection, host, root } = selectionFixture(headline, ".hl-text", false);
    act(() => {
      root.render(
        <DomEditSelectionChrome
          selection={selection}
          overlayRect={{ left: 44, top: 52, width: 220, height: 48, editScaleX: 1, editScaleY: 1 }}
          allowCanvasMovement={false}
          allowBodyDrag
          boxRef={createRef()}
          boxChromeClass="border border-studio-accent/80"
          boxClipPath={undefined}
          selectionKey="headline"
          groupSelectionCount={0}
          gestures={{ startGesture: vi.fn() } as never}
          onStyleCommit={vi.fn()}
          onBoxClick={vi.fn()}
        />,
      );
    });
    const chrome = host.querySelector<HTMLElement>('[data-dom-edit-selection-box="true"]')!;
    expect(chrome.style.cssText).toContain("left: 44px");
    expect(chrome.style.cssText).toContain("width: 220px");
    expect(chrome.style.background).toBe("");
    expect(chrome.className).not.toMatch(/bg-/);
    expect(composition.documentElement.outerHTML).toBe(before);
    act(() => root.unmount());
    host.remove();
  });

  it("places rotated crop UI in exactly one oriented coordinate plane", () => {
    const element = document.createElement("div");
    element.id = "clip";
    element.style.clipPath = "inset(10px)";
    Object.defineProperties(element, {
      offsetWidth: { value: 200 },
      offsetHeight: { value: 100 },
    });
    document.body.append(element);
    // Per element, not blanket: the crop frame composes the element's transform
    // with its ancestors', so answering "rotated 30deg" for every node in the
    // document would have the frame read the same turn several times over.
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      ((node: Element) =>
        (node === element
          ? { clipPath: "inset(10px)", transform: "matrix(0.8660254, 0.5, -0.5, 0.8660254, 0, 0)" }
          : { clipPath: "none", transform: "none" }) as CSSStyleDeclaration) as never,
    );
    const { selection, host, root } = selectionFixture(element, "#clip", true, { id: "clip" });
    act(() => {
      root.render(
        <DomEditSelectionChrome
          selection={selection}
          overlayRect={{
            left: 100,
            top: 50,
            width: 220,
            height: 130,
            editScaleX: 1,
            editScaleY: 1,
            angle: 30,
          }}
          allowCanvasMovement={true}
          allowBodyDrag
          boxRef={createRef()}
          boxChromeClass=""
          boxClipPath={undefined}
          selectionKey="clip"
          groupSelectionCount={0}
          gestures={{ startGesture: vi.fn() } as never}
          onStyleCommit={vi.fn()}
          onBoxClick={vi.fn()}
        />,
      );
    });

    const cropFrame = host.querySelector<HTMLElement>("[data-dom-edit-crop-frame]")!;
    const rotations: string[] = [];
    for (
      let node: HTMLElement | null = cropFrame;
      node && node !== host;
      node = node.parentElement
    ) {
      if (node.style.transform.includes("rotate(")) rotations.push(node.style.transform);
    }
    expect(rotations).toHaveLength(1);
    expect(Number.parseFloat(rotations[0]!.slice("rotate(".length))).toBeCloseTo(30, 5);
    // A motion-path node over any of these hands its press to it.
    const controls = [...host.querySelectorAll(".pointer-events-auto, button")];
    expect(controls.length).toBeGreaterThan(8);
    for (const control of controls) expect(control.closest(SELECTION_CHROME)).not.toBeNull();
    act(() => root.unmount());
  });
});

// The bug: the overlay above the preview goes pointer-events-none while text is
// being edited, but `pointer-events: none` on a parent does not disable a child
// that sets `auto`. The selection box covers exactly the element being typed
// into, so it kept swallowing every press: the caret could only ever be placed
// once, when the edit opened, and dragging across characters did nothing.
describe("DomEditSelectionChrome while editing text", () => {
  const CAPABLE = {
    canCrop: true,
    canApplyManualOffset: true,
    canApplyManualSize: true,
    canApplyManualRotation: true,
  };

  function renderChrome(editing: boolean) {
    const element = document.createElement("div");
    element.id = "copy";
    document.body.append(element);
    const selection = {
      element,
      id: "copy",
      selector: "#copy",
      capabilities: CAPABLE,
    } as unknown as DomEditSelection;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <DomEditSelectionChrome
          selection={selection}
          overlayRect={{ left: 10, top: 20, width: 200, height: 60, editScaleX: 1, editScaleY: 1 }}
          allowCanvasMovement={true}
          allowBodyDrag
          boxRef={createRef()}
          boxChromeClass="border border-studio-accent/80"
          boxClipPath={undefined}
          selectionKey="copy"
          groupSelectionCount={0}
          gestures={{ startGesture: vi.fn() } as never}
          onStyleCommit={vi.fn()}
          onBoxClick={vi.fn()}
          inlineText={{ editing, startFromPress: vi.fn() }}
        />,
      );
    });
    return { host, unmount: () => act(() => root.unmount()) };
  }

  it("stops the selection box taking presses, so they reach the caret below", () => {
    const { host, unmount } = renderChrome(true);
    const box = host.querySelector<HTMLElement>('[data-dom-edit-selection-box="true"]')!;
    expect(box.className).toContain("pointer-events-none");
    expect(box.className).not.toContain("pointer-events-auto");
    unmount();
  });

  it("keeps the box interactive when no text is being edited", () => {
    const { host, unmount } = renderChrome(false);
    const box = host.querySelector<HTMLElement>('[data-dom-edit-selection-box="true"]')!;
    expect(box.className).toContain("pointer-events-auto");
    unmount();
  });

  it("still marks the edited element, so it is clear which one has the caret", () => {
    const { host, unmount } = renderChrome(true);
    const box = host.querySelector<HTMLElement>('[data-dom-edit-selection-box="true"]')!;
    expect(box.className).toContain("border-studio-accent/80");
    unmount();
  });

  it("takes away every handle that would sit over the text", () => {
    const { host, unmount } = renderChrome(true);
    expect(host.querySelectorAll(".pointer-events-auto")).toHaveLength(0);
    expect(host.querySelector("[data-dom-edit-crop-frame]")).toBeNull();
    unmount();
  });

  it("keeps the handles when nothing is being edited", () => {
    const { host, unmount } = renderChrome(false);
    expect(host.querySelectorAll(".pointer-events-auto").length).toBeGreaterThan(1);
    unmount();
  });
});

describe("DomEditSelectionChrome with body drag off", () => {
  const rect = { left: 10, top: 10, width: 200, height: 100, editScaleX: 1, editScaleY: 1 };
  const gestureSpies = () => ({
    startGesture: vi.fn(),
    startGroupDrag: vi.fn(),
    startBlockedMove: vi.fn(),
  });
  const press = (el: Element) => {
    const event = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
    });
    act(() => {
      el.dispatchEvent(event);
    });
    return event;
  };

  function renderChrome(allowBodyDrag: boolean) {
    const element = document.createElement("div");
    document.body.append(element);
    const { selection, host, root } = selectionFixture(element, "#box", true);
    const hostPress = vi.fn();
    host.addEventListener("pointerdown", hostPress);
    const gestures = gestureSpies();
    act(() => {
      root.render(
        <DomEditSelectionChrome
          selection={selection}
          overlayRect={rect}
          allowCanvasMovement
          allowBodyDrag={allowBodyDrag}
          boxRef={createRef()}
          boxChromeClass=""
          boxClipPath={undefined}
          selectionKey="box"
          groupSelectionCount={0}
          gestures={gestures as never}
          onBoxClick={vi.fn()}
        />,
      );
    });
    const box = host.querySelector<HTMLElement>('[data-dom-edit-selection-box="true"]')!;
    return { host, box, gestures, hostPress, cleanup: () => act(() => root.unmount()) };
  }

  it("leaves a body press untouched for the host: no drag, no capture, no cursor", () => {
    const { box, gestures, hostPress, cleanup } = renderChrome(false);
    const event = press(box);
    expect(hostPress).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
    expect(box.hasPointerCapture(1)).toBe(false);
    expect(gestures.startGesture).not.toHaveBeenCalled();
    expect(gestures.startBlockedMove).not.toHaveBeenCalled();
    expect(box.style.cursor).toBe("");
    cleanup();
  });

  it("keeps the resize and rotate handles working", () => {
    const { host, gestures, cleanup } = renderChrome(false);
    const corner = host.querySelector<HTMLElement>('[style*="nwse-resize"]')!;
    corner.querySelector("[data-resize-corner]")!.getBoundingClientRect = () =>
      ({ left: 7, top: 9 }) as DOMRect;
    press(corner);
    expect(gestures.startGesture).toHaveBeenCalledWith("resize", expect.anything(), {
      resizeHandle: "nw",
      resizeCorner: { x: 7, y: 9 },
    });
    press(host.querySelector('[aria-label="Rotate selection"]')!);
    expect(gestures.startGesture).toHaveBeenCalledWith("rotate", expect.anything());
    cleanup();
  });

  it("still drags the body by default", () => {
    const { box, gestures, cleanup } = renderChrome(true);
    press(box);
    expect(gestures.startGesture).toHaveBeenCalledWith("drag", expect.anything());
    expect(box.style.cursor).toBe("move");
    cleanup();
  });

  it("leaves a group body press untouched too", () => {
    const { host, root } = selectionFixture(document.createElement("div"), "#g", true);
    const hostPress = vi.fn();
    host.addEventListener("pointerdown", hostPress);
    const gestures = gestureSpies();
    act(() => {
      root.render(
        <DomEditGroupChrome
          groupOverlayItems={[]}
          groupBounds={rect}
          allowCanvasMovement
          allowBodyDrag={false}
          groupCanMove
          gestures={gestures as never}
          onBoxClick={vi.fn()}
        />,
      );
    });
    const groupBox = host.querySelector<HTMLElement>('[data-dom-edit-selection-box="true"]')!;
    const event = press(groupBox);
    expect(groupBox.style.cursor).toBe("");
    expect(hostPress).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
    expect(gestures.startGroupDrag).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

describe("DomEditSelectionChrome corner handles", () => {
  type Inset = { top: number; right: number; bottom: number; left: number };
  function cornerHits(
    rect: { left: number; top: number; width: number; height: number },
    cropOutlineInsetPx?: Inset,
  ) {
    const { selection, host, root } = selectionFixture(document.createElement("div"), "#t", true);
    (selection.capabilities as { canCrop: boolean }).canCrop = false;
    act(() => {
      root.render(
        <DomEditSelectionChrome
          selection={selection}
          overlayRect={{ ...rect, editScaleX: 1, editScaleY: 1 }}
          allowCanvasMovement
          allowBodyDrag
          cropOutlineInsetPx={cropOutlineInsetPx}
          boxRef={createRef()}
          boxChromeClass=""
          boxClipPath={undefined}
          selectionKey="t"
          groupSelectionCount={0}
          gestures={{ startGesture: vi.fn() } as never}
          onStyleCommit={vi.fn()}
          onBoxClick={vi.fn()}
        />,
      );
    });
    const hits = [
      ...host.querySelectorAll<HTMLElement>('[style*="nwse-resize"], [style*="nesw-resize"]'),
    ].map((handle) => {
      const corner = handle.querySelector<HTMLElement>("[data-resize-corner]")!;
      const left = parseFloat(handle.style.left);
      const top = parseFloat(handle.style.top);
      return {
        left,
        top,
        corner: [left + parseFloat(corner.style.left), top + parseFloat(corner.style.top)],
      };
    });
    act(() => root.unmount());
    host.remove();
    return hits;
  }

  const NO_INSET: Inset = { top: 0, right: 0, bottom: 0, left: 0 };
  it.each([
    ["14x8", 14, 8, NO_INSET],
    ["4x4", 4, 4, NO_INSET],
    ["24x24", 24, 24, NO_INSET],
    ["cropped 40x40 showing 16x16", 40, 40, { top: 12, right: 12, bottom: 12, left: 12 }],
  ])(
    "reach at most a quarter of each side into a small %s pick, so its middle moves",
    (_name, width, height, inset) => {
      const rect = { left: 100, top: 100, width, height };
      const pick = {
        left: rect.left + inset.left,
        top: rect.top + inset.top,
        right: rect.left + width - inset.right,
        bottom: rect.top + height - inset.bottom,
      };
      const quarterX = (pick.right - pick.left) / 4;
      const quarterY = (pick.bottom - pick.top) / 4;
      const hits = cornerHits(rect, inset === NO_INSET ? undefined : inset);
      expect(hits.map((hit) => hit.corner)).toEqual(
        expect.arrayContaining([
          [pick.left, pick.top],
          [pick.right, pick.top],
          [pick.left, pick.bottom],
          [pick.right, pick.bottom],
        ]),
      );
      expect(hits).toHaveLength(4);
      for (const hit of hits) {
        const reachX =
          hit.left < (pick.left + pick.right) / 2
            ? hit.left + RESIZE_HANDLE_HIT_PX - pick.left
            : pick.right - hit.left;
        const reachY =
          hit.top < (pick.top + pick.bottom) / 2
            ? hit.top + RESIZE_HANDLE_HIT_PX - pick.top
            : pick.bottom - hit.top;
        expect(reachX, JSON.stringify(hit)).toBeLessThanOrEqual(quarterX);
        expect(reachY, JSON.stringify(hit)).toBeLessThanOrEqual(quarterY);
      }
    },
  );

  it("stay centred on the corners of a pick large enough to hold them", () => {
    expect(cornerHits({ left: 100, top: 100, width: 32, height: 40 })).toEqual(
      expect.arrayContaining([
        { left: 92, top: 92, corner: [100, 100] },
        { left: 124, top: 92, corner: [132, 100] },
        { left: 92, top: 132, corner: [100, 140] },
        { left: 124, top: 132, corner: [132, 140] },
      ]),
    );
  });
});
