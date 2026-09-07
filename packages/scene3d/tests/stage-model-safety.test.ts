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

describe("assetInfo.name cannot break the master USDA", () => {
  const stage = `#usda 1.0
(
    defaultPrim = "prp_root"
)

def Xform "prp_root" (
    kind = "component"
)
{
}
`;

  it("escapes a name ending in a backslash so the string still closes", () => {
    // A project directory basename may legally end in a backslash on POSIX.
    // The old sanitizer stripped only the quote, leaving the escape char free:
    // `"name\"` reads `\"` as an escaped quote, not a terminator, so the string
    // never closed and the master stage was corrupt.
    const r = authorStageModel({ usda: stage, assetName: "myproject\\" });
    // The emitted name line must carry the escaped backslash and a real
    // terminating quote — count the quotes on the assetInfo name line.
    const nameLine = r.usda.split("\n").find((l) => l.includes("string name ="))!;
    expect(nameLine).toBeDefined();
    // Backslash doubled, so the closing quote is a real delimiter.
    expect(nameLine).toContain('"myproject\\\\"');
  });

  it("strips control characters that would splice a new metadata line", () => {
    const r = authorStageModel({ usda: stage, assetName: "a\nstring version = \"evil\"\nb" });
    const nameLine = r.usda.split("\n").find((l) => l.includes("string name ="))!;
    // The injected newlines are removed and its quotes escaped, so the
    // whole payload collapses INTO the name string value rather than
    // opening a second `string version =` metadata line. The assetInfo
    // block therefore still has exactly one version line (its own "1").
    const versionLines = r.usda
      .split("\n")
      .filter((l) => /^\s*string version =/.test(l));
    expect(versionLines).toHaveLength(1);
    expect(versionLines[0]).toContain('"1"');
  });
});
