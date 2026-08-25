import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * `vitest.config.ts` hand-maintains a `BLENDER_FILES` list that routes every
 * real-Blender integration file into the serial "blender" project — a
 * comment there says "keep this list in sync when adding a suite that calls
 * `compile()`", with nothing enforcing it. A file left off the list still
 * runs (in the parallel "unit" project), so the drift is silent: it shows up
 * only as flaky cross-contention failures much later, far from the PR that
 * added the file.
 *
 * This test makes that comment self-enforcing in both directions: every file
 * that actually probes Blender must be listed, and every listed file must
 * still exist.
 *
 * Detection is NOT "this file mentions the probe function" — `blender-probe`
 * unit-tests the probe itself against a fake binary (`process.execPath`
 * standing in for Blender) with no conditional skip at all, and must NOT be
 * routed into the serial project. The actual signature of a real-Blender
 * integration suite is that its tests are conditionally skipped on the live
 * probe result — see REAL_BLENDER_GATE below for the exact shape every file
 * in BLENDER_FILES uses today. That gate, not the probe call, is what this
 * test looks for — it is the one string that means "this file's tests do
 * not run at all unless a real Blender was found."
 *
 * Detection deliberately does not rely on the `assertBlenderIfRequired`
 * helper import either (see `helpers/blender-gate.ts`): that helper only
 * asserts on a boolean the file already computed and is not itself the
 * signal of Blender-ness.
 */

const TESTS_DIR = path.join(__dirname);
const CONFIG_PATH = path.join(__dirname, "..", "vitest.config.ts");

function readBlenderFilesFromConfig(): string[] {
  const src = fs.readFileSync(CONFIG_PATH, "utf8");
  const match = src.match(/const BLENDER_FILES\s*=\s*\[([\s\S]*?)\]/);
  if (!match) {
    throw new Error("could not find a BLENDER_FILES array in vitest.config.ts — did it get renamed?");
  }
  const body = match[1];
  const entries: string[] = [];
  const stringPattern = /["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = stringPattern.exec(body)) !== null) {
    entries.push(m[1]);
  }
  return entries;
}

const REAL_BLENDER_GATE = /\.skipIf\(\s*!\s*hasBlender\s*\)/;

function isRealBlenderSuite(source: string): boolean {
  return REAL_BLENDER_GATE.test(source);
}

describe("vitest.config.ts BLENDER_FILES stays in sync", () => {
  const blenderFiles = readBlenderFilesFromConfig();

  it("lists every test file gated on a real Blender probe", () => {
    const testFiles = fs
      .readdirSync(TESTS_DIR)
      .filter((name) => name.endsWith(".test.ts"))
      .sort();

    const shouldBeListed: string[] = [];
    for (const name of testFiles) {
      const source = fs.readFileSync(path.join(TESTS_DIR, name), "utf8");
      if (isRealBlenderSuite(source)) {
        shouldBeListed.push(`tests/${name}`);
      }
    }

    const listed = new Set(blenderFiles);
    const missing = shouldBeListed.filter((f) => !listed.has(f));

    expect(
      missing,
      `these test files gate on a real Blender probe (see REAL_BLENDER_GATE) but are missing from BLENDER_FILES in vitest.config.ts: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("never lists a file that no longer exists", () => {
    const dangling = blenderFiles.filter((rel) => !fs.existsSync(path.join(__dirname, "..", rel)));

    expect(
      dangling,
      `BLENDER_FILES in vitest.config.ts lists files that don't exist on disk: ${dangling.join(", ")}`,
    ).toEqual([]);
  });

  it("never lists a file that is no longer gated on a real Blender probe", () => {
    // The inverse check: a stale entry left behind after a file dropped its
    // skipIf gate would silently over-serialize an unrelated suite. Cheap to
    // catch here too.
    const stale = blenderFiles.filter((rel) => {
      const abs = path.join(__dirname, "..", rel);
      if (!fs.existsSync(abs)) return false; // reported by the dangling check above
      const source = fs.readFileSync(abs, "utf8");
      return !isRealBlenderSuite(source);
    });

    expect(
      stale,
      `BLENDER_FILES in vitest.config.ts lists files that no longer gate on a real Blender probe: ${stale.join(", ")}`,
    ).toEqual([]);
  });
});
