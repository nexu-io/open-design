// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { HF_AUDIO_FX_PRESETS } from "@hyperframes/core/audio-fx-presets";
import {
  FX_PRESET_STYLE,
  FX_PRESET_STYLE_DEFAULT,
  fxPresetBackground,
  fxPresetStyle,
  fxTintWash,
} from "./propertyPanelFxPresetStyle.js";

describe("per-preset title treatments", () => {
  it("styles every preset the catalogue ships", () => {
    // An unstyled preset is not broken — it falls back — but it is a row that
    // silently opts out of the design, which nobody would notice.
    const missing = HF_AUDIO_FX_PRESETS.filter((p) => !FX_PRESET_STYLE[p.id]).map((p) => p.id);
    expect(missing).toEqual([]);
  });

  it("styles no preset the catalogue does not", () => {
    // Dead entries for renamed or removed presets read as coverage.
    const shipped = new Set(HF_AUDIO_FX_PRESETS.map((p) => p.id));
    expect(Object.keys(FX_PRESET_STYLE).filter((id) => !shipped.has(id))).toEqual([]);
  });

  it("gives the character presets treatments that differ from each other", () => {
    // The whole point: a preset is a character, and Telephone should not look
    // like Megaphone. The corrective families may legitimately share a look.
    const character = HF_AUDIO_FX_PRESETS.filter((p) => p.family === "character");
    const looks = new Set(
      character.map((p) => `${fxPresetStyle(p.id).type}|${fxPresetStyle(p.id).family}`),
    );
    expect(looks.size).toBe(character.length);
  });

  it("names a real font stack, ending in a generic the browser always has", () => {
    // The studio has no webfont pipeline, so these are system faces — and a
    // machine without the named one has to land somewhere deliberate rather
    // than on the browser's default serif.
    const generic = /(sans-serif|serif|monospace|fantasy|cursive|ui-monospace)\s*$/;
    for (const [id, style] of Object.entries(FX_PRESET_STYLE)) {
      expect(style.family, `${id} names no face`).toBeTruthy();
      expect(style.family, `${id} has no generic fallback`).toMatch(generic);
      // More than one option, or it is a single point of failure.
      expect((style.family ?? "").split(",").length, `${id} has no fallback chain`).toBeGreaterThan(
        2,
      );
    }
  });

  it("sets a title size on every preset, and keeps it legible", () => {
    // The panel's own rows are 10px; a title at that size is not a title. The
    // ceiling is what still fits the bracket without wrapping.
    for (const [id, style] of Object.entries(FX_PRESET_STYLE)) {
      const size = /text-\[(\d+)px\]/.exec(style.type);
      expect(size, `${id} sets no title size`).toBeTruthy();
      const px = Number(size?.[1]);
      expect(px, `${id} is too small to read as a title`).toBeGreaterThanOrEqual(12);
      expect(px, `${id} is too large for the bracket`).toBeLessThanOrEqual(18);
    }
  });

  it("keeps every colour vibrant, and light enough to read on the panel", () => {
    // The rack sits on #0C0C0E. A title has to carry real colour to be worth
    // having, and still clear contrast against near-black.
    for (const [id, style] of Object.entries(FX_PRESET_STYLE)) {
      const match = /hsl\(\s*(\d+),\s*(\d+)%,\s*(\d+)%\s*\)/.exec(style.color);
      expect(match, `${id} is not a plain hsl() colour`).toBeTruthy();
      const saturation = Number(match?.[1 + 1]);
      const lightness = Number(match?.[3]);
      expect(saturation, `${id} is too washed out to read as a colour`).toBeGreaterThanOrEqual(60);
      expect(lightness, `${id} is too dark against the panel`).toBeGreaterThanOrEqual(58);
      expect(lightness, `${id} is so light the hue disappears`).toBeLessThanOrEqual(78);
    }
  });

  it("keeps the title hues clear of the accent, which means something else", () => {
    // The panel spends #3CE6AC (hue 160) on "automated" and "playing". A title
    // sitting on that hue reads as a status the preset does not have.
    for (const [id, style] of Object.entries(FX_PRESET_STYLE)) {
      const hue = Number(/hsl\(\s*(\d+),/.exec(style.color)?.[1]);
      const distance = Math.min(Math.abs(hue - 160), 360 - Math.abs(hue - 160));
      expect(distance, `${id} sits on the accent's hue`).toBeGreaterThan(20);
    }
  });

  it("backs each preset with its own hue, dark enough to sit under the panel", () => {
    // Derived from the title rather than picked, so a background cannot drift
    // away from the title it belongs to.
    const seen = new Set<string>();
    for (const [id, style] of Object.entries(FX_PRESET_STYLE)) {
      const bg = fxPresetBackground(id);
      expect(bg, `${id} has no background`).toBeTruthy();
      const titleHue = /hsl\(\s*(\d+),/.exec(style.color)?.[1];
      expect(bg, `${id}'s background is a different hue from its title`).toContain(
        `hsl(${titleHue},`,
      );
      const lightness = Number(/,\s*(\d+)%\s*\)/.exec(bg ?? "")?.[1]);
      expect(lightness, `${id}'s background would fight the controls on it`).toBeLessThanOrEqual(
        16,
      );
      seen.add(bg ?? "");
    }
    // Presets that share a title colour share a background — the repair family
    // is deliberately uniform — but the character ones must not.
    const character = HF_AUDIO_FX_PRESETS.filter((p) => p.family === "character");
    expect(new Set(character.map((p) => fxPresetBackground(p.id))).size).toBe(character.length);
  });

  it("has no background for a preset it does not know", () => {
    expect(fxPresetBackground("not-a-preset")).toBeNull();
  });

  it("falls back rather than failing for a preset it does not know", () => {
    expect(fxPresetStyle("not-a-preset")).toBe(FX_PRESET_STYLE_DEFAULT);
  });
});

/**
 * The wash is shared with the smart modules, which do not have preset entries
 * to look up — the carve derives its colour from `fxFamilyTint`, and that one
 * COMPUTES its lightness, so it emits `62.0%` where every preset colour is a
 * whole number. An integer-only pattern reads those as no match and returns
 * null, which renders as no wash at all rather than as an error.
 */
describe("the tint wash", () => {
  it("reads a computed colour, decimals and all", () => {
    expect(fxTintWash("hsl(95, 32%, 62.0%)")).toBe("hsl(95, 22%, 11%)");
    expect(fxTintWash("hsl(95, 32.5%, 76%)")).toBe("hsl(95, 22%, 11%)");
  });

  it("keeps the hue and takes everything else to near-black", () => {
    // Same hue in, same hue out: the wash cannot clash with the title it sits
    // behind, because it IS the title's hue.
    expect(fxTintWash("hsl(288, 85%, 72%)")).toBe("hsl(288, 22%, 11%)");
  });

  it("declines a colour it cannot read rather than guessing", () => {
    expect(fxTintWash("#52525B")).toBeNull();
    expect(fxTintWash("rebeccapurple")).toBeNull();
  });
});
