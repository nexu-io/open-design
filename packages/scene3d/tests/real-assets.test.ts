import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { rmForSetup } from "./helpers/fs.js";

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

  it("compiles the Damaged Helmet from a bare .glb: census, UVs, textures, proof, re-export", async () => {
    const dir = workDir("real/helmet");
    const result = await compile({ projectDir: dir, timeoutMs: LONG, noCache: true });
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
    // Its real materials survived the import.
    expect(helmet.materials!.length).toBeGreaterThan(0);
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
