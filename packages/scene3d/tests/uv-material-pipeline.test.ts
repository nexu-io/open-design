import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { ISSUE_CODES } from "../src/errors.js";
import { rmForSetup } from "./helpers/fs.js";
import { assertBlenderIfRequired } from "./helpers/blender-gate.js";

/**
 * The UV / texture-file / engine-hygiene rules against REAL Blender output.
 *
 * The unit suite proves each rule's mapping from census to code; this suite
 * proves the other half — that the runner actually measures real geometry
 * into the census shape the rules read. Every defect is authored as real
 * bpy geometry in a fixture, compiled through the real runner, and pinned
 * to its (code, target) pair. The `good/textured_prop` fixture is the
 * calibration control: a properly made textured asset on which every new
 * rule must stay silent, because a gate that flags good work is noise.
 */
const hasBlender = (await probeBlender({})) !== null;
assertBlenderIfRequired(hasBlender);

describe.skipIf(!hasBlender)("uv/material/hygiene rules (real Blender)", () => {
  const fixture = (name: string) => path.join(__dirname, "fixtures", name);
  let workSeq = 0;
  let lastWorkDir = "";
  const workDir = (name: string) => {
    const dir = path.join(__dirname, ".work", `${name.replace(/[\\/]/g, "_")}-uvm-${++workSeq}`);
    rmForSetup(dir);
    fs.cpSync(fixture(name), dir, { recursive: true });
    lastWorkDir = dir;
    return dir;
  };
  const fixtureWorkOf = (_result: unknown) => lastWorkDir;
  const LONG = 300_000;

  it("carries a texture through all six stages: build, proof, export, manifest", async () => {
    // The FULL pipeline, not the lint-only fast path: a real EEVEE proof
    // render, real exporters, and a manifest — with a textured material.
    // The GLB must embed the image (baseColorTexture + TEXCOORD_0 + a PNG
    // bufferView), because that is what the kit viewer's texture path and
    // every downstream engine import consume. The proof assertion needs a
    // rendered frame to EXIST — one still carries that fact; the turntable
    // adds nothing to it.
    const result = await compile({
      projectDir: workDir("good/textured_prop"),
      proof: { turntable: false },
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.proofImages.length).toBeGreaterThan(0);
    const glbPath = result.exportedAssets.find((asset) => asset.endsWith(".glb"))!;
    expect(glbPath).toBeTruthy();
    const buffer = fs.readFileSync(path.join(fixtureWorkOf(result), glbPath));
    const jsonLength = buffer.readUInt32LE(12);
    const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
    expect(gltf.images?.[0]?.mimeType).toBe("image/png");
    expect(gltf.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture?.index).toBe(0);
    expect(gltf.meshes?.[0]?.primitives?.[0]?.attributes?.TEXCOORD_0).toBeDefined();
    // The census-side texture record agrees with what shipped.
    expect(result.census!.textures[0]!.name).toBe("tex_box_diffuse");
  }, 400_000);

  it("stays silent on a properly made textured asset", async () => {
    const result = await compile({
      projectDir: workDir("good/textured_prop"),
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
    });
    const codes = new Set(result.issues.map((issue) => issue.code));
    for (const code of [
      ISSUE_CODES.UV_MISSING,
      ISSUE_CODES.UV_OVERLAP,
      ISSUE_CODES.UV_FLIPPED,
      ISSUE_CODES.UV_OUT_OF_BOUNDS,
      ISSUE_CODES.UV_UNCHECKED,
      ISSUE_CODES.TEXEL_DENSITY_SPREAD,
      ISSUE_CODES.TEXEL_DENSITY_TARGET,
      ISSUE_CODES.TEXTURE_FILE_MISSING,
      ISSUE_CODES.TEXTURE_NOT_POWER_OF_TWO,
      ISSUE_CODES.TEXTURE_TOO_LARGE,
      ISSUE_CODES.DUPLICATE_MATERIALS,
      ISSUE_CODES.FACES_WITHOUT_MATERIAL,
      ISSUE_CODES.LOOSE_GEOMETRY,
      ISSUE_CODES.DOUBLE_VERTICES,
      ISSUE_CODES.INCONSISTENT_WINDING,
      ISSUE_CODES.NEGATIVE_SCALE,
      ISSUE_CODES.UNAPPLIED_SCALE,
    ]) {
      expect(codes.has(code), `unexpected ${code} on the clean fixture`).toBe(false);
    }

    // And the runner really measured — this is not silence-by-omission.
    const mesh = result.census!.meshes.find((m) => m.object === "prp_box")!;
    expect(mesh.uv).toBeTruthy();
    expect(mesh.uv!.sampled).toBe(true);
    expect(mesh.uv!.overlapFraction).toBe(0);
    expect(mesh.uv!.flippedFaces).toBe(0);
    expect(mesh.uv!.texelDensity).toBeTruthy();
    expect(mesh.materials).toEqual(["mtl_box_wood"]);
  });

  it("pins every UV and texture-file defect to its part", async () => {
    const result = await compile({
      projectDir: workDir("poisoned/uv-material"),
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
    });
    const pairs = new Set(result.issues.map((issue) => `${issue.code}@${issue.target ?? ""}`));
    const has = (code: string, target: string) => pairs.has(`${code}@${target}`);

    expect(has(ISSUE_CODES.UV_MISSING, "prp_no_uv")).toBe(true);
    expect(has(ISSUE_CODES.UV_OVERLAP, "prp_overlap")).toBe(true);
    expect(has(ISSUE_CODES.UV_FLIPPED, "prp_flipped")).toBe(true);
    // The in-place mirror moved no island, so it must not read as overlap.
    expect(has(ISSUE_CODES.UV_OVERLAP, "prp_flipped")).toBe(false);
    expect(
      result.issues.some((issue) => issue.code === ISSUE_CODES.TEXEL_DENSITY_SPREAD),
    ).toBe(true);
    expect(has(ISSUE_CODES.TEXTURE_FILE_MISSING, "tex_ghost")).toBe(true);
    expect(has(ISSUE_CODES.TEXTURE_NOT_POWER_OF_TWO, "tex_npot")).toBe(true);
    expect(has(ISSUE_CODES.TEXTURE_TOO_LARGE, "tex_huge")).toBe(true);
    expect(
      result.issues.some(
        (issue) =>
          issue.code === ISSUE_CODES.DUPLICATE_MATERIALS &&
          JSON.stringify(issue.detail).includes("mtl_twin_two"),
      ),
    ).toBe(true);
    expect(has(ISSUE_CODES.FACES_WITHOUT_MATERIAL, "prp_partial_mat")).toBe(true);

    // The healthy neighbours in the same scene stay unflagged.
    expect(has(ISSUE_CODES.UV_OVERLAP, "prp_dense_a")).toBe(false);
    expect(has(ISSUE_CODES.UV_FLIPPED, "prp_dense_a")).toBe(false);
    expect(has(ISSUE_CODES.TEXTURE_NOT_POWER_OF_TWO, "tex_shared_diffuse")).toBe(false);
  });

  it("pins every engine-hygiene defect to its part and clears the control", async () => {
    const result = await compile({
      projectDir: workDir("poisoned/geometry-hygiene"),
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
    });
    const pairs = new Set(result.issues.map((issue) => `${issue.code}@${issue.target ?? ""}`));
    const has = (code: string, target: string) => pairs.has(`${code}@${target}`);

    expect(has(ISSUE_CODES.LOOSE_GEOMETRY, "prp_loose")).toBe(true);
    expect(has(ISSUE_CODES.DOUBLE_VERTICES, "prp_double_seam")).toBe(true);
    expect(has(ISSUE_CODES.INCONSISTENT_WINDING, "prp_windflip")).toBe(true);
    expect(has(ISSUE_CODES.NEGATIVE_SCALE, "prp_mirrored")).toBe(true);
    expect(has(ISSUE_CODES.UNAPPLIED_SCALE, "prp_scaled")).toBe(true);
    // Negative scale must not double-report as merely "unapplied".
    expect(has(ISSUE_CODES.UNAPPLIED_SCALE, "prp_mirrored")).toBe(false);

    for (const code of [
      ISSUE_CODES.LOOSE_GEOMETRY,
      ISSUE_CODES.DOUBLE_VERTICES,
      ISSUE_CODES.INCONSISTENT_WINDING,
      ISSUE_CODES.NEGATIVE_SCALE,
      ISSUE_CODES.UNAPPLIED_SCALE,
    ]) {
      expect(has(code, "prp_clean"), `${code} leaked onto the clean control`).toBe(false);
    }
  });
});
