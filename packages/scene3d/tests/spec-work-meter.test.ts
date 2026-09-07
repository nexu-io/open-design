import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile } from "../src/index.js";
import { ISSUE_CODES } from "../src/errors.js";
import { rmForSetup } from "./helpers/fs.js";

/**
 * The ONE work meter, applied to what the solve emits (S3D-E-107).
 *
 * The red-team exhibit: `around` with `count: 5000` sailed past every gate
 * and held a Blender process (and its scene gate) for over a quarter of an
 * hour with no output — "one deterministic work meter guards runaway" was
 * false for the spec path. The refusal must land at PARSE time, in
 * milliseconds, resource-denominated and raisable via `workBudget`.
 */
describe("spec work meter (no Blender)", () => {
  let seq = 0;
  const sceneDir = (spec: object): string => {
    const dir = path.join(__dirname, ".work", `work-meter-${++seq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "scene.json"), JSON.stringify(spec, null, 2));
    return dir;
  };
  const ring = (count: number) => ({
    schemaVersion: 1,
    parts: [
      { id: "prp_floor", size: [50, 50, 0.1] },
      { id: "prp_hub", size: [0.2, 0.2, 0.2] },
      { id: "prp_bead", size: [0.02, 0.02, 0.02] },
    ],
    relations: [
      { type: "at", part: "prp_floor", center: [0, 0, 0.05] },
      { type: "sits_on", part: "prp_hub", on: "prp_floor" },
      { type: "around", part: "prp_bead", center: "prp_hub", count, radius: 10 },
      { type: "sits_on", part: "prp_bead", on: "prp_floor" },
    ],
  });

  it("refuses a runaway ring at parse time, naming units, budget and the lever", async () => {
    const result = await compile({
      projectDir: sceneDir(ring(12)),
      stages: ["parse"],
      workBudget: 1000, // 14 parts × 400 units = 5600, past this budget
      noCache: true,
    });
    const hit = result.issues.find((i) => i.code === ISSUE_CODES.SPEC_WORK_EXCEEDED)!;
    expect(hit).toBeDefined();
    expect(hit.severity).toBe("error");
    expect(hit.message).toContain("workBudget");
    expect(hit.detail).toMatchObject({ parts: 14, budget: 1000 });
    expect(result.ok).toBe(false);
  });

  it("passes an ordinary scene under the default budget", async () => {
    const result = await compile({
      projectDir: sceneDir(ring(12)),
      stages: ["parse"],
      noCache: true,
    });
    expect(result.issues.filter((i) => i.code === ISSUE_CODES.SPEC_WORK_EXCEEDED)).toEqual([]);
  });
});
