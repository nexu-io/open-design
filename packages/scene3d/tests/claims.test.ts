import { describe, expect, it } from "vitest";
import { lintClaims } from "../src/lint/claims.js";
import { ISSUE_CODES } from "../src/errors.js";
import { Census, Issue, CensusMesh } from "../src/types.js";

/** A census carrying just the mesh facts a claim reads. */
function census(meshes: Partial<CensusMesh>[]): Census {
  return {
    blenderVersion: "5.0.1",
    sceneName: "Scene",
    upAxis: "Y",
    objects: [],
    meshes: meshes.map((m) => ({
      object: "prp_x",
      verts: 8,
      faces: 6,
      tris: 12,
      ngons: 0,
      nonManifoldEdges: 0,
      zeroAreaFaces: 0,
      nan: false,
      uvLayers: ["UVMap"],
      ...m,
    })),
    materials: [],
    textures: [],
    uvObjectsWithoutLayers: [],
    objectsWithoutMaterial: [],
    zFightingPairs: [],
    camera: { present: true, name: "cam" },
    lightCount: 1,
    animation: { fps: 24, frameStart: 1, frameEnd: 1, keyframedObjects: [] },
    offCameraObjects: [],
  };
}

const spatial = (groundGap: number) => ({
  worldMin: [0, 0, groundGap] as [number, number, number],
  worldMax: [1, 1, groundGap + 1] as [number, number, number],
  size: [1, 1, 1] as [number, number, number],
  bboxCenter: [0.5, 0.5, 0.5] as [number, number, number],
  centroid: [0.5, 0.5, 0.5] as [number, number, number],
  groundGap,
});

function run(claims: Parameters<typeof lintClaims>[0], c: Census, options = {}): Issue[] {
  const issues: Issue[] = [];
  lintClaims(claims, c, issues, options);
  return issues;
}

describe("lintClaims grounding exemptions (CL-1)", () => {
  it("fails a grounded claim on a buried part by default", () => {
    const c = census([{ object: "rock_bed", spatial: spatial(-0.2) }]);
    const issues = run({ grounded: true }, c);
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_FAILED)).toBe(true);
  });

  it("honours the same grounding exemptions lintWorld does", () => {
    // A deliberately-bedded part the project exempted must not fail the
    // scene-level grounded claim — the two grounding authorities must agree.
    const c = census([{ object: "rock_bed", spatial: spatial(-0.2) }]);
    const issues = run({ grounded: true }, c, { groundExempt: ["rock_bed"] });
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_FAILED)).toBe(false);
  });
});

describe("lintClaims materialsUsed guard (CL-2)", () => {
  it("reports UNCHECKED, not FAILED, when the census carries no material bindings", () => {
    // A census that never measured per-mesh materials (materials: undefined on
    // every mesh) must not turn "couldn't measure" into "every material lost".
    const c = census([{ object: "prp_a" }, { object: "prp_b" }]);
    c.meshes.forEach((m) => {
      delete (m as { materials?: string[] }).materials;
    });
    const issues = run({ materialsUsed: ["mtl_wood"] }, c);
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_UNCHECKED)).toBe(true);
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_FAILED)).toBe(false);
  });

  it("still fails a genuinely-unbound material when bindings WERE measured", () => {
    const c = census([{ object: "prp_a", materials: ["mtl_metal"] }]);
    const issues = run({ materialsUsed: ["mtl_wood"] }, c);
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_FAILED)).toBe(true);
  });
});
