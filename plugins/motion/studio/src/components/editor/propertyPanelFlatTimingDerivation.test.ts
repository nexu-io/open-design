import { describe, expect, it } from "vitest";
import { deriveElementTiming } from "./propertyPanelFlatTimingDerivation";
import type { DomEditSelection } from "./domEditingTypes";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";

function withDataAttributes(
  dataAttributes: Record<string, string>,
): Pick<DomEditSelection, "dataAttributes"> {
  return { dataAttributes };
}

describe("deriveElementTiming", () => {
  it("uses the explicit data-start/data-duration attributes when duration is authored", () => {
    const result = deriveElementTiming(withDataAttributes({ start: "8", duration: "4" }));
    expect(result).toEqual({ start: 8, duration: 4, inferred: false });
  });

  it("infers start/duration from animations when there is no explicit data-duration", () => {
    const animations = [{ position: 2, duration: 3 } as unknown as GsapAnimation];
    const result = deriveElementTiming(
      withDataAttributes({ start: "0", duration: "0" }),
      animations,
    );
    expect(result).toEqual({ start: 2, duration: 3, inferred: true });
  });

  it("spans the earliest tween start to the latest tween end across multiple animations", () => {
    const animations = [
      { position: 1, duration: 2 } as unknown as GsapAnimation, // 1 -> 3
      { position: 2, duration: 4 } as unknown as GsapAnimation, // 2 -> 6
    ];
    const result = deriveElementTiming(withDataAttributes({}), animations);
    expect(result).toEqual({ start: 1, duration: 5, inferred: true });
  });

  it("prefers an explicit data-duration over inference even when animations exist", () => {
    const animations = [{ position: 2, duration: 3 } as unknown as GsapAnimation];
    const result = deriveElementTiming(
      withDataAttributes({ start: "0", duration: "10" }),
      animations,
    );
    expect(result).toEqual({ start: 0, duration: 10, inferred: false });
  });

  it("falls back to hf-authored-duration when data-duration is absent", () => {
    const result = deriveElementTiming(
      withDataAttributes({ start: "1", "hf-authored-duration": "6" }),
    );
    expect(result).toEqual({ start: 1, duration: 6, inferred: false });
  });

  it("returns a zero-duration, non-inferred result with no attributes and no animations", () => {
    const result = deriveElementTiming(withDataAttributes({}));
    expect(result).toEqual({ start: 0, duration: 0, inferred: false });
  });

  // This is the exact bug from the whole-plan coherence review: Layout's
  // keyframe-seek basis must land on the same absolute time that Motion's
  // Timing row displays as the element's midpoint.
  it("agrees with a keyframe-percentage seek: 50% lands on the same midpoint the Timing row would show", () => {
    const animations = [{ position: 2, duration: 3 } as unknown as GsapAnimation];
    const timing = deriveElementTiming(
      withDataAttributes({ start: "0", duration: "0" }),
      animations,
    );
    const seekTimeAt50Pct = timing.start + (50 / 100) * timing.duration;
    const timingRowMidpoint = timing.start + timing.duration / 2;
    expect(seekTimeAt50Pct).toBe(timingRowMidpoint);
    expect(seekTimeAt50Pct).toBe(3.5);
  });
});
