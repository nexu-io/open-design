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

/**
 * The wider net behind the exact gate: a file that both PROBES a live
 * Blender and conditionally skips is almost certainly a real-Blender suite
 * whatever it named its boolean. The exact-gate check keeps precision (the
 * probe's own unit test must NOT match); this net turns an unrecognised
 * spelling from invisible drift into a loud demand to either use the
 * canonical gate or extend it here.
 */
function looksBlenderGatedSomehow(source: string): boolean {
  return /await\s+probeBlender\s*\(/.test(source) && /\.skipIf\s*\(/.test(source);
}

/** Every `*.test.ts` under tests/, recursively — a suite moved into a
 *  subdirectory must not fall out of this guard's sight. Fixture and
 *  scratch dirs are excluded by name, not by depth. `helpers` is NOT
 *  excluded: a test file placed there would dodge this guard while also
 *  never running (the config includes only `tests/*.test.ts`) — exactly
 *  the silence the nested-file check below exists to refuse. */
function walkTestFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "fixtures" || entry.name === ".work") continue;
      out.push(...walkTestFiles(path.join(dir, entry.name), `${prefix}${entry.name}/`));
    } else if (entry.name.endsWith(".test.ts")) {
      out.push(`${prefix}${entry.name}`);
    }
  }
  return out.sort();
}

describe("vitest.config.ts BLENDER_FILES stays in sync", () => {
  const blenderFiles = readBlenderFilesFromConfig();

  it("lists every test file gated on a real Blender probe", () => {
    const testFiles = walkTestFiles(TESTS_DIR);

    const shouldBeListed: string[] = [];
    const unrecognised: string[] = [];
    for (const name of testFiles) {
      // This guard's own source spells the canonical gate inside an error
      // message, which is a mention, not a use — it must not match itself.
      if (name === "vitest-blender-files.test.ts") continue;
      const source = fs.readFileSync(path.join(TESTS_DIR, name), "utf8");
      if (isRealBlenderSuite(source)) {
        shouldBeListed.push(`tests/${name}`);
      } else if (looksBlenderGatedSomehow(source)) {
        unrecognised.push(`tests/${name}`);
      }
    }

    expect(
      unrecognised,
      `these test files probe Blender and conditionally skip, but not with the canonical gate this guard recognises — use \`describe.skipIf(!hasBlender)\` or extend REAL_BLENDER_GATE: ${unrecognised.join(", ")}`,
    ).toEqual([]);

    const listed = new Set(blenderFiles);
    const missing = shouldBeListed.filter((f) => !listed.has(f));

    expect(
      missing,
      `these test files gate on a real Blender probe (see REAL_BLENDER_GATE) but are missing from BLENDER_FILES in vitest.config.ts: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps Blender-listed files pure: every top-level describe gated, the CI hatch armed", () => {
    // Membership in BLENDER_FILES routes the WHOLE file into the serial
    // Blender project, which CI never runs. An ungated describe in such a
    // file is therefore pure-TS coverage silently dropped from CI — real
    // case: kit-viewer.test.ts carried ~40 synthetic-container assertions
    // into the Blender lane before the split. Gate every top-level
    // describe or move it to a unit-project file.
    //
    // The gate alone is also not enough on an environment that PROMISED
    // the runtime: every listed file must arm assertBlenderIfRequired so
    // SCENE3D_REQUIRE_BLENDER turns a missing install into a failure
    // instead of a green skip.
    //
    // pxr-gated suites (it.skipIf(!pxrAvailable)) are deliberately outside
    // this guard's scope: the oracle subprocess is short-lived, needs no
    // serialization, and belongs in the unit project with its own
    // SCENE3D_REQUIRE_PXR hatch (see usd-oracle.test.ts).
    const offenders: string[] = [];
    const unarmed: string[] = [];
    for (const rel of blenderFiles) {
      const abs = path.join(__dirname, "..", rel);
      if (!fs.existsSync(abs)) continue; // the dangling-entry test owns that failure
      const source = fs.readFileSync(abs, "utf8");
      for (const line of source.split(/\r?\n/)) {
        if (/^describe/.test(line) && !/^describe\.skipIf\(/.test(line)) {
          offenders.push(`${rel}: ${line.slice(0, 60)}`);
        }
      }
      if (!source.includes("assertBlenderIfRequired(")) unarmed.push(rel);
    }
    expect(
      offenders,
      `these top-level describes in BLENDER_FILES members are not Blender-gated — pure-TS coverage CI will silently never run; gate them or move them to a unit-project file: ${offenders.join("; ")}`,
    ).toEqual([]);
    expect(
      unarmed,
      `these BLENDER_FILES members never call assertBlenderIfRequired, so SCENE3D_REQUIRE_BLENDER cannot turn a missing runtime into a failure there: ${unarmed.join(", ")}`,
    ).toEqual([]);
  });

  it("refuses nested test files — both project includes are flat, so they would silently never run", () => {
    // vitest.config.ts includes `tests/*.test.ts` (unit) and the flat
    // BLENDER_FILES list. A `*.test.ts` in any subdirectory (helpers/
    // included) matches neither: it is dead weight that LOOKS like
    // coverage. Move it to tests/ top level, or rename it off the
    // test-file pattern if it is a helper.
    const nested = walkTestFiles(TESTS_DIR).filter((name) => name.includes("/"));
    expect(
      nested,
      `these test files sit in subdirectories where neither vitest project includes them — they never run: ${nested.join(", ")}`,
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
