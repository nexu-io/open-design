// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "./domEditing";
import type { GestureState } from "./domEditOverlayGestures";
import { createDomEditOverlayGestureHandlers } from "./useDomEditOverlayGestures";

afterEach(() => {
  delete (window as { gsap?: unknown }).gsap;
  delete (window as { __timelines?: unknown }).__timelines;
  document.body.innerHTML = "";
});

const PRESS = {
  clientX: 10,
  clientY: 10,
  pointerId: 1,
  button: 0,
  preventDefault() {},
  stopPropagation() {},
  currentTarget: { setPointerCapture() {} },
};

/** Presses a drag or resize on the element and returns the gesture it started. */
function pressGesture(element: HTMLElement, kind: "drag" | "resize" = "drag"): GestureState | null {
  const opts = pressOptions(element);
  expect(
    createDomEditOverlayGestureHandlers(opts as never).startGesture(kind, PRESS as never),
  ).toBe(true);
  return opts.gestureRef.current;
}

function pressOptions(element: HTMLElement) {
  const ref = <T>(current: T) => ({ current });
  const capabilities = { canApplyManualOffset: true, canApplyManualSize: true };
  const selection = { element, capabilities };
  return {
    selectionRef: ref(selection as unknown as DomEditSelection),
    overlayRectRef: ref({ left: 0, top: 0, width: 240, height: 160, editScaleX: 1, editScaleY: 1 }),
    boxRef: ref(document.createElement("div")),
    overlayRef: ref(null),
    iframeRef: ref(null),
    gestureRef: ref<GestureState | null>(null),
    rafPausedRef: ref(false),
    onManualDragStartRef: ref(vi.fn()),
    onBlockedMoveRef: ref(vi.fn()),
    onPathOffsetCommitRef: ref(vi.fn()),
    snapGuidesRef: ref(null),
    groupGestureRef: ref(null),
    blockedMoveRef: ref(null),
    waitingPressRef: ref(null),
    setOverlayRect: vi.fn(),
    suppressNextBoxClickRef: ref(false),
    hoverSelectionRef: ref(null),
    onCanvasMouseDown: vi.fn(),
  };
}

describe("a drag or resize press on a page that loads GSAP", () => {
  it.each([
    ["drag", "GSAP animates nothing", false],
    ["drag", "GSAP animates only its parent", true],
    ["resize", "GSAP animates nothing", false],
  ] as const)(
    "%s, %s: the press never asks GSAP about the element, so its translate stays CSS",
    (kind, _, parentTween) => {
      const getProperty = vi.fn(() => 0);
      const set = vi.fn();
      const parent = document.createElement("div");
      const element = document.createElement("div");
      element.style.setProperty("translate", "40px 30px");
      parent.append(element);
      document.body.append(parent);
      const tween = { targets: () => [parent], vars: { x: 100 }, duration: () => 2 };
      const timelines = { main: { getChildren: () => (parentTween ? [tween] : []) } };
      Object.assign(window, { gsap: { getProperty, set }, __timelines: timelines });
      expect(pressGesture(element, kind)?.pathOffsetMember?.plainTranslate).toBe(true);
      expect(getProperty).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
      expect(element.style.getPropertyValue("translate")).toBe("40px 30px");
    },
  );
});

describe("a drag press on a centred element without GSAP", () => {
  it("starts from its -50% translate in px and leaves its style as it was", () => {
    const element = document.createElement("div");
    element.style.cssText =
      "position: absolute; left: 50%; top: 50%; width: 240px; height: 160px; translate: -50% -50%";
    document.body.append(element);
    const style = element.getAttribute("style");
    expect(pressGesture(element)?.pathOffsetMember?.initialOffset).toEqual({ x: -120, y: -80 });
    expect(element.getAttribute("style")).toBe(style);
  });
});

describe("a drag on an element without GSAP", () => {
  it("drops on the route it chose at press, even if GSAP takes the element over mid-drag", () => {
    const element = document.createElement("div");
    element.style.setProperty("translate", "40px 30px");
    document.body.append(element);
    const opts = pressOptions(element);
    const handlers = createDomEditOverlayGestureHandlers(opts as never);
    expect(handlers.startGesture("drag", PRESS as never)).toBe(true);
    Object.assign(element, { _gsap: { renderTransform: () => {} } });
    const release = {
      ...PRESS,
      clientX: 110,
      clientY: 70,
      currentTarget: { releasePointerCapture() {} },
    };
    handlers.onPointerUp(release as never);
    expect(opts.onPathOffsetCommitRef.current).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ plainTranslate: true }),
    );
  });
});

describe("a group drag of elements without GSAP", () => {
  it("drops every member on the route it chose at press", () => {
    const items = [0, 1].map((i) => {
      const element = document.createElement("div");
      element.style.setProperty("translate", `${i * 10}px 0px`);
      document.body.append(element);
      const selection = { element, capabilities: { canApplyManualOffset: true } };
      const rect = { left: 0, top: 0, width: 240, height: 160, editScaleX: 1, editScaleY: 1 };
      return { key: `m${i}`, selection, element, rect };
    });
    const onGroupPathOffsetCommit = vi.fn();
    const opts = {
      ...pressOptions(items[0]!.element),
      groupOverlayItemsRef: { current: items },
      onGroupPathOffsetCommitRef: { current: onGroupPathOffsetCommit },
      setGroupOverlayItems: vi.fn(),
    };
    const handlers = createDomEditOverlayGestureHandlers(opts as never);
    expect(handlers.startGroupDrag(PRESS as never)).toBe(true);
    const release = {
      ...PRESS,
      clientX: 110,
      clientY: 70,
      currentTarget: { releasePointerCapture() {} },
    };
    handlers.onPointerUp(release as never);
    const updates = onGroupPathOffsetCommit.mock.calls[0]?.[0] as { plainTranslate?: boolean }[];
    expect(updates.map((update) => update.plainTranslate)).toEqual([true, true]);
  });
});

describe("a rotate on a page that loads GSAP", () => {
  it("never asks GSAP about an element it does not turn, and draws the turn as its CSS rotate", () => {
    const getProperty = vi.fn(() => 0);
    const set = vi.fn();
    const element = document.createElement("div");
    element.style.setProperty("rotate", "30deg");
    document.body.append(element);
    Object.assign(window, {
      gsap: { getProperty, set },
      __timelines: { main: { getChildren: () => [] } },
    });
    const selection = { element, capabilities: { canApplyManualRotation: true } };
    const ref = <T>(current: T) => ({ current });
    const opts = {
      selectionRef: ref(selection as unknown as DomEditSelection),
      overlayRectRef: ref({ left: 0, top: 0, width: 50, height: 40, editScaleX: 1, editScaleY: 1 }),
      boxRef: ref(document.createElement("div")),
      overlayRef: ref(null),
      iframeRef: ref(null),
      gestureRef: ref<GestureState | null>(null),
      groupGestureRef: ref(null),
      blockedMoveRef: ref(null),
      waitingPressRef: ref(null),
      rafPausedRef: ref(false),
      onCanvasPointerMoveRef: ref(vi.fn()),
    };
    const pointer = (clientX: number, clientY: number) => ({
      clientX,
      clientY,
      pointerId: 1,
      button: 0,
      buttons: 1,
      shiftKey: false,
      preventDefault() {},
      stopPropagation() {},
      currentTarget: { setPointerCapture() {} },
    });

    const handlers = createDomEditOverlayGestureHandlers(opts as never);
    expect(handlers.startGesture("rotate", pointer(25, -20) as never)).toBe(true);
    expect(opts.gestureRef.current?.plainRotation).toEqual({
      property: "rotate",
      before: "",
      after: "",
      share: 0,
      sign: 1,
      inline: false,
    });
    expect(opts.gestureRef.current?.actualRotation).toBeCloseTo(30);
    handlers.onPointerMove(pointer(60, 20) as never);

    expect(element.style.getPropertyValue("rotate")).toMatch(/deg$/);
    expect(element.style.getPropertyValue("rotate")).not.toBe("30deg");
    expect(getProperty).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
});

describe("a rotate press on an element a GSAP tween turns", () => {
  it.each(["rotation", "rotate", "rotateZ"])("reads its base from GSAP (%s)", (channel) => {
    const getProperty = vi.fn(() => 40);
    const element = document.createElement("div");
    document.body.append(element);
    const tween = { targets: () => [element], vars: { [channel]: 40 }, duration: () => 2 };
    const timelines = { main: { getChildren: () => [tween] } };
    Object.assign(window, { gsap: { getProperty, set: vi.fn() }, __timelines: timelines });
    const ref = <T>(current: T) => ({ current });
    const selection = { element, capabilities: { canApplyManualRotation: true } };
    const opts = {
      selectionRef: ref(selection as unknown as DomEditSelection),
      overlayRectRef: ref({ left: 0, top: 0, width: 50, height: 40, editScaleX: 1, editScaleY: 1 }),
      boxRef: ref(document.createElement("div")),
      overlayRef: ref(null),
      iframeRef: ref(null),
      gestureRef: ref<GestureState | null>(null),
      rafPausedRef: ref(false),
      waitingPressRef: ref(null),
    };
    const press = {
      clientX: 25,
      clientY: -20,
      pointerId: 1,
      button: 0,
      preventDefault() {},
      stopPropagation() {},
      currentTarget: { setPointerCapture() {} },
    };
    const handlers = createDomEditOverlayGestureHandlers(opts as never);
    expect(handlers.startGesture("rotate", press as never)).toBe(true);
    expect(opts.gestureRef.current?.plainRotation).toBeNull();
    expect(opts.gestureRef.current?.actualRotation).toBe(40);
    expect(getProperty).toHaveBeenCalledWith(element, "rotation");
  });
});
