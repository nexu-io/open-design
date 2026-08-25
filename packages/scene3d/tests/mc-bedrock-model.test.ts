import { describe, expect, it } from "vitest";
import { buildBedrockModel } from "../src/mc/bedrock-model.js";
import { normalizeContract } from "../src/contract.js";
import { decodePng } from "../src/sheet/png.js";
import type { Census, CensusMaterial, CensusMesh } from "../src/types.js";

/**
 * The Bedrock geometry lowering in isolation. It shares the Java exporter's
 * validated frame map (proven by the round-trip pipeline test), so cube
 * origin/size need only be spot-checked here; this pins the Bedrock-specific
 * shape: the geometry container, the per-material atlas, per-face UVs into it,
 * skip semantics, and determinism.
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
    sceneName: "test",
    objects: meshes.map((m) => {
      const b = bounds[m.object]!;
      return { name: m.object, type: "MESH", worldMin: [b[0], b[1], b[2]], worldMax: [b[3], b[4], b[5]] };
    }),
    meshes,
    materials,
    textures: [],
  } as unknown as Census;
}
const contract = normalizeContract({ schemaVersion: 1, target: "minecraft", conventions: { minecraft: { dialect: "bedrock" } } } as never);

describe("buildBedrockModel", () => {
  it("emits a well-formed 1.16 geometry with a root bone and cube", () => {
    const c = census([mesh("prp_a", "mtl_a")], [mat("mtl_a", [0.5, 0.5, 0.5])], { prp_a: [0, 0, 0, 1, 1, 1] });
    const { model, skipped } = buildBedrockModel(c, contract);
    expect(skipped).toEqual([]);
    expect(model.format_version).toBe("1.16.0");
    const geo = model["minecraft:geometry"][0]!;
    expect(geo.description.identifier).toMatch(/^geometry\./);
    expect(geo.bones).toHaveLength(1);
    expect(geo.bones[0]!.name).toBe("root");
    const cube = geo.bones[0]!.cubes[0]!;
    // Shares the Java frame map: unit cube → origin [0,0,-16], size [16,16,16].
    expect(cube.origin).toEqual([0, 0, -16]);
    expect(cube.size).toEqual([16, 16, 16]);
    // Every face has a modern per-face UV rect.
    expect(Object.keys(cube.uv).sort()).toEqual(["down", "east", "north", "south", "up", "west"]);
    for (const f of Object.values(cube.uv)) expect(f.uv_size).toEqual([16, 16]);
  });

  it("packs materials into a vertical atlas and points cubes at their row", () => {
    const c = census(
      [mesh("prp_a", "mtl_a"), mesh("prp_b", "mtl_b"), mesh("prp_c", "mtl_a")],
      [mat("mtl_a", [0.6, 0.4, 0.3]), mat("mtl_b", [0.2, 0.5, 0.9])],
      { prp_a: [0, 0, 0, 1, 1, 1], prp_b: [1, 0, 0, 2, 1, 1], prp_c: [2, 0, 0, 3, 1, 1] },
    );
    const { model, texture } = buildBedrockModel(c, contract);
    const geo = model["minecraft:geometry"][0]!;
    // Two materials → a 16×32 atlas, two rows.
    expect(geo.description.texture_width).toBe(16);
    expect(geo.description.texture_height).toBe(32);
    const img = decodePng(texture.png);
    expect(img.height).toBe(32);
    // Cubes A and C (mtl_a) share row 0; B (mtl_b) is row 1.
    const rows = geo.bones[0]!.cubes.map((cu) => cu.uv.north!.uv[1]);
    expect(rows).toEqual([0, 16, 0]);
    // The atlas rows carry each material's colour (top row A, second row B).
    const topPixel = [img.data[0], img.data[1], img.data[2]];
    const secondRowStart = 16 * 16 * 4;
    const secondPixel = [img.data[secondRowStart], img.data[secondRowStart + 1], img.data[secondRowStart + 2]];
    expect(topPixel).not.toEqual(secondPixel); // distinct material colours
  });

  it("skips a non-cuboid and a rotated box with a reason", () => {
    const c = census(
      [mesh("prp_orb", "mtl_a", { ...AXIS_BOX, isBox: false }), mesh("prp_spin", "mtl_a", { isBox: true, axisAligned: false, rotationAxis: "z", rotationDeg: 30, gridDeviation: 0 }), mesh("prp_box", "mtl_a")],
      [mat("mtl_a", [0.5, 0.5, 0.5])],
      { prp_orb: [0, 0, 0, 1, 1, 1], prp_spin: [0, 0, 0, 1, 1, 1], prp_box: [0, 0, 0, 1, 1, 1] },
    );
    const { model, skipped } = buildBedrockModel(c, contract);
    expect(model["minecraft:geometry"][0]!.bones[0]!.cubes).toHaveLength(1);
    const reasons = new Map(skipped.map((s) => [s.object, s.reason]));
    expect(reasons.get("prp_orb")).toContain("cuboid");
    expect(reasons.get("prp_spin")).toContain("rotated");
  });

  it("emits an oriented cube with rotation, pivot, and un-rotated size (not the world AABB)", () => {
    // A 0.5×0.5×1 box centred at (0,0,0.5), rotated 22.5° about Blender Z.
    // Frame map (x,y,z)→(x,z,−y): centre→pivot [0,8,0]; localSize [0.5,0.5,1]→
    // size [8,16,8]; origin = pivot − size/2 = [−4,0,−4]; Blender-Z rotation →
    // MC-Y rotation +22.5 (exact conjugation).
    const rotated: Voxel = {
      isBox: true, axisAligned: false, rotationAxis: "z", rotationDeg: 22.5, gridDeviation: 0,
      center: [0, 0, 0.5], localSize: [0.5, 0.5, 1],
    };
    const c = census([mesh("prp_spun", "mtl_a", rotated)], [mat("mtl_a", [0.5, 0.5, 0.5])], { prp_spun: [-0.4, -0.4, 0, 0.4, 0.4, 1] });
    const cube = buildBedrockModel(c, contract).model["minecraft:geometry"][0]!.bones[0]!.cubes[0]! as {
      origin: number[]; size: number[]; pivot: number[]; rotation: number[];
    };
    expect(cube.size).toEqual([8, 16, 8]);
    expect(cube.pivot).toEqual([0, 8, 0]);
    expect(cube.origin).toEqual([-4, 0, -4]);
    expect(cube.rotation).toEqual([0, 22.5, 0]);
  });

  it("maps each rotation axis by exact frame conjugation", () => {
    const spun = (axis: "x" | "y" | "z"): Voxel => ({ isBox: true, axisAligned: false, rotationAxis: axis, rotationDeg: 30, gridDeviation: 0, center: [0, 0, 0], localSize: [1, 1, 1] });
    const rot = (axis: "x" | "y" | "z") =>
      (buildBedrockModel(census([mesh("p", "mtl_a", spun(axis))], [mat("mtl_a", [0.5, 0.5, 0.5])], { p: [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5] }), contract)
        .model["minecraft:geometry"][0]!.bones[0]!.cubes[0]! as { rotation: number[] }).rotation;
    expect(rot("x")).toEqual([30, 0, 0]); // Blender X → MC X (+θ)
    expect(rot("z")).toEqual([0, 30, 0]); // Blender Z → MC Y (+θ)
    expect(rot("y")).toEqual([0, 0, -30]); // Blender Y → MC Z (−θ)
  });

  it("is byte-deterministic", () => {
    const build = () =>
      JSON.stringify(buildBedrockModel(census([mesh("prp_a", "mtl_a")], [mat("mtl_a", [0.5, 0.5, 0.5])], { prp_a: [0, 0, 0, 1, 1, 1] }), contract).model);
    expect(build()).toBe(build());
  });
});

describe("multi-material cubes (bug-shaker round)", () => {
  it("names the flatten when a cube wears more than one material", () => {
    // A cube maps to one atlas row; the export proceeds on the first slot,
    // but the degradation must be SAID — a silent [0] read painted
    // multi-material cuboids wrong with nothing in the report.
    const m = mesh("prp_multi", "mtl_a");
    (m as { materials?: string[] }).materials = ["mtl_a", "mtl_b"];
    const c = census([m], [mat("mtl_a", [0.6, 0.4, 0.3]), mat("mtl_b", [0.2, 0.5, 0.9])], {
      prp_multi: [0, 0, 0, 1, 1, 1],
    });
    const { model, skipped } = buildBedrockModel(c, contract);
    // The cube still ships (with the first material's row)…
    expect(model["minecraft:geometry"][0]!.bones[0]!.cubes).toHaveLength(1);
    // …and the flatten is named.
    const note = skipped.find((s) => s.object === "prp_multi");
    expect(note).toBeDefined();
    expect(note!.reason).toContain("2 materials");
    expect(note!.reason).toContain("mtl_a");
  });
});
