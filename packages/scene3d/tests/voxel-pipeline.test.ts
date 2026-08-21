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

  it("lowers the golem to a valid, standing Java block model", async () => {
    const dir = workDir("minecraft/golem");
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint", "export"],
      timeoutMs: LONG,
      noCache: true,
    });
    // The deliverable was emitted and registered.
    const modelRel = result.exportedAssets.find((a) => a.endsWith("minecraft/model.json"));
    expect(modelRel).toBeTruthy();
    const model = JSON.parse(fs.readFileSync(path.join(dir, modelRel!), "utf8"));

    // Every box became an element, every face textured, from ≤ to everywhere.
    expect(model.elements).toHaveLength(4);
    for (const el of model.elements) {
      expect(Object.keys(el.faces).sort()).toEqual(["down", "east", "north", "south", "up", "west"]);
      for (let i = 0; i < 3; i++) expect(el.from[i]).toBeLessThanOrEqual(el.to[i]);
    }
    // It stands: some element reaches the ground (MC y 0) and another sits at
    // the top — the Z-up scene lowered to a Y-up model, not lying on its side.
    const ys = model.elements.flatMap((e: { from: number[]; to: number[] }) => [e.from[1], e.to[1]]);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBeGreaterThan(16);

    // The textures were written next to the model, one PNG per material.
    const texDir = path.join(dir, "out", "minecraft", "textures");
    const pngs = fs.readdirSync(texDir).filter((f) => f.endsWith(".png"));
    expect(pngs.sort()).toEqual(["mtl_body.png", "mtl_face.png"]);
    // No voxel warnings on the clean showcase, and the compile succeeded.
    expect(result.issues.filter((i) => /S3D-W-97\d/.test(i.code))).toEqual([]);
    expect(result.ok).toBe(true);
  }, 400_000);

  it("lowers the golem to a Bedrock geometry.json under the bedrock dialect", async () => {
    const dir = workDir("minecraft/golem");
    // Same scene, Bedrock dialect: it must emit geometry.json (not model.json).
    fs.writeFileSync(
      path.join(dir, "scene3d.json"),
      JSON.stringify({ schemaVersion: 1, target: "minecraft", conventions: { minecraft: { dialect: "bedrock" } } }),
      "utf8",
    );
    const result = await compile({ projectDir: dir, stages: ["parse", "build", "lint", "export"], timeoutMs: LONG, noCache: true });
    expect(result.ok).toBe(true);
    const geoRel = result.exportedAssets.find((a) => a.endsWith("minecraft/geometry.json"));
    expect(geoRel).toBeTruthy();
    expect(result.exportedAssets.some((a) => a.endsWith("minecraft/model.json"))).toBe(false);
    const geo = JSON.parse(fs.readFileSync(path.join(dir, geoRel!), "utf8"));
    expect(geo.format_version).toBe("1.16.0");
    const g = geo["minecraft:geometry"][0];
    // Four cubes in one root bone; the two materials pack into a 16×32 atlas.
    expect(g.bones[0].cubes).toHaveLength(4);
    expect(g.description.texture_height).toBe(32);
    // The atlas texture was written, and the model stands (a cube reaches y 0).
    expect(result.exportedAssets.some((a) => a.endsWith("minecraft/textures/texture.png"))).toBe(true);
    const ys = g.bones[0].cubes.flatMap((c: { origin: number[]; size: number[] }) => [c.origin[1], c.origin[1] + c.size[1]]);
    expect(Math.min(...ys)).toBe(0);
  }, 400_000);

  it("round-trips a model through import: export → import → export reproduces the geometry", async () => {
    // The strongest exporter regression: lower the golem to model.json, then
    // point a fresh compile at THAT model (mc_model source → scene.json spec →
    // build → re-export). If the import and export coordinate maps are exact
    // inverses, the re-emitted elements match the originals byte-for-byte.
    const srcDir = workDir("minecraft/golem");
    const a = await compile({ projectDir: srcDir, stages: ["parse", "build", "lint", "export"], timeoutMs: LONG, noCache: true });
    const A = JSON.parse(fs.readFileSync(path.join(srcDir, a.exportedAssets.find((x) => x.endsWith("minecraft/model.json"))!), "utf8"));

    const dst = path.join(__dirname, ".work", `vox-roundtrip-${++seq}`);
    rmForSetup(dst);
    fs.mkdirSync(path.join(dst, "textures"), { recursive: true });
    fs.copyFileSync(path.join(srcDir, "out/minecraft/model.json"), path.join(dst, "model.json"));
    for (const f of fs.readdirSync(path.join(srcDir, "out/minecraft/textures"))) {
      fs.copyFileSync(path.join(srcDir, "out/minecraft/textures", f), path.join(dst, "textures", f));
    }

    const b = await compile({ projectDir: dst, stages: ["parse", "build", "lint", "export"], timeoutMs: LONG, noCache: true });
    // The import was recognised (a minecraft model implies the target) and it
    // built, linted clean, and re-exported.
    expect(b.issues.some((i) => i.code === "S3D-I-502")).toBe(true);
    expect(b.stages.find((s) => s.id === "build")!.status).toBe("ran");
    expect(b.issues.filter((i) => /S3D-W-97\d/.test(i.code))).toEqual([]);
    expect(fs.existsSync(path.join(dst, ".scene3d", "imported.scene.json"))).toBe(true);

    const B = JSON.parse(fs.readFileSync(path.join(dst, "out/minecraft/model.json"), "utf8"));
    const boxes = (m: { elements: Array<{ from: number[]; to: number[] }> }) =>
      m.elements.map((e) => JSON.stringify([e.from, e.to])).sort();
    expect(boxes(B)).toEqual(boxes(A));
  }, 400_000);

  it("does not flag flush-stacked cubes as z-fighting, but does flag coplanar plates", async () => {
    // Blocky modelling stacks cubes flush constantly; the touching faces point
    // OPPOSITE ways and do not flicker under backface culling (every target,
    // Minecraft included), so E-324 must stay silent. Two coplanar SAME-facing
    // plates genuinely z-fight and must still fire — the check is direction-
    // aware, not merely coplanar. (Root fix in runner.py coplanar_overlap.)
    type Box = { id: string; size: number[]; center: number[] };
    const zfires = async (name: string, boxes: Box[]): Promise<boolean> => {
      const dir = path.join(__dirname, ".work", `zf-${name}-${++seq}`);
      rmForSetup(dir);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "scene3d.json"), JSON.stringify({ schemaVersion: 1, target: "minecraft" }), "utf8");
      fs.writeFileSync(
        path.join(dir, "scene.json"),
        JSON.stringify({
          schemaVersion: 1,
          name,
          materials: { mtl_x: { baseColor: [0.6, 0.5, 0.4], roughness: 0.9 } },
          parts: boxes.map((b) => ({ id: b.id, size: b.size, shape: "box", material: "mtl_x" })),
          relations: boxes.map((b) => ({ type: "at", part: b.id, center: b.center })),
        }),
        "utf8",
      );
      const res = await compile({ projectDir: dir, stages: ["parse", "build", "lint"], timeoutMs: LONG, noCache: true });
      return res.issues.some((i) => i.code === "S3D-E-324");
    };

    // Flush stack: prp_lo top (z=0.5, +z) meets prp_hi bottom (z=0.5, −z) — silent.
    expect(
      await zfires("stack", [
        { id: "prp_lo", size: [0.5, 0.5, 0.5], center: [0, 0, 0.25] },
        { id: "prp_hi", size: [0.5, 0.5, 0.5], center: [0, 0, 0.75] },
      ]),
    ).toBe(false);

    // Two thin plates sharing the z=0.05 plane, both top faces +z: a real fight.
    expect(
      await zfires("plate", [
        { id: "prp_p1", size: [0.5, 0.5, 0.1], center: [0, 0, 0.05] },
        { id: "prp_p2", size: [0.5, 0.5, 0.1], center: [0.1, 0, 0.05] },
      ]),
    ).toBe(true);
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
