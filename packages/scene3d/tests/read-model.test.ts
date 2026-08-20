import { describe, expect, it } from "vitest";
import { describeScene } from "../src/read/describe.js";
import { changeImpact, formatImpact } from "../src/read/impact.js";
import { renderOrthoSvg, orthoDimensions } from "../src/read/ortho.js";
import type { Census, CensusContact, Issue } from "../src/types.js";

/**
 * The read model is what lets a reader understand a scene without opening
 * it. Both halves are pure functions over a census, so they are tested
 * directly rather than through a Blender compile — the compile is exercised
 * separately in pipeline.test.ts, and these need to run in milliseconds so
 * the edge cases can be exhaustive.
 */

type Vec3 = [number, number, number];

function part(name: string, min: Vec3, size: Vec3, tris = 12) {
  const max: Vec3 = [min[0] + size[0], min[1] + size[1], min[2] + size[2]];
  return { name, min, max, tris };
}

function census(
  parts: Array<ReturnType<typeof part>>,
  contacts: CensusContact[] = [],
): Census {
  return {
    blenderVersion: "5.0.1",
    sceneName: "Scene",
    unitSystem: "METRIC",
    scaleLength: 1,
    objects: parts.map((p) => ({
      name: p.name,
      type: "MESH",
      parent: null,
      location: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      dimensions: [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]],
      visible: true,
      hasMeshData: true,
      worldMin: p.min,
      worldMax: p.max,
    })),
    meshes: parts.map((p) => ({
      object: p.name,
      verts: 8,
      faces: 6,
      tris: p.tris,
      ngons: 0,
      nonManifoldEdges: 0,
      zeroAreaFaces: 0,
      nan: false,
      uvLayers: [],
      spatial: {
        worldMin: p.min,
        worldMax: p.max,
        size: [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]],
        bboxCenter: [
          (p.min[0] + p.max[0]) / 2,
          (p.min[1] + p.max[1]) / 2,
          (p.min[2] + p.max[2]) / 2,
        ],
        centroid: [
          (p.min[0] + p.max[0]) / 2,
          (p.min[1] + p.max[1]) / 2,
          (p.min[2] + p.max[2]) / 2,
        ],
        groundGap: p.min[2],
      },
    })),
    materials: [],
    textures: [],
    uvObjectsWithoutLayers: [],
    objectsWithoutMaterial: [],
    zFightingPairs: [],
    contacts,
    camera: { present: true, name: "cam_main" },
    lightCount: 1,
    animation: { fps: 24, frameStart: 1, frameEnd: 1, keyframedObjects: [] },
    offCameraObjects: [],
  } as unknown as Census;
}

const issue = (code: string, target: string, severity: Issue["severity"] = "error"): Issue => ({
  code,
  severity,
  message: code,
  target,
});

describe("describeScene", () => {
  const scene = census([
    part("prp_crate_a", [0, 0, 0], [1, 1, 1]),
    part("prp_crate_b", [2, 0, 0], [1, 1, 1]),
    part("prp_post_x", [0, 5, 0], [0.2, 0.2, 3]),
  ]);

  it("leads with the whole shape before any detail", () => {
    const text = describeScene(scene);
    const lines = text.split("\n");
    expect(lines[0]).toContain("3 parts");
    expect(lines[1]).toContain("extent:");
    // Extent spans all three parts: x 0→3, y 0→5.2, z 0→3.
    expect(lines[1]).toContain("3 5.2 3");
  });

  it("is byte-identical across runs so the summary itself can be diffed", () => {
    expect(describeScene(scene)).toBe(describeScene(scene));
    // And independent of the order parts arrive in.
    const shuffled = census([
      part("prp_post_x", [0, 5, 0], [0.2, 0.2, 3]),
      part("prp_crate_b", [2, 0, 0], [1, 1, 1]),
      part("prp_crate_a", [0, 0, 0], [1, 1, 1]),
    ]);
    expect(describeScene(shuffled)).toBe(describeScene(scene));
  });

  it("puts issues before structure, because they are the reason to read it", () => {
    const text = describeScene(scene, [issue("S3D-E-324", "prp_crate_a")]);
    expect(text.indexOf("issues:")).toBeLessThan(text.indexOf("groups:"));
    expect(text).toContain("S3D-E-324");
  });

  it("orders issues by severity, errors first", () => {
    const text = describeScene(scene, [
      issue("S3D-W-341", "mtl_a", "warning"),
      issue("S3D-E-324", "prp_crate_a", "error"),
    ]);
    expect(text.indexOf("S3D-E-324")).toBeLessThan(text.indexOf("S3D-W-341"));
  });

  it("groups by shared name prefix rather than listing everything flat", () => {
    const text = describeScene(scene);
    // Two crates collapse into one group; the lone post stays itself.
    expect(text).toContain("prp_crate ×2");
  });

  /*
   * The budget must summarise, not truncate — and must never let the reader
   * mistake "this is everything" for "this is what fit".
   */
  it("admits what the budget folded away instead of implying completeness", () => {
    const many = census(
      Array.from({ length: 60 }, (_, i) =>
        part(`prp_thing${String(i).padStart(2, "0")}_x`, [i, 0, 0], [1, 1, 1]),
      ),
    );
    const text = describeScene(many, [], { budgetTokens: 60 });
    expect(text).toMatch(/folded away by the token budget/);
    expect(text.length).toBeLessThan(60 * 4 + 200);
  });

  it("says so plainly when there is nothing to describe", () => {
    expect(describeScene(census([]))).toBe("empty scene — no meshes");
  });

  it("restricts to a region when asked, and says the region is empty", () => {
    const near = describeScene(scene, [], { region: { min: [-1, -1, -1], max: [1.5, 1.5, 1.5] } });
    expect(near).toContain("1 parts");
    expect(near).toContain("prp_crate_a");
    expect(near).not.toContain("prp_post_x");

    const far = describeScene(scene, [], { region: { min: [100, 100, 100], max: [101, 101, 101] } });
    expect(far).toBe("empty region — no parts intersect it");
  });

  it("expands the focused group in full regardless of its size", () => {
    const many = census(
      Array.from({ length: 12 }, (_, i) => part(`prp_bolt_${i}`, [i, 0, 0], [0.1, 0.1, 0.1])),
    );
    const unfocused = describeScene(many, [], { budgetTokens: 400 });
    expect(unfocused).not.toContain("prp_bolt_7:");
    const focused = describeScene(many, [], { budgetTokens: 400, focus: "prp_bolt" });
    expect(focused).toContain("prp_bolt_7:");
  });
});

describe("renderOrthoSvg", () => {
  const scene = census([
    part("prp_base", [-0.6, -0.4, 0], [1.2, 0.8, 0.1]),
    part("prp_body", [-0.5, -0.35, 0.1], [1, 0.7, 0.6]),
  ]);

  it("draws all three standard views", () => {
    const svg = renderOrthoSvg(scene);
    expect(svg).toContain("Plan (top, −Z)");
    expect(svg).toContain("Front (−Y)");
    expect(svg).toContain("Side (−X)");
  });

  /*
   * The point of the format: the measurements survive as text, so a reader
   * that cannot see the picture still gets the numbers.
   */
  it("writes the dimensions as readable text, not as pixels", () => {
    const svg = renderOrthoSvg(scene);
    expect(svg).toContain("1.2m");
    expect(svg).toContain("800mm");
    // Per-part sizes are reachable without rendering anything.
    expect(svg).toContain("prp_body — 1m × 700mm × 600mm");
  });

  it("uses one shared scale so a part is the same size in every view", () => {
    // A 10:1 scene must not be normalised per-view; the flat axis has to
    // read as flat. Comparing the drawn heights of the same part in two
    // views is the assertion that catches per-view fitting.
    const flat = census([part("p", [0, 0, 0], [10, 10, 1])]);
    const svg = renderOrthoSvg(flat, { size: 300 });
    const heights = [...svg.matchAll(/<rect[^>]*height="([\d.]+)"[^>]*class="part"/g)].map((m) =>
      Number(m[1]),
    );
    // Plan shows 10 units tall; front and side show 1 unit tall.
    expect(Math.max(...heights) / Math.min(...heights)).toBeCloseTo(10, 1);
  });

  it("draws the ground line only where height is shown", () => {
    const svg = renderOrthoSvg(scene);
    // Two elevations carry z=0; the plan view has no height axis.
    expect([...svg.matchAll(/z=0/g)]).toHaveLength(2);
  });

  it("is byte-identical across runs", () => {
    expect(renderOrthoSvg(scene)).toBe(renderOrthoSvg(scene));
  });

  it("escapes part names rather than letting them break the document", () => {
    const nasty = census([part('a"><script>x</script>', [0, 0, 0], [1, 1, 1])]);
    const svg = renderOrthoSvg(nasty, { labelParts: true });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("degrades to a statement rather than an empty drawing", () => {
    expect(renderOrthoSvg(census([]))).toContain("empty scene");
    expect(orthoDimensions(census([]))).toBe("empty scene");
  });

  it("tabulates every part with units on every number", () => {
    const table = orthoDimensions(scene);
    expect(table).toContain("prp_base");
    expect(table).toContain("prp_body");
    // A dimension without a unit is the classic drawing error.
    for (const line of table.split("\n").slice(1)) {
      expect(line).toMatch(/(mm|m)\b/);
    }
  });
});

describe("changeImpact", () => {
  const before = census(
    [part("a", [0, 0, 0], [1, 1, 1]), part("b", [0, 0, 1], [1, 1, 1])],
    [{ a: "a", b: "b", gap: [-1, -1, 0], separation: 0, intersects: true }],
  );

  it("reports nothing changed rather than eight empty arrays", () => {
    const report = changeImpact(before, before, [], []);
    expect(report.unchanged).toBe(true);
    expect(formatImpact(report)).toBe("no change since the previous compile");
  });

  /*
   * The case this module exists for: one part moves, and a relationship on
   * a part nobody touched changes. Nothing about `b`'s own numbers differs.
   */
  it("catches a contact broken by moving the OTHER part", () => {
    const after = census(
      [part("a", [0, 0, -5], [1, 1, 1]), part("b", [0, 0, 1], [1, 1, 1])],
      [],
    );
    const report = changeImpact(before, after, [], []);
    expect(report.partsMoved.map((m) => m.part)).toEqual(["a"]);
    expect(report.contactsBroken).toHaveLength(1);
    expect(report.contactsBroken[0]).toMatchObject({ a: "a", b: "b", before: 0 });
    expect(formatImpact(report)).toContain("contact BROKEN");
  });

  it("does not read a reordered contact pair as broken and remade", () => {
    // Same relationship, reported with the operands the other way round.
    const after = census(
      [part("a", [0, 0, 0], [1, 1, 1]), part("b", [0, 0, 1], [1, 1, 1])],
      [{ a: "b", b: "a", gap: [-1, -1, 0], separation: 0, intersects: true }],
    );
    const report = changeImpact(before, after, [], []);
    expect(report.contactsBroken).toEqual([]);
    expect(report.contactsMade).toEqual([]);
    expect(report.unchanged).toBe(true);
  });

  it("ignores float noise below a millimetre", () => {
    const after = census(
      [part("a", [0, 0, 0.0000001], [1, 1, 1]), part("b", [0, 0, 1], [1, 1, 1])],
      [{ a: "a", b: "b", gap: [-1, -1, 0], separation: 0, intersects: true }],
    );
    expect(changeImpact(before, after, [], []).partsMoved).toEqual([]);
  });

  it("separates a resize from a move", () => {
    const after = census(
      [part("a", [0, 0, 0], [2, 1, 1]), part("b", [0, 0, 1], [1, 1, 1])],
      [{ a: "a", b: "b", gap: [-1, -1, 0], separation: 0, intersects: true }],
    );
    const report = changeImpact(before, after, [], []);
    expect(report.partsResized).toEqual(["a"]);
  });

  it("tracks issues appearing and resolving by code AND target", () => {
    const report = changeImpact(
      before,
      before,
      [issue("S3D-E-324", "a"), issue("S3D-W-341", "m")],
      [issue("S3D-E-324", "b"), issue("S3D-W-341", "m")],
    );
    expect(report.issuesAppeared).toEqual([{ code: "S3D-E-324", target: "b" }]);
    expect(report.issuesResolved).toEqual([{ code: "S3D-E-324", target: "a" }]);
  });

  it("treats a first compile as everything added, not as a broken diff", () => {
    const report = changeImpact(undefined, before, [], []);
    expect(report.partsAdded).toEqual(["a", "b"]);
    expect(report.partsRemoved).toEqual([]);
    expect(report.unchanged).toBe(false);
  });

  it("orders moves by distance so the biggest change reads first", () => {
    const after = census([part("a", [0, 0, -5], [1, 1, 1]), part("b", [0, 0, 1.5], [1, 1, 1])]);
    const report = changeImpact(before, after, [], []);
    expect(report.partsMoved.map((m) => m.part)).toEqual(["a", "b"]);
  });
});
