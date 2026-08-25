import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { rmForSetup } from "./helpers/fs.js";
import { assertBlenderIfRequired } from "./helpers/blender-gate.js";

/**
 * The compiler against REAL downloaded assets — the Khronos glTF sample
 * corpus (see fixtures/real/LICENSES.md), not generated primitives.
 *
 * Two capabilities under test:
 *   1. `mesh` source kind — drop a real .glb into a scene directory and
 *      compile it: full census, UV/texture measurement on real PBR data,
 *      lint, proof render, re-export. The compiler as an inspection tool.
 *   2. `file` parts — a declarative scene.json placing a real asset into a
 *      solved scene, fitted to its declared box, with claims adjudicated
 *      against the real measured geometry.
 */
const hasBlender = (await probeBlender({})) !== null;
assertBlenderIfRequired(hasBlender);

describe.skipIf(!hasBlender)("real assets (Khronos corpus, real Blender)", () => {
  const fixture = (name: string) => path.join(__dirname, "fixtures", name);
  let workSeq = 0;
  const workDir = (name: string) => {
    const dir = path.join(__dirname, ".work", `${name.replace(/[\\/]/g, "_")}-real-${++workSeq}`);
    rmForSetup(dir);
    fs.cpSync(fixture(name), dir, { recursive: true });
    return dir;
  };
  const LONG = 300_000;

  /** Sum of triangles across a GLB's mesh primitives, from its JSON chunk. */
  const glbTriangles = (file: string): number => {
    const buf = fs.readFileSync(file);
    const jsonLen = buf.readUInt32LE(12);
    const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
    let tris = 0;
    for (const mesh of gltf.meshes ?? []) {
      for (const p of mesh.primitives ?? []) {
        const acc = p.indices !== undefined ? p.indices : p.attributes.POSITION;
        tris += gltf.accessors[acc].count / 3;
      }
    }
    return tris;
  };

  it("authors decimated LOD GLBs beside the base export, with the base untouched", async () => {
    const dir = workDir("real/helmet");
    fs.writeFileSync(
      path.join(dir, "scene3d.json"),
      JSON.stringify({
        schemaVersion: 1,
        conventions: {
          naming: { objectPattern: "^.+$", forbidDefaultNames: false },
          geometry: { allowOpenMeshes: true, requireAppliedScale: false },
          pbr: { metallicValues: [] },
          uv: { allowFlipped: true, maxOverlapFraction: 1 },
        },
        export: { formats: ["glb"], lod: [0.5, 0.25] },
      }),
      "utf8",
    );
    // Exported-bytes assertions only — no render is read.
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "export", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.summary.errors).toBe(0);
    // Base + two LOD levels ship as deliverables.
    expect(result.exportedAssets).toContain("out/scene.glb");
    expect(result.exportedAssets).toContain("out/scene.lod1.glb");
    expect(result.exportedAssets).toContain("out/scene.lod2.glb");

    const base = glbTriangles(path.join(dir, "out", "scene.glb"));
    const lod1 = glbTriangles(path.join(dir, "out", "scene.lod1.glb"));
    const lod2 = glbTriangles(path.join(dir, "out", "scene.lod2.glb"));
    // Monotonic decimation: each level has meaningfully fewer triangles, and
    // the base is NOT decimated (the master scene was left intact).
    expect(base).toBeGreaterThan(10_000);
    expect(lod1).toBeLessThan(base * 0.65); // ~0.5, with decimator slack
    expect(lod2).toBeLessThan(lod1 * 0.65); // ~0.25 of base
    // Master parity still holds — LOD ran after it was measured.
    expect(result.issues.some((i) => i.code === "S3D-E-901")).toBe(false);
  }, 400_000);

  it("decimates a morph-target (shape-key) mesh instead of shipping it full-res", async () => {
    // Regression: a topology-changing DECIMATE cannot apply to a mesh with
    // shape keys (glTF morph targets), so without clearing them the LOD would
    // silently ship at full resolution. The runner clears shape keys on the
    // LOD copy; the base keeps its morph, the LOD is genuinely decimated.
    const dir = path.join(__dirname, ".work", `lod-morph-real-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "build.py"),
      [
        "import bpy",
        "for o in list(bpy.data.objects):",
        "    bpy.data.objects.remove(o, do_unlink=True)",
        "bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5)",
        "obj = bpy.context.active_object",
        'obj.name = "prp_morphball"',
        'obj.data.materials.append(bpy.data.materials.new("mtl_ball"))',
        'obj.shape_key_add(name="Basis")',
        'key = obj.shape_key_add(name="Squash")',
        "for v in key.data:",
        "    v.co.z *= 0.5",
        // A bpy scene is authored, not auto-staged: give it a camera and a sun
        // so it is a complete scene (no S3D-E-381).
        'cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))',
        "bpy.context.scene.collection.objects.link(cam)",
        "cam.location = (3.0, -3.0, 2.0)",
        "bpy.context.scene.camera = cam",
        'sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", type="SUN"))',
        "bpy.context.scene.collection.objects.link(sun)",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "scene3d.json"),
      JSON.stringify({
        schemaVersion: 1,
        conventions: {
          naming: { objectPattern: "^.+$", forbidDefaultNames: false },
          geometry: { allowOpenMeshes: true, requireAppliedScale: false },
          pbr: { metallicValues: [] },
          uv: { require: "off" },
        },
        export: { formats: ["glb"], lod: [0.5] },
      }),
      "utf8",
    );
    // Exported-bytes assertions only — no render is read.
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "export", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.summary.errors).toBe(0);

    const base = glbTriangles(path.join(dir, "out", "scene.glb"));
    const lod1 = glbTriangles(path.join(dir, "out", "scene.lod1.glb"));
    // Genuinely decimated — NOT a full-res no-op (which is what the shape key
    // would have caused before the fix).
    expect(lod1).toBeLessThan(base * 0.65);

    // The base still carries the morph target; the LOD dropped it to decimate.
    const buf = fs.readFileSync(path.join(dir, "out", "scene.glb"));
    const gltf = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
    expect((gltf.meshes[0].primitives[0].targets ?? []).length).toBeGreaterThan(0);
  }, 400_000);

  it("compiles the Damaged Helmet from a bare .glb: census, UVs, textures, proof, re-export", async () => {
    const dir = workDir("real/helmet");
    // The proof assertion below needs frames to EXIST with real coverage —
    // one still frame carries that fact; the turntable does not add to it.
    const result = await compile({
      projectDir: dir,
      proof: { turntable: false },
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.source.kind).toBe("mesh");
    expect(result.source.files).toEqual(["DamagedHelmet.glb"]);
    expect(result.summary.errors).toBe(0);
    // A bare imported asset stays a PROP: the compiler's own staging
    // camera (census.camera.staging) must not demote it to "scene" —
    // framing a crate to photograph it does not change what it is.
    expect(result.census!.camera.staging).toBe(true);
    expect(result.manifest.assetKind).toBe("prop");

    // Real measured geometry, not a placeholder: the helmet is a genuine
    // ~15k-triangle scanned asset with one full PBR material.
    const mesh = result.census!.meshes[0]!;
    expect(mesh.tris).toBeGreaterThan(10_000);
    expect(mesh.uv).toBeTruthy();
    expect(mesh.uv!.sampled).toBe(true);
    // A production-unwrapped asset: measured, and measurably sane.
    expect(mesh.uv!.coverage).toBeGreaterThan(0.3);
    expect(mesh.uv!.texelDensity).toBeTruthy();
    // Sander UV stretch is measured on the real unwrap: anisotropy is a ratio
    // ≥ 1 (1 = conformal), and a production unwrap keeps it bounded.
    expect(mesh.uv!.stretch).toBeTruthy();
    expect(mesh.uv!.stretch!.max).toBeGreaterThanOrEqual(1);
    expect(mesh.uv!.stretch!.mean).toBeGreaterThanOrEqual(1);
    expect(mesh.uv!.stretch!.mean).toBeLessThan(mesh.uv!.stretch!.max + 0.001);
    // The deeper analytics measured real statistical metadata: density
    // allocation and bilateral symmetry, both invisible in any render.
    expect(mesh.surfaceArea).toBeGreaterThan(0);
    expect(mesh.triDensity).toBeGreaterThan(0);
    expect(mesh.symmetry).toBeTruthy();
    // The helmet is a near-symmetric scan: its mirror error is real but
    // small relative to its ~0.9m bounding size.
    expect(mesh.symmetry!.maxError).toBeLessThan(0.1);
    // The embedded PBR texture set came through the importer.
    expect(result.census!.textures.length).toBeGreaterThanOrEqual(4);
    expect(result.census!.materials.some((m) => m.principled.hasTexture)).toBe(true);

    // The runner staged the bare asset itself: derived camera, sun light.
    expect(result.census!.camera.present).toBe(true);
    expect(result.census!.lightCount).toBeGreaterThan(0);

    // Proof frames rendered with real coverage, and the asset re-exported.
    expect(result.proofImages.length).toBeGreaterThan(0);
    expect(result.exportedAssets.some((a) => a.endsWith(".glb"))).toBe(true);
    expect(result.exportedAssets.some((a) => a.endsWith(".usda"))).toBe(true);
  }, 400_000);

  it("compiles the rigged Fox and reports what it actually is", async () => {
    const dir = workDir("real/fox");
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.summary.errors).toBe(0);
    // The Fox is a genuinely low-poly production asset: 576 triangles,
    // every one an open (non-manifold) game-mesh face — which is exactly
    // why conventions.geometry.allowOpenMeshes exists.
    const fox = result.census!.meshes.find((m) => m.verts > 100)!;
    expect(fox.tris).toBe(576);
    // The Fox ships three armature animations; the census must see motion
    // rather than reporting a static prop.
    expect(result.census!.animation.frameEnd).toBeGreaterThan(result.census!.animation.frameStart);
  });

  it("places the real helmet into a declarative scene via a file part", async () => {
    const dir = path.join(__dirname, ".work", `real-helmet-scene-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
    fs.cpSync(fixture("real/helmet/DamagedHelmet.glb"), path.join(dir, "assets", "DamagedHelmet.glb"));
    fs.cpSync(fixture("real/helmet/scene3d.json"), path.join(dir, "scene3d.json"));
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        materials: {
          mtl_plinth: { baseColor: [0.3, 0.3, 0.32], roughness: 0.4, metallic: 0 },
        },
        parts: [
          { id: "prp_plinth", size: [0.6, 0.6, 0.5], material: "mtl_plinth" },
          { id: "prp_helmet", size: [0.4, 0.4, 0.4], file: "assets/DamagedHelmet.glb" },
        ],
        relations: [
          { type: "at", part: "prp_plinth", center: [0, 0, 0.25] },
          { type: "sits_on", part: "prp_helmet", on: "prp_plinth" },
          { type: "align", part: "prp_helmet", to: "prp_plinth", axes: ["x", "y"] },
        ],
        claims: { parts: 2, grounded: true, materialsUsed: ["mtl_plinth"] },
      }),
      "utf8",
    );
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.summary.errors).toBe(0);
    // The real asset became a named part, fitted INSIDE its declared box,
    // resting on the box bottom (which sits_on sank 1mm into the plinth).
    const helmet = result.census!.meshes.find((m) => m.object === "prp_helmet")!;
    expect(helmet.tris).toBeGreaterThan(10_000);
    const spatial = helmet.spatial!;
    expect(spatial.size[0]).toBeLessThanOrEqual(0.4 + 1e-6);
    expect(spatial.size[1]).toBeLessThanOrEqual(0.4 + 1e-6);
    expect(spatial.size[2]).toBeLessThanOrEqual(0.4 + 1e-6);
    expect(Math.max(...spatial.size)).toBeCloseTo(0.4, 3);
    expect(spatial.worldMin[2]).toBeCloseTo(0.5 - 0.001, 6);
    // Its real material survived the import — the exact one, because
    // "at least one" is also true after a merge/drop regression leaves a
    // stray behind.
    expect(helmet.materials).toEqual(["Material_MR"]);
    // Provenance points at the scene.json the author wrote.
    expect(result.census!.provenance!.prp_helmet!.file).toBe("scene.json");
  }, 400_000);

  it("rejects a file part whose asset does not exist, at parse time", async () => {
    const dir = path.join(__dirname, ".work", `real-missing-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        parts: [{ id: "prp_ghost", size: [1, 1, 1], file: "assets/nope.glb" }],
        relations: [{ type: "at", part: "prp_ghost", center: [0, 0, 0.5] }],
      }),
      "utf8",
    );
    const result = await compile({ projectDir: dir, stages: ["parse", "lint"], timeoutMs: LONG });
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (i) => i.code === "S3D-E-105" && i.message.includes("assets/nope.glb"),
      ),
    ).toBe(true);
  });
});
