import { describe, expect, it } from "vitest";
import { buildJavaModel } from "../src/mc/java-model.js";
import { normalizeContract } from "../src/contract.js";
import { decodePng } from "../src/sheet/png.js";
import type { Census, CensusMaterial, CensusMesh } from "../src/types.js";

/**
 * The Java block-model lowering in isolation — pure census → JSON, no Blender.
 * The census math (boxness, bounds) is validated against real geometry in the
 * pipeline suite; this pins the LOWERING: the Blender→Minecraft coordinate map,
 * element pixels, face set, texture synthesis, skip semantics, and determinism.
 */

type Voxel = NonNullable<CensusMesh["voxel"]>;
const AXIS_BOX: Voxel = { isBox: true, axisAligned: true, rotationAxis: null, rotationDeg: null, gridDeviation: 0 };

function mat(name: string, baseColor: [number, number, number]): CensusMaterial {
  return { name, usedByObjectCount: 1, principled: { present: true, metallic: 0, roughness: 0.9, ior: 1.5, baseColor, hasTexture: false, untouchedDefault: false } };
}
function mesh(object: string, material: string, voxel: Voxel = AXIS_BOX): CensusMesh {
  return { object, verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"], materials: [material], voxel } as CensusMesh;
}
function census(meshes: CensusMesh[], materials: CensusMaterial[], bounds: Record<string, [number, number, number, number, number, number]>): Census {
  return {
    objects: meshes.map((m) => {
      const b = bounds[m.object]!;
      return { name: m.object, type: "MESH", worldMin: [b[0], b[1], b[2]], worldMax: [b[3], b[4], b[5]] };
    }),
    meshes,
    materials,
    textures: [],
  } as unknown as Census;
}
const contract = normalizeContract({ schemaVersion: 1, target: "minecraft" } as never);

describe("buildJavaModel", () => {
  it("maps a Blender unit cube to the correct Java element pixels", () => {
    // Blender AABB [0,0,0]..[1,1,1]. Map (x,y,z)->(x,z,-y), then ×16:
    //   x: [0,1]->[0,16]; MC y from Blender z: [0,1]->[0,16];
    //   MC z from -Blender y: [-1,0]->[-16,0].
    const c = census([mesh("prp_a", "mtl_a")], [mat("mtl_a", [0.5, 0.5, 0.5])], { prp_a: [0, 0, 0, 1, 1, 1] });
    const { model, skipped } = buildJavaModel(c, contract);
    expect(skipped).toEqual([]);
    expect(model.elements).toHaveLength(1);
    expect(model.elements[0]!.from).toEqual([0, 0, -16]);
    expect(model.elements[0]!.to).toEqual([16, 16, 0]);
    // All six faces, every one textured and covering the whole tile.
    expect(Object.keys(model.elements[0]!.faces).sort()).toEqual(["down", "east", "north", "south", "up", "west"]);
    for (const f of Object.values(model.elements[0]!.faces)) {
      expect(f.uv).toEqual([0, 0, 16, 16]);
      expect(f.texture).toBe("#mtl_a");
    }
  });

  it("keeps from ≤ to on every axis for an off-origin box", () => {
    const c = census([mesh("prp_a", "mtl_a")], [mat("mtl_a", [0.5, 0.5, 0.5])], { prp_a: [-0.25, 0.5, -0.75, 0.25, 1.0, 0.75] });
    const [el] = buildJavaModel(c, contract).model.elements;
    for (let i = 0; i < 3; i++) expect(el!.from[i]!).toBeLessThanOrEqual(el!.to[i]!);
  });

  it("synthesises a 16×16 opaque texture from a flat colour, sRGB-encoded", () => {
    // Linear 0.5 → sRGB ~0.735 → ~188.
    const c = census([mesh("prp_a", "mtl_a")], [mat("mtl_a", [0.5, 0.5, 0.5])], { prp_a: [0, 0, 0, 1, 1, 1] });
    const { textures, model } = buildJavaModel(c, contract);
    expect(model.textures["mtl_a"]).toBe("block/mtl_a");
    expect(model.textures["particle"]).toBe("#mtl_a");
    const dir = textures.find((t) => t.key === "mtl_a")!;
    expect(dir.png).toBeTruthy();
    const img = decodePng(dir.png!);
    expect(img.width).toBe(16);
    expect(img.height).toBe(16);
    expect(img.data[0]).toBeGreaterThan(180); // sRGB(0.5) byte
    expect(img.data[0]).toBeLessThan(196);
    expect(img.data[3]).toBe(255); // opaque
  });

  it("shares one texture per material across boxes and gives unique keys", () => {
    const c = census(
      [mesh("prp_a", "mtl_a"), mesh("prp_b", "mtl_a"), mesh("prp_c", "mtl_b")],
      [mat("mtl_a", [0.6, 0.4, 0.3]), mat("mtl_b", [0.2, 0.5, 0.9])],
      { prp_a: [0, 0, 0, 1, 1, 1], prp_b: [1, 0, 0, 2, 1, 1], prp_c: [2, 0, 0, 3, 1, 1] },
    );
    const { model, textures } = buildJavaModel(c, contract);
    expect(model.elements).toHaveLength(3);
    // Two distinct materials → two synthesized textures, not three.
    expect(textures).toHaveLength(2);
  });

  it("skips a non-cuboid and a rotated box with a reason, emitting the rest", () => {
    const sphere = mesh("prp_orb", "mtl_a", { ...AXIS_BOX, isBox: false });
    const rotated = mesh("prp_spin", "mtl_a", { isBox: true, axisAligned: false, rotationAxis: "z", rotationDeg: 30, gridDeviation: 0 });
    const good = mesh("prp_box", "mtl_a");
    const c = census([sphere, rotated, good], [mat("mtl_a", [0.5, 0.5, 0.5])], {
      prp_orb: [0, 0, 0, 1, 1, 1],
      prp_spin: [0, 0, 0, 1, 1, 1],
      prp_box: [0, 0, 0, 1, 1, 1],
    });
    const { model, skipped } = buildJavaModel(c, contract);
    expect(model.elements).toHaveLength(1); // only the clean box
    const reasons = new Map(skipped.map((s) => [s.object, s.reason]));
    expect(reasons.get("prp_orb")).toContain("cuboid");
    expect(reasons.get("prp_spin")).toContain("rotated");
  });

  it("is byte-deterministic across builds", () => {
    const build = () =>
      JSON.stringify(buildJavaModel(census([mesh("prp_a", "mtl_a")], [mat("mtl_a", [0.5, 0.5, 0.5])], { prp_a: [0, 0, 0, 1, 1, 1] }), contract).model);
    expect(build()).toBe(build());
  });
});
