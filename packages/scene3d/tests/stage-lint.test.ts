import { describe, expect, it } from "vitest";
import { lintExportedStage } from "../src/lint/stage.js";
import { normalizeContract } from "../src/contract.js";
import { Issue } from "../src/types.js";

const contract = normalizeContract({
  schemaVersion: 1,
  conventions: { units: { metersPerUnit: 1, upAxis: "Y" } },
});

function codes(usda: string, objectNames?: string[]): string[] {
  const issues: Issue[] = [];
  lintExportedStage(
    { usda, contract, ...(objectNames ? { objectNames } : {}) },
    issues,
  );
  return issues.map((i) => i.code);
}

/** A stage that satisfies every rule — the shape the compiler now authors. */
const GOOD = `#usda 1.0
(
    assetInfo = {
        string name = "crate"
        string version = "1"
    }
    defaultPrim = "root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "root" (
    kind = "component"
)
{
    def Mesh "prp_crate_body"
    {
        float3[] extent = [(-1, -1, -1), (1, 1, 1)]
    }
}
`;

describe("lintExportedStage", () => {
  it("passes a stage that carries kind, assetInfo, units and real names", () => {
    expect(codes(GOOD, ["prp_crate_body"])).toEqual([]);
  });

  it("catches the up-axis the exporter chose over the contract", () => {
    // The real defect: Blender ships Z-up regardless of what was declared,
    // and the units rule never fired for bpy scenes because it read the
    // authored source, which a build.py project does not have.
    expect(codes(GOOD.replace('upAxis = "Y"', 'upAxis = "Z"'))).toContain("S3D-E-402");
  });

  it("catches a metersPerUnit the contract did not ask for", () => {
    expect(codes(GOOD.replace("metersPerUnit = 1", "metersPerUnit = 0.01"))).toContain("S3D-E-403");
  });

  it("catches a stage with no model hierarchy", () => {
    expect(codes(GOOD.replace('kind = "component"', ""))).toContain("S3D-E-401");
  });

  it("catches a missing defaultPrim", () => {
    expect(codes(GOOD.replace('defaultPrim = "root"', ""))).toContain("S3D-E-405");
  });

  it("warns when the stage has no asset identity", () => {
    const stripped = GOOD.replace(/assetInfo = \{[\s\S]*?\}\n/, "");
    expect(codes(stripped)).toContain("S3D-W-401");
  });

  it("catches an exporter default name that survived into the USD", () => {
    // The exact bug found in a real export: the object was named
    // `prp_crate_slat_back_b`, the shipped Mesh prim was `Cube_008`, and
    // every object-level rule reported clean.
    const shipped = GOOD.replace('def Mesh "prp_crate_body"', 'def Mesh "Cube_008"');
    expect(codes(shipped, ["prp_crate_body"])).toContain("S3D-E-404");
  });

  it("treats Cube, Cube.001 and Cube_008 alike", () => {
    for (const name of ["Cube", "Cube.001", "Cube_008", "Icosphere", "Suzanne"]) {
      const shipped = GOOD.replace('def Mesh "prp_crate_body"', `def Mesh "${name}"`);
      expect(codes(shipped)).toContain("S3D-E-404");
    }
  });

  it("also catches Armature/Lattice/Speaker exporter defaults (ST-2)", () => {
    for (const [type, name] of [["Skeleton", "Armature"], ["Mesh", "Lattice"], ["Mesh", "Speaker"]]) {
      const shipped = GOOD.replace('def Mesh "prp_crate_body"', `def ${type} "${name}"`);
      expect(codes(shipped)).toContain("S3D-E-404");
    }
  });

  it("does not let a decoy inside a doc string satisfy or defeat a check (ST-1)", () => {
    // The real upAxis is Y and agrees with the contract. A `doc` string that
    // merely CONTAINS `upAxis = "Z"` must not be read as an authored value and
    // trip the mismatch. The parser masks string content; raw-text regex did
    // not.
    const withDecoy = GOOD.replace(
      'def Xform "root" (',
      'def Xform "root" (\n    doc = "note: upAxis = \\"Z\\" and kind = \\"assembly\\" per legacy"',
    );
    expect(codes(withDecoy, ["prp_crate_body"])).not.toContain("S3D-E-402");
  });

  it("does not read a defaultPrim out of a doc-string decoy (ST-1)", () => {
    // Strip the real defaultPrim but leave a decoy in a doc string. The check
    // must still fire (no REAL defaultPrim), proving it did not read the decoy.
    const stripped = GOOD.replace('    defaultPrim = "root"\n', "").replace(
      'def Xform "root" (',
      'def Xform "root" (\n    doc = "was defaultPrim = \\"root\\" once"',
    );
    // No real defaultPrim -> the root won't resolve, but the missing-defaultPrim
    // rule must fire rather than be silenced by the decoy.
    expect(codes(stripped, ["prp_crate_body"])).toContain("S3D-E-405");
  });

  it("forgives float32 unit drift in the exported stage (PR-3)", () => {
    // The USD importer round-trips metersPerUnit through float32, so a `1`
    // contract can meet `0.999999...`. That is not a units mismatch.
    const drifted = GOOD.replace("metersPerUnit = 1", "metersPerUnit = 0.9999999776482582");
    expect(codes(drifted, ["prp_crate_body"])).not.toContain("S3D-E-403");
  });

  it("warns when a mesh prim matches no object name", () => {
    const shipped = GOOD.replace('def Mesh "prp_crate_body"', 'def Mesh "prp_something_else"');
    expect(codes(shipped, ["prp_crate_body"])).toContain("S3D-W-403");
  });

  it("warns when boundables ship without an extent", () => {
    const shipped = GOOD.replace(/\s*float3\[\] extent = .*\n/, "\n");
    expect(codes(shipped, ["prp_crate_body"])).toContain("S3D-W-402");
  });

  /**
   * Stage metadata is the deliverable's own claim about how big it is and
   * which way is up. Nothing in the pipeline writes it: runner.py never
   * touches Blender's unit scale and never patches these fields, so the
   * exported stage says whatever Blender's exporter felt like. That agrees
   * with the contract only because both happen to default to 1 metre per
   * unit and the exporter is asked for the contract's up-axis at export
   * time — so a project that declares anything else is relying on a rule
   * that, until now, no test had ever seen fire.
   */
  it("rejects a stage whose declared units disagree with the contract", () => {
    expect(codes(GOOD.replace("metersPerUnit = 1", "metersPerUnit = 0.01"))).toContain(
      "S3D-E-403",
    );
    expect(codes(GOOD.replace("metersPerUnit = 1", "metersPerUnit = 100"))).toContain(
      "S3D-E-403",
    );
    expect(codes(GOOD)).not.toContain("S3D-E-403");
  });

  it("rejects a stage whose up-axis disagrees with the contract", () => {
    expect(codes(GOOD.replace('upAxis = "Y"', 'upAxis = "Z"'))).toContain("S3D-E-402");
    expect(codes(GOOD)).not.toContain("S3D-E-402");
  });

  /**
   * The direction this actually fails in production: the CONTRACT asks for
   * something other than the default, and the exporter — which is never
   * told about it — ships Blender's 1. The rule has to catch the
   * disagreement from that side too, not only when the stage is the odd one
   * out.
   */
  it("catches the exporter shipping default units under a non-default contract", () => {
    const centimetres = normalizeContract({
      schemaVersion: 1,
      conventions: { units: { metersPerUnit: 0.01, upAxis: "Y" } },
    });
    const issues: Issue[] = [];
    lintExportedStage({ usda: GOOD, contract: centimetres }, issues);
    const found = issues.find((i) => i.code === "S3D-E-403");
    expect(found).toBeDefined();
    expect(found?.detail).toMatchObject({ actual: 1, expected: 0.01 });
  });

  /**
   * The rig-purpose and model-hierarchy rules judge RELATIONSHIPS between
   * prims — which prim sits beneath which, and what type its children are —
   * so they read the parse tree rather than matching text. They are given
   * their own fixtures rather than mutations of GOOD, because what they
   * check is structure GOOD does not happen to contain.
   */
  const RIGGED = `#usda 1.0
(
    defaultPrim = "root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "root" (
    kind = "component"
    assetInfo = {
        string name = "crate"
    }
)
{
    def Xform "prp_crate_body"
    {
        def Mesh "prp_crate_body"
        {
            float3[] extent = [(-0.5, -0.5, -0.4), (0.5, 0.5, 0.4)]
        }
    }

    def Xform "cam_hero"
    {
        def Camera "cam_hero"
        {
            float focalLength = 0.5
        }
    }

    def DomeLight "env_light"
    {
        float inputs:intensity = 1
    }
}
`;

  it("flags the compiler's proof rig shipping as asset content", () => {
    const found = codes(RIGGED);
    expect(found).toContain("S3D-W-404");

    // Marking the rig as a guide is the fix, and it silences the rule.
    const guided = RIGGED.split("\n")
      .flatMap((line) =>
        /def (Xform "cam_hero"|DomeLight "env_light")/.test(line)
          ? [line, "    {", '        uniform token purpose = "guide"']
          : [line],
      )
      .join("\n")
      // The synthesized opening brace replaces the original one.
      .replace(/uniform token purpose = "guide"\n    \{/g, 'uniform token purpose = "guide"');
    expect(codes(guided)).not.toContain("S3D-W-404");
  });

  it("flags a root whose kind contradicts how many parts it holds", () => {
    // One geometry root plus a rig is a component; calling it an assembly
    // is a claim about shape that the shape does not support.
    const mislabelled = RIGGED.replace('kind = "component"', 'kind = "assembly"');
    expect(codes(mislabelled)).toContain("S3D-W-405");
    expect(codes(RIGGED)).not.toContain("S3D-W-405");

    // And the converse: several parts calling themselves one atomic asset.
    const twoParts = RIGGED.replace(
      '    def Xform "cam_hero"',
      '    def Xform "prp_crate_lid"\n    {\n        def Mesh "prp_crate_lid"\n        {\n            float3[] extent = [(0, 0, 0), (1, 1, 1)]\n        }\n    }\n\n    def Xform "cam_hero"',
    );
    expect(codes(twoParts)).toContain("S3D-W-405");
  });


  it("says nothing about prim names when no object list is available", () => {
    // A USDA-authored scene has no Blender census; the naming cross-check
    // must not invent violations from an empty reference set.
    expect(codes(GOOD.replace('def Mesh "prp_crate_body"', 'def Mesh "prp_whatever"'))).toEqual([]);
  });
});
