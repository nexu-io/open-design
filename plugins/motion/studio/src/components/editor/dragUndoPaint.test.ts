// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { savePlainRotation } from "../../hooks/plainRotation";
import type { DomEditSelection } from "./domEditing";
import type { GestureState } from "./domEditOverlayGestures";
import { createDomEditOverlayGestureHandlers } from "./useDomEditOverlayGestures";
import {
  adoptingStudioPendingEdit,
  hasStudioPendingEdits,
  paintBackNewestStudioPendingEdit,
  type StudioEditInFlight,
} from "../../utils/studioPendingEdits";

const gsapOwns = vi.hoisted(() => ({ on: false }));
vi.mock("../../hooks/gsapRuntimeKeyframes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../hooks/gsapRuntimeKeyframes")>()),
  editsPlainCss: () => !gsapOwns.on,
}));

/** GSAP's own transform values per element, as `gsap.set` / `gsap.getProperty` see them. */
function fakeGsap(start: Record<string, number>) {
  const values = new Map<Element, Record<string, number>>();
  const of = (el: Element) => values.get(el) ?? values.set(el, { ...start }).get(el)!;
  gsapOwns.on = true;
  Object.assign(window, {
    gsap: {
      set: (el: Element, props: Record<string, number>) => Object.assign(of(el), props),
      getProperty: (el: Element, prop: string) => of(el)[prop] ?? 0,
    },
  });
  return of;
}

afterEach(() => {
  document.body.innerHTML = "";
  gsapOwns.on = false;
  Reflect.deleteProperty(window, "gsap");
});

const ref = <T>(current: T) => ({ current });
const pointer = (x: number, y: number) => ({
  clientX: x,
  clientY: y,
  pointerId: 1,
  button: 0,
  preventDefault() {},
  stopPropagation() {},
  currentTarget: { setPointerCapture() {}, releasePointerCapture() {} },
});

/** Drags a box without GSAP 100 px right and 60 px down; its save waits for `save`. */
function dragWithSaveRunning(save: Promise<void> | (() => Promise<void>)) {
  const element = document.createElement("div");
  element.style.setProperty("translate", "40px 30px");
  document.body.append(element);
  const selection = { element, capabilities: { canApplyManualOffset: true } };
  const handlers = createDomEditOverlayGestureHandlers({
    selectionRef: ref(selection as unknown as DomEditSelection),
    overlayRectRef: ref({ left: 0, top: 0, width: 240, height: 160, editScaleX: 1, editScaleY: 1 }),
    boxRef: ref(document.createElement("div")),
    overlayRef: ref(null),
    iframeRef: ref(null),
    gestureRef: ref<GestureState | null>(null),
    rafPausedRef: ref(false),
    onManualDragStartRef: ref(vi.fn()),
    onBlockedMoveRef: ref(vi.fn()),
    onPathOffsetCommitRef: ref(vi.fn(typeof save === "function" ? save : () => save)),
    snapGuidesRef: ref(null),
    groupGestureRef: ref(null),
    blockedMoveRef: ref(null),
    waitingPressRef: ref(null),
    setOverlayRect: vi.fn(),
    suppressNextBoxClickRef: ref(false),
    hoverSelectionRef: ref(null),
    onCanvasMouseDown: vi.fn(),
  } as never);
  expect(handlers.startGesture("drag", pointer(10, 10) as never)).toBe(true);
  handlers.onPointerUp(pointer(110, 70) as never);
  return element;
}

it("a drag whose save is still running can be painted back at once, and shown again", async () => {
  let saved!: () => void;
  const element = dragWithSaveRunning(new Promise<void>((resolve) => (saved = resolve)));
  const moved = element.style.getPropertyValue("translate");
  expect(moved).not.toBe("40px 30px");

  const shown = paintBackNewestStudioPendingEdit();
  expect(element.style.getPropertyValue("translate")).toBe("40px 30px");
  expect(paintBackNewestStudioPendingEdit()).toBeNull();
  shown!.showAgain();
  expect(element.style.getPropertyValue("translate")).toBe(moved);

  saved();
  await vi.waitFor(() => expect(hasStudioPendingEdits()).toBe(false));
  expect(paintBackNewestStudioPendingEdit()).toBeNull();
});

/** Resizes or rotates a plain 240x160 box; the commit draws what it saves at once and its save waits for `save`. */
function gestureWithSaveRunning(kind: "resize" | "rotate", save: Promise<void>) {
  const element = document.createElement("div");
  element.setAttribute(
    "style",
    "position: absolute; width: 240px; height: 160px; clip-path: inset(10px)",
  );
  document.body.append(element);
  const selection = {
    element,
    capabilities: { canApplyManualSize: true, canApplyManualRotation: true },
  };
  const handlers = createDomEditOverlayGestureHandlers({
    selectionRef: ref(selection as unknown as DomEditSelection),
    overlayRectRef: ref({ left: 0, top: 0, width: 240, height: 160, editScaleX: 1, editScaleY: 1 }),
    boxRef: ref(document.createElement("div")),
    overlayRef: ref(null),
    iframeRef: ref(null),
    gestureRef: ref<GestureState | null>(null),
    rafPausedRef: ref(false),
    onBoxSizeCommitRef: ref(
      vi.fn(() => {
        element.style.setProperty("clip-path", "inset(15px)");
        return save;
      }),
    ),
    onRotationCommitRef: ref((sel: DomEditSelection, next: never) =>
      savePlainRotation({ commitPositionPatchToHtml: () => save.then(() => undefined) }, sel, next),
    ),
    snapGuidesRef: ref(null),
    groupGestureRef: ref(null),
    blockedMoveRef: ref(null),
    waitingPressRef: ref(null),
    setOverlayRect: vi.fn(),
    suppressNextBoxClickRef: ref(false),
    hoverSelectionRef: ref(null),
    onCanvasMouseDown: vi.fn(),
  } as never);
  const start = kind === "resize" ? pointer(240, 160) : pointer(240, 80);
  expect(handlers.startGesture(kind, start as never, { resizeHandle: "se" })).toBe(true);
  const end = kind === "resize" ? pointer(300, 200) : pointer(120, 200);
  handlers.onPointerMove(end as never);
  handlers.onPointerUp(end as never);
  return element;
}

it.each(["resize", "rotate"] as const)(
  "a %s whose save is still running can be painted back at once, and shown again",
  async (kind) => {
    let saved!: () => void;
    const element = gestureWithSaveRunning(kind, new Promise<void>((resolve) => (saved = resolve)));
    const before = "position: absolute; width: 240px; height: 160px; clip-path: inset(10px)";
    const edited = element.getAttribute("style");
    expect(edited).not.toBe(before);

    const shown = paintBackNewestStudioPendingEdit();
    expect(element.getAttribute("style")).toBe(before);
    expect(paintBackNewestStudioPendingEdit()).toBeNull();
    shown!.showAgain();
    expect(element.getAttribute("style")).toBe(edited);

    saved();
    await vi.waitFor(() => expect(hasStudioPendingEdits()).toBe(false));
  },
);

it("a drag of a box GSAP positions is painted back to where GSAP had it, and shown again", async () => {
  const gsapOf = fakeGsap({ x: 5, y: 7 });
  let saved!: () => void;
  const element = dragWithSaveRunning(new Promise<void>((resolve) => (saved = resolve)));
  const moved = { ...gsapOf(element) };
  expect(moved).not.toMatchObject({ x: 5, y: 7 });

  const shown = paintBackNewestStudioPendingEdit();
  expect(gsapOf(element)).toMatchObject({ x: 5, y: 7 });
  shown!.showAgain();
  expect(gsapOf(element)).toMatchObject({ x: moved.x, y: moved.y });

  saved();
  await vi.waitFor(() => expect(hasStudioPendingEdits()).toBe(false));
});

it("a rotate of a box GSAP turns is painted back to GSAP's angle at press, and shown again", async () => {
  const gsapOf = fakeGsap({ rotation: 10 });
  let saved!: () => void;
  const element = gestureWithSaveRunning(
    "rotate",
    new Promise<void>((resolve) => (saved = resolve)),
  );
  const turned = gsapOf(element).rotation;
  expect(turned).not.toBe(10);

  const shown = paintBackNewestStudioPendingEdit();
  expect(gsapOf(element).rotation).toBe(10);
  shown!.showAgain();
  expect(gsapOf(element).rotation).toBe(turned);

  saved();
  await vi.waitFor(() => expect(hasStudioPendingEdits()).toBe(false));
});

it("a GSAP drag saved as a left/top offset stays painted back while that offset is drawn", async () => {
  fakeGsap({ x: 5, y: 7 });
  let saved!: () => void;
  let drawn!: Promise<void>;
  const element = dragWithSaveRunning(() => {
    const edit = adoptingStudioPendingEdit()!;
    drawn = new Promise<void>((resolve) => (saved = resolve)).then(() =>
      edit.drawKeepingUndone(() => void element.style.setProperty("left", "99px")),
    );
    return drawn;
  });

  const shown = paintBackNewestStudioPendingEdit();
  saved();
  await drawn;
  expect(element.style.getPropertyValue("left")).toBe("");
  shown!.showAgain();
  expect(element.style.getPropertyValue("left")).toBe("99px");
  await vi.waitFor(() => expect(hasStudioPendingEdits()).toBe(false));
});

it("keeps a GSAP drag's base through every repaint of its undo, so its save adds the drag once", async () => {
  const gsapOf = fakeGsap({ x: 5, y: 7 });
  let edit!: StudioEditInFlight;
  let release!: () => void;
  const element = dragWithSaveRunning(() => {
    edit = adoptingStudioPendingEdit()!;
    return new Promise<void>((resolve) => (release = resolve));
  });
  const moved = { ...gsapOf(element) };

  const shown = paintBackNewestStudioPendingEdit();
  edit.drawKeepingUndone(() => undefined);
  expect(gsapOf(element)).toMatchObject({ x: 5, y: 7 });
  expect(element.getAttribute("data-hf-drag-gsap-base-x")).toBe("5");
  shown!.showAgain();
  expect(gsapOf(element)).toMatchObject({ x: moved.x, y: moved.y });
  expect(element.getAttribute("data-hf-drag-gsap-base-x")).toBe("5");

  release();
  await vi.waitFor(() => expect(hasStudioPendingEdits()).toBe(false));
});
