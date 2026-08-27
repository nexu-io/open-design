import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { Recorder, evalTrace } from "../src/kernel/trace.js";
import { fitKernelMesh, predictCensus } from "../src/kernel/mesh.js";
import { rat } from "../src/kernel/rational.js";
import { rmForSetup } from "./helpers/fs.js";
import { assertBlenderIfRequired } from "./helpers/blender-gate.js";

/**
 * The kernel recipe path, end to end against REAL Blender — the known-answer
 * test that closes fable's "predicted census as an adjudicated claim" loop.
 *
 * A recipe (ordinary Python) authors an operator trace; the one evaluator
 * turns it into an exact mesh and predicts its census; Blender builds the
 * emitted geometry and the runner MEASURES it; and lint adjudicates the
 * prediction against the measurement (S3D-E-702). If they ever disagreed the
 * compile would fail — so `ok === true` on a recipe scene is itself the proof
 * that the evaluator, the once-only float bake, and Blender all agree to the
 * vertex. The exact counts below are the closed-form answer for two
 * Catmull-Clark steps of a cube: V = 98, F = 96 quads, 192 triangles.
 */
const python = process.env.SCENE3D_RECIPE_PYTHON ?? "python3";
const hasPython = !spawnSync(python, ["--version"], { encoding: "utf8", windowsHide: true }).error;
const hasBlender = (await probeBlender({})) !== null;
assertBlenderIfRequired(hasBlender);

describe.skipIf(!hasBlender)("kernel recipe pipeline (real Blender)", () => {
  const fixture = (name: string) => path.join(__dirname, "fixtures", name);
  const workDir = (name: string) => {
    const dir = path.join(__dirname, ".work", `${name.replace(/[\\/]/g, "_")}-recipe`);
    rmForSetup(dir);
    fs.cpSync(fixture(name), dir, { recursive: true });
    return dir;
  };

  it.skipIf(!hasPython)("builds a recipe part whose exact prediction matches the measured census", async () => {
    const dir = workDir("good/spec_recipe");
    const result = await compile({ projectDir: dir, proof: { turntable: false } });

    // The compiler adjudicated its own prediction against the build: no
    // mismatch, so the whole scene is ok. (A vertex off by one would be an
    // E-702 and ok:false.)
    const codes = result.issues.map((i) => i.code);
    expect(codes).not.toContain("S3D-E-702");
    expect(codes).not.toContain("S3D-W-702");
    expect(result.ok).toBe(true);

    // The census measured EXACTLY the closed-form prediction.
    const hull = result.census!.meshes.find((m) => m.object === "prp_hull");
    expect(hull).toBeDefined();
    expect(hull!.verts).toBe(98);
    expect(hull!.faces).toBe(96);
    expect(hull!.tris).toBe(192);
    expect(hull!.nonManifoldEdges).toBe(0); // watertight, as predicted
    expect(hull!.ngons).toBe(0); // Catmull-Clark output is all quads
    // The morph target authored on the cage landed as a Blender shape key on
    // the subdivided surface — and its name was adjudicated (no E-702).
    expect(hull!.shapeKeys).toEqual(["bulge"]);

    // The authored claims (parts:1, watertight:true) held too.
    expect(result.manifest.claims?.failed ?? 0).toBe(0);

    // A GLB deliverable shipped.
    const glb = fs.existsSync(path.join(dir, "out", "scene.glb"));
    expect(glb).toBe(true);
  }, 300_000);

  it.skipIf(!hasPython)("proves a PLANAR volume claim end to end, and refutes a wrong one", async () => {
    // The physics certificate through the whole chain on a mesh where the volume
    // is a theorem about the DELIVERABLE: a plain box has flat faces, so its
    // volume is triangulation-independent (ambiguity 0) and the exact claim
    // adjudicates cleanly. The build's own fan-measured volume matches the exact
    // value within the float32 bound (no S3D-E-703). The claimed value is the
    // compiler's OWN exact volume — computed here by the same kernel the pipeline
    // runs (a box fitted into its [1,1,1] box), so a mismatch would be a real
    // Python↔TS divergence, not a test guess.
    const boxVol = predictCensus(
      fitKernelMesh(evalTrace(new Recorder().box().trace()), [], [rat(1), rat(1), rat(1)]).base,
      { mass: true },
    ).mass!.volumeExact;
    const boxRecipe = (claims: Record<string, unknown>): string => {
      const dir = workDir("good/spec_recipe");
      fs.writeFileSync(path.join(dir, "hull.py"), "def build(ctx):\n    ctx.box()\n", "utf8");
      const scene = JSON.parse(fs.readFileSync(path.join(dir, "scene.json"), "utf8"));
      scene.claims = { ...scene.claims, ...claims };
      fs.writeFileSync(path.join(dir, "scene.json"), JSON.stringify(scene), "utf8");
      return dir;
    };

    const right = await compile({ projectDir: boxRecipe({ volume: boxVol }), proof: { turntable: false }, noCache: true });
    expect(right.issues.some((i) => i.code === "S3D-E-701")).toBe(false); // claim holds
    expect(right.issues.some((i) => i.code === "S3D-E-703")).toBe(false); // build matches within bound
    // And it is genuinely CHECKED — a planar mesh is not triangulation-dependent.
    expect(right.issues.some((i) => i.code === "S3D-W-701" && /volume/.test(i.message))).toBe(false);
    expect(right.ok).toBe(true);

    const wrong = await compile({ projectDir: boxRecipe({ volume: "1/2" }), proof: { turntable: false }, noCache: true });
    const failed = wrong.issues.find((i) => i.code === "S3D-E-701" && /volume/.test(i.message));
    expect(failed).toBeDefined();
    expect(failed!.message).toContain(boxVol); // names the exact volume it computed
    expect(wrong.ok).toBe(false);
  }, 300_000);

  it.skipIf(!hasPython)("reports a NON-PLANAR volume as UNCHECKED with the exact triangulation band", async () => {
    // The realistic case: a Catmull-Clark subdivided surface has non-planar
    // quads, so glTF/USD re-triangulation can move the shipped volume. The exact
    // fan volume is not a theorem about the deliverable, so the claim is UNCHECKED
    // — WITH the ℚ band and the triangulate exit named — while E-703 still confirms
    // the build reproduces the fan volume. VOL is the exact fan volume of the
    // creased, twice-subdivided cube in a [1,1,1] box.
    const VOL = "297412448/475021263";
    const dir = workDir("good/spec_recipe");
    const scene = JSON.parse(fs.readFileSync(path.join(dir, "scene.json"), "utf8"));
    scene.claims = { ...scene.claims, volume: VOL };
    fs.writeFileSync(path.join(dir, "scene.json"), JSON.stringify(scene), "utf8");

    const result = await compile({ projectDir: dir, proof: { turntable: false }, noCache: true });
    // The build self-check still holds: Blender's fan volume matches the exact fan.
    expect(result.issues.some((i) => i.code === "S3D-E-703")).toBe(false);
    // The claim is neither passed nor failed — it is unchecked, triangulation-
    // dependent, naming the exact fan volume and the structural exit.
    const u = result.issues.find((i) => i.code === "S3D-W-701" && /triangulation-dependent/.test(i.message));
    expect(u).toBeDefined();
    expect(u!.message).toContain(VOL); // the exact fan volume, at the band's centre
    expect(u!.message).toContain("ctx.triangulate()"); // names the real escape hatch
    expect(result.issues.some((i) => i.code === "S3D-E-701")).toBe(false); // never a fail
  }, 300_000);

  it.skipIf(!hasPython)("ctx.triangulate() makes an ORGANIC mesh's volume claim PROVABLE end to end", async () => {
    // The escape hatch closing the creative loop: a subdivided (curved) surface
    // would leave its volume claim unchecked (triangulation-dependent), but
    // appending ctx.triangulate() bakes one triangulation in — every face planar,
    // ambiguity 0 — so the exact volume becomes a theorem about the SHIPPED mesh
    // and the claim PASSES. The volume is the compiler's own value (computed by
    // the same kernel), and it is UNCHANGED by triangulating (the same fan).
    const vol = predictCensus(
      fitKernelMesh(evalTrace(new Recorder().box().subdivide(2).triangulate().trace()), [], [rat(1), rat(1), rat(1)]).base,
      { mass: true },
    ).mass!.volumeExact;
    const dir = workDir("good/spec_recipe");
    fs.writeFileSync(path.join(dir, "hull.py"), "def build(ctx):\n    ctx.box().subdivide(2).triangulate()\n", "utf8");
    const scene = JSON.parse(fs.readFileSync(path.join(dir, "scene.json"), "utf8"));
    scene.claims = { ...scene.claims, volume: vol };
    fs.writeFileSync(path.join(dir, "scene.json"), JSON.stringify(scene), "utf8");

    const result = await compile({ projectDir: dir, proof: { turntable: false }, noCache: true });
    // CHECKED and held: no failure, no divergence, and NOT unchecked (it is planar now).
    expect(result.issues.some((i) => i.code === "S3D-E-701")).toBe(false);
    expect(result.issues.some((i) => i.code === "S3D-E-703")).toBe(false);
    expect(result.issues.some((i) => i.code === "S3D-W-701" && /volume/.test(i.message))).toBe(false);
    expect(result.ok).toBe(true);
  }, 300_000);

  it.skipIf(!hasPython)("ctx.clip() chamfers a box end to end — planar faces, a PROVABLE volume", async () => {
    // The first CSG operator through the whole chain: clipping the (1,1,1) corner
    // of a box leaves every face planar (a plane through a planar face stays
    // planar, and the cap lies on the plane), so the clipped solid's volume is
    // triangulation-INDEPENDENT and its claim is CHECKED — no triangulate needed.
    // The value is the compiler's own exact volume of the fitted, clipped mesh,
    // so a mismatch would be a real Python↔TS divergence.
    const vol = predictCensus(
      fitKernelMesh(evalTrace(new Recorder().box().clip([1, 1, 1], "5/2").trace()), [], [rat(1), rat(1), rat(1)]).base,
      { mass: true },
    ).mass!.volumeExact;
    const dir = workDir("good/spec_recipe");
    fs.writeFileSync(path.join(dir, "hull.py"), "def build(ctx):\n    ctx.box().clip([1, 1, 1], '5/2')\n", "utf8");
    const scene = JSON.parse(fs.readFileSync(path.join(dir, "scene.json"), "utf8"));
    scene.claims = { ...scene.claims, volume: vol, watertight: true };
    fs.writeFileSync(path.join(dir, "scene.json"), JSON.stringify(scene), "utf8");

    const result = await compile({ projectDir: dir, proof: { turntable: false }, noCache: true });
    // The build reproduced the exact prediction (topology + volume), and the
    // volume claim is CHECKED and held — not unchecked, because the cut is planar.
    expect(result.issues.some((i) => i.code === "S3D-E-702")).toBe(false);
    expect(result.issues.some((i) => i.code === "S3D-E-703")).toBe(false);
    expect(result.issues.some((i) => i.code === "S3D-E-701")).toBe(false);
    expect(result.issues.some((i) => i.code === "S3D-W-701" && /volume/.test(i.message))).toBe(false);
    expect(result.ok).toBe(true);
  }, 300_000);

  it.skipIf(!hasPython)("measures a FAR-PLACED part's volume translation-stably (no phantom E-703)", async () => {
    // The build places a part by its object LOCATION and keeps the mesh in the
    // local frame, so `fan_volume` reads small local coordinates and scales by
    // |det(matrix_world 3x3)| — translation never enters the determinant sum.
    // Measured in WORLD space instead, a part 1000 m from the origin would drown
    // its own ~1 m³ volume in float cancellation and trip a phantom S3D-E-703;
    // measured locally, the exact fit and the build still agree to the bound.
    const dir = workDir("good/spec_recipe");
    fs.writeFileSync(path.join(dir, "hull.py"), "def build(ctx):\n    ctx.box()\n", "utf8");
    const scene = JSON.parse(fs.readFileSync(path.join(dir, "scene.json"), "utf8"));
    scene.relations = [{ type: "at", part: "prp_hull", center: [1000, 1000, 1000] }];
    fs.writeFileSync(path.join(dir, "scene.json"), JSON.stringify(scene), "utf8");

    const result = await compile({ projectDir: dir, proof: { turntable: false }, noCache: true });
    expect(result.issues.some((i) => i.code === "S3D-E-703")).toBe(false); // translation-stable
    expect(result.issues.some((i) => i.code === "S3D-E-702")).toBe(false); // topology intact
  }, 300_000);

  it.skipIf(!hasPython)("fails the compile when a recipe cannot produce geometry — the loop has teeth", async () => {
    // Sanity that the adjudication is load-bearing: an empty recipe is a
    // contract failure surfaced as a parse-class error, never a silent empty
    // box.
    const dir = workDir("good/spec_recipe");
    fs.writeFileSync(path.join(dir, "hull.py"), "def build(ctx):\n    pass\n", "utf8");
    const result = await compile({ projectDir: dir, proof: { turntable: false }, noCache: true });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.message.includes("recorded no operators"))).toBe(true);
  }, 300_000);
});
