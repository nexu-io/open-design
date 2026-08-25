import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { authorStageModel } from "../src/usd/stage-model.js";
import { ISSUE_CODES } from "../src/errors.js";
import { rmForSetup } from "./helpers/fs.js";
import { assertBlenderIfRequired } from "./helpers/blender-gate.js";

/**
 * The release audit's three findings, pinned so they stay fixed:
 *  1. stage-model's declaration scans must never rewrite STRING content
 *     that merely resembles metadata,
 *  2. a usda-source project that requests usdz gets one (packaged from
 *     the source stage, source untouched),
 *  3. the export cache carries the parity record — a cached recompile
 *     re-adjudicates, and a record-less cache reports UNCHECKED rather
 *     than passing silently.
 */

describe("stage-model string safety (audit repro)", () => {
  it("never rewrites doc-string content resembling kind/purpose declarations", () => {
    const src = `#usda 1.0
(
    defaultPrim = "root"
)

def Xform "root" (
    doc = """example metadata:
kind = "should_not_become_metadata"
token purpose = "render"
"""
)
{
    def Mesh "prp_body"
    {
        int[] faceVertexCounts = [3]
    }
    def Xform "cam_rig"
    {
        def Camera "cam_hero"
        {
        }
    }
}
`;
    const result = authorStageModel({ usda: src, assetName: "probe" });
    // The string content survives byte-for-byte…
    expect(result.usda).toContain('kind = "should_not_become_metadata"');
    expect(result.usda).toContain('token purpose = "render"');
    // …while REAL metadata was still authored alongside it.
    expect(result.usda).toMatch(/kind = "component"/);
    expect(result.authored.guides).toContain("cam_rig");
  });
});

const hasBlender = (await probeBlender({})) !== null;
assertBlenderIfRequired(hasBlender);

describe.skipIf(!hasBlender)("master parity + usdz across source kinds and caches", () => {
  const LONG = 300_000;
  let workSeq = 0;
  const freshDir = (label: string) => {
    const dir = path.join(__dirname, ".work", `${label}-mp-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };

  it("packages usdz for a usda-source project without touching the source", async () => {
    const dir = freshDir("usda-usdz");
    const stage = `#usda 1.0
(
    defaultPrim = "root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "root" (
    kind = "component"
)
{
    def Mesh "prp_slab"
    {
        int[] faceVertexCounts = [4]
        int[] faceVertexIndices = [0, 1, 2, 3]
        point3f[] points = [(-1, 0, -1), (1, 0, -1), (1, 0, 1), (-1, 0, 1)]
    }
}
`;
    fs.writeFileSync(path.join(dir, "scene.usda"), stage, "utf8");
    fs.writeFileSync(
      path.join(dir, "scene3d.json"),
      JSON.stringify({
        schemaVersion: 1,
        conventions: { naming: { objectPattern: "^.+$", forbidDefaultNames: false } },
        export: { formats: ["usdz", "glb"] },
      }),
      "utf8",
    );
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "export", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.exportedAssets.some((a) => a.endsWith(".usdz"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "out", "scene.usdz"))).toBe(true);
    // The source stage is the master and is never modified.
    expect(fs.readFileSync(path.join(dir, "scene.usda"), "utf8")).toBe(stage);
  }, 400_000);

  it("re-adjudicates parity from the export cache, and reports UNCHECKED without a record", async () => {
    const dir = path.join(__dirname, ".work", "parity-cache");
    rmForSetup(dir);
    fs.cpSync(path.join(__dirname, "fixtures", "good", "prop_crate"), dir, { recursive: true });
    const stages = ["parse", "build", "export", "lint"] as const;
    // Stage-status and issue-code assertions only — no render is consumed.
    const first = await compile({
      projectDir: dir,
      stages: [...stages],
      proof: { turntable: false },
      timeoutMs: LONG,
    });
    expect(first.issues.filter((i) => i.code === ISSUE_CODES.MASTER_UNCHECKED)).toEqual([]);

    const second = await compile({
      projectDir: dir,
      stages: [...stages],
      proof: { turntable: false },
      timeoutMs: LONG,
    });
    expect(second.stages.find((s) => s.id === "export")!.status).toBe("cached");
    // The cached run carries the parity record: no phantom UNCHECKED, and
    // the same clean verdict as the fresh run.
    expect(second.issues.filter((i) => i.code === ISSUE_CODES.MASTER_UNCHECKED)).toEqual([]);
    expect(second.issues.filter((i) => i.code === ISSUE_CODES.MASTER_INCOMPLETE)).toEqual([]);

    // A pre-parity cache entry (data without a lowering record) must read
    // as UNCHECKED — never as silently fine.
    const cacheDir = path.join(dir, ".scene3d", "cache");
    for (const entry of fs.readdirSync(cacheDir)) {
      if (!entry.startsWith("export.")) continue;
      const file = path.join(cacheDir, entry);
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      parsed.data = null;
      fs.writeFileSync(file, JSON.stringify(parsed), "utf8");
    }
    const third = await compile({
      projectDir: dir,
      stages: [...stages],
      proof: { turntable: false },
      timeoutMs: LONG,
    });
    expect(third.stages.find((s) => s.id === "export")!.status).toBe("cached");
    expect(third.issues.some((i) => i.code === ISSUE_CODES.MASTER_UNCHECKED)).toBe(true);
  }, 500_000);
});
