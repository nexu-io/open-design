import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { rmForSetup } from "./helpers/fs.js";

/**
 * The voxel/Minecraft layer against REAL Blender.
 *
 * voxel-lint.test.ts proves the judgment on synthetic facts; this proves the
 * whole chain — a `minecraft` contract turns on the census `voxel` facts,
 * Blender measures boxness/grid deviation on real geometry, and the rules read
 * them. The golem is the calibration control: a blocky biped, every box
 * pixel-aligned, compiling with zero voxel issues. A target whose own showcase
 * trips its own linter is broken.
 */
const hasBlender = (await probeBlender({})) !== null;

describe.skipIf(!hasBlender)("voxel pipeline (real Blender)", () => {
  const fixture = (name: string) => path.join(__dirname, "fixtures", name);
  let seq = 0;
  const workDir = (name: string) => {
    const dir = path.join(__dirname, ".work", `${name.replace(/[\\/]/g, "_")}-vox-${++seq}`);
    rmForSetup(dir);
    fs.cpSync(fixture(name), dir, { recursive: true });
    return dir;
  };
  const LONG = 300_000;

  it("compiles the grid-aligned golem with zero voxel issues, facts measured", async () => {
    const result = await compile({
      projectDir: workDir("minecraft/golem"),
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    // No voxel code fires on a clean blocky model — the opt-in never false-positives.
    expect(result.issues.filter((i) => /S3D-W-97\d/.test(i.code))).toEqual([]);
    // The facts were actually measured (only because target is minecraft):
    // every part is a single cuboid, on the grid.
    for (const m of result.census!.meshes) {
      expect(m.voxel, `${m.object} carries voxel facts`).toBeTruthy();
      expect(m.voxel!.isBox, `${m.object} is a cuboid`).toBe(true);
      expect(m.voxel!.gridDeviation).toBeLessThan(0.002);
    }
  }, 400_000);

  it("does NOT measure voxel facts without the minecraft target", async () => {
    // The same geometry under a neutral contract carries no voxel block — the
    // census is byte-identical to what every non-Minecraft scene has always got.
    const dir = workDir("minecraft/golem");
    fs.writeFileSync(path.join(dir, "scene3d.json"), JSON.stringify({ schemaVersion: 1 }), "utf8");
    const result = await compile({ projectDir: dir, stages: ["parse", "build", "lint"], timeoutMs: LONG, noCache: true });
    expect(result.issues.filter((i) => /S3D-W-97\d/.test(i.code))).toEqual([]);
    expect(result.census!.meshes.every((m) => m.voxel === undefined)).toBe(true);
  }, 400_000);

  it("fires the voxel rules on real broken geometry (sphere, off-grid, oversized)", async () => {
    const dir = path.join(__dirname, ".work", `vox-bad-${++seq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "scene3d.json"), JSON.stringify({ schemaVersion: 1, target: "minecraft" }), "utf8");
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        name: "mc-bad",
        materials: { mtl_a: { baseColor: [0.6, 0.4, 0.3], roughness: 0.9 } },
        parts: [
          { id: "prp_orb", size: [0.5, 0.5, 0.5], shape: "sphere", material: "mtl_a" },
          { id: "prp_nub", size: [0.1, 0.1, 0.1], shape: "box", material: "mtl_a" },
          { id: "prp_beam", size: [5, 1, 1], shape: "box", material: "mtl_a" },
        ],
        relations: [
          { type: "at", part: "prp_orb", center: [0, 1, 0] },
          { type: "at", part: "prp_nub", center: [1, 0.05, 0] },
          { type: "at", part: "prp_beam", center: [0, 2.5, 0] },
        ],
      }),
      "utf8",
    );
    const result = await compile({ projectDir: dir, stages: ["parse", "build", "lint"], timeoutMs: LONG, noCache: true });
    const byCode = (code: string) => result.issues.filter((i) => i.code === code).map((i) => i.target);
    expect(byCode("S3D-W-971")).toContain("prp_orb"); // a sphere is not a cuboid
    expect(byCode("S3D-W-970")).toContain("prp_nub"); // 0.1m box is off the 1/16 grid
    expect(byCode("S3D-W-973")).toContain("prp_beam"); // 5m beam overruns the element space
    // Advisory only — the linter never blocks a compile on voxel format facts.
    expect(result.issues.filter((i) => /S3D-W-97\d/.test(i.code)).every((i) => i.severity === "warning")).toBe(true);
  }, 400_000);
});
