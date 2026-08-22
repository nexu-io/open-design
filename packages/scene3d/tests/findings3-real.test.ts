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

  it("still measures and reports the z-fight when it is under the cap", async () => {
    // The control: the same coincident geometry, cheap enough to compare.
    // A cap that suppressed the finding outright would pass the test above.
    const dir = mkProject({ "build.py": coincidentPlates(0) });
    const r = await run(dir);
    expect(r.issues.map((i) => i.code)).toContain("S3D-E-324");
    expect(r.census!.zFightingSkipped ?? []).toHaveLength(0);
  });
});
