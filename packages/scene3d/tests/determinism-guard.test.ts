import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * No non-bit-stable float op reaches geometry or a verdict.
 *
 * `Math.log2` / `Math.log` / `Math.sqrt` and friends are not required by the
 * ECMAScript spec to be correctly rounded, so their last ULP can differ across
 * libm builds and engine versions. In code that decides GEOMETRY or a VERDICT
 * — the exact-rational kernel, the shader accept/reject bounds, the bake
 * resolution — a last-ULP flip at a boundary ships different bytes on two
 * machines, breaking "same scene → byte-identical output on any machine".
 *
 * This has recurred: the flipbook atlas grid, the shader-validate atlas edge,
 * and the bake-resolution floor each shipped a `2 ** ceil(log2(...))` that was
 * replaced with exact integer doubling and the kernel's `ceilLog2`. The guard
 * scans the directories where determinism is HARD-required and fails on a new
 * one, so the fourth instance is caught when it is written.
 */
const ROOT = path.join(__dirname, "..", "src");

/** Directories whose output must be bit-identical across machines. */
const GUARDED = ["kernel", "shade"];

const BANNED = /\bMath\.(log2|log|sqrt|sin|cos|tan|pow|cbrt|atan2|hypot)\b/;

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...tsFiles(full));
    else if (e.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("determinism guard (static)", () => {
  it("has real files to scan, or the guard is vacuous", () => {
    const total = GUARDED.reduce((n, d) => n + tsFiles(path.join(ROOT, d)).length, 0);
    expect(total).toBeGreaterThan(5);
  });

  it("no non-bit-stable Math.* reaches the kernel or shader compiler", () => {
    const hits: string[] = [];
    for (const dir of GUARDED) {
      for (const file of tsFiles(path.join(ROOT, dir))) {
        const lines = fs.readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          // Ignore comments — a line whose first non-space is // or * is prose,
          // and the rationale comments name these functions on purpose.
          const trimmed = line.trimStart();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
          if (BANNED.test(line)) {
            hits.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim()}`);
          }
        });
      }
    }
    expect(
      hits,
      "a non-bit-stable Math.* in geometry/shader code — use the kernel's " +
        "ceilLog2 / exact integer arithmetic; last-ULP variance ships different " +
        "bytes across machines",
    ).toEqual([]);
  });
});
