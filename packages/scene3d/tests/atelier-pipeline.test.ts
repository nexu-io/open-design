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

    // The origin CONTRACT for real assets: rotation pivots at the object
    // origin, so a file part's origin must be its solved box centre — not
    // wherever the importer left its pivot. Was red before _import_part
    // normalised it: the helmet's glTF origin sat at the asset's own pivot,
    // and a spin/screw/rotate on it would have orbited that point while the
    // kinematic sweep adjudicated the box-centred motion.
    for (const id of ["prp_helmet", "prp_fox"]) {
      const placed = result.solved!.parts.find((p) => p.id === id)!;
      const obj = census.objects.find((o) => o.name === id)!;
      expect(obj.location[0], `${id} origin x is the box centre`).toBeCloseTo(placed.center[0], 4);
      expect(obj.location[1], `${id} origin y is the box centre`).toBeCloseTo(placed.center[1], 4);
      expect(obj.location[2], `${id} origin z is the box centre`).toBeCloseTo(placed.center[2], 4);
    }

    // Declarative animation became real keyframes: both parts move, and
    // the whole compile derives as an animation asset.
    expect(census.animation.keyframedObjects).toContain("prp_orb");
    expect(census.animation.keyframedObjects).toContain("prp_pool");
    expect(census.animation.frameEnd).toBeGreaterThan(census.animation.frameStart);
    expect(result.manifest.assetKind).toBe("animation");

    // And the census measured the scene ACROSS that range, not at one pose.
    // The orb bobs and the pool spins, so the animated envelope must exist,
    // must have visited more than one frame, and must reach at least as high
    // as the rest pose — a sampler that silently measured the rest pose N
    // times (the exact failure mode of reading o.data instead of the
    // evaluated object) would tie here rather than exceed.
    const ab = census.animation.animatedBounds;
    expect(ab, "an animated scene must carry bounds over time").toBeDefined();
    expect(ab!.skipped).toBeUndefined();
    expect(ab!.framesSampled).toBeGreaterThan(1);
    expect(ab!.frameStep).toBeGreaterThanOrEqual(1);
    const restMaxZ = Math.max(...census.meshes.map((m) => m.spatial?.worldMax[2] ?? -Infinity));
    const restMinZ = Math.min(...census.meshes.map((m) => m.spatial?.worldMin[2] ?? Infinity));
    expect(ab!.max![2]).toBeGreaterThanOrEqual(restMaxZ - 1e-6);
    expect(ab!.min![2]).toBeLessThanOrEqual(restMinZ + 1e-6);
    // The BOBBING pool strictly exceeds its rest pose somewhere in the
    // cycle. (The first version asserted this of the orb — which only
    // SPINS, and Blender measured its crest equal to rest to the last
    // digit: the symmetry theorem confirmed by independent measurement,
    // failing a test that had assumed the wrong part.)
    const pool = ab!.parts!.find((p) => p.object === "prp_pool")!;
    const poolRest = census.meshes.find((m) => m.object === "prp_pool")!.spatial!;
    expect(pool.maxZ).toBeGreaterThan(poolRest.worldMax[2]!);
    // And the spinning orb's vertical extent NEVER changes: two independent
    // layers — the closed-form sweep's symmetry theorem and the sampled
    // census — agreeing that a symmetric spinner sweeps nothing.
    const orb = ab!.parts!.find((p) => p.object === "prp_orb")!;
    const orbRest = census.meshes.find((m) => m.object === "prp_orb")!.spatial!;
    expect(orb.maxZ).toBeCloseTo(orbRest.worldMax[2]!, 5);
    expect(orb.minZ).toBeCloseTo(orbRest.worldMin[2]!, 5);
    // A STATIC part measures identically at every frame — the control that
    // says the sampler is reading real geometry rather than drifting.
    const helmetAnim = ab!.parts!.find((p) => p.object === "prp_helmet")!;
    expect(helmetAnim.maxZ).toBeCloseTo(helmet.spatial!.worldMax[2]!, 4);
    expect(helmetAnim.minZ).toBeCloseTo(helmet.spatial!.worldMin[2]!, 4);

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

    // The deform path, which is the whole point of measuring from the
    // EVALUATED object: the Fox's mesh never moves in `o.data` — the
    // armature writes its pose onto the depsgraph. A sampler reading the
    // original mesh would report a perfectly rigid, perfectly still fox and
    // pass any spatial claim the walk cycle breaks. So the animated bounds
    // must exist AND must differ from the rest pose somewhere.
    //
    // Branch honestly on what the import actually bound: a glTF whose clips
    // land ORPHANED (no action on the armature) genuinely has nothing
    // playing, and "animate nothing" must read as absent, not as measured.
    const anim = result.census!.animation;
    const ab = anim.animatedBounds;
    if (anim.keyframedObjects.length === 0) {
      expect(ab, "nothing is bound to play — there is no time to measure").toBeUndefined();
    } else {
      expect(ab, "a rigged import must be measured across its clip").toBeDefined();
      expect(ab!.skipped).toBeUndefined();
      expect(ab!.parts!.length).toBeGreaterThan(0);
      const restMax = Math.max(
        ...result.census!.meshes.map((m) => m.spatial?.worldMax[2] ?? -Infinity),
      );
      const restMin = Math.min(
        ...result.census!.meshes.map((m) => m.spatial?.worldMin[2] ?? Infinity),
      );
      // Union property: the sampled envelope can only be wider than one pose.
      expect(ab!.max![2]).toBeGreaterThanOrEqual(restMax - 1e-6);
      expect(ab!.min![2]).toBeLessThanOrEqual(restMin + 1e-6);
      if (anim.frameEnd > anim.frameStart) {
        expect(ab!.framesSampled).toBeGreaterThan(1);
        // The deformation is visible: some vertical extreme across the clip
        // sits strictly outside the rest pose. This is the assertion that
        // fails if the sampler ever regresses to reading `o.data` — a rest
        // mesh sampled N times gives back exactly the rest pose.
        expect(ab!.max![2]! > restMax + 1e-6 || ab!.min![2]! < restMin - 1e-6).toBe(true);
      }
    }
  });
});
