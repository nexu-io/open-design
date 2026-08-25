import { describe, expect, it } from "vitest";
import { authorStageModel } from "../src/usd/stage-model.js";

/**
 * The release audit's string-safety finding, pinned so it stays fixed:
 * stage-model's declaration scans must never rewrite STRING content that
 * merely resembles metadata. Pure TS — it lived at the top of
 * master-parity.test.ts, where the Blender routing silently kept it off CI;
 * this file puts it in the unit project where it runs everywhere.
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
