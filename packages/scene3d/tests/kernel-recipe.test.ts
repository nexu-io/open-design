import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runRecipe } from "../src/parse/recipe.js";
import { evalTrace, Recorder, traceHash } from "../src/kernel/trace.js";
import { predictCensus } from "../src/kernel/mesh.js";
import type { KernelMesh, RVec3 } from "../src/kernel/mesh.js";

/**
 * The recipe front-end: ordinary Python authors a trace, the ONE TypeScript
 * evaluator turns it into geometry. These prove the IR is genuinely
 * front-end-neutral — a Python recipe and the TS reference recorder produce a
 * BYTE-IDENTICAL trace (same content hash) and therefore the same exact mesh.
 *
 * Gated on a CPython being present, the way the Blender suites gate on
 * Blender: absent, they green-skip; set SCENE3D_REQUIRE_PYTHON=1 on a machine
 * that is supposed to have it to make a missing interpreter fail loudly.
 */

const RUNNER = fileURLToPath(new URL("../scripts/kernel/recipe_runner.py", import.meta.url));
const PYTHON = process.env.SCENE3D_RECIPE_PYTHON ?? "python3";

function pythonPresent(): boolean {
  const probe = spawnSync(PYTHON, ["--version"], { encoding: "utf8", windowsHide: true });
  return !probe.error && probe.status === 0;
}
const present = pythonPresent();
if (!present && process.env.SCENE3D_REQUIRE_PYTHON) {
  throw new Error(`SCENE3D_REQUIRE_PYTHON is set but '${PYTHON}' is not runnable`);
}

const keys = (m: KernelMesh): string[] =>
  m.verts.map((v: RVec3) => `${v[0].key()},${v[1].key()},${v[2].key()}`).sort();

function writeRecipe(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "s3d-recipe-"));
  const file = join(dir, "recipe.py");
  writeFileSync(file, body, "utf8");
  return file;
}

describe.skipIf(!present)("kernel recipe: Python front-end produces the same IR as TS", () => {
  it("a Python recipe hashes byte-identically to the TS reference recorder", () => {
    const recipe = writeRecipe("def build(ctx):\n    ctx.box().subdivide(2).mirror(0)\n");
    const result = runRecipe(recipe, { runnerScript: RUNNER, pythonBin: PYTHON });
    expect(result.ok).toBe(true);
    // The reference the eventual scene.json front-end will also target.
    const reference = new Recorder().box().subdivide(2).mirror(0).trace();
    expect(traceHash(result.trace!)).toBe(traceHash(reference)); // cross-language determinism
    // And it evaluates to the same exact geometry.
    expect(keys(evalTrace(result.trace!))).toEqual(keys(evalTrace(reference)));
  });

  it("an imperative recipe (loops, fractions) yields an exact watertight mesh", () => {
    // Ordinary Python: a loop and a rational half-size. The point is that
    // arbitrary imperative code produces a TRACE, not geometry — and a closed
    // box subdivided three times is still watertight, genus 0, by the exact
    // census the compiler will adjudicate.
    const recipe = writeRecipe(
      [
        "from fractions import Fraction",
        "def build(ctx):",
        "    ctx.box(Fraction(1, 2))",
        "    for _ in range(3):",
        "        ctx.subdivide(1)",
        "",
      ].join("\n"),
    );
    const result = runRecipe(recipe, { runnerScript: RUNNER, pythonBin: PYTHON });
    expect(result.ok).toBe(true);
    const census = predictCensus(evalTrace(result.trace!));
    expect(census.watertight).toBe(true);
    expect(census.genus).toBe(0);
    // Determinism: the same recipe run twice is byte-identical.
    const again = runRecipe(recipe, { runnerScript: RUNNER, pythonBin: PYTHON });
    expect(traceHash(again.trace!)).toBe(traceHash(result.trace!));
  });

  it("a recipe using move hashes identically to the TS recorder", () => {
    const recipe = writeRecipe(
      "def build(ctx):\n    ctx.box().move({'z': [1, 1]}, [0, '1/4', 2]).subdivide(1)\n",
    );
    const result = runRecipe(recipe, { runnerScript: RUNNER, pythonBin: PYTHON });
    expect(result.ok).toBe(true);
    const reference = new Recorder().box().move({ z: [1, 1] }, [0, "1/4", 2]).subdivide(1).trace();
    expect(traceHash(result.trace!)).toBe(traceHash(reference));
  });

  it("a recipe using extrude hashes identically and builds a closed boss", () => {
    const recipe = writeRecipe(
      "def build(ctx):\n    ctx.box().extrude({'z': ['1', '1']}, [0, 0, 1]).subdivide(1)\n",
    );
    const result = runRecipe(recipe, { runnerScript: RUNNER, pythonBin: PYTHON });
    expect(result.ok).toBe(true);
    const reference = new Recorder().box().extrude({ z: ["1", "1"] }, [0, 0, 1]).subdivide(1).trace();
    expect(traceHash(result.trace!)).toBe(traceHash(reference));
    const census = predictCensus(evalTrace(result.trace!));
    expect(census.watertight).toBe(true);
    expect(census.genus).toBe(0);
  });

  it("a recipe using scale hashes identically to the TS recorder", () => {
    const recipe = writeRecipe(
      "def build(ctx):\n    ctx.box().scale({'z': ['1', '1']}, [2, 2, 1], [0, 0, 0]).subdivide(1)\n",
    );
    const result = runRecipe(recipe, { runnerScript: RUNNER, pythonBin: PYTHON });
    expect(result.ok).toBe(true);
    const reference = new Recorder().box().scale({ z: ["1", "1"] }, [2, 2, 1], [0, 0, 0]).subdivide(1).trace();
    expect(traceHash(result.trace!)).toBe(traceHash(reference));
  });

  it("a recipe using crease hashes identically to the TS recorder", () => {
    const recipe = writeRecipe(
      "def build(ctx):\n    ctx.box().crease({'z': ['-1', '-1']}).subdivide(2)\n",
    );
    const result = runRecipe(recipe, { runnerScript: RUNNER, pythonBin: PYTHON });
    expect(result.ok).toBe(true);
    const reference = new Recorder().box().crease({ z: ["-1", "-1"] }).subdivide(2).trace();
    expect(traceHash(result.trace!)).toBe(traceHash(reference));
    // And the crease is topology-preserving, so the census is unchanged.
    const census = predictCensus(evalTrace(result.trace!));
    expect([census.vertices, census.faces, census.triangles]).toEqual([98, 96, 192]);
    expect(census.min[2]).toBe(-1); // flat, crisp base
  });

  it("surfaces a recipe's contract error as a sentence, not a traceback", () => {
    const missing = writeRecipe("x = 1\n");
    const r1 = runRecipe(missing, { runnerScript: RUNNER, pythonBin: PYTHON });
    expect(r1.ok).toBe(false);
    expect(r1.error).toContain("must define build(ctx)");

    const float = writeRecipe("def build(ctx):\n    ctx.cage([[0.5,0,0],[1,0,0],[1,1,0]], [[0,1,2]])\n");
    const r2 = runRecipe(float, { runnerScript: RUNNER, pythonBin: PYTHON });
    expect(r2.ok).toBe(false);
    expect(r2.error).toContain("never a float");
    expect(r2.error).toContain("line 2"); // the recipe's own line

    const empty = writeRecipe("def build(ctx):\n    pass\n");
    const r3 = runRecipe(empty, { runnerScript: RUNNER, pythonBin: PYTHON });
    expect(r3.ok).toBe(false);
    expect(r3.error).toContain("no operators");
  });

  it("rejects a trace with an out-of-range face index", () => {
    // The structural validator stands between an arbitrary producer and the
    // evaluator — a face index past the cage cannot reach the kernel.
    const bad = writeRecipe("def build(ctx):\n    ctx.cage([[0,0,0],[1,0,0],[1,1,0]], [[0,1,9]])\n");
    const r = runRecipe(bad, { runnerScript: RUNNER, pythonBin: PYTHON });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("face index");
  });
});
