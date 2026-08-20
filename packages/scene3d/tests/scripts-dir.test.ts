import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveScriptsDir, runnerPath } from "../src/index.js";

/**
 * The runner script is the compile boundary — if the package cannot find it,
 * every Blender-backed stage fails with S3D-E-202 and the failure only shows
 * up at a consumer's call site. These tests pin the layout probing for both
 * shapes the package actually runs in.
 */
describe("resolveScriptsDir", () => {
  function layout(...segments: string[]): { root: string; moduleDir: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "scene3d-layout-"));
    const moduleDir = path.join(root, ...segments);
    fs.mkdirSync(moduleDir, { recursive: true });
    fs.mkdirSync(path.join(root, "scripts", "blender"), { recursive: true });
    fs.writeFileSync(path.join(root, "scripts", "blender", "runner.py"), "");
    return { root, moduleDir };
  }

  it("finds scripts/ one level up — the bundled dist/ layout", () => {
    const { root, moduleDir } = layout("dist");
    expect(resolveScriptsDir(moduleDir)).toBe(path.join(root, "dist", "..", "scripts"));
    expect(fs.existsSync(path.join(resolveScriptsDir(moduleDir), "blender", "runner.py"))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("finds scripts/ two levels up — the src/build/ layout", () => {
    const { root, moduleDir } = layout("src", "build");
    expect(fs.existsSync(path.join(resolveScriptsDir(moduleDir), "blender", "runner.py"))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("falls back to the bundled candidate when nothing matches", () => {
    const orphan = fs.mkdtempSync(path.join(os.tmpdir(), "scene3d-orphan-"));
    expect(resolveScriptsDir(orphan)).toBe(path.join(orphan, "..", "scripts"));
    fs.rmSync(orphan, { recursive: true, force: true });
  });

  it("resolves the real runner from this package", () => {
    expect(fs.existsSync(runnerPath())).toBe(true);
  });
});
