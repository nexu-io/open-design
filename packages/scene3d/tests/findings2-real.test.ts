import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { rmForSetup } from "./helpers/fs.js";
import { assertBlenderIfRequired } from "./helpers/blender-gate.js";

/**
 * End-to-end, REAL-Blender coverage of the FINDINGS2 mechanisms.
 *
 * The mechanism unit tests prove the judgment on synthetic census; this suite
 * proves the WHOLE chain on real geometry — the density authority actually bakes
 * a 16-px texture, the solver actually snaps a repeat/scatter onto the grid,
 * span actually resolves a limb through Blender, the voxel lint actually
 * aggregates a real repeat family, provenance actually relaxes a real imported
 * mesh, and the Bedrock exporter actually emits a rotated cube measured from
 * real rotated geometry. If a mechanism works only in a synthetic test, it does
 * not work.
 */
const hasBlender = (await probeBlender({})) !== null;
assertBlenderIfRequired(hasBlender);
const HELMET = path.join(__dirname, "fixtures", "real", "helmet", "DamagedHelmet.glb");

describe.skipIf(!hasBlender)("FINDINGS2 mechanisms (real Blender)", () => {
  let seq = 0;
  const LONG = 300_000;
  const mkProject = (files: Record<string, string>): string => {
    const dir = path.join(__dirname, ".work", `f2-${++seq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), content, "utf8");
    }
    return dir;
  };
  const run = (dir: string, stages: string[] = ["parse", "build", "lint"]) =>
    compile({ projectDir: dir, stages: stages as never, timeoutMs: LONG, noCache: true });
  const codes = (r: Awaited<ReturnType<typeof compile>>, re: RegExp) =>
    r.issues.filter((i) => re.test(i.code));

  /* ---- generic voxel target (engine-agnostic, not Minecraft) ------- */

  it("VOXEL: target:voxel gets grid discipline + engine deliverables, NOT Minecraft rules", async () => {
    // A MagicaVoxel-style workflow bound for Unity/Godot: blocky, grid-aligned,
    // exported as GLB/OBJ — no Java element rules, no model.json.
    const dir = mkProject({
      "scene3d.json": JSON.stringify({ schemaVersion: 1, target: "voxel" }),
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "voxel-prop",
        materials: { mtl_v: { baseColor: [0.5, 0.6, 0.4], roughness: 0.9 } },
        parts: [
          // A big non-cuboid piece that Minecraft would reject — fine for a
          // generic voxel export to a mesh engine.
          { id: "prp_dome", size: [3, 3, 1.5], shape: "sphere", material: "mtl_v" },
          // An off-grid box: the generic grid rule still catches the shimmer.
          { id: "prp_nub", size: [0.1, 0.1, 0.1], shape: "box", material: "mtl_v" },
        ],
        relations: [
          { type: "at", part: "prp_dome", center: [0, 0, 0.75] },
          { type: "at", part: "prp_nub", center: [2, 0.05, 0] },
        ],
      }),
    });
    const r = await run(dir, ["parse", "build", "lint", "export"]);
    // Grid discipline fires (engine-agnostic)…
    expect(codes(r, /W-970/).map((i) => i.target)).toContain("prp_nub");
    // …but NONE of the Minecraft FORMAT rules do.
    expect(codes(r, /W-971|W-972|W-973|I-970/)).toEqual([]);
    // It ships the normal engine deliverables and NO Minecraft model.
    expect(r.exportedAssets.some((a) => a.endsWith(".glb"))).toBe(true);
    expect(r.exportedAssets.some((a) => a.includes("minecraft/"))).toBe(false);
    expect(r.ok).toBe(true);
  }, 400_000);

  /* ---- Mechanism 1: density authority + pixel-art shader bake ------- */

  it("M1: a 16-px pixel-art shader bakes clean under target minecraft", async () => {
    const dir = mkProject({
      "scene3d.json": JSON.stringify({ schemaVersion: 1, target: "minecraft" }),
      "flower.glsl": "vec4 kernel(vec2 uv){ float b = step(0.5, fract(uv.x*4.0)); return vec4(b, 0.4, 0.2, 1.0); }\n",
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "pixel-flower",
        shaders: { shd_flower: { kernel: "flower.glsl", size: 16, outputs: ["baseColor"] } },
        materials: { mtl_flower: { shader: "shd_flower", roughness: 0.9 } },
        parts: [{ id: "prp_petal", size: [0.25, 0.25, 0.25], shape: "box", material: "mtl_flower" }],
        relations: [{ type: "at", part: "prp_petal", center: [0, 0, 0.125] }],
      }),
    });
    const r = await run(dir);
    // The 16-px bake was accepted (no E-105/E-801) and produced a texture.
    expect(codes(r, /E-105|E-80\d/)).toEqual([]);
    expect(r.ok).toBe(true);
    const flower = r.census!.materials.find((m) => m.name === "mtl_flower");
    expect(flower?.principled.hasTexture).toBe(true);
    // pixelArt discipline: no PBR texel-target warnings fire on the voxel part.
    expect(codes(r, /W-445|W-956/)).toEqual([]);
  }, 400_000);

  /* ---- whole toolchain: all six stages for a Minecraft scene -------- */

  it("integration: the golem compiles through ALL six stages with the MC model shipped", async () => {
    const src = path.join(__dirname, "fixtures", "minecraft", "golem");
    const dir = path.join(__dirname, ".work", `f2-golem-${++seq}`);
    rmForSetup(dir);
    fs.cpSync(src, dir, { recursive: true });
    const r = await compile({
      projectDir: dir,
      // The turntable is not the point here — one rendered frame proves
      // "the turntable path rendered" for this all-stages integration.
      proof: { turntable: false },
      timeoutMs: LONG,
      noCache: true,
    }); // every stage
    expect(r.stages.map((s) => `${s.id}:${s.status}`)).toEqual([
      "parse:ran", "build:ran", "proof:ran", "export:ran", "lint:ran", "manifest:ran",
    ]);
    expect(r.ok).toBe(true);
    expect(r.proofImages.length).toBeGreaterThan(0); // the proof path rendered
    // The block model + its textures ship alongside the GLB/USD family.
    expect(r.exportedAssets).toContain("out/minecraft/model.json");
    expect(r.exportedAssets.some((a) => a.endsWith(".glb"))).toBe(true);
    // The host artifacts exist: the frame player, the kit page, the manifest.
    for (const f of ["out/index.html", "out/kit.html", "out/manifest.json"]) {
      expect(fs.existsSync(path.join(dir, f)), f).toBe(true);
    }
    // A clean showcase: no defects (info hints tolerated).
    expect(r.issues.filter((i) => i.severity !== "info")).toEqual([]);
  }, 400_000);

  /* ---- Mechanism 3: grid is a solver constraint; span defaults ------ */

  it("M3: an off-grid repeat pitch snaps every instance onto the grid", async () => {
    // every:0.3 is off the 1/16 grid; the solver must snap instances so none
    // shimmer. Without the snap, 8 of the 9 land off-grid (W-970 flood).
    const dir = mkProject({
      "scene3d.json": JSON.stringify({ schemaVersion: 1, target: "minecraft" }),
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "picket",
        materials: { mtl_w: { baseColor: [0.6, 0.5, 0.4], roughness: 0.9 } },
        parts: [{ id: "prp_post", size: [0.125, 0.125, 0.5], shape: "box", material: "mtl_w" }],
        relations: [
          { type: "at", part: "prp_post", center: [0, 0, 0.25] },
          { type: "repeat", part: "prp_post", count: 9, along: "x", every: 0.3 },
        ],
      }),
    });
    const r = await run(dir);
    // Every voxel-measured instance is on the grid → no off-grid warnings.
    for (const m of r.census!.meshes) expect(m.voxel!.gridDeviation).toBeLessThan(0.002);
    expect(codes(r, /W-970/)).toEqual([]);
    expect(r.census!.meshes.length).toBe(9);
  }, 400_000);

  it("M3+M4: a scatter lands on-grid and aggregates to one family, no flood", async () => {
    // scatter uses continuous sampling; under a grid it must snap so a scatter
    // of 12 does not flood 12× W-970. The floor is grid-aligned (3-px thick).
    const dir = mkProject({
      "scene3d.json": JSON.stringify({ schemaVersion: 1, target: "minecraft" }),
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "scattered",
        materials: { mtl_g: { baseColor: [0.5, 0.6, 0.4], roughness: 0.9 } },
        parts: [
          { id: "prp_floor", size: [4, 4, 0.1875], shape: "box", material: "mtl_g", role: "background" },
          { id: "prp_pebble", size: [0.25, 0.25, 0.25], shape: "box", material: "mtl_g", role: "prop" },
        ],
        relations: [
          { type: "at", part: "prp_floor", center: [0, 0, 0.09375] },
          { type: "scatter", part: "prp_pebble", on: "prp_floor", count: 12, seed: 7 },
        ],
      }),
    });
    const r = await run(dir);
    // Every scattered instance is on-grid (snapped) → zero off-grid warnings.
    for (const m of r.census!.meshes) expect(m.voxel!.gridDeviation).toBeLessThan(0.002);
    expect(codes(r, /W-970/)).toEqual([]);
    // 12 pebbles built, floor + 12 = 13 meshes.
    expect(r.census!.meshes.length).toBe(13);
  }, 400_000);

  it("M3: span resolves a limb's transverse axes from the endpoint midpoint", async () => {
    const dir = mkProject({
      "scene3d.json": JSON.stringify({ schemaVersion: 1 }),
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "arm",
        materials: { mtl_s: { baseColor: [0.5, 0.5, 0.5], roughness: 0.9 } },
        parts: [
          { id: "prp_shoulder", size: [0.1, 0.1, 0.1], shape: "box", material: "mtl_s" },
          { id: "prp_hand", size: [0.08, 0.08, 0.08], shape: "box", material: "mtl_s" },
          { id: "prp_arm", size: [0.5, 0.06, 0.06], shape: "box", material: "mtl_s" },
        ],
        relations: [
          { type: "at", part: "prp_shoulder", center: [-0.4, 0, 1.4] },
          { type: "at", part: "prp_hand", center: [0.4, 0.1, 1.5] },
          { type: "span", part: "prp_arm", from: "prp_shoulder", to: "prp_hand", axis: "x" },
        ],
      }),
    });
    const r = await run(dir);
    expect(codes(r, /E-106/)).toEqual([]);
    expect(r.ok).toBe(true);
    const arm = r.census!.objects.find((o) => o.name === "prp_arm")!;
    // y = midpoint(0, 0.1) = 0.05; z = midpoint(1.4, 1.5) = 1.45.
    expect(arm.location[1]).toBeCloseTo(0.05, 2);
    expect(arm.location[2]).toBeCloseTo(1.45, 2);
  }, 400_000);

  /* ---- Mechanism 4: family aggregation + structure class ----------- */

  it("M4: a repeat family of non-cuboids aggregates into ONE warning", async () => {
    // 6 spheres from one repeat → one W-971 on the base, carrying instanceCount 6.
    const dir = mkProject({
      "scene3d.json": JSON.stringify({ schemaVersion: 1, target: "minecraft" }),
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "orbs",
        materials: { mtl_o: { baseColor: [0.5, 0.6, 0.4], roughness: 0.9 } },
        parts: [{ id: "prp_orb", size: [0.25, 0.25, 0.25], shape: "sphere", material: "mtl_o" }],
        relations: [
          { type: "at", part: "prp_orb", center: [0, 0, 0.125] },
          { type: "repeat", part: "prp_orb", count: 6, along: "x", every: 0.375 },
        ],
      }),
    });
    const r = await run(dir);
    const w971 = codes(r, /W-971/);
    expect(w971).toHaveLength(1); // aggregated, not 6
    expect(w971[0]!.target).toBe("prp_orb");
    expect((w971[0]!.detail as { instanceCount: number }).instanceCount).toBe(6);
  }, 400_000);

  it("M4: a mesh larger than the element space is structure (I-970), not W-973", async () => {
    const dir = mkProject({
      "scene3d.json": JSON.stringify({ schemaVersion: 1, target: "minecraft" }),
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "wall",
        materials: { mtl_w: { baseColor: [0.6, 0.6, 0.55], roughness: 0.9 } },
        parts: [{ id: "prp_wall", size: [5, 0.25, 3], shape: "box", material: "mtl_w" }],
        relations: [{ type: "at", part: "prp_wall", center: [0, 0, 1.5] }],
      }),
    });
    const r = await run(dir);
    expect(codes(r, /I-970/).map((i) => i.target)).toContain("prp_wall");
    expect(codes(r, /W-973/)).toEqual([]);
  }, 400_000);

  /* ---- Mechanism 2: distribution outliers -------------------------- */

  it("M2: a gross unit-slip fires an I-952 hint on the outlier alone", async () => {
    const dir = mkProject({
      "scene3d.json": JSON.stringify({ schemaVersion: 1 }),
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "slip",
        materials: { mtl_x: { baseColor: [0.5, 0.5, 0.5], roughness: 0.9 } },
        parts: [
          { id: "prp_a", size: [0.5, 0.5, 0.5], shape: "box", material: "mtl_x" },
          { id: "prp_b", size: [0.6, 0.4, 0.5], shape: "box", material: "mtl_x" },
          { id: "prp_c", size: [0.4, 0.5, 0.6], shape: "box", material: "mtl_x" },
          { id: "prp_d", size: [0.5, 0.6, 0.4], shape: "box", material: "mtl_x" },
          { id: "prp_slip", size: [60, 60, 60], shape: "box", material: "mtl_x" },
        ],
        relations: [
          { type: "at", part: "prp_a", center: [0, 0, 0.25] },
          { type: "at", part: "prp_b", center: [1, 0, 0.25] },
          { type: "at", part: "prp_c", center: [2, 0, 0.3] },
          { type: "at", part: "prp_d", center: [3, 0, 0.2] },
          { type: "at", part: "prp_slip", center: [0, 50, 30] },
        ],
      }),
    });
    const r = await run(dir);
    const i952 = codes(r, /I-952/);
    expect(i952.map((i) => i.target)).toEqual(["prp_slip"]);
    expect(i952[0]!.severity).toBe("info");
    // It is a HINT — it never blocks the compile.
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
  }, 400_000);

  /* ---- Mechanism 5: file-backed parts carry imported provenance ---- */

  it("M5: a file:-imported open mesh compiles under a STRICT contract", async () => {
    // The DamagedHelmet is non-manifold; under the default (strict) contract a
    // file: part must NOT error on it — imported provenance relaxes topology.
    const dir = mkProject({
      "scene3d.json": JSON.stringify({ schemaVersion: 1 }),
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "shelf",
        materials: { mtl_t: { baseColor: [0.6, 0.5, 0.4], roughness: 0.9 } },
        parts: [
          { id: "prp_table", size: [1, 1, 0.1], shape: "box", material: "mtl_t" },
          { id: "prp_helm", size: [0.4, 0.4, 0.4], file: "helm.glb" },
        ],
        relations: [
          { type: "at", part: "prp_table", center: [0, 0, 0.05] },
          { type: "at", part: "prp_helm", center: [0, 0, 0.3] },
        ],
      }),
    });
    fs.copyFileSync(HELMET, path.join(dir, "helm.glb"));
    const r = await run(dir);
    // No topology ERROR on the imported helmet, and the compile succeeds.
    expect(r.issues.filter((i) => i.severity === "error" && i.target === "prp_helm")).toEqual([]);
    expect(r.ok).toBe(true);
  }, 400_000);

  /* ---- the census measures the mesh that ships --------------------- */

  it("measures the EVALUATED mesh, not the rest-cage datablock", async () => {
    /*
     * Modifiers and armatures write their result into the depsgraph, never
     * into `o.data`. The bounds predicate knew that; the census's own mesh
     * loop and the z-fighting search each read the datablock, so one census
     * reported two different meshes depending which fact you read — bounds
     * from the finished geometry, topology from the rest cage.
     *
     * A Mirror is the cleanest witness: it doubles the geometry, so the
     * datablock and the shipped mesh disagree about the two numbers every
     * budget and claim in the compiler is built on.
     */
    const dir = mkProject({
      "scene3d.json": JSON.stringify({
        schemaVersion: 1,
        conventions: { naming: { forbidDefaultNames: false } },
      }),
      "build.py": [
        "import bpy",
        "for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)",
        "bpy.ops.mesh.primitive_cube_add(size=1, location=(0.75,0,0.5))",
        "o = bpy.context.object; o.name = 'prp_half'",
        "m = o.modifiers.new(name='Mirror', type='MIRROR')",
        "m.use_axis[0] = True",
        "",
      ].join(String.fromCharCode(10)),
    });
    const r = await run(dir);
    const mesh = r.census!.meshes.find((m) => m.object === "prp_half")!;
    // The cube's datablock is 8 verts / 6 faces; mirrored it is 16 / 12.
    // Reading the datablock here is the bug, and it reads as exactly half.
    expect(mesh.verts).toBe(16);
    expect(mesh.faces).toBe(12);
    // And the fact is flagged as evaluated — absent `evaluated: false` means
    // the depsgraph really produced this mesh.
    expect((mesh as { evaluated?: boolean }).evaluated).toBeUndefined();
  }, 400_000);

  /* ---- Bedrock oriented cube (real rotated geometry) --------------- */

  it("Bedrock: a real rotated cube exports with its un-rotated size + rotation", async () => {
    const dir = mkProject({
      "scene3d.json": JSON.stringify({
        schemaVersion: 1,
        target: "minecraft",
        conventions: { minecraft: { dialect: "bedrock" }, naming: { forbidDefaultNames: false } },
      }),
      "build.py": [
        "import bpy, math",
        "for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)",
        "bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.5))",
        "o = bpy.context.object; o.name = 'prp_spun'",
        "o.rotation_euler = (0, 0, math.radians(22.5))",
        "",
      ].join("\n"),
    });
    const r = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint", "export"],
      timeoutMs: LONG,
      noCache: true,
    });
    const spun = r.census!.meshes.find((m) => m.object === "prp_spun")!;
    // The census recovered the TRUE 1 m cube, not the ~1.31 m rotated AABB.
    expect(spun.voxel!.localSize![0]).toBeCloseTo(1, 2);
    const geo = JSON.parse(fs.readFileSync(path.join(dir, "out/minecraft/geometry.json"), "utf8"));
    const cube = geo["minecraft:geometry"][0].bones[0].cubes[0];
    expect(cube.size).toEqual([16, 16, 16]); // 16 px, not the bloated AABB
    expect(cube.rotation).toEqual([0, 22.5, 0]); // Blender Z → MC Y
    expect(cube.pivot).toEqual([0, 8, 0]);
  }, 400_000);

  /* ---- W-345 vertex-colour shading source -------------------------- */

  it("W-345: a material-less mesh with a colour attribute is not flagged; a bare one is", async () => {
    const bpyBody = (withColour: boolean) =>
      [
        "import bpy",
        "for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)",
        "bpy.ops.mesh.primitive_cube_add(size=1, location=(0,0,0.5))",
        "o = bpy.context.object; o.name = 'prp_voxel'",
        ...(withColour
          ? ["o.data.color_attributes.new(name='Col', type='BYTE_COLOR', domain='CORNER')"]
          : []),
        "",
      ].join("\n");
    const coloured = mkProject({ "scene3d.json": JSON.stringify({ schemaVersion: 1, conventions: { naming: { forbidDefaultNames: false } } }), "build.py": bpyBody(true) });
    const rc = await run(coloured, ["parse", "build", "lint"]);
    expect(rc.census!.meshes.find((m) => m.object === "prp_voxel")!.hasColorAttribute).toBe(true);
    expect(codes(rc, /W-345/)).toEqual([]);

    const bare = mkProject({ "scene3d.json": JSON.stringify({ schemaVersion: 1, conventions: { naming: { forbidDefaultNames: false } } }), "build.py": bpyBody(false) });
    const rb = await run(bare);
    expect(codes(rb, /W-345/).map((i) => i.target)).toContain("prp_voxel");
  }, 400_000);
});
