import { describe, expect, it } from "vitest";
import { Rng } from "../src/solve/rng.js";
import { validateSceneSpec, specDeclarationLines } from "../src/solve/validate.js";
import { findCoplanarFaces, solveScene } from "../src/solve/solver.js";
import { emitBlenderScript } from "../src/solve/emit-bpy.js";
import { lintClaims } from "../src/lint/claims.js";
import { MIN_CONTACT, SceneSpec } from "../src/solve/types.js";
import { ISSUE_CODES } from "../src/errors.js";
import type { Census, Issue } from "../src/types.js";

/**
 * The declarative language, end to end without Blender: schema validation,
 * repeat expansion, shape emission, and claims adjudication are all pure,
 * so every rule of the language is pinned here at unit cost. The real-
 * Blender complement lives in spec-pipeline.test.ts.
 */

function colonnade(): SceneSpec {
  return {
    schemaVersion: 1,
    materials: {
      mtl_stone: { baseColor: [0.6, 0.6, 0.58], roughness: 0.9 },
      mtl_brass: { baseColor: [0.85, 0.65, 0.3], roughness: 0.3, metallic: 1 },
    },
    parts: [
      { id: "prp_plinth", size: [3, 1, 0.1], material: "mtl_stone" },
      { id: "prp_column", size: [0.2, 0.2, 1.5], shape: "cylinder", material: "mtl_stone" },
      { id: "prp_orb", size: [0.3, 0.3, 0.3], shape: "sphere", material: "mtl_brass" },
    ],
    relations: [
      { type: "at", part: "prp_plinth", center: [0, 0, 0.05] },
      { type: "sits_on", part: "prp_column", on: "prp_plinth" },
      { type: "inset_from", part: "prp_column", from: "prp_plinth", faces: ["x-"], by: 0.2 },
      { type: "align", part: "prp_column", to: "prp_plinth", axes: ["y"] },
      { type: "repeat", part: "prp_column", count: 4, along: "x", every: 0.8 },
      { type: "sits_on", part: "prp_orb", on: "prp_plinth" },
      { type: "align", part: "prp_orb", to: "prp_plinth", axes: ["x", "y"] },
    ],
  };
}

describe("validateSceneSpec", () => {
  it("accepts the colonnade and round-trips its content", () => {
    const { spec, errors } = validateSceneSpec(colonnade());
    expect(errors).toEqual([]);
    expect(spec!.parts).toHaveLength(3);
    expect(spec!.materials!.mtl_brass!.metallic).toBe(1);
  });

  it("names the JSON path of every error and collects them all", () => {
    const { spec, errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [
        { id: "prp_ok", size: [1, 1, 1] },
        { id: "prp_bad", size: [1, -1, 1] },
        { id: "prp_worse", size: [1, 1, 1], shape: "dodecahedron" },
      ],
      relations: [{ type: "teleport", part: "prp_ok" }],
    });
    expect(spec).toBeUndefined();
    expect(errors.some((e) => e.includes("parts[1].size[1]"))).toBe(true);
    expect(errors.some((e) => e.includes("parts[2].shape"))).toBe(true);
    expect(errors.some((e) => e.includes("relations[0].type"))).toBe(true);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects a part referencing an undeclared material", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [1, 1, 1], material: "mtl_ghost" }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(errors.some((e) => e.includes("mtl_ghost") && e.includes("not declared"))).toBe(true);
  });

  it("rejects in-between metallic with the reason", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      materials: { mtl_x: { baseColor: [1, 1, 1], metallic: 0.5 } },
      parts: [{ id: "prp_a", size: [1, 1, 1], material: "mtl_x" }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(errors.some((e) => e.includes("metallic must be 0 or 1"))).toBe(true);
  });

  it("rejects a torus whose tube does not fit its ring", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_ring", size: [0.4, 0.4, 0.3], shape: "torus" }],
      relations: [{ type: "at", part: "prp_ring", center: [0, 0, 0.15] }],
    });
    expect(errors.some((e) => e.includes("torus tube"))).toBe(true);
  });

  it("rejects a non-circular torus cross-section", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [{ id: "prp_ring", size: [0.6, 0.5, 0.1], shape: "torus" }],
      relations: [{ type: "at", part: "prp_ring", center: [0, 0, 0.05] }],
    });
    expect(errors.some((e) => e.includes("must be circular"))).toBe(true);
  });

  it("rejects duplicate part ids", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      parts: [
        { id: "prp_a", size: [1, 1, 1] },
        { id: "prp_a", size: [2, 2, 2] },
      ],
      relations: [],
    });
    expect(errors.some((e) => e.includes("declared twice"))).toBe(true);
  });

  it("finds the declaration line of parts and materials", () => {
    const text = JSON.stringify(colonnade(), null, 2);
    const lines = specDeclarationLines(text);
    expect(lines.prp_column).toBeGreaterThan(0);
    expect(lines.mtl_brass).toBeGreaterThan(0);
    const rows = text.split("\n");
    expect(rows[lines.prp_column! - 1]).toContain('"prp_column"');
    expect(rows[lines.mtl_brass! - 1]).toContain('"mtl_brass"');
  });
});

describe("repeat expansion", () => {
  it("expands a solved base into pitched instances that keep the language's guarantees", () => {
    const solved = solveScene(colonnade());
    expect(solved.diagnostics).toEqual([]);
    const columns = solved.parts.filter((p) => p.id.startsWith("prp_column"));
    expect(columns.map((p) => p.id).sort()).toEqual([
      "prp_column",
      "prp_column_2",
      "prp_column_3",
      "prp_column_4",
    ]);
    const xs = columns.map((p) => p.center[0]).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBeCloseTo(0.8, 9);
    expect(xs[3]! - xs[2]!).toBeCloseTo(0.8, 9);
    // Instances inherit shape and material, and record their base.
    const clone = columns.find((p) => p.id === "prp_column_3")!;
    expect(clone.shape).toBe("cylinder");
    expect(clone.material).toBe("mtl_stone");
    expect(clone.from).toBe("prp_column");
    // And the scene still cannot z-fight.
    expect(findCoplanarFaces(solved)).toEqual([]);
  });

  it("composes two repeats on one part into a grid", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_slab", size: [4, 4, 0.1] },
        { id: "prp_peg", size: [0.1, 0.1, 0.3] },
      ],
      relations: [
        { type: "at", part: "prp_slab", center: [0, 0, 0.05] },
        { type: "sits_on", part: "prp_peg", on: "prp_slab" },
        { type: "inset_from", part: "prp_peg", from: "prp_slab", faces: ["x-", "y-"], by: 0.2 },
        { type: "repeat", part: "prp_peg", count: 3, along: "x", every: 1 },
        { type: "repeat", part: "prp_peg", count: 2, along: "y", every: 1.5 },
      ],
    };
    const solved = solveScene(spec);
    expect(solved.diagnostics).toEqual([]);
    const pegs = solved.parts.filter((p) => p.id.startsWith("prp_peg"));
    expect(pegs).toHaveLength(6);
    const key = (p: { center: [number, number, number] }) =>
      `${p.center[0].toFixed(3)},${p.center[1].toFixed(3)}`;
    expect(new Set(pegs.map(key)).size).toBe(6);
  });

  it("floors a face-flush pitch instead of emitting z-fighting neighbours", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [{ id: "prp_brick", size: [0.5, 0.2, 0.1] }],
      relations: [
        { type: "at", part: "prp_brick", center: [0, 0, 0.05] },
        { type: "repeat", part: "prp_brick", count: 3, along: "x", every: 0.5 },
      ],
    };
    const solved = solveScene(spec);
    expect(solved.diagnostics.map((d) => d.code)).toContain("SOLVE-EPSILON-FLOOR");
    const bricks = solved.parts.sort((a, b) => a.center[0] - b.center[0]);
    expect(bricks[1]!.center[0] - bricks[0]!.center[0]).toBeCloseTo(0.5 + MIN_CONTACT, 9);
    expect(findCoplanarFaces(solved)).toEqual([]);
  });

  it("reports a minted id colliding with an authored part", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_a", size: [0.2, 0.2, 0.2] },
        { id: "prp_a_2", size: [1, 1, 1] },
      ],
      relations: [
        { type: "at", part: "prp_a", center: [0, 0, 0.1] },
        { type: "at", part: "prp_a_2", center: [5, 0, 0.5] },
        { type: "repeat", part: "prp_a", count: 2, along: "x", every: 1 },
      ],
    };
    const solved = solveScene(spec);
    expect(solved.diagnostics.map((d) => d.code)).toContain("SOLVE-CONFLICT");
  });

  it("refuses a repeat that would blow the part ceiling", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [{ id: "prp_a", size: [0.1, 0.1, 0.1] }],
      relations: [
        { type: "at", part: "prp_a", center: [0, 0, 0.05] },
        { type: "repeat", part: "prp_a", count: 150, along: "x", every: 0.2 },
        { type: "repeat", part: "prp_a", count: 150, along: "y", every: 0.2 },
      ],
    };
    const solved = solveScene(spec);
    expect(solved.diagnostics.map((d) => d.code)).toContain("SOLVE-LIMIT");
  });
});

describe("shape emission", () => {
  it("emits each shape with its axis and applied transforms", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_beam", size: [2, 0.1, 0.1], shape: "cylinder", axis: "x" },
        { id: "prp_spike", size: [0.2, 0.2, 0.4], shape: "cone", flip: true },
        { id: "prp_ring", size: [0.6, 0.6, 0.1], shape: "torus" },
      ],
      relations: [
        { type: "at", part: "prp_beam", center: [0, 0, 1] },
        { type: "at", part: "prp_spike", center: [1, 0, 0.2] },
        { type: "at", part: "prp_ring", center: [-1, 0, 0.05] },
      ],
    };
    const script = emitBlenderScript(solveScene(spec));
    expect(script).toContain('_part("prp_beam", "cylinder", (2, 0.1, 0.1), (0, 0, 1), "x", False)');
    expect(script).toContain('_part("prp_spike", "cone", (0.2, 0.2, 0.4), (1, 0, 0.2), "z", True)');
    expect(script).toContain('_part("prp_ring", "torus"');
    // Caps are trifans so generated geometry can never trip the ngon rule.
    expect(script.match(/end_fill_type="TRIFAN"/g)).toHaveLength(2);
  });

  it("emits authored material specs, emission and alpha included", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      materials: {
        mtl_lamp: {
          baseColor: [1, 0.9, 0.7],
          roughness: 0.4,
          emission: [1, 0.85, 0.6],
          emissionStrength: 5,
        },
        mtl_glass: { baseColor: [0.8, 0.9, 1], roughness: 0.05, alpha: 0.3 },
      },
      parts: [
        { id: "prp_bulb", size: [0.2, 0.2, 0.2], shape: "sphere", material: "mtl_lamp" },
        { id: "prp_pane", size: [1, 0.02, 1], material: "mtl_glass" },
      ],
      relations: [
        { type: "at", part: "prp_bulb", center: [0, 0, 1] },
        { type: "at", part: "prp_pane", center: [0, 1, 0.5] },
      ],
    };
    const { spec: valid } = validateSceneSpec(spec);
    const script = emitBlenderScript(solveScene(valid!), { materials: valid!.materials! });
    expect(script).toContain('"emission": (1, 0.85, 0.6, 1)');
    expect(script).toContain('"emission_strength": 5');
    expect(script).toContain('"alpha": 0.3');
    expect(script).toContain('"base_color": (0.8, 0.9, 1, 0.3)');
  });

  it("steers the camera without replacing the derived framing", () => {
    const spec = colonnade();
    const front = emitBlenderScript(solveScene(spec), { camera: { azimuthDeg: 0 } });
    const threeQ = emitBlenderScript(solveScene(spec), { camera: {} });
    expect(front).not.toBe(threeQ);
    expect(front).toContain('cam.name = "cam_hero"');
  });

  it("emits a sun for outdoor lighting", () => {
    const script = emitBlenderScript(solveScene(colonnade()), { light: "sun" });
    expect(script).toContain('type="SUN"');
  });

  it("stays byte-stable for an unchanged spec, repeats and shapes included", () => {
    const a = emitBlenderScript(solveScene(colonnade()));
    const b = emitBlenderScript(solveScene(colonnade()));
    expect(a).toBe(b);
  });
});

describe("Rng (path-addressed)", () => {
  it("is deterministic and stays in [0, 1)", () => {
    const a = new Rng(7).at("scatter/prp_rock");
    const b = new Rng(7).at("scatter/prp_rock");
    for (let i = 0; i < 100; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("KNOWN ANSWER: the first draws for seed 7 at 'k' are pinned", () => {
    // Any metric used as evidence needs a known-answer test — a randomness
    // source doubly so. These literals pin the exact bit-level behaviour
    // of the hash and the generator; a platform or refactor that changes
    // them changes every scattered scene on disk.
    const rng = new Rng(7).at("k");
    const draws = [rng.next(), rng.next(), rng.next()];
    expect(draws).toEqual([0.11132319500404175, 0.6377507481439104, 0.31257054802892126]);
  });

  it("is path-addressed, not counter-addressed", () => {
    // Kiln's property, verbatim: how much a SIBLING stream draws must not
    // move this stream. seed+counter schemes fail exactly this.
    const quiet = new Rng(3);
    const busy = new Rng(3);
    const sibling = busy.at("hair");
    for (let i = 0; i < 57; i++) sibling.next();
    expect(busy.at("freckles").next()).toBe(quiet.at("freckles").next());
  });

  it("distinguishes paths, seeds, and seed types", () => {
    expect(new Rng(1).at("a").next()).not.toBe(new Rng(1).at("b").next());
    expect(new Rng(1).at("a").next()).not.toBe(new Rng(2).at("a").next());
    expect(new Rng(1).at("a").next()).not.toBe(new Rng("1").at("a").next());
    // Nested derivation is not string concatenation.
    expect(new Rng(1).at("a").at("b").next()).not.toBe(new Rng(1).at("ab").next());
  });
});

describe("scatter", () => {
  const garden = (extra: { parts?: SceneSpec["parts"]; relations?: SceneSpec["relations"] } = {}): SceneSpec => ({
    schemaVersion: 1,
    parts: [
      { id: "prp_slab", size: [3, 3, 0.1] },
      { id: "prp_rock", size: [0.25, 0.25, 0.18], shape: "sphere" },
      ...(extra.parts ?? []),
    ],
    relations: [
      { type: "at", part: "prp_slab", center: [0, 0, 0.05] },
      { type: "scatter", part: "prp_rock", on: "prp_slab", count: 12, seed: 7, minGap: 0.02, sizeJitter: 0.3 },
      ...(extra.relations ?? []),
    ],
  });

  it("places exactly count instances, all on the support, none touching", () => {
    const solved = solveScene(garden());
    expect(solved.diagnostics).toEqual([]);
    const rocks = solved.parts.filter((p) => p.id.startsWith("prp_rock"));
    expect(rocks).toHaveLength(12);
    for (const rock of rocks) {
      // Fully on the slab footprint…
      expect(rock.center[0] - rock.size[0] / 2).toBeGreaterThanOrEqual(-1.5);
      expect(rock.center[0] + rock.size[0] / 2).toBeLessThanOrEqual(1.5);
      expect(rock.center[1] - rock.size[1] / 2).toBeGreaterThanOrEqual(-1.5);
      expect(rock.center[1] + rock.size[1] / 2).toBeLessThanOrEqual(1.5);
      // …and embedded 1mm into its top, like sits_on.
      expect(rock.center[2] - rock.size[2] / 2).toBeCloseTo(0.1 - 0.001, 9);
    }
    // Pairwise: at least minGap of clear air on some horizontal axis.
    for (let i = 0; i < rocks.length; i++) {
      for (let j = i + 1; j < rocks.length; j++) {
        const a = rocks[i]!;
        const b = rocks[j]!;
        const sepX = Math.abs(a.center[0] - b.center[0]) - (a.size[0] + b.size[0]) / 2;
        const sepY = Math.abs(a.center[1] - b.center[1]) - (a.size[1] + b.size[1]) / 2;
        expect(Math.max(sepX, sepY)).toBeGreaterThanOrEqual(0.02 - 1e-9);
      }
    }
    expect(findCoplanarFaces(solved)).toEqual([]);
  });

  it("jitters size within the declared bound", () => {
    const rocks = solveScene(garden()).parts.filter((p) => p.id.startsWith("prp_rock"));
    const scales = rocks.map((r) => r.size[0] / 0.25);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(0.7);
    expect(Math.max(...scales)).toBeLessThanOrEqual(1.3);
    // With 12 draws at 30% jitter, identical sizes would mean the jitter
    // is not actually applied.
    expect(new Set(scales.map((s) => s.toFixed(6))).size).toBeGreaterThan(1);
  });

  it("is deterministic and immune to unrelated additions", () => {
    const before = solveScene(garden()).parts.filter((p) => p.id.startsWith("prp_rock"));
    // Add an unrelated part AND an unrelated relation. seed+counter RNG
    // fails this; path-addressed RNG cannot.
    const after = solveScene(
      garden({
        parts: [{ id: "prp_bench", size: [0.8, 0.3, 0.4] }],
        relations: [
          { type: "sits_on", part: "prp_bench", on: "prp_slab" },
          { type: "align", part: "prp_bench", to: "prp_slab", axes: ["x", "y"] },
        ],
      }),
    ).parts.filter((p) => p.id.startsWith("prp_rock"));
    expect(after).toEqual(before);
  });

  it("changes layout with the seed", () => {
    const a = solveScene(garden()).parts.filter((p) => p.id.startsWith("prp_rock"));
    const spec = garden();
    (spec.relations[1] as { seed: number }).seed = 8;
    const b = solveScene(spec).parts.filter((p) => p.id.startsWith("prp_rock"));
    expect(b.map((p) => p.center)).not.toEqual(a.map((p) => p.center));
  });

  it("fails loudly when the region cannot fit the count", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_slab", size: [0.6, 0.6, 0.1] },
        { id: "prp_rock", size: [0.25, 0.25, 0.18] },
      ],
      relations: [
        { type: "at", part: "prp_slab", center: [0, 0, 0.05] },
        { type: "scatter", part: "prp_rock", on: "prp_slab", count: 40, seed: 1 },
      ],
    };
    const solved = solveScene(spec);
    expect(solved.diagnostics.map((d) => d.code)).toContain("SOLVE-LIMIT");
    // No partial scatter sneaks into the scene.
    expect(solved.parts.filter((p) => p.id.startsWith("prp_rock"))).toHaveLength(0);
  });

  it("keeps two scatters on one support clear of each other", () => {
    const solved = solveScene(
      garden({
        parts: [{ id: "prp_tuft", size: [0.1, 0.1, 0.2], shape: "cone" }],
        relations: [
          { type: "scatter", part: "prp_tuft", on: "prp_slab", count: 10, seed: 3, minGap: 0.02 },
        ],
      }),
    );
    expect(solved.diagnostics).toEqual([]);
    const all = solved.parts.filter((p) => p.id !== "prp_slab");
    expect(all).toHaveLength(22);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!;
        const b = all[j]!;
        const sepX = Math.abs(a.center[0] - b.center[0]) - (a.size[0] + b.size[0]) / 2;
        const sepY = Math.abs(a.center[1] - b.center[1]) - (a.size[1] + b.size[1]) / 2;
        expect(Math.max(sepX, sepY), `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(0.02 - 1e-9);
      }
    }
  });

  it("records the base part for provenance on every instance", () => {
    const rocks = solveScene(garden()).parts.filter((p) => p.from === "prp_rock");
    expect(rocks).toHaveLength(11);
  });
});

describe("lintClaims", () => {
  const censusOf = (over: Partial<Census>): Census =>
    ({
      blenderVersion: "5.0",
      sceneName: "Scene",
      upAxis: "Z",
      objects: [],
      meshes: [],
      materials: [],
      textures: [],
      uvObjectsWithoutLayers: [],
      objectsWithoutMaterial: [],
      zFightingPairs: [],
      camera: { present: true, name: "cam_hero" },
      lightCount: 1,
      animation: { fps: 24, frameStart: 1, frameEnd: 1, keyframedObjects: [] },
      offCameraObjects: [],
      ...over,
    }) as Census;

  const mesh = (
    object: string,
    over: Partial<Census["meshes"][number]> = {},
  ): Census["meshes"][number] => ({
    object,
    verts: 8,
    faces: 6,
    tris: 12,
    ngons: 0,
    nonManifoldEdges: 0,
    zeroAreaFaces: 0,
    nan: false,
    uvLayers: [],
    materials: ["mtl_stone"],
    spatial: {
      worldMin: [-0.5, -0.5, 0],
      worldMax: [0.5, 0.5, 1],
      size: [1, 1, 1],
      bboxCenter: [0, 0, 0.5],
      centroid: [0, 0, 0.5],
      groundGap: 0,
    },
    ...over,
  });

  const run = (claims: Parameters<typeof lintClaims>[0], census: Census | undefined) => {
    const issues: Issue[] = [];
    lintClaims(claims, census, issues);
    return issues;
  };

  it("passes silently when every claim holds", () => {
    const census = censusOf({ meshes: [mesh("prp_a"), mesh("prp_b")] });
    expect(
      run(
        {
          parts: 2,
          maxTriangles: 24,
          grounded: true,
          maxHeight: 1,
          footprint: [1, 1],
          watertight: true,
          materialsUsed: ["mtl_stone"],
        },
        census,
      ),
    ).toEqual([]);
  });

  it("fails a wrong part count with both numbers", () => {
    const issues = run({ parts: 3 }, censusOf({ meshes: [mesh("prp_a")] }));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe(ISSUE_CODES.CLAIM_FAILED);
    expect(issues[0]!.severity).toBe("error");
    expect(issues[0]!.message).toContain("1 mesh parts, not 3");
  });

  it("fails a blown triangle budget with the measured total", () => {
    const issues = run(
      { maxTriangles: 20 },
      censusOf({ meshes: [mesh("prp_a"), mesh("prp_b", { tris: 100 })] }),
    );
    expect(issues[0]!.message).toContain("112 triangles");
  });

  it("fails grounding per sunken part, naming it", () => {
    const sunk = mesh("prp_buried", {
      spatial: {
        worldMin: [-0.5, -0.5, -0.2],
        worldMax: [0.5, 0.5, 0.8],
        size: [1, 1, 1],
        bboxCenter: [0, 0, 0.3],
        centroid: [0, 0, 0.3],
        groundGap: -0.2,
      },
    });
    const issues = run({ grounded: true }, censusOf({ meshes: [mesh("prp_ok"), sunk] }));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.target).toBe("prp_buried");
  });

  it("fails height and footprint against the union of all parts", () => {
    const tall = mesh("prp_tower", {
      spatial: {
        worldMin: [2, 2, 0],
        worldMax: [3, 3, 5],
        size: [1, 1, 5],
        bboxCenter: [2.5, 2.5, 2.5],
        centroid: [2.5, 2.5, 2.5],
        groundGap: 0,
      },
    });
    const issues = run({ maxHeight: 2, footprint: [2, 2] }, censusOf({ meshes: [mesh("prp_a"), tall] }));
    const claims = issues.map((i) => (i.detail as { claim: string }).claim).sort();
    expect(claims).toEqual(["footprint", "footprint", "maxHeight"]);
  });

  it("fails watertight on non-manifold edges", () => {
    const issues = run(
      { watertight: true },
      censusOf({ meshes: [mesh("prp_open", { nonManifoldEdges: 4 })] }),
    );
    expect(issues[0]!.message).toContain("4 non-manifold edges");
  });

  it("fails a claimed material bound to nothing", () => {
    const issues = run({ materialsUsed: ["mtl_ghost"] }, censusOf({ meshes: [mesh("prp_a")] }));
    expect(issues[0]!.target).toBe("mtl_ghost");
  });

  it("reports every claim as unchecked when there is no census — never as passed", () => {
    const issues = run({ parts: 1, grounded: true }, undefined);
    expect(issues).toHaveLength(2);
    for (const issue of issues) {
      expect(issue.code).toBe(ISSUE_CODES.CLAIM_UNCHECKED);
      expect(issue.severity).toBe("warning");
    }
  });

  it("reports maxTriangles unchecked when the census lacks triangle counts", () => {
    const legacy = mesh("prp_a");
    delete (legacy as { tris?: number }).tris;
    const issues = run({ maxTriangles: 100 }, censusOf({ meshes: [legacy] }));
    expect(issues[0]!.code).toBe(ISSUE_CODES.CLAIM_UNCHECKED);
  });
});
