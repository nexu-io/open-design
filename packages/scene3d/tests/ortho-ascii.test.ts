// The ASCII ortho triptych: plan/front/side box-art from the census, the
// proportion-and-height feedback a perspective proof frame can't give a
// text-only model. Zero Blender — a pure function of the census.

import { describe, expect, it } from "vitest";
import type { Census } from "../src/types.js";
import { renderOrthoAscii } from "../src/read/ortho-ascii.js";

/** A census with just the fields the triptych reads (world AABBs). */
function census(boxes: Array<{ name: string; min: [number, number, number]; max: [number, number, number] }>): Census {
  return {
    objects: boxes.map((b) => ({ name: b.name, type: "MESH", worldMin: b.min, worldMax: b.max })),
    meshes: boxes.map((b) => ({ object: b.name, spatial: { worldMin: b.min, worldMax: b.max } })),
  } as unknown as Census;
}

describe("renderOrthoAscii", () => {
  it("renders three labelled elevations, a legend, and dimensions", () => {
    const out = renderOrthoAscii(
      census([
        { name: "prp_slab", min: [0, 0, 0], max: [3, 2, 0.1] },
        { name: "prp_post", min: [1, 0.8, 0], max: [1.4, 1.2, 2] },
      ]),
    );
    expect(out).toContain("Plan · top (−Z)");
    expect(out).toContain("Front (−Y)");
    expect(out).toContain("Side (−X)");
    expect(out).toContain("X→ Y↑"); // the plan gnomon
    // A per-part legend with a glyph and the part's dimensions.
    expect(out).toContain("a prp_post"); // name-sorted → post before slab? p<s
    expect(out).toContain("b prp_slab");
    expect(out).toMatch(/\dm|\dmm/); // dimensions present
    // The post is taller than it is wide — the elevations must SHOW that
    // (more rows of its glyph in front than the plan's footprint).
    expect(out).toContain("|"); // it drew grid panes
  });

  it("is deterministic — byte-identical across runs", () => {
    const c = census([
      { name: "b", min: [0, 0, 0], max: [1, 1, 1] },
      { name: "a", min: [2, 0, 0], max: [3, 1, 2] },
    ]);
    expect(renderOrthoAscii(c)).toBe(renderOrthoAscii(c));
  });

  it("names its own emptiness rather than drawing a blank box", () => {
    expect(renderOrthoAscii(census([]))).toBe("ortho: no measured meshes");
  });

  it("caps the legend to distinguishable glyphs and names the overflow loudly", () => {
    // 80 parts, but only 62 printable glyphs — the rest draw '#'. The legend
    // must list only the distinguishable ones, not 80 lines of noise, and say so.
    const many = Array.from({ length: 80 }, (_, i) => ({
      name: `prp_${String(i).padStart(2, "0")}`,
      min: [i, 0, 0] as [number, number, number],
      max: [i + 1, 1, 1] as [number, number, number],
    }));
    const out = renderOrthoAscii(census(many));
    const legend = out.split("legend (one glyph per part):\n")[1]!;
    const entries = legend.split("\n").filter((l) => l.trim() && !l.startsWith("("));
    expect(entries.length).toBeLessThanOrEqual(62);
    expect(out).toContain("further parts drawn '#'");
    expect(out).toContain("od scene3d describe"); // points to the region query
  });
});
