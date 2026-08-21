import { describe, expect, it } from "vitest";
import { authorStageModel } from "../src/usd/stage-model.js";
import { parseUsda } from "../src/parse/usda.js";

/**
 * Shaped like what Blender's USD exporter actually writes, because that is
 * the only input this ever sees: every object is an Xform wrapping a typed
 * data prim of the same name, materials live under a `_materials` Scope, and
 * the stage header carries an assetInfo dictionary.
 */
const EXPORTED = `#usda 1.0
(
    assetInfo = {
        string name = "crate"
        string version = "1"
    }
    defaultPrim = "root"
    doc = "Blender v5.0.1"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "root" (
    customData = {
        dictionary Blender = {
            bool generated = 1
        }
    }
)
{
    def Xform "prp_crate_body"
    {
        def Mesh "prp_crate_body" (
            active = true
        )
        {
            float3[] extent = [(-0.5, -0.5, -0.4), (0.5, 0.5, 0.4)]
        }
    }

    def Scope "_materials"
    {
        def Material "mtl_wood"
        {
            token outputs:surface
        }
    }

    def Xform "cam_hero"
    {
        double3 xformOp:translate = (5.5, -5, 3.5)

        def Camera "cam_hero"
        {
            float focalLength = 0.5
        }
    }

    def Xform "lgt_key"
    {
        def RectLight "lgt_key"
        {
            float inputs:intensity = 63.7
        }
    }

    def DomeLight "env_light"
    {
        float inputs:intensity = 1
    }
}
`;

/** The same stage with a second geometry root, which makes it an assembly. */
const TWO_PARTS = EXPORTED.replace(
  '    def Scope "_materials"',
  `    def Xform "prp_crate_lid"
    {
        def Mesh "prp_crate_lid"
        {
            float3[] extent = [(-0.55, -0.55, -0.05), (0.55, 0.55, 0.05)]
        }
    }

    def Scope "_materials"`,
);

/** Prim path -> its authored `kind`, read back through the real parser. */
function kinds(usda: string): Record<string, string> {
  const tree = parseUsda(usda, "out.usda");
  const out: Record<string, string> = {};
  for (const prim of tree.prims) {
    const kind = prim.metadata.get("kind");
    if (kind) out[prim.name] = kind.replace(/"/g, "");
  }
  return out;
}

/** Prim names carrying `purpose = "guide"`. */
function guides(usda: string): string[] {
  const tree = parseUsda(usda, "out.usda");
  return tree.prims
    .filter((p) => (p.attributes.get("purpose") ?? "").includes("guide"))
    .map((p) => p.name)
    .sort();
}

describe("USD model hierarchy authoring (usd/stage-model.ts)", () => {
  /**
   * The compiler's own proof-render rig was shipping as part of the asset.
   * `scene.glb` from a compile contains exactly the meshes; `scene.usda` from
   * the same compile contained those plus the hero camera and every light,
   * so importing the USD into an engine handed you lighting the GLB never
   * had. `purpose = "guide"` is USD's own answer: the rig stays addressable —
   * a consumer can still read how the asset is meant to be framed, which a
   * GLB cannot express at all — but nothing renders it.
   */
  it("marks the camera and lights as guides, not as part of the asset", () => {
    const { usda, authored } = authorStageModel({ usda: EXPORTED, assetName: "crate" });
    expect(authored.guides.sort()).toEqual(["cam_hero", "env_light", "lgt_key"]);
    expect(guides(usda)).toEqual(["cam_hero", "env_light", "lgt_key"]);
    // The geometry is emphatically not a guide.
    expect(guides(usda)).not.toContain("prp_crate_body");
  });

  /**
   * A component is a LEAF model — the unit you reference as one asset. The
   * runner declared it unconditionally by regex, so an arrangement of
   * several independent parts claimed to be atomic and nothing beneath the
   * root was addressable as a model at all.
   */
  it("calls a single-part asset a component and its parts subcomponents", () => {
    const { usda, authored } = authorStageModel({ usda: EXPORTED, assetName: "crate" });
    expect(authored.rootKind).toBe("component");
    expect(authored.subcomponents).toEqual(["prp_crate_body"]);
    expect(kinds(usda)).toMatchObject({ root: "component", prp_crate_body: "subcomponent" });
  });

  it("calls a multi-part arrangement an assembly of components", () => {
    const { usda, authored } = authorStageModel({ usda: TWO_PARTS, assetName: "crate" });
    expect(authored.rootKind).toBe("assembly");
    expect(authored.components.sort()).toEqual(["prp_crate_body", "prp_crate_lid"]);
    expect(kinds(usda)).toMatchObject({
      root: "assembly",
      prp_crate_body: "component",
      prp_crate_lid: "component",
    });
  });

  /**
   * Materials live under a Scope, which is a namespace container rather than
   * geometry. Counting one as a geometry root would make every single-part
   * prop in the corpus report as an assembly.
   */
  it("does not count the materials Scope as geometry", () => {
    const { authored } = authorStageModel({ usda: EXPORTED, assetName: "crate" });
    expect(authored.components).not.toContain("_materials");
    expect(authored.subcomponents).not.toContain("_materials");
    expect(authored.rootKind).toBe("component");
  });

  it("adds assetInfo only when the stage carries none", () => {
    expect(authorStageModel({ usda: EXPORTED, assetName: "crate" }).authored.assetInfo).toBe(false);

    const bare = EXPORTED.replace(/    assetInfo = \{[\s\S]*?\n    \}\n/, "");
    const added = authorStageModel({ usda: bare, assetName: "crate" });
    expect(added.authored.assetInfo).toBe(true);
    expect(added.usda).toContain('string name = "crate"');
    expect(parseUsda(added.usda, "x").stage.defaultPrim).toBe("root");
  });

  /**
   * The output is re-read by the linter and shipped to consumers, so a
   * rewrite that produces something the parser cannot read is worse than no
   * rewrite at all. Running twice must also be a no-op: the export stage is
   * cached, and a cached artifact can be handed back through this.
   */
  it("produces a stage that still parses, and is idempotent", () => {
    const once = authorStageModel({ usda: TWO_PARTS, assetName: "crate" });
    const before = parseUsda(TWO_PARTS, "a");
    const after = parseUsda(once.usda, "b");
    expect(after.prims.length).toBe(before.prims.length);
    expect(after.stage).toEqual(before.stage);

    const twice = authorStageModel({ usda: once.usda, assetName: "crate" });
    expect(twice.usda).toBe(once.usda);
  });

  it("replaces an existing kind rather than declaring a second one", () => {
    const preDeclared = EXPORTED.replace(
      'def Xform "root" (',
      'def Xform "root" (\n    kind = "component"',
    );
    const { usda } = authorStageModel({ usda: TWO_PARTS.replace(
      'def Xform "root" (',
      'def Xform "root" (\n    kind = "component"',
    ), assetName: "crate" });
    expect(usda.match(/kind = "assembly"/g)?.length).toBe(1);
    expect(usda).not.toContain('kind = "component"\n    customData');
    // And the single-part case keeps its correct value on a re-run.
    expect(authorStageModel({ usda: preDeclared, assetName: "crate" }).authored.rootKind).toBe(
      "component",
    );
  });

  it("leaves a stage it cannot understand exactly as it found it", () => {
    const noDefault = EXPORTED.replace('    defaultPrim = "root"\n', "");
    expect(authorStageModel({ usda: noDefault, assetName: "crate" }).usda).toBe(noDefault);
    const garbage = "this is not usda at all {{{";
    expect(authorStageModel({ usda: garbage, assetName: "crate" }).usda).toBe(garbage);
  });

  /**
   * Blender's pxr text writer puts `{` on its own line, so its exports round-
   * trip. But a USDA-*source* scene (the fork lints its own source as the
   * shipped stage) commonly writes `def Xform "Root" {` with the brace on the
   * def line. The kind splice inserted the `( ... )` metadata block BEFORE the
   * def line in that case, producing a stage `parseUsda` (and usdchecker)
   * reject — the exact opposite of the rewrite's purpose. (SM-1)
   */
  const SAME_LINE_COMPONENT = `#usda 1.0
(
    defaultPrim = "Root"
)
def Xform "Root" {
    def Mesh "prp_box" {
        float3[] extent = [(-0.5, -0.5, -0.5), (0.5, 0.5, 0.5)]
    }
}
`;
  const SAME_LINE_ASSEMBLY = `#usda 1.0
(
    defaultPrim = "Root"
)
def Xform "Root" {
    def Mesh "prp_a" {
    }
    def Mesh "prp_b" {
    }
}
`;

  it("authors parseable USDA when the brace is on the def line (SM-1, component)", () => {
    const { usda, authored } = authorStageModel({ usda: SAME_LINE_COMPONENT, assetName: "box" });
    // Must still be readable by our own parser after the rewrite.
    expect(() => parseUsda(usda, "out.usda")).not.toThrow();
    expect(authored.rootKind).toBe("component");
    expect(kinds(usda)).toMatchObject({ Root: "component", prp_box: "subcomponent" });
    // Idempotent on its own output.
    const twice = authorStageModel({ usda, assetName: "box" });
    expect(() => parseUsda(twice.usda, "out2.usda")).not.toThrow();
  });

  it("authors parseable USDA when the brace is on the def line (SM-1, assembly)", () => {
    const { usda, authored } = authorStageModel({ usda: SAME_LINE_ASSEMBLY, assetName: "pair" });
    expect(() => parseUsda(usda, "out.usda")).not.toThrow();
    expect(authored.rootKind).toBe("assembly");
    expect(kinds(usda)).toMatchObject({ Root: "assembly", prp_a: "component", prp_b: "component" });
  });
});
