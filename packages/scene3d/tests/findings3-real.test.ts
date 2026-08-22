import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { rmForSetup } from "./helpers/fs.js";

/**
 * REAL-Blender coverage for the FINDINGS3 audit round.
 *
 * The theme running through that audit was **verdict totality**: a check that
 * exits without producing any of {clean, findings, unchecked(reason)} reads to
 * every consumer as "clean". Silence is not evidence — so each case here drives
 * real geometry through the whole pipeline and asserts the compiler said
 * SOMETHING true, not that it happened to stay quiet.
 */
const hasBlender = (await probeBlender({})) !== null;

describe.skipIf(!hasBlender)("FINDINGS3 (real Blender)", () => {
  let seq = 0;
  const LONG = 300_000;
  const mkProject = (files: Record<string, string>): string => {
    const dir = path.join(__dirname, ".work", `f3-${++seq}`);
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

  /** Two exactly-coincident plates, `cuts` subdivisions each. */
  const coincidentPlates = (cuts: number) => `
import bpy, bmesh

def plate(name):
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    if ${cuts} > 0:
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=${cuts}, use_grid_fill=True)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = (0.0, 0.0, 0.5)
    mat = bpy.data.materials.new("mtl_plate_" + name[-1])
    mat.use_nodes = True
    obj.data.materials.append(mat)
    return obj

plate("prp_plate_a")
plate("prp_plate_b")
`;

  it("never returns silence when the coplanar search hits its cost cap", async () => {
    // 294 faces each -> 588 triangles -> 345,744 triangle pairs, over the
    // 200,000-pair comparison cap. The cap used to be applied INSIDE
    // coplanar_overlap, which returned "no overlaps found" — a result the
    // caller could not distinguish from a clean scene. So two exactly
    // coincident meshes shipped a textbook z-fight with an empty pairs list
    // AND an empty skipped list: the one failure mode a measured contract
    // cannot afford.
    const dir = mkProject({ "build.py": coincidentPlates(6) });
    const r = await run(dir);
    const mesh = r.census!.meshes.find((m) => m.object === "prp_plate_a")!;
    expect(mesh.tris).toBeGreaterThan(450); // really is over the cap

    const zFight = r.issues.filter((i) => i.code === "S3D-E-324");
    const unchecked = r.issues.filter((i) => i.code === "S3D-W-323");
    // Either verdict is honest. Silence is not.
    expect(zFight.length + unchecked.length).toBeGreaterThan(0);
    expect(unchecked).toHaveLength(1);
    // The reason must name BOTH meshes and the cost — "unchecked" is only
    // useful if the reader can tell what to do about it.
    const reason = (r.census!.zFightingSkipped ?? []).join(" ");
    expect(reason).toContain("prp_plate_a");
    expect(reason).toContain("prp_plate_b");
    expect(reason).toMatch(/\d+ triangle pairs/);
  });

  it("says so when the viewer edit sidecar is unreadable", async () => {
    // A truncated tweaks.json used to be swallowed by `catch {}`: the compile
    // reported a clean scene while the geometry silently reverted to the rest
    // pose. The author's only signal was that their drag had vanished.
    const dir = mkProject({
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "tw",
        parts: [{ id: "prp_box", size: [1, 1, 1] }],
        relations: [{ type: "at", part: "prp_box", center: [0, 0, 0.5] }],
      }),
      "tweaks.json": '{ "prp_box": { "translate": [0, 0, 1] ',
    });
    const r = await run(dir);
    const ignored = r.issues.filter((i) => i.code === "S3D-W-208");
    expect(ignored).toHaveLength(1);
    expect(ignored[0]!.message).toMatch(/not valid JSON/);
    // Still compiles — a bad viewer write must not wedge the scene.
    expect(r.census!.meshes.some((m) => m.object === "prp_box")).toBe(true);
  });

  it("names a viewport edit the runner cannot apply instead of no-op'ing it", async () => {
    // `apply_tweaks` skipped a non-positive scale with a bare `pass`, so a
    // mirrored scale silently did nothing — while the same negative scale
    // authored in a spec is S3D-E-327. Two authorities, one silent.
    const dir = mkProject({
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "tw",
        parts: [{ id: "prp_box", size: [1, 1, 1] }],
        relations: [{ type: "at", part: "prp_box", center: [0, 0, 0.5] }],
      }),
      "tweaks.json": JSON.stringify({ prp_box: { scale: [1, 1, -1], translate: [0, 0.25, 0] } }),
    });
    const r = await run(dir);
    const ignored = r.issues.filter((i) => i.code === "S3D-W-208");
    expect(ignored).toHaveLength(1);
    expect(ignored[0]!.message).toMatch(/scale .* is not positive/);
    // The VALID channel of the same edit still applies: rejecting one field
    // must not throw away the whole tweak. (Viewer space is glTF Y-up, so a
    // +Y drag is +Z in Blender.)
    const box = r.census!.objects.find((o) => o.name === "prp_box")!;
    expect(box.worldMin![2]).toBeCloseTo(0.25, 3);
  });

  /* ---- provenance posture: somebody else's asset ------------------- */

  const REAL = path.join(__dirname, "fixtures", "real");
  const dropAsset = (glb: string, extra: Record<string, string> = {}): string => {
    const dir = mkProject(extra);
    fs.copyFileSync(glb, path.join(dir, path.basename(glb)));
    return dir;
  };

  it("compiles a bare downloaded asset with no hand-written contract", async () => {
    // The damning case from the audit: the inspection posture was implemented
    // only for spec parts carrying `file:`, so a whole project whose source IS
    // a downloaded .glb — a documented, first-class workflow — got no
    // relaxation at all and compiled with ok:false. Every fixture in this repo
    // ships a hand-written relaxed scene3d.json, which is exactly what hid it.
    const dir = dropAsset(path.join(REAL, "fox", "Fox.glb"));
    const r = await run(dir);
    const blocking = r.issues.filter((i) => i.severity === "error");
    expect(blocking).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("still SAYS what it found — relaxation is reclassification, not silence", async () => {
    // The old mechanism suppressed the rule outright, so nothing in the report
    // could explain why a strict contract had gone quiet. Fox is ~100%
    // boundary edges: the finding must still be present, as a note that names
    // its own provenance.
    const dir = dropAsset(path.join(REAL, "fox", "Fox.glb"));
    const r = await run(dir);
    const open = r.issues.filter((i) => i.code === "S3D-E-321");
    expect(open.length).toBeGreaterThan(0);
    for (const issue of open) {
      expect(issue.severity).toBe("info");
      expect(issue.detail?.provenance).toBe("imported");
      expect(issue.detail?.relaxedFrom).toBe("error");
      expect(issue.hint).toMatch(/imported geometry/);
    }
  });

  it("lets an explicit convention block cancel the relaxation it governs", async () => {
    // Writing in a block is a statement that you meant its rules. It must
    // cancel that block's relaxation — and ONLY that block's: demanding
    // printable walls says nothing about how you feel about a downloaded
    // mesh's UVs.
    const dir = dropAsset(path.join(REAL, "fox", "Fox.glb"), {
      "scene3d.json": JSON.stringify({
        schemaVersion: 1,
        conventions: { geometry: { allowOpenMeshes: false } },
      }),
    });
    const r = await run(dir);
    const open = r.issues.filter((i) => i.code === "S3D-E-321");
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((i) => i.severity === "error")).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("keeps judging the author's own geometry strictly in the same scene", async () => {
    // Provenance is per-object, not per-scene: a spec that imports a real
    // asset next to authored boxes must still hold the boxes to the contract.
    const dir = mkProject({
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "mixed",
        parts: [
          { id: "prp_pedestal", size: [1, 1, 0.2] },
          { id: "prp_fox", size: [1, 1, 1], file: "Fox.glb" },
        ],
        relations: [
          { type: "at", part: "prp_pedestal", center: [0, 0, 0.1] },
          { type: "sits_on", part: "prp_fox", on: "prp_pedestal" },
        ],
      }),
    });
    fs.copyFileSync(path.join(REAL, "fox", "Fox.glb"), path.join(dir, "Fox.glb"));
    const r = await run(dir);
    const relaxed = r.issues.filter((i) => i.detail?.provenance === "imported");
    // Whatever was relaxed belongs to the imported part, never the authored one.
    for (const issue of relaxed) expect(issue.target).not.toBe("prp_pedestal");
  });

  /* ---- the oriented box is the authority ---------------------------- */

  const MC = JSON.stringify({ schemaVersion: 1, target: "minecraft" });

  /** A 1-block cube built at `loc`, optionally rotated and/or triangulated. */
  const cube = (opts: { rot?: string; tri?: boolean; loc?: string; size?: string } = {}) => `
import bpy, bmesh, math

mesh = bpy.data.meshes.new("prp_block_mesh")
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
${opts.tri ? "bmesh.ops.triangulate(bm, faces=bm.faces[:])" : ""}
bm.to_mesh(mesh)
bm.free()
obj = bpy.data.objects.new("prp_block", mesh)
bpy.context.scene.collection.objects.link(obj)
obj.scale = (${opts.size ?? "1.0, 1.0, 1.0"})
obj.location = (${opts.loc ?? "0.5, 0.5, 0.5"})
${opts.rot ? `obj.rotation_euler = (${opts.rot})` : ""}
mat = bpy.data.materials.new("mtl_block")
mat.use_nodes = True
obj.data.materials.append(mat)
bpy.context.view_layer.update()
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
`;

  it("recognises a triangulated cuboid as a cuboid", async () => {
    // A real MagicaVoxel/Qubicle OBJ export is triangulated. Boxness used to
    // demand 6 QUAD faces, so a visually perfect 1-block cube was reported
    // "not a single cuboid" (W-971) and then skipped by the exporter. Face
    // count is a fact about somebody's exporter; being a cuboid is a fact
    // about where the corners are.
    const dir = mkProject({ "scene3d.json": MC, "build.py": cube({ tri: true }) });
    const r = await run(dir);
    const v = r.census!.meshes.find((m) => m.object === "prp_block")!.voxel!;
    expect(v.isBox).toBe(true);
    expect(v.axisAligned).toBe(true);
    expect(v.localSize!.map((n) => Number(n.toFixed(4)))).toEqual([1, 1, 1]);
    expect(r.issues.map((i) => i.code)).not.toContain("S3D-W-971");
  });

  it("does not call a legally rotated element off-grid", async () => {
    // Java legalises 22.5°, and a box rotated 22.5° NECESSARILY has world-space
    // vertices off the axis-aligned grid. Measuring there fired W-970 — "it
    // will shimmer in-engine, snap the vertices to the grid" — on exactly the
    // rotations the format permits, with advice that cannot be followed.
    // Grid alignment is a question about the UN-ROTATED element.
    const dir = mkProject({
      "scene3d.json": MC,
      "build.py": cube({ rot: "0, 0, math.radians(22.5)" }),
    });
    const r = await run(dir);
    const v = r.census!.meshes.find((m) => m.object === "prp_block")!.voxel!;
    expect(v.rotationAxis).toBe("z");
    expect(v.rotationDeg).toBeCloseTo(22.5, 3);
    expect(r.issues.map((i) => i.code)).not.toContain("S3D-W-970"); // legal
    expect(r.issues.map((i) => i.code)).not.toContain("S3D-W-972"); // legal
  });

  it("still catches a genuinely off-grid element, rotated or not", async () => {
    // The control for the case above: half a pixel off, rotated legally. The
    // rotation must not become a way to hide from the grid rule.
    const dir = mkProject({
      "scene3d.json": MC,
      "build.py": cube({ rot: "0, 0, math.radians(22.5)", loc: "0.53125, 0.5, 0.5" }),
    });
    const r = await run(dir);
    const offGrid = r.issues.find((i) => i.code === "S3D-W-970");
    expect(offGrid).toBeDefined();
    expect(offGrid!.detail?.offGridPx).toBeCloseTo(0.5, 2);
  });

  it("exports a legally rotated element to Java instead of dropping it", async () => {
    // The census recovered centre/localSize/rotation and the Bedrock exporter
    // used them; the Java exporter skipped every rotated box claiming it could
    // not recover the un-rotated extent. A measured fact with no consumer.
    const dir = mkProject({
      "scene3d.json": MC,
      "build.py": cube({ rot: "0, 0, math.radians(22.5)" }),
    });
    await run(dir, ["parse", "build", "export", "lint"]);
    const model = JSON.parse(fs.readFileSync(path.join(dir, "out", "minecraft", "model.json"), "utf8"));
    expect(model.elements).toHaveLength(1);
    const el = model.elements[0];
    // The un-rotated 1-block box, in element space, on integer pixels.
    expect(el.from).toEqual([0, 0, -16]);
    expect(el.to).toEqual([16, 16, 0]);
    // Blender Z → MC Y, same sign (frame conjugation, defined in mc/common.ts).
    expect(el.rotation).toMatchObject({ axis: "y", angle: 22.5 });
    expect(el.rotation.origin).toEqual([8, 8, -8]);
  });

  it("refuses to round an illegal rotation into a legal one", async () => {
    // Shipping the author's 30° box as 22.5° would be wrong geometry sold as
    // success. W-972 says it; the exporter must agree, and say what it dropped.
    const dir = mkProject({
      "scene3d.json": MC,
      "build.py": cube({ rot: "0, 0, math.radians(30)" }),
    });
    const r = await run(dir, ["parse", "build", "export", "lint"]);
    expect(r.issues.map((i) => i.code)).toContain("S3D-W-972");
    const model = JSON.parse(fs.readFileSync(path.join(dir, "out", "minecraft", "model.json"), "utf8"));
    expect(model.elements).toHaveLength(0);
  });

  it("judges element bounds in the element's own frame, not its rotated silhouette", async () => {
    // A 2.5-block element rotated 45° has a 3.54-block world AABB, so it was
    // filed as multi-block structure (I-970) — which EXEMPTED it from the
    // element rules, including the out-of-bounds rule it was breaking.
    const dir = mkProject({
      "scene3d.json": MC,
      "build.py": cube({ rot: "0, 0, math.radians(45)", size: "2.5, 2.5, 0.5", loc: "0, 0, 0.25" }),
    });
    const r = await run(dir);
    const codes = r.issues.map((i) => i.code);
    expect(codes).not.toContain("S3D-I-970"); // 2.5 blocks IS element-scale
    expect(codes).toContain("S3D-W-973"); // ...and it really is out of bounds
  });

  it("recognises an elongated cuboid, where a face diagonal is shorter than an edge", async () => {
    // From a corner of a 0.2 × 0.2 × 1.0 post the offsets are 0.2, 0.2, 1.0
    // (edges), 0.283, 1.02, 1.02 (face diagonals) and 1.04 (body). Picking the
    // three SHORTEST offsets as the edges grabs the 0.283 face diagonal and the
    // post stops being a box — so every column, beam and limb in a real model
    // would drop out of the exporter. An offset is an edge exactly when it is
    // not the sum of two others.
    const dir = mkProject({
      "scene3d.json": MC,
      "build.py": cube({ size: "0.2, 0.2, 1.0", loc: "0.1, 0.1, 0.5" }),
    });
    const r = await run(dir);
    const v = r.census!.meshes.find((m) => m.object === "prp_block")!.voxel!;
    expect(v.isBox).toBe(true);
    expect(v.localSize!.map((n) => Number(n.toFixed(4)))).toEqual([0.2, 0.2, 1]);
  });

  /* ---- one contact model ------------------------------------------- */

  it("names the support a sits_on part is resting on", async () => {
    // `sits_on` deliberately embeds by MIN_CONTACT so two faces can never
    // share a plane and z-fight. The support search then rejected any contact
    // with a negative gap as "not below me" — which is exactly what that
    // deliberate embed looks like — so the rule built to name what a part
    // should be resting on could never name it for the one relation that puts
    // a part on something.
    const dir = mkProject({
      "scene3d.json": JSON.stringify({
        schemaVersion: 1,
        conventions: { grounding: { enabled: true } },
      }),
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "stack",
        parts: [
          { id: "prp_base", size: [1, 1, 0.2] },
          { id: "prp_box", size: [0.4, 0.4, 0.4] },
        ],
        relations: [
          { type: "at", part: "prp_base", center: [0, 0, 0.1] },
          { type: "sits_on", part: "prp_box", on: "prp_base" },
          { type: "align", part: "prp_box", to: "prp_base", axes: ["x", "y"] },
        ],
      }),
    });
    const r = await run(dir);
    const notGrounded = r.issues.find((i) => i.code === "S3D-W-325" && i.target === "prp_box");
    expect(notGrounded).toBeDefined();
    expect(notGrounded!.detail?.nearestSupport).toBe("prp_base");
    // ...and describes a 1mm deliberate embed as resting, not as floating
    // −0.001m, which is what a negative gap reads as if nobody looks.
    expect(notGrounded!.message).toContain("rests on 'prp_base'");
  });

  it("lets a scene float: grounded claims what it says, not what it implies", async () => {
    // Floating is a composition, not a defect — a lantern hangs, an orb
    // hovers, a cliff overhangs — and the compiler has no standing to call
    // those wrong. This claim was briefly made two-sided, on the reasoning
    // that a claim named "grounded" should not pass for a hovering scene;
    // that mistook a vocabulary collision for a missing check, and it failed
    // this repo's own showcase on its deliberately levitating orb the first
    // time it ran. The field documents one direction, and one direction is
    // what it adjudicates.
    const dir = mkProject({
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "float",
        parts: [
          { id: "prp_base", size: [1, 1, 0.2] },
          { id: "prp_orb", size: [0.4, 0.4, 0.4], shape: "sphere" },
        ],
        relations: [
          { type: "at", part: "prp_base", center: [0, 0, 0.1] },
          { type: "at", part: "prp_orb", center: [0, 0, 5] },
        ],
        claims: { grounded: true },
      }),
    });
    const r = await run(dir);
    expect(r.issues.filter((i) => i.code === "S3D-E-701")).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("still fails a grounded claim for a part sunk through the floor", async () => {
    // The direction that IS a defect: geometry below the ground plane is
    // through the floor in every engine that will load it.
    const dir = mkProject({
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "sunk",
        parts: [{ id: "prp_box", size: [1, 1, 1] }],
        relations: [{ type: "at", part: "prp_box", center: [0, 0, 0.2] }],
        claims: { grounded: true },
      }),
    });
    const r = await run(dir);
    const failed = r.issues.filter((i) => i.code === "S3D-E-701");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.message).toMatch(/sinks/);
  });

  it("passes a grounded claim for a part resting on another part", async () => {
    // The counterpart: resting is a RELATION, not a coordinate. A stacked
    // assembly is grounded even though only its base touches the floor —
    // making the claim mean "at z=0" would make it useless for any assembly.
    const dir = mkProject({
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "stack",
        parts: [
          { id: "prp_base", size: [1, 1, 0.2] },
          { id: "prp_top", size: [0.4, 0.4, 0.4] },
        ],
        relations: [
          { type: "at", part: "prp_base", center: [0, 0, 0.1] },
          { type: "sits_on", part: "prp_top", on: "prp_base" },
          { type: "align", part: "prp_top", to: "prp_base", axes: ["x", "y"] },
        ],
        claims: { grounded: true },
      }),
    });
    const r = await run(dir);
    expect(r.issues.filter((i) => i.code === "S3D-E-701")).toEqual([]);
  });

  /* ---- the cache key is the dependency closure --------------------- */

  it("busts the build cache when a referenced companion file changes", async () => {
    // The cache hashed the DECLARED file list. An .obj names its materials in
    // a sibling .mtl (and glTF splits geometry into an external .bin), so
    // editing the companion and recompiling reported build:cached and shipped
    // the previous appearance — with --no-cache as the only way to find out.
    const dir = mkProject({
      "box.obj": [
        "mtllib box.mtl",
        "o prp_box",
        "v 0 0 0", "v 1 0 0", "v 1 1 0", "v 0 1 0",
        "v 0 0 1", "v 1 0 1", "v 1 1 1", "v 0 1 1",
        "usemtl paint",
        "f 1 2 3 4", "f 5 8 7 6", "f 1 5 6 2",
        "f 2 6 7 3", "f 3 7 8 4", "f 4 8 5 1",
        "",
      ].join("\n"),
      "box.mtl": "newmtl paint\nKd 0.800 0.200 0.100\n",
    });
    const cached = (dir: string) =>
      compile({ projectDir: dir, stages: ["parse", "build", "lint"] as never, timeoutMs: LONG });

    const first = await cached(dir);
    expect(first.stages.find((s) => s.id === "build")?.status).toBe("ran");
    const second = await cached(dir);
    expect(second.stages.find((s) => s.id === "build")?.status).toBe("cached");

    // Same .obj, different .mtl: a real input changed.
    fs.writeFileSync(path.join(dir, "box.mtl"), "newmtl paint\nKd 0.100 0.200 0.800\n", "utf8");
    const third = await cached(dir);
    expect(third.stages.find((s) => s.id === "build")?.status).toBe("ran");
    // ...and the change actually reached the census, not just the hash.
    const colour = third.census!.materials[0]!.principled.baseColor!;
    expect(colour[2]).toBeGreaterThan(colour[0]!);
  });

  /* ---- master parity: who moves is known, not guessed --------------- */

  const dynamic = (name: string, dyn: Record<string, unknown>) => ({
    "scene.json": JSON.stringify({
      schemaVersion: 1,
      name,
      materials: { mtl_m: { baseColor: [0.5, 0.5, 0.5], roughness: 0.8 } },
      parts: [{ id: "prp_box", size: [1, 1, 1], material: "mtl_m", ...dyn }],
      relations: [{ type: "at", part: "prp_box", center: [0, 0, 1] }],
    }),
  });

  it("carries a bobbing part's clip into the master stage", async () => {
    // The re-import rebuilt keyframes for objects it detected as MOVERS by
    // comparing three frames — start, middle, end. A bob is keyed
    // 0, +A, 0, -A, 0 across exactly that range, so all three probes land on
    // the three zeroes, the part reads as static, no keyframes are rebuilt and
    // the clip vanishes from the master. Every bobbing scene therefore failed
    // its own parity check with E-901 while the identical scene SPINNING
    // passed, because a spin's midpoint (180 degrees) differs from its ends.
    const r = await run(mkProject(dynamic("bobber", { bob: { amplitude: 0.1 } })), [
      "parse", "build", "export", "lint",
    ]);
    expect(r.census!.animation?.actionNames).toEqual(["prp_boxAction"]);
    expect(r.issues.filter((i) => i.code === "S3D-E-901")).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("carries a spinning part's clip too", async () => {
    const r = await run(mkProject(dynamic("spinner", { spin: { seconds: 2 } })), [
      "parse", "build", "export", "lint",
    ]);
    expect(r.issues.filter((i) => i.code === "S3D-E-901")).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("packages only texture formats a USDZ reader accepts", async () => {
    // export_textures_mode:NEW materialises every referenced image beside the
    // stage, and for the ones the exporter SYNTHESISES during the export (a
    // flat world or material colour) Blender chooses OpenEXR. The USDZ then
    // stored a .exr — and USDZ's readers do not read EXR: Apple Quick Look
    // takes png and jpeg only, so the packaged asset rendered untextured in
    // the one place the format exists to serve. Nothing warned, because from
    // the compiler's side the reference resolved perfectly.
    const dir = mkProject({
      "scene.json": JSON.stringify({
        schemaVersion: 1,
        name: "usdz",
        materials: { mtl_flat: { baseColor: [0.6, 0.4, 0.2], roughness: 0.7 } },
        parts: [{ id: "prp_box", size: [1, 1, 1], material: "mtl_flat" }],
        relations: [{ type: "at", part: "prp_box", center: [0, 0, 0.5] }],
      }),
    });
    await run(dir, ["parse", "build", "export"]);
    const usdz = fs.readFileSync(path.join(dir, "out", "scene.usdz"));
    const entries: string[] = [];
    for (let i = 0; i < usdz.length - 30; i++) {
      if (usdz.readUInt32LE(i) === 0x04034b50) {
        const n = usdz.readUInt16LE(i + 26);
        entries.push(usdz.subarray(i + 30, i + 30 + n).toString("utf8"));
      }
    }
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry, `${entry} is not readable inside a USDZ`).toMatch(/\.(usda|usdc|png|jpe?g)$/i);
    }
    // ...and the stage does not reference a file that is no longer there.
    const stage = fs.readFileSync(path.join(dir, "out", "scene.usda"), "utf8");
    expect(stage).not.toMatch(/\.exr/i);
  });

  it("still measures and reports the z-fight when it is under the cap", async () => {
    // The control: the same coincident geometry, cheap enough to compare.
    // A cap that suppressed the finding outright would pass the test above.
    const dir = mkProject({ "build.py": coincidentPlates(0) });
    const r = await run(dir);
    expect(r.issues.map((i) => i.code)).toContain("S3D-E-324");
    expect(r.census!.zFightingSkipped ?? []).toHaveLength(0);
  });
});
