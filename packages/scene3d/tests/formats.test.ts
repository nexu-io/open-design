import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { ISSUE_CODES } from "../src/errors.js";
import { rmForSetup } from "./helpers/fs.js";
import { assertBlenderIfRequired } from "./helpers/blender-gate.js";

/**
 * Format breadth and damage tolerance, on real files.
 *
 * The compiler must not be a one-format tool: OBJ+MTL, FBX (round-tripped
 * through our own exporter), and glTF all compile through the same gates.
 * Damaged files fail as NAMED diagnostics — the importer's own reason —
 * and degraded imports (missing .mtl, empty geometry) are detected and
 * reported with the fix, never silently absorbed and never mutated: the
 * deterministic repair posture is detect-and-name.
 */
const hasBlender = (await probeBlender({})) !== null;
assertBlenderIfRequired(hasBlender);

describe.skipIf(!hasBlender)("format breadth (real Blender)", () => {
  const fixture = (name: string) => path.join(__dirname, "fixtures", name);
  let workSeq = 0;
  const freshDir = (label: string) => {
    const dir = path.join(__dirname, ".work", `${label}-fmt-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.cpSync(fixture("real/fox/scene3d.json"), path.join(dir, "scene3d.json"));
    return dir;
  };
  const LONG = 300_000;
  const lintOnly = ["parse", "build", "lint"] as const;

  it("compiles a rigged, skinned, animated human (CesiumMan) and reports the rig", async () => {
    const dir = freshDir("cesium");
    fs.cpSync(fixture("real/cesium/CesiumMan.glb"), path.join(dir, "CesiumMan.glb"));
    const result = await compile({ projectDir: dir, stages: [...lintOnly], timeoutMs: LONG, noCache: true });
    expect(result.summary.errors).toBe(0);
    expect(result.census!.armatures!.length).toBeGreaterThan(0);
    // A full humanoid rig: CesiumMan ships 19 joints.
    expect(result.census!.armatures![0]!.bones).toBeGreaterThanOrEqual(15);
    expect(result.census!.animation.actionNames!.length).toBeGreaterThan(0);
    expect(result.census!.animation.frameEnd).toBeGreaterThan(result.census!.animation.frameStart);
  });

  it("re-exports a rigged import as GLB with the skin intact", async () => {
    const dir = freshDir("cesium-roundtrip");
    fs.cpSync(fixture("real/cesium/CesiumMan.glb"), path.join(dir, "CesiumMan.glb"));
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "export", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.summary.errors).toBe(0);
    // The joints round-trip through the USD master IN ORDER: W-902 stays
    // silent on a well-behaved rig. If our master round-trip ever starts
    // shuffling the joint list (which would silently misalign skin weights),
    // this pin goes red — that is exactly the signal the code exists for.
    expect(result.issues.some((i) => i.code === "S3D-W-902")).toBe(false);
    const glb = result.exportedAssets.find((a) => a.endsWith(".glb"))!;
    const buffer = fs.readFileSync(path.join(dir, glb));
    const jsonLength = buffer.readUInt32LE(12);
    const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
    // The rig survived our own exporter: skins, joints, and animation.
    expect(gltf.skins?.length).toBeGreaterThan(0);
    expect(gltf.skins[0].joints.length).toBeGreaterThanOrEqual(15);
    expect(gltf.animations?.length).toBeGreaterThan(0);
    // The `od_imported` provenance tag is INTERNAL lint bookkeeping measured at
    // the import site; it must never ride into a shipped deliverable. The USD
    // exporter authors custom properties by default, so the tag is stripped
    // before export — the master stage the user downloads carries none of it.
    const usda = result.exportedAssets.find((a) => a.endsWith(".usda"))!;
    expect(usda).toBeTruthy();
    expect(fs.readFileSync(path.join(dir, usda), "utf8").includes("od_imported")).toBe(false);
  }, 400_000);

  it("compiles OBJ+MTL with its materials", async () => {
    // A committed hand-authored OBJ + material library: this used to read
    // from a developer's Downloads folder and silently return when the
    // files were absent - a green run that proved nothing, on any machine
    // but one. The fixture is tiny and the skip is gone.
    const dir = freshDir("obj");
    fs.cpSync(fixture("obj/crate.obj"), path.join(dir, "crate.obj"));
    fs.cpSync(fixture("obj/crate.mtl"), path.join(dir, "crate.mtl"));
    const result = await compile({ projectDir: dir, stages: [...lintOnly], timeoutMs: LONG, noCache: true });
    expect(result.summary.errors).toBe(0);
    expect(result.census!.meshes.length).toBeGreaterThan(0);
    expect(result.census!.materials.length).toBeGreaterThan(0);
  });

  it("round-trips FBX: our exporter's output re-imports through the same gates", async () => {
    const exportDir = freshDir("fbx-export");
    fs.cpSync(fixture("real/helmet/DamagedHelmet.glb"), path.join(exportDir, "DamagedHelmet.glb"));
    fs.writeFileSync(
      path.join(exportDir, "scene3d.json"),
      JSON.stringify({
        schemaVersion: 1,
        conventions: {
          naming: { objectPattern: "^.+$", forbidDefaultNames: false },
          geometry: { allowOpenMeshes: true, requireAppliedScale: false },
          pbr: { metallicValues: [] },
          uv: { allowFlipped: true, maxOverlapFraction: 1 },
        },
        export: { formats: ["fbx"] },
      }),
      "utf8",
    );
    const exported = await compile({
      projectDir: exportDir,
      stages: ["parse", "build", "export", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(exported.summary.errors).toBe(0);
    const fbx = exported.exportedAssets.find((a) => a.endsWith(".fbx"))!;
    expect(fbx).toBeTruthy();

    const importDir = freshDir("fbx-import");
    fs.cpSync(path.join(exportDir, fbx), path.join(importDir, "helmet.fbx"));
    const reimported = await compile({
      projectDir: importDir,
      stages: [...lintOnly],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(reimported.summary.errors).toBe(0);
    const mesh = reimported.census!.meshes.find((m) => (m.tris ?? 0) > 1000)!;
    expect(mesh.tris).toBeGreaterThan(10_000);
  }, 500_000);

  it("fails a truncated GLB with the importer's named reason, not a traceback", async () => {
    const dir = freshDir("truncated");
    const whole = fs.readFileSync(fixture("real/helmet/DamagedHelmet.glb"));
    fs.writeFileSync(path.join(dir, "broken.glb"), whole.subarray(0, 1024));
    const result = await compile({ projectDir: dir, stages: [...lintOnly], timeoutMs: LONG, noCache: true });
    expect(result.ok).toBe(false);
    const failure = result.issues.find((i) => i.code === "S3D-E-202")!;
    expect(failure.message).toContain("broken.glb");
    expect(failure.message).not.toContain("Traceback");
  });

  it("detects a missing .mtl companion and names the repair (never mutates)", async () => {
    const dir = freshDir("no-mtl");
    fs.writeFileSync(
      path.join(dir, "orphan.obj"),
      "mtllib missing_library.mtl\no cube\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n",
      "utf8",
    );
    const before = fs.readFileSync(path.join(dir, "orphan.obj"), "utf8");
    const result = await compile({ projectDir: dir, stages: [...lintOnly], timeoutMs: LONG, noCache: true });
    const degraded = result.issues.find((i) => i.code === ISSUE_CODES.IMPORT_DEGRADED);
    expect(degraded).toBeTruthy();
    expect(degraded!.message).toContain("missing_library.mtl");
    // The repair posture is detect-and-name: the source is untouched.
    expect(fs.readFileSync(path.join(dir, "orphan.obj"), "utf8")).toBe(before);
  });

  it("reports a geometry-free import instead of silently compiling nothing", async () => {
    const dir = freshDir("empty-obj");
    fs.writeFileSync(path.join(dir, "nothing.obj"), "# just a comment\n", "utf8");
    const result = await compile({ projectDir: dir, stages: [...lintOnly], timeoutMs: LONG, noCache: true });
    const degraded = result.issues.find((i) => i.code === ISSUE_CODES.IMPORT_DEGRADED);
    expect(degraded).toBeTruthy();
    expect(degraded!.message).toContain("no mesh objects");
  });
});
