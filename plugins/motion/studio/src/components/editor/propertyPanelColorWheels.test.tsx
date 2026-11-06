// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NormalizedHfColorGradingWheels } from "@hyperframes/core/color-grading";
import { ColorWheels } from "./propertyPanelColorWheels";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NEUTRAL: NormalizedHfColorGradingWheels = {
  shadows: { hue: 0, amount: 0, level: 0 },
  midtones: { hue: 0, amount: 0, level: 0 },
  highlights: { hue: 0, amount: 0, level: 0 },
};

afterEach(() => {
  document.body.innerHTML = "";
});

function renderWheels() {
  const onPreview = vi.fn();
  const onCommit = vi.fn();
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() => root.render(<ColorWheels value={NEUTRAL} onPreview={onPreview} onCommit={onCommit} />));
  const surface = host.querySelector<HTMLDivElement>(
    '[data-color-wheel="shadows"] [data-color-wheel-surface="true"]',
  );
  if (!surface) throw new Error("Expected the shadows wheel");
  Object.defineProperty(surface, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
  });
  return { root, surface, onPreview, onCommit };
}

function pointerAt(surface: HTMLElement, x: number, y: number, pointerId = 1) {
  act(() => {
    surface.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId,
        clientX: x,
        clientY: y,
      }),
    );
    surface.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId,
        clientX: x,
        clientY: y,
      }),
    );
  });
}

describe("ColorWheels", () => {
  it("maps cardinal pointer colors to the documented counter-clockwise hue angles", () => {
    const cases = [
      [100, 50, 0],
      [50, 0, 90],
      [0, 50, 180],
      [50, 100, 270],
    ] as const;

    for (const [x, y, expectedHue] of cases) {
      const { root, surface, onCommit } = renderWheels();
      pointerAt(surface, x, y);
      expect(onCommit.mock.calls[0]?.[0]?.shadows).toMatchObject({
        hue: expectedHue,
        amount: 1,
      });
      act(() => root.unmount());
    }
  });

  it("renders a color sequence that follows the same hue direction as the pointer", () => {
    const { root, surface } = renderWheels();
    expect(surface.style.background).toContain("#f33, #f3f, #33f, #3ff, #3f3, #ff3, #f33");
    act(() => root.unmount());
  });

  it("previews during drag and commits only once on release", () => {
    const { root, surface, onPreview, onCommit } = renderWheels();
    act(() => {
      surface.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 7,
          clientX: 100,
          clientY: 50,
        }),
      );
      surface.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 7,
          clientX: 50,
          clientY: 0,
        }),
      );
    });
    expect(onPreview.mock.calls.at(-1)?.[0]?.shadows.hue).toBe(90);
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      surface.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 7,
          clientX: 50,
          clientY: 0,
        }),
      );
    });
    expect(onCommit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});
