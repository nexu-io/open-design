// Imports the parsers SOURCE (not the published subpath) so newly-added eases
// like circ.inOut resolve before the parsers dist is rebuilt.
import { SUPPORTED_EASES } from "@hyperframes/parsers/gsap-constants";
import { parseSpringBounce } from "@hyperframes/core/spring-ease";
import { parseWiggleEase } from "@hyperframes/core/wiggle-ease";
import { describe, expect, it } from "vitest";
import { EASE_PRESETS, easePresetLabel } from "./easePresetLibrary";
import { resolveEaseCurveTuple } from "./gsapAnimationConstants";

const CUSTOM_EASE_PATTERN =
  /^custom\(M0,0 C-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)? -?\d+(?:\.\d+)?,-?\d+(?:\.\d+)? 1,1\)$/;

describe("EASE_PRESETS", () => {
  it("contains the complete 32-preset Graphs library with unique fields", () => {
    expect(EASE_PRESETS).toHaveLength(32);
    expect(new Set(EASE_PRESETS.map(({ id }) => id))).toHaveLength(32);
    expect(new Set(EASE_PRESETS.map(({ label }) => label))).toHaveLength(32);
    expect(new Set(EASE_PRESETS.map(({ ease }) => ease))).toHaveLength(32);
  });

  it("preserves the required standard, Flow, and Bounce mappings", () => {
    const easeByLabel = Object.fromEntries(EASE_PRESETS.map(({ label, ease }) => [label, ease]));

    expect(easeByLabel).toMatchObject({
      Linear: "none",
      "Ease In": "power1.in",
      "Quad In": "power2.in",
      "Cubic In": "power3.in",
      "Ease Out": "power1.out",
      "Quad Out": "power2.out",
      "Cubic Out": "power3.out",
      "Ease In & Out": "power1.inOut",
      "Quad Ease": "power2.inOut",
      "Cubic Ease": "power3.inOut",
      "Circular Ease": "circ.inOut",
      "Ease In Back": "back.in",
      "Ease Out Back": "back.out",
      "Flow 1": "wiggle(1,easeInOut,0.20)",
      "Flow 2": "wiggle(2,easeInOut,0.15)",
      "Flow 3": "wiggle(3,easeInOut,0.12)",
      "Flow 4": "wiggle(4,easeInOut,0.10)",
      "Flow 5": "wiggle(5,easeInOut,0.08)",
      "Flow 6": "wiggle(6,easeInOut,0.07)",
      "Flow 7": "wiggle(7,easeInOut,0.06)",
      "Bounce 1": "wiggle(4,easeOut,0.22)",
      "Bounce 2": "wiggle(6,easeOut,0.26)",
      "Bounce 3": "wiggle(9,uniform,0.32)",
      "Bounce 4": "wiggle(5,anticipate,0.28)",
      Hold: "hold",
    });

    const flows = EASE_PRESETS.filter(({ id }) => id.startsWith("flow-"));
    expect(flows.map(({ label }) => label)).toEqual([
      "Flow 1",
      "Flow 2",
      "Flow 3",
      "Flow 4",
      "Flow 5",
      "Flow 6",
      "Flow 7",
    ]);
    expect(flows.every(({ ease }) => parseWiggleEase(ease) !== null)).toBe(true);
  });

  it("uses supported or valid custom eases that all resolve to finite geometry", () => {
    for (const preset of EASE_PRESETS) {
      expect(
        SUPPORTED_EASES.includes(preset.ease as (typeof SUPPORTED_EASES)[number]) ||
          CUSTOM_EASE_PATTERN.test(preset.ease) ||
          parseSpringBounce(preset.ease) !== null ||
          parseWiggleEase(preset.ease) !== null,
        `${preset.label} has unsupported ease ${preset.ease}`,
      ).toBe(true);
      expect(resolveEaseCurveTuple(preset.ease).every(Number.isFinite)).toBe(true);
    }
  });

  it("assigns every preset a valid kind", () => {
    const kinds = new Set(["curve", "spring", "wiggle"]);

    for (const preset of EASE_PRESETS) {
      expect(kinds.has(preset.kind)).toBe(true);
    }
  });

  it("uses valid bounce values for spring presets", () => {
    for (const preset of EASE_PRESETS.filter(({ kind }) => kind === "spring")) {
      const bounce = parseSpringBounce(preset.ease);

      expect(bounce).not.toBeNull();
      expect(bounce).toBeGreaterThanOrEqual(0);
      expect(bounce).toBeLessThanOrEqual(1);
    }
  });

  it("uses parseable eases for wiggle presets", () => {
    for (const preset of EASE_PRESETS.filter(({ kind }) => kind === "wiggle")) {
      expect(parseWiggleEase(preset.ease)).not.toBeNull();
    }
  });

  it("preserves stable preset ids", () => {
    for (const id of ["flow-7", "hold", "rebound-in"]) {
      expect(EASE_PRESETS.some((preset) => preset.id === id)).toBe(true);
    }
  });

  it("resolves preset labels by exact ease", () => {
    expect(easePresetLabel("spring(0.6)")).toBe("Bouncy");
    expect(easePresetLabel("back.in")).toBe("Ease In Back");
    expect(easePresetLabel("wiggle(9,uniform,0.32)")).toBe("Bounce 3");
    expect(easePresetLabel("custom(x)")).toBeNull();
  });
});
