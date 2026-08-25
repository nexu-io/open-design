import { describe, expect, it } from "vitest";
import { deriveFacts } from "../src/lint/facts.js";
import type { Census, CensusMesh } from "../src/types.js";

/**
 * Spectral shape-DNA grouping, in isolation.
 *
 * The census side (does a real Blender mesh produce a spectrum at all, do the
 * four repeat clones of one column actually agree) is proved against real
 * Blender in `spec-pipeline.test.ts`. What is proved HERE is the grouping
 * judgment over fabricated spectra: the tolerance band, the shells gate, the
 * truncation-length gate, the determinism of the representative, and — the one
 * that keeps the fact honest — that an unmeasured mesh is absent rather than
 * lumped into a family it was never compared against.
 */

function mesh(object: string, spectrum?: CensusMesh["spectrum"]): CensusMesh {
  return {
    object,
    verts: 8,
    faces: 6,
    tris: 12,
    ngons: 0,
    nonManifoldEdges: 0,
    zeroAreaFaces: 0,
    nan: false,
    uvLayers: [],
    ...(spectrum ? { spectrum } : {}),
  } as CensusMesh;
}

function census(meshes: CensusMesh[]): Census {
  return {
    objects: meshes.map((m) => ({ name: m.object, type: "MESH" })),
    meshes,
    materials: [],
    textures: [],
  } as unknown as Census;
}

const facts = (meshes: CensusMesh[]) => deriveFacts(census(meshes), new Map());

/** A plausible normalised spectrum: always starts at 1 (λ₁/λ₁). */
const CUBE = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4];
const TORUS = [1, 1.24, 1.24, 2.9, 2.9, 3.6, 4.1, 4.1, 5, 5, 5.7, 6.2];

describe("spectralFamilies", () => {
  it("groups identical spectra and keeps singletons visible", () => {
    const f = facts([mesh("a", { shells: 1, eigenvalues: CUBE }), mesh("b", { shells: 1, eigenvalues: [...CUBE] }), mesh("c", { shells: 1, eigenvalues: TORUS })]);
    expect(f.spectralFamilies).toEqual([["a", "b"], ["c"]]);
    expect(f.spectralFamilyByPart.get("b")).toBe("a");
    expect(f.spectralFamilyByPart.get("c")).toBe("c");
  });

  it("absorbs float noise well inside the tolerance", () => {
    // R6 rounding leaves at most 1e-6 of disagreement between true clones; the
    // 0.01 band must swallow that with orders to spare.
    const jittered = CUBE.map((v, i) => v + (i % 2 === 0 ? 1e-6 : -1e-6));
    const f = facts([mesh("a", { shells: 1, eigenvalues: CUBE }), mesh("b", { shells: 1, eigenvalues: jittered })]);
    expect(f.spectralFamilies).toEqual([["a", "b"]]);
  });

  it("separates spectra that differ by more than the tolerance in ANY single mode", () => {
    // L∞, not a mean: one mode out is a different shape, and averaging would
    // let eleven agreeing modes hide it.
    const nudged = [...CUBE];
    nudged[5] = nudged[5]! + 0.02;
    const f = facts([mesh("a", { shells: 1, eigenvalues: CUBE }), mesh("b", { shells: 1, eigenvalues: nudged })]);
    expect(f.spectralFamilies).toEqual([["a"], ["b"]]);
  });

  it("never merges across a differing shell count", () => {
    const f = facts([mesh("a", { shells: 1, eigenvalues: CUBE }), mesh("b", { shells: 2, eigenvalues: CUBE })]);
    expect(f.spectralFamilies).toEqual([["a"], ["b"]]);
  });

  it("never merges across a differing truncation length", () => {
    // A short vector means the mesh ran out of nonzero modes — a structural
    // difference, not a prefix of a longer one.
    const f = facts([mesh("a", { shells: 1, eigenvalues: CUBE }), mesh("b", { shells: 1, eigenvalues: CUBE.slice(0, 6) })]);
    expect(f.spectralFamilies).toEqual([["a"], ["b"]]);
  });

  it("omits meshes whose spectrum was not measured, rather than defaulting them", () => {
    const f = facts([
      mesh("a", { shells: 1, eigenvalues: CUBE }),
      mesh("capped", { shells: 3, skipped: "vertex count 9000 exceeds SPECTRUM_VERT_CAP 2000" }),
      mesh("plain"),
    ]);
    expect(f.spectralFamilies).toEqual([["a"]]);
    expect(f.spectralFamilyByPart.has("capped")).toBe(false);
    expect(f.spectralFamilyByPart.has("plain")).toBe(false);
  });

  it("rejects a spectrum carrying a non-finite entry", () => {
    // R6 maps non-finite floats to null; a null must disqualify the vector,
    // never compare as 0.
    const f = facts([mesh("a", { shells: 1, eigenvalues: [1, null, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6] })]);
    expect(f.spectralFamilies).toEqual([]);
  });

  it("picks the same representative regardless of census ordering", () => {
    const forward = facts([mesh("a", { shells: 1, eigenvalues: CUBE }), mesh("b", { shells: 1, eigenvalues: CUBE }), mesh("c", { shells: 1, eigenvalues: CUBE })]);
    const reversed = facts([mesh("c", { shells: 1, eigenvalues: CUBE }), mesh("b", { shells: 1, eigenvalues: CUBE }), mesh("a", { shells: 1, eigenvalues: CUBE })]);
    expect(reversed.spectralFamilies).toEqual(forward.spectralFamilies);
    expect(reversed.spectralFamilies).toEqual([["a", "b", "c"]]);
  });

  it("is empty on a census with no meshes", () => {
    const f = facts([]);
    expect(f.spectralFamilies).toEqual([]);
    expect(f.spectralFamilyByPart.size).toBe(0);
  });
});
