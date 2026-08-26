import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
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
