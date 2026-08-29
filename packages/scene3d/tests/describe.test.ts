import { describe, expect, it } from "vitest";
import { describeScene, DescribeRefusal } from "../src/read/describe.js";
import type { Census, Issue } from "../src/types.js";

/**
 * The LOD digest's query surface, adversarially pinned:
 *  - an unknown `focus` REFUSES with the vocabulary (it used to return the
 *    ordinary unfocused digest — a confidently wrong answer to a typo);
 *  - a `region` scopes the ISSUES like it scopes the parts (it used to list
 *    every issue in the scene under a filtered view, defeating the budget
 *    the region exists to serve).
 */

function census(): Census {
  const obj = (name: string, min: [number, number, number], max: [number, number, number]) => ({
    name,
    type: "MESH",
    parent: null,
    location: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
    dimensions: [1, 1, 1] as [number, number, number],
    visible: true,
    hasMeshData: true,
    worldMin: min,
    worldMax: max,
  });
  return {
    blenderVersion: "5.0.1",
    sceneName: "Scene",
    objects: [
      obj("prp_near", [0, 0, 0], [1, 1, 1]),
      obj("prp_far", [10, 10, 0], [11, 11, 1]),
    ],
    meshes: [],
    materials: [],
    textures: [],
    uvObjectsWithoutLayers: [],
    objectsWithoutMaterial: [],
    zFightingPairs: [],
    camera: { present: true, name: "cam" },
    lightCount: 1,
    animation: { fps: 24, frameStart: 1, frameEnd: 1, keyframedObjects: [] },
    offCameraObjects: [],
  } as unknown as Census;
}

describe("describeScene — focus", () => {
  it("refuses an unknown focus with the legal vocabulary", () => {
    expect(() => describeScene(census(), [], { focus: "prp_nope" })).toThrowError(DescribeRefusal);
    try {
      describeScene(census(), [], { focus: "prp_nope" });
    } catch (e) {
      expect((e as Error).message).toContain("prp_nope");
      expect((e as Error).message).toContain("prp_near");
    }
  });

  it("accepts a known part name", () => {
    expect(describeScene(census(), [], { focus: "prp_near" })).toContain("prp_near");
  });
});

describe("describeScene — region scopes issues", () => {
  const issues: Issue[] = [
    { code: "S3D-W-321", severity: "warning", message: "far floats", target: "prp_far" },
    { code: "S3D-W-324", severity: "warning", message: "near fights", target: "prp_near" },
    { code: "S3D-E-301", severity: "error", message: "scene-level" },
    { code: "S3D-W-341", severity: "warning", message: "material thing", target: "mtl_gold" },
  ];
  const region = { min: [-1, -1, -1] as [number, number, number], max: [2, 2, 2] as [number, number, number] };

  it("keeps scene-level and in-region issues, drops out-of-region part issues", () => {
    const text = describeScene(census(), issues, { region });
    expect(text).toContain("S3D-W-324");
    expect(text).toContain("S3D-E-301");
    // Non-spatial targets (a material) are not filtered by a spatial query.
    expect(text).toContain("S3D-W-341");
    expect(text).not.toContain("S3D-W-321");
  });

  it("keeps every issue when no region narrows the view", () => {
    const text = describeScene(census(), issues, {});
    expect(text).toContain("S3D-W-321");
  });
});

describe("describeScene — the focused part survives any budget", () => {
  /*
   * The round-three exhibit: a 96-clone yard focused on one clone returned
   * every clone EXCEPT the focused one — largest-first group order plus
   * name-order expansion truncated exactly the row the caller named, and
   * the fold note then advised "a focus" to a caller already using one.
   */
  const bigCensus = (): Census => {
    const obj = (name: string, x: number) => ({
      name,
      type: "MESH",
      parent: null,
      location: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      dimensions: [1, 1, 1],
      visible: true,
      hasMeshData: true,
      worldMin: [x, 0, 0],
      worldMax: [x + 1, 1, 1],
    });
    const objects = [];
    for (let i = 0; i < 96; i++) objects.push(obj("prp_crate_r" + Math.floor(i / 12) + "_" + (i % 12), i));
    for (let i = 0; i < 6; i++) objects.push(obj("prp_mast_" + i, 100 + i));
    return {
      blenderVersion: "5.0.1",
      sceneName: "Scene",
      objects,
      meshes: [],
      materials: [],
      textures: [],
      uvObjectsWithoutLayers: [],
      objectsWithoutMaterial: [],
      zFightingPairs: [],
      camera: { present: true, name: "cam" },
      lightCount: 1,
      animation: { fps: 24, frameStart: 1, frameEnd: 1, keyframedObjects: [] },
      offCameraObjects: [],
    } as unknown as Census;
  };

  it("prints the focused part first in its group, under the default budget", () => {
    const text = describeScene(bigCensus(), [], { focus: "prp_crate_r3_5" });
    expect(text).toContain("prp_crate_r3_5");
    // First expanded row of the structure section is the focused part.
    const rows = text.split("\n").filter((l) => l.startsWith("    prp_"));
    expect(rows[0]).toContain("prp_crate_r3_5");
  });

  it("does not advise the focus lever to a caller already focusing", () => {
    const text = describeScene(bigCensus(), [], { focus: "prp_crate_r3_5", budgetTokens: 200 });
    if (text.includes("folded away")) {
      expect(text).not.toContain("a focus to see them");
    }
  });
});
