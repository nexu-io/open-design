import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { ISSUE_CODES } from "../src/errors.js";
import { decodePng, DecodedImage } from "../src/sheet/png.js";
import { rmForSetup } from "./helpers/fs.js";
import { assertBlenderIfRequired } from "./helpers/blender-gate.js";

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
assertBlenderIfRequired(hasBlender);

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
    // The proof assertion below needs a rendered frame to EXIST — one still
    // carries that fact; the turntable adds nothing to it.
    const result = await compile({
      projectDir: dir,
      proof: { turntable: false },
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);

    // The bakes are real files, at the declared resolution, both outputs.
    const base = path.join(dir, "out", "textures", "shd_rust_baseColor.png");
    const rough = path.join(dir, "out", "textures", "shd_rust_roughness.png");
    expect(fs.existsSync(base)).toBe(true);
    expect(fs.existsSync(rough)).toBe(true);
    expect(fs.statSync(base).size).toBeGreaterThan(10_000); // real noise, not a flat fill

    // The bake is the KERNEL's output, not just any 512px image: decoded
    // pixels must sit inside the two authored tones' sRGB range and vary
    // across texels (fbm patina), and the roughness companion must track
    // its own kernel (0.55..0.95 grey, correlated with baseColor patina).
    // A regression that baked an empty/black/flat texture passes every
    // existence check above — only pixel content catches it.
    const baseImg = decodePng(fs.readFileSync(base));
    expect([baseImg.width, baseImg.height]).toEqual([512, 512]);
    let minV = 255;
    let maxV = 0;
    let sumLum = 0;
    const n = baseImg.width * baseImg.height;
    for (let i = 0; i < n; i++) {
      const r = baseImg.data[i * 4]!;
      const g = baseImg.data[i * 4 + 1]!;
      const b = baseImg.data[i * 4 + 2]!;
      expect(baseImg.data[i * 4 + 3]).toBe(255); // fully opaque bake
      const v = Math.max(r, g, b);
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
      sumLum += (r + g + b) / 3;
    }
    // uColorA (0.72,0.45,0.2) → sRGB ≈ (221,179,124); uColorB (0.28,0.16,0.1)
    // → sRGB ≈ (144,111,89). Every texel is a linear mix of the two, then
    // multiplied by the flakes factor 0.85..1.0 — so the floor is B*0.85
    // encoded (≈134,103,82) and the ceiling is A itself. Anything outside
    // this span is not the authored kernel's output.
    for (let i = 0; i < n; i += 997) {
      const r = baseImg.data[i * 4]!;
      const g = baseImg.data[i * 4 + 1]!;
      const b = baseImg.data[i * 4 + 2]!;
      expect(r).toBeGreaterThanOrEqual(133);
      expect(r).toBeLessThanOrEqual(222);
      expect(g).toBeGreaterThanOrEqual(102);
      expect(g).toBeLessThanOrEqual(180);
      expect(b).toBeGreaterThanOrEqual(81);
      expect(b).toBeLessThanOrEqual(125);
    }
    // Real fbm varies: darkest and brightest texels are far apart.
    expect(maxV - minV).toBeGreaterThan(40);
    // Mean luminance sits between the two tones — not black, not blown.
    const meanLum = sumLum / n;
    expect(meanLum).toBeGreaterThan(100);
    expect(meanLum).toBeLessThan(220);

    // Roughness: kernel_roughness emits clamp(0.55 + 0.4*patina) LINEAR grey,
    // and non-baseColor/emission outputs are written RAW (no sRGB encode —
    // that bypass is the colour-management contract). fbm patina lands
    // roughly 0.2..0.8, so bytes span ≈160..220; pin the kernel's own floor
    // (0.55 → 140) and ceiling (0.95 → 242) with the observed spread inside.
    const roughImg = decodePng(fs.readFileSync(rough));
    expect([roughImg.width, roughImg.height]).toEqual([512, 512]);
    let roughMin = 255;
    let roughMax = 0;
    for (let i = 0; i < roughImg.width * roughImg.height; i++) {
      const v = roughImg.data[i * 4]!;
      if (v < roughMin) roughMin = v;
      if (v > roughMax) roughMax = v;
    }
    expect(roughMin).toBeGreaterThanOrEqual(140);
    expect(roughMax).toBeLessThanOrEqual(242);
    expect(roughMax - roughMin).toBeGreaterThan(20); // tracks the patina, not flat

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

  it("tiles periodic noise seamlessly and bleeds RGB into transparent texels", async () => {
    // Two texture-quality fixes, verified on the real bake:
    //  - s3d_fbm_tiled wraps the lattice, so its wrap seam is far smaller
    //    than plain s3d_fbm, which jumps randomly where the tile repeats.
    //  - dilation floods the disc's colour into the transparent surround, so
    //    a texel just outside the alpha edge is coloured, not black (the
    //    dark-fringe fix), while its alpha stays zero.
    const dir = path.join(__dirname, ".work", `bake-quality-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.cpSync(fixture("good/spec_shaded/scene3d.json"), path.join(dir, "scene3d.json"));
    fs.writeFileSync(
      path.join(dir, "tiled.glsl"),
      "vec4 kernel(vec2 uv) {\n  float v = s3d_fbm_tiled(uv * 4.0, vec2(4.0));\n  return vec4(vec3(v), 1.0);\n}\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "plain.glsl"),
      "vec4 kernel(vec2 uv) {\n  float v = s3d_fbm(uv * 4.0);\n  return vec4(vec3(v), 1.0);\n}\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "disc.glsl"),
      "vec4 kernel(vec2 uv) {\n  float d = distance(uv, vec2(0.5));\n  float a = step(d, 0.4);\n  return vec4(1.0, 0.4, 0.1, a);\n}\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        shaders: {
          shd_tiled: { kernel: "tiled.glsl", size: 64, outputs: ["baseColor"] },
          shd_plain: { kernel: "plain.glsl", size: 64, outputs: ["baseColor"] },
          shd_disc: { kernel: "disc.glsl", size: 64, outputs: ["baseColor"] },
        },
        materials: {
          mtl_tiled: { shader: "shd_tiled" },
          mtl_plain: { shader: "shd_plain" },
          mtl_disc: { shader: "shd_disc" },
        },
        parts: [
          { id: "prp_tiled", size: [0.2, 0.2, 0.2], material: "mtl_tiled" },
          { id: "prp_plain", size: [0.2, 0.2, 0.2], material: "mtl_plain" },
          { id: "prp_disc", size: [0.2, 0.2, 0.2], material: "mtl_disc" },
        ],
        relations: [
          { type: "at", part: "prp_tiled", center: [-0.4, 0, 0.1] },
          { type: "at", part: "prp_plain", center: [0, 0, 0.1] },
          { type: "at", part: "prp_disc", center: [0.4, 0, 0.1] },
        ],
      }),
      "utf8",
    );
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.ok).toBe(true);

    const tex = (n: string) =>
      decodePng(fs.readFileSync(path.join(dir, "out", "textures", n)));
    // Mean per-row difference between the first and last column: the seam that
    // would show when the texture repeats.
    const wrapSeam = (img: DecodedImage) => {
      let sum = 0;
      for (let y = 0; y < img.height; y++) {
        const a = (y * img.width) * 4;
        const b = (y * img.width + img.width - 1) * 4;
        sum += Math.abs(img.data[a]! - img.data[b]!);
      }
      return sum / img.height;
    };
    const tiledSeam = wrapSeam(tex("shd_tiled_baseColor.png"));
    const plainSeam = wrapSeam(tex("shd_plain_baseColor.png"));
    expect(tiledSeam).toBeLessThan(plainSeam * 0.5);

    const disc = tex("shd_disc_baseColor.png");
    // (x=60, y=32): ~28px right of centre, past the 0.4·64 radius, so
    // transparent — yet within the dilation band, so its RGB is bled colour.
    const at = (32 * disc.width + 60) * 4;
    expect(disc.data[at + 3]!).toBeLessThan(16); // alpha untouched — still transparent
    expect(Math.max(disc.data[at]!, disc.data[at + 1]!, disc.data[at + 2]!)).toBeGreaterThan(40);
  }, 400_000);

  it("bakes a motion-vector atlas whose flow tracks the beauty animation", async () => {
    const dir = path.join(__dirname, ".work", `mv-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.cpSync(fixture("good/spec_flame/scene3d.json"), path.join(dir, "scene3d.json"));
    // A bright dot that slides steadily to the RIGHT as time advances.
    fs.writeFileSync(
      path.join(dir, "slide.glsl"),
      "vec4 kernel(vec2 uv) {\n  vec2 c = vec2(0.2 + uS3dTime * 0.3, 0.5);\n  float v = smoothstep(0.14, 0.0, distance(uv, c));\n  return vec4(vec3(v), 1.0);\n}\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        shaders: { shd_slide: { kernel: "slide.glsl", size: 64, frames: 8, motionVectors: true } },
        parts: [{ id: "prp_stub", size: [0.2, 0.2, 0.2] }],
        relations: [{ type: "at", part: "prp_stub", center: [0, 0, 0.1] }],
      }),
      "utf8",
    );
    const result = await compile({
      projectDir: dir,
      // The mv atlas ships as an export deliverable; no render is consumed.
      stages: ["parse", "build", "lint", "export"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.ok).toBe(true);

    const mvPath = path.join(dir, "out", "textures", "shd_slide_mv.png");
    expect(fs.existsSync(mvPath)).toBe(true);
    // It ships as a companion deliverable beside the beauty atlas.
    expect(result.exportedAssets).toContain("out/textures/shd_slide_mv.png");

    // Frame 0 sits at grid cell (0,0); the dot centre is near (x≈13, y≈32).
    // The dot moves right, so the flow there encodes positive dx — the red
    // channel is above the 0.5 (=127) no-motion midpoint.
    const mv = decodePng(fs.readFileSync(mvPath));
    let sumR = 0;
    let count = 0;
    for (let y = 28; y < 36; y++) {
      for (let x = 9; x < 18; x++) {
        sumR += mv.data[(y * mv.width + x) * 4]!;
        count++;
      }
    }
    expect(sumR / count).toBeGreaterThan(140); // clearly rightward, not the 127 midpoint
  }, 400_000);

  it("keeps the real deliverables on a restricted recompile of a motion-vector scene", async () => {
    // Regression: the mv atlas is written during BUILD, so pushing it into
    // exportedAssets unconditionally made a no-export recompile skip the
    // manifest carry-forward and clobber the real deliverables down to just
    // the mv PNG. The push is gated on the export stage; the restricted pass
    // must still carry scene.glb forward.
    const dir = path.join(__dirname, ".work", `mv-carry-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.cpSync(fixture("good/spec_flame/scene3d.json"), path.join(dir, "scene3d.json"));
    fs.writeFileSync(
      path.join(dir, "slide.glsl"),
      "vec4 kernel(vec2 uv) {\n  vec2 c = vec2(0.2 + uS3dTime * 0.3, 0.5);\n  float v = smoothstep(0.14, 0.0, distance(uv, c));\n  return vec4(vec3(v), 1.0);\n}\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        shaders: { shd_slide: { kernel: "slide.glsl", size: 64, frames: 8, motionVectors: true } },
        parts: [{ id: "prp_stub", size: [0.2, 0.2, 0.2] }],
        relations: [{ type: "at", part: "prp_stub", center: [0, 0, 0.1] }],
      }),
      "utf8",
    );
    const full = await compile({
      projectDir: dir,
      // Manifest INCLUDED: the restricted pass below proves the manifest
      // carry-forward, which can only carry from a manifest this compile
      // wrote. Skipping proof keeps the speed; skipping manifest removed
      // the very artifact under test.
      stages: ["parse", "build", "lint", "export", "manifest"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(full.ok).toBe(true);
    expect(full.exportedAssets.some((a) => a.endsWith("scene.glb"))).toBe(true);
    expect(full.exportedAssets).toContain("out/textures/shd_slide_mv.png");

    const restricted = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint", "manifest"],
      timeoutMs: LONG,
      noCache: true,
    });
    // The manifest carried the real deliverable forward — not clobbered to
    // just the mv atlas.
    expect(restricted.exportedAssets.some((a) => a.endsWith("scene.glb"))).toBe(true);
  }, 400_000);

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
