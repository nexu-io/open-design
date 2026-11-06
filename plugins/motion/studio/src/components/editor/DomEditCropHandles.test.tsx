// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "./domEditing";
import type { OverlayRect } from "./domEditOverlayGeometry";
import { DomEditCropHandles } from "./DomEditCropHandles";
import { isElementCropLifted } from "./domEditOverlayCrop";
import { useCropPresetBarStore } from "./cropPresetStore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

const overlayRect: OverlayRect = {
  left: 0,
  top: 0,
  width: 200,
  height: 100,
  editScaleX: 1,
  editScaleY: 1,
};

function selectionFor(el: HTMLElement): DomEditSelection {
  return { element: el, id: el.id, selector: `#${el.id}` } as unknown as DomEditSelection;
}

function makeEl(id: string, clip: string): HTMLElement {
  const el = document.createElement("div");
  el.id = id;
  if (clip) el.style.setProperty("clip-path", clip);
  document.body.append(el);
  return el;
}

/** Presses at the first x, moves through the rest with their buttons, and lets go where the last held move was. */
function dragCropRight(handle: HTMLElement, pointerId: number, points: [number, number][]) {
  const [[start], ...moves] = points;
  const release = moves.filter(([, buttons]) => buttons & 1).at(-1)?.[0] ?? start;
  const send = (type: string, clientX: number, buttons: number) =>
    handle.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, buttons, clientX }));
  act(() => {
    send("pointerdown", start, 1);
    for (const [x, buttons] of moves) send("pointermove", x, buttons);
    send("pointerup", release, 0);
  });
}

function render(
  el: HTMLElement,
  onStyleCommit: (property: string, value: string) => Promise<unknown> | void = () => undefined,
  rect: OverlayRect = overlayRect,
): { root: Root; rerender: (next: HTMLElement) => void } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const draw = (target: HTMLElement) =>
    act(() => {
      root.render(
        <DomEditCropHandles
          selection={selectionFor(target)}
          overlayRect={rect}
          onStyleCommit={onStyleCommit}
        />,
      );
    });
  draw(el);
  return { root, rerender: draw };
}

// The lift never touches the element's own clip-path: select+deselect must leave what the author
// wrote verbatim, and a direct A→B switch must drop A's lift, not B's.
describe("DomEditCropHandles clip lift", () => {
  it("lifts on select without rewriting the inline clip, and drops the lift on unmount", () => {
    const a = makeEl("a", "inset(16px round 12px)");
    const { root } = render(a);
    expect(isElementCropLifted(a)).toBe(true);
    expect(a.style.getPropertyValue("clip-path")).toBe("inset(16px round 12px)");
    act(() => root.unmount());
    expect(isElementCropLifted(a)).toBe(false);
    expect(a.style.getPropertyValue("clip-path")).toBe("inset(16px round 12px)");
  });

  it("drops A's lift when switching directly to B", () => {
    const a = makeEl("a", "inset(16px)");
    const b = makeEl("b", "inset(40px 8px 4px 2px)");
    const { root, rerender } = render(a);
    rerender(b);
    expect(isElementCropLifted(a)).toBe(false);
    expect(isElementCropLifted(b)).toBe(true);
    expect(a.style.getPropertyValue("clip-path")).toBe("inset(16px)");
    act(() => root.unmount());
    expect(b.style.getPropertyValue("clip-path")).toBe("inset(40px 8px 4px 2px)");
  });

  it("never lifts an uneditable clip and leaves it untouched across select/deselect", () => {
    const a = makeEl("a", "circle(50% at 50% 50%)");
    const { root } = render(a);
    expect(isElementCropLifted(a)).toBe(false);
    act(() => root.unmount());
    expect(a.style.getPropertyValue("clip-path")).toBe("circle(50% at 50% 50%)");
  });

  it.each([
    { name: "a crop edge", clip: "inset(10px)", handle: "Crop right", dx: -20, dy: 0 },
    {
      name: "the reposition handle on fractional insets",
      clip: "inset(20px 0.42px 40px 0.03px)",
      handle: "Reposition crop",
      dx: 0,
      dy: 10,
    },
  ])("commits nothing when $name is dragged back to where it started", (c) => {
    const onStyleCommit = vi.fn();
    render(makeEl("a", c.clip), onStyleCommit);
    const handle = document.querySelector<HTMLButtonElement>(`[aria-label="${c.handle}"]`)!;
    for (const [type, d] of [
      ["pointerdown", 0],
      ["pointermove", 1],
      ["pointermove", 0],
      ["pointerup", 0],
    ] as const) {
      const at = { clientX: 100 + d * c.dx, clientY: 50 + d * c.dy };
      act(() =>
        handle.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            buttons: type === "pointerup" ? 0 : 1,
            pointerId: 3,
            ...at,
          }),
        ),
      );
    }
    expect(onStyleCommit).not.toHaveBeenCalled();
  });

  it("commits where the pointer was released, even before its last move renders", () => {
    const onStyleCommit = vi.fn();
    render(makeEl("a", "inset(10px)"), onStyleCommit);
    const handle = document.querySelector<HTMLButtonElement>('[aria-label="Crop right"]')!;
    dragCropRight(handle, 4, [
      [100, 1],
      [90, 1],
      [80, 1],
    ]);
    expect(onStyleCommit).toHaveBeenCalledWith("clip-path", "inset(10px 30px 10px 10px)");
  });

  it("commits where the pointer let go, not at a buttonless move back at the press point", () => {
    const onStyleCommit = vi.fn();
    render(makeEl("a", "inset(10px)"), onStyleCommit);
    const handle = document.querySelector<HTMLButtonElement>('[aria-label="Crop right"]')!;
    dragCropRight(handle, 6, [
      [100, 1],
      [80, 1],
      [100, 0],
    ]);
    expect(onStyleCommit).toHaveBeenCalledWith("clip-path", "inset(10px 30px 10px 10px)");
  });

  it("keeps a first crop on deselect when the release beats the last render", async () => {
    const a = makeEl("a", "");
    const { root } = render(a, (property, value) => void a.style.setProperty(property, value));
    const handle = document.querySelector<HTMLButtonElement>('[aria-label="Crop right"]')!;
    dragCropRight(handle, 5, [
      [100, 1],
      [90, 1],
      [80, 1],
    ]);
    await act(async () => undefined);
    act(() => root.unmount());
    expect(a.style.getPropertyValue("clip-path")).toBe("inset(0px 20px 0px 0px)");
  });

  it("commits the dragged crop and stays lifted when the save fails", async () => {
    const a = makeEl("a", "inset(10px)");
    const onStyleCommit = vi.fn((property: string, value: string) => {
      a.style.setProperty(property, value);
      return Promise.reject(new Error("persist failed"));
    });
    const { root } = render(a, onStyleCommit);
    const handle = document.querySelector<HTMLButtonElement>('[aria-label="Crop right"]')!;
    const press = (type: string, clientX: number) =>
      act(() =>
        handle.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            buttons: type === "pointerup" ? 0 : 1,
            pointerId: 1,
            clientX,
          }),
        ),
      );
    press("pointerdown", 100);
    press("pointermove", 80);
    await act(async () => {
      press("pointerup", 80);
      await Promise.resolve();
    });

    expect(onStyleCommit).toHaveBeenCalledWith("clip-path", "inset(10px 30px 10px 10px)");
    expect(isElementCropLifted(a)).toBe(true);
    act(() => root.unmount());
  });

  it("draws the crop the element has now, after an undo rewrites it", () => {
    const a = makeEl("a", "inset(0px 20px 0px 0px)");
    const { root, rerender } = render(a);
    const outline = () => document.querySelector<HTMLElement>(".border-dashed")!.style.width;
    expect(outline()).toBe("180px");
    a.style.setProperty("clip-path", "inset(0px 50px 0px 0px)");
    rerender(a);
    expect(outline()).toBe("150px");
    act(() => root.unmount());
  });
});

describe("DomEditCropHandles leaves the corner resize dots free", () => {
  type Box = { left: number; top: number; width: number; height: number };
  const HIT = 16;
  const cornerSquares = (r: Box): Box[] =>
    [
      [r.left, r.top],
      [r.left + r.width, r.top],
      [r.left, r.top + r.height],
      [r.left + r.width, r.top + r.height],
    ].map(([x, y]) => ({ left: x - HIT / 2, top: y - HIT / 2, width: HIT, height: HIT }));
  const overlaps = (a: Box, b: Box) =>
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height;
  const handles = () =>
    [...document.querySelectorAll<HTMLElement>("[data-dom-edit-crop-handle]")].map((el) => ({
      label: el.getAttribute("aria-label"),
      box: {
        left: parseFloat(el.style.left),
        top: parseFloat(el.style.top),
        width: parseFloat(el.style.width),
        height: parseFloat(el.style.height),
      },
    }));
  const rectOf = (width: number, height: number): OverlayRect => ({
    left: 0,
    top: 0,
    width,
    height,
    editScaleX: 1,
    editScaleY: 1,
  });

  it.each([
    {
      name: "29x14",
      size: [29, 14],
      clip: "",
      cropped: { left: 0, top: 0, width: 29, height: 14 },
    },
    {
      name: "40x40",
      size: [40, 40],
      clip: "",
      cropped: { left: 0, top: 0, width: 40, height: 40 },
    },
    {
      name: "29x14",
      size: [29, 14],
      clip: "inset(2px)",
      cropped: { left: 2, top: 2, width: 25, height: 10 },
    },
    {
      name: "200x100",
      size: [200, 100],
      clip: "inset(10px)",
      cropped: { left: 10, top: 10, width: 180, height: 80 },
    },
  ])("no crop handle covers a corner of a $name box clipped '$clip'", (c) => {
    render(makeEl("a", c.clip), undefined, rectOf(c.size[0], c.size[1]));
    const found = handles();
    expect(found.length).toBeGreaterThan(0);
    for (const handle of found) {
      for (const corner of cornerSquares(c.cropped)) {
        expect(overlaps(handle.box, corner), `${handle.label} covers a corner`).toBe(false);
      }
    }
  });

  it("keeps every handle where the edges have room, and drops only those with none", () => {
    render(makeEl("a", "inset(10px)"), undefined, rectOf(200, 100));
    expect(handles().map((h) => h.label)).toEqual([
      "Reposition crop",
      "Crop top",
      "Crop right",
      "Crop bottom",
      "Crop left",
    ]);
    document.body.innerHTML = "";
    render(makeEl("b", ""), undefined, rectOf(29, 14));
    expect(handles().map((h) => h.label)).toEqual(["Crop top", "Crop bottom"]);
  });
});

describe("DomEditCropHandles preset bar", () => {
  const click = (label: string) => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent === label,
    );
    act(() => button?.click());
  };

  afterEach(() => useCropPresetBarStore.getState().close());

  it("shows only for the clip the menu opened it for", () => {
    const a = makeEl("a", "");
    useCropPresetBarStore.getState().open({ id: "other" });
    render(a);
    expect(document.querySelector("[data-dom-edit-crop-bar]")).toBeNull();
  });

  it("commits a centred 1:1 crop, then Reset removes the clip-path", async () => {
    const a = makeEl("a", "");
    const commits: string[] = [];
    useCropPresetBarStore.getState().open({ id: "a" });
    const { root } = render(a, (_property, value) => {
      commits.push(value);
    });
    click("1:1");
    await act(async () => {});
    expect(commits[0]).toBe("inset(0px 50px 0px 50px)");
    click("Reset");
    await act(async () => {});
    expect(commits[1]).toBe("");
    act(() => root.unmount());
    expect(a.style.getPropertyValue("clip-path")).toBe("");
  });

  it("Done closes the bar", () => {
    const a = makeEl("a", "");
    useCropPresetBarStore.getState().open({ id: "a" });
    render(a);
    click("Done");
    expect(useCropPresetBarStore.getState().openFor).toBeNull();
  });
});

vi.mock("../../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
import { trackStudioEvent } from "../../utils/studioTelemetry";
describe("crop usage", () => {
  it.each([true, false])(
    "counts a crop drag only after a changed writer result (%s)",
    async (changed) => {
      vi.mocked(trackStudioEvent).mockClear();
      const saved = vi.fn(async () => ({ ok: true, changed }));
      const { root } = render(makeEl("private-target", "inset(10px)"), saved);
      const handle = document.querySelector<HTMLElement>('[aria-label="Crop right"]')!;
      dragCropRight(handle, 1, [
        [200, 1],
        [180, 1],
        [160, 1],
      ]);
      await act(async () => {
        await Promise.resolve();
      });
      expect(saved).toHaveBeenCalledTimes(1);
      expect(vi.mocked(trackStudioEvent).mock.calls).toEqual(
        changed ? [["feature_used", { feature: "crop", surface: "preview", method: "drag" }]] : [],
      );
      act(() => root.unmount());
    },
  );
});
