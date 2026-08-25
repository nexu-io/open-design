import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { validateUsd } from "../src/lint/usd-oracle.js";
import { ISSUE_CODES } from "../src/errors.js";
import { assertPxrIfRequired } from "./helpers/blender-gate.js";

/**
 * The USD oracle runs OpenUSD's own runtime (pxr) in a subprocess. It is host-
 * optional: where pxr is installed these assert the real verdict, otherwise
 * the oracle reports "unchecked" and the binding assertions are skipped.
 */
function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "scene3d-usd-"));
}

const GOOD = `#usda 1.0
(
    defaultPrim = "root"
)
def Xform "root" {
    def Material "mat" {}
    def Mesh "m" {
        rel material:binding = </root/mat>
    }
}
`;

const DANGLING = `#usda 1.0
(
    defaultPrim = "root"
)
def Xform "root" {
    def Mesh "m" {
        rel material:binding = </root/missing>
    }
}
`;

// Probe once: is pxr present on this host's python?
const probeDir = tmp();
fs.writeFileSync(path.join(probeDir, "probe.usda"), GOOD);
const probe = await validateUsd(probeDir, "probe.usda");
const pxrAvailable = !probe.some((i) => i.code === ISSUE_CODES.USD_UNCHECKED);
assertPxrIfRequired(pxrAvailable);
fs.rmSync(probeDir, { recursive: true, force: true });

describe("validateUsd", () => {
  it("does not throw, and returns an array, regardless of host", async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "s.usda"), GOOD);
    const issues = await validateUsd(dir, "s.usda");
    expect(Array.isArray(issues)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.skipIf(!pxrAvailable)("stays silent on a well-formed stage", async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "good.usda"), GOOD);
    expect(await validateUsd(dir, "good.usda")).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.skipIf(!pxrAvailable)("flags a material binding that resolves to a missing prim", async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "bad.usda"), DANGLING);
    const issues = await validateUsd(dir, "bad.usda");
    expect(issues.some((i) => i.code === ISSUE_CODES.USD_BINDING_UNRESOLVED)).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
