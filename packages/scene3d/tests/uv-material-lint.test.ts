// UV / texture-file / engine-hygiene rules: every rule must fire on a
// census that exhibits the defect, and every contract knob must silence
// it. Censuses here are synthetic — these rules are pure functions of
// (census, contract), which is exactly what makes them testable without
// Blender in the loop.

import { describe, expect, it } from "vitest";
import { normalizeContract, validateContract, DEFAULT_CONTRACT } from "../src/contract.js";
import { runLint } from "../src/lint/rules.js";
import { lintPbr } from "../src/lint/pbr.js";
import { ISSUE_CODES } from "../src/errors.js";
import type { Census, CensusMesh, CensusUv, Scene3dContract } from "../src/types.js";

function contract(overrides: Partial<NonNullable<Scene3dContract["conventions"]>> = {}) {
  return normalizeContract({
    ...DEFAULT_CONTRACT,
    conventions: { ...DEFAULT_CONTRACT.conventions, ...overrides },
  });
}

const cleanUv: CensusUv = {
  layer: "UVMap",
  coverage: 0.6,
  overlapFraction: 0,
  flippedFaces: 0,
  outOfBoundsFraction: 0,
  texelDensity: null,
  stretch: null,
  sampled: true,
};

function mesh(over: Partial<CensusMesh> = {}): CensusMesh {
  return {
    object: "prp_crate",
    verts: 8,
    faces: 6,
    tris: 12,
    ngons: 0,
    nonManifoldEdges: 0,
    zeroAreaFaces: 0,
    nan: false,
    uvLayers: ["UVMap"],
    materials: ["mtl_wood"],
    uv: cleanUv,
    looseVerts: 0,
    looseEdges: 0,
    doubleVertices: 0,
    inconsistentWindingEdges: 0,
    facesWithoutMaterial: 0,
    ...over,
  };
}

function census(over: Partial<Census> = {}): Census {
  return {
    blenderVersion: "5.0.0",
    sceneName: "Scene",
    upAxis: "Y",
    objects: [
      {
        name: "prp_crate",
        type: "MESH",
        parent: null,
        location: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        dimensions: [1, 1, 1],
        visible: true,
        hasMeshData: true,
      },
    ],
    meshes: [mesh()],
    materials: [
      {
        name: "mtl_wood",
        usedByObjectCount: 1,
        textureNames: ["wood_diffuse"],
        principled: {
          present: true,
          metallic: 0,
          roughness: 0.7,
          ior: 1.45,
          baseColor: [0.5, 0.4, 0.3],
          hasTexture: true,
          untouchedDefault: false,
        },
      },
    ],
    textures: [
      {
        name: "wood_diffuse",
        filepath: "//textures/wood.png",
        colorSpace: "sRGB",
        width: 1024,
        height: 1024,
        fileMissing: false,
      },
    ],
    uvObjectsWithoutLayers: [],
    objectsWithoutMaterial: [],
    zFightingPairs: [],
    offCameraObjects: [],
    camera: { present: false, name: null },
    lightCount: 1,
    animation: { fps: 24, frameStart: 1, frameEnd: 1, keyframedObjects: [] },
    ...over,
  } as Census;
}

function codes(c: Census, ctr = contract()): string[] {
  return runLint({ contract: ctr, census: c }).map((issue) => issue.code);
}

describe("uv rules", () => {
  it("flags UV stretch beyond the configured limit, and only when configured", () => {
    const stretched = census({
      meshes: [mesh({ uv: { ...cleanUv, stretch: { max: 6, mean: 3 } } })],
    });
    // Opt-in: with no maxStretch the census still measured it, but no verdict.
    expect(codes(stretched)).not.toContain(ISSUE_CODES.UV_STRETCH);
    // 6x anisotropy exceeds a 4x limit → warned.
    expect(codes(stretched, contract({ uv: { maxStretch: 4 } }))).toContain(
      ISSUE_CODES.UV_STRETCH,
    );
    // Gentle stretch under the limit stays silent.
    const gentle = census({
      meshes: [mesh({ uv: { ...cleanUv, stretch: { max: 2, mean: 1.5 } } })],
    });
    expect(codes(gentle, contract({ uv: { maxStretch: 4 } }))).not.toContain(
      ISSUE_CODES.UV_STRETCH,
    );
  });

  it("errors on a textured mesh with no UV layer, and only then", () => {
    const bad = census({ meshes: [mesh({ uvLayers: [], uv: null })] });
    expect(codes(bad)).toContain(ISSUE_CODES.UV_MISSING);
    // Untextured mesh without UVs is fine under the default "textured" mode…
    const untextured = census({
      meshes: [mesh({ uvLayers: [], uv: null, materials: ["mtl_flat"] })],
      materials: [
        {
          name: "mtl_flat",
          usedByObjectCount: 1,
          textureNames: [],
          principled: {
            present: true, metallic: 0, roughness: 0.7, ior: 1.45,
            baseColor: [0.5, 0.4, 0.3], hasTexture: false, untouchedDefault: false,
          },
        },
      ],
      textures: [],
    });
    expect(codes(untextured)).not.toContain(ISSUE_CODES.UV_MISSING);
    // …and an error under "all".
    expect(codes(untextured, contract({ uv: { require: "all" } }))).toContain(
      ISSUE_CODES.UV_MISSING,
    );
    // "off" silences everything UV.
    expect(codes(bad, contract({ uv: { require: "off" } }))).not.toContain(
      ISSUE_CODES.UV_MISSING,
    );
  });

  it("does not double-report textured-without-UV under both W-343 and E-441", () => {
    const bad = census({
      meshes: [mesh({ uvLayers: [], uv: null })],
      uvObjectsWithoutLayers: ["prp_crate"],
    });
    const defaults = codes(bad);
    expect(defaults).toContain(ISSUE_CODES.UV_MISSING);
    expect(defaults).not.toContain(ISSUE_CODES.TEXTURE_WITHOUT_UV);
    const off = codes(bad, contract({ uv: { require: "off" } }));
    expect(off).toContain(ISSUE_CODES.TEXTURE_WITHOUT_UV);
    expect(off).not.toContain(ISSUE_CODES.UV_MISSING);
  });

  it("flags island overlap past the contract fraction", () => {
    const bad = census({ meshes: [mesh({ uv: { ...cleanUv, overlapFraction: 0.3 } })] });
    expect(codes(bad)).toContain(ISSUE_CODES.UV_OVERLAP);
    expect(codes(bad, contract({ uv: { maxOverlapFraction: 0.5 } }))).not.toContain(
      ISSUE_CODES.UV_OVERLAP,
    );
  });

  it("flags mirrored islands unless the contract allows them", () => {
    const bad = census({ meshes: [mesh({ uv: { ...cleanUv, flippedFaces: 3 } })] });
    expect(codes(bad)).toContain(ISSUE_CODES.UV_FLIPPED);
    expect(codes(bad, contract({ uv: { allowFlipped: true } }))).not.toContain(
      ISSUE_CODES.UV_FLIPPED,
    );
  });

  it("leaves out-of-bounds UVs alone by default — tiling is legitimate", () => {
    const tiling = census({ meshes: [mesh({ uv: { ...cleanUv, outOfBoundsFraction: 0.9 } })] });
    expect(codes(tiling)).not.toContain(ISSUE_CODES.UV_OUT_OF_BOUNDS);
    expect(
      codes(tiling, contract({ uv: { maxOutOfBoundsFraction: 0.01 } })),
    ).toContain(ISSUE_CODES.UV_OUT_OF_BOUNDS);
  });

  it("reports the raster cap as unchecked, never as clean", () => {
    const capped = census({
      meshes: [mesh({ uv: { ...cleanUv, sampled: false, coverage: null, overlapFraction: null } })],
    });
    expect(codes(capped)).toContain(ISSUE_CODES.UV_UNCHECKED);
  });

  it("does not call materials identical when only their alpha MODE differs", () => {
    // Khronos AlphaBlendModeTest exists to vary exactly this, and had all five
    // of its materials reported as duplicates with the advice to merge them —
    // which would have visibly broken the asset, since a masked surface and a
    // blended one render nothing alike. The Principled inputs really are
    // identical; the difference lives in how alpha resolves, so that is what
    // the census had to start measuring.
    const material = (name: string, blendMethod: string, alphaCutoff: number | null = null) => ({
      name,
      usedByObjectCount: 1,
      textureNames: [],
      blendMethod,
      alphaCutoff,
      principled: {
        present: true,
        metallic: 0,
        roughness: 0.5,
        ior: 1.45,
        baseColor: [0.8, 0.1, 0.1],
        hasTexture: false,
        untouchedDefault: false,
      },
    });
    const varied = census({
      materials: [material("MatOpaque", "OPAQUE"), material("MatBlend", "BLENDED")] as never,
    });
    expect(codes(varied)).not.toContain(ISSUE_CODES.DUPLICATE_MATERIALS);

    // Nor when only the CUTOFF differs. glTF alphaMode MASK survives import as
    // a node chain rather than a property, so two masked materials look
    // identical in every Principled input while clipping at 0.25 and 0.75 —
    // and the exported GLB carries both cutoffs, verified by round-tripping
    // that asset and reading the result.
    const cutoffs = census({
      materials: [
        material("MatCutoff25", "DITHERED", 0.25),
        material("MatCutoff75", "DITHERED", 0.75),
      ] as never,
    });
    expect(codes(cutoffs)).not.toContain(ISSUE_CODES.DUPLICATE_MATERIALS);

    // Genuinely identical materials are still reported: the rule pays for
    // itself on real duplicate draw calls.
    const same = census({
      materials: [material("MatA", "OPAQUE"), material("MatB", "OPAQUE")] as never,
    });
    expect(codes(same)).toContain(ISSUE_CODES.DUPLICATE_MATERIALS);
  });

  it("measures texel-density spread over the AUTHORED parts only", () => {
    // A downloaded hero's texel budget was somebody else's decision, made
    // before this scene existed. Folding one into the scene's coherence
    // statistic produced a x189 spread naming the author's own floor as the
    // offender against a 2K asset — unactionable in either direction. Unlike
    // the per-mesh rules there is no single subject to reclassify, so the
    // population is scoped and the exclusion is stated.
    const mixed = census({
      meshes: [
        mesh({ uv: { ...cleanUv, texelDensity: { min: 50, max: 60, mean: 55 } } }),
        mesh({
          object: "prp_hero",
          uv: { ...cleanUv, texelDensity: { min: 800, max: 900, mean: 850 } },
        }),
      ],
    });
    // Authored: the spread is real and reported.
    expect(codes(mixed)).toContain(ISSUE_CODES.TEXEL_DENSITY_SPREAD);

    // The same scene where the dense mesh is an imported `file:` part.
    const issues = runLint({
      contract: contract(),
      census: mixed,
      solved: { parts: [{ id: "prp_hero", file: "hero.glb" }] } as never,
    });
    expect(issues.map((i) => i.code)).not.toContain(ISSUE_CODES.TEXEL_DENSITY_SPREAD);
  });

  it("says how many meshes it left out of the spread", () => {
    const mixed = census({
      meshes: [
        mesh({ uv: { ...cleanUv, texelDensity: { min: 50, max: 60, mean: 55 } } }),
        mesh({ object: "prp_lid", uv: { ...cleanUv, texelDensity: { min: 800, max: 900, mean: 850 } } }),
        mesh({ object: "prp_hero", uv: { ...cleanUv, texelDensity: { min: 9000, max: 9900, mean: 9400 } } }),
      ],
    });
    const spread = runLint({
      contract: contract(),
      census: mixed,
      solved: { parts: [{ id: "prp_hero", file: "hero.glb" }] } as never,
    }).find((i) => i.code === ISSUE_CODES.TEXEL_DENSITY_SPREAD);
    expect(spread).toBeDefined();
    expect(spread!.detail?.importedExcluded).toBe(1);
    expect(spread!.message).toContain("authored parts");
    // ...and the ratio is the authored one (800/60), not the imported 9900/60.
    expect(spread!.message).toMatch(/x1[0-9]\.[0-9]/);
  });

  it("flags texel-density spread across the scene and target misses per mesh", () => {
    const spread = census({
      meshes: [
        mesh({ uv: { ...cleanUv, texelDensity: { min: 50, max: 60, mean: 55 } } }),
        mesh({
          object: "prp_lid",
          uv: { ...cleanUv, texelDensity: { min: 800, max: 900, mean: 850 } },
        }),
      ],
    });
    expect(codes(spread)).toContain(ISSUE_CODES.TEXEL_DENSITY_SPREAD);
    expect(codes(spread, contract({ uv: { texelDensity: { maxRatio: 100 } } }))).not.toContain(
      ISSUE_CODES.TEXEL_DENSITY_SPREAD,
    );

    const offTarget = census({
      meshes: [mesh({ uv: { ...cleanUv, texelDensity: { min: 10, max: 12, mean: 11 } } })],
    });
    expect(
      codes(offTarget, contract({ uv: { texelDensity: { target: 512, maxRatio: 4 } } })),
    ).toContain(ISSUE_CODES.TEXEL_DENSITY_TARGET);
    expect(codes(offTarget)).not.toContain(ISSUE_CODES.TEXEL_DENSITY_TARGET);
  });

  it("judges UV quality only where UVs matter — flat-colour props stay silent", () => {
    // Blender's own factory cylinder ships one mirrored bottom-cap UV face;
    // on an untextured prop that changes nothing on screen. The same mesh
    // under require:"all" (a project saying UVs always matter) does warn.
    const flatProp = census({
      meshes: [mesh({ materials: ["mtl_flat"], uv: { ...cleanUv, flippedFaces: 1 } })],
      materials: [
        {
          name: "mtl_flat",
          usedByObjectCount: 1,
          textureNames: [],
          principled: {
            present: true, metallic: 0, roughness: 0.7, ior: 1.45,
            baseColor: [0.5, 0.4, 0.3], hasTexture: false, untouchedDefault: false,
          },
        },
      ],
      textures: [],
    });
    expect(codes(flatProp)).not.toContain(ISSUE_CODES.UV_FLIPPED);
    expect(codes(flatProp, contract({ uv: { require: "all" } }))).toContain(
      ISSUE_CODES.UV_FLIPPED,
    );
  });

  it("passes a clean textured mesh with zero UV findings", () => {
    const clean = codes(census());
    for (const code of [
      ISSUE_CODES.UV_MISSING,
      ISSUE_CODES.UV_OVERLAP,
      ISSUE_CODES.UV_FLIPPED,
      ISSUE_CODES.UV_OUT_OF_BOUNDS,
      ISSUE_CODES.UV_UNCHECKED,
      ISSUE_CODES.TEXEL_DENSITY_SPREAD,
    ]) {
      expect(clean).not.toContain(code);
    }
  });
});

describe("review-pinned invariants", () => {
  it("a disconnected TEX_IMAGE node does not make a mesh 'textured'", () => {
    // The runner's measured fact (principled.hasTexture) is the definition;
    // textureNames is inventory. An image node wired to nothing samples no
    // UVs, so demanding UVs for it would be policy invented in the lint.
    const disconnected = census({
      meshes: [mesh({ uvLayers: [], uv: null, materials: ["mtl_dangling"] })],
      materials: [
        {
          name: "mtl_dangling",
          usedByObjectCount: 1,
          textureNames: ["tex_orphan"],
          principled: {
            present: true, metallic: 0, roughness: 0.7, ior: 1.45,
            baseColor: [0.5, 0.4, 0.3], hasTexture: false, untouchedDefault: false,
          },
        },
      ],
      textures: [],
    });
    expect(codes(disconnected)).not.toContain(ISSUE_CODES.UV_MISSING);
  });

  it("reports an unused material exactly once even without runLint's dedupe", () => {
    const unused = census({
      materials: [
        {
          name: "mtl_orphan",
          usedByObjectCount: 0,
          textureNames: [],
          principled: {
            present: true, metallic: 0, roughness: 0.7, ior: 1.45,
            baseColor: [0.5, 0.4, 0.3], hasTexture: false, untouchedDefault: false,
          },
        },
      ],
    });
    const issues: import("../src/types.js").Issue[] = [];
    lintPbr({ contract: contract(), census: unused }, issues);
    expect(issues.filter((issue) => issue.code === ISSUE_CODES.MATERIAL_UNUSED)).toHaveLength(1);
  });

  it("rejects non-boolean values for boolean contract knobs", () => {
    const problems = validateContract({
      schemaVersion: 1,
      conventions: {
        geometry: { allowNegativeScale: "yes" },
        textures: { requirePowerOfTwo: 1 },
        uv: { allowFlipped: "no" },
      },
    });
    expect(problems.some((p) => p.includes("allowNegativeScale"))).toBe(true);
    expect(problems.some((p) => p.includes("requirePowerOfTwo"))).toBe(true);
    expect(problems.some((p) => p.includes("allowFlipped"))).toBe(true);
  });
});

describe("texture-file rules", () => {
  it("errors on a texture whose file does not exist", () => {
    const bad = census({
      textures: [
        {
          name: "wood_diffuse", filepath: "//textures/gone.png", colorSpace: "sRGB",
          width: 0, height: 0, fileMissing: true,
        },
      ],
    });
    expect(codes(bad)).toContain(ISSUE_CODES.TEXTURE_FILE_MISSING);
  });

  it("warns on NPOT and oversized textures per the contract", () => {
    const bad = census({
      textures: [
        {
          name: "wood_diffuse", filepath: "//t.png", colorSpace: "sRGB",
          width: 1000, height: 8192, fileMissing: false,
        },
      ],
    });
    const found = codes(bad);
    expect(found).toContain(ISSUE_CODES.TEXTURE_NOT_POWER_OF_TWO);
    expect(found).toContain(ISSUE_CODES.TEXTURE_TOO_LARGE);
    const relaxed = codes(
      bad,
      contract({ textures: { requirePowerOfTwo: false, maxSize: 8192 } }),
    );
    expect(relaxed).not.toContain(ISSUE_CODES.TEXTURE_NOT_POWER_OF_TWO);
    expect(relaxed).not.toContain(ISSUE_CODES.TEXTURE_TOO_LARGE);
  });

  it("flags identical materials and honours the off switch", () => {
    const twin = (name: string) => ({
      name,
      usedByObjectCount: 1,
      textureNames: ["wood_diffuse"],
      principled: {
        present: true, metallic: 0, roughness: 0.7, ior: 1.45,
        baseColor: [0.5, 0.4, 0.3] as [number, number, number],
        hasTexture: true, untouchedDefault: false,
      },
    });
    const bad = census({ materials: [twin("mtl_wood"), twin("mtl_wood_copy")] });
    expect(codes(bad)).toContain(ISSUE_CODES.DUPLICATE_MATERIALS);
    expect(
      codes(bad, contract({ textures: { flagDuplicateMaterials: false } })),
    ).not.toContain(ISSUE_CODES.DUPLICATE_MATERIALS);
  });

  it("warns on faces with no material slot", () => {
    const bad = census({ meshes: [mesh({ facesWithoutMaterial: 4 })] });
    expect(codes(bad)).toContain(ISSUE_CODES.FACES_WITHOUT_MATERIAL);
    expect(
      codes(bad, contract({ textures: { requireFaceAssignment: false } })),
    ).not.toContain(ISSUE_CODES.FACES_WITHOUT_MATERIAL);
  });
});

describe("engine-hygiene rules", () => {
  it("flags loose geometry, doubles, and inconsistent winding", () => {
    const bad = census({
      meshes: [mesh({ looseVerts: 2, looseEdges: 1, doubleVertices: 5, inconsistentWindingEdges: 3 })],
    });
    const found = codes(bad);
    expect(found).toContain(ISSUE_CODES.LOOSE_GEOMETRY);
    expect(found).toContain(ISSUE_CODES.DOUBLE_VERTICES);
    expect(found).toContain(ISSUE_CODES.INCONSISTENT_WINDING);
    const relaxed = codes(
      bad,
      contract({
        geometry: {
          allowLooseGeometry: true,
          allowDoubleVertices: true,
          allowInconsistentWinding: true,
        },
      }),
    );
    expect(relaxed).not.toContain(ISSUE_CODES.LOOSE_GEOMETRY);
    expect(relaxed).not.toContain(ISSUE_CODES.DOUBLE_VERTICES);
    expect(relaxed).not.toContain(ISSUE_CODES.INCONSISTENT_WINDING);
  });

  it("errors on negative scale — flipped normals — unless allowed", () => {
    const bad = census({
      objects: [
        {
          name: "prp_crate", type: "MESH", parent: null,
          location: [0, 0, 0], rotation: [0, 0, 0], scale: [-1, -1, -1],
          dimensions: [1, 1, 1], visible: true, hasMeshData: true,
        },
      ],
    });
    expect(codes(bad)).toContain(ISSUE_CODES.NEGATIVE_SCALE);
    expect(
      codes(bad, contract({ geometry: { allowNegativeScale: true } })),
    ).not.toContain(ISSUE_CODES.NEGATIVE_SCALE);
  });

  it("warns on unapplied uniform scale, but never on a non-mesh", () => {
    const scaled = census({
      objects: [
        {
          name: "prp_crate", type: "MESH", parent: null,
          location: [0, 0, 0], rotation: [0, 0, 0], scale: [2, 2, 2],
          dimensions: [1, 1, 1], visible: true, hasMeshData: true,
        },
        {
          name: "lgt_key", type: "LIGHT", parent: null,
          location: [0, 0, 2], rotation: [0, 0, 0], scale: [3, 3, 3],
          dimensions: [0, 0, 0], visible: true, hasMeshData: false,
        },
      ],
    });
    const found = runLint({ contract: contract(), census: scaled }).filter(
      (issue) => issue.code === ISSUE_CODES.UNAPPLIED_SCALE,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.target).toBe("prp_crate");
    expect(
      codes(scaled, contract({ geometry: { requireAppliedScale: false } })),
    ).not.toContain(ISSUE_CODES.UNAPPLIED_SCALE);
  });

  it("keeps the clean baseline clean under all default rules", () => {
    const clean = codes(census());
    for (const code of [
      ISSUE_CODES.LOOSE_GEOMETRY,
      ISSUE_CODES.DOUBLE_VERTICES,
      ISSUE_CODES.INCONSISTENT_WINDING,
      ISSUE_CODES.NEGATIVE_SCALE,
      ISSUE_CODES.UNAPPLIED_SCALE,
      ISSUE_CODES.TEXTURE_FILE_MISSING,
      ISSUE_CODES.TEXTURE_NOT_POWER_OF_TWO,
      ISSUE_CODES.TEXTURE_TOO_LARGE,
      ISSUE_CODES.DUPLICATE_MATERIALS,
      ISSUE_CODES.FACES_WITHOUT_MATERIAL,
    ]) {
      expect(clean).not.toContain(code);
    }
  });
});
