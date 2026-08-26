import { describe, expect, it } from "vitest";
import { Rng } from "../src/solve/rng.js";
import {
  edgesOf,
  KernelMesh,
  meshOf,
  predictCensus,
  RVec3,
  subdivideCatmullClark,
} from "../src/kernel/mesh.js";
import { evalTrace, Recorder, traceHash } from "../src/kernel/trace.js";

/**
 * SYSTEMATIC falsification of the kernel — the sweep-oracle discipline applied
 * to geometry. Specific known-answer tests prove what the author imagined; a
 * seeded property suite proves what must hold over hundreds of random operator
 * sequences. Every case is deterministic (path-addressed RNG), so any failure
 * reproduces exactly.
 *
 * The invariants the operators MUST preserve:
 *  - a closed genus-0 cage stays closed, single-component, orientable, genus 0
 *    through ANY sequence of subdivide/move/scale/crease (topology is only
 *    ever refined or deformed, never torn);
 *  - Catmull-Clark obeys its exact count formula (V' = V+E+F, F' = sum of
 *    face sides) and preserves the Euler characteristic;
 *  - the census edge count equals the real undirected edge set;
 *  - the same recipe is byte-identical twice.
 */

const tetra = (): KernelMesh =>
  meshOf(
    [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
  );
const boxCage = (): KernelMesh =>
  meshOf(
    [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]],
  );
const CAGES: Array<() => KernelMesh> = [
  boxCage,
  tetra,
  () => subdivideCatmullClark(boxCage()), // valence-4 interior verts
  () => subdivideCatmullClark(tetra()),
];

const sumSides = (m: KernelMesh): number => m.faces.reduce((a, f) => a + f.length, 0);
const cagePoints = (m: KernelMesh): Array<[string, string, string]> =>
  m.verts.map((v: RVec3) => [v[0].toString(), v[1].toString(), v[2].toString()]);

function assertClosedGenus0(m: KernelMesh, where: string): void {
  const c = predictCensus(m);
  expect(c.watertight, `${where}: watertight`).toBe(true);
  expect(c.components, `${where}: components`).toBe(1);
  expect(c.orientable, `${where}: orientable`).toBe(true);
  expect(c.genus, `${where}: genus`).toBe(0);
  expect(c.euler, `${where}: euler`).toBe(2);
}

function bound(r: Rng): [string, string] {
  const a = Math.floor(r.uniform(-2, 2));
  const b = a + Math.floor(r.uniform(0, 3));
  return [String(a), String(b)];
}
function region(r: Rng): { x?: [string, string]; y?: [string, string]; z?: [string, string] } {
  const reg: { x?: [string, string]; y?: [string, string]; z?: [string, string] } = {};
  if (r.next() < 0.6) reg.x = bound(r);
  if (r.next() < 0.6) reg.y = bound(r);
  if (r.next() < 0.6) reg.z = bound(r);
  return reg;
}
const intStr = (r: Rng, lo: number, hi: number): string => String(Math.floor(r.uniform(lo, hi + 1)));

describe("kernel fuzz: closed genus-0 is preserved by every operator sequence", () => {
  it("random subdivide/move/scale/crease sequences never tear the surface", () => {
    const rng = new Rng("kernel-fuzz-v1");
    const CASES = 250;
    let ops = 0;
    for (let i = 0; i < CASES; i++) {
      const r = rng.at(`case/${i}`);
      const seed = CAGES[Math.floor(r.uniform(0, CAGES.length))]!();
      const rec = new Recorder().cage(cagePoints(seed), seed.faces);
      const steps = 2 + Math.floor(r.uniform(0, 5));
      for (let s = 0; s < steps; s++) {
        const roll = r.next();
        if (roll < 0.35) rec.subdivide(1);
        else if (roll < 0.5) rec.move(region(r), [intStr(r, -2, 2), intStr(r, -2, 2), intStr(r, -2, 2)]);
        else if (roll < 0.65) rec.scale(region(r), [intStr(r, 1, 3), intStr(r, 1, 3), intStr(r, 1, 3)], [0, 0, 0]);
        else if (roll < 0.8) rec.crease(region(r));
        // inset is per-face and topology-safe, so it belongs in the strong
        // closed-genus-0 property (unlike extrude, which needs a simple region).
        else rec.inset(region(r), r.next() < 0.5 ? "1/2" : "1/3");
        ops++;
      }
      // The whole sequence evaluates to a mesh that is STILL a closed,
      // single-component, orientable genus-0 surface — deformation and
      // subdivision refine or move geometry, they never open or tear it.
      assertClosedGenus0(evalTrace(rec.trace()), `case ${i}`);
    }
    expect(ops).toBeGreaterThan(500);
  });
});

describe("kernel fuzz: Catmull-Clark obeys its exact count law", () => {
  it("V' = V+E+F, F' = sum of sides, and the Euler characteristic holds", () => {
    const rng = new Rng("kernel-fuzz-counts-v1");
    for (let i = 0; i < 120; i++) {
      const r = rng.at(`c/${i}`);
      let mesh = CAGES[Math.floor(r.uniform(0, CAGES.length))]!();
      const levels = 1 + Math.floor(r.uniform(0, 3));
      for (let l = 0; l < levels; l++) {
        const before = predictCensus(mesh);
        const sides = sumSides(mesh);
        const next = subdivideCatmullClark(mesh);
        const after = predictCensus(next);
        expect(after.vertices).toBe(before.vertices + before.edges + before.faces);
        expect(next.faces.length).toBe(sides);
        expect(after.euler).toBe(before.euler);
        // The census edge count is the real undirected edge set, not a guess.
        expect(after.edges).toBe(edgesOf(next).size);
        mesh = next;
      }
    }
  });
});

describe("kernel fuzz: a single-face extrude stays a closed genus-0 solid", () => {
  it("extruding any box face by any offset, then subdividing, keeps it closed", () => {
    const rng = new Rng("kernel-fuzz-extrude-v1");
    const faceRegions: Array<{ x?: [string, string]; y?: [string, string]; z?: [string, string] }> = [
      { z: ["1", "1"] }, { z: ["-1", "-1"] },
      { x: ["1", "1"] }, { x: ["-1", "-1"] },
      { y: ["1", "1"] }, { y: ["-1", "-1"] },
    ];
    for (let i = 0; i < 80; i++) {
      const r = rng.at(`x/${i}`);
      const reg = faceRegions[Math.floor(r.uniform(0, faceRegions.length))]!;
      const off: [string, string, string] = [intStr(r, -3, 3), intStr(r, -3, 3), intStr(r, -3, 3)];
      assertClosedGenus0(evalTrace(new Recorder().box().extrude(reg, off).trace()), `extrude ${i}`);
      assertClosedGenus0(
        evalTrace(new Recorder().box().extrude(reg, off).subdivide(1).trace()),
        `extrude+subdivide ${i}`,
      );
    }
  });
});

describe("kernel fuzz: determinism", () => {
  it("random operator sequences are byte-identical on re-run", () => {
    const rng = new Rng("kernel-fuzz-det-v1");
    for (let i = 0; i < 40; i++) {
      const build = () => {
        const r = rng.at(`d/${i}`);
        const rec = new Recorder().box();
        const steps = 1 + Math.floor(r.uniform(0, 4));
        for (let s = 0; s < steps; s++) {
          const roll = r.next();
          if (roll < 0.4) rec.subdivide(1);
          else if (roll < 0.6) rec.move(region(r), [intStr(r, -2, 2), "0", "0"]);
          else if (roll < 0.8) rec.crease(region(r));
          else rec.scale({}, [intStr(r, 1, 2), "1", "1"], [0, 0, 0]);
        }
        return rec.trace();
      };
      expect(traceHash(build())).toBe(traceHash(build()));
    }
  });
});
