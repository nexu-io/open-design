import { describe, expect, it } from "vitest";
import { clearanceIssues } from "../src/solve/clearance.js";
import type { SolvedPart } from "../src/solve/types.js";

/** Minkowski clearance: the ε-dilation question asked with subtraction. */

function part(id: string, center: [number, number, number], size: [number, number, number]): SolvedPart {
  return { id, center, size, shape: "box", axis: "z", flip: false } as SolvedPart;
}

describe("clearanceIssues", () => {
  it("is off by default — zero clearance judges nothing", () => {
    const a = part("prp_a", [0, 0, 0.5], [1, 1, 1]);
    const b = part("prp_b", [1.002, 0, 0.5], [1, 1, 1]);
    expect(clearanceIssues({ parts: [a, b] }, 0)).toEqual([]);
  });

  it("flags the band between contact and the declared clearance", () => {
    // 2mm apart, 5mm declared: a pinch. Contact-floor touches and
    // comfortably-clear pairs both stay silent.
    const a = part("prp_a", [0, 0, 0.5], [1, 1, 1]);
    const pinched = part("prp_pinch", [1.002, 0, 0.5], [1, 1, 1]); // 2mm gap
    const touching = part("prp_touch", [0, 1.001, 0.5], [1, 1, 1]); // 1mm = contact floor
    const clear = part("prp_clear", [0, 0, 2], [1, 1, 1]); // 1m above
    const issues = clearanceIssues({ parts: [a, pinched, touching, clear] }, 0.005);
    const pinches = issues.filter((i) => i.code === "S3D-W-109");
    // Computed, not assumed: a↔pinch is 2mm; pinch↔touch are ALSO 2mm apart
    // diagonally (the first draft of this test asserted they were not, and
    // the rule correctly refuted its author). a↔touch sits at the 1mm
    // contact floor — a designed touch — and clear is a metre away.
    expect(pinches.map((i) => i.target).sort()).toEqual([
      "prp_a <-> prp_pinch",
      "prp_pinch <-> prp_touch",
    ]);
    expect(pinches.every((i) => !String(i.target).includes("prp_clear"))).toBe(true);
    const found = pinches.find((i) => i.target === "prp_a <-> prp_pinch")!;
    expect(found.detail?.separation).toBeCloseTo(0.002, 6);
    expect(found.hint).toContain("conventions.geometry.minClearance");
  });

  it("holds its boundaries: at the clearance = silent, just inside = fires", () => {
    const a = part("prp_a", [0, 0, 0.5], [1, 1, 1]);
    const atLimit = part("prp_at", [1.005, 0, 0.5], [1, 1, 1]); // exactly 5mm
    const inside = part("prp_in", [0, 1.0049, 0.5], [1, 1, 1]); // 4.9mm
    const issues = clearanceIssues({ parts: [a, atLimit, inside] }, 0.005);
    expect(issues.some((i) => String(i.target).includes("prp_at"))).toBe(false);
    expect(issues.some((i) => String(i.target).includes("prp_in"))).toBe(true);
  });

  it("leaves overlapping pairs to the intersection rules", () => {
    const a = part("prp_a", [0, 0, 0.5], [1, 1, 1]);
    const overlapping = part("prp_over", [0.5, 0, 0.5], [1, 1, 1]);
    expect(clearanceIssues({ parts: [a, overlapping] }, 0.005)).toEqual([]);
  });

  it("is deterministic across runs", () => {
    const scene = () => ({
      parts: [part("prp_a", [0, 0, 0.5], [1, 1, 1]), part("prp_b", [1.002, 0, 0.5], [1, 1, 1])],
    });
    expect(JSON.stringify(clearanceIssues(scene(), 0.005))).toBe(
      JSON.stringify(clearanceIssues(scene(), 0.005)),
    );
  });
});
