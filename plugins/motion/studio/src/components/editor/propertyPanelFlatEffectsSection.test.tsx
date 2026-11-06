// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  HF_COLOR_GRADING_ACTIVE_EFFECT_KEYS,
  HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS,
  HF_COLOR_GRADING_PALETTES,
  getHfColorGradingCapabilities,
  normalizeHfColorGrading,
} from "@hyperframes/core/color-grading";
import {
  activeColorGradingEffectCount,
  FlatEffectsAccessory,
  FlatEffectsSection,
} from "./propertyPanelFlatEffectsSection";
import { EFFECT_SPECS } from "./propertyPanelFlatEffectSpecs";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function neutralGrading() {
  const grading = normalizeHfColorGrading("neutral");
  if (!grading) throw new Error("expected neutral grading");
  return grading;
}

function renderInto(node: React.ReactElement) {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() => root.render(node));
  return { host, root };
}

function sectionProps(
  grading: ReturnType<typeof neutralGrading>,
  onCommitColorGrading: Mock = vi.fn(),
) {
  return {
    grading,
    previews: {
      status: "ready" as const,
      images: { pixelate: "data:image/png;base64,pixelate" },
      width: 160,
      height: 90,
    },
    presetPreviews: {
      status: "ready" as const,
      images: { "vhs-playback": "data:image/png;base64,vhs" },
      width: 160,
      height: 90,
    },
    onCommitColorGrading,
    onPreviewColorGrading: vi.fn(),
    onRequestEffectPreviews: vi.fn(),
    onRequestPresetPreviews: vi.fn(),
  };
}

describe("FlatEffectsSection", () => {
  it("places missing composite treatments in their effect family without a Styles section", () => {
    const onCommit = vi.fn();
    const props = sectionProps(neutralGrading(), onCommit);
    const { host, root } = renderInto(<FlatEffectsSection {...props} />);
    expect(host.textContent).not.toContain("Styles");
    expect(props.onRequestPresetPreviews).not.toHaveBeenCalled();
    const retro = host.querySelector<HTMLButtonElement>(
      '[data-flat-effect-group="Retro & Glitch"]',
    );
    act(() => retro?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(props.onRequestPresetPreviews).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-flat-effect-preset-preview="vhs-playback"]')).not.toBeNull();
    const vhs = host.querySelector<HTMLButtonElement>('[data-flat-effect-preset="vhs-playback"]');
    act(() => vhs?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
    expect(props.onPreviewColorGrading.mock.calls.at(-1)?.[0]).toMatchObject({
      preset: "vhs-playback",
      effects: { tapeDamage: 0.82, scanlineCount: 0.17 },
    });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => vhs?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onCommit.mock.calls[0][0].preset).toBe("vhs-playback");

    const print = host.querySelector<HTMLButtonElement>('[data-flat-effect-group="Print"]');
    act(() => print?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.querySelector('[data-flat-effect-preset="editorial-halftone"]')).not.toBeNull();
    expect(host.querySelector('[data-flat-effect-preset="two-ink-print"]')).not.toBeNull();
    act(() => root.unmount());
  });

  it("offers every shader master once in four intentional families", () => {
    const { host, root } = renderInto(<FlatEffectsSection {...sectionProps(neutralGrading())} />);
    const renderedKeys: Array<string | null> = [];
    for (const label of ["Essentials", "Retro & Glitch", "Print", "Art"]) {
      const tab = host.querySelector<HTMLButtonElement>(`[data-flat-effect-group="${label}"]`);
      expect(tab).not.toBeNull();
      act(() => tab?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      renderedKeys.push(
        ...Array.from(host.querySelectorAll("[data-flat-effect-option]"), (element) =>
          element.getAttribute("data-flat-effect-option"),
        ),
      );
    }
    expect(renderedKeys.sort()).toEqual([...HF_COLOR_GRADING_ACTIVE_EFFECT_KEYS].sort());
    const capabilities = new Map(
      getHfColorGradingCapabilities().effects.map((effect) => [effect.key, effect]),
    );
    for (const effect of EFFECT_SPECS) {
      expect(Boolean(effect.palette)).toBe(capabilities.get(effect.key)?.supportsPalette);
    }
    expect(host.querySelectorAll('[data-flat-slider-track="true"]')).toHaveLength(0);
    act(() => root.unmount());
  });

  it("requests exact cards and auditions a chosen default without persisting", () => {
    const props = sectionProps(neutralGrading());
    const { host, root } = renderInto(<FlatEffectsSection {...props} />);
    expect(props.onRequestEffectPreviews).toHaveBeenCalledTimes(1);
    expect(props.onRequestEffectPreviews).toHaveBeenCalledWith(["blur", "pixelate", "bloom"]);
    expect(host.querySelector('[data-flat-effect-preview="pixelate"]')).not.toBeNull();
    const pixelate = host.querySelector<HTMLButtonElement>('[data-flat-effect-option="pixelate"]');
    act(() => pixelate?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
    expect(props.onPreviewColorGrading.mock.calls.at(-1)?.[0].effects.pixelate).toBe(
      HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS.pixelate.pixelate,
    );
    expect(props.onPreviewColorGrading.mock.calls.at(-1)?.[1]).toEqual({
      animatedPreview: { kind: "effects", id: "pixelate" },
    });
    expect(props.onCommitColorGrading).not.toHaveBeenCalled();
    act(() => pixelate?.dispatchEvent(new MouseEvent("pointerout", { bubbles: true })));
    expect(props.onPreviewColorGrading).toHaveBeenLastCalledWith(null);
    act(() => root.unmount());
  });

  it("applies a useful canonical default when an effect is chosen", () => {
    const onCommit = vi.fn();
    const grading = { ...neutralGrading(), intensity: 0 };
    const { host, root } = renderInto(<FlatEffectsSection {...sectionProps(grading, onCommit)} />);
    const pixelate = host.querySelector<HTMLButtonElement>('[data-flat-effect-option="pixelate"]');
    act(() => pixelate?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0][0].effects.pixelate).toBe(
      HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS.pixelate.pixelate,
    );
    expect(onCommit.mock.calls[0][0].intensity).toBe(0);
    act(() => root.unmount());
  });

  it("uses a complete treatment card as a fresh starting point while preserving the LUT", () => {
    const onCommit = vi.fn();
    const base = neutralGrading();
    const grading = {
      ...base,
      adjust: { ...base.adjust, exposure: 0.4 },
      effects: { ...base.effects, blur: 0.6 },
      palette: ["#112233", "#ffffff"],
      lut: { src: "assets/luts/custom.cube", intensity: 0.5 },
    };
    const { host, root } = renderInto(<FlatEffectsSection {...sectionProps(grading, onCommit)} />);
    const toggle = host.querySelector<HTMLButtonElement>('[data-flat-effects-add-toggle="true"]');
    act(() => toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const retro = host.querySelector<HTMLButtonElement>(
      '[data-flat-effect-group="Retro & Glitch"]',
    );
    act(() => retro?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const vhs = host.querySelector<HTMLButtonElement>('[data-flat-effect-preset="vhs-playback"]');
    act(() => vhs?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const committed = onCommit.mock.calls[0][0];
    expect(committed).toMatchObject({
      preset: "vhs-playback",
      lut: { src: "assets/luts/custom.cube", intensity: 0.5 },
    });
    expect(committed.effects.tapeDamage).toBeGreaterThan(0);
    expect(committed.effects.blur).toBe(0);
    expect(committed.palette).toBeNull();
    expect(committed.adjust.exposure).not.toBe(0.4);
    act(() => root.unmount());
  });

  it("shows only the selected active effect controls and converts degrees to shader units", () => {
    const onCommit = vi.fn();
    const grading = normalizeHfColorGrading({
      effects: HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS.chromaticAberration,
    });
    if (!grading) throw new Error("expected chromatic grading");
    const { host, root } = renderInto(<FlatEffectsSection {...sectionProps(grading, onCommit)} />);
    expect(host.textContent).toContain("Angle");
    const effect = host.querySelector('[data-flat-effect-editor="chromaticAberration"]');
    if (!effect) throw new Error("expected chromatic effect");
    const rows = effect.querySelectorAll('[data-flat-slider-track="true"]');
    const angleTrack = rows[1] as HTMLElement | undefined;
    if (!angleTrack) throw new Error("expected angle slider");
    Object.defineProperty(angleTrack, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 2, right: 100, bottom: 2 }),
    });
    act(() => {
      angleTrack.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 50 }));
      angleTrack.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 50 }));
    });
    expect(onCommit.mock.calls.at(-1)?.[0].effects.chromaticAngle).toBe(0.5);
    act(() => root.unmount());
  });

  it("offers native ASCII styles, binary controls, and a bounded custom palette", () => {
    const onCommit = vi.fn();
    const grading = normalizeHfColorGrading({
      effects: HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS.ascii,
    });
    if (!grading) throw new Error("expected ASCII grading");
    const { host, root } = renderInto(<FlatEffectsSection {...sectionProps(grading, onCommit)} />);
    expect(
      host.querySelector<HTMLSelectElement>('select[aria-label="Style"]')?.options,
    ).toHaveLength(8);
    expect(host.querySelectorAll('[data-flat-toggle="true"]')).toHaveLength(2);
    expect(host.querySelector('[data-flat-effect-editor="ascii"]')?.textContent).not.toContain(
      "Mix",
    );
    expect(host.querySelectorAll("[data-flat-effects-palette-preset]")).toHaveLength(
      HF_COLOR_GRADING_PALETTES.length,
    );
    const synthwave = host.querySelector<HTMLButtonElement>(
      '[data-flat-effects-palette-preset="synthwave"]',
    );
    act(() => synthwave?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onCommit.mock.calls.at(-1)?.[0].palette).toEqual(
      HF_COLOR_GRADING_PALETTES.find(({ id }) => id === "synthwave")?.colors,
    );
    const addPalette = host.querySelector<HTMLButtonElement>(
      '[data-flat-effects-add-palette="true"]',
    );
    act(() => addPalette?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onCommit.mock.calls.at(-1)?.[0].palette).toEqual(["#000000", "#ffffff"]);
    act(() => root.unmount());
  });

  it("resets the selected effect to its authored defaults", () => {
    const onCommit = vi.fn();
    const grading = normalizeHfColorGrading({
      effects: { ...HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS.digitalGlitch, digitalGlitch: 0.9 },
    });
    if (!grading) throw new Error("expected digital glitch grading");
    const { host, root } = renderInto(<FlatEffectsSection {...sectionProps(grading, onCommit)} />);
    expect(
      host.querySelector('[data-flat-effect-editor="digitalGlitch"]')?.textContent,
    ).not.toContain("Mix");
    const reset = host.querySelector<HTMLButtonElement>('[title="Reset Digital Glitch"]');
    act(() => reset?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onCommit.mock.calls.at(-1)?.[0].effects).toMatchObject(
      HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS.digitalGlitch,
    );
    act(() => root.unmount());
  });

  it("removes only the selected effect and preserves another active effect", () => {
    const onCommit = vi.fn();
    const grading = normalizeHfColorGrading({
      effects: {
        ...HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS.blur,
        ...HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS.pixelate,
      },
    });
    if (!grading) throw new Error("expected multi-effect grading");
    const { host, root } = renderInto(<FlatEffectsSection {...sectionProps(grading, onCommit)} />);
    const remove = host.querySelector<HTMLButtonElement>('[title="Remove Blur"]');
    act(() => remove?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onCommit.mock.calls.at(-1)?.[0].effects.blur).toBe(0);
    expect(onCommit.mock.calls.at(-1)?.[0].effects.pixelate).toBe(
      HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS.pixelate.pixelate,
    );
    act(() => root.unmount());
  });

  it("closes the catalog when an already active effect is selected", () => {
    const grading = normalizeHfColorGrading({
      effects: HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS.blur,
    });
    if (!grading) throw new Error("expected blur grading");
    const props = sectionProps(grading);
    const { host, root } = renderInto(<FlatEffectsSection {...props} />);
    expect(props.onRequestEffectPreviews).not.toHaveBeenCalled();
    const toggle = host.querySelector<HTMLButtonElement>('[data-flat-effects-add-toggle="true"]');
    act(() => toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(props.onRequestEffectPreviews).toHaveBeenCalledWith(["blur", "pixelate", "bloom"]);
    const blur = host.querySelector<HTMLButtonElement>('[data-flat-effect-option="blur"]');
    act(() => blur?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    act(() => root.unmount());
  });

  it("requests only the visible family when the catalog tab changes", () => {
    const props = sectionProps(neutralGrading());
    const { host, root } = renderInto(<FlatEffectsSection {...props} />);
    const art = host.querySelector<HTMLButtonElement>('[data-flat-effect-group="Art"]');
    act(() => art?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(props.onRequestEffectPreviews).toHaveBeenLastCalledWith([
      "ascii",
      "engraving",
      "crosshatch",
      "kuwahara",
    ]);
    act(() => root.unmount());
  });
});

describe("FlatEffectsAccessory", () => {
  it("counts active masters and resets only effects and palette", () => {
    const base = neutralGrading();
    const grading = {
      ...base,
      adjust: { ...base.adjust, contrast: 0.2 },
      effects: { ...base.effects, blur: 0.4, ascii: 1 },
      palette: ["#112233", "#ffffff"],
    };
    expect(activeColorGradingEffectCount(grading)).toBe(2);
    const onCommit = vi.fn();
    const { host, root } = renderInto(
      <FlatEffectsAccessory grading={grading} onCommitColorGrading={onCommit} />,
    );
    const reset = host.querySelector<HTMLButtonElement>('[data-flat-effects-reset="true"]');
    act(() => reset?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onCommit.mock.calls[0][0].adjust.contrast).toBe(0.2);
    expect(onCommit.mock.calls[0][0].effects.blur).toBe(0);
    expect(onCommit.mock.calls[0][0].effects.ascii).toBe(0);
    expect(onCommit.mock.calls[0][0].palette).toBeNull();
    act(() => root.unmount());
  });
});
