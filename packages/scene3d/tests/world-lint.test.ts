import { describe, expect, it } from "vitest";
import { lintWorld } from "../src/lint/world.js";
import { normalizeContract } from "../src/contract.js";
import { Census, Issue, Scene3dContract } from "../src/types.js";

function census(
  objects: Array<{ name: string; min: number; tris?: number; type?: string }>,
): Census {
  return {
    blenderVersion: "5.0.1",
    sceneName: "Scene",
    objects: objects.map((o) => ({
      name: o.name,
      type: o.type ?? "MESH",
      parent: null,
      location: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      dimensions: [1, 1, 1],
      visible: true,
      hasMeshData: (o.type ?? "MESH") === "MESH",
      worldMin: [0, 0, o.min],
      worldMax: [1, 1, o.min + 1],
    })),
    meshes: objects
      .filter((o) => (o.type ?? "MESH") === "MESH")
      .map((o) => ({
        object: o.name,
        verts: 8,
        faces: 6,
        tris: o.tris ?? 12,
        ngons: 0,
        nonManifoldEdges: 0,
        zeroAreaFaces: 0,
        nan: false,
        uvLayers: ["UVMap"],
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

function codes(contract: Scene3dContract, c: Census): string[] {
  const issues: Issue[] = [];
  lintWorld(normalizeContract(contract), c, issues);
  return issues.map((i) => i.code);
}

const grounded: Scene3dContract = {
  schemaVersion: 1,
  conventions: { grounding: { enabled: true, tolerance: 0.005 } },
};

describe("grounding", () => {
  it("is off unless a project opts in", () => {
    // A scene composed in world space is legitimately not ground-anchored,
    // so the rule must not fire on projects that never asked for it.
    expect(codes({ schemaVersion: 1 }, census([{ name: "prp_a", min: 4 }]))).toEqual([]);
  });

  it("passes a part resting on the ground plane", () => {
    expect(codes(grounded, census([{ name: "prp_a", min: 0 }]))).toEqual([]);
  });

  it("warns when a part floats", () => {
    expect(codes(grounded, census([{ name: "prp_a", min: 0.04 }]))).toEqual(["S3D-W-325"]);
  });

  it("errors when a part sinks through the ground", () => {
    expect(codes(grounded, census([{ name: "prp_a", min: -0.04 }]))).toEqual(["S3D-E-325"]);
  });

  it("forgives chamfer bleed inside the tolerance", () => {
    expect(codes(grounded, census([{ name: "prp_a", min: 0.004 }]))).toEqual([]);
    expect(codes(grounded, census([{ name: "prp_a", min: -0.004 }]))).toEqual([]);
  });

  it("honours a declared exemption by exact name and by prefix", () => {
    // The exemption list is the documentation: an asset that dips below zero
    // has to say so out loud rather than the rule silently not applying.
    const contract: Scene3dContract = {
      schemaVersion: 1,
      conventions: { grounding: { enabled: true, exempt: ["mount_", "prp_bedded_rock"] } },
    };
    expect(
      codes(
        contract,
        census([
          { name: "mount_bracket", min: 1.8 },
          { name: "prp_bedded_rock", min: -0.3 },
        ]),
      ),
    ).toEqual([]);
  });

  it("ignores non-mesh objects", () => {
    expect(
      codes(grounded, census([{ name: "lgt_key", min: 6, type: "LIGHT" }])),
    ).toEqual([]);
  });

  it("measures grounding from the vertex-exact spatial, not the object AABB (B-1)", () => {
    // A rotated plank: its bounding box min-z dips below the floor (the AABB of
    // an OBB does), but its actual lowest VERTEX rests on it. The vertex-based
    // claims.grounded passes it, so the AABB-based world grounding must not
    // contradict by reporting a sink.
    const c = census([{ name: "prp_plank", min: -0.05 }]);
    c.meshes[0]!.spatial = {
      worldMin: [0, 0, 0.001],
      worldMax: [1, 1, 1],
      size: [1, 1, 1],
      bboxCenter: [0.5, 0.5, 0.5],
      centroid: [0.5, 0.5, 0.5],
      groundGap: 0.001, // vertices rest on the floor within tolerance
    };
    expect(codes(grounded, c)).toEqual([]);
  });

  it("does not let a bare exempt prefix leak across a word boundary (W-1)", () => {
    // `exempt: ["mount"]` must cover the `mount_` family but NOT `mountain_`.
    const contract: Scene3dContract = {
      schemaVersion: 1,
      conventions: { grounding: { enabled: true, exempt: ["mount"] } },
    };
    // mount_bracket: exempt at the separator boundary — silent.
    expect(codes(contract, census([{ name: "mount_bracket", min: 1.8 }]))).toEqual([]);
    // mountain_rock: NOT the mount family — a real float must still surface.
    expect(codes(contract, census([{ name: "mountain_rock", min: 1.8 }]))).toEqual(["S3D-W-325"]);
  });
});

describe("budgets", () => {
  const budgeted: Scene3dContract = {
    schemaVersion: 1,
    conventions: { budgets: { maxTrianglesPerMesh: 20_000, maxTrianglesTotal: 30_000 } },
  };

  it("says nothing when no budget is declared", () => {
    expect(codes({ schemaVersion: 1 }, census([{ name: "prp_a", tris: 999_999 }].map((o) => ({ ...o, min: 0 }))))).toEqual([]);
  });

  it("errors on a mesh over the per-mesh cap", () => {
    expect(codes(budgeted, census([{ name: "prp_a", min: 0, tris: 25_000 }]))).toContain("S3D-E-326");
  });

  it("warns on a scene over the total budget", () => {
    const result = codes(
      budgeted,
      census([
        { name: "prp_a", min: 0, tris: 19_000 },
        { name: "prp_b", min: 0, tris: 19_000 },
      ]),
    );
    expect(result).toContain("S3D-W-326");
    expect(result).not.toContain("S3D-E-326");
  });

  it("passes a scene inside both budgets", () => {
    expect(codes(budgeted, census([{ name: "prp_a", min: 0, tris: 1_000 }]))).toEqual([]);
  });
});
