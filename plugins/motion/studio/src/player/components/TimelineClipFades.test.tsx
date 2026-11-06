// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WAVEFORM_LAYER_Z } from "./AudioWaveform";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { TimelineClipFades, useClipFadeDraft } from "./TimelineClipFades";
import { TimelineEditProvider } from "../../contexts/TimelineEditContext";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Root[] = [];

afterEach(() => {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
  document.body.innerHTML = "";
  usePlayerStore.setState({ currentTime: 0, elements: [], timelineSnapEnabled: true });
});

/** TimelineClip owns the draft; this stands in for it. */
function Fades(props: { el: TimelineElement; showHandles: boolean; focusable?: boolean }) {
  const fade = useClipFadeDraft(props.el);
  return <TimelineClipFades {...props} pps={100} widthPx={props.el.duration * 100} fade={fade} />;
}

const clip: TimelineElement = {
  id: "music",
  tag: "audio",
  src: "assets/music.wav",
  start: 2,
  duration: 10,
  track: 1,
  fadeIn: 1,
  fadeOut: 2,
};

function render(
  el: TimelineElement,
  options: {
    showHandles?: boolean;
    provide?: boolean;
    focusable?: boolean;
    onClipPointerDown?: () => void;
  } = {},
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push(root);
  const onSetElementAttributeLive = vi.fn();
  const onSetElementAttributeQuiet = vi.fn().mockResolvedValue(undefined);
  const onRevertElementAttributeLive = vi.fn();
  // Stands in for the TimelineClip button the handles live inside.
  const tree = (el: TimelineElement) => (
    <div data-testid="clip" onPointerDown={options.onClipPointerDown}>
      <Fades el={el} showHandles={options.showHandles ?? true} focusable={options.focusable} />
    </div>
  );
  const wrap = (el: TimelineElement) =>
    options.provide === false ? (
      tree(el)
    ) : (
      <TimelineEditProvider
        value={{
          onSetElementAttributeLive,
          onSetElementAttributeQuiet,
          onRevertElementAttributeLive,
        }}
      >
        {tree(el)}
      </TimelineEditProvider>
    );
  act(() => root.render(wrap(el)));
  return {
    host,
    root,
    rerender: (next: TimelineElement) => act(() => root.render(wrap(next))),
    onSetElementAttributeLive,
    onSetElementAttributeQuiet,
    onRevertElementAttributeLive,
  };
}

function pointer(type: string, clientX: number, pointerId = 1, clientY = 0) {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY, button: 0 });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
}

/** Pointer down at the first point, then a move to each later one; [clientX, pointerId?]. */
function press(handle: HTMLElement, down: [number, number?], ...moves: Array<[number, number?]>) {
  act(() => handle.dispatchEvent(pointer("pointerdown", ...down)));
  for (const move of moves) act(() => handle.dispatchEvent(pointer("pointermove", ...move)));
}

function armedHandle(host: HTMLElement, edge: "in" | "out") {
  const handle = host.querySelector<HTMLElement>(`[data-testid="clip-fade-handle-${edge}"]`);
  if (!handle) throw new Error(`expected a fade-${edge} handle`);
  armCapture(handle);
  return handle;
}

function armCapture(handle: HTMLElement) {
  let captured = false;
  Object.defineProperty(handle, "setPointerCapture", { value: () => (captured = true) });
  Object.defineProperty(handle, "releasePointerCapture", { value: () => (captured = false) });
  Object.defineProperty(handle, "hasPointerCapture", { value: () => captured });
}

describe("TimelineClipFades", () => {
  it("shades the fade-in and fade-out as ramps sized by pps", () => {
    const { host, root } = render(clip, { showHandles: false, provide: false });
    const fadeIn = host.querySelector('[data-testid="clip-fade-in"]');
    const fadeOut = host.querySelector('[data-testid="clip-fade-out"]');
    // 1 s in at 100 px/s: the wedge spans 0..100; 2 s out on a 1000 px clip: 800..1000.
    expect(fadeIn?.getAttribute("points")).toBe("0,0 100,0 0,100");
    expect(fadeOut?.getAttribute("points")).toBe("800,0 1000,0 1000,100");
    // Outside a provider there is nothing to write to, so no handles either.
    expect(host.querySelector('[data-testid="clip-fade-handle-in"]')).toBeNull();
    act(() => root.unmount());
  });

  it("clips the ramps to the clip's rounded corners", () => {
    const { host, root } = render(clip, { showHandles: false, provide: false });
    const ramps = host.querySelector<SVGElement>('[data-testid="clip-fade-ramps"]');
    expect(ramps?.style.overflow).toBe("hidden");
    expect(ramps?.style.borderRadius).toBe("inherit");
    act(() => root.unmount());
  });

  it("measures the clip only while its handles show, so a zoom step forces no layout", () => {
    const measure = vi.spyOn(window, "getComputedStyle");
    const { rerender } = render(clip, { showHandles: false });
    rerender({ ...clip, duration: 11 });
    expect(measure).not.toHaveBeenCalled();
    act(() => mounted[0]?.unmount());
    render(clip, { showHandles: true });
    expect(measure).toHaveBeenCalled();
    measure.mockRestore();
  });

  it("renders nothing for a clip without fades when the handles are hidden", () => {
    const { host, root } = render(
      { ...clip, fadeIn: undefined, fadeOut: undefined },
      {
        showHandles: false,
      },
    );
    expect(host.querySelector('[data-testid="clip"]')?.innerHTML).toBe("");
    act(() => root.unmount());
  });

  it("drags the fade-in dot to the right, previewing live and committing once on release", () => {
    const { host, root, onSetElementAttributeLive, onSetElementAttributeQuiet } = render(clip);
    const handle = armedHandle(host, "in");
    // 150 px of rightward travel adds 1.5 s to the 1 s fade-in, wherever the press lands.
    press(handle, [100], [200], [250]);
    expect(onSetElementAttributeLive).toHaveBeenLastCalledWith(clip, "data-fade-in", "2.5");
    expect(onSetElementAttributeQuiet).not.toHaveBeenCalled();
    // The ramp follows the pointer before anything is persisted.
    expect(host.querySelector('[data-testid="clip-fade-in"]')?.getAttribute("points")).toBe(
      "0,0 250,0 0,100",
    );
    act(() => handle.dispatchEvent(pointer("pointerup", 250)));
    expect(onSetElementAttributeQuiet).toHaveBeenCalledTimes(1);
    expect(onSetElementAttributeQuiet).toHaveBeenCalledWith(clip, "data-fade-in", "2.5", "Fade in");
    act(() => root.unmount());
  });

  it("drags the fade-out dot to the left, growing the fade, and never past the fade-in", () => {
    const { host, root, onSetElementAttributeLive, onSetElementAttributeQuiet } = render(clip);
    const handle = armedHandle(host, "out");
    // 300 px of leftward travel adds 3 s to the 2 s fade-out, wherever the press lands.
    press(handle, [1000], [700]);
    expect(onSetElementAttributeLive).toHaveBeenLastCalledWith(clip, "data-fade-out", "5");
    // Way past the start: clamps to duration − fadeIn = 9 s.
    act(() => handle.dispatchEvent(pointer("pointermove", 0)));
    expect(onSetElementAttributeLive).toHaveBeenLastCalledWith(clip, "data-fade-out", "9");
    act(() => handle.dispatchEvent(pointer("pointerup", 0)));
    expect(onSetElementAttributeQuiet).toHaveBeenCalledWith(clip, "data-fade-out", "9", "Fade out");
    act(() => root.unmount());
  });

  it("removes the attribute when dragged back to zero", () => {
    const { host, root, onSetElementAttributeQuiet } = render(clip);
    const handle = armedHandle(host, "in");
    press(handle, [200], [0]);
    act(() => handle.dispatchEvent(pointer("pointerup", 0)));
    expect(onSetElementAttributeQuiet).toHaveBeenCalledWith(clip, "data-fade-in", null, "Fade in");
    act(() => root.unmount());
  });

  it("puts the live value back and writes nothing when the gesture is cancelled", () => {
    const {
      host,
      root,
      onSetElementAttributeLive,
      onRevertElementAttributeLive,
      onSetElementAttributeQuiet,
    } = render(clip);
    const handle = armedHandle(host, "in");
    press(handle, [100], [300]);
    act(() => handle.dispatchEvent(pointer("pointercancel", 300)));
    // Written back live for a host without the revert, then ended through the lanes' revert.
    expect(onSetElementAttributeLive).toHaveBeenLastCalledWith(clip, "data-fade-in", "1");
    expect(onRevertElementAttributeLive).toHaveBeenCalledWith(clip, "data-fade-in");
    expect(onSetElementAttributeQuiet).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("cancels a drag on Escape pressed while focus is elsewhere, and saves nothing", () => {
    const { host, onSetElementAttributeQuiet, onRevertElementAttributeLive } = render(clip);
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();
    const handle = armedHandle(host, "in");
    press(handle, [100], [300]);
    expect(document.activeElement).toBe(elsewhere);
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    act(() => handle.dispatchEvent(pointer("pointerup", 300)));
    expect(onSetElementAttributeQuiet).not.toHaveBeenCalled();
    expect(onRevertElementAttributeLive).toHaveBeenCalledWith(clip, "data-fade-in");
    expect(host.querySelector('[data-testid="clip-fade-in"]')?.getAttribute("points")).toBe(
      "0,0 100,0 0,100",
    );
  });

  it.each([
    ["above the window", 300, -40],
    ["on the window's right edge", window.innerWidth, 10],
  ])("restores the fade and saves nothing when released %s", (_, clientX, clientY) => {
    const { host, root, onSetElementAttributeLive, onRevertElementAttributeLive, ...rest } =
      render(clip);
    const handle = armedHandle(host, "in");
    press(handle, [100], [300]);
    act(() => handle.dispatchEvent(pointer("pointerup", clientX, 1, clientY)));
    expect(rest.onSetElementAttributeQuiet).not.toHaveBeenCalled();
    expect(onSetElementAttributeLive).toHaveBeenLastCalledWith(clip, "data-fade-in", "1");
    expect(onRevertElementAttributeLive).toHaveBeenCalledWith(clip, "data-fade-in");
    expect(host.querySelector('[data-testid="clip-fade-in"]')?.getAttribute("points")).toBe(
      "0,0 100,0 0,100",
    );
    act(() => root.unmount());
  });

  it.each([
    ["in", "Fade in 0.25 s"],
    ["out", "Fade out 0.4 s"],
  ])(
    "gives the fade-%s handle a 24 px target and a tooltip naming its length",
    async (edge, text) => {
      const { host, root } = render({ ...clip, fadeIn: 0.25, fadeOut: 0.4 });
      const handle = host.querySelector<HTMLElement>(`[data-testid="clip-fade-handle-${edge}"]`);
      if (!handle) throw new Error(`expected a fade-${edge} handle`);
      expect(parseFloat(handle.style.width)).toBeGreaterThanOrEqual(24);
      expect(parseFloat(handle.style.height)).toBeGreaterThanOrEqual(24);
      expect(handle.getAttribute("title")).toBe("");
      act(() => handle.focus());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(text);
      act(() => root.unmount());
    },
  );

  it.each([
    [0.3, "18px"],
    [3, "288px"],
  ])("puts the fade-in tab at the end of a %s s fade", (fadeIn, left) => {
    const { host } = render({ ...clip, fadeIn, fadeOut: 0.4 });
    const inHandle = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-in"]');
    const outHandle = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-out"]');
    // The 24 px box centres on the fade's end: 0.4 s out of a 1000 px clip ends at 960.
    expect(inHandle?.style.left).toBe(left);
    expect(outHandle?.style.left).toBe("948px");
    const tab = inHandle?.firstElementChild as HTMLElement;
    expect(tab.style.left).toBe("10px");
  });

  it("keeps the tab off the rounded end when there is no fade", () => {
    const { host } = render({ ...clip, fadeIn: undefined, fadeOut: undefined });
    const inHandle = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-in"]');
    const outHandle = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-out"]');
    expect(inHandle?.style.left).toBe("0px");
    expect(outHandle?.style.left).toBe("976px");
    // The tab itself sits 7 px in from each end: 5 px is its left edge, 2 px either side of 7.
    expect(inHandle?.querySelector<HTMLElement>(".timeline-fade-tab")?.style.left).toBe("5px");
  });

  it("lengthens a fade by the pointer's inward travel from wherever the press lands", () => {
    const { host, onSetElementAttributeLive } = render(clip);
    const fadeIn = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-in"]');
    const fadeOut = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-out"]');
    if (!fadeIn || !fadeOut) throw new Error("expected both handles");
    armCapture(fadeIn);
    armCapture(fadeOut);
    press(fadeIn, [12], [162]);
    expect(onSetElementAttributeLive).toHaveBeenLastCalledWith(clip, "data-fade-in", "2.5");
    act(() => fadeIn.dispatchEvent(pointer("pointerup", 162)));
    press(fadeOut, [988, 2], [888, 2]);
    expect(onSetElementAttributeLive).toHaveBeenLastCalledWith(clip, "data-fade-out", "3");
  });

  it("paints the handles above the clip's waveform and thumbnail layers", () => {
    const { host } = render(clip);
    const layer = host.querySelector<HTMLElement>('[data-testid="clip"]')?.firstElementChild;
    expect(Number((layer as HTMLElement).style.zIndex)).toBeGreaterThan(WAVEFORM_LAYER_Z);
  });

  it("splits a clip narrower than two targets between the handles", () => {
    const { host } = render({ ...clip, duration: 0.3, fadeIn: 0.1, fadeOut: 0.1 });
    const fadeIn = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-in"]');
    const fadeOut = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-out"]');
    expect([fadeIn?.style.left, fadeIn?.style.width]).toEqual(["0px", "15px"]);
    expect([fadeOut?.style.left, fadeOut?.style.width]).toEqual(["15px", "15px"]);
    const tab = fadeIn?.firstElementChild as HTMLElement;
    expect([tab.style.width, tab.style.height]).toEqual(["4px", "15px"]);
    // Layout is not real here; tests/e2e/fade-handles.mjs measures the tab in Chrome.
    expect(tab.style.pointerEvents).toBe("none");
  });

  it("snaps the fade's end to the playhead within the timeline's snap radius", () => {
    usePlayerStore.setState({ currentTime: 4.5 });
    const { host, onSetElementAttributeLive } = render(clip);
    const handle = armedHandle(host, "in");
    // 146 px makes a 2.46 s fade ending at 4.46 s, 4 px from the playhead: it lands on 4.5.
    press(handle, [100], [246]);
    expect(onSetElementAttributeLive).toHaveBeenLastCalledWith(clip, "data-fade-in", "2.5");
  });

  it("leaves the fade unsnapped when the timeline's snapping is off", () => {
    usePlayerStore.setState({ currentTime: 4.5, timelineSnapEnabled: false });
    const { host, onSetElementAttributeLive } = render(clip);
    const handle = armedHandle(host, "in");
    press(handle, [100], [246]);
    expect(onSetElementAttributeLive).toHaveBeenLastCalledWith(clip, "data-fade-in", "2.46");
  });

  it("snaps to another clip's edge", () => {
    usePlayerStore.setState({
      elements: [clip, { id: "title", tag: "div", start: 6, duration: 2, track: 0 }],
    });
    const { host, onSetElementAttributeLive } = render(clip);
    const handle = armedHandle(host, "out");
    // The 2 s fade-out starts at 10 s; 395 px left moves that to 6.05 s, onto the title's start.
    press(handle, [1000], [605]);
    expect(onSetElementAttributeLive).toHaveBeenLastCalledWith(clip, "data-fade-out", "6");
  });

  it.each([
    [1, null],
    [undefined, "0.5"],
  ])("double-click on a %s s fade-in saves %s", (fadeIn, saved) => {
    const { host, onSetElementAttributeQuiet } = render({ ...clip, fadeIn });
    const handle = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-in"]');
    act(() => handle?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(onSetElementAttributeQuiet).toHaveBeenCalledTimes(1);
    expect(onSetElementAttributeQuiet).toHaveBeenCalledWith(
      { ...clip, fadeIn },
      "data-fade-in",
      saved,
      "Fade in",
    );
  });

  const key = (handle: HTMLElement | null, type: "keydown" | "keyup", init: KeyboardEventInit) =>
    act(() => {
      handle?.dispatchEvent(new KeyboardEvent(type, { ...init, bubbles: true }));
    });

  it.each([
    [{ key: "ArrowRight" }, "1.1"],
    [{ key: "ArrowRight", shiftKey: true }, "2"],
    [{ key: "ArrowLeft" }, "0.9"],
    [{ key: "Home" }, null],
    [{ key: "Delete" }, null],
    [{ key: "Backspace" }, null],
    [{ key: "End" }, "8"],
  ])("saves a key press once it is released: %o", (init, saved) => {
    const outer = vi.fn();
    const { host, onSetElementAttributeQuiet } = render(clip, { focusable: true });
    document.body.addEventListener("keydown", outer);
    const handle = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-in"]');
    expect(handle?.tabIndex).toBe(0);
    key(handle, "keydown", init);
    expect(onSetElementAttributeQuiet).not.toHaveBeenCalled();
    key(handle, "keyup", init);
    expect(onSetElementAttributeQuiet).toHaveBeenCalledTimes(1);
    expect(onSetElementAttributeQuiet).toHaveBeenCalledWith(clip, "data-fade-in", saved, "Fade in");
    // The timeline's own arrow-key handling never sees a key the handle used.
    expect(outer).not.toHaveBeenCalled();
  });

  it.each(["ArrowRight", "End"])("saves nothing for %s on a lone fade past the clip's end", (k) => {
    const long = { ...clip, duration: 3, fadeIn: 5, fadeOut: undefined };
    const { host, onSetElementAttributeQuiet } = render(long, { focusable: true });
    const handle = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-in"]');
    key(handle, "keydown", { key: k });
    key(handle, "keyup", { key: k });
    expect(onSetElementAttributeQuiet).not.toHaveBeenCalled();
  });

  it("previews a held key live and saves it as one step", () => {
    const { host, onSetElementAttributeLive, onSetElementAttributeQuiet } = render(clip, {
      focusable: true,
    });
    const handle = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-in"]');
    for (const repeat of [false, true, true]) key(handle, "keydown", { key: "ArrowRight", repeat });
    expect(onSetElementAttributeLive.mock.calls.map(([, , value]) => value)).toEqual([
      "1.1",
      "1.2",
      "1.3",
    ]);
    key(handle, "keyup", { key: "ArrowRight" });
    expect(onSetElementAttributeQuiet).toHaveBeenCalledTimes(1);
    expect(onSetElementAttributeQuiet).toHaveBeenCalledWith(clip, "data-fade-in", "1.3", "Fade in");
  });

  it("ignores keys while the handle is being dragged", () => {
    const { host, onSetElementAttributeQuiet } = render(clip, { focusable: true });
    const handle = armedHandle(host, "in");
    press(handle, [100], [200]);
    key(handle, "keydown", { key: "Home" });
    key(handle, "keyup", { key: "Home" });
    expect(onSetElementAttributeQuiet).not.toHaveBeenCalled();
  });

  it("drops the draft when the save fails, leaving the live value to the save path", async () => {
    const { host, onSetElementAttributeQuiet, onRevertElementAttributeLive } = render(clip);
    onSetElementAttributeQuiet.mockResolvedValueOnce({ status: "failed", reason: "disk full" });
    const handle = armedHandle(host, "in");
    press(handle, [100], [300]);
    act(() => handle.dispatchEvent(pointer("pointerup", 300)));
    await act(async () => {});
    expect(onRevertElementAttributeLive).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="clip-fade-in"]')?.getAttribute("points")).toBe(
      "0,0 100,0 0,100",
    );
  });

  it("steps from a pressed value whose save has not landed yet", () => {
    const { host, onSetElementAttributeQuiet } = render(clip, { focusable: true });
    onSetElementAttributeQuiet.mockReturnValue(new Promise(() => {}));
    const handle = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-in"]');
    for (let tap = 0; tap < 2; tap++) {
      key(handle, "keydown", { key: "ArrowRight" });
      key(handle, "keyup", { key: "ArrowRight" });
    }
    expect(onSetElementAttributeQuiet.mock.calls.map(([, , value]) => value)).toEqual([
      "1.1",
      "1.2",
    ]);
  });

  it("saves a held key before a press on the handle starts a drag", () => {
    const { host, onSetElementAttributeQuiet } = render(clip, { focusable: true });
    const handle = armedHandle(host, "in");
    key(handle, "keydown", { key: "ArrowRight" });
    press(handle, [100]);
    expect(onSetElementAttributeQuiet).toHaveBeenCalledWith(clip, "data-fade-in", "1.1", "Fade in");
  });

  it("keeps a handle drawn while it is dragged to where it can no longer move", () => {
    // A fade-in that fills the clip next to a 2 s fade-out, as a trim leaves it.
    const trimmed = { ...clip, fadeIn: 10, fadeOut: 2 };
    const { host, onSetElementAttributeQuiet } = render(trimmed);
    const handle = armedHandle(host, "out");
    // 200 px right shrinks the 2 s fade-out to 0, where it has no room left to move.
    press(handle, [800], [1000]);
    act(() => handle.dispatchEvent(pointer("pointerup", 1000)));
    expect(onSetElementAttributeQuiet).toHaveBeenCalledWith(
      trimmed,
      "data-fade-out",
      null,
      "Fade out",
    );
  });

  it("hides a handle with less than one 0.01 s step to move", () => {
    const { host } = render({ ...clip, duration: 10.0333, fadeIn: 10.03, fadeOut: undefined });
    expect(host.querySelector('[data-testid="clip-fade-handle-out"]')).toBeNull();
  });

  it("never lets a grow key shrink a fade when the pair overruns the clip", () => {
    const overrun = { ...clip, fadeIn: 2, fadeOut: 10 };
    const { host, onSetElementAttributeQuiet } = render(overrun, { focusable: true });
    const handle = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-in"]');
    key(handle, "keydown", { key: "ArrowRight" });
    key(handle, "keyup", { key: "ArrowRight" });
    expect(onSetElementAttributeQuiet).not.toHaveBeenCalled();
  });

  it("keeps stepping from each press while earlier saves land", async () => {
    const saves: Array<() => void> = [];
    const { host, onSetElementAttributeQuiet, rerender } = render(clip, { focusable: true });
    onSetElementAttributeQuiet.mockImplementation(
      () => new Promise<undefined>((resolve) => saves.push(() => resolve(undefined))),
    );
    const handle = () => host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-in"]');
    const tap = () => {
      key(handle(), "keydown", { key: "ArrowRight" });
      key(handle(), "keyup", { key: "ArrowRight" });
    };
    tap();
    tap();
    // The first save lands: the store re-reads 1.1 while 1.2 is still on its way.
    rerender({ ...clip, fadeIn: 1.1 });
    await act(async () => saves[0]());
    tap();
    expect(onSetElementAttributeQuiet.mock.calls.map(([, , value]) => value)).toEqual([
      "1.1",
      "1.2",
      "1.3",
    ]);
  });

  it("keeps a focused handle drawn when a key takes it to where it cannot move", () => {
    const trimmed = { ...clip, fadeIn: 10, fadeOut: 2 };
    const { host, onSetElementAttributeQuiet } = render(trimmed, { focusable: true });
    const handle = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-out"]');
    act(() => handle?.focus());
    key(handle, "keydown", { key: "Home" });
    key(handle, "keyup", { key: "Home" });
    expect(onSetElementAttributeQuiet).toHaveBeenCalledWith(
      trimmed,
      "data-fade-out",
      null,
      "Fade out",
    );
  });

  it("never lets a grow drag shrink a fade when the pair overruns the clip", () => {
    const trimmed = { ...clip, fadeIn: 10, fadeOut: 2 };
    const { host, onSetElementAttributeLive, onSetElementAttributeQuiet } = render(trimmed);
    const handle = armedHandle(host, "out");
    // Leftward grows a fade-out; the fade-in already fills the clip, so it holds at 2 s.
    press(handle, [900], [880]);
    act(() => handle.dispatchEvent(pointer("pointerup", 880)));
    expect(onSetElementAttributeLive).not.toHaveBeenCalledWith(trimmed, "data-fade-out", null);
    expect(onSetElementAttributeQuiet).not.toHaveBeenCalled();
  });

  it("keeps a pending save's draft through a click that never moves", () => {
    const { host, onSetElementAttributeQuiet } = render({ ...clip, fadeIn: undefined });
    onSetElementAttributeQuiet.mockReturnValue(new Promise(() => {}));
    const handle = armedHandle(host, "in");
    const doubleClick = () => {
      press(handle, [12]);
      act(() => handle.dispatchEvent(pointer("pointerup", 12)));
      act(() => handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    };
    doubleClick();
    doubleClick();
    // Add 0.5 s, then take it away again, though the first save never landed.
    expect(onSetElementAttributeQuiet.mock.calls.map(([, , value]) => value)).toEqual([
      "0.5",
      null,
    ]);
  });

  it("shrinks a single fade longer than its clip from the clip's end, with no dead travel", () => {
    const long = { ...clip, duration: 3, fadeIn: 5, fadeOut: undefined };
    const { host, onSetElementAttributeLive } = render(long);
    const handle = armedHandle(host, "in");
    press(handle, [200], [195], [100]);
    expect(onSetElementAttributeLive).toHaveBeenLastCalledWith(long, "data-fade-in", "2");
  });

  it("gives a fade that fills the clip the only handle at its end", () => {
    const { host } = render({ ...clip, fadeIn: 10, fadeOut: undefined });
    // The fade-out can neither grow nor shrink, so it does not sit on top of the fade-in's tab.
    expect(host.querySelector('[data-testid="clip-fade-handle-out"]')).toBeNull();
    const inHandle = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-in"]');
    expect([inHandle?.style.left, inHandle?.style.width]).toEqual(["976px", "24px"]);
  });

  it("splits two nearby boxes at the midpoint between their tabs on a tiny clip", () => {
    // A 40 px clip with a 30 px fade-in: tabs at 30 and 33 px, boxes meet at 31.5.
    const { host } = render({ ...clip, duration: 0.4, fadeIn: 0.3, fadeOut: undefined });
    const inHandle = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-in"]');
    const outHandle = host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-out"]');
    expect([inHandle?.style.left, inHandle?.style.width]).toEqual(["11.5px", "20px"]);
    expect([outHandle?.style.left, outHandle?.style.width]).toEqual(["31.5px", "8.5px"]);
  });

  it("keeps a long fade's hit box on its tab", () => {
    const { host } = render({ ...clip, fadeIn: 8, fadeOut: 0.4 });
    // The 8 s fade ends at 800 px; its 24 px box centres there, not in its half.
    expect(host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-in"]')?.style.left).toBe(
      "788px",
    );
  });

  it("never snaps a fade to its own clip's edges", () => {
    usePlayerStore.setState({
      currentTime: 2,
      elements: [{ id: "before", tag: "audio", start: 0, duration: 2, track: 1 }, clip],
    });
    const { host, onSetElementAttributeLive } = render(clip);
    const handle = armedHandle(host, "in");
    // 0.05 s from the clip's start, where the playhead and the neighbour's end both sit.
    press(handle, [100], [5]);
    expect(onSetElementAttributeLive).toHaveBeenLastCalledWith(clip, "data-fade-in", "0.05");
  });

  it("keeps an unselected clip's handles out of the tab order", () => {
    const { host } = render(clip);
    expect(host.querySelector<HTMLElement>('[data-testid="clip-fade-handle-in"]')?.tabIndex).toBe(
      -1,
    );
  });

  it("does not let a press on the dot start the clip's own move gesture", () => {
    const outer = vi.fn();
    const { host, root } = render(clip, { onClipPointerDown: outer });
    const handle = armedHandle(host, "in");
    act(() => handle.dispatchEvent(pointer("pointerdown", 100)));
    expect(outer).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
