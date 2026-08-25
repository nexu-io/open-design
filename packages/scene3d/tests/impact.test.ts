import { describe, expect, it } from "vitest";
import { changeImpact, formatImpact } from "../src/read/impact.js";
import type { Census } from "../src/types.js";

/**
 * The delta channel's blind spots, pinned after a field audit proved them:
 * a roughness edit and a spin-speed edit both produced "unchanged since
 * previous compile" in reports whose own materials/animation facts showed
 * the change eight lines down.
 */
function base(): Census {
  return {
    blenderVersion: "5.0.1",
    sceneName: "Scene",
    objects: [],
    meshes: [],
    materials: [
      {
        name: "mtl_body",
        usedByObjectCount: 1,
        principled: {
          present: true,
          metallic: 0,
          roughness: 0.45,
          ior: 1.45,
          baseColor: [0.5, 0.5, 0.5],
          hasTexture: false,
          untouchedDefault: false,
        },
      },
    ],
    textures: [],
    uvObjectsWithoutLayers: [],
    objectsWithoutMaterial: [],
    zFightingPairs: [],
    camera: { present: true, name: "cam" },
    lightCount: 1,
    animation: { fps: 24, frameStart: 1, frameEnd: 48, keyframedObjects: ["prp_rotor"] },
    offCameraObjects: [],
  };
}

describe("changeImpact across a compile that measured nothing", () => {
  // The three-directions-at-once lie a field audit measured: entering a
  // failure diffed the empty world as a catastrophe (every contact broken),
  // being inside one read as "unchanged" while real edits accumulated, and
  // the first success afterwards re-announced the whole scene as appeared.
  const withPart = (): Census => {
    const c = base();
    c.objects = [{
      name: "prp_box", type: "MESH", parent: null,
      location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
      dimensions: [1, 1, 1], visible: true, hasMeshData: true,
    } as Census["objects"][number]];
    c.meshes = [{
      object: "prp_box", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0,
      zeroAreaFaces: 0, nan: false, uvLayers: [],
      spatial: {
        worldMin: [0, 0, 0], worldMax: [1, 1, 1], size: [1, 1, 1],
        bboxCenter: [0.5, 0.5, 0.5], centroid: [0.5, 0.5, 0.5], groundGap: 0,
      },
    } as Census["meshes"][number]];
    c.contacts = [{ a: "prp_box", b: "prp_other", gap: [0, 0, 0], separation: 0, intersects: false }];
    return c;
  };

  it("refuses the geometric diff and keeps the issue diff when this compile has no census", () => {
    const impact = changeImpact(withPart(), undefined, [], [
      { code: "S3D-E-105", severity: "error", message: "size must be a positive number" },
    ]);
    expect(impact.noBuild).toBe(true);
    expect(impact.unchanged).toBe(false);
    // The phantom catastrophe: nothing may read as removed or broken.
    expect(impact.partsRemoved).toEqual([]);
    expect(impact.contactsBroken).toEqual([]);
    // The parse error IS the change, and it is reported.
    expect(impact.issuesAppeared).toEqual([{ code: "S3D-E-105", target: undefined }]);
  });

  it("reports real edits between two failures instead of 'unchanged'", () => {
    const impact = changeImpact(
      undefined,
      undefined,
      [{ code: "S3D-E-105", severity: "error", message: "old error" }],
      [{ code: "S3D-E-106", severity: "error", message: "new error" }],
    );
    expect(impact.noBuild).toBe(true);
    expect(impact.unchanged).toBe(false);
    expect(impact.issuesAppeared.map((i) => i.code)).toEqual(["S3D-E-106"]);
    expect(impact.issuesResolved.map((i) => i.code)).toEqual(["S3D-E-105"]);
  });
});

describe("changeImpact non-geometric edits", () => {
  it("sees a material roughness edit", () => {
    const before = base();
    const after = base();
    after.materials[0]!.principled.roughness = 0.05;
    const impact = changeImpact(before, after);
    expect(impact.unchanged).toBe(false);
    expect(impact.materialsChanged).toEqual([
      { name: "mtl_body", changes: ["roughness 0.45 → 0.05"] },
    ]);
    expect(formatImpact(impact)).toContain("material mtl_body: roughness 0.45 → 0.05");
  });

  it("sees an animation frame-range edit", () => {
    const before = base();
    const after = base();
    after.animation.frameEnd = 6;
    const impact = changeImpact(before, after);
    expect(impact.unchanged).toBe(false);
    expect(impact.animationChanged).toEqual(["frame range 1–48 → 1–6"]);
  });

  it("still reports unchanged when truly nothing moved", () => {
    const impact = changeImpact(base(), base());
    expect(impact.unchanged).toBe(true);
  });
});
