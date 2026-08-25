import { describe, expect, it } from "vitest";
import {
  classifySolveDelta,
  snapshotSolve,
  solveDeltaIsEmpty,
  type SolveSnapshot,
  type SolveSnapshotPart,
} from "../src/read/solve-delta.js";
import { solveScene } from "../src/solve/solver.js";
import { hashJson } from "../src/build/blender.js";
import type { SceneSpec } from "../src/solve/types.js";

/**
 * The codec pass, tested from both directions: real solves through the real
 * solver for the classes that occur in nature (authored, propagated,
 * steady), and hand-crafted snapshots for the class that by design should
 * NOT occur (residuals — the solver changing its answer under an unchanged
 * declaration), since a correct compiler cannot be made to produce one.
 */

function crate(postHeight = 0.5): SceneSpec {
  return {
    schemaVersion: 1,
    parts: [
      { id: "prp_crate_base", size: [0.9, 0.6, 0.08], material: "mtl_wood", role: "base" },
      { id: "prp_post_nw", size: [0.05, 0.05, postHeight], material: "mtl_wood", role: "post" },
      { id: "prp_post_ne", size: [0.05, 0.05, postHeight], material: "mtl_wood", role: "post" },
      { id: "prp_slat", size: [0.1, 0.02, 0.12], material: "mtl_wood", role: "slat" },
      { id: "prp_lid", size: [0.92, 0.62, 0.06], material: "mtl_wood", role: "lid" },
    ],
    relations: [
      { type: "at", part: "prp_crate_base", center: [0, 0, 0.04] },
      { type: "sits_on", part: "prp_post_nw", on: "prp_crate_base", embed: 0.006 },
      { type: "inset_from", part: "prp_post_nw", from: "prp_crate_base", faces: ["x-", "y-"], by: 0.004 },
      { type: "sits_on", part: "prp_post_ne", on: "prp_crate_base", embed: 0.006 },
      { type: "inset_from", part: "prp_post_ne", from: "prp_crate_base", faces: ["x+", "y-"], by: 0.004 },
      { type: "span", part: "prp_slat", from: "prp_post_nw", to: "prp_post_ne", axis: "x", embed: 0.003 },
      { type: "align", part: "prp_slat", to: "prp_post_nw", axes: ["y"] },
      { type: "sits_on", part: "prp_slat", on: "prp_crate_base", embed: 0.002 },
      { type: "above", part: "prp_lid", over: "prp_post_nw", clearance: 0.002 },
      { type: "align", part: "prp_lid", to: "prp_crate_base", axes: ["x", "y"] },
    ],
  } as SceneSpec;
}

function snap(spec: SceneSpec): SolveSnapshot {
  const solved = solveScene(spec);
  expect(solved.diagnostics).toEqual([]);
  return snapshotSolve(spec, solved, {}, hashJson);
}

describe("snapshotSolve", () => {
  it("is byte-deterministic across identical solves", () => {
    expect(JSON.stringify(snap(crate()))).toBe(JSON.stringify(snap(crate())));
  });

  it("carries dependency edges from every relation that names the part", () => {
    const s = snap(crate());
    const byId = new Map(s.parts.map((p) => [p.id, p]));
    // The slat reads both posts (span) AND the base (sits_on).
    expect(byId.get("prp_slat")!.deps).toEqual([
      "prp_crate_base",
      "prp_post_ne",
      "prp_post_nw",
    ]);
    // The lid reads the post it hovers over and the base it aligns to.
    expect(byId.get("prp_lid")!.deps).toEqual(["prp_crate_base", "prp_post_nw"]);
    // The base reads nothing — `at` names only coordinates.
    expect(byId.get("prp_crate_base")!.deps).toBeUndefined();
  });

  it("gives repeat clones their base's fingerprint plus a base dependency", () => {
    const spec: SceneSpec = {
      schemaVersion: 1,
      parts: [
        { id: "prp_floor", size: [4, 1, 0.1] },
        { id: "prp_column", size: [0.2, 0.2, 1] },
      ],
      relations: [
        { type: "at", part: "prp_floor", center: [0, 0, 0.05] },
        { type: "sits_on", part: "prp_column", on: "prp_floor" },
        { type: "repeat", part: "prp_column", count: 3, along: "x", every: 1 },
      ],
    } as SceneSpec;
    const s = snapshotSolve(spec, solveScene(spec), {}, hashJson);
    const base = s.parts.find((p) => p.id === "prp_column")!;
    const clone = s.parts.find((p) => p.id !== "prp_column" && p.id.startsWith("prp_column"))!;
    expect(clone.fingerprint).toBe(base.fingerprint);
    expect(clone.deps).toContain("prp_column");
    expect(clone.deps).toContain("prp_floor");
  });
});

describe("classifySolveDelta", () => {
  it("reads an unchanged scene as entirely steady", () => {
    const delta = classifySolveDelta(snap(crate()), snap(crate()))!;
    expect(delta.steady).toBe(5);
    expect(solveDeltaIsEmpty(delta)).toBe(true);
  });

  it("classifies an edit as authored and its consequences as propagated", () => {
    // Taller posts: the posts are the edit; the lid rides up on them
    // (propagated); the base and slat neither changed nor moved (steady).
    const delta = classifySolveDelta(snap(crate(0.5)), snap(crate(0.6)))!;
    expect(delta.authored).toEqual(["prp_post_ne", "prp_post_nw"]);
    expect(delta.propagated).toEqual(["prp_lid"]);
    expect(delta.residuals).toEqual([]);
    expect(delta.steady).toBe(2);
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
  });

  it("compresses a whole-assembly move to one authored part plus propagation", () => {
    // Moving only the base's `at` moves everything else through the graph:
    // one authored line, four predicted moves, zero residual noise. This is
    // the codec claim itself.
    const moved = crate();
    (moved.relations![0] as { center: number[] }).center = [1, 0, 0.04];
    const delta = classifySolveDelta(snap(crate()), snap(moved))!;
    expect(delta.authored).toEqual(["prp_crate_base"]);
    expect(delta.propagated.sort()).toEqual([
      "prp_lid",
      "prp_post_ne",
      "prp_post_nw",
      "prp_slat",
    ]);
    expect(delta.residuals).toEqual([]);
  });

  it("counts additions and removals and lets a removal explain movement", () => {
    const prev: SolveSnapshot = {
      basis: "b",
      parts: [
        { id: "prp_gone", center: [0, 0, 0], size: [1, 1, 1], fingerprint: "g" },
        { id: "prp_rider", center: [0, 0, 1], size: [1, 1, 1], fingerprint: "r", deps: ["prp_gone"] },
      ],
    };
    const next: SolveSnapshot = {
      basis: "b",
      parts: [
        // Moved because its support vanished — explained, not a residual.
        { id: "prp_rider", center: [0, 0, 0.5], size: [1, 1, 1], fingerprint: "r", deps: ["prp_gone"] },
        { id: "prp_new", center: [2, 0, 0], size: [1, 1, 1], fingerprint: "n" },
      ],
    };
    const delta = classifySolveDelta(prev, next)!;
    expect(delta.removed).toEqual(["prp_gone"]);
    expect(delta.added).toEqual(["prp_new"]);
    expect(delta.propagated).toEqual(["prp_rider"]);
    expect(delta.residuals).toEqual([]);
  });

  it("reports an unexplained move as a drift residual", () => {
    const part = (over: Partial<SolveSnapshotPart>): SolveSnapshotPart => ({
      id: "prp_a",
      center: [0, 0, 0],
      size: [1, 1, 1],
      fingerprint: "same",
      ...over,
    });
    const delta = classifySolveDelta(
      { basis: "b", parts: [part({})] },
      { basis: "b", parts: [part({ center: [0, 0, 0.25] })] },
    )!;
    expect(delta.residuals).toEqual([{ id: "prp_a", kind: "drift" }]);
    expect(delta.propagated).toEqual([]);
  });

  it("reports an unexplained support switch as a support residual", () => {
    const mk = (restsOn: string): SolveSnapshot => ({
      basis: "b",
      parts: [
        { id: "prp_a", center: [0, 0, 1], size: [1, 1, 1], fingerprint: "same", restsOn },
      ],
    });
    const delta = classifySolveDelta(mk("prp_x"), mk("prp_y"))!;
    expect(delta.residuals).toEqual([
      { id: "prp_a", kind: "support", from: "prp_x", to: "prp_y" },
    ]);
  });

  it("lets an authored dependency absorb a support switch into propagation", () => {
    const mk = (restsOn: string, depFp: string): SolveSnapshot => ({
      basis: "b",
      parts: [
        { id: "prp_dep", center: [0, 0, 0], size: [1, 1, 1], fingerprint: depFp },
        {
          id: "prp_a",
          center: [0, 0, 1],
          size: [1, 1, 1],
          fingerprint: "same",
          restsOn,
          deps: ["prp_dep"],
        },
      ],
    });
    const delta = classifySolveDelta(mk("prp_x", "v1"), mk("prp_y", "v2"))!;
    expect(delta.authored).toEqual(["prp_dep"]);
    expect(delta.propagated).toEqual(["prp_a"]);
    expect(delta.residuals).toEqual([]);
  });

  it("propagates explanation transitively through the dependency chain", () => {
    const chain = (fpA: string, zTop: number): SolveSnapshot => ({
      basis: "b",
      parts: [
        { id: "prp_a", center: [0, 0, 0], size: [1, 1, 1], fingerprint: fpA },
        { id: "prp_b", center: [0, 0, 1], size: [1, 1, 1], fingerprint: "fb", deps: ["prp_a"] },
        { id: "prp_c", center: [0, 0, zTop], size: [1, 1, 1], fingerprint: "fc", deps: ["prp_b"] },
      ],
    });
    const delta = classifySolveDelta(chain("v1", 2), chain("v2", 2.5))!;
    expect(delta.authored).toEqual(["prp_a"]);
    // prp_c moved and its ONLY link to the edit is through prp_b, which did
    // not itself move — the closure, not the movement, carries explanation.
    expect(delta.propagated).toEqual(["prp_c"]);
    expect(delta.residuals).toEqual([]);
  });

  it("declines to exist across a basis change rather than fabricate", () => {
    const parts: SolveSnapshotPart[] = [
      { id: "prp_a", center: [0, 0, 0], size: [1, 1, 1], fingerprint: "f" },
    ];
    expect(
      classifySolveDelta({ basis: "grid-off", parts }, { basis: "grid-1cm", parts }),
    ).toBeUndefined();
  });

  it("is deterministic regardless of snapshot part order", () => {
    const a = snap(crate(0.5));
    const b = snap(crate(0.6));
    const shuffled: SolveSnapshot = { basis: a.basis, parts: [...a.parts].reverse() };
    expect(JSON.stringify(classifySolveDelta(shuffled, b))).toBe(
      JSON.stringify(classifySolveDelta(a, b)),
    );
  });
});
