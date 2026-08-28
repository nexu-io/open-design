import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Static consistency of the Blender runner's tuple contracts.
 *
 * `runner.py` is several thousand lines of untyped Python executed inside
 * Blender. TypeScript refuses an arity mismatch at compile time; Python only
 * raises when control actually reaches the bad path, so a function that
 * returns two values on its early-out and three on its main path ships
 * happily and crashes on the first mesh that takes the early-out. That is not
 * hypothetical — `dfm_facts` did exactly this, and the corpus could not see it
 * because no fixture had a mesh with zero polygons.
 *
 * A test suite cannot cover every path of a file this size. What it can do is
 * make the mismatch unrepresentable: these checks read the source and prove
 * the contracts agree, no matter which path a scene happens to walk.
 *
 * Deliberately conservative — a false alarm here costs more than a missed one,
 * because the fix is to weaken the check and then it stops working:
 *   - only TUPLE returns (arity 2 or more) must agree with each other, so the
 *     common `return None` sentinel beside a real payload stays legal;
 *   - only calls to functions defined in this same file are checked;
 *   - a call whose target's arity is unknown is skipped, never guessed.
 */
const RUNNER = path.join(__dirname, "..", "scripts", "blender", "runner.py");

/** Count top-level commas, ignoring anything inside brackets or quotes. */
function tupleArity(expr: string): number {
  let depth = 0;
  let quote: string | null = null;
  let commas = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]!;
    if (quote !== null) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) commas++;
  }
  // A trailing comma (`return a,`) is still a one-tuple in Python, but the
  // pattern this guards is a multi-value payload, so treat the count plainly.
  return commas + 1;
}

/** True when brackets/quotes are all closed — i.e. the statement is complete. */
function balanced(text: string): boolean {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quote !== null) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
  }
  return depth <= 0 && quote === null;
}

/** Strip a trailing `#` comment that is not inside a string. */
function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote !== null) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "#") return line.slice(0, i);
  }
  return line;
}

interface FnFacts {
  name: string;
  line: number;
  /** Distinct tuple arities (≥2) this function returns, with their lines. */
  tupleReturns: Array<{ arity: number; line: number }>;
}

function readRunner(): { fns: FnFacts[]; lines: string[] } {
  const lines = fs.readFileSync(RUNNER, "utf8").split(/\r?\n/);
  const fns: FnFacts[] = [];
  // Stack of enclosing defs by indent, so a return lands on the innermost one.
  const stack: Array<{ indent: number; fn: FnFacts }> = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = stripComment(raw);
    if (line.trim() === "") continue;
    const indent = line.length - line.trimStart().length;
    while (stack.length > 0 && indent <= stack[stack.length - 1]!.indent) stack.pop();

    const def = /^(\s*)def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(line);
    if (def) {
      const fn: FnFacts = { name: def[2]!, line: i + 1, tupleReturns: [] };
      fns.push(fn);
      stack.push({ indent, fn });
      continue;
    }

    const ret = /^\s*return\b(.*)$/.exec(line);
    if (ret && stack.length > 0) {
      let expr = ret[1]!.trim();
      // A return expression may span lines; join until brackets close.
      let j = i;
      while (!balanced(expr) && j + 1 < lines.length) {
        j++;
        expr += " " + stripComment(lines[j]!).trim();
      }
      if (expr !== "" && expr !== "None") {
        const arity = tupleArity(expr);
        if (arity >= 2) {
          stack[stack.length - 1]!.fn.tupleReturns.push({ arity, line: i + 1 });
        }
      }
    }
  }
  return { fns, lines };
}

describe("blender runner tuple contracts (static)", () => {
  const { fns, lines } = readRunner();

  it("reads a runner with functions and tuple returns, or the scan proves nothing", () => {
    // A scanner that silently matched nothing would make every check below
    // vacuously green — the failure mode these guards exist to prevent.
    expect(fns.length).toBeGreaterThan(50);
    expect(fns.filter((f) => f.tupleReturns.length > 0).length).toBeGreaterThan(5);
  });

  it("returns the same number of values on every path of a function", () => {
    /*
     * `dfm_facts` kept `return 0.0, None` on its no-faces early-out after its
     * main path grew to three values. Python raises only when a mesh actually
     * has zero polygons, so it passed a full corpus and would have crashed on
     * the first real scene that hit it.
     */
    const mismatched = fns
      .filter((f) => new Set(f.tupleReturns.map((r) => r.arity)).size > 1)
      .map(
        (f) =>
          `${f.name} (line ${f.line}) returns ` +
          f.tupleReturns.map((r) => `${r.arity} values at line ${r.line}`).join(", "),
      );
    expect(mismatched, "a function must return one shape on every path").toEqual([]);
  });

  it("unpacks exactly as many values as the function returns", () => {
    /*
     * The caller side of the same contract: `a, b, c = f(...)` against an `f`
     * that returns two. Only functions defined in this file are checked, and
     * only where their tuple arity is unambiguous.
     */
    const arityOf = new Map<string, number>();
    for (const f of fns) {
      const arities = new Set(f.tupleReturns.map((r) => r.arity));
      if (arities.size === 1) arityOf.set(f.name, [...arities][0]!);
    }
    const bad: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = stripComment(lines[i]!);
      // `x, y, z = name(` — an unpacking assignment from a direct call.
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)+)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(
        line,
      );
      if (!m) continue;
      const targets = m[1]!.split(",").length;
      const callee = m[2]!;
      const declared = arityOf.get(callee);
      if (declared === undefined) continue;
      if (declared !== targets) {
        bad.push(`line ${i + 1}: unpacks ${targets} from ${callee}(), which returns ${declared}`);
      }
    }
    expect(bad, "an unpack must match the arity its callee returns").toEqual([]);
  });
});
