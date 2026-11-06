// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ColorCurveValues } from "./propertyPanelColorCurves";
import { ColorCurves } from "./propertyPanelColorCurves";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IDENTITY: ColorCurveValues = {
  curves: {
    master: [
      [0, 0],
      [1, 1],
    ],
    red: [
      [0, 0],
      [1, 1],
    ],
    green: [
      [0, 0],
      [1, 1],
    ],
    blue: [
      [0, 0],
      [1, 1],
    ],
  },
  hueCurves: { hueVsHue: [], hueVsSaturation: [], hueVsLuma: [] },
};

afterEach(() => {
  document.body.innerHTML = "";
});

function renderCurves(value = IDENTITY) {
  const onPreview = vi.fn();
  const onCommit = vi.fn();
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() => root.render(<ColorCurves value={value} onPreview={onPreview} onCommit={onCommit} />));
  return { host, root, onPreview, onCommit };
}

function activate(host: HTMLElement, key: string) {
  act(() => {
    host
      .querySelector<HTMLButtonElement>(`[data-color-curve-tab="${key}"]`)
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const graph = host.querySelector<SVGSVGElement>(`[data-color-curve-graph="${key}"]`);
  if (!graph) throw new Error(`Expected ${key} graph`);
  Object.defineProperty(graph, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 160, height: 160, right: 160, bottom: 160 }),
  });
  return graph;
}

describe("ColorCurves", () => {
  it("renders the four RGB and three hue-selective curve tabs", () => {
    const { host, root } = renderCurves();
    expect(host.querySelectorAll("[data-color-curve-tab]")).toHaveLength(7);
    expect(host.querySelector('[data-color-curve-graph="master"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it("treats points across the red seam as neighbors instead of adding a duplicate", () => {
    const value: ColorCurveValues = {
      ...IDENTITY,
      hueCurves: {
        ...IDENTITY.hueCurves,
        hueVsSaturation: [
          [120, 0],
          [240, 0],
          [359, 0.2],
        ],
      },
    };
    const { host, root, onCommit } = renderCurves(value);
    const graph = activate(host, "hueVsSaturation");

    act(() => {
      graph.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 5,
          clientX: 8,
          clientY: 66,
        }),
      );
      graph.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 5,
          clientX: 8,
          clientY: 66,
        }),
      );
    });

    const points = onCommit.mock.calls[0]?.[0]?.hueCurves.hueVsSaturation;
    expect(points).toHaveLength(3);
    expect(points.some(([hue]: readonly [number, number]) => hue < 1)).toBe(true);
    act(() => root.unmount());
  });

  it("previews pointer edits and commits once on release", () => {
    const { host, root, onPreview, onCommit } = renderCurves();
    const graph = activate(host, "master");
    act(() => {
      graph.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 2,
          clientX: 80,
          clientY: 120,
        }),
      );
      graph.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 2,
          clientX: 80,
          clientY: 120,
        }),
      );
    });
    expect(onPreview.mock.calls[0]?.[0]?.curves.master).toHaveLength(3);
    expect(onPreview.mock.calls.at(-1)?.[0]).toBe(IDENTITY);
    expect(onCommit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("does not restore a deleted point when an overlapping key gesture settles", () => {
    const { host, root, onCommit } = renderCurves();
    const graph = activate(host, "master");
    act(() => {
      graph.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onCommit.mock.calls.at(-1)?.[0]?.curves.master).toHaveLength(3);
    onCommit.mockClear();

    act(() => {
      graph.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    act(() => {
      graph.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });
    act(() => {
      graph.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", bubbles: true }));
    });

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit.mock.calls[0]?.[0]?.curves.master).toHaveLength(2);
    act(() => root.unmount());
  });
});
