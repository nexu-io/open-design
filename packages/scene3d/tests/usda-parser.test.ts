import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseUsda, UsdaParseError, walkPrims, primByPath } from "../src/parse/usda.js";

const fixtures = (name: string) => path.join(__dirname, "fixtures", "usda", name);

describe("usda parser", () => {
  it("parses stage metadata and prim structure of good-mini", () => {
    const tree = parseUsda(fs.readFileSync(fixtures("good-mini.usda"), "utf8"), "good-mini.usda");
    expect(tree.stage.defaultPrim).toBe("Root");
    expect(tree.stage.metersPerUnit).toBe(1);
    expect(tree.stage.upAxis).toBe("Y");
    expect(tree.prims.map((p) => p.name)).toEqual([
      "Root",
      "prp_bench_seat",
      "Materials",
      "mtl_wood",
    ]);
    const root = tree.root.children[0]!;
    expect(root.kind).toBe("def");
    expect(root.typeName).toBe("Xform");
    const seat = root.children[0]!;
    expect(seat.typeName).toBe("Mesh");
    /* Bulk `[...]` payloads are elided at the lexer (a real master is
       hundreds of MB of vertex data, and tokenizing it OOM'd the daemon —
       this is a structure parser, and no rule reads the numbers). The
       attribute's PRESENCE survives, as do refs/paths/strings inside
       arrays; the numeric bulk is recorded as an empty shell. */
    expect(seat.attributes.has("faceVertexCounts")).toBe(true);
    expect(seat.attributes.get("faceVertexCounts")).toBe("[]");
    expect(seat.attributes.get("material:binding")).toBe("</Root/Materials/mtl_wood>");
  });

  it("elides bulk array payloads but keeps refs, paths and strings inside arrays", () => {
    /* The regression this pins: a real master is hundreds of MB of
       bracketed vertex data, and tokenizing it minted a Token object per
       number — a multi-GB heap and a daemon OOM on a chess set. The lexer
       now skips `[...]` payloads in one walk; what consumers actually
       read from arrays (sublayer/reference @paths@, <targets>, strings)
       must still come through. */
    const tuples = new Array(50_000).fill("(0.123456, 1.234567, 2.345678)").join(", ");
    const src = `#usda 1.0
(
    defaultPrim = "Root"
    subLayers = [@./base.usda@, @./decor.usda@]
)

def Xform "Root"
{
    def Mesh "m"
    {
        point3f[] points = [${tuples}]
        int[] faceVertexIndices = [0, 1, 2, 0, 2, 3]
        uniform token[] xformOpOrder = ["xformOp:transform"]
        rel material:binding = </Root/M/mtl_x>
    }
}
`;
    const tree = parseUsda(src, "big.usda");
    expect(tree.stage.subLayers).toEqual(["./base.usda", "./decor.usda"]);
    const mesh = tree.prims.find((p) => p.name === "m")!;
    // The bulk is gone — a value that used to be megabytes is a shell…
    expect(mesh.attributes.get("points")!.length).toBeLessThan(8);
    expect(mesh.attributes.get("faceVertexIndices")!.length).toBeLessThan(8);
    // …while strings inside arrays survive for whoever reads them.
    expect(mesh.attributes.get("xformOpOrder")).toContain("xformOp:transform");
    expect(mesh.attributes.get("material:binding")).toBe("</Root/M/mtl_x>");
  });

  it("tracks line numbers for issue reporting", () => {
    const tree = parseUsda(fs.readFileSync(fixtures("bad-names.usda"), "utf8"), "bad-names.usda");
    const cube = tree.prims.find((p) => p.name === "Cube")!;
    expect(cube.line).toBe(10);
    expect(cube.sourceFile).toBe("bad-names.usda");
  });

  it("extracts references from prim metadata blocks", () => {
    const tree = parseUsda(fs.readFileSync(fixtures("with-reference.usda"), "utf8"), "with-reference.usda");
    const chair = tree.prims.find((p) => p.name === "prp_chair")!;
    expect(chair.references).toEqual(["./chair.usda"]);
  });

  it("handles over and class specs", () => {
    const src = `#usda 1.0
(
    defaultPrim = "Root"
)

class "Base"
{
    token foo = "bar"
}

over "Root"
{
    over "Child"
    {
        float x = 1.5
    }
}
`;
    const tree = parseUsda(src, "over.usda");
    const kinds = tree.prims.map((p) => `${p.kind}:${p.name}`);
    expect(kinds).toEqual(["class:Base", "over:Root", "over:Child"]);
    const child = tree.prims.find((p) => p.name === "Child")!;
    expect(child.attributes.get("x")).toBe("1.5");
    expect(child.parent).toBe("Root");
  });

  it("walks prims depth-first with depths", () => {
    const tree = parseUsda(fs.readFileSync(fixtures("good-mini.usda"), "utf8"), "good-mini.usda");
    const depths: Array<[string, number]> = [];
    walkPrims(tree.root, (prim, depth) => depths.push([prim.name, depth]));
    expect(depths).toEqual([
      ["$stage", 0],
      ["Root", 1],
      ["prp_bench_seat", 2],
      ["Materials", 2],
      ["mtl_wood", 3],
    ]);
  });

  it("resolves prim paths", () => {
    const tree = parseUsda(fs.readFileSync(fixtures("good-mini.usda"), "utf8"), "good-mini.usda");
    const mat = primByPath(tree, "/Root/Materials/mtl_wood")!;
    expect(mat.name).toBe("mtl_wood");
    expect(primByPath(tree, "/Root/Nope")).toBeUndefined();
  });

  it("reports unterminated strings as parse errors with position", () => {
    expect(() => parseUsda('def Xform "A\n{\n}', "broken.usda")).toThrow(UsdaParseError);
    try {
      parseUsda('def Xform "A\n{\n}', "broken.usda");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(UsdaParseError);
      expect((err as UsdaParseError).line).toBe(1);
      expect((err as UsdaParseError).file).toBe("broken.usda");
    }
  });

  it("tolerates comments and block comments", () => {
    const src = `#usda 1.0
// line comment
(
    defaultPrim = "Root" /* inline */
)

def Xform "Root"
{
    // comment inside prim
    def Mesh "prp_ok"
    {
    }
}
`;
    const tree = parseUsda(src, "comments.usda");
    expect(tree.prims.map((p) => p.name)).toEqual(["Root", "prp_ok"]);
  });

  it("parses timeSamples, triple-quoted strings, and layer-offset references", () => {
    // All three are legal USDA that used to CRASH the lexer — and a crash
    // here blinded the model-hierarchy rules on exactly the animated/rigged
    // exports that most need them (found by adversarial review). With the
    // master stage now carrying animation, every animated compile contains
    // timeSamples, so this is pinned.
    const src = `#usda 1.0
(
    defaultPrim = "root"
    upAxis = "Y"
)

def Xform "root" (
    kind = "component"
    doc = """A multi-line
doc string with (an unmatched paren"""
)
{
    matrix4d xformOp:transform.timeSamples = {
        1: ( (1,0,0,0), (0,1,0,0), (0,0,1,0), (0,0,0,1) ),
        2: ( (1,0,0,0), (0,1,0,0), (0,0,1,0), (1,0,0,1) ),
    }
    def Mesh "prp_body" (
        references = @other.usda@</Part> (offset = 10; scale = 2)
    )
    {
        int[] faceVertexCounts = [3]
    }
}
`;
    const tree = parseUsda(src, "probe.usda");
    expect(tree.stage.defaultPrim).toBe("root");
    expect(tree.stage.upAxis).toBe("Y");
    const names = tree.prims.map((p) => p.name);
    expect(names).toContain("root");
    expect(names).toContain("prp_body");
  });

  it("tolerates variantSet blocks without crashing the whole parse (P-9)", () => {
    // Production libraries and USDView-saved files carry variantSets. The
    // parser used to throw `expected attribute name, got '<variantName>'`,
    // and a throw here blinds the ENTIRE lint stage for that file — no
    // naming/depth/kind checks, no manifest part tree. A variant selection is
    // not an attribute the structure-only parser models, so it must be
    // skipped, not fatal, and the surrounding prims must still be seen.
    const src = `#usda 1.0
(
    defaultPrim = "Root"
)
def Xform "Root" {
    variantSet "shadingVariant" = {
        "plastic" {
            over "prp_box" {
                token surface = "plastic"
            }
        }
        "metal" {
        }
    }
    def Mesh "prp_box" {
    }
}
`;
    const tree = parseUsda(src, "variant.usda");
    const names = tree.prims.map((p) => p.name);
    expect(names).toContain("Root");
    expect(names).toContain("prp_box");
  });

  it("preserves @-reference paths that contain spaces (P-10)", () => {
    // Real downloads ship files with spaces in the name. The lexer captures
    // the whole @...@ span correctly, but collectRefs' /@([^@\s]+)@/ stopped
    // at the first space, silently dropping the sublayer/reference.
    const src = `#usda 1.0
(
    subLayers = [
        @./my asset.usda@
    ]
)
`;
    const tree = parseUsda(src, "spaced.usda");
    expect(tree.stage.subLayers).toEqual(["./my asset.usda"]);
  });

  it("does not let a valueless declaration swallow the following statement (P-1)", () => {
    // `token outputs:surface` is a valueless declaration (how UsdShade ends
    // every Shader). The value-side scan was fixed, but the name-side
    // qualifier-skip loop still crossed the newline, merging the next
    // statement's tokens into this one — so `outputs:surface` vanished and
    // `inputs:roughness` was misattributed.
    const src = `#usda 1.0
def Shader "S" {
    token outputs:surface
    float inputs:roughness = 0.5
}
`;
    const tree = parseUsda(src, "shader.usda");
    const s = tree.prims.find((p) => p.name === "S")!;
    const attrs = [...s.attributes.keys()];
    expect(attrs).toContain("outputs:surface");
    expect(attrs).toContain("inputs:roughness");
    expect(s.attributes.get("inputs:roughness")).toBe("0.5");
  });
});