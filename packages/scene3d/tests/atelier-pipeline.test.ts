import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { rmForSetup } from "./helpers/fs.js";
import { assertBlenderIfRequired } from "./helpers/blender-gate.js";

/**
 * The capstone: one scene exercising the whole system at once, on real
 * assets — the way the tool is actually meant to be used.
 *
 *   - a marble floor whose baseColor, roughness AND surface relief come
 *     from one GPU kernel (height → compiler-derived normal map)
 *   - the real Khronos helmet, keeping its own PBR materials
 *   - the real rigged Fox, its materials OVERRIDDEN by a gold shader —
 *     the retexture-a-download move
 *   - a lava orb (emission kernel) that SPINS — declarative animation,
 *     compiler-owned keyframes
 *   - a water slab (caustics kernel, alpha, low roughness) that BOBS
 *
 * Every claim below is adjudicated against real measured geometry, every
 * texture is a real GPU bake on disk, and the proof render shows all of
 * it under one light rig.
 */
const hasBlender = (await probeBlender({})) !== null;
assertBlenderIfRequired(hasBlender);

const MARBLE = `vec4 kernel(vec2 uv) {
  float warp = s3d_fbm(uv * 3.0);
  float veins = 1.0 - abs(sin((uv.y + warp * 0.8) * 9.0));
  veins = pow(clamp(veins, 0.0, 1.0), 4.0);
  vec3 base = mix(vec3(0.92, 0.9, 0.87), vec3(0.35, 0.33, 0.38), veins * 0.8);
  return vec4(base, 1.0);
}
vec4 kernel_roughness(vec2 uv) {
  float warp = s3d_fbm(uv * 3.0);
  float veins = 1.0 - abs(sin((uv.y + warp * 0.8) * 9.0));
  return vec4(vec3(0.15 + 0.25 * veins), 1.0);
}
vec4 kernel_height(vec2 uv) {
  float warp = s3d_fbm(uv * 3.0);
  float veins = 1.0 - abs(sin((uv.y + warp * 0.8) * 9.0));
  return vec4(vec3(1.0 - pow(clamp(veins, 0.0, 1.0), 4.0) * 0.5), 1.0);
}
`;

const LAVA = `vec4 kernel(vec2 uv) {
  float cracks = s3d_voronoi(uv * uCells);
  float heat = smoothstep(0.22, 0.02, cracks);
  vec3 rock = vec3(0.08, 0.06, 0.06) * (0.7 + 0.3 * s3d_fbm(uv * 12.0));
  return vec4(mix(rock, vec3(1.0, 0.35, 0.05), heat), 1.0);
}
vec4 kernel_emission(vec2 uv) {
  float cracks = s3d_voronoi(uv * uCells);
  float heat = smoothstep(0.2, 0.0, cracks);
  return vec4(vec3(1.0, 0.42, 0.08) * heat, 1.0);
}
`;

const WATER = `vec4 kernel(vec2 uv) {
  float caustic = s3d_voronoi(uv * 10.0 + s3d_fbm(uv * 4.0));
  vec3 deep = vec3(0.02, 0.18, 0.28);
  vec3 glint = vec3(0.5, 0.85, 0.9);
  return vec4(mix(deep, glint, pow(1.0 - clamp(caustic, 0.0, 1.0), 6.0)), 1.0);
}
vec4 kernel_roughness(vec2 uv) {
  return vec4(vec3(0.05), 1.0);
}
`;

describe.skipIf(!hasBlender)("material atelier (real assets, GPU shaders, animation)", () => {
  const fixture = (name: string) => path.join(__dirname, "fixtures", name);
  const LONG = 400_000;

  it("compiles the whole atelier clean and proves every capability at once", async () => {
    const dir = path.join(__dirname, ".work", "atelier");
    rmForSetup(dir);
    fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
    fs.cpSync(fixture("real/helmet/DamagedHelmet.glb"), path.join(dir, "assets", "DamagedHelmet.glb"));
    fs.cpSync(fixture("real/fox/Fox.glb"), path.join(dir, "assets", "Fox.glb"));
    fs.cpSync(fixture("real/helmet/scene3d.json"), path.join(dir, "scene3d.json"));
    fs.writeFileSync(path.join(dir, "marble.glsl"), MARBLE, "utf8");
    fs.writeFileSync(path.join(dir, "lava.glsl"), LAVA, "utf8");
    fs.writeFileSync(path.join(dir, "water.glsl"), WATER, "utf8");
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        name: "atelier",
        shaders: {
          shd_marble: {
            kernel: "marble.glsl",
            size: 512,
            outputs: ["baseColor", "roughness", "height"],
            normalStrength: 2,
          },
          shd_lava: {
            kernel: "lava.glsl",
            size: 256,
            uniforms: { uCells: 5 },
            outputs: ["baseColor", "emission"],
          },
          shd_water: { kernel: "water.glsl", size: 256, outputs: ["baseColor", "roughness"] },
        },
        materials: {
          mtl_marble: { shader: "shd_marble", metallic: 0 },
          mtl_lava: { shader: "shd_lava", roughness: 0.85, emissionStrength: 4 },
          mtl_water: { shader: "shd_water", alpha: 0.7 },
          mtl_gold: { baseColor: [0.85, 0.65, 0.25], roughness: 0.25, metallic: 1 },
        },
        parts: [
          { id: "prp_floor", size: [3, 2, 0.12], material: "mtl_marble" },
          { id: "prp_helmet", size: [0.55, 0.55, 0.55], file: "assets/DamagedHelmet.glb" },
          { id: "prp_fox", size: [0.7, 0.35, 0.5], file: "assets/Fox.glb", material: "mtl_gold" },
          { id: "prp_orb", size: [0.3, 0.3, 0.3], shape: "sphere", material: "mtl_lava", spin: { seconds: 5 } },
          { id: "prp_pool", size: [0.8, 0.8, 0.06], material: "mtl_water", bob: { amplitude: 0.01, seconds: 4 } },
        ],
        relations: [
          { type: "at", part: "prp_floor", center: [0, 0, 0.06] },
          { type: "sits_on", part: "prp_helmet", on: "prp_floor" },
          { type: "inset_from", part: "prp_helmet", from: "prp_floor", faces: ["x-"], by: 0.3 },
          { type: "align", part: "prp_helmet", to: "prp_floor", axes: ["y"] },
          { type: "sits_on", part: "prp_fox", on: "prp_floor" },
          { type: "align", part: "prp_fox", to: "prp_floor", axes: ["y"] },
          { type: "inset_from", part: "prp_fox", from: "prp_floor", faces: ["x+"], by: 0.35 },
          { type: "above", part: "prp_orb", over: "prp_helmet", clearance: 0.25 },
          { type: "align", part: "prp_orb", to: "prp_helmet", axes: ["x", "y"] },
          { type: "sits_on", part: "prp_pool", on: "prp_floor", embed: 0.02 },
          { type: "align", part: "prp_pool", to: "prp_floor", axes: ["y"] },
          { type: "align", part: "prp_pool", to: "prp_floor", axes: ["x"] },
        ],
        camera: { elevationDeg: 24, distance: 2.4 },
        claims: {
          parts: 5,
          grounded: true,
          materialsUsed: ["mtl_marble", "mtl_lava", "mtl_water", "mtl_gold"],
        },
      }),
      "utf8",
    );

    // The proof assertion below needs a rendered frame to EXIST — one still
    // carries that fact; the turntable adds nothing to it.
    const result = await compile({
      projectDir: dir,
      proof: { turntable: false },
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(result.ok).toBe(true);

    // Every bake exists — including the DERIVED normal map.
    const tex = (n: string) => path.join(dir, "out", "textures", n);
    for (const file of [
      "shd_marble_baseColor.png",
      "shd_marble_roughness.png",
      "shd_marble_height.png",
      "shd_marble_normal.png",
      "shd_lava_baseColor.png",
      "shd_lava_emission.png",
      "shd_water_baseColor.png",
    ]) {
      expect(fs.existsSync(tex(file)), `${file} missing`).toBe(true);
    }

    // The lava ORB EMITS. This fixture has declared an emission kernel and
    // `emissionStrength: 4` since it was written, and shipped a dull sphere
    // the whole time: the strength never reached the build script, the wired
    // atlas sat at Blender's default strength of 0, and the glTF exporter
    // correctly omitted an emissive texture with a black factor. The test
    // called itself "proves every capability at once" while counting issues,
    // which is not the same as looking at the asset.
    const lavaMat = result.census!.materials.find((m) => m.name === "mtl_lava")!;
    expect(lavaMat.principled.emissionStrength, "the lava must actually emit").toBeGreaterThan(0);

    // Real assets landed as parts; the fox's materials were overridden.
    const census = result.census!;
    const fox = census.meshes.find((m) => m.object === "prp_fox")!;
    expect(fox.tris).toBe(576);
    expect(fox.materials).toEqual(["mtl_gold"]);
    const helmet = census.meshes.find((m) => m.object === "prp_helmet")!;
    expect(helmet.tris).toBeGreaterThan(10_000);
    expect(helmet.materials!.some((m) => m !== "mtl_gold")).toBe(true);

    // Declarative animation became real keyframes: both parts move, and
    // the whole compile derives as an animation asset.
    expect(census.animation.keyframedObjects).toContain("prp_orb");
    expect(census.animation.keyframedObjects).toContain("prp_pool");
    expect(census.animation.frameEnd).toBeGreaterThan(census.animation.frameStart);
    expect(result.manifest.assetKind).toBe("animation");

    // Deliverables: a proof frame + a GLB carrying everything.
    expect(result.proofImages.length).toBeGreaterThan(0);
    expect(result.exportedAssets.some((a) => a.endsWith(".glb"))).toBe(true);
  }, 500_000);

  it("reports the Fox's skeleton in the census when imported natively", async () => {
    const dir = path.join(__dirname, ".work", "atelier-fox-rig");
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.cpSync(fixture("real/fox/Fox.glb"), path.join(dir, "Fox.glb"));
    fs.cpSync(fixture("real/fox/scene3d.json"), path.join(dir, "scene3d.json"));
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.summary.errors).toBe(0);
    // The rig is a census fact: bones counted, clips named.
    expect(result.census!.armatures!.length).toBeGreaterThan(0);
    expect(result.census!.armatures![0]!.bones).toBeGreaterThan(10);
    expect(result.census!.animation.actionNames).toContain("Run");
    expect(result.census!.animation.actionNames).toContain("Walk");
    expect(result.census!.animation.actionNames).toContain("Survey");
  });
});
