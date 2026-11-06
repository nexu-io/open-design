// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositionsTab } from "./sidebar/CompositionsTab";
import { TimelineToolbar } from "./TimelineToolbar";

vi.mock("../contexts/StudioContext", () => ({
  useStudioShellContextOptional: () => ({
    editHistory: { canUndo: false, canRedo: false },
    handleUndo: vi.fn(),
    handleRedo: vi.fn(),
  }),
}));

// WCAG 2.2 (2.5.8) requires a 24x24 CSS pixel pointer target. happy-dom has no
// CSS engine, so getBoundingClientRect() is 0x0 for everything here and the size
// itself cannot be measured — these assert the utility classes that PRODUCE the
// size instead, which is enough to fail if someone drops them. Real geometry
// still needs a browser check.

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(
  window as unknown as { happyDOM: { settings: { disableIframePageLoading: boolean } } }
).happyDOM.settings.disableIframePageLoading = true;

let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

function mount(element: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
  return host;
}

describe("pointer target sizing classes (proxy for WCAG 2.5.8, not a geometry check)", () => {
  it("gives the timeline zoom slider a 24px box without changing its 2px track or 10px thumb", () => {
    const host = mount(<TimelineToolbar />);
    const slider = host.querySelector<HTMLInputElement>('input[aria-label="Timeline zoom"]');
    if (!slider) throw new Error("zoom slider did not render");

    expect(slider.className).toContain("h-6");
    expect(slider.className).toContain("[&::-webkit-slider-runnable-track]:h-[2px]");
    expect(slider.className).toContain("[&::-webkit-slider-thumb]:h-[10px]");
    expect(slider.className).toContain("[&::-webkit-slider-thumb]:w-[10px]");
  });

  it("gives the composition card's render button a 24x24 box around its 14px glyph", () => {
    const host = mount(
      <CompositionsTab
        projectId="demo"
        compositions={["compositions/headline.html"]}
        activeComposition={null}
        onSelect={vi.fn()}
        onRenderComposition={vi.fn()}
      />,
    );
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Render headline"]');
    if (!button) throw new Error("render button did not render");

    expect(button.className).toContain("h-6");
    expect(button.className).toContain("w-6");
    expect(button.querySelector("svg")?.getAttribute("width")).toBe("14");
  });
});
