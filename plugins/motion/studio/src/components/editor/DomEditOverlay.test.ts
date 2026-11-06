// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import {
  DomEditOverlay,
  filterNestedDomEditGroupItems,
  focusDomEditOverlayElement,
  hasDomEditRotationChanged,
  resolveDomEditCoordinateScale,
  resolveDomEditGroupOverlayRect,
  resolveDomEditRotationGesture,
} from "./DomEditOverlay";
import type { DomEditSelection } from "./domEditing";
import {
  hoverCacheDescribesPoint,
  resolveResizeCenterAnchorOffset,
} from "./domEditOverlayGestures";
import { usePlayerStore } from "../../player/store/playerStore";

// React 19 warns unless the test environment opts into act().
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const gestureSpies = vi.hoisted(() => ({
  startGesture: vi.fn(() => true),
  startGroupDrag: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerUp: vi.fn(),
  clearPointerState: vi.fn(),
}));

vi.mock("./useDomEditOverlayGestures", () => ({
  createDomEditOverlayGestureHandlers: () => ({
    startGesture: gestureSpies.startGesture,
    startGroupDrag: gestureSpies.startGroupDrag,
    onPointerMove: gestureSpies.onPointerMove,
    onPointerUp: gestureSpies.onPointerUp,
    clearPointerState: gestureSpies.clearPointerState,
  }),
}));

vi.mock("./useDomEditOverlayRects", async () => {
  const React = await import("react");
  const { rectsEqual } = await import("./domEditOverlayGeometry");

  return {
    useDomEditOverlayRects: (options: { selectionRef: { current: unknown } }) => {
      const defaultSelectionRect = {
        left: 24,
        top: 36,
        width: 180,
        height: 72,
        editScaleX: 1,
        editScaleY: 1,
      };
      const initialOverlayRect = options.selectionRef.current ? defaultSelectionRect : null;
      const [overlayRect, setOverlayRectState] = React.useState(initialOverlayRect);
      const overlayRectRef = React.useRef(initialOverlayRect);
      const [groupOverlayItems, setGroupOverlayItemsState] = React.useState([]);
      const groupOverlayItemsRef = React.useRef([]);

      const setOverlayRect = (next: unknown) => {
        if (rectsEqual(overlayRectRef.current, next)) return;
        overlayRectRef.current = next;
        setOverlayRectState(next);
      };

      const setGroupOverlayItems = (next: unknown[]) => {
        groupOverlayItemsRef.current = next;
        setGroupOverlayItemsState(next);
      };

      return {
        overlayRect,
        overlayRectRef,
        setOverlayRect,
        hoverRect: null,
        hoverRectRef: { current: null },
        setHoverRect: () => {},
        groupOverlayItems,
        groupOverlayItemsRef,
        setGroupOverlayItems,
        childRects: [],
      };
    },
  };
});

const previewHelperSpies = vi.hoisted(() => ({
  getPreviewTargetFromPointer: vi.fn<() => HTMLElement | null>(() => null),
}));

vi.mock("../../utils/studioPreviewHelpers", async () => {
  const actual = await vi.importActual<typeof import("../../utils/studioPreviewHelpers")>(
    "../../utils/studioPreviewHelpers",
  );
  return {
    ...actual,
    getPreviewTargetFromPointer: previewHelperSpies.getPreviewTargetFromPointer,
  };
});

vi.mock("./domEditOverlayGeometry", async () => {
  const actual = await vi.importActual<typeof import("./domEditOverlayGeometry")>(
    "./domEditOverlayGeometry",
  );

  const stubRect = {
    left: 24,
    top: 36,
    width: 180,
    height: 72,
    editScaleX: 1,
    editScaleY: 1,
  };
  return {
    ...actual,
    toOverlayRect: () => stubRect,
    orientedOverlayRect: () => stubRect,
  };
});

function createOverlayProps(args: {
  iframeRef: { current: HTMLIFrameElement | null };
  selection: DomEditSelection | null;
  hoverSelection: DomEditSelection | null;
  onSelectionChange: (next: DomEditSelection) => void;
}) {
  return {
    iframeRef: args.iframeRef,
    activeCompositionPath: null,
    selection: args.selection,
    hoverSelection: args.hoverSelection,
    groupSelections: [],
    onCanvasMouseDown: () => {},
    onCanvasPointerMove: () => Promise.resolve(args.hoverSelection ?? args.selection),
    onCanvasPointerLeave: () => {},
    onSelectionChange: args.onSelectionChange,
    onBlockedMove: () => {},
    onPathOffsetCommit: () => {},
    onGroupPathOffsetCommit: () => {},
    onBoxSizeCommit: () => {},
    onRotationCommit: () => {},
  };
}

/**
 * Stub element-level getBoundingClientRect to a fixed 800×450 rect (happy-dom
 * returns all-zeros for unlaid-out elements, which gates the RAF compRect
 * update). Returns a restore function to call in teardown.
 */
function stubViewportRect(): () => void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      left: 0,
      top: 0,
      right: 800,
      bottom: 450,
      width: 800,
      height: 450,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

/**
 * Flush the mount's RAF ticks so the compRect update lands. Two animation-frame
 * ticks: the first scheduled by useMountEffect's update(), the second by
 * update()'s tail recursion.
 */
async function flushOverlayRaf(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

/** A fully-populated DomEditSelection with per-test overrides (capabilities are
 *  merged so a test can flip a single flag without restating the whole set). */
function makeDomEditSelection(
  overrides: Partial<DomEditSelection> = {},
  capabilityOverrides: Partial<DomEditSelection["capabilities"]> = {},
): DomEditSelection {
  const base: DomEditSelection = {
    element: document.createElement("div"),
    id: "hero-title",
    selector: ".hero-title",
    selectorIndex: 0,
    sourceFile: "index.html",
    tagName: "div",
    label: "Hero Title",
    textContent: "Hello",
    textFields: [],
    capabilities: {
      canEditText: true,
      canEditLayout: true,
      canMove: true,
      canApplyManualOffset: true,
      canApplyManualSize: false,
      canApplyManualRotation: false,
      canAdjustOpacity: true,
      canAdjustFill: true,
      canAdjustBorderRadius: true,
      canAdjustStroke: true,
      canAdjustShadow: true,
      canAdjustZIndex: true,
    },
    computedStyle: {
      display: "block",
      position: "absolute",
    },
  };
  return {
    ...base,
    ...overrides,
    capabilities: { ...base.capabilities, ...capabilityOverrides },
  };
}

/** Query the composition-canvas overlay and assert it mounted. */
function getOverlay(host: HTMLElement): HTMLDivElement {
  const overlay = host.querySelector<HTMLDivElement>('[aria-label="Composition canvas"]');
  expect(overlay).toBeTruthy();
  if (!overlay) throw new Error("Expected composition canvas overlay");
  return overlay;
}

/** Dispatch a left-button pointerdown at (clientX, clientY) inside act(). */
function dispatchOverlayPointerDown(target: Element, clientX = 120, clientY = 80): void {
  act(() => {
    target.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX, clientY }),
    );
  });
}

beforeEach(() => {
  usePlayerStore.setState({ previewBooted: true });
});

describe("focusDomEditOverlayElement", () => {
  it("focuses the canvas overlay without scrolling", () => {
    const calls: Array<FocusOptions | undefined> = [];
    focusDomEditOverlayElement({
      focus: (options?: FocusOptions) => calls.push(options),
    });

    expect(calls).toEqual([{ preventScroll: true }]);
  });
});

describe("DomEditOverlay", () => {
  beforeEach(() => {
    gestureSpies.startGesture.mockClear();
    gestureSpies.startGroupDrag.mockClear();
    gestureSpies.onPointerMove.mockClear();
    gestureSpies.onPointerUp.mockClear();
    gestureSpies.clearPointerState.mockClear();
    previewHelperSpies.getPreviewTargetFromPointer.mockReset();
    previewHelperSpies.getPreviewTargetFromPointer.mockReturnValue(null);
  });

  it("selects on the first click over an element even before a hover is resolved", async () => {
    // Regression: this used to start a marquee whenever hoverSelectionRef was null.
    // The RAF hover loop populates that ref ASYNCHRONOUSLY, so a genuine first
    // click over an element read null and was misread as empty canvas — the
    // marquee swallowed the selecting onMouseDown, so nothing selected until the
    // SECOND click. With a synchronous pointer hit-test finding an element, the
    // marquee must NOT start and onCanvasMouseDown must fire on the first click.
    const restoreRect = stubViewportRect();
    const originalPointerCapture = HTMLDivElement.prototype.setPointerCapture;
    HTMLDivElement.prototype.setPointerCapture = () => {};

    // An element IS under the pointer, but no hover has been resolved yet.
    previewHelperSpies.getPreviewTargetFromPointer.mockReturnValue(document.createElement("div"));

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const iframeRef: { current: HTMLIFrameElement | null } = {
      current: document.createElement("iframe"),
    };
    const onCanvasMouseDown = vi.fn();
    const onMarqueeSelect = vi.fn();

    function Harness() {
      return React.createElement(DomEditOverlay, {
        ...createOverlayProps({
          iframeRef,
          selection: null,
          hoverSelection: null,
          onSelectionChange: () => {},
        }),
        onCanvasMouseDown,
        onMarqueeSelect,
      });
    }

    act(() => {
      root.render(React.createElement(Harness));
    });
    await flushOverlayRaf();

    const overlay = getOverlay(host);

    act(() => {
      overlay.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 120, clientY: 80 }),
      );
      overlay.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 120, clientY: 80 }),
      );
    });

    // No marquee started; the click reached the selecting mouse-down handler.
    expect(onMarqueeSelect).not.toHaveBeenCalled();
    expect(onCanvasMouseDown).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    HTMLDivElement.prototype.setPointerCapture = originalPointerCapture;
    restoreRect();
    host.remove();
  });

  it("starts a marquee from outside the composition frame", async () => {
    const restoreRect = stubViewportRect();
    const originalPointerCapture = HTMLDivElement.prototype.setPointerCapture;
    const setPointerCapture = vi.fn();
    HTMLDivElement.prototype.setPointerCapture = setPointerCapture;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const iframeRef: { current: HTMLIFrameElement | null } = {
      current: document.createElement("iframe"),
    };

    act(() => {
      root.render(
        React.createElement(DomEditOverlay, {
          ...createOverlayProps({
            iframeRef,
            selection: null,
            hoverSelection: null,
            onSelectionChange: () => {},
          }),
          onMarqueeSelect: vi.fn(),
        }),
      );
    });
    await flushOverlayRaf();

    // Negative x is outside the 0..800 composition frame but still reaches the
    // overlay in a real pointer event when the user starts in the grey margin.
    dispatchOverlayPointerDown(getOverlay(host), -40, 100);
    expect(setPointerCapture).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    HTMLDivElement.prototype.setPointerCapture = originalPointerCapture;
    restoreRect();
    host.remove();
  });

  it("does not start a drag from a stale hover target on canvas pointer-down", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const selection = makeDomEditSelection({
      id: "cta-label",
      selector: ".cta-label",
      tagName: "span",
      label: "CTA Label",
      textContent: "Add to basket",
      computedStyle: { display: "inline", position: "static" },
    });

    let currentSelection: DomEditSelection | null = null;
    const iframeRef = { current: document.createElement("iframe") as HTMLIFrameElement | null };

    function Harness() {
      const [selected, setSelected] = React.useState<DomEditSelection | null>(null);
      currentSelection = selected;

      return React.createElement(
        DomEditOverlay,
        createOverlayProps({
          iframeRef,
          selection: selected,
          hoverSelection: selection,
          onSelectionChange: (next: DomEditSelection) => setSelected(next),
        }),
      );
    }

    act(() => {
      root.render(React.createElement(Harness));
    });

    const overlay = getOverlay(host);

    dispatchOverlayPointerDown(overlay);

    expect(gestureSpies.startGesture).not.toHaveBeenCalled();
    expect(currentSelection).toBe(null);

    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it("starts movement from the selected bounds", async () => {
    // The overlay's compRect updates via a RAF loop reading iframe + overlay
    // getBoundingClientRect. happy-dom returns all zeros for newly-created
    // elements with no layout, so without stubs the RAF early-returns
    // (iRect.width <= 0) and compRect.width stays 0 — gating the selection
    // box (and other bounded UI) behind `compRect.width > 0` (added in the
    // keyframes PR a468550f). Stub element-level getBoundingClientRect for
    // the test so the RAF compRect update produces a real width.
    const restoreRect = stubViewportRect();

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const selection = makeDomEditSelection();

    let currentSelection: DomEditSelection | null = selection;
    const iframeRef = { current: document.createElement("iframe") as HTMLIFrameElement | null };
    const originalPointerCapture = HTMLDivElement.prototype.setPointerCapture;
    HTMLDivElement.prototype.setPointerCapture = () => {};

    function Harness() {
      const [selected, setSelected] = React.useState<DomEditSelection | null>(selection);
      currentSelection = selected;

      return React.createElement(DomEditOverlay, {
        ...createOverlayProps({
          iframeRef,
          selection: selected,
          hoverSelection: null,
          onSelectionChange: (next: DomEditSelection) => setSelected(next),
        }),
      });
    }

    act(() => {
      root.render(React.createElement(Harness));
    });

    // Flush the mount's RAF tick so the compRect update lands before the
    // pointer-down. Two animation-frame ticks: the first scheduled by
    // useMountEffect's update(), the second by update()'s tail recursion.
    await flushOverlayRaf();

    getOverlay(host);

    const selectionBox = host.querySelector(
      '[data-dom-edit-selection-box="true"]',
    ) as HTMLDivElement;
    expect(selectionBox).toBeTruthy();

    dispatchOverlayPointerDown(selectionBox);

    expect(currentSelection).toBe(selection);
    expect(gestureSpies.startGesture).toHaveBeenCalledWith(
      "drag",
      expect.objectContaining({ button: 0 }),
    );

    act(() => {
      root.unmount();
    });
    HTMLDivElement.prototype.setPointerCapture = originalPointerCapture;
    restoreRect();
    host.remove();
  });

  it.each([
    { canvasInput: "overlay" as const, drags: true },
    { canvasInput: "host" as const, drags: false },
  ])("with body drag off, a $canvasInput canvas drags the body: $drags", async (c) => {
    const restoreRect = stubViewportRect();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const selection = makeDomEditSelection();
    const iframeRef = { current: document.createElement("iframe") as HTMLIFrameElement | null };
    const originalPointerCapture = HTMLDivElement.prototype.setPointerCapture;
    HTMLDivElement.prototype.setPointerCapture = () => {};
    gestureSpies.startGesture.mockClear();

    act(() => {
      root.render(
        React.createElement(DomEditOverlay, {
          ...createOverlayProps({ iframeRef, selection, hoverSelection: null }),
          allowBodyDrag: false,
          canvasInput: c.canvasInput,
        }),
      );
    });
    await flushOverlayRaf();
    const selectionBox = host.querySelector(
      '[data-dom-edit-selection-box="true"]',
    ) as HTMLDivElement;
    dispatchOverlayPointerDown(selectionBox);

    expect(gestureSpies.startGesture.mock.calls.some((call) => call[0] === "drag")).toBe(c.drags);

    act(() => {
      root.unmount();
    });
    HTMLDivElement.prototype.setPointerCapture = originalPointerCapture;
    restoreRect();
    host.remove();
  });

  it("passes the tracked hover selection when clicking the existing selection box", async () => {
    const restoreRect = stubViewportRect();

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const selection = makeDomEditSelection({}, { canMove: false, canApplyManualOffset: false });
    const hoverSelection: DomEditSelection = { ...selection, id: "hovered-sibling" };
    const onCanvasMouseDown = vi.fn();
    const iframeRef = { current: document.createElement("iframe") as HTMLIFrameElement | null };

    function Harness() {
      return React.createElement(DomEditOverlay, {
        ...createOverlayProps({
          iframeRef,
          selection,
          hoverSelection,
          onSelectionChange: () => {},
        }),
        onCanvasMouseDown,
      });
    }

    act(() => {
      root.render(React.createElement(Harness));
    });

    await flushOverlayRaf();

    const selectionBox = host.querySelector(
      '[data-dom-edit-selection-box="true"]',
    ) as HTMLDivElement;
    expect(selectionBox).toBeTruthy();

    act(() => {
      selectionBox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCanvasMouseDown).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hoverSelection }),
    );

    act(() => {
      root.unmount();
    });
    restoreRect();
    host.remove();
  });
});

describe("resolveDomEditCoordinateScale", () => {
  it("uses the top-level preview scale when no source boundary dimensions are available", () => {
    expect(
      resolveDomEditCoordinateScale({
        rootScaleX: 0.5,
        rootScaleY: 0.5,
      }),
    ).toEqual({
      scaleX: 0.5,
      scaleY: 0.5,
    });
  });

  it("converts source-local pixels through a scaled nested composition host", () => {
    expect(
      resolveDomEditCoordinateScale({
        rootScaleX: 0.5,
        rootScaleY: 0.5,
        sourceRectWidth: 960,
        sourceRectHeight: 540,
        sourceWidth: 1920,
        sourceHeight: 1080,
      }),
    ).toEqual({
      scaleX: 0.25,
      scaleY: 0.25,
    });
  });
});

describe("resolveDomEditGroupOverlayRect", () => {
  it("returns a bounding box that contains every selected element", () => {
    expect(
      resolveDomEditGroupOverlayRect([
        { left: 40, top: 30, width: 80, height: 50, editScaleX: 1, editScaleY: 1 },
        { left: 150, top: 10, width: 30, height: 120, editScaleX: 0.5, editScaleY: 0.5 },
        { left: 20, top: 90, width: 50, height: 20, editScaleX: 2, editScaleY: 2 },
      ]),
    ).toEqual({
      left: 20,
      top: 10,
      width: 160,
      height: 120,
      editScaleX: 1,
      editScaleY: 1,
    });
  });

  it("returns null for an empty group", () => {
    expect(resolveDomEditGroupOverlayRect([])).toBeNull();
  });
});

describe("filterNestedDomEditGroupItems", () => {
  it("keeps top-level selected elements so descendants are not moved twice", () => {
    const window = new Window();
    const parent = window.document.createElement("div");
    const child = window.document.createElement("div");
    const sibling = window.document.createElement("div");
    parent.append(child);

    expect(
      filterNestedDomEditGroupItems([
        { key: "parent", element: parent },
        { key: "child", element: child },
        { key: "sibling", element: sibling },
      ]).map((item) => item.key),
    ).toEqual(["parent", "sibling"]);
  });
});

// Note: the resize SIZE math moved from the AABB screen-space
// resolveDomEditResizeGesture (removed) to the local-space (OBB) model in
// domEditResizeLocal.ts — see domEditResizeLocal.test.ts, which re-covers the
// independent-axis, aspect-lock, and scaled-master-view cases plus rotated axes.

describe("resolveDomEditRotationGesture", () => {
  it("rotates by the pointer angle around the element center", () => {
    expect(
      resolveDomEditRotationGesture({
        centerX: 0,
        centerY: 0,
        startX: 0,
        startY: -10,
        currentX: 10,
        currentY: 0,
        actualAngle: 5,
        snap: false,
      }),
    ).toEqual({ angle: 95 });
  });

  it("uses the shortest delta across the 180 degree boundary", () => {
    expect(
      resolveDomEditRotationGesture({
        centerX: 0,
        centerY: 0,
        startX: -10,
        startY: 1.76,
        currentX: -10,
        currentY: -1.76,
        actualAngle: 0,
        snap: false,
      }).angle,
    ).toBeCloseTo(20, 1);
  });

  it("snaps to 15 degree increments when requested", () => {
    expect(
      resolveDomEditRotationGesture({
        centerX: 0,
        centerY: 0,
        startX: 10,
        startY: 0,
        currentX: 10,
        currentY: 3.25,
        actualAngle: 0,
        snap: true,
      }),
    ).toEqual({ angle: 15 });
  });

  it("allows small pointer movements and keeps the exact angle", () => {
    const nextRotation = resolveDomEditRotationGesture({
      centerX: 0,
      centerY: 0,
      startX: 0,
      startY: -40,
      currentX: 1,
      currentY: -40,
      actualAngle: 0,
      snap: false,
    });

    expect(nextRotation.angle).toBe(1.432);
    expect(hasDomEditRotationChanged(0, nextRotation.angle)).toBe(true);
    expect(hasDomEditRotationChanged(0, 0)).toBe(false);
  });
});

/**
 * Shift-click reads the hover cache instead of hit-testing, and the cache is
 * filled asynchronously as the pointer moves. Pass over one element on the way to
 * another and the cache still names the one you left, so the shift-click added
 * THAT element and the click looked like it selected something at random. The
 * guard is what makes the cache usable only when it is about the point clicked.
 */
describe("hoverCacheDescribesPoint", () => {
  const doc = new Window().document;

  it("rejects a cache left behind by an element the pointer passed over", () => {
    const passedOver = doc.createElement("div");
    const clicked = doc.createElement("div");
    doc.body.append(passedOver, clicked);

    expect(hoverCacheDescribesPoint(passedOver, clicked)).toBe(false);
  });

  it("accepts the cache when it names the element at the point", () => {
    const clicked = doc.createElement("div");
    doc.body.append(clicked);

    expect(hoverCacheDescribesPoint(clicked, clicked)).toBe(true);
  });

  // The resolver is allowed to hand back a clip ancestor of the raw target, which
  // still describes the same click — rejecting it would drop the fast path on
  // every element that has children.
  it("accepts an ancestor of the element at the point", () => {
    const clip = doc.createElement("div");
    const child = doc.createElement("span");
    clip.append(child);
    doc.body.append(clip);

    expect(hoverCacheDescribesPoint(clip, child)).toBe(true);
  });

  it("rejects a missing cache or an empty point", () => {
    const el = doc.createElement("div");
    expect(hoverCacheDescribesPoint(null, el)).toBe(false);
    expect(hoverCacheDescribesPoint(el, null)).toBe(false);
  });
});

// resolveResizeCenterAnchorOffset is the UNROTATED (AABB) fallback used only when
// the element's real transformed corners can't be measured. Center-anchored: a
// width/height change grows the box from its top-left, drifting the center by half
// the size change per axis, so the pin translates back by that half-delta. It is
// handle-independent — all four corners scale about the same center.
describe("resolveResizeCenterAnchorOffset", () => {
  it("grow: translates back by half the size change on both axes", () => {
    expect(
      resolveResizeCenterAnchorOffset({
        originWidth: 200,
        originHeight: 100,
        overlayWidth: 230,
        overlayHeight: 112,
      }),
    ).toEqual({ dx: -15, dy: -6 });
  });

  it("shrink: translates forward by half the (positive) size change", () => {
    expect(
      resolveResizeCenterAnchorOffset({
        originWidth: 200,
        originHeight: 100,
        overlayWidth: 160,
        overlayHeight: 80,
      }),
    ).toEqual({ dx: 20, dy: 10 });
  });

  it("no size change: zero offset", () => {
    expect(
      resolveResizeCenterAnchorOffset({
        originWidth: 200,
        originHeight: 100,
        overlayWidth: 200,
        overlayHeight: 100,
      }),
    ).toEqual({ dx: 0, dy: 0 });
  });
});
