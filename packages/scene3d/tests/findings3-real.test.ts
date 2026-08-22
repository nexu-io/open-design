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

  it("still measures and reports the z-fight when it is under the cap", async () => {
    // The control: the same coincident geometry, cheap enough to compare.
    // A cap that suppressed the finding outright would pass the test above.
    const dir = mkProject({ "build.py": coincidentPlates(0) });
    const r = await run(dir);
    expect(r.issues.map((i) => i.code)).toContain("S3D-E-324");
    expect(r.census!.zFightingSkipped ?? []).toHaveLength(0);
  });
});
