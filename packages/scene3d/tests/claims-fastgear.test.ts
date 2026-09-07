import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile } from "../src/index.js";
import { rmForSetup } from "./helpers/fs.js";

/**
 * The D1 false pass, reproduced end-to-end WITHOUT Blender: a 1.4m square
 * plate spinning about z sweeps exactly 1.4·√2 = 1.9799m (the corner circle
 * is attained for a box), so a 1.95m footprint claim is provably violated —
 * and the fast gear must say so at parse time, where the integer-frame
 * sampler that used to award "held at 98% of its bound" never even runs.
 */
describe("claims interval calculus on the fast gear (no Blender)", () => {
  it("hard-fails the spinning plate's footprint claim from the solved boxes alone", async () => {
    const dir = path.join(__dirname, ".work", "claims-fastgear-rotor");
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        materials: { mtl_m: { baseColor: [0.5, 0.5, 0.5], roughness: 0.5 } },
        parts: [
          { id: "prp_rotor", size: [1.4, 1.4, 0.06], material: "mtl_m", spin: { axis: "z", seconds: 0.25 } },
        ],
        relations: [{ type: "at", part: "prp_rotor", center: [0, 0, 0.5] }],
        claims: { parts: 1, maxHeight: 0.76, footprint: [1.95, 1.95] },
      }),
    );
    const result = await compile({ projectDir: dir, stages: ["parse", "lint"], noCache: true });
    const failures = result.issues.filter(
      (i) => i.code === "S3D-E-701" && i.detail?.claim === "footprint",
    );
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0]!.detail?.actual).toBeCloseTo(1.4 * Math.SQRT2, 4);
    expect(failures[0]!.message).toContain("provably sweeps");
    expect(result.ok).toBe(false);
  });
});
