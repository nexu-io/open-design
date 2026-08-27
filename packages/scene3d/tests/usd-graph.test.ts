// The USD scene-graph dump: USD is the master format and technically text, but
// every prim is buried under kilobytes of vertex arrays. renderUsdGraph reuses
// the compiler's own parser to emit ONLY the semantic layer — the prim tree,
// kinds, xforms, and material bindings an agent can actually reason over.

import { describe, expect, it } from "vitest";
import { renderUsdGraph } from "../src/usd/graph.js";

const USDA = `#usda 1.0
(
    assetInfo = { string name = "demo" }
    defaultPrim = "root"
    metersPerUnit = 1
    upAxis = "Y"
)

def Xform "root" ( kind = "assembly" )
{
    float3 xformOp:rotateXYZ = (-90, 0, 0)
    uniform token[] xformOpOrder = ["xformOp:rotateXYZ"]

    def Xform "prp_box" ( kind = "component" )
    {
        double3 xformOp:translate = (1, 0, 0.5)
        float3 xformOp:scale = (1, 1, 1)
        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]

        def Mesh "prp_box" ( prepend apiSchemas = ["MaterialBindingAPI"] )
        {
            float3[] extent = [(-1, -1, -1), (1, 1, 1)]
            int[] faceVertexCounts = [4, 4, 4, 4, 4, 4]
            int[] faceVertexIndices = [0, 1, 2, 3, 4, 5, 6, 7]
            point3f[] points = [(-1, -1, -1), (1, 1, 1)]
            rel material:binding = </root/_materials/mtl_wood>
        }
    }
    def Scope "_materials"
    {
        def Material "mtl_wood"
        {
            def Shader "Principled_BSDF" { uniform token info:id = "UsdPreviewSurface" }
            def Shader "bnode__Principled" { uniform token info:id = "ND_open_pbr_surface_surfaceshader" }
        }
    }
}
`;

describe("renderUsdGraph", () => {
  it("emits the semantic scene graph and omits the geometry arrays", () => {
    const g = renderUsdGraph(USDA);
    expect(g).toContain("stage: root (up=Y");
    expect(g).toContain("assetInfo");
    expect(g).toContain("root  Xform  kind=assembly  R(-90,0,0)");
    expect(g).toContain("prp_box  Xform  kind=component  T(1,0,0.5)");
    expect(g).toContain("prp_box  Mesh  mat=mtl_wood");
    // The material NETWORK is collapsed to a one-line surface summary, not
    // spilled node by node.
    expect(g).toContain("mtl_wood  Material  UsdPreviewSurface + MaterialX");
    expect(g).not.toContain("Principled_BSDF");
    // The vertex arrays that make the raw .usda unreadable never appear.
    expect(g).not.toContain("points");
    expect(g).not.toContain("faceVertexIndices");
    // An identity scale is omitted; a non-identity translate is kept.
    expect(g).not.toContain("S(1,1,1)");
  });

  it("degrades to a one-line reason on unparseable input, never throws", () => {
    const g = renderUsdGraph('#usda 1.0\ndef Xform "x" {{{ broken');
    expect(typeof g).toBe("string");
    expect(g.split("\n").length).toBeLessThan(5);
  });
});
