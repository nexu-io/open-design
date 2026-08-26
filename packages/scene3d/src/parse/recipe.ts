import { spawnSync } from "node:child_process";
import type { Trace } from "../kernel/trace.js";

/**
 * Run a kernel RECIPE and recover its operator trace.
 *
 * This is the I/O boundary between the raw authoring path and the pure kernel:
 * the recipe is the author's imperative Python, run in PLAIN CPython (never
 * Blender — no bpy, no ops, no randomness), and all it produces is a trace of
 * exact rational operators. The compiler's single TypeScript evaluator
 * (`evalTrace`) turns that trace into geometry; the author's process never
 * touches the mesh. That split is what lets the raw path stay imperative while
 * the compiler still predicts and adjudicates the result.
 *
 * The harness prints one sentinel-framed line; everything else on stdout is a
 * recipe's own chatter and is ignored. A non-zero exit is a contract failure,
 * and its stderr is already a sentence (with the recipe's line number), so it
 * is surfaced verbatim rather than wrapped in a second traceback.
 */

const SENTINEL = /###SCENE3D-TRACE###(.*)###\s*$/m;

export interface RunRecipeOptions {
  /** Absolute path to `scripts/kernel/recipe_runner.py`. */
  runnerScript: string;
  /** CPython to run it with. Default: $SCENE3D_RECIPE_PYTHON, else python3. */
  pythonBin?: string;
  /** Milliseconds before the recipe is judged hung. Default 20s — a recipe is
   *  pure Python authoring a small trace, not a render. */
  timeoutMs?: number;
}

export interface RecipeResult {
  ok: boolean;
  trace?: Trace;
  /** A one-line, already-formatted reason when `ok` is false. */
  error?: string;
}

export function runRecipe(recipePath: string, opts: RunRecipeOptions): RecipeResult {
  const python = opts.pythonBin ?? process.env.SCENE3D_RECIPE_PYTHON ?? "python3";
  const run = spawnSync(python, [opts.runnerScript, recipePath], {
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 20_000,
    windowsHide: true,
  });

  if (run.error) {
    // A missing interpreter is an environment fault, not a recipe fault — say
    // which, so the reader fixes the toolchain rather than their recipe.
    const code = (run.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false, error: `CPython not found (tried '${python}'); set SCENE3D_RECIPE_PYTHON to a python3` };
    }
    return { ok: false, error: `recipe run failed to start: ${run.error.message}` };
  }
  if (run.status !== 0) {
    const reason = (run.stderr || "").trim() || `recipe exited with status ${run.status ?? "unknown"}`;
    return { ok: false, error: reason };
  }

  const match = SENTINEL.exec(run.stdout || "");
  if (!match) {
    return { ok: false, error: "recipe produced no trace — the harness printed no ###SCENE3D-TRACE### line" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]!);
  } catch (e) {
    return { ok: false, error: `recipe trace was not valid JSON: ${(e as Error).message}` };
  }
  const invalid = validateTraceShape(parsed);
  if (invalid) return { ok: false, error: invalid };
  return { ok: true, trace: parsed as Trace };
}

/** Structurally validate the trace the harness handed back — a recipe (or a
 *  future front-end) cannot smuggle an unknown op or a malformed cage past the
 *  evaluator without a named reason. Returns null when the shape is sound. */
function validateTraceShape(value: unknown): string | null {
  if (value === null || typeof value !== "object") return "trace must be a JSON object";
  const t = value as Record<string, unknown>;
  if (t.version !== 1) return `trace version must be 1 (got ${JSON.stringify(t.version)})`;
  if (!Array.isArray(t.ops)) return "trace.ops must be an array";
  for (let i = 0; i < t.ops.length; i++) {
    const op = t.ops[i] as Record<string, unknown> | null;
    if (op === null || typeof op !== "object") return `trace.ops[${i}] must be an object`;
    switch (op.op) {
      case "cage": {
        if (!Array.isArray(op.points) || !Array.isArray(op.faces)) {
          return `trace.ops[${i}] cage needs points[] and faces[]`;
        }
        const n = op.points.length;
        for (const f of op.faces as unknown[]) {
          if (!Array.isArray(f) || f.some((x) => !Number.isInteger(x) || (x as number) < 0 || (x as number) >= n)) {
            return `trace.ops[${i}] cage has a face index outside 0..${n - 1}`;
          }
        }
        for (const p of op.points as unknown[]) {
          if (!Array.isArray(p) || p.length !== 3 || p.some((c) => typeof c !== "string")) {
            return `trace.ops[${i}] cage points must each be three rational strings`;
          }
        }
        break;
      }
      case "subdivide":
        if (!Number.isInteger(op.levels) || (op.levels as number) < 0) {
          return `trace.ops[${i}] subdivide.levels must be a non-negative integer`;
        }
        break;
      case "mirror":
        if (op.axis !== 0 && op.axis !== 1 && op.axis !== 2) {
          return `trace.ops[${i}] mirror.axis must be 0, 1 or 2`;
        }
        break;
      case "move": {
        const off = op.offset;
        if (!Array.isArray(off) || off.length !== 3 || off.some((c) => typeof c !== "string")) {
          return `trace.ops[${i}] move.offset must be three rational strings`;
        }
        const bad = regionProblem(op.region, i, "move");
        if (bad) return bad;
        break;
      }
      case "crease": {
        const bad = regionProblem(op.region, i, "crease");
        if (bad) return bad;
        break;
      }
      case "extrude": {
        const bad = regionProblem(op.region, i, "extrude");
        if (bad) return bad;
        const off = op.offset;
        if (!Array.isArray(off) || off.length !== 3 || off.some((c) => typeof c !== "string")) {
          return `trace.ops[${i}] extrude.offset must be three rational strings`;
        }
        break;
      }
      case "inset": {
        const bad = regionProblem(op.region, i, "inset");
        if (bad) return bad;
        if (typeof op.factor !== "string") return `trace.ops[${i}] inset.factor must be a rational string`;
        break;
      }
      case "scale": {
        const bad = regionProblem(op.region, i, "scale");
        if (bad) return bad;
        for (const field of ["factor", "pivot"] as const) {
          const v = op[field];
          if (!Array.isArray(v) || v.length !== 3 || v.some((c) => typeof c !== "string")) {
            return `trace.ops[${i}] scale.${field} must be three rational strings`;
          }
        }
        break;
      }
      default:
        return `trace.ops[${i}] has unknown op '${String(op.op)}'`;
    }
  }
  return null;
}

/** Validate a `region` (the axis-bound conjunction `move` and `crease` share).
 *  Returns a message when malformed, null when sound. */
function regionProblem(region: unknown, i: number, op: string): string | null {
  if (region === null || typeof region !== "object" || Array.isArray(region)) {
    return `trace.ops[${i}] ${op}.region must be an object of axis bounds`;
  }
  for (const key of ["x", "y", "z"]) {
    const b = (region as Record<string, unknown>)[key];
    if (b === undefined) continue;
    if (!Array.isArray(b) || b.length !== 2 || b.some((c) => typeof c !== "string")) {
      return `trace.ops[${i}] ${op}.region.${key} must be [min, max] rational strings`;
    }
  }
  return null;
}
