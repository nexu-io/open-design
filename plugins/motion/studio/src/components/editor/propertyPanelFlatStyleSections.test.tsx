// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlatStyleSection } from "./propertyPanelFlatStyleSections";
import type { DomEditSelection } from "./domEditing";
import { buildDefaultGradientModel, serializeGradient } from "./gradientValue";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function makeElement(overrides: Partial<DomEditSelection> = {}): DomEditSelection {
  return {
    element: document.createElement("div"),
    id: "stat-card",
    selector: ".stat-card",
    label: "Stat Card",
    tagName: "div",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 24, y: 120, width: 420, height: 260 },
    textContent: "",
    dataAttributes: {},
    inlineStyles: { "background-color": "#0D0C09" },
    computedStyles: {},
    textFields: [],
    capabilities: {
      canSelect: true,
      canEditStyles: true,
      canCrop: true,
      canMove: true,
      canResize: true,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
    },
    ...overrides,
  } as DomEditSelection;
}

function renderSection(
  styles: Record<string, string> = {},
  overrides: Partial<DomEditSelection> = {},
  gsapBorderRadius: { tl: number; tr: number; br: number; bl: number } | null = null,
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const element = makeElement(overrides);
  const onSetStyle = vi.fn();
  const mergedStyles = { "background-color": "#0D0C09", "border-width": "0px", ...styles };
  act(() => {
    root.render(
      <FlatStyleSection
        projectId="proj-1"
        element={element}
        styles={mergedStyles}
        assets={[]}
        onSetStyle={onSetStyle}
        onSetHtmlAttribute={vi.fn()}
        gsapBorderRadius={gsapBorderRadius}
      />,
    );
  });
  return { host, root, onSetStyle };
}

function clickSegment(host: HTMLElement, label: string) {
  const segment = Array.from(host.querySelectorAll('[data-flat-segment="true"]')).find(
    (el) => el.textContent === label,
  );
  act(() => segment?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("FlatStyleSection — Fill", () => {
  it("renders the Fill segmented control defaulting to Solid, and a mint Color row when a color is set", () => {
    const { host, root } = renderSection();
    expect(host.textContent).toContain("Fill");
    expect(host.textContent).toContain("Solid");
    const swatch = host.querySelector('[data-flat-color-trigger="true"]');
    expect(swatch).not.toBeNull();
    act(() => root.unmount());
  });

  it("switches to the Gradient field when Gradient is selected", () => {
    const { host, root } = renderSection({
      "background-image": "linear-gradient(90deg, #000, #fff)",
    });
    const gradientSegment = Array.from(host.querySelectorAll('[data-flat-segment="true"]')).find(
      (el) => el.textContent === "Gradient",
    );
    expect(gradientSegment?.className).toContain("text-panel-text-0");
    act(() => root.unmount());
  });

  it("clicking Gradient commits a serialized default gradient built from the current fill color", () => {
    const { host, root, onSetStyle } = renderSection();
    clickSegment(host, "Gradient");
    const expectedGradient = serializeGradient(buildDefaultGradientModel("#0D0C09"));
    expect(onSetStyle).toHaveBeenCalledWith("background-image", expectedGradient);
    act(() => root.unmount());
  });

  it("clicking Solid clears the background-image back to none", () => {
    const { host, root, onSetStyle } = renderSection({
      "background-image": "linear-gradient(90deg, #000, #fff)",
    });
    clickSegment(host, "Solid");
    expect(onSetStyle).toHaveBeenCalledWith("background-image", "none");
    act(() => root.unmount());
  });

  it("clicking Image switches to the image-fill field without committing a style", () => {
    const { host, root, onSetStyle } = renderSection();
    clickSegment(host, "Image");
    expect(host.textContent).toContain("Upload image");
    expect(onSetStyle).not.toHaveBeenCalledWith("background-image", expect.anything());
    act(() => root.unmount());
  });
});

function getFlatRowInput(host: HTMLElement, label: string): HTMLInputElement {
  const rows = Array.from(host.querySelectorAll<HTMLElement>(".group"));
  const row = rows.find((el) => el.querySelector("span")?.textContent === label);
  const input = row?.querySelector<HTMLInputElement>("input");
  if (!input) throw new Error(`expected an input for row "${label}"`);
  return input;
}

async function commitFlatRowInput(host: HTMLElement, label: string, nextValue: string) {
  const input = getFlatRowInput(host, label);
  act(() => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(input, nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new Event("focusout", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

const STROKE_STYLES = {
  "border-width": "1px",
  "border-style": "solid",
  "border-color": "rgba(255,255,255,.12)",
};

function getMetricFieldInput(host: HTMLElement, label: string): HTMLInputElement {
  const spans = Array.from(host.querySelectorAll("span")).filter((el) => el.textContent === label);
  for (const span of spans) {
    const input = span.parentElement?.querySelector<HTMLInputElement>("input");
    if (input) return input;
  }
  throw new Error(`expected a metric field input for "${label}"`);
}

function setInputValue(input: HTMLInputElement, nextValue: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  nativeInputValueSetter?.call(input, nextValue);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("FlatStyleSection — Stroke and Radius", () => {
  it("renders a width-only Stroke width row — style is only ever set through the Stroke style select below it", () => {
    const { host, root } = renderSection(STROKE_STYLES);
    expect(host.textContent).toContain("Stroke width");
    expect(host.textContent).toContain("Stroke style");
    expect(getFlatRowInput(host, "Stroke width").value).toBe("1px");
    act(() => root.unmount());
  });

  it("commits a new stroke width without touching the existing style", async () => {
    const { host, root, onSetStyle } = renderSection(STROKE_STYLES);
    await commitFlatRowInput(host, "Stroke width", "2px");
    expect(onSetStyle).toHaveBeenCalledWith("border-width", "2px");
    expect(onSetStyle).not.toHaveBeenCalledWith("border-style", expect.anything());
    act(() => root.unmount());
  });

  it("defaults a from-zero width commit to solid, since a width with no style renders no visible border", async () => {
    const { host, root, onSetStyle } = renderSection({
      "border-width": "0px",
      "border-style": "none",
      "border-color": "rgba(255,255,255,.12)",
    });
    await commitFlatRowInput(host, "Stroke width", "3px");
    expect(onSetStyle).toHaveBeenCalledWith("border-style", "solid");
    act(() => root.unmount());
  });

  it("clamps an out-of-range stroke width commit to 200px (fix 2)", async () => {
    const { host, root, onSetStyle } = renderSection(STROKE_STYLES);
    await commitFlatRowInput(host, "Stroke width", "9999px");
    expect(onSetStyle).toHaveBeenCalledWith("border-width", "200px");
    act(() => root.unmount());
  });

  it("ignores an unparseable stroke width commit", async () => {
    const { host, root, onSetStyle } = renderSection(STROKE_STYLES);
    await commitFlatRowInput(host, "Stroke width", "bogus");
    expect(onSetStyle).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("commits a stroke style change through the discoverable Stroke style select (fix 2)", () => {
    const { host, root, onSetStyle } = renderSection(STROKE_STYLES);
    changeFlatSelectRow(host, "Stroke style", "dashed");
    expect(onSetStyle).toHaveBeenCalledWith("border-style", "dashed");
    act(() => root.unmount());
  });

  it("commits a new stroke color through the flat ColorField (fix 1)", () => {
    const { host, root, onSetStyle } = renderSection({
      "border-width": "1px",
      "border-style": "solid",
      "border-color": "rgb(10, 20, 30)",
    });
    const trigger = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[data-flat-color-trigger="true"]'),
    ).find((btn) => btn.getAttribute("aria-label") === "Pick stroke color color");
    if (!trigger) throw new Error("expected the stroke color trigger");
    act(() => trigger.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const hexInput = Array.from(document.querySelectorAll<HTMLInputElement>("input")).find(
      (input) => !host.contains(input),
    );
    if (!hexInput) throw new Error("expected the color picker's hex input");
    act(() => {
      setInputValue(hexInput, "#112233");
      hexInput.focus();
      hexInput.blur();
    });
    expect(onSetStyle).toHaveBeenCalledWith("border-color", "rgb(17, 34, 51)");
    act(() => root.unmount());
  });

  it("uses BorderRadiusEditor for radius, linked by default, even when corners are uniform (fix 3)", () => {
    const { host, root } = renderSection({ "border-radius": "12px" });
    const unlinkButton = host.querySelector<HTMLButtonElement>('button[title="Unlink corners"]');
    expect(unlinkButton).not.toBeNull();
    expect(getMetricFieldInput(host, "All").value).toBe("12");
    act(() => root.unmount());
  });

  it("commits a uniform radius value through BorderRadiusEditor's linked All field", () => {
    const { host, root, onSetStyle } = renderSection({ "border-radius": "12px" });
    const allInput = getMetricFieldInput(host, "All");
    act(() => setInputValue(allInput, "20"));
    act(() => allInput.dispatchEvent(new Event("focusout", { bubbles: true })));
    expect(onSetStyle).toHaveBeenCalledWith("border-radius", "20px");
    act(() => root.unmount());
  });

  it("commits a single-corner radius update after unlinking a uniform radius (fix 3)", () => {
    const { host, root, onSetStyle } = renderSection({ "border-radius": "12px" });
    const unlinkButton = host.querySelector<HTMLButtonElement>('button[title="Unlink corners"]');
    if (!unlinkButton) throw new Error("expected the unlink toggle button");
    act(() => unlinkButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const trInput = getMetricFieldInput(host, "TR");
    act(() => setInputValue(trInput, "18"));
    act(() => trInput.dispatchEvent(new Event("focusout", { bubbles: true })));
    expect(onSetStyle).toHaveBeenCalledWith("border-top-right-radius", "18px");
    expect(onSetStyle).not.toHaveBeenCalledWith("border-radius", expect.anything());
    act(() => root.unmount());
  });

  it("falls back to the legacy BorderRadiusEditor when corners are not uniform", () => {
    const { host, root } = renderSection({}, {}, { tl: 4, tr: 12, br: 4, bl: 4 });
    expect(host.textContent).not.toContain("Linked");
    act(() => root.unmount());
  });

  it("commits a per-corner radius update through the legacy BorderRadiusEditor when unlinked", () => {
    const { host, root, onSetStyle } = renderSection({}, {}, { tl: 4, tr: 12, br: 4, bl: 4 });
    const trInput = Array.from(host.querySelectorAll<HTMLInputElement>("input")).find(
      (el) => el.value === "12",
    );
    if (!trInput) throw new Error("expected the TR corner input");
    act(() => setInputValue(trInput, "18"));
    act(() => {
      trInput.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    expect(onSetStyle).toHaveBeenCalledWith("border-top-right-radius", "18px");
    act(() => root.unmount());
  });
});

function getFlatSelectRow(host: HTMLElement, label: string) {
  const rows = Array.from(host.querySelectorAll<HTMLElement>(".group"));
  const row = rows.find((el) => el.querySelector("span")?.textContent === label);
  if (!row) throw new Error(`expected a select row for "${label}"`);
  const select = row.querySelector<HTMLSelectElement>("select");
  if (!select) throw new Error(`expected a select for "${label}"`);
  const resetButton = row.querySelector<HTMLButtonElement>('[data-flat-select-reset="true"]');
  return { row, select, resetButton };
}

function changeFlatSelectRow(host: HTMLElement, label: string, nextValue: string) {
  const { select } = getFlatSelectRow(host, label);
  act(() => {
    select.value = nextValue;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("FlatStyleSection — Shadow and Blend", () => {
  it("renders Shadow with the inferred preset and a reset when set, Blend with a plain select", () => {
    const { host, root } = renderSection({ "box-shadow": "0 8px 24px rgba(0,0,0,.35)" });
    expect(host.textContent).toContain("Shadow");
    expect(host.textContent).toContain("Blend");
    const selects = host.querySelectorAll("select");
    expect(selects.length).toBeGreaterThanOrEqual(2);
    act(() => root.unmount());
  });

  it("commits a shadow preset change through onSetStyle", () => {
    const { host, root, onSetStyle } = renderSection({});
    changeFlatSelectRow(host, "Shadow", "soft");
    expect(onSetStyle).toHaveBeenCalledWith("box-shadow", expect.any(String));
    act(() => root.unmount());
  });

  it("commits a blend mode change through onSetStyle", () => {
    const { host, root, onSetStyle } = renderSection({});
    changeFlatSelectRow(host, "Blend", "multiply");
    expect(onSetStyle).toHaveBeenCalledWith("mix-blend-mode", "multiply");
    act(() => root.unmount());
  });

  it("resets the shadow preset back to none via the reset button", () => {
    const { host, root, onSetStyle } = renderSection({
      "box-shadow": "0 12px 36px rgba(0, 0, 0, 0.28)",
    });
    const { resetButton } = getFlatSelectRow(host, "Shadow");
    if (!resetButton) throw new Error("expected the shadow reset button");
    act(() => resetButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSetStyle).toHaveBeenCalledWith("box-shadow", "none");
    act(() => root.unmount());
  });

  it("resets the blend mode back to normal via the reset button", () => {
    const { host, root, onSetStyle } = renderSection({ "mix-blend-mode": "multiply" });
    const { resetButton } = getFlatSelectRow(host, "Blend");
    if (!resetButton) throw new Error("expected the blend reset button");
    act(() => resetButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSetStyle).toHaveBeenCalledWith("mix-blend-mode", "normal");
    act(() => root.unmount());
  });
});

describe("FlatStyleSection — blur sliders", () => {
  it("renders Layer blur and Backdrop sliders and commits through onSetStyle", () => {
    const onSetStyle = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <FlatStyleSection
          projectId="proj-1"
          element={makeElement()}
          styles={{ filter: "blur(4px)" }}
          assets={[]}
          onSetStyle={onSetStyle}
          onSetHtmlAttribute={vi.fn()}
          gsapBorderRadius={null}
        />,
      );
    });
    expect(host.textContent).toContain("Layer blur");
    expect(host.textContent).toContain("Backdrop");
    expect(host.textContent).toContain("4px");
    const track = host.querySelectorAll('[data-flat-slider-track="true"]')[0];
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 2, right: 100, bottom: 2 }),
    });
    act(() => {
      track.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 50 }));
      track.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 50 }));
    });
    // filterBlurValue=4 -> max=Math.max(40, 4)=40; clientX=50 of width 100 -> ratio 0.5 -> 20px.
    expect(onSetStyle).toHaveBeenCalledWith("filter", "blur(20px)");
    act(() => root.unmount());
  });

  it("renders the Backdrop slider from backdrop-filter and commits a new blur value on track click", () => {
    const { host, root, onSetStyle } = renderSection({ "backdrop-filter": "blur(6px)" });
    expect(host.textContent).toContain("Backdrop");
    expect(host.textContent).toContain("6px");
    const tracks = host.querySelectorAll('[data-flat-slider-track="true"]');
    // Track order is Layer blur, Backdrop, Opacity — Backdrop is the second track.
    const backdropTrack = tracks[1];
    Object.defineProperty(backdropTrack, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 2, right: 100, bottom: 2 }),
    });
    act(() => {
      backdropTrack.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 50 }));
      backdropTrack.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 50 }));
    });
    // backdropBlurValue=6 -> max=Math.max(60, 6)=60; clientX=50 of width 100 -> ratio 0.5 -> 30px.
    expect(onSetStyle).toHaveBeenCalledWith("backdrop-filter", "blur(30px)");
    act(() => root.unmount());
  });

  it("does not render a fill/knob highlight for a zero-value blur (default tier)", () => {
    const { host, root } = renderSection({});
    const tracks = host.querySelectorAll('[data-flat-slider-track="true"]');
    // Only the first two tracks are the blur sliders (Layer blur, Backdrop); Opacity
    // (the third track) always renders a fill by design, so it's excluded here.
    const blurTracks = Array.from(tracks).slice(0, 2);
    for (const track of blurTracks) {
      expect(track.querySelectorAll('[data-flat-slider-fill="true"]')).toHaveLength(0);
    }
    act(() => root.unmount());
  });
});

function getInsetSideInputOrNull(host: HTMLElement, label: "T" | "R" | "B" | "L") {
  const span = Array.from(host.querySelectorAll("span")).find((el) => el.textContent === label);
  return span?.parentElement?.querySelector<HTMLInputElement>("input") ?? null;
}

function getInsetSideInput(host: HTMLElement, label: "T" | "R" | "B" | "L"): HTMLInputElement {
  const input = getInsetSideInputOrNull(host, label);
  if (!input) throw new Error(`expected an inset side input for "${label}"`);
  return input;
}

async function commitInsetSideInput(
  host: HTMLElement,
  label: "T" | "R" | "B" | "L",
  nextValue: string,
) {
  const input = getInsetSideInput(host, label);
  act(() => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(input, nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(new Event("focusout", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("FlatStyleSection — Overflow and Mask", () => {
  it("renders Overflow and Mask selects, and inset-side rows when the mask is an inset", () => {
    const { host, root } = renderSection({
      overflow: "hidden",
      "clip-path": "inset(8px round 4px)",
    });
    expect(host.textContent).toContain("Overflow");
    expect(host.textContent).toContain("Mask");
    expect(host.textContent).toContain("hidden");
    act(() => root.unmount());
  });

  it("commits an overflow change through onSetStyle", () => {
    const onSetStyle = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <FlatStyleSection
          projectId="proj-1"
          element={makeElement()}
          styles={{}}
          assets={[]}
          onSetStyle={onSetStyle}
          onSetHtmlAttribute={vi.fn()}
          gsapBorderRadius={null}
        />,
      );
    });
    const overflowSelect = Array.from(host.querySelectorAll("select")).find((s) =>
      Array.from(s.options).some((o) => o.value === "scroll"),
    );
    if (!overflowSelect) throw new Error("expected the overflow select");
    act(() => {
      overflowSelect.value = "hidden";
      overflowSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onSetStyle).toHaveBeenCalledWith("overflow", "hidden");
    act(() => root.unmount());
  });

  it("resets overflow back to visible via the reset button", () => {
    const { host, root, onSetStyle } = renderSection({ overflow: "scroll" });
    const { resetButton } = getFlatSelectRow(host, "Overflow");
    if (!resetButton) throw new Error("expected the overflow reset button");
    act(() => resetButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSetStyle).toHaveBeenCalledWith("overflow", "visible");
    act(() => root.unmount());
  });

  it("commits a mask preset change through onSetStyle, building an inset() clip-path", () => {
    const { host, root, onSetStyle } = renderSection({});
    changeFlatSelectRow(host, "Mask", "inset");
    expect(onSetStyle).toHaveBeenCalledWith("clip-path", "inset(0 round 0px)");
    act(() => root.unmount());
  });

  it("resets the mask back to none via the reset button", () => {
    const { host, root, onSetStyle } = renderSection({ "clip-path": "circle(50% at 50% 50%)" });
    const { resetButton } = getFlatSelectRow(host, "Mask");
    if (!resetButton) throw new Error("expected the mask reset button");
    act(() => resetButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSetStyle).toHaveBeenCalledWith("clip-path", "none");
    act(() => root.unmount());
  });

  it("does not render inset-side rows when the mask is not an inset", () => {
    const { host, root } = renderSection({ "clip-path": "circle(50% at 50% 50%)" });
    expect(getInsetSideInputOrNull(host, "T")).toBeNull();
    act(() => root.unmount());
  });

  it("commits a T inset-side edit through onSetStyle, preserving the other sides and radius", async () => {
    const { host, root, onSetStyle } = renderSection({ "clip-path": "inset(8px round 4px)" });
    await commitInsetSideInput(host, "T", "10");
    expect(onSetStyle).toHaveBeenCalledWith("clip-path", "inset(10px 8px 8px 8px round 4px)");
    act(() => root.unmount());
  });

  it("commits an L inset-side edit through onSetStyle", async () => {
    const { host, root, onSetStyle } = renderSection({ "clip-path": "inset(8px round 4px)" });
    await commitInsetSideInput(host, "L", "2");
    expect(onSetStyle).toHaveBeenCalledWith("clip-path", "inset(8px 8px 8px 2px round 4px)");
    act(() => root.unmount());
  });

  it("commits an R inset-side edit through onSetStyle", async () => {
    const { host, root, onSetStyle } = renderSection({ "clip-path": "inset(8px round 4px)" });
    await commitInsetSideInput(host, "R", "3");
    expect(onSetStyle).toHaveBeenCalledWith("clip-path", "inset(8px 3px 8px 8px round 4px)");
    act(() => root.unmount());
  });

  it("commits a B inset-side edit through onSetStyle", async () => {
    const { host, root, onSetStyle } = renderSection({ "clip-path": "inset(8px round 4px)" });
    await commitInsetSideInput(host, "B", "5");
    expect(onSetStyle).toHaveBeenCalledWith("clip-path", "inset(8px 8px 5px 8px round 4px)");
    act(() => root.unmount());
  });

  it("renders a uniform Mask inset slider and commits clip-path via buildInsetClipPathValue (fix 4)", () => {
    const { host, root, onSetStyle } = renderSection({ "clip-path": "inset(8px round 4px)" });
    expect(host.textContent).toContain("Mask inset");
    const tracks = host.querySelectorAll('[data-flat-slider-track="true"]');
    // Track order: Layer blur, Backdrop, Mask inset, Opacity.
    const maskInsetTrack = tracks[2];
    Object.defineProperty(maskInsetTrack, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 2, right: 100, bottom: 2 }),
    });
    act(() => {
      maskInsetTrack.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 50 }));
      maskInsetTrack.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 50 }));
    });
    // clipInsetValue=8 -> max=Math.max(120, 8)=120; clientX=50 of width 100 -> ratio 0.5 -> 60px.
    // border-radius is unset here, so the clip-path's own `round 4px` is not reused — radiusValue
    // (read from the `border-radius` style, matching legacy) is 0.
    expect(onSetStyle).toHaveBeenCalledWith("clip-path", "inset(60px round 0px)");
    act(() => root.unmount());
  });
});

describe("FlatStyleSection — Opacity", () => {
  it("renders the Opacity slider at 100% by default and commits a change through onSetStyle", () => {
    const onSetStyle = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <FlatStyleSection
          projectId="proj-1"
          element={makeElement()}
          styles={{}}
          assets={[]}
          onSetStyle={onSetStyle}
          onSetHtmlAttribute={vi.fn()}
          gsapBorderRadius={null}
        />,
      );
    });
    expect(host.textContent).toContain("Opacity");
    expect(host.textContent).toContain("100%");
    const tracks = host.querySelectorAll('[data-flat-slider-track="true"]');
    const opacityTrack = tracks[tracks.length - 1];
    Object.defineProperty(opacityTrack, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 2, right: 100, bottom: 2 }),
    });
    act(() => {
      opacityTrack.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 50 }));
      opacityTrack.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 50 }));
    });
    expect(onSetStyle).toHaveBeenCalledWith("opacity", "0.5");
    act(() => root.unmount());
  });
});
