import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender, clearProbeCache, describeProofViews } from "../src/index.js";
import { rmForSetup } from "./helpers/fs.js";
import { assertBlenderIfRequired } from "./helpers/blender-gate.js";

/**
 * Integration suite against the real Blender runtime (pip `bpy` on this
 * machine, a Blender executable elsewhere). Skipped entirely when no
 * Blender runtime is discoverable, so CI stays green anywhere.
 */
const hasBlender = (await probeBlender({})) !== null;
assertBlenderIfRequired(hasBlender);


describe.skipIf(!hasBlender)("scene3d pipeline (real Blender)", () => {
  const fixture = (name: string) =>
    path.join(__dirname, "fixtures", name);

  /**
   * A fresh directory per call, never a shared one per fixture.
   *
   * These tests each mutate the scene's stage cache, its tweaks file and
   * its `out/` deliverables, so sharing one directory per fixture name
   * makes them order-dependent. That stayed hidden while only one test
   * used each fixture, then surfaced as a cache-hit assertion failing only
   * in a full run: on Windows the cleanup can silently give up while a
   * killed Blender child still holds a handle, and the next test inherits
   * whatever survived. Unique directories remove the shared state instead
   * of making the cleanup try harder.
   */
  let workSeq = 0;
  const workDir = (name: string) => {
    const dir = path.join(__dirname, ".work", `${name.replace(/[\\/]/g, "_")}-${++workSeq}`);
    rmForSetup(dir);
    fs.cpSync(fixture(name), dir, { recursive: true });
    return dir;
  };

  const LONG = 300_000;

  /*
   * Provenance is the answer to "which line of my build script made this?".
   * It is easy to break silently — a rename in the script, a helper
   * refactor, or an object created through a path the tracer does not see
   * would all degrade it to nulls without failing anything else. These
   * assertions are on the real compile output, because that is the only
   * place the tracer actually runs.
   */
  it("attributes every part to the build-script line that created it", async () => {
    const dir = workDir("good/prop_crate");
    const result = await compile({ projectDir: dir, stages: ["parse", "build", "lint"], timeoutMs: LONG });
    const provenance = result.census?.provenance ?? {};
    expect(Object.keys(provenance).length).toBeGreaterThan(0);

    // Every mesh the census reports must be traceable back to a line.
    for (const mesh of result.census!.meshes) {
      const origin = provenance[mesh.object];
      expect(origin, `no origin recorded for ${mesh.object}`).toBeDefined();
      expect(origin.file).toMatch(/\.py$/);
      // A null line means the tracer saw the object appear but could not
      // attribute it — usable, but it is the degraded case, not the goal.
      expect(origin.line, `origin for ${mesh.object} has no line`).not.toBeNull();
    }
  }, LONG);

  it("gives an author-placed camera an honest compass from its MEASURED pose", async () => {
    // R5.2 — an authored still used to get NO compass ("absent beats a wrong
    // name"), but the runner now MEASURES the placed camera's pose, which is not
    // a guess. A camera on −X, elevated ~30°, must read azimuth 270 = "left".
    const dir = path.join(__dirname, ".work", `authored-cam-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "build.py"),
      [
        "import bpy, math",
        "bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0,0,0))",
        "bpy.context.object.name = 'prp_box'",
        "bpy.ops.object.camera_add(location=(-5, 0, 2.887))",
        "cam = bpy.context.object; cam.name = 'cam_shot'",
        "cam.rotation_euler = (math.radians(60), 0, math.radians(-90))",
        "bpy.context.scene.camera = cam",
        "bpy.ops.object.light_add(type='SUN', location=(4,4,6)); bpy.context.object.name='lgt_key'",
      ].join("\n"),
    );
    const result = await compile({
      projectDir: dir,
      proof: { turntable: false, respectSceneCamera: true, resolution: 128 },
      timeoutMs: LONG,
    });
    expect(result.ok).toBe(true);
    const cam = result.census!.camera;
    expect(cam.azimuthDeg).toBeCloseTo(270, 0); // −X → azimuth 270 (left)
    expect(cam.elevationDeg).toBeCloseTo(30, 0);
    const views = describeProofViews({
      frameCount: 1,
      turntable: false,
      authoredCamera: true,
      authoredAzimuthDeg: cam.azimuthDeg,
      authoredElevationDeg: cam.elevationDeg,
    });
    expect(views).toHaveLength(1); // named, not silent
    expect(views![0]!.name).toBe("left");
  }, LONG);

  it("points a geometry issue at the source lines that produced it", async () => {
    const dir = workDir("poisoned/topology");
    const result = await compile({ projectDir: dir, stages: ["parse", "build", "lint"], timeoutMs: LONG });
    const attributed = result.issues.filter((i) => i.detail && "origin" in i.detail);
    expect(attributed.length).toBeGreaterThan(0);
    for (const issue of attributed) {
      const origin = issue.detail!.origin as Array<{ part: string; at: string }>;
      expect(origin.length).toBeGreaterThan(0);
      // `at` is the paste-into-an-editor form; every consumer would
      // otherwise rebuild it identically.
      for (const row of origin) expect(row.at).toMatch(/\.py(:\d+)?$/);
    }
  }, LONG);

  it("compiles the good crate with zero errors and artifacts", async () => {
    const dir = workDir("good/prop_crate");
    const result = await compile({ projectDir: dir, timeoutMs: 240_000 });
    expect(result.ok).toBe(true);
    expect(result.summary.errors).toBe(0);
    expect(result.census).toBeDefined();
    expect(result.census!.camera.present).toBe(true);
    expect(result.census!.lightCount).toBe(1);
    expect(result.census!.zFightingPairs).toEqual([]);
    expect(result.census!.meshes.every((m) => m.nonManifoldEdges === 0)).toBe(true);
    expect(result.proofImages.length).toBe(4);
    expect(result.proofImages.every((p) => fs.existsSync(path.join(dir, p)))).toBe(true);
    expect(result.exportedAssets.some((a) => a.endsWith(".usda"))).toBe(true);
    expect(result.exportedAssets.some((a) => a.endsWith(".glb"))).toBe(true);
    // Deliverables land in a visible `out/`, never the hidden cache dir —
    // a host file listing that hides dotfiles must still show the asset.
    expect(fs.existsSync(path.join(dir, "out", "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "out", "index.html"))).toBe(true);
    expect(result.proofImages.every((p) => p.startsWith("out/proof/"))).toBe(true);
    expect(result.exportedAssets.every((a) => a.startsWith("out/"))).toBe(true);
expect(result.manifest.partTree.map((p) => p.name).sort()).toEqual(
      ["cam_crate_shot", "lgt_key", "prp_crate_body", "prp_crate_lid"].sort(),
    );
  }, LONG);

  it("renders proof frames that actually show the model from distinct angles", async () => {
    // The structural rules all pass on a scene whose camera points at
    // nothing, so the proof frames are measured rather than assumed. A
    // turntable must also *turn*: identical coverage across frames is the
    // signature of a transform that never reached the renderer.
    const dir = workDir("good/prop_crate");
    const result = await compile({ projectDir: dir, timeoutMs: 240_000, noCache: true });
    const codes = result.issues.map((i) => i.code);
    expect(codes).not.toContain("S3D-E-383");
    expect(codes).not.toContain("S3D-W-383");
    expect(codes).not.toContain("S3D-W-384");

    const sizes = result.proofImages.map((p) => fs.statSync(path.join(dir, p)).size);
    expect(new Set(sizes).size).toBeGreaterThan(1);
  }, LONG);

  it("renders one lit-sphere preview per bound material, and keeps them cached", async () => {
    // The field complaint this answers: emission strength, alpha, metallic
    // and a baked texture only compose into a photograph at the far end of a
    // full turntable, so judging a material cost a ~90s round per guess. The
    // balls are rendered under the proof's own world, film and colour
    // management, which is what makes them a PREDICTION rather than a second
    // renderer's opinion.
    const dir = workDir("good/prop_crate");
    // NOT noCache: the work dir is fresh, and noCache also skips cache
    // WRITES — the cached-recompile assertion below needs this compile's
    // cache entries to exist.
    const first = await compile({ projectDir: dir, timeoutMs: 240_000 });
    // prop_crate binds exactly two materials, and the names are sanitised
    // (alphanumerics/._- survive) and sorted by material name.
    expect(first.materialBalls).toEqual([
      "out/materials/ball-mtl_crate_metal.png",
      "out/materials/ball-mtl_crate_wood.png",
    ]);
    // Nothing was skipped, so the field is absent rather than 0 — "none" and
    // "unmeasured" must not share a representation.
    expect(first.materialBallsSkipped).toBeUndefined();
    for (const ball of first.materialBalls) {
      expect(fs.statSync(path.join(dir, ball)).size).toBeGreaterThan(0);
    }
    // Balls are not turntable frames: the frame player, the ascii sampler and
    // the viewer all read proofImages as one orbit of one subject.
    expect(first.proofImages.some((p) => p.includes("/materials/"))).toBe(false);

    // A cached proof carries its previews the same way it carries its frame
    // statistics — otherwise the feature would appear to come and go.
    const second = await compile({ projectDir: dir });
    expect(second.stages.find((s) => s.id === "proof")!.status).toBe("cached");
    expect(second.materialBalls).toEqual(first.materialBalls);

    // ...and a deleted materials dir re-renders, because the cache-hit test
    // checks the ball files exist, not just the frames.
    fs.rmSync(path.join(dir, "out", "materials"), { recursive: true, force: true });
    const third = await compile({ projectDir: dir });
    expect(third.stages.find((s) => s.id === "proof")!.status).toBe("ran");
    expect(third.materialBalls).toEqual(first.materialBalls);
  }, LONG);

  it("caches stages on the second compile", async () => {
    const dir = workDir("good/prop_crate");
    await compile({ projectDir: dir });
    const second = await compile({ projectDir: dir });
    expect(second.ok).toBe(true);
    const build = second.stages.find((s) => s.id === "build")!;
    const proof = second.stages.find((s) => s.id === "proof")!;
    expect(build.status).toBe("cached");
    expect(proof.status).toBe("cached");
    expect(second.proofImages.length).toBe(4);
  }, LONG);

  it("flags default names in the naming-violations fixture", async () => {
    const dir = workDir("poisoned/naming-violations");
    // Naming and camera-presence are lint facts; no render or export is
    // consumed here.
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: 240_000,
    });
expect(result.ok).toBe(false);
    const codes = new Set(result.issues.map((i) => i.code));
    expect(codes.has("S3D-E-301")).toBe(true); // Cube.001
    expect(codes.has("S3D-E-302")).toBe(true); // BAD NAME
    expect(codes.has("S3D-E-303")).toBe(true); // crate_body (no prefix)
    expect(codes.has("S3D-E-381")).toBe(true); // no camera
  }, LONG);

  it("detects z-fighting, non-manifold and NaN in the topology fixture", async () => {
    const dir = workDir("poisoned/topology");
    // Census + lint assertions only — the proof render is not read.
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: 240_000,
    });
    expect(result.ok).toBe(false);
    const codes = new Set(result.issues.map((i) => i.code));
    expect(codes.has("S3D-E-324")).toBe(true); // z-fighting
    expect(codes.has("S3D-E-321")).toBe(true); // non-manifold
    expect(codes.has("S3D-E-322")).toBe(true); // NaN
    expect(result.census!.zFightingPairs.length).toBeGreaterThan(0);
    expect(result.census!.meshes.find((m) => m.object === "prp_non_manifold")!.nonManifoldEdges).toBeGreaterThan(0);
  }, LONG);

  it("catches a camera aimed away from the subject that every structural rule passes", async () => {
    const dir = workDir("poisoned/blind-camera");
    // The assertion is on the E-383 code, not on any pixel — one frame
    // carries the same luminance/coverage facts as eight.
    const result = await compile({
      projectDir: dir,
      proof: { turntable: false },
      timeoutMs: 240_000,
    });
    const codes = result.issues.map((i) => i.code);
    // Structure is impeccable: named parts, a real material, a camera, a light.
    expect(codes).not.toContain("S3D-E-301");
    expect(codes).not.toContain("S3D-E-303");
    expect(codes).not.toContain("S3D-E-381");
    expect(codes).not.toContain("S3D-W-381");
    // Only the rendered pixels reveal that the shot is empty.
    expect(codes).toContain("S3D-E-383");
    expect(result.ok).toBe(false);
  }, LONG);

  it("keeps the empty-proof error on a cached recompile", async () => {
    // The stats live in the proof cache entry; if they did not, a second
    // compile would report the black scene as clean.
    const dir = workDir("poisoned/blind-camera");
    const first = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: 240_000 });
    expect(first.issues.map((i) => i.code)).toContain("S3D-E-383");
    const second = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: 240_000 });
    expect(second.stages.find((s) => s.id === "proof")!.status).toBe("cached");
    expect(second.issues.map((i) => i.code)).toContain("S3D-E-383");
    expect(second.ok).toBe(false);
  }, LONG);

  it("keeps deliverables in the manifest across a fast structural pass", async () => {
    // The skill tells agents to iterate with `--stages parse,build,lint`.
    // That restricted pass must not rewrite the manifest with empty
    // artifact lists — the exports and proof frames on disk are still the
    // scene's deliverables, and the kit page is built from this file.
    const dir = workDir("good/prop_crate");
    const full = await compile({ projectDir: dir, timeoutMs: 240_000 });
    expect(full.proofImages.length).toBeGreaterThan(0);
    const fast = await compile({
      projectDir: dir,
      timeoutMs: 240_000,
      stages: ["parse", "build", "lint", "manifest"],
    });
    expect(fast.manifest.proofImages).toEqual(full.manifest.proofImages);
    expect(fast.manifest.exportedAssets).toEqual(full.manifest.exportedAssets);
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "out", "manifest.json"), "utf8"));
    expect(onDisk.exportedAssets).toEqual(full.manifest.exportedAssets);
  }, LONG);

  it("replays viewport tweaks and busts the cache when they change", async () => {
    // The full write-back loop: a user drags the lid in the viewer, the
    // daemon writes tweaks.json, and every subsequent compile replays it.
    // The delta must land in the census AND change the content hash — a
    // cached census from before the tweak would silently undo the edit.
    const dir = workDir("good/prop_crate");
    const before = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: 240_000 });
    const lidBefore = before.census!.objects.find((o) => o.name === "prp_crate_lid")!;

    // Deltas are in VIEWER space (glTF, Y-up). Blender is Z-up, so a +Y
    // drag must land on Blender's Z — "drag up" has to mean up. Getting
    // this wrong slides the part along depth and looks almost plausible.
    fs.writeFileSync(
      path.join(dir, "tweaks.json"),
      JSON.stringify({ prp_crate_lid: { translate: [0, 0.25, 0] } }),
    );
    const after = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: 240_000 });
    expect(after.stages.find((s) => s.id === "build")!.status).toBe("ran");
    const lidAfter = after.census!.objects.find((o) => o.name === "prp_crate_lid")!;
    expect(lidAfter.location[2] - lidBefore.location[2]).toBeCloseTo(0.25, 5);
    expect(lidAfter.location[1] - lidBefore.location[1]).toBeCloseTo(0, 5);

    // And a viewer +Z drag is Blender -Y, not +Z.
    fs.writeFileSync(
      path.join(dir, "tweaks.json"),
      JSON.stringify({ prp_crate_lid: { translate: [0, 0, 0.25] } }),
    );
    const depth = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: 240_000 });
    const lidDepth = depth.census!.objects.find((o) => o.name === "prp_crate_lid")!;
    expect(lidDepth.location[1] - lidBefore.location[1]).toBeCloseTo(-0.25, 5);
    expect(lidDepth.location[2] - lidBefore.location[2]).toBeCloseTo(0, 5);

    // A tweak for a part the script no longer builds is stale data, not a
    // crash: unknown names are ignored.
    fs.writeFileSync(
      path.join(dir, "tweaks.json"),
      JSON.stringify({ prp_ghost: { translate: [1, 1, 1] } }),
    );
    const ghost = await compile({ projectDir: dir, timeoutMs: 240_000, stages: ["parse", "build", "lint"] });
    expect(ghost.issues.filter((i) => i.severity === "error")).toEqual([]);
  }, LONG);

  it("replays material tweaks: assign rebinds, shared overrides instance", async () => {
    // The material panel's write-back loop. Three moves, each with its own
    // invariant:
    //   assign        -> the part rebinds to an EXISTING material by name;
    //   assign+override -> the override lands on a per-part instance copy
    //                    (mtl__part), never on the shared original —
    //                    Unreal's material-instance semantics;
    //   sole-user override -> mutates in place, no copy litter.
    const dir = workDir("good/prop_crate");
    const before = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: 240_000 });
    const woodBefore = before.census!.materials.find((m) => m.name === "mtl_crate_wood")!;
    expect(woodBefore.usedByObjectCount).toBe(1);

    // 1. Pure assignment: the lid swaps metal for the body's wood.
    fs.writeFileSync(
      path.join(dir, "tweaks.json"),
      JSON.stringify({ prp_crate_lid: { material: { assign: "mtl_crate_wood" } } }),
    );
    const assigned = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: 240_000 });
    expect(assigned.stages.find((s) => s.id === "build")!.status).toBe("ran");
    const lidAssigned = assigned.census!.meshes.find((m) => m.object === "prp_crate_lid")!;
    expect(lidAssigned.materials).toEqual(["mtl_crate_wood"]);
    expect(
      assigned.census!.materials.find((m) => m.name === "mtl_crate_wood")!.usedByObjectCount,
    ).toBe(2);
    // The manifest records what was baked, so the viewer can subtract.
    expect(assigned.manifest.bakedTweaks?.prp_crate_lid?.material?.assign).toBe(
      "mtl_crate_wood",
    );

    // 2. Assign + override: the wood is now SHARED, so the override must
    //    land on a per-part instance and leave the body's wood untouched.
    fs.writeFileSync(
      path.join(dir, "tweaks.json"),
      JSON.stringify({
        prp_crate_lid: {
          material: {
            assign: "mtl_crate_wood",
            baseColor: [0.8, 0.1, 0.1],
            roughness: 0.2,
            emission: [1, 0.2, 0.1],
            emissionStrength: 3,
          },
        },
      }),
    );
    const overridden = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: 240_000 });
    const instName = "mtl_crate_wood__prp_crate_lid";
    const inst = overridden.census!.materials.find((m) => m.name === instName);
    expect(inst).toBeTruthy();
    expect(inst!.principled.baseColor![0]).toBeCloseTo(0.8, 3);
    expect(inst!.principled.baseColor![1]).toBeCloseTo(0.1, 3);
    expect(inst!.principled.roughness).toBeCloseTo(0.2, 3);
    // The census now measures emission — the panel's sliders start from it.
    expect(inst!.principled.emissionStrength).toBeCloseTo(3, 3);
    expect(inst!.principled.emission![0]).toBeCloseTo(1, 3);
    const lidOver = overridden.census!.meshes.find((m) => m.object === "prp_crate_lid")!;
    expect(lidOver.materials).toEqual([instName]);
    const woodShared = overridden.census!.materials.find((m) => m.name === "mtl_crate_wood")!;
    expect(woodShared.principled.roughness).toBeCloseTo(woodBefore.principled.roughness!, 3);
    // The kit page's material panel is fed from the same compile: the mats
    // payload carries the measured facts, emission included, so the sliders
    // open on what the build actually authored.
    const kitHtml = fs.readFileSync(path.join(dir, "out", "kit.html"), "utf8");
    expect(kitHtml).toContain('"mats":{');
    expect(kitHtml).toContain(instName);

    // 3. Sole-user override mutates in place — same name, new value.
    fs.writeFileSync(
      path.join(dir, "tweaks.json"),
      JSON.stringify({ prp_crate_body: { material: { roughness: 0.9 } } }),
    );
    const inPlace = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: 240_000 });
    const woodInPlace = inPlace.census!.materials.find((m) => m.name === "mtl_crate_wood")!;
    expect(woodInPlace.principled.roughness).toBeCloseTo(0.9, 3);
    expect(
      inPlace.census!.materials.find((m) => m.name.startsWith("mtl_crate_wood__")),
    ).toBeUndefined();

    fs.rmSync(path.join(dir, "tweaks.json"), { force: true });
  }, LONG);

  it("keeps an imported material's provenance across a tweak's per-part instance copy", async () => {
    // A bare-mesh kit whose two crates SHARE one material carrying a mid-range
    // metallic the default contract forbids: the finding fires but RELAXES
    // (the material is the import's), so the kit compiles clean. Tweaking one
    // crate's colour mints a per-part instance copy `<mat>__<crate>` — and that
    // copy is still the third party's shading for every channel the tweak did
    // not touch. It must stay imported, or a colour edit flips the compile red
    // over a metallic value the author never touched and cannot fix without
    // editing somebody else's asset. (Provenance must flow through .copy() the
    // way it flows through _import_part's join.)
    const METALLIC = "S3D-E-341";
    const dir = workDir("shared-mat-kit");
    const before = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: LONG, noCache: true });
    const shared = before.census!.materials.find((m) => m.name === "shared_metal")!;
    expect(shared.imported).toBe(true);
    expect(shared.usedByObjectCount).toBe(2); // both crates -> a shared material
    // The mid-range metallic is measured, the finding fires, but it is relaxed.
    const metalBefore = before.issues.find((i) => i.code === METALLIC && i.target === "shared_metal");
    expect(metalBefore?.severity).toBe("info");
    expect(before.summary.errors).toBe(0);

    // Tweak ONE crate's base colour: the shared material forks to an instance.
    fs.writeFileSync(
      path.join(dir, "tweaks.json"),
      JSON.stringify({ crate_a: { material: { baseColor: [0.8, 0.1, 0.1] } } }),
    );
    const tweaked = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: LONG, noCache: true });
    const inst = tweaked.census!.materials.find((m) => m.name.startsWith("shared_metal__"))!;
    expect(inst).toBeTruthy(); // the per-part instance copy exists
    expect(inst.principled.metallic).toBeCloseTo(0.5, 3); // the import's value, untouched
    // The copy is still the import's shading -> provenance preserved, metallic relaxed.
    expect(inst.imported).toBe(true);
    // Relaxation is RECLASSIFICATION, never suppression: the metallic finding is
    // still MEASURED and emitted on the instance, just downgraded to info with
    // its value. Asserting it exists guards against a regression that hides it.
    const metalAfter = tweaked.issues.find((i) => i.code === METALLIC && i.target === inst.name);
    expect(metalAfter).toBeDefined();
    expect(metalAfter!.severity).toBe("info");
    expect(metalAfter!.detail?.metallic).toBeCloseTo(0.5, 3); // the measured value is still reported
    expect(tweaked.summary.errors).toBe(0); // a colour edit did NOT flip the kit red
    fs.rmSync(path.join(dir, "tweaks.json"), { force: true });
  }, LONG);

  it("forks a tweak instance without rebinding a collision-named source material", async () => {
    // The per-part instance name `<mat>__<part>` can collide: a source file may
    // ship a material literally named that, or two long (mat, part) pairs may
    // share a 63-char prefix. Reusing an existing datablock of that name would
    // apply the tweak — which UNLINKS texture maps — to an UNRELATED material,
    // restyling geometry the author never touched (a direct breach of the
    // per-part-instance guarantee). This kit ships `shared_metal` (shared by
    // crate_a + crate_b) AND a distinct GREEN `shared_metal__crate_a` worn only
    // by crate_c. Tweaking crate_a's colour must fork a FRESH instance and leave
    // crate_c's green material untouched.
    const dir = workDir("collision-kit");
    const before = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: LONG, noCache: true });
    const greenBefore = before.census!.materials.find((m) => m.name === "shared_metal__crate_a")!;
    expect(greenBefore.principled.baseColor![1]).toBeCloseTo(1, 2); // green

    fs.writeFileSync(
      path.join(dir, "tweaks.json"),
      JSON.stringify({ crate_a: { material: { baseColor: [1, 0, 0] } } }), // tint crate_a RED
    );
    const tweaked = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: LONG, noCache: true });
    // crate_c still wears the ORIGINAL green material — the tweak did not rebind it.
    const crateC = tweaked.census!.meshes.find((m) => m.object === "crate_c")!;
    expect(crateC.materials).toEqual(["shared_metal__crate_a"]);
    const greenAfter = tweaked.census!.materials.find((m) => m.name === "shared_metal__crate_a")!;
    expect(greenAfter.principled.baseColor![1]).toBeCloseTo(1, 2); // still green
    expect(greenAfter.principled.baseColor![0]).toBeLessThan(0.5); // NOT tinted red
    // crate_a forked a fresh, uniquified instance instead.
    const crateA = tweaked.census!.meshes.find((m) => m.object === "crate_a")!;
    expect(crateA.materials![0]).not.toBe("shared_metal__crate_a");
    fs.rmSync(path.join(dir, "tweaks.json"), { force: true });
  }, LONG);

  it("tints a textured material without losing its map", async () => {
    // A colour tweak on a textured material is a TINT: the runner injects
    // the same MULTIPLY-mix topology the glTF importer authors for
    // baseColorFactor x texture, so the exporter round-trips it back into
    // a factor and the map survives. Unlinking the map instead — the
    // scalar-override semantics — would ship a flat-colour box and call
    // it wood.
    const dir = workDir("good/textured_prop");
    fs.writeFileSync(
      path.join(dir, "tweaks.json"),
      JSON.stringify({ prp_box: { material: { baseColor: [0.9, 0.2, 0.15] } } }),
    );
    const result = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: 240_000 });
    const glbRel = result.manifest.exportedAssets.find((a) => a.endsWith(".glb"))!;
    const buf = fs.readFileSync(path.join(dir, glbRel));
    const jsonLen = buf.readUInt32LE(12);
    const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
    const mat = gltf.materials.find((m: { name: string }) =>
      m.name.startsWith("mtl_box_wood"),
    ) as { pbrMetallicRoughness: { baseColorTexture?: unknown; baseColorFactor?: number[] } };
    expect(mat).toBeTruthy();
    // The map survived the tint…
    expect(mat.pbrMetallicRoughness.baseColorTexture).toBeTruthy();
    // …and the tint shipped as the multiplying factor.
    const factor = mat.pbrMetallicRoughness.baseColorFactor!;
    expect(factor[0]).toBeCloseTo(0.9, 2);
    expect(factor[1]).toBeCloseTo(0.2, 2);
    expect(factor[2]).toBeCloseTo(0.15, 2);
    fs.rmSync(path.join(dir, "tweaks.json"), { force: true });
  }, LONG);

  it("flags pbr violations and missing camera in the pbr fixture", async () => {
    const dir = workDir("poisoned/pbr");
    // Issue-code assertions only; nothing downstream of lint is read.
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: 240_000,
    });
    expect(result.ok).toBe(false);
    const codes = new Set(result.issues.map((i) => i.code));
    expect(codes.has("S3D-E-341")).toBe(true); // metallic 0.5
    expect(codes.has("S3D-E-381")).toBe(true); // no camera
    expect(codes.has("S3D-W-341")).toBe(true); // untouched default material
expect(codes.has("S3D-W-381")).toBe(true); // no lights
  }, LONG);
});



