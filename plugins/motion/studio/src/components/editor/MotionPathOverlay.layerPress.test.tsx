// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { GsapEditBlockedError } from "../../hooks/gsapEditOutcome";
import { usePlayerStore } from "../../player/store/playerStore";
import { MotionPathOverlay } from "./MotionPathOverlay";
import { commitNodeDrop } from "./motionPathCommit";
import type { DomEditSelection } from "./domEditing";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const { commitMutation } = vi.hoisted(() => ({
  commitMutation: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock("../../contexts/DomEditContext", () => ({
  useDomEditContext: () => ({ selectedGsapAnimations: [], commitMutation }),
}));
const showToast = vi.hoisted(() => vi.fn());
vi.mock("../../contexts/StudioContext", () => ({
  useStudioShellContextOptional: () => ({ showToast }),
}));
vi.mock("./motionPathCommit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./motionPathCommit")>()),
  commitNodeDrop: vi.fn(),
}));
vi.mock("./motionPathSelection", () => ({
  selectorFor: () => "#box",
  editableAnimationId: () => "a1",
}));
// GSAP renders the layer at the first keyframe: the playhead is on it.
vi.mock("../../hooks/gsapPositionDetection", () => ({
  readGsapPositionFromIframe: () => ({ x: 60, y: 30 }),
}));
vi.mock("./useMotionPathData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useMotionPathData")>()),
  useMotionPathData: () => ({
    rect: { left: 0, top: 0, width: 1920, height: 1080 },
    geometry: {
      kind: "linear",
      points: "60,30 120,30",
      nodes: [
        { x: 60, y: 30, ref: { type: "keyframe", pct: 66.667 } },
        // 140 wide there against 100 now: drawn 20 px right, where the layer's centre will be.
        { x: 120, y: 30, w: 140, ref: { type: "keyframe", pct: 100 } },
      ],
      start: { x: 40, y: 30, w: 120 },
    },
    geometryResolved: true,
    visibleInPreview: true,
    home: { x: 0, y: 0, w: 100, h: 50, ax: 0.5, ay: 0.5 },
    pScale: 1,
  }),
}));

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  commitMutation.mockClear();
});

/** What lies under the pointer below the path: the layer's box, a handle over it, a marker, or nothing. */
type Under = boolean | "handle" | "marker";

/** The overlay over a selected layer's box and a crop handle, scale 1: client px are composition px. */
function mount() {
  const overlay = document.createElement("div");
  const chrome = overlay.appendChild(document.createElement("div"));
  chrome.setAttribute("data-dom-edit-chrome", "true");
  const box = document.createElement("div");
  box.setAttribute("data-dom-edit-selection-box", "true");
  box.style.cursor = "move";
  const handle = document.createElement("button");
  handle.style.cursor = "ew-resize";
  chrome.append(box, handle);
  // Another layer's off-canvas marker: no handler of its own, so a press on it reaches the overlay's marquee.
  const marker = overlay.appendChild(document.createElement("div"));
  overlay.addEventListener("pointerdown", (e) => {
    if (!(e.target as Element).closest("[data-dom-edit-chrome]")) e.preventDefault();
  });
  const host = document.createElement("div");
  document.body.append(overlay, host);
  const handlePresses: number[] = [];
  handle.addEventListener("pointerdown", (e) => {
    handlePresses.push((e as PointerEvent).clientX);
    e.preventDefault();
  });
  const boxPresses: number[] = [];
  const state = { boxStarts: true };
  box.addEventListener("pointerdown", (e) => {
    boxPresses.push((e as PointerEvent).clientX);
    if (state.boxStarts) e.preventDefault();
  });
  const captured = vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(() => {});
  const root = createRoot(host);
  const selection = { element: document.createElement("div") } as unknown as DomEditSelection;
  act(() =>
    root.render(
      <MotionPathOverlay
        iframeRef={{ current: null }}
        selection={selection}
        compositionSize={{ width: 1920, height: 1080 }}
        isPlaying={false}
      />,
    ),
  );
  cleanups.push(() => {
    captured.mockRestore();
    act(() => root.unmount());
    overlay.remove();
    host.remove();
  });
  /** Fires `type` at `target`; `under`: the layer's box, a handle over the box, or only the canvas. */
  const fire = (target: Element, type: string, x: number, under: Under) => {
    const stack = { handle: [handle, box], marker: [marker], true: [box], false: [] }[
      String(under)
    ]!;
    document.elementsFromPoint = () => [target, ...stack, overlay];
    const init = { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 30 };
    act(() => void target.dispatchEvent(new PointerEvent(type, init)));
  };
  return { host, boxPresses, handlePresses, state, captured, fire };
}

it("the layer's node, and any node inside the layer's box, press the layer; outside it a node keeps the press", () => {
  const { host, boxPresses, state, captured, fire } = mount();
  const press = (node: number, x: number, inBox: Under) => {
    const hit = [...host.querySelectorAll("circle.pointer-events-auto")].find(
      (c) => c.getAttribute("cx") === String(node),
    )!;
    fire(hit, "pointerdown", x, inBox);
  };
  press(60, 63, false);
  press(140, 130, true);
  // On the dot itself: a drag from the layer's middle moves the layer (the edit bench's keys case).
  press(140, 140, true);
  expect(boxPresses).toEqual([63, 130, 140]);
  act(() => usePlayerStore.setState({ activeKeyframePct: 100 }));
  press(140, 140, true);
  act(() => usePlayerStore.setState({ activeKeyframePct: null }));
  expect(boxPresses).toEqual([63, 130, 140, 140]);
  press(140, 138, false);
  expect(boxPresses).toEqual([63, 130, 140, 140]);
  // Over another layer's off-canvas marker the node keeps its press; the canvas starts no marquee.
  captured.mockClear();
  press(140, 138, "marker");
  expect(captured).toHaveBeenCalledTimes(1);
  expect(boxPresses).toEqual([63, 130, 140, 140]);
  // A box that starts no gesture leaves the press to the node.
  state.boxStarts = false;
  captured.mockClear();
  press(60, 63, false);
  expect(captured).toHaveBeenCalledTimes(1);
});

it("the path's line inside the layer's box moves the layer and offers no add; outside it adds a keyframe", async () => {
  const { host, boxPresses, fire } = mount();
  const line = host.querySelector("polyline.pointer-events-auto") as SVGElement;
  const ghost = () => host.querySelector("rect.pointer-events-none");

  fire(line, "pointermove", 90, true);
  expect(line.style.cursor).toBe("move");
  expect(ghost()).toBeNull();
  fire(line, "pointerdown", 90, true);
  expect(boxPresses).toEqual([90]);
  expect(commitMutation).not.toHaveBeenCalled();

  fire(line, "pointermove", 90, false);
  expect(line.style.cursor).toBe("copy");
  expect(ghost()).not.toBeNull();
  // Halfway along the drawn segment 60 to 140: halfway between the stored offsets 60 and 120.
  fire(line, "pointerdown", 100, false);
  expect(boxPresses).toEqual([90]);
  await vi.waitFor(() => expect(commitMutation).toHaveBeenCalledTimes(1));
  expect(commitMutation.mock.calls[0]![0]).toMatchObject({ properties: { x: 90, y: 30 } });
});

it("a crop or resize handle over a node or the line takes the press, not the node or the layer", () => {
  const { host, boxPresses, handlePresses, captured, fire } = mount();
  const node = host.querySelector('circle.pointer-events-auto[cx="140"]')!;
  const line = host.querySelector("polyline.pointer-events-auto") as SVGElement;
  captured.mockClear();
  fire(node, "pointerdown", 142, "handle");
  fire(line, "pointermove", 100, "handle");
  expect(line.style.cursor).toBe("ew-resize");
  fire(line, "pointerdown", 100, "handle");
  expect(handlePresses).toEqual([142, 100]);
  expect(boxPresses).toEqual([]);
  expect(captured).not.toHaveBeenCalled();
  expect(commitMutation).not.toHaveBeenCalled();
});

it("draws where GSAP started the tween before the first keyframe, as a mark that takes no press", () => {
  const { host } = mount();
  const start = host.querySelector("circle[data-motion-path-start]")!;
  // 120 wide at the start against 100 now: drawn 10 px right.
  expect([start.getAttribute("cx"), start.getAttribute("cy")]).toEqual(["50", "30"]);
  expect(start.classList.contains("pointer-events-none")).toBe(true);
  const drawn = host.querySelector("polyline:not(.pointer-events-auto)")!;
  expect(drawn.getAttribute("points")).toBe("50,30 60,30 140,30");
});

it("a node drop the writer refuses says why", async () => {
  const refusal = new GsapEditBlockedError("keyframes-uneditable");
  vi.mocked(commitNodeDrop).mockRejectedValue(refusal);
  vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(() => {});
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const selection = { element: document.createElement("div") } as unknown as DomEditSelection;
  try {
    act(() =>
      root.render(
        <MotionPathOverlay
          iframeRef={{ current: null }}
          selection={selection}
          compositionSize={{ width: 1920, height: 1080 }}
          isPlaying={false}
        />,
      ),
    );
    const node = host.querySelector('circle.pointer-events-auto[cx="140"]')!;
    document.elementsFromPoint = () => [node];
    const at = (clientX: number) => ({ bubbles: true, button: 0, clientX, clientY: 30 });
    act(() => void node.dispatchEvent(new PointerEvent("pointerdown", at(140))));
    act(() => void node.dispatchEvent(new PointerEvent("pointermove", at(180))));
    await act(async () => void node.dispatchEvent(new PointerEvent("pointerup", at(180))));
    expect(commitNodeDrop).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(refusal.message, "error");
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
