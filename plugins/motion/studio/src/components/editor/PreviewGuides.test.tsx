// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewGuides } from "./PreviewGuides";
import { PreviewOverlayProvider } from "./PreviewOverlayProvider";
import { usePreviewGuidesStore } from "./previewGuidesStore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const compRect = vi.hoisted(() => ({
  current: { left: 20, top: 20, width: 400, height: 225, scaleX: 1, scaleY: 1 },
}));
vi.mock("./useDomEditCompositionRect", () => ({
  useDomEditCompositionRect: () => compRect.current,
}));

afterEach(() => {
  compRect.current = { left: 20, top: 20, width: 400, height: 225, scaleX: 1, scaleY: 1 };
  document.body.innerHTML = "";
  window.localStorage.clear();
});

function render(rulerVisible: boolean, safeMarginsVisible: boolean) {
  usePreviewGuidesStore.setState({ rulerVisible, safeMarginsVisible });
  const host = document.createElement("div");
  document.body.append(host);
  act(() => {
    createRoot(host).render(
      <PreviewOverlayProvider>
        <PreviewGuides />
      </PreviewOverlayProvider>,
    );
  });
  return host;
}

describe("PreviewGuides", () => {
  it("draws nothing when both toggles are off", () => {
    const host = render(false, false);
    expect(host.querySelector("[data-testid]")).toBeNull();
  });

  it("draws the ruler with ticks 0 to 100 every 10 on both edges", () => {
    const host = render(true, false);
    const top = host.querySelector('[data-testid="preview-ruler-top"]');
    expect(Array.from(top?.children ?? []).map((t) => t.textContent)).toEqual(
      Array.from({ length: 11 }, (_, i) => String(i * 10)),
    );
    expect(host.querySelector('[data-testid="preview-ruler-left"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="preview-safe-90"]')).toBeNull();
    expect(host.querySelector('[data-testid="preview-safe-80"]')).toBeNull();
  });

  it("draws the 90% and 80% boxes with edge-midpoint ticks and no labels or caption band", () => {
    const host = render(false, true);
    const box = (pct: number) =>
      host.querySelector<HTMLElement>(`[data-testid="preview-safe-${pct}"]`);
    expect([box(90)?.style.left, box(90)?.style.bottom]).toEqual(["5%", "5%"]);
    expect([box(80)?.style.top, box(80)?.style.right]).toEqual(["10%", "10%"]);
    expect(box(90)?.children.length).toBe(4);
    expect(box(80)?.children.length).toBe(4);
    expect(host.textContent).toBe("");
    expect(host.querySelector('[data-testid="preview-ruler-top"]')).toBeNull();
  });

  it("places the ruler in the gutter outside the frame", () => {
    const host = render(true, false);
    const top = host.querySelector<HTMLElement>('[data-testid="preview-ruler-top"]');
    const left = host.querySelector<HTMLElement>('[data-testid="preview-ruler-left"]');
    expect([top?.style.left, top?.style.top, top?.style.width]).toEqual(["20px", "4px", "400px"]);
    expect([left?.style.left, left?.style.top, left?.style.height]).toEqual([
      "4px",
      "20px",
      "225px",
    ]);
  });

  it("draws nothing until the composition has a size", () => {
    compRect.current = { left: 0, top: 0, width: 0, height: 0, scaleX: 1, scaleY: 1 };
    const host = render(true, true);
    expect(host.querySelector("[data-testid]")).toBeNull();
  });

  it("draws the same boxes on a portrait composition", () => {
    compRect.current = { left: 20, top: 20, width: 225, height: 400, scaleX: 1, scaleY: 1 };
    const host = render(false, true);
    const box = host.querySelector<HTMLElement>('[data-testid="preview-safe-90"]');
    expect([box?.style.left, box?.style.top]).toEqual(["5%", "5%"]);
    expect(host.querySelector('[data-testid="preview-safe-80"]')).not.toBeNull();
  });
});
