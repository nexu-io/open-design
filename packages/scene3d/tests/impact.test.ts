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
