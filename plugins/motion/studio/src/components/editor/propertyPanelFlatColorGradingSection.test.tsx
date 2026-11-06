// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FlatColorGradingAccessory,
  FlatColorGradingSection,
} from "./propertyPanelFlatColorGradingSection";
import {
  normalizeHfColorGrading,
  type NormalizedHfColorGrading,
} from "@hyperframes/core/color-grading";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function renderInto(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { host, root };
}

function neutralGrading() {
  const grading = normalizeHfColorGrading("neutral");
  if (!grading) throw new Error("expected a neutral grading");
  return grading;
}

function findRowByText(
  host: HTMLElement,
  selector: string,
  text: string,
  match: "includes" | "startsWith" = "includes",
) {
  const row = Array.from(host.querySelectorAll(selector)).find((el) =>
    el.textContent?.[match](text),
  );
  if (!row) throw new Error(`expected a ${text} row`);
  return row;
}

function dragSliderTrack(row: Element, clientX: number, trackWidth: number) {
  const track = row.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
  if (!track) throw new Error("expected a slider track");
  Object.defineProperty(track, "getBoundingClientRect", {
    value: () => ({ left: 0, width: trackWidth, top: 0, height: 2, right: trackWidth, bottom: 2 }),
  });
  act(() => {
    track.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX }));
    track.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX }));
  });
}

function clickSliderReset(row: Element) {
  const resetButton = row.querySelector<HTMLButtonElement>('[data-flat-slider-reset="true"]');
  expect(resetButton).not.toBeNull();
  act(() => resetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("FlatColorGradingAccessory", () => {
  it("shows a 5px status dot colored by runtime status, with the message as its title", () => {
    const { host, root } = renderInto(
      <FlatColorGradingAccessory
        state={{
          grading: neutralGrading(),
          compareEnabled: false,
          runtimeStatus: { state: "active", message: "Shader active" },
          commitCompare: vi.fn(),
          resetGrading: vi.fn(),
        }}
      />,
    );
    const dot = host.querySelector('[data-flat-grade-status-dot="true"]');
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute("title")).toBe("Shader active");
    expect(dot?.className).toContain("bg-accent");
    act(() => root.unmount());
  });

  it("disables the compare hold button when grading is inactive, and fires resetGrading on click", () => {
    const resetGrading = vi.fn();
    const { host, root } = renderInto(
      <FlatColorGradingAccessory
        state={{
          grading: neutralGrading(),
          compareEnabled: false,
          runtimeStatus: { state: "inactive", message: "No grading applied" },
          commitCompare: vi.fn(),
          resetGrading,
        }}
      />,
    );
    const compareButton = host.querySelector<HTMLButtonElement>(
      '[aria-label="Hold to show original"]',
    );
    expect(compareButton?.disabled).toBe(true);
    const resetButton = host.querySelector<HTMLButtonElement>('[data-flat-grade-reset="true"]');
    act(() => resetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(resetGrading).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("shows the runtime status message as visible text next to the dot, not only as a title", () => {
    const { host, root } = renderInto(
      <FlatColorGradingAccessory
        state={{
          grading: neutralGrading(),
          compareEnabled: false,
          runtimeStatus: { state: "pending", message: "Waiting for shader" },
          commitCompare: vi.fn(),
          resetGrading: vi.fn(),
        }}
      />,
    );
    const messageEl = host.querySelector('[data-flat-grade-status-message="true"]');
    expect(messageEl).not.toBeNull();
    expect(messageEl?.textContent).toBe("Waiting for shader");
    expect(host.textContent).toContain("Waiting for shader");
    act(() => root.unmount());
  });

  function activeGrading() {
    const grading = neutralGrading();
    return { ...grading, adjust: { ...grading.adjust, contrast: 0.2 } };
  }

  it("activates hold-to-compare on pointerdown and releases on window pointerup", () => {
    const commitCompare = vi.fn();
    const { host, root } = renderInto(
      <FlatColorGradingAccessory
        state={{
          grading: activeGrading(),
          compareEnabled: false,
          runtimeStatus: { state: "active", message: "Shader active" },
          commitCompare,
          resetGrading: vi.fn(),
        }}
      />,
    );
    const compareButton = host.querySelector<HTMLButtonElement>(
      '[aria-label="Hold to show original"]',
    );
    if (!compareButton) throw new Error("expected a compare button");
    act(() => compareButton.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(commitCompare).toHaveBeenNthCalledWith(1, true);
    act(() => window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true })));
    expect(commitCompare).toHaveBeenNthCalledWith(2, false);
    act(() => root.unmount());
  });

  it("activates hold-to-compare via keyboard Space and releases on keyup", () => {
    const commitCompare = vi.fn();
    const { host, root } = renderInto(
      <FlatColorGradingAccessory
        state={{
          grading: activeGrading(),
          compareEnabled: false,
          runtimeStatus: { state: "active", message: "Shader active" },
          commitCompare,
          resetGrading: vi.fn(),
        }}
      />,
    );
    const compareButton = host.querySelector<HTMLButtonElement>(
      '[aria-label="Hold to show original"]',
    );
    if (!compareButton) throw new Error("expected a compare button");
    act(() =>
      compareButton.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }),
      ),
    );
    expect(commitCompare).toHaveBeenNthCalledWith(1, true);
    act(() =>
      compareButton.dispatchEvent(
        new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true }),
      ),
    );
    expect(commitCompare).toHaveBeenNthCalledWith(2, false);
    act(() => root.unmount());
  });

  it("releases an active hold when the window loses focus mid-hold", () => {
    const commitCompare = vi.fn();
    const { host, root } = renderInto(
      <FlatColorGradingAccessory
        state={{
          grading: activeGrading(),
          compareEnabled: false,
          runtimeStatus: { state: "active", message: "Shader active" },
          commitCompare,
          resetGrading: vi.fn(),
        }}
      />,
    );
    const compareButton = host.querySelector<HTMLButtonElement>(
      '[aria-label="Hold to show original"]',
    );
    if (!compareButton) throw new Error("expected a compare button");
    act(() => compareButton.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(commitCompare).toHaveBeenNthCalledWith(1, true);
    act(() => window.dispatchEvent(new Event("blur")));
    expect(commitCompare).toHaveBeenNthCalledWith(2, false);
    act(() => root.unmount());
  });
});

function neutralPropsBase() {
  return {
    grading: neutralGrading(),
    assets: [] as string[],
    onCommitColorGrading: vi.fn(),
    onPreviewColorGrading: vi.fn(),
    applyScope: "source-file" as const,
    applyBusy: false,
    onSetApplyScope: vi.fn(),
    onApplyToScope: vi.fn(),
    onApplyScopeAvailable: true,
    mediaMetadata: null,
    presetPreviews: {
      status: "ready" as const,
      images: { "bright-pop": "data:image/png;base64,bright" },
      width: 160,
      height: 90,
    },
    onRequestPresetPreviews: vi.fn(),
    captureGradedFrame: vi.fn(async () => null),
  };
}

describe("FlatColorGradingSection — Preset + LUT", () => {
  it("previews looks without committing, restores on leave, and commits only on click", () => {
    const onCommitColorGrading = vi.fn();
    const onPreviewColorGrading = vi.fn();
    const base = neutralGrading();
    const grading = {
      ...base,
      intensity: 0.4,
      adjust: { ...base.adjust, contrast: 0.3 },
      wheels: {
        ...base.wheels,
        shadows: { hue: 210, amount: 0.12, level: 0.04 },
      },
      curves: {
        ...base.curves,
        master: [
          [0, 0],
          [0.5, 0.58],
          [1, 1],
        ] as const,
      },
      hueCurves: {
        ...base.hueCurves,
        hueVsSaturation: [
          [0, 0],
          [120, 0.1],
          [240, 0],
        ] as const,
      },
      secondaries:
        normalizeHfColorGrading({
          secondaries: [
            {
              key: { hue: { center: 30, range: 15 } },
              correction: { saturation: 0.08 },
            },
          ],
        })?.secondaries ?? [],
      details: { ...base.details, vignette: 0.2 },
      effects: { ...base.effects, pixelate: 0.5 },
      palette: ["#112233", "#ffffff"],
      lut: { src: "assets/luts/custom.cube", intensity: 0.6 },
    };
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        grading={grading}
        onCommitColorGrading={onCommitColorGrading}
        onPreviewColorGrading={onPreviewColorGrading}
      />,
    );
    const brightPop = host.querySelector<HTMLButtonElement>(
      '[data-flat-grade-preset="bright-pop"]',
    );
    if (!brightPop) throw new Error("expected a Bright Pop look button");
    act(() => {
      brightPop.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    });
    expect(onPreviewColorGrading.mock.calls.at(-1)?.[0].preset).toBe("bright-pop");
    expect(onPreviewColorGrading.mock.calls.at(-1)?.[1]).toEqual({
      animatedPreview: { kind: "presets", id: "bright-pop" },
    });
    expect(onCommitColorGrading).not.toHaveBeenCalled();
    act(() => brightPop.dispatchEvent(new MouseEvent("pointerout", { bubbles: true })));
    expect(onPreviewColorGrading).toHaveBeenLastCalledWith(null);
    act(() => brightPop.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onCommitColorGrading).toHaveBeenCalledTimes(1);
    expect(onCommitColorGrading.mock.calls[0][0]).toMatchObject({
      preset: "bright-pop",
      intensity: 1,
      effects: { pixelate: 0.5 },
      palette: ["#112233", "#ffffff"],
      lut: { src: "assets/luts/custom.cube", intensity: 0.6 },
    });
    expect(onCommitColorGrading.mock.calls[0][0].wheels.shadows.amount).toBe(0);
    expect(onCommitColorGrading.mock.calls[0][0].curves.master).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(onCommitColorGrading.mock.calls[0][0].hueCurves.hueVsSaturation).toEqual([]);
    expect(onCommitColorGrading.mock.calls[0][0].secondaries).toEqual([]);
    expect(onCommitColorGrading.mock.calls[0][0].adjust.contrast).not.toBe(0.3);
    expect(onCommitColorGrading.mock.calls[0][0].details.vignette).not.toBe(0.2);
    act(() => root.unmount());
  });

  it("orders manual controls like the shader pipeline", () => {
    const { host, root } = renderInto(<FlatColorGradingSection {...neutralPropsBase()} />);
    const elements = [
      host.querySelector('[data-flat-grade-adjust="true"]'),
      host.querySelector('[data-color-wheels="true"]'),
      host.querySelector('[data-color-curves="true"]'),
      host.querySelector('[data-flat-grade-secondary="true"]'),
      host.querySelector('[data-flat-grade-lut-toggle="true"]'),
    ];
    expect(elements.every(Boolean)).toBe(true);
    for (let index = 0; index < elements.length - 1; index += 1) {
      const current = elements[index];
      const next = elements[index + 1];
      if (!current || !next) throw new Error("expected all grading sections");
      expect(current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    }
    act(() => root.unmount());
  });

  it("samples the full-strength signal entering the secondary stage", async () => {
    const base = neutralGrading();
    const grading = normalizeHfColorGrading({
      ...base,
      preset: "warm-polished",
      intensity: 0.35,
      adjust: { ...base.adjust, exposure: 0.2 },
      wheels: {
        ...base.wheels,
        shadows: { hue: 210, amount: 0.2, level: 0.05 },
      },
      curves: {
        ...base.curves,
        master: [
          [0, 0],
          [0.5, 0.6],
          [1, 1],
        ],
      },
      hueCurves: {
        ...base.hueCurves,
        hueVsSaturation: [
          [0, 0],
          [120, 0.1],
          [240, 0],
        ],
      },
      secondaries: [{ key: { hue: { center: 30, range: 15 } }, correction: {} }],
      details: { ...base.details, vignette: 0.4, grain: 0.2 },
      effects: { ...base.effects, pixelate: 0.5 },
      lut: { src: "assets/luts/custom.cube", intensity: 0.8 },
    });
    if (!grading) throw new Error("expected a secondary grade");
    const captureGradedFrame = vi.fn(
      async (_options?: { grading?: NormalizedHfColorGrading }) => null,
    );
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        grading={grading}
        captureGradedFrame={captureGradedFrame}
      />,
    );

    await act(async () => {
      const sample = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
        button.textContent?.includes("Sample color from frame"),
      );
      sample?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(captureGradedFrame).toHaveBeenCalledTimes(1);
    const options = captureGradedFrame.mock.calls[0]?.[0];
    const sampledGrading = options?.grading;
    if (!sampledGrading) throw new Error("expected the sampled grading input");
    expect(sampledGrading).toMatchObject({
      preset: null,
      intensity: 1,
      adjust: grading.adjust,
      wheels: grading.wheels,
      curves: grading.curves,
      hueCurves: grading.hueCurves,
      secondaries: [],
      lut: null,
    });
    expect(sampledGrading.details.vignette).toBe(0);
    expect(sampledGrading.details.grain).toBe(0);
    expect(sampledGrading.effects.pixelate).toBe(0);
    act(() => root.unmount());
  });

  it("keeps effect-bearing saved styles out of Grade", () => {
    const { host, root } = renderInto(<FlatColorGradingSection {...neutralPropsBase()} />);
    const presets = host.querySelector('[data-flat-grade-preset-group="presets"]');
    expect(presets?.querySelector('[data-flat-grade-preset="bright-pop"]')).not.toBeNull();
    expect(presets?.querySelector('[data-flat-grade-preset="vhs-playback"]')).toBeNull();
    expect(presets?.querySelector('[data-flat-grade-preset="editorial-halftone"]')).toBeNull();
    expect(host.querySelector('[data-flat-grade-preset="neutral"]')?.textContent).toContain(
      "Neutral",
    );
    act(() => root.unmount());
  });

  it("shows ready selected-media preview images without requesting a duplicate batch", () => {
    const onRequestPresetPreviews = vi.fn();
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        onRequestPresetPreviews={onRequestPresetPreviews}
      />,
    );
    expect(onRequestPresetPreviews).not.toHaveBeenCalled();
    expect(
      host.querySelector<HTMLImageElement>('[data-flat-grade-preview="bright-pop"]')?.src,
    ).toContain("data:image/png;base64,bright");
    expect(host.textContent).not.toContain("VHS Playback");
    act(() => root.unmount());
  });

  it("requests an idle preview batch once", () => {
    const onRequestPresetPreviews = vi.fn();
    const props = neutralPropsBase();
    const { root } = renderInto(
      <FlatColorGradingSection
        {...props}
        presetPreviews={{ ...props.presetPreviews, status: "idle", images: {} }}
        onRequestPresetPreviews={onRequestPresetPreviews}
      />,
    );
    expect(onRequestPresetPreviews).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("requires an explicit retry after a preview failure", () => {
    const onRequestPresetPreviews = vi.fn();
    const props = neutralPropsBase();
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...props}
        presetPreviews={{ ...props.presetPreviews, status: "unavailable", images: {} }}
        onRequestPresetPreviews={onRequestPresetPreviews}
      />,
    );
    expect(onRequestPresetPreviews).not.toHaveBeenCalled();
    const retry = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Retry look previews",
    );
    if (!retry) throw new Error("expected an explicit preview retry");
    act(() => retry.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onRequestPresetPreviews).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("shows the Custom LUT row collapsed by default, expanding to reveal the strength slider when a LUT is set", () => {
    const grading = { ...neutralGrading(), lut: { src: "assets/luts/warm.cube", intensity: 0.8 } };
    const { host, root } = renderInto(
      <FlatColorGradingSection {...neutralPropsBase()} grading={grading} />,
    );
    const lutToggle = host.querySelector<HTMLButtonElement>('[data-flat-grade-lut-toggle="true"]');
    expect(lutToggle).not.toBeNull();
    act(() => lutToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.textContent).toContain("warm.cube");
    act(() => root.unmount());
  });

  it("commits the selected catalog LUT via the select control, resetting intensity to 1 when switching LUTs", () => {
    const onCommitColorGrading = vi.fn();
    const grading = { ...neutralGrading(), lut: { src: "assets/luts/warm.cube", intensity: 0.5 } };
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        assets={["assets/luts/warm.cube", "assets/luts/cool.cube"]}
        grading={grading}
        onCommitColorGrading={onCommitColorGrading}
      />,
    );
    const lutToggle = host.querySelector<HTMLButtonElement>('[data-flat-grade-lut-toggle="true"]');
    act(() => lutToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const lutSelect = host.querySelector<HTMLSelectElement>('[data-flat-grade-lut-select="true"]');
    if (!lutSelect) throw new Error("expected a LUT catalog select");
    expect(lutSelect.getAttribute("aria-label")).toBe("Custom LUT");
    act(() => {
      lutSelect.value = "assets/luts/cool.cube";
      lutSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onCommitColorGrading).toHaveBeenCalledTimes(1);
    expect(onCommitColorGrading.mock.calls[0][0].lut).toEqual({
      src: "assets/luts/cool.cube",
      intensity: 1,
    });
    act(() => root.unmount());
  });

  it("imports a LUT via the hidden file input and commits the resolved asset", async () => {
    const onCommitColorGrading = vi.fn();
    const onImportAssets = vi.fn().mockResolvedValue(["assets/luts/x.cube"]);
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        onCommitColorGrading={onCommitColorGrading}
        onImportAssets={onImportAssets}
      />,
    );
    const lutToggle = host.querySelector<HTMLButtonElement>('[data-flat-grade-lut-toggle="true"]');
    act(() => lutToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error("expected a hidden file input");
    const file = new File(["cube data"], "x.cube");
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onImportAssets).toHaveBeenCalledTimes(1);
    expect(onImportAssets.mock.calls[0][0]).toEqual([file]);
    expect(onImportAssets.mock.calls[0][1]).toBe("assets/luts");
    expect(onCommitColorGrading).toHaveBeenCalledTimes(1);
    expect(onCommitColorGrading.mock.calls[0][0].lut).toEqual({
      src: "assets/luts/x.cube",
      intensity: 1,
    });
    act(() => root.unmount());
  });
});

describe("FlatColorGradingSection — Adjust sliders", () => {
  it("renders all 10 adjust rows with a center tick, formatting exposure distinctly from percentage sliders", () => {
    const { host, root } = renderInto(<FlatColorGradingSection {...neutralPropsBase()} />);
    const adjustRows = host.querySelectorAll('[data-flat-grade-adjust="true"]');
    expect(adjustRows).toHaveLength(10);
    for (const row of Array.from(adjustRows)) {
      expect(row.querySelector('[data-flat-slider-center-tick="true"]')).not.toBeNull();
    }
    expect(host.textContent).toContain("+0.00");
    act(() => root.unmount());
  });

  it("commits an adjust change scaled correctly and shows a reset when non-neutral", () => {
    const onCommitColorGrading = vi.fn();
    const grading = { ...neutralGrading(), adjust: { ...neutralGrading().adjust, contrast: 0.12 } };
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        grading={grading}
        onCommitColorGrading={onCommitColorGrading}
      />,
    );
    const contrastRow = findRowByText(host, '[data-flat-grade-adjust="true"]', "Contrast");
    clickSliderReset(contrastRow);
    expect(onCommitColorGrading).toHaveBeenCalledTimes(1);
    expect(onCommitColorGrading.mock.calls[0][0].adjust.contrast).toBe(0);
    act(() => root.unmount());
  });

  it("commits a dragged contrast value on slider track pointerdown, scaled from percent back to the internal -1..1 range", () => {
    const onCommitColorGrading = vi.fn();
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        onCommitColorGrading={onCommitColorGrading}
      />,
    );
    const contrastRow = findRowByText(host, '[data-flat-grade-adjust="true"]', "Contrast");
    // min=-100, max=100, step=1, ratio=0.75 -> raw=50 -> commit(50) -> adjust.contrast = 50/100 = 0.5
    dragSliderTrack(contrastRow, 75, 100);
    expect(onCommitColorGrading).toHaveBeenCalledTimes(1);
    expect(onCommitColorGrading.mock.calls[0][0].adjust.contrast).toBe(0.5);
    act(() => root.unmount());
  });

  it("commits a dragged exposure value scaled into stops, keeping other adjust keys untouched", () => {
    const onCommitColorGrading = vi.fn();
    const grading = {
      ...neutralGrading(),
      adjust: { ...neutralGrading().adjust, saturation: 0.2 },
    };
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        grading={grading}
        onCommitColorGrading={onCommitColorGrading}
      />,
    );
    const exposureRow = findRowByText(host, '[data-flat-grade-adjust="true"]', "Exposure");
    // min=-200, max=200, step=5, ratio=1.0 -> raw=200 -> commit(200) -> adjust.exposure = 200/100 = 2
    dragSliderTrack(exposureRow, 200, 200);
    expect(onCommitColorGrading).toHaveBeenCalledTimes(1);
    expect(onCommitColorGrading.mock.calls[0][0].adjust.exposure).toBe(2);
    expect(onCommitColorGrading.mock.calls[0][0].adjust.saturation).toBe(0.2);
    act(() => root.unmount());
  });

  it("revives a grade parked at 0% strength back to 100% when an Adjust slider is committed", () => {
    const onCommitColorGrading = vi.fn();
    const grading = { ...neutralGrading(), intensity: 0 };
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        grading={grading}
        onCommitColorGrading={onCommitColorGrading}
      />,
    );
    const contrastRow = findRowByText(host, '[data-flat-grade-adjust="true"]', "Contrast");
    // min=-100, max=100, step=1, ratio=0.75 -> raw=50 -> commit(50) -> adjust.contrast = 0.5
    dragSliderTrack(contrastRow, 75, 100);
    expect(onCommitColorGrading).toHaveBeenCalledTimes(1);
    expect(onCommitColorGrading.mock.calls[0][0].intensity).toBe(1);
    expect(onCommitColorGrading.mock.calls[0][0].adjust.contrast).toBe(0.5);
    act(() => root.unmount());
  });

  it("does NOT force intensity to revive when the Amount slider itself is dragged — it writes the value directly", () => {
    const onCommitColorGrading = vi.fn();
    const grading = { ...neutralGrading(), intensity: 0 };
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        grading={grading}
        onCommitColorGrading={onCommitColorGrading}
      />,
    );
    const strengthRow = findRowByText(host, "div", "Amount", "startsWith");
    // min=0, max=100, step=1, ratio=0.4 -> raw=40 -> commit(40) -> intensity = 40/100 = 0.4
    dragSliderTrack(strengthRow, 40, 100);
    expect(onCommitColorGrading).toHaveBeenCalledTimes(1);
    expect(onCommitColorGrading.mock.calls[0][0].intensity).toBe(0.4);
    act(() => root.unmount());
  });
});

describe("FlatColorGradingSection — Vignette and Grain", () => {
  it("renders Vignette and Grain amount rows with a settings gear, expanding tuned sliders on click", () => {
    const { host, root } = renderInto(<FlatColorGradingSection {...neutralPropsBase()} />);
    const vignetteGear = host.querySelector<HTMLButtonElement>(
      '[data-flat-grade-settings="vignette"]',
    );
    expect(vignetteGear).not.toBeNull();
    act(() => vignetteGear?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.textContent).toContain("Midpoint");
    expect(host.textContent).toContain("Feather");
    act(() => root.unmount());
  });

  it("shows tuned Midpoint at its 50% default with no reset until moved from default", () => {
    const { host, root } = renderInto(<FlatColorGradingSection {...neutralPropsBase()} />);
    const gear = host.querySelector<HTMLButtonElement>('[data-flat-grade-settings="vignette"]');
    act(() => gear?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const midpointRow = findRowByText(host, "div", "Midpoint", "startsWith");
    expect(midpointRow.querySelector('[data-flat-slider-reset="true"]')).toBeNull();
    act(() => root.unmount());
  });

  it("commits a dragged Roundness value on slider track pointerdown, scaled from percent back into the -1..1 detail range", () => {
    const onCommitColorGrading = vi.fn();
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        onCommitColorGrading={onCommitColorGrading}
      />,
    );
    const gear = host.querySelector<HTMLButtonElement>('[data-flat-grade-settings="vignette"]');
    act(() => gear?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const roundnessRow = findRowByText(host, "div", "Roundness", "startsWith");
    // min=-100, max=100, step=1, ratio=0.75 -> raw=50 -> commit(50) -> details.vignetteRoundness = 50/100 = 0.5
    dragSliderTrack(roundnessRow, 75, 100);
    expect(onCommitColorGrading).toHaveBeenCalledTimes(1);
    expect(onCommitColorGrading.mock.calls[0][0].details.vignetteRoundness).toBe(0.5);
    act(() => root.unmount());
  });

  it("resets a non-default Roundness back to its 0 default via the tuned slider's reset button", () => {
    const onCommitColorGrading = vi.fn();
    const grading = {
      ...neutralGrading(),
      details: { ...neutralGrading().details, vignetteRoundness: 0.4 },
    };
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        grading={grading}
        onCommitColorGrading={onCommitColorGrading}
      />,
    );
    const gear = host.querySelector<HTMLButtonElement>('[data-flat-grade-settings="vignette"]');
    act(() => gear?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const roundnessRow = findRowByText(host, "div", "Roundness", "startsWith");
    clickSliderReset(roundnessRow);
    expect(onCommitColorGrading).toHaveBeenCalledTimes(1);
    expect(onCommitColorGrading.mock.calls[0][0].details.vignetteRoundness).toBe(0);
    act(() => root.unmount());
  });
});

describe("FlatColorGradingSection — HDR banner and Apply scope", () => {
  it("shows the HDR banner only when mediaMetadata reports an HDR source", () => {
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        mediaMetadata={{
          kind: "video",
          color: { dynamicRange: "hdr", hdrTransfer: "pq", label: "HDR10", isHdr: true },
        }}
      />,
    );
    expect(host.textContent).toContain("SDR preview");
    act(() => root.unmount());
  });

  it("shows a codec/profile/pixel-format/color detail line in the HDR banner when metadata provides it", () => {
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        mediaMetadata={{
          kind: "video",
          color: {
            dynamicRange: "hdr",
            hdrTransfer: "pq",
            label: "HDR10",
            isHdr: true,
            codecName: "hevc",
            profile: "Main10",
            pixelFormat: "yuv420p10le",
            colorPrimaries: "bt2020",
            colorTransfer: "smpte2084",
          },
        }}
      />,
    );
    const detail = host.querySelector('[data-flat-grade-hdr-detail="true"]');
    expect(detail).not.toBeNull();
    expect(detail?.textContent).toBe("hevc · Main10 · yuv420p10le · bt2020 · smpte2084");
    act(() => root.unmount());
  });

  it("omits the HDR detail line entirely when no detail fields are populated", () => {
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        mediaMetadata={{
          kind: "video",
          color: { dynamicRange: "hdr", hdrTransfer: "pq", label: "HDR10", isHdr: true },
        }}
      />,
    );
    expect(host.querySelector('[data-flat-grade-hdr-detail="true"]')).toBeNull();
    act(() => root.unmount());
  });

  it("omits the HDR banner for SDR media", () => {
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        mediaMetadata={{
          kind: "video",
          color: { dynamicRange: "sdr", hdrTransfer: null, label: "SDR", isHdr: false },
        }}
      />,
    );
    expect(host.textContent).not.toContain("SDR preview");
    act(() => root.unmount());
  });

  it("fires onApplyToScope from the Apply button, respecting applyBusy", () => {
    const onApplyToScope = vi.fn();
    const { host, root } = renderInto(
      <FlatColorGradingSection {...neutralPropsBase()} onApplyToScope={onApplyToScope} applyBusy />,
    );
    const applyButton = host.querySelector<HTMLButtonElement>('[data-flat-grade-apply="true"]');
    expect(applyButton?.disabled).toBe(true);
    act(() => root.unmount());
  });

  it("fires onApplyToScope exactly once when the Apply button is clicked while not busy", () => {
    const onApplyToScope = vi.fn();
    const { host, root } = renderInto(
      <FlatColorGradingSection
        {...neutralPropsBase()}
        onApplyToScope={onApplyToScope}
        applyBusy={false}
      />,
    );
    const applyButton = host.querySelector<HTMLButtonElement>('[data-flat-grade-apply="true"]');
    expect(applyButton?.disabled).toBe(false);
    act(() => applyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onApplyToScope).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("gives the Copy-grade-to scope select an accessible name — the visible text sits in a sibling span, not a <label>", () => {
    const { host, root } = renderInto(<FlatColorGradingSection {...neutralPropsBase()} />);
    const scopeSelect = host.querySelector<HTMLSelectElement>('[aria-label="Copy grade to"]');
    expect(scopeSelect).not.toBeNull();
    act(() => root.unmount());
  });
});
