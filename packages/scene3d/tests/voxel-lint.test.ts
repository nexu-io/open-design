import { describe, expect, it } from "vitest";
import { lintVoxel } from "../src/lint/voxel.js";
import { normalizeContract } from "../src/contract.js";
import type { Census, CensusMesh, Issue } from "../src/types.js";

/**
 * The voxel/Minecraft rules in isolation — the census math is validated
 * against real Blender in the pipeline suite (rotated cubes, off-grid boxes);
 * this proves the JUDGMENT: which codes fire for which measured `voxel` facts,
 * dialect scoping, the element-bounds excursion, and — load-bearing — that the
 * whole module is silent unless a contract opts in.
 */

type VoxelFacts = NonNullable<CensusMesh["voxel"]>;

function mesh(object: string, voxel: VoxelFacts, verts = 8, faces = 6): CensusMesh {
  return { object, verts, faces, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: [], voxel } as CensusMesh;
}

/** A census carrying only what lintVoxel reads: mesh voxel facts + object AABBs. */
function census(meshes: CensusMesh[], bounds: Record<string, [number, number, number, number, number, number]> = {}): Census {
  return {
    objects: meshes.map((m) => {
      const b = bounds[m.object];
      return {
        name: m.object,
        type: "MESH",
        worldMin: b ? ([b[0], b[1], b[2]] as [number, number, number]) : ([-0.5, 0, -0.5] as [number, number, number]),
        worldMax: b ? ([b[3], b[4], b[5]] as [number, number, number]) : ([0.5, 1, 0.5] as [number, number, number]),
      };
    }),
    meshes,
  } as unknown as Census;
}

const AXIS_BOX: VoxelFacts = { isBox: true, axisAligned: true, rotationAxis: null, rotationDeg: null, gridDeviation: 0 };
const mc = (extra: Record<string, unknown> = {}) =>
  normalizeContract({ schemaVersion: 1, target: "minecraft", conventions: { minecraft: extra } } as never);
/** A generic voxel contract (engine-agnostic) — NO Minecraft format rules. */
const vox = (extra: Record<string, unknown> = {}) =>
  normalizeContract({ schemaVersion: 1, target: "voxel", conventions: { voxel: extra } } as never);

function run(c: ReturnType<typeof mc>, cen: Census): string[] {
  const issues: Issue[] = [];
  lintVoxel(c, cen, issues);
  return issues.map((i) => i.code);
}

describe("lintVoxel — generic voxel vs Minecraft format (decoupling)", () => {
  it("a target:voxel scene gets grid discipline (W-970) but NOT the Java format rules", () => {
    // Off-grid + non-cuboid + out-of-bounds, under the GENERIC voxel target.
    const orb = mesh("prp_orb", { ...AXIS_BOX, isBox: false, gridDeviation: 0.03 }, 1106, 1152);
    const codes = run(vox(), census([orb], { prp_orb: [-2.5, 0, -0.5, 2.5, 1, 0.5] }));
    // Grid discipline is engine-agnostic → it fires.
    expect(codes).toContain("S3D-W-970");
    // The Minecraft FORMAT rules do not apply to a plain voxel scene.
    expect(codes).not.toContain("S3D-W-971"); // cuboid is a Java element rule
    expect(codes).not.toContain("S3D-W-973"); // element bounds are Minecraft's
    expect(codes).not.toContain("S3D-I-970"); // the structure class is Minecraft's
  });

  it("the SAME geometry under target:minecraft does get the format rules", () => {
    const orb = mesh("prp_orb", { ...AXIS_BOX, isBox: false, gridDeviation: 0.03 }, 1106, 1152);
    const codes = run(mc(), census([orb]));
    expect(codes).toContain("S3D-W-970");
    expect(codes).toContain("S3D-W-971"); // now the Java element rule applies
  });

  it("is silent entirely without a voxel or minecraft target", () => {
    const plain = normalizeContract({ schemaVersion: 1 });
    const orb = mesh("prp_orb", { ...AXIS_BOX, isBox: false, gridDeviation: 0.03 });
    expect(run(plain, census([orb]))).toEqual([]);
  });
});

describe("lintVoxel", () => {
  it("is silent on a clean grid-aligned cuboid", () => {
    expect(run(mc(), census([mesh("prp_a", AXIS_BOX)]))).toEqual([]);
  });

  it("stays completely silent without the minecraft target (byte-identical)", () => {
    // The whole point of opt-in: a non-Minecraft scene, even one whose census
    // happens to carry voxel facts, gets zero voxel issues.
    const plain = normalizeContract({ schemaVersion: 1 });
    const offGrid = mesh("prp_a", { ...AXIS_BOX, gridDeviation: 0.03 });
    expect(run(plain, census([offGrid]))).toEqual([]);
  });

  it("flags an off-grid vertex (W-970) with the pixel offset", () => {
    const offGrid = mesh("prp_a", { ...AXIS_BOX, gridDeviation: 0.025 });
    const issues: Issue[] = [];
    lintVoxel(mc(), census([offGrid]), issues);
    const w970 = issues.find((i) => i.code === "S3D-W-970")!;
    expect(w970).toBeTruthy();
    expect(w970.message).toContain("0.4px"); // 0.025 / (1/16)
    expect((w970.detail as { offGridPx: number }).offGridPx).toBeCloseTo(0.4, 3);
  });

  it("forgives sub-tolerance drift (float noise from the round-trip)", () => {
    // 1mm — the solver's flush floor — is under the 1/256 grid tolerance.
    const drift = mesh("prp_a", { ...AXIS_BOX, gridDeviation: 0.001 });
    expect(run(mc(), census([drift]))).not.toContain("S3D-W-970");
  });

  it("flags a non-cuboid mesh (W-971) in both dialects", () => {
    const sphere = mesh("prp_orb", { ...AXIS_BOX, isBox: false }, 1106, 1152);
    expect(run(mc(), census([sphere]))).toContain("S3D-W-971");
    expect(run(mc({ dialect: "bedrock" }), census([sphere]))).toContain("S3D-W-971");
  });

  it("flags an illegal Java rotation and names the nearest legal angle (W-972)", () => {
    const rot30 = mesh("prp_a", { isBox: true, axisAligned: false, rotationAxis: "z", rotationDeg: 30, gridDeviation: 0 });
    const issues: Issue[] = [];
    lintVoxel(mc(), census([rot30]), issues);
    const w972 = issues.find((i) => i.code === "S3D-W-972")!;
    expect(w972).toBeTruthy();
    expect(w972.message).toContain("22.5°"); // nearest legal to 30
    expect((w972.detail as { nearestLegal: number }).nearestLegal).toBe(22.5);
  });

  it("passes a legal 22.5° Java rotation", () => {
    const rot = mesh("prp_a", { isBox: true, axisAligned: false, rotationAxis: "z", rotationDeg: 22.5, gridDeviation: 0 });
    expect(run(mc(), census([rot]))).not.toContain("S3D-W-972");
  });

  it("flags multi-axis rotation in Java but not in Bedrock", () => {
    // isBox, not axis-aligned, no single recovered axis = spun about >1 axis.
    const multi = mesh("prp_a", { isBox: true, axisAligned: false, rotationAxis: null, rotationDeg: null, gridDeviation: 0 });
    expect(run(mc(), census([multi]))).toContain("S3D-W-972");
    expect(run(mc({ dialect: "bedrock" }), census([multi]))).not.toContain("S3D-W-972");
  });

  it("lets Bedrock keep a free single-axis angle Java would reject", () => {
    const rot30 = mesh("prp_a", { isBox: true, axisAligned: false, rotationAxis: "z", rotationDeg: 30, gridDeviation: 0 });
    expect(run(mc({ dialect: "bedrock" }), census([rot30]))).not.toContain("S3D-W-972");
  });

  it("flags an element-scale part positioned past the bounds (W-973)", () => {
    // A 1-block box (element-scale, so the format rules apply) whose x reaches
    // 3.5 — past the −1..2 space by translation. Fixable by moving it.
    const nub = mesh("prp_nub", AXIS_BOX);
    const issues: Issue[] = [];
    lintVoxel(mc(), census([nub], { prp_nub: [2.5, 0, -0.5, 3.5, 1, 0.5] }), issues);
    const w973 = issues.find((i) => i.code === "S3D-W-973")!;
    expect(w973).toBeTruthy();
    expect(w973.message).toContain("X");
    expect((w973.detail as { value: number }).value).toBeCloseTo(3.5, 3);
  });

  it("classifies a mesh larger than the element space as structure (I-970), not out-of-bounds", () => {
    // A 5-block beam cannot be one element by ANY placement — it is structure.
    // The element-format rules (bounds/cuboid/rotation) do not apply.
    const beam = mesh("prp_beam", AXIS_BOX);
    const codes = run(mc(), census([beam], { prp_beam: [-2.5, 0, -0.5, 2.5, 1, 0.5] }));
    expect(codes).toContain("S3D-I-970");
    expect(codes).not.toContain("S3D-W-973");
  });

  it("aggregates a repeat/scatter family into one warning, not N", () => {
    // Three off-grid instances of one base part → ONE W-970 carrying the count,
    // not three. The family is keyed by the solved scene's `from`.
    const off = (id: string): CensusMesh => mesh(id, { ...AXIS_BOX, gridDeviation: 0.03 });
    const solved = { parts: [
      { id: "prp_v", from: undefined }, { id: "prp_v_2", from: "prp_v" }, { id: "prp_v_3", from: "prp_v" },
    ] } as never;
    const issues: Issue[] = [];
    lintVoxel(mc(), census([off("prp_v"), off("prp_v_2"), off("prp_v_3")]), issues, solved);
    const w970 = issues.filter((i) => i.code === "S3D-W-970");
    expect(w970).toHaveLength(1);
    expect(w970[0]!.target).toBe("prp_v");
    expect((w970[0]!.detail as { instanceCount: number }).instanceCount).toBe(3);
  });

  it("respects a widened element bound", () => {
    const nub = mesh("prp_nub", AXIS_BOX);
    const wide = mc({ elementBounds: { minBlocks: -4, maxBlocks: 4 } });
    expect(run(wide, census([nub], { prp_nub: [2.5, 0, -0.5, 3.5, 1, 0.5] }))).not.toContain("S3D-W-973");
  });
});
