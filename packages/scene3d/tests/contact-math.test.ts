import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { rmForSetup } from "./helpers/fs.js";
import { assertBlenderIfRequired } from "./helpers/blender-gate.js";

/**
 * The contact narrow phase against REAL Blender, pinned with the field
 * audit's own arithmetic (its D5): `separation` used to be the best of four
 * DIRECTIONAL support gaps — a lower bound of the true distance, equal only
 * along the optimal direction — so a cube on a cylinder's 45° diagonal read
 * ~23mm closer than geometry allows (the number implied a nearest point
 * outside the mesh). The alternating-BVH narrow phase now reports the
 * measured nearest surface distance, certified by a support-plane witness.
 *
 * Analytic ground truth for the diagonal case: the cylinder is a 72-gon
 * (a vertex every 5°, so 45° is exactly a vertex, at radius 0.5), the
 * cube's nearest corner is at (X−0.05, X−0.05), the z ranges overlap, so
 * distance = hypot(X−0.05, X−0.05) − 0.5.
 */
const hasBlender = (await probeBlender({})) !== null;
assertBlenderIfRequired(hasBlender);

describe.skipIf(!hasBlender)("contact separation is a real distance (real Blender)", () => {
  const LONG = 300_000;
  let seq = 0;

  async function contactsFor(cubeCentre: [number, number, number]) {
    const dir = path.join(__dirname, ".work", `contact-math-${++seq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        materials: { mtl_m: { baseColor: [0.5, 0.5, 0.5], roughness: 0.6 } },
        parts: [
          { id: "prp_cyl", shape: "cylinder", size: [1.0, 1.0, 0.4], material: "mtl_m" },
          { id: "prp_cube", size: [0.1, 0.1, 0.1], material: "mtl_m" },
        ],
        relations: [
          { type: "at", part: "prp_cyl", center: [0, 0, 0.2] },
          { type: "at", part: "prp_cube", center: cubeCentre },
        ],
      }),
    );
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build"],
      timeoutMs: LONG,
      noCache: true,
    });
    return result.census?.contacts ?? [];
  }

  it("measures the true diagonal gap, not a directional under-report", async () => {
    const contacts = await contactsFor([0.48, 0.48, 0.05]);
    const pair = contacts.find(
      (c) => [c.a, c.b].includes("prp_cyl") && [c.a, c.b].includes("prp_cube"),
    );
    expect(pair).toBeDefined();
    // My arithmetic: hypot(0.43, 0.43) − 0.5 = 0.108112. The audit measured
    // the old code reporting 0.083989 here — 24mm short.
    expect(pair!.separation).toBeCloseTo(Math.hypot(0.43, 0.43) - 0.5, 4);
    expect(pair!.intersects).toBe(false);
  }, LONG);

  it("keeps the axis-aligned cases exact (the audit's control rows)", async () => {
    const clear = await contactsFor([0.56, 0, 0.05]);
    const clearPair = clear.find((c) => [c.a, c.b].includes("prp_cube"));
    expect(clearPair).toBeDefined();
    expect(clearPair!.separation).toBeCloseTo(0.01, 4);
    expect(clearPair!.intersects).toBe(false);

    const buried = await contactsFor([0.53, 0, 0.05]);
    const buriedPair = buried.find((c) => [c.a, c.b].includes("prp_cube"));
    expect(buriedPair).toBeDefined();
    expect(buriedPair!.separation).toBeCloseTo(-0.02, 4);
    expect(buriedPair!.intersects).toBe(true);
  }, LONG);

  it("states the recording range in the census instead of leaving it implicit", async () => {
    const dir = path.join(__dirname, ".work", `contact-math-${++seq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        materials: { mtl_m: { baseColor: [0.5, 0.5, 0.5], roughness: 0.6 } },
        parts: [{ id: "prp_a", size: [0.2, 0.2, 0.2], material: "mtl_m" }],
        relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.1] }],
      }),
    );
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.census?.contactRange).toBeCloseTo(0.05, 9);
  }, LONG);

  it("measures contacts in a scene far past the old sixty-mesh refusal", async () => {
    /*
     * The scan used to return NOTHING above 60 meshes — grounding,
     * touching-faces, z-fighting and every claim resting on them, deleted
     * wholesale, because pairwise enumeration got expensive. Contact is a
     * LOCAL relation, so the broad phase sweeps and prunes and the fact class
     * survives at any part count.
     *
     * The assertion is the count, not merely "no error": a scan that silently
     * returned an empty list would also raise nothing, and an empty contact
     * list is precisely the shape of the bug being pinned against.
     */
    const dir = path.join(__dirname, ".work", `contact-many-${++seq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    const parts: unknown[] = [{ id: "prp_floor", size: [8, 4, 0.1], material: "mtl_m" }];
    const relations: unknown[] = [
      { type: "at", part: "prp_floor", center: [0, 0, 0.05] },
    ];
    let n = 0;
    for (let gx = 0; gx < 5; gx++) {
      for (let gy = 0; gy < 19; gy++) {
        n += 1;
        const id = `prp_b${String(n).padStart(3, "0")}`;
        parts.push({ id, size: [0.2, 0.15, 0.2], material: "mtl_m" });
        relations.push({
          type: "at",
          part: id,
          center: [-3 + gx * 0.35, -1.6 + gy * 0.18, 0.2],
        });
      }
    }
    expect(parts.length).toBeGreaterThan(60);
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        materials: { mtl_m: { baseColor: [0.5, 0.5, 0.5], roughness: 0.6 } },
        parts,
        relations,
      }),
    );
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build"],
      timeoutMs: LONG,
      noCache: true,
    });
    // Every block rests on the floor, so there is at least one contact per
    // block; the scan must find them rather than excusing itself.
    expect((result.census?.contacts ?? []).length).toBeGreaterThanOrEqual(n);
    expect(result.census?.contactsSkipped ?? []).toEqual([]);
  }, LONG);
});
