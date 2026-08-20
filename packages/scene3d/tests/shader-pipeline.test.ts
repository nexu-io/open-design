import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { ISSUE_CODES } from "../src/errors.js";
import { rmForSetup } from "./helpers/fs.js";

/**
 * The shader pipeline on the REAL GPU: kernels compiled by the actual
 * driver, executed offscreen, scanned, baked, and wired into materials
 * that the census measures and the proof renders. The pure suite proved
 * the validator and the assembler; this suite proves the driver contract
 * — including both failure modes (compile rejection with the driver's
 * log, and the non-finite oracle catching a kernel that executes but
 * lies).
 */
const hasBlender = (await probeBlender({})) !== null;

describe.skipIf(!hasBlender)("shader pipeline (real GPU)", () => {
  const fixture = (name: string) => path.join(__dirname, "fixtures", name);
  let workSeq = 0;
  const workDir = (name: string) => {
    const dir = path.join(__dirname, ".work", `${name.replace(/[\\/]/g, "_")}-shd-${++workSeq}`);
    rmForSetup(dir);
    fs.cpSync(fixture(name), dir, { recursive: true });
    return dir;
  };
  const LONG = 300_000;

  it("bakes the rust kernel on the GPU and wires it through the whole pipeline", async () => {
    const dir = workDir("good/spec_shaded");
    const result = await compile({ projectDir: dir, timeoutMs: LONG, noCache: true });
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);

    // The bakes are real files, at the declared resolution, both outputs.
    const base = path.join(dir, "out", "textures", "shd_rust_baseColor.png");
    const rough = path.join(dir, "out", "textures", "shd_rust_roughness.png");
    expect(fs.existsSync(base)).toBe(true);
    expect(fs.existsSync(rough)).toBe(true);
    expect(fs.statSync(base).size).toBeGreaterThan(10_000); // real noise, not a flat fill

    // The census sees a textured material: the baked images are bound,
    // measured (512 power-of-two), and the crate's UVs now face the full
    // UV rule set because the mesh is genuinely textured.
    const rusted = result.census!.materials.find((m) => m.name === "mtl_rusted")!;
    expect(rusted.principled.hasTexture).toBe(true);
    expect(result.census!.textures.some((t) => t.name.includes("rust_baseColor"))).toBe(true);
    const crate = result.census!.meshes.find((m) => m.object === "prp_crate")!;
    expect(crate.uv!.texelDensity).toBeTruthy();

    // Proof frames rendered the shaded material; GLB shipped it.
    expect(result.proofImages.length).toBeGreaterThan(0);
    expect(result.exportedAssets.some((a) => a.endsWith(".glb"))).toBe(true);
  }, 400_000);

  it("is deterministic: two fresh compiles bake byte-identical textures", async () => {
    const a = workDir("good/spec_shaded");
    const b = workDir("good/spec_shaded");
    const stages = ["parse", "build", "lint"] as const;
    const first = await compile({ projectDir: a, stages: [...stages], timeoutMs: LONG, noCache: true });
    const second = await compile({ projectDir: b, stages: [...stages], timeoutMs: LONG, noCache: true });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const rel = path.join("out", "textures", "shd_rust_baseColor.png");
    expect(fs.readFileSync(path.join(a, rel))).toEqual(fs.readFileSync(path.join(b, rel)));
  });

  it("surfaces a driver compile rejection as S3D-E-802 with the driver's log", async () => {
    const result = await compile({
      projectDir: workDir("poisoned/spec-shader-bad"),
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.ok).toBe(false);
    const failure = result.issues.find((i) => i.code === ISSUE_CODES.SHADER_COMPILE_FAILED);
    expect(failure).toBeTruthy();
    expect(failure!.message).toContain("shd_bad");
  });

  it("catches a kernel that executes but produces non-finite pixels (S3D-E-804)", async () => {
    const result = await compile({
      projectDir: workDir("poisoned/spec-shader-nan"),
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.ok).toBe(false);
    const failure = result.issues.find((i) => i.code === ISSUE_CODES.SHADER_NONFINITE);
    expect(failure).toBeTruthy();
    expect(failure!.message).toMatch(/\d+ non-finite pixel/);
  });

  it("bakes a 16-frame flame flipbook the 2D sheet rules adjudicate clean", async () => {
    // The bridge into the 2D pipeline: time is a kernel dimension, the
    // atlas grid is derived, and the EXISTING flipbook rules judge the
    // GPU's output like any hand-made sheet.
    const dir = workDir("good/spec_flame");
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    const atlas = path.join(dir, "out", "textures", "shd_flame_baseColor.png");
    expect(fs.existsSync(atlas)).toBe(true);
    // 16 frames at 128px derive a 4x4 grid: a 512x512 power-of-two atlas.
    const png = fs.readFileSync(atlas);
    expect(png.readUInt32BE(16)).toBe(512); // IHDR width
    expect(png.readUInt32BE(20)).toBe(512); // IHDR height
  }, 400_000);

  it("EMERGENT: a flipbook kernel that ignores time fails the static-flipbook rule", async () => {
    const dir = path.join(__dirname, ".work", `flip-static-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.cpSync(fixture("good/spec_flame/scene3d.json"), path.join(dir, "scene3d.json"));
    // A "flipbook" whose kernel never reads uS3dTime: every cell is
    // identical. No shader rule knows about this — the SHEET rule catches
    // it, because the baked atlas is a sheet like any other.
    fs.writeFileSync(
      path.join(dir, "static.glsl"),
      "vec4 kernel(vec2 uv) {\n  float v = uS3dTime * 0.0 + s3d_fbm(uv * 5.0);\n  return vec4(vec3(v), 1.0);\n}\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        shaders: { shd_still: { kernel: "static.glsl", size: 64, frames: 4 } },
        parts: [{ id: "prp_stub", size: [0.2, 0.2, 0.2] }],
        relations: [{ type: "at", part: "prp_stub", center: [0, 0, 0.1] }],
      }),
      "utf8",
    );
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.issues.some((i) => i.code === "S3D-W-601")).toBe(true);
  });

  it("FUZZ: hostile uniform values through the real GPU stay finite", async () => {
    // The bake's own NaN scan is the oracle: every variant compiles into
    // ONE scene (one Blender run), and if any uniform combination drives
    // the kernel non-finite, the compile fails with E-804 naming it.
    const dir = path.join(__dirname, ".work", `shader-fuzz-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.cpSync(fixture("good/spec_shaded/scene3d.json"), path.join(dir, "scene3d.json"));
    fs.cpSync(fixture("good/spec_shaded/rust.glsl"), path.join(dir, "rust.glsl"));
    const variants = [
      { uScale: 0.0001, uColorA: [0, 0, 0], uColorB: [1, 1, 1] },
      { uScale: 512, uColorA: [1, 1, 1], uColorB: [0, 0, 0] },
      { uScale: -8, uColorA: [0.5, 0.5, 0.5], uColorB: [0.5, 0.5, 0.5] },
      { uScale: 1e-30, uColorA: [1, 0, 0], uColorB: [0, 0, 1] },
      { uScale: 99999, uColorA: [0, 1, 0], uColorB: [1, 0, 1] },
    ];
    const shaders: Record<string, unknown> = {};
    const materials: Record<string, unknown> = {};
    const parts: unknown[] = [];
    const relations: unknown[] = [{ type: "at", part: "prp_v0", center: [0, 0, 0.5] }];
    variants.forEach((uniforms, i) => {
      shaders[`shd_v${i}`] = { kernel: "rust.glsl", size: 64, uniforms, outputs: ["baseColor"] };
      materials[`mtl_v${i}`] = { shader: `shd_v${i}` };
      // Each level shrinks: identical aligned footprints would stack with
      // flush side faces, and the compiler correctly flags that as
      // z-fighting — the fuzz scene must be a legal scene.
      const w = 0.5 - i * 0.06;
      parts.push({ id: `prp_v${i}`, size: [w, w, 0.3], material: `mtl_v${i}` });
      if (i > 0) {
        relations.push({ type: "sits_on", part: `prp_v${i}`, on: `prp_v${i - 1}` });
        relations.push({ type: "align", part: `prp_v${i}`, to: `prp_v${i - 1}`, axes: ["x", "y"] });
      }
    });
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({ schemaVersion: 1, shaders, materials, parts, relations }),
      "utf8",
    );
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
    // Every variant really baked.
    for (let i = 0; i < variants.length; i++) {
      expect(fs.existsSync(path.join(dir, "out", "textures", `shd_v${i}_baseColor.png`))).toBe(true);
    }
  }, 400_000);
});
