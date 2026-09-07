import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseUsda } from "../src/parse/usda.js";
import { normalizeContract } from "../src/contract.js";
import { runLint } from "../src/lint/rules.js";
import { ISSUE_CODES } from "../src/errors.js";
import { Census } from "../src/types.js";

const usdaFixture = (name: string) =>
  parseUsda(fs.readFileSync(path.join(__dirname, "fixtures", "usda", name), "utf8"), name);

const contract = () => normalizeContract();

describe("lint: naming + units over USDA fixtures", () => {
  it("passes good-mini with the default contract", () => {
    const issues = runLint({ contract: contract(), primTree: usdaFixture("good-mini.usda") });
    const errors = issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });

  it("flags default names, unit mismatch and up-axis mismatch in bad-names", () => {
    const issues = runLint({ contract: contract(), primTree: usdaFixture("bad-names.usda") });
    const codes = new Set(issues.map((i) => i.code));
    expect(codes.has(ISSUE_CODES.NAME_DEFAULT)).toBe(true);
    expect(codes.has(ISSUE_CODES.COLLECTION_NAME_DEFAULT)).toBe(true);
    expect(codes.has(ISSUE_CODES.UNITS_MISMATCH)).toBe(true);
    expect(codes.has(ISSUE_CODES.UP_AXIS_MISMATCH)).toBe(true);
    const cube = issues.find((i) => i.target === "Cube")!;
    expect(cube.severity).toBe("error");
  });

  it("flags prefix violations when the contract requires prefixes", () => {
    const issues = runLint({
      contract: normalizeContract({
        schemaVersion: 1,
        conventions: { naming: { partPrefixes: ["prp_", "cam_"] } },
      }),
      primTree: usdaFixture("good-mini.usda"),
    });
    const prefixed = issues.filter((i) => i.code === ISSUE_CODES.NAME_PREFIX);
    expect(prefixed.map((i) => i.target)).toContain("Root");
    expect(prefixed.map((i) => i.target)).toContain("mtl_wood");
  });
});

describe("lint: pbr/topology/integrity over census", () => {
  const census = (patch: Partial<Census>): Census => ({
    blenderVersion: "5.0.1",
    sceneName: "Scene",
    objects: [
      {
        name: "prp_cube",
        type: "MESH",
        parent: null,
        location: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        dimensions: [2, 2, 2],
        visible: true,
        hasMeshData: true,
      },
    ],
    meshes: [
      {
        object: "prp_cube",
        verts: 8,
        faces: 6,
        ngons: 0,
        nonManifoldEdges: 0,
        zeroAreaFaces: 0,
        nan: false,
        uvLayers: ["UVMap"],
      },
    ],
    materials: [],
    textures: [],
    uvObjectsWithoutLayers: [],
    objectsWithoutMaterial: [],
    zFightingPairs: [],
    camera: { present: true, name: "cam_shot" },
    lightCount: 1,
    animation: { fps: 24, frameStart: 1, frameEnd: 1, keyframedObjects: [] },
    offCameraObjects: [],
    ...patch,
  });

  it("reports non-manifold edges, ngons, zero-area faces and NaN meshes", () => {
    const issues = runLint({
      contract: contract(),
      census: census({
        meshes: [
          {
            object: "prp_cube",
            verts: 8,
            faces: 6,
            ngons: 2,
            nonManifoldEdges: 4,
            zeroAreaFaces: 1,
            nan: true,
            uvLayers: [],
          },
        ],
      }),
    });
    const codes = new Set(issues.map((i) => i.code));
    expect(codes.has(ISSUE_CODES.NON_MANIFOLD)).toBe(true);
    expect(codes.has(ISSUE_CODES.NGONS)).toBe(true);
    expect(codes.has(ISSUE_CODES.ZERO_AREA_FACES)).toBe(true);
    expect(codes.has(ISSUE_CODES.NAN_TRANSFORM)).toBe(true);
  });

  it("gates NGONS on conventions.geometry.allowNgons, defaulting to warn", () => {
    // Hard-surface assets legitimately ship n-gons (a flat cap face, a
    // boolean result); the default keeps the current strict behavior, and
    // an author who declares allowNgons opts a specific project out.
    const withNgons = census({
      meshes: [
        {
          object: "prp_cube",
          verts: 8,
          faces: 6,
          ngons: 2,
          nonManifoldEdges: 0,
          zeroAreaFaces: 0,
          nan: false,
          uvLayers: ["UVMap"],
        },
      ],
    });
    const strict = runLint({ contract: contract(), census: withNgons });
    expect(strict.some((i) => i.code === ISSUE_CODES.NGONS)).toBe(true);

    const gated = runLint({
      contract: normalizeContract({
        schemaVersion: 1,
        conventions: { geometry: { allowNgons: true } },
      }),
      census: withNgons,
    });
    expect(gated.some((i) => i.code === ISSUE_CODES.NGONS)).toBe(false);
  });

  it("relaxes the inspection-posture gates for a file:-imported mesh, not the real defects", () => {
    // The SAME open/doubled/wound mesh — but marked as a `file:` import via the
    // solved scene — is no longer BLOCKING on non-manifold/doubles/winding
    // (imported provenance = inspect, don't judge), while ngons and zero-area
    // (genuine defects, not inspection-relaxable) still fire at full severity.
    //
    // The relaxation reclassifies; it does not suppress. Rules that simply did
    // not fire left nothing in the report to explain why a strict contract had
    // gone quiet on a mesh — silence standing in for a judgement.
    const meshRow = {
      object: "prp_helm",
      verts: 200,
      faces: 300,
      ngons: 2,
      nonManifoldEdges: 124,
      zeroAreaFaces: 1,
      materials: ["mtl_imported"],
      nan: false,
      uvLayers: [],
      doubleVertices: 43,
      inconsistentWindingEdges: 1,
    };
    const strict = runLint({ contract: contract(), census: census({ meshes: [meshRow] }) });
    const strictCodes = new Set(strict.map((i) => i.code));
    expect(strictCodes.has(ISSUE_CODES.NON_MANIFOLD)).toBe(true);
    expect(strictCodes.has(ISSUE_CODES.DOUBLE_VERTICES)).toBe(true);
    expect(strictCodes.has(ISSUE_CODES.INCONSISTENT_WINDING)).toBe(true);

    const imported = runLint({
      contract: contract(),
      census: census({ meshes: [meshRow] }),
      solved: { parts: [{ id: "prp_helm", file: "helm.glb" }] } as never,
    });
    const byCode = new Map(imported.map((i) => [i.code, i]));
    for (const code of [
      ISSUE_CODES.NON_MANIFOLD,
      ISSUE_CODES.DOUBLE_VERTICES,
      ISSUE_CODES.INCONSISTENT_WINDING,
      ISSUE_CODES.ZERO_AREA_FACES,
    ]) {
      const issue = byCode.get(code);
      expect(issue, `${code} must still be reported`).toBeDefined();
      expect(issue!.severity).toBe("info"); // relaxed, and says so
      expect(issue!.detail?.provenance).toBe("imported");
    }
    // Not everything relaxes. An ngon is a modelling choice the importing
    // project can act on (it re-triangulates on export), so provenance buys it
    // nothing — unlike a zero-area face, which the Khronos corpus showed is
    // shipped by real exporters in 8 of 23 assets nobody considers broken.
    for (const code of [ISSUE_CODES.NGONS]) {
      const issue = byCode.get(code);
      expect(issue, `${code} must still fire`).toBeDefined();
      expect(issue!.severity).not.toBe("info");
      expect(issue!.detail?.provenance).toBeUndefined();
    }
    expect(imported.some((i) => i.severity === "error" && i.code === ISSUE_CODES.NON_MANIFOLD)).toBe(false);
  });

  it("relaxes a material finding by its MEASURED provenance, enforces it without", () => {
    // Calibration against the Khronos corpus found the original of this:
    // OrientationTest, a model whose entire purpose is to be correct, failed
    // with six metallic errors. metallic is reported against a MATERIAL, and
    // whether that material is the import's is now a MEASURED fact on the census
    // row (imported), tagged at the import site — not a guess from its name.
    const matRow = (imported?: boolean) => ({
      name: "MatX1",
      usedByObjectCount: 1,
      ...(imported ? { imported: true } : {}),
      textureNames: [],
      principled: { present: true, metallic: 0.4, roughness: 0.5, ior: 1.45, baseColor: [0.5, 0.5, 0.5], hasTexture: false, untouchedDefault: false },
    });
    const sceneWith = (imported?: boolean) =>
      census({
        objects: [{ name: "Mesh", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true }],
        meshes: [{ object: "Mesh", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"], materials: ["MatX1"] }],
        materials: [matRow(imported)] as never,
      });
    // Untagged: the author authored it — enforced.
    expect(runLint({ contract: contract(), census: sceneWith(false) }).find((i) => i.code === ISSUE_CODES.METALLIC_VALUE)!.severity).toBe("error");
    // Import-tagged, and the whole scene is a bare mesh (sourceKind), so its
    // object is imported too — the asset's own material, relaxed.
    const imported = runLint({ contract: contract(), census: sceneWith(true), sourceKind: "mesh" });
    const metallic = imported.find((i) => i.code === ISSUE_CODES.METALLIC_VALUE)!;
    expect(metallic.severity).toBe("info");
    expect(metallic.detail?.provenance).toBe("imported");
  });

  it("relaxes an imported file: part's material verdict inside an AUTHORED scene", () => {
    // The whole-scene mesh path is covered above; this is the other arrival of
    // imported geometry — a `file:` part fitted into an authored scene, which
    // keeps the strict [0,1] metallic discipline (NOT the inspection preset's
    // empty allowlist). A downloaded helmet's own fractional metallic must not
    // hard-fail that compile: the material is worn only by the imported part,
    // so the finding is measured and reclassified, never enforced.
    const helmCensus = census({
      objects: [
        { name: "prp_helm", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
      ],
      meshes: [{ object: "prp_helm", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"], materials: ["helm_metal"] }],
      materials: [
        {
          name: "helm_metal",
          usedByObjectCount: 1,
          imported: true, // the import's own material, tagged at the import site
          textureNames: [],
          principled: { present: true, metallic: 0.4, roughness: 0.5, ior: 1.45, baseColor: [0.5, 0.5, 0.5], hasTexture: false, untouchedDefault: false },
        },
      ] as never,
    });
    // A census where the same material is NOT import-tagged (the author authored
    // it): the strict discipline holds — a real error.
    const authoredCensus = census({
      objects: [{ name: "prp_helm", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true }],
      meshes: [{ object: "prp_helm", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"], materials: ["helm_metal"] }],
      materials: [{ name: "helm_metal", usedByObjectCount: 1, textureNames: [], principled: { present: true, metallic: 0.4, roughness: 0.5, ior: 1.45, baseColor: [0.5, 0.5, 0.5], hasTexture: false, untouchedDefault: false } }] as never,
    });
    expect(runLint({ contract: contract(), census: authoredCensus }).find((i) => i.code === ISSUE_CODES.METALLIC_VALUE)!.severity).toBe("error");
    // The import-tagged census, arriving as a `file:` part: reclassified.
    const imported = runLint({
      contract: contract(),
      census: helmCensus,
      solved: { parts: [{ id: "prp_helm", file: "helm.glb" }] } as never,
    });
    const metallic = imported.find((i) => i.code === ISSUE_CODES.METALLIC_VALUE)!;
    expect(metallic.severity).toBe("info");
    expect(metallic.detail?.provenance).toBe("imported");
  });

  it("ENFORCES policy on a material: override the author chose for a file part", () => {
    // A `material:` override on a file part is the author picking one of THEIR
    // materials for imported geometry — an explicit choice, not the asset's own
    // shading. So an out-of-policy metallic on that override is the author's to
    // fix and must stay an error, even though it is worn only by the imported
    // mesh. The module comment already promises this ("a `material:` override
    // on a `file:` part is exactly [the author's]"); this pins it.
    const overrideCensus = census({
      objects: [
        { name: "prp_helm", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
      ],
      meshes: [{ object: "prp_helm", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"], materials: ["project_gold"] }],
      materials: [
        {
          name: "project_gold",
          usedByObjectCount: 1,
          textureNames: [],
          principled: { present: true, metallic: 0.4, roughness: 0.5, ior: 1.45, baseColor: [0.5, 0.5, 0.5], hasTexture: false, untouchedDefault: false },
        },
      ] as never,
    });
    const issues = runLint({
      contract: contract(),
      census: overrideCensus,
      solved: { parts: [{ id: "prp_helm", file: "helm.glb", material: "project_gold" }] } as never,
    });
    // The author selected project_gold, so its metallic verdict is theirs.
    expect(issues.find((i) => i.code === ISSUE_CODES.METALLIC_VALUE)!.severity).toBe("error");
  });

  it("RELAXES an out-of-policy metallic on a material an override ORPHANED", () => {
    // A `material:` override wholesale-replaces a file part's materials, leaving
    // the asset's ORIGINAL material orphaned (bound to nothing). The author
    // cannot fix somebody else's source file, so an out-of-policy metallic on
    // that orphan must relax — even though it hangs on no imported mesh and so
    // is invisible to a bound-mesh-only scan.
    const orphanCensus = census({
      objects: [
        { name: "prp_helm", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
      ],
      meshes: [{ object: "prp_helm", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"], materials: ["project_gold"] }],
      materials: [
        { name: "project_gold", usedByObjectCount: 1, textureNames: [], principled: { present: true, metallic: 0, roughness: 0.5, ior: 1.45, baseColor: [0.5, 0.5, 0.5], hasTexture: false, untouchedDefault: false } },
        // helm.glb's OWN material, orphaned by the override — import-tagged at
        // the import site, fractional metallic.
        { name: "helm_original", usedByObjectCount: 0, imported: true, textureNames: [], principled: { present: true, metallic: 0.4, roughness: 0.5, ior: 1.45, baseColor: [0.5, 0.5, 0.5], hasTexture: false, untouchedDefault: false } },
      ] as never,
    });
    const issues = runLint({
      contract: contract(),
      census: orphanCensus,
      solved: { parts: [{ id: "prp_helm", file: "helm.glb", material: "project_gold" }] } as never,
    });
    const orphanMetallic = issues.find((i) => i.code === ISSUE_CODES.METALLIC_VALUE && i.target === "helm_original")!;
    expect(orphanMetallic.severity).toBe("info"); // the import's own, relaxed
    expect(orphanMetallic.detail?.provenance).toBe("imported");
  });

  it("holds an author's OWN unused declared material's verdict (not an import)", () => {
    // The mirror of the orphan case: a material the author DECLARED but left
    // bound to nothing is theirs to answer for, so its out-of-policy metallic
    // stays an error even though the scene also carries a file-part import.
    const authoredOrphan = census({
      objects: [
        { name: "prp_helm", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
      ],
      meshes: [{ object: "prp_helm", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"], materials: [] }],
      materials: [
        { name: "my_brass", usedByObjectCount: 0, textureNames: [], principled: { present: true, metallic: 0.4, roughness: 0.5, ior: 1.45, baseColor: [0.5, 0.5, 0.5], hasTexture: false, untouchedDefault: false } },
      ] as never,
    });
    const issues = runLint({
      contract: contract(),
      census: authoredOrphan,
      solved: { parts: [{ id: "prp_helm", file: "helm.glb" }] } as never,
    });
    // my_brass carries no import tag, so it is the author's — enforced.
    expect(issues.find((i) => i.code === ISSUE_CODES.METALLIC_VALUE && i.target === "my_brass")!.severity).toBe("error");
  });

  it("keeps an author's declared-unused material's WARNING even beside an override part", () => {
    // The orphan-attribution pass demotes a file part's own orphaned material to
    // info, but an author's separately DECLARED unused material is not that — it
    // is theirs to bind or delete. With an override part in the scene (which
    // arms the demotion), the declared material's W-344 must survive as a
    // warning, not be reclassified into an "imported asset" note.
    const mixed = census({
      objects: [
        { name: "prp_helm", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
      ],
      meshes: [{ object: "prp_helm", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"], materials: ["project_gold"] }],
      materials: [
        { name: "project_gold", usedByObjectCount: 1, textureNames: [], principled: { present: true, metallic: 0, roughness: 0.5, ior: 1.45, baseColor: [0.5, 0.5, 0.5], hasTexture: false, untouchedDefault: false } },
        // The import's OWN orphaned material (import-tagged) — should demote.
        { name: "helm_original", usedByObjectCount: 0, imported: true, textureNames: [], principled: { present: false } },
        // The AUTHOR's declared, unused material (untagged) — should stay a warning.
        { name: "my_brass", usedByObjectCount: 0, textureNames: [], principled: { present: false } },
      ] as never,
    });
    const issues = runLint({
      contract: contract(),
      census: mixed,
      solved: { parts: [{ id: "prp_helm", file: "helm.glb", material: "project_gold" }] } as never,
    });
    expect(issues.find((i) => i.code === ISSUE_CODES.MATERIAL_UNUSED && i.target === "helm_original")!.severity).toBe("info");
    expect(issues.find((i) => i.code === ISSUE_CODES.MATERIAL_UNUSED && i.target === "my_brass")!.severity).toBe("warning");
  });

  it("judges by the measured tag, not the name, when an import COLLIDES with an authored name", () => {
    // The killer case for name matching: the author declares 'gold', and a file
    // part imports an asset whose own material is also 'gold'. Blender enforces
    // unique datablock names, so ONE of them becomes 'gold.001' — and which one
    // depends on import order, not authorship. Name matching can misjudge both.
    // The import tag rides the DATABLOCK, so provenance is exact regardless of
    // which kept the bare name: the author's 'gold' is enforced, the import's
    // (here 'gold.001') is relaxed.
    const collide = census({
      objects: [
        { name: "prp_box", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
        { name: "prp_helm", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
      ],
      meshes: [
        { object: "prp_box", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"], materials: ["gold"] },
        { object: "prp_helm", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"], materials: ["gold.001"] },
      ],
      materials: [
        // The author's declared 'gold' kept the bare name — untagged, enforced.
        { name: "gold", usedByObjectCount: 1, textureNames: [], principled: { present: true, metallic: 0.4, roughness: 0.5, ior: 1.45, baseColor: [0.5, 0.5, 0.5], hasTexture: false, untouchedDefault: false } },
        // The import's own, uniquified to 'gold.001' — import-tagged, relaxed.
        { name: "gold.001", usedByObjectCount: 1, imported: true, textureNames: [], principled: { present: true, metallic: 0.4, roughness: 0.5, ior: 1.45, baseColor: [0.5, 0.5, 0.5], hasTexture: false, untouchedDefault: false } },
      ] as never,
    });
    const issues = runLint({
      contract: contract(),
      census: collide,
      solved: { parts: [{ id: "prp_helm", file: "helm.glb" }] } as never,
    });
    expect(issues.find((i) => i.code === ISSUE_CODES.METALLIC_VALUE && i.target === "gold")!.severity).toBe("error");
    expect(issues.find((i) => i.code === ISSUE_CODES.METALLIC_VALUE && i.target === "gold.001")!.severity).toBe("info");
  });

  it("keeps an imported material RELAXED even when the author reuses it on their own mesh", () => {
    // Provenance is about ORIGIN, not usage: a material the importer brought in
    // carries the third party's shading values, and the author cannot change a
    // baked `metallic 0.4` just by binding it to their own primitive. Importing
    // an asset FOR its materials (a material pack) is a legitimate pattern, so a
    // reused import material stays relaxed — enforcing it would demand the author
    // abandon a look they deliberately chose and cannot edit.
    const sharedCensus = census({
      objects: [
        { name: "prp_helm", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
        { name: "prp_authored", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
      ],
      meshes: [
        { object: "prp_helm", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"], materials: ["shared_metal"] },
        // An authored primitive also wears the imported material (material pack).
        { object: "prp_authored", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"], materials: ["shared_metal"] },
      ],
      materials: [
        {
          name: "shared_metal",
          usedByObjectCount: 2,
          imported: true, // the import's own — its values are the third party's
          textureNames: [],
          principled: { present: true, metallic: 0.4, roughness: 0.5, ior: 1.45, baseColor: [0.5, 0.5, 0.5], hasTexture: false, untouchedDefault: false },
        },
      ] as never,
    });
    const issues = runLint({
      contract: contract(),
      census: sharedCensus,
      solved: { parts: [{ id: "prp_helm", file: "helm.glb" }] } as never,
    });
    expect(issues.find((i) => i.code === ISSUE_CODES.METALLIC_VALUE)!.severity).toBe("info");
  });

  it("keeps an authored object's naming error even when an imported MATERIAL shares its name", () => {
    // Object and material names share a namespace. An authored object named
    // 'Cube' with an imported asset that happens to ship a material also named
    // 'Cube' must NOT have its naming finding relaxed: the object is the
    // author's, the material is the import's, and the two provenance sets are
    // kept apart precisely so the object rule cannot read the material's set.
    const collide = census({
      objects: [
        { name: "prp_helm", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
        { name: "Cube", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
      ],
      meshes: [
        { object: "prp_helm", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"], materials: ["Cube"] },
        { object: "Cube", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"], materials: [] },
      ],
      materials: [{ name: "Cube", usedByObjectCount: 1, imported: true, textureNames: [], principled: { present: false } }] as never,
    });
    // 'Cube' the material rides the imported helmet; 'Cube' the object is authored.
    const issues = runLint({
      contract: normalizeContract({ schemaVersion: 1, conventions: { naming: { forbidDefaultNames: true } } }),
      census: collide,
      solved: { parts: [{ id: "prp_helm", file: "helm.glb" }] } as never,
    });
    const naming = issues.find((i) => i.code === ISSUE_CODES.NAME_DEFAULT && i.target === "Cube");
    expect(naming).toBeDefined();
    expect(naming!.severity).toBe("error"); // authored object, not relaxed by the material
  });

  it("relaxes a z-fight only when BOTH sides are imported", () => {
    // Relation rules name a PAIR ("A <-> B"), so the posture asks about both.
    // A coincident plane between somebody else's asset and geometry this
    // project authored is this project's problem, and saying so is the point.
    const pair = census({
      objects: [
        { name: "imp_a", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
        { name: "imp_b", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
      ],
      meshes: [
        { object: "imp_a", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"] },
        { object: "imp_b", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"] },
      ],
      zFightingPairs: [{ a: "imp_a", b: "imp_b", faceCount: 2, area: 0.01 }],
    });
    // Both imported (whole-source import): a note.
    const both = runLint({ contract: contract(), census: pair, sourceKind: "mesh" });
    expect(both.find((i) => i.code === ISSUE_CODES.Z_FIGHTING)!.severity).toBe("info");

    // Only one side imported: still an error, because the author put the other
    // one there.
    const mixed = runLint({
      contract: contract(),
      census: pair,
      solved: { parts: [{ id: "imp_a", file: "a.glb" }] } as never,
    });
    expect(mixed.find((i) => i.code === ISSUE_CODES.Z_FIGHTING)!.severity).toBe("error");
  });

  it("relaxes hierarchy depth for a wholly-imported asset", () => {
    // A downloaded creature kit's tail is ten bones deep because its rigger
    // built it that way; restructuring it means editing somebody else's file.
    // Found on a real kit, where three E-306s failed the compile of an asset
    // the project had only dropped in.
    const chain = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const objects = chain.map((name, i) => ({
      name,
      type: "MESH",
      parent: i === 0 ? null : chain[i - 1]!,
      location: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      dimensions: [1, 1, 1],
      visible: true,
      hasMeshData: true,
    }));
    const args = { contract: contract(), census: census({ objects: objects as never }) };

    // Authored: still a hard error, unchanged.
    const authored = runLint(args);
    expect(authored.filter((i) => i.code === ISSUE_CODES.DEPTH_LIMIT).every((i) => i.severity === "error")).toBe(true);
    expect(authored.some((i) => i.code === ISSUE_CODES.DEPTH_LIMIT)).toBe(true);

    // The same objects, when the whole source IS the imported asset.
    const imported = runLint({ ...args, sourceKind: "mesh" });
    const depth = imported.filter((i) => i.code === ISSUE_CODES.DEPTH_LIMIT);
    expect(depth.length).toBeGreaterThan(0);
    for (const issue of depth) {
      expect(issue.severity).toBe("info");
      expect(issue.detail?.provenance).toBe("imported");
    }

    // ...unless the project stated an opinion about hierarchy — the specific
    // leaf DEPTH_LIMIT reads, `hierarchy.maxDepth`.
    const strict = runLint({ ...args, sourceKind: "mesh", authoredKeys: new Set(["hierarchy.maxDepth"]) });
    expect(strict.filter((i) => i.code === ISSUE_CODES.DEPTH_LIMIT).every((i) => i.severity === "error")).toBe(true);
  });

  it("lets an explicit KEY cancel the relaxation it governs, and only that rule", () => {
    const meshRow = {
      object: "prp_helm",
      verts: 200,
      faces: 300,
      ngons: 0,
      nonManifoldEdges: 124,
      zeroAreaFaces: 0,
      nan: false,
      uvLayers: [],
    };
    const args = {
      contract: contract(),
      census: census({ meshes: [meshRow] }),
      solved: { parts: [{ id: "prp_helm", file: "helm.glb" }] } as never,
    };
    // Writing the SPECIFIC leaf NON_MANIFOLD reads says you meant that rule —
    // for this asset too.
    const strict = runLint({ ...args, authoredKeys: new Set(["geometry.allowOpenMeshes"]) });
    expect(strict.find((i) => i.code === ISSUE_CODES.NON_MANIFOLD)!.severity).toBe("error");
    // ...and ONLY that rule: an unrelated leaf (even in the SAME block) leaves
    // NON_MANIFOLD relaxed.
    const unrelated = runLint({ ...args, authoredKeys: new Set(["geometry.allowNgons"]) });
    expect(unrelated.find((i) => i.code === ISSUE_CODES.NON_MANIFOLD)!.severity).toBe("info");
  });

  it("REGRESSION: a permissive geometry key must not re-strictify sibling geometry rules on imported geometry", () => {
    // The exact bug this key-granular posture replaces: `geometry.allowOpenMeshes:
    // true` is a RELAXING statement ("open meshes are fine"), but under the old
    // block-granular cancellation it cancelled the relaxation for every OTHER
    // geometry rule too — Z_FIGHTING, both scale rules, winding, double-verts,
    // zero-area — none of which the author said anything about. A relaxing edit
    // must never make the report louder.
    const meshRow = {
      object: "prp_helm",
      verts: 200,
      faces: 300,
      ngons: 0,
      nonManifoldEdges: 0,
      zeroAreaFaces: 1,
      doubleVertices: 3,
      inconsistentWindingEdges: 2,
      nan: false,
      uvLayers: [],
    };
    const objects = [
      { name: "prp_helm", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, -1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
      { name: "prp_helm2", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
    ];
    const args = {
      contract: contract(),
      census: census({
        objects: objects as never,
        meshes: [meshRow, { ...meshRow, object: "prp_helm2", doubleVertices: 0, inconsistentWindingEdges: 0 }],
        zFightingPairs: [{ a: "prp_helm", b: "prp_helm2", faceCount: 2, area: 0.01 }],
      }),
      solved: {
        parts: [
          { id: "prp_helm", file: "helm.glb" },
          { id: "prp_helm2", file: "helm2.glb" },
        ],
      } as never,
      // Author wrote ONLY the permissive `allowOpenMeshes` key.
      authoredKeys: new Set(["geometry.allowOpenMeshes"]),
    };
    const issues = runLint(args);
    for (const code of [
      ISSUE_CODES.Z_FIGHTING,
      ISSUE_CODES.NEGATIVE_SCALE,
      ISSUE_CODES.INCONSISTENT_WINDING,
      ISSUE_CODES.DOUBLE_VERTICES,
      ISSUE_CODES.ZERO_AREA_FACES,
    ]) {
      const issue = issues.find((i) => i.code === code);
      expect(issue, `${code} must still be reported`).toBeDefined();
      expect(issue!.severity, `${code} must stay relaxed — the author only wrote allowOpenMeshes`).toBe("info");
    }
  });

  it("cancels exactly the UV rule whose specific key was authored, leaving sibling UV relaxations intact", () => {
    const meshRow = {
      object: "prp_helm",
      verts: 200,
      faces: 300,
      ngons: 0,
      nonManifoldEdges: 0,
      zeroAreaFaces: 0,
      nan: false,
      uvLayers: ["UVMap"],
      materials: ["mtl_helm"] as string[],
      uv: {
        sampled: true,
        overlapFraction: 0.9, // way over the default 0.05 -> UV_OVERLAP
        flippedFaces: 5, // -> UV_FLIPPED
        outOfBoundsFraction: 0,
      },
    };
    const args = {
      contract: contract(),
      census: census({
        meshes: [meshRow as never],
        // A bound, textured material is what makes `needsUv` true (uv.ts
        // `textured.has(mesh.object)`) so the quality verdicts (overlap,
        // flipped) actually evaluate instead of being skipped under `require`.
        materials: [
          {
            name: "mtl_helm",
            usedByObjectCount: 1,
            textureNames: ["helm_diffuse.png"],
            principled: {
              present: true,
              metallic: 0,
              roughness: 0.5,
              ior: 1.45,
              baseColor: [0.8, 0.8, 0.8],
              hasTexture: true,
              untouchedDefault: false,
            },
          },
        ] as never,
      }),
      solved: { parts: [{ id: "prp_helm", file: "helm.glb" }] } as never,
    };
    // Author wrote ONLY uv.maxOverlapFraction.
    const issues = runLint({ ...args, authoredKeys: new Set(["uv.maxOverlapFraction"]) });
    expect(issues.find((i) => i.code === ISSUE_CODES.UV_OVERLAP)!.severity).toBe("warning");
    // UV_FLIPPED is governed by a DIFFERENT key (uv.allowFlipped) and stays relaxed.
    const flipped = issues.find((i) => i.code === ISSUE_CODES.UV_FLIPPED)!;
    expect(flipped.severity).toBe("info");
    expect(flipped.detail?.provenance).toBe("imported");
  });

  it("relaxes keyless rows (no governing contract field) regardless of ANY authored sibling", () => {
    // Z_FIGHTING and ZERO_AREA_FACES read no contract field at all
    // (lint/topology.ts fires them unconditionally), so they carry no `key`
    // in IMPORTED_RELAXATIONS and must relax no matter what else the author
    // wrote — even a sweeping authoredKeys set naming every other geometry
    // and uv leaf.
    const objects = [
      { name: "prp_a", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
      { name: "prp_b", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
    ];
    const meshRow = { object: "prp_a", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 2, nan: false, uvLayers: [] };
    const issues = runLint({
      contract: contract(),
      census: census({
        objects: objects as never,
        meshes: [meshRow, { ...meshRow, object: "prp_b", zeroAreaFaces: 0 }],
        zFightingPairs: [{ a: "prp_a", b: "prp_b", faceCount: 2, area: 0.01 }],
      }),
      solved: {
        parts: [
          { id: "prp_a", file: "a.glb" },
          { id: "prp_b", file: "b.glb" },
        ],
      } as never,
      authoredKeys: new Set([
        "geometry.allowOpenMeshes",
        "geometry.allowNgons",
        "geometry.allowLooseGeometry",
        "geometry.allowDoubleVertices",
        "geometry.allowInconsistentWinding",
        "geometry.allowNegativeScale",
        "geometry.requireAppliedScale",
        "uv.require",
        "uv.maxOverlapFraction",
      ]),
    });
    expect(issues.find((i) => i.code === ISSUE_CODES.Z_FIGHTING)!.severity).toBe("info");
    expect(issues.find((i) => i.code === ISSUE_CODES.ZERO_AREA_FACES)!.severity).toBe("info");
  });

  it("reports z-fighting pairs and empty meshes", () => {
    const issues = runLint({
      contract: contract(),
      census: census({
        zFightingPairs: [{ a: "prp_duplicate_a", b: "prp_duplicate_b", faceCount: 6, area: 1 }],
        meshes: [
          {
            object: "prp_cube",
            verts: 0,
            faces: 0,
            ngons: 0,
            nonManifoldEdges: 0,
            zeroAreaFaces: 0,
            nan: false,
            uvLayers: [],
          },
        ],
      }),
    });
    const codes = new Set(issues.map((i) => i.code));
    expect(codes.has(ISSUE_CODES.Z_FIGHTING)).toBe(true);
    expect(codes.has(ISSUE_CODES.EMPTY_MESH)).toBe(true);
  });

  it("says CONTACTS_UNCHECKED when the contact scan was skipped — empty never means clean (H2)", () => {
    // The nave exhibit: 91 meshes, contacts [] and contactsSkipped filled,
    // and no rule read it. An author placing a lintel by span had no measured
    // word on any joint, and the report said nothing about why.
    const issues = runLint({
      contract: contract(),
      census: census({
        contacts: [],
        contactsSkipped: ["scene has 91 meshes, above the 60-mesh contact limit"],
      }),
    });
    const hit = issues.find((i) => i.code === ISSUE_CODES.CONTACTS_UNCHECKED);
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("warning");
    expect(hit!.message).toContain("not measured");
    expect(hit!.detail).toMatchObject({ skipped: ["scene has 91 meshes, above the 60-mesh contact limit"] });
  });

  it("does not flag a genuinely clean contact scan", () => {
    // A scan that RAN and found nothing is a real "nothing touches" — the
    // warning exists only for the skipped case.
    const issues = runLint({
      contract: contract(),
      census: census({ contacts: [], contactsSkipped: [] }),
    });
    expect(issues.find((i) => i.code === ISSUE_CODES.CONTACTS_UNCHECKED)).toBeUndefined();
  });

  it("names partial contact coverage as an INFO note, never a warning", () => {
    // Some pairs measured, some skipped. The old pin here asserted total
    // silence, which made "measured, with holes" read exactly like
    // "measured completely" — a field audit found rest relationships
    // inside the holes with no contact word and no notice the word was
    // missing. What the old pin actually protected — no warning-level
    // doom for a scan that mostly ran — still holds: the note is info.
    const issues = runLint({
      contract: contract(),
      census: census({
        contacts: [{ a: "a", b: "b", gap: [0, 0, 0], separation: 0, intersects: true }],
        contactsSkipped: ["pair cap exceeded"],
      }),
    });
    const note = issues.find((i) => i.code === ISSUE_CODES.CONTACTS_UNCHECKED);
    expect(note).toBeDefined();
    expect(note!.severity).toBe("info");
    expect(note!.message).toContain("PARTIAL");
    expect(note!.detail?.skipped).toEqual(["pair cap exceeded"]);
  });

  it("flags bad metallic values, roughness range and untouched defaults", () => {
    const issues = runLint({
      contract: contract(),
      census: census({
        materials: [
          {
            name: "mtl_semi_metal",
            usedByObjectCount: 1,
            principled: {
              present: true,
              metallic: 0.5,
              roughness: 1.4,
              ior: 1.45,
              baseColor: [0.8, 0.8, 0.8],
              hasTexture: false,
              untouchedDefault: false,
            },
          },
          {
            name: "mtl_untouched",
            usedByObjectCount: 1,
            principled: {
              present: true,
              metallic: 0,
              roughness: 0.5,
              ior: 1.45,
              baseColor: [0.8, 0.8, 0.8],
              hasTexture: false,
              untouchedDefault: true,
            },
          },
          {
            name: "mtl_orphan",
            usedByObjectCount: 0,
            principled: { present: false, metallic: null, roughness: null, ior: null, baseColor: null, hasTexture: false, untouchedDefault: false },
          },
        ],
      }),
    });
    const codes = new Set(issues.map((i) => i.code));
    expect(codes.has(ISSUE_CODES.METALLIC_VALUE)).toBe(true);
    expect(codes.has(ISSUE_CODES.ROUGHNESS_RANGE)).toBe(true);
    expect(codes.has(ISSUE_CODES.UNTOUCHED_DEFAULT_MATERIAL)).toBe(true);
    expect(codes.has(ISSUE_CODES.MATERIAL_UNUSED)).toBe(true);
  });

  it("does not call two materials duplicate when only emission differs (PR-1)", () => {
    const base = {
      present: true as const,
      metallic: 0,
      roughness: 0.5,
      ior: 1.45,
      baseColor: [0.8, 0.8, 0.8] as [number, number, number],
      hasTexture: false,
      untouchedDefault: false,
    };
    const issues = runLint({
      contract: contract(),
      census: census({
        materials: [
          {
            name: "mtl_lamp_on",
            usedByObjectCount: 1,
            principled: { ...base, emission: [1, 0.8, 0.2], emissionStrength: 5 },
          },
          {
            name: "mtl_lamp_off",
            usedByObjectCount: 1,
            principled: { ...base, emission: [0, 0, 0], emissionStrength: 0 },
          },
        ],
      }),
    });
    // A glowing lamp and a dark one are not the same material; merging them
    // (the dedup hint's advice) would put the scene's light out.
    expect(issues.some((i) => i.code === ISSUE_CODES.DUPLICATE_MATERIALS)).toBe(false);
  });

  it("still flags genuinely-identical materials as duplicates", () => {
    const same = {
      present: true as const,
      metallic: 0,
      roughness: 0.5,
      ior: 1.45,
      baseColor: [0.8, 0.8, 0.8] as [number, number, number],
      hasTexture: false,
      untouchedDefault: false,
    };
    const issues = runLint({
      contract: contract(),
      census: census({
        materials: [
          { name: "mtl_a", usedByObjectCount: 1, principled: { ...same } },
          { name: "mtl_b", usedByObjectCount: 1, principled: { ...same } },
        ],
      }),
    });
    expect(issues.some((i) => i.code === ISSUE_CODES.DUPLICATE_MATERIALS)).toBe(true);
  });

  it("relaxes a duplicate SET only when EVERY member is imported, whatever the sort order", () => {
    // The duplicate finding names a group but its target is the name-sorted
    // first member. Relaxing on that one member alone made the whole set's
    // verdict hinge on a naming accident. A duplicate set is the import's fault
    // only if every material in it is the import's — mirroring the z-fight
    // pair's "both sides imported" rule.
    const same = {
      present: true as const, metallic: 0, roughness: 0.5, ior: 1.45,
      baseColor: [0.8, 0.8, 0.8] as [number, number, number], hasTexture: false, untouchedDefault: false,
    };
    // The IMPORTED member sorts FIRST — so group[0] is imported. If the posture
    // read only group[0] it would wrongly relax this authored redundancy.
    const mixed = runLint({
      contract: contract(),
      census: census({
        materials: [
          { name: "aaa_import", usedByObjectCount: 1, imported: true, principled: { ...same } },
          { name: "zzz_author", usedByObjectCount: 1, principled: { ...same } },
        ] as never,
      }),
    });
    const mixedHit = mixed.find((i) => i.code === ISSUE_CODES.DUPLICATE_MATERIALS)!;
    expect(mixedHit.severity).toBe("warning"); // an authored member is in the set

    // Every member imported: the duplication is the import's, so it relaxes.
    const allImported = runLint({
      contract: contract(),
      census: census({
        materials: [
          { name: "aaa_import", usedByObjectCount: 1, imported: true, principled: { ...same } },
          { name: "zzz_import", usedByObjectCount: 1, imported: true, principled: { ...same } },
        ] as never,
      }),
    });
    expect(allImported.find((i) => i.code === ISSUE_CODES.DUPLICATE_MATERIALS)!.severity).toBe("info");
  });

  it("flags textured objects without UVs and materials without binding", () => {
    const issues = runLint({
      contract: contract(),
      census: census({
        // Self-consistent: the mesh row and the aggregate list must agree —
        // the uv lint reads the mesh row as the primary record.
        meshes: [
          {
            object: "prp_cube",
            verts: 8,
            faces: 6,
            ngons: 0,
            nonManifoldEdges: 0,
            zeroAreaFaces: 0,
            nan: false,
            uvLayers: [],
          },
        ],
        uvObjectsWithoutLayers: ["prp_cube"],
        objectsWithoutMaterial: ["prp_cube"],
      }),
    });
    const codes = new Set(issues.map((i) => i.code));
    // Textured-without-UV is an ERROR under the default UV contract
    // (conventions.uv.require: "textured"); the legacy warning code only
    // fires when UV rules are switched off. One defect, one code.
    expect(codes.has(ISSUE_CODES.UV_MISSING)).toBe(true);
    expect(codes.has(ISSUE_CODES.TEXTURE_WITHOUT_UV)).toBe(false);
    expect(codes.has(ISSUE_CODES.OBJECT_WITHOUT_MATERIAL)).toBe(true);
  });

  it("does not flag a material-less mesh that shades from a colour attribute (W-345)", () => {
    // A low-poly / MagicaVoxel part carries vertex colours, not a material — a
    // real shading source, so "no material assigned" is a false positive.
    const meshRow = (hasColorAttribute: boolean) => ({
      object: "prp_voxel",
      verts: 8,
      faces: 6,
      ngons: 0,
      nonManifoldEdges: 0,
      zeroAreaFaces: 0,
      nan: false,
      uvLayers: [],
      hasColorAttribute,
    });
    const withColour = runLint({
      contract: contract(),
      census: census({ meshes: [meshRow(true)], objectsWithoutMaterial: ["prp_voxel"] }),
    });
    expect(new Set(withColour.map((i) => i.code)).has(ISSUE_CODES.OBJECT_WITHOUT_MATERIAL)).toBe(false);

    // The same mesh with no colour attribute IS unshaded — the rule still fires.
    const bare = runLint({
      contract: contract(),
      census: census({ meshes: [meshRow(false)], objectsWithoutMaterial: ["prp_voxel"] }),
    });
    expect(new Set(bare.map((i) => i.code)).has(ISSUE_CODES.OBJECT_WITHOUT_MATERIAL)).toBe(true);
  });

  it("flags missing camera, missing lights, off-camera objects and zero scale", () => {
    const issues = runLint({
      contract: contract(),
      census: census({
        camera: { present: false, name: null },
        lightCount: 0,
        offCameraObjects: [{ name: "prp_cube", beyond: "left of frame", ndcMin: [-0.4, 0.2] as [number, number], ndcMax: [-0.1, 0.5] as [number, number] }],
        objects: [
          {
            name: "prp_cube",
            type: "MESH",
            parent: null,
            location: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 0, 1],
            dimensions: [2, 0, 2],
            visible: true,
            hasMeshData: true,
          },
        ],
      }),
    });
    const codes = new Set(issues.map((i) => i.code));
    expect(codes.has(ISSUE_CODES.MISSING_CAMERA)).toBe(true);
    expect(codes.has(ISSUE_CODES.MISSING_LIGHTS)).toBe(true);
    expect(codes.has(ISSUE_CODES.OFF_CAMERA)).toBe(true);
    expect(codes.has(ISSUE_CODES.DEGENERATE_SCALE)).toBe(true);
  });

  it("names the failing turntable frames when the proof stage measured them (W-382)", () => {
    // The exhibit: a part that clears the hero still but falls out of orbit
    // frame 3. The census-level check measures ONE pose and reads as nonsense
    // ("it's right there in the render!"); the turntable's own measurement
    // names the frame, which turns the fix from "move the part" into "widen
    // the framing".
    const issues = runLint({
      contract: contract(),
      census: census({}),
      offByFrame: [
        { frame: 3, objects: ["prp_moot_spot_a", "prp_foot_r"] },
        { frame: 7, objects: ["prp_moot_spot_a"] },
      ],
    });
    const hits = issues.filter((i) => i.code === ISSUE_CODES.OFF_CAMERA && i.detail?.frames);
    expect(hits).toHaveLength(2);
    const spot = hits.find((i) => i.target === "prp_moot_spot_a")!;
    expect(spot.message).toContain("2 turntable frame(s)");
    expect(spot.message).toContain("#3, #7");
    expect(spot.hint).toContain("widen the framing");
    expect(spot.detail).toMatchObject({ frames: [3, 7] });
  });

  it("does not double-report an object both census and turntable flagged", () => {
    // Same code, same object, same fix — two rows would print the fix twice
    // under two spellings. The frame-carrying turntable row is the richer
    // evidence (the census cannot know WHICH orbit angle lost it), so it
    // stands alone and the census-level row is dropped.
    const issues = runLint({
      contract: contract(),
      census: census({ offCameraObjects: [{ name: "prp_far", beyond: "left of frame", ndcMin: [-0.4, 0.2] as [number, number], ndcMax: [-0.1, 0.5] as [number, number] }] }),
      offByFrame: [{ frame: 1, objects: ["prp_far"] }],
    });
    const hits = issues.filter((i) => i.code === ISSUE_CODES.OFF_CAMERA && i.target === "prp_far");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.message).toContain("turntable frame");
    expect(hits[0]!.detail).toMatchObject({ frames: [1] });
  });

  it("keeps the census-level off-camera row when the turntable never lost the object", () => {
    // The drop above is scoped to objects the turntable ALSO flagged; an
    // object off the hero camera but inside every orbit frame keeps its
    // census-level finding.
    const issues = runLint({
      contract: contract(),
      census: census({ offCameraObjects: [{ name: "prp_far", beyond: "left of frame", ndcMin: [-0.4, 0.2] as [number, number], ndcMax: [-0.1, 0.5] as [number, number] }] }),
      offByFrame: [{ frame: 1, objects: ["prp_other"] }],
    });
    const far = issues.filter((i) => i.code === ISSUE_CODES.OFF_CAMERA && i.target === "prp_far");
    expect(far).toHaveLength(1);
    expect(far[0]!.message).toContain("entirely left of frame");
  });

  it("attributes an orphaned material to the override only when every file part is overridden", () => {
    // One file part, overridden: attribution is unambiguous and names it.
    const orphanCensus = () =>
      census({
        materials: [
          {
            name: "fox_material",
            usedByObjectCount: 0,
            imported: true, // fox.glb's own, orphaned by the gold override
            textureNames: [],
            principled: { present: false },
          },
        ] as never,
      });
    const sole = runLint({
      contract: contract(),
      census: orphanCensus(),
      solved: { parts: [{ id: "prp_fox", file: "fox.glb", material: "gold" }] } as never,
    });
    const soleHit = sole.find((i) => i.code === ISSUE_CODES.MATERIAL_UNUSED)!;
    expect(soleHit.severity).toBe("info");
    expect(soleHit.message).toContain("orphaned by the material override on 'prp_fox'");
  });

  it("leaves the blame open when a plain file part could equally have shipped the orphan", () => {
    // Two file parts, only one overridden: the census cannot say which
    // import the unused material came from, so pinning it on the override
    // would misattribute it. Still info (a non-authored material on the
    // spec path can only come from an import), but the message states the
    // ambiguity instead of naming the wrong part.
    const mixed = runLint({
      contract: contract(),
      census: census({
        materials: [
          {
            name: "helmet_glass",
            usedByObjectCount: 0,
            imported: true, // an import's own, orphaned; which import is ambiguous
            textureNames: [],
            principled: { present: false },
          },
        ] as never,
      }),
      solved: {
        parts: [
          { id: "prp_fox", file: "fox.glb", material: "gold" },
          { id: "prp_helm", file: "helm.glb" },
        ],
      } as never,
    });
    const hit = mixed.find((i) => i.code === ISSUE_CODES.MATERIAL_UNUSED)!;
    expect(hit.severity).toBe("info");
    expect(hit.message).toContain("either orphaned by the material override on 'prp_fox'");
    expect(hit.message).toContain("never bound by its own import");
    expect(hit.message).not.toContain("wholesale replacement is the documented behaviour");
  });

  it("checks hierarchy depth from the census parent chain for build.py/spec scenes (N-2)", () => {
    // No primTree (a scene.json/build.py scene). A chain deeper than maxDepth
    // (8) must still be caught — via census parents, not by dragging the
    // export's structure into naming.
    const chain = Array.from({ length: 11 }, (_, i) => ({
      name: `prp_link_${i}`,
      type: "MESH",
      parent: i === 0 ? null : `prp_link_${i - 1}`,
      location: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
      dimensions: [1, 1, 1] as [number, number, number],
      visible: true,
      hasMeshData: true,
    }));
    const issues = runLint({ contract: contract(), census: census({ objects: chain }) });
    const depthHits = issues.filter((i) => i.code === ISSUE_CODES.DEPTH_LIMIT);
    expect(depthHits.length).toBeGreaterThan(0);
    // The deepest link is at depth 11 > 8.
    expect(depthHits.some((i) => i.target === "prp_link_10")).toBe(true);
  });

  it("does not flag a shallow census hierarchy (N-2)", () => {
    const flat = [
      { name: "prp_a", type: "MESH", parent: null },
      { name: "prp_b", type: "MESH", parent: "prp_a" },
    ].map((o) => ({
      ...o,
      location: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
      dimensions: [1, 1, 1] as [number, number, number],
      visible: true,
      hasMeshData: true,
    }));
    const issues = runLint({ contract: contract(), census: census({ objects: flat }) });
    expect(issues.some((i) => i.code === ISSUE_CODES.DEPTH_LIMIT)).toBe(false);
  });

  it("flags newly-covered Blender default object names (N-1)", () => {
    for (const name of ["Armature", "Icosphere", "Lattice", "Speaker", "Suzanne"]) {
      const issues = runLint({
        contract: contract(),
        census: census({
          objects: [
            {
              name,
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
        }),
      });
      expect(issues.some((i) => i.code === ISSUE_CODES.NAME_DEFAULT && i.target === name)).toBe(true);
    }
  });

  it("judges scale degeneracy on the raw magnitude and reports it (B-2)", () => {
    // A 1e-9 axis: the rounded scale reads [0,1,1] (hiding the magnitude), but
    // degeneracy must be judged on — and reported as — the true 1e-9.
    const issues = runLint({
      contract: contract(),
      census: census({
        objects: [
          {
            name: "prp_flat",
            type: "MESH",
            parent: null,
            location: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [0, 1, 1], // R6-collapsed
            scaleRaw: [1e-9, 1, 1], // true magnitude
            dimensions: [0, 1, 1],
            visible: true,
            hasMeshData: true,
          },
        ],
      }),
    });
    const degen = issues.find((i) => i.code === ISSUE_CODES.DEGENERATE_SCALE);
    expect(degen).toBeDefined();
    expect((degen!.detail as { scale: number[] }).scale[0]).toBe(1e-9);
  });

  it("warns that a hidden mesh still ships (B-3)", () => {
    const issues = runLint({
      contract: contract(),
      census: census({
        objects: [
          {
            name: "prp_helper",
            type: "MESH",
            parent: null,
            location: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            dimensions: [1, 1, 1],
            visible: false,
            hasMeshData: true,
          },
        ],
      }),
    });
    expect(issues.some((i) => i.code === ISSUE_CODES.HIDDEN_MESH && i.target === "prp_helper")).toBe(true);
  });

  it("warns that a too-dense mesh's doubles went unchecked (B-5)", () => {
    const issues = runLint({
      contract: contract(),
      census: census({
        meshes: [
          {
            object: "prp_dense",
            verts: 300000,
            faces: 100000,
            ngons: 0,
            nonManifoldEdges: 0,
            zeroAreaFaces: 0,
            nan: false,
            uvLayers: ["UVMap"],
            doublesSampled: false, // over the cap — count omitted
          },
        ],
      }),
    });
    expect(issues.some((i) => i.code === ISSUE_CODES.DOUBLE_VERTICES_UNCHECKED)).toBe(true);
  });

  it("does not warn about doubles when the pass DID run (B-5)", () => {
    const issues = runLint({
      contract: contract(),
      census: census({
        meshes: [
          {
            object: "prp_ok",
            verts: 8,
            faces: 6,
            ngons: 0,
            nonManifoldEdges: 0,
            zeroAreaFaces: 0,
            nan: false,
            uvLayers: ["UVMap"],
            doublesSampled: true,
            doubleVertices: 0,
          },
        ],
      }),
    });
    expect(issues.some((i) => i.code === ISSUE_CODES.DOUBLE_VERTICES_UNCHECKED)).toBe(false);
  });

  it("flags non-uniform scale", () => {
    const issues = runLint({
      contract: contract(),
      census: census({
        objects: [
          {
            name: "prp_cube",
            type: "MESH",
            parent: null,
            location: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 2, 1],
            dimensions: [2, 4, 2],
            visible: true,
            hasMeshData: true,
          },
        ],
      }),
    });
    expect(issues.some((i) => i.code === ISSUE_CODES.NON_UNIFORM_SCALE)).toBe(true);
  });

  it("honours requireAppliedScale:false for NON-uniform scale too", () => {
    // Non-uniform and uniform unapplied scale are one defect with one remedy
    // ("apply scale before export"), and applied scale reads as (1,1,1) — so
    // neither can fire on a mesh whose transform IS applied. Gating only the
    // uniform branch meant a squashed rock in an imported kit still demanded
    // applied scale 104 times in a project that had said not to ask.
    const squashed = census({
      objects: [
        {
          name: "prp_rock",
          type: "MESH",
          parent: null,
          location: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 0.45],
          dimensions: [2, 2, 0.9],
          visible: true,
          hasMeshData: true,
        },
      ],
    });
    const strict = runLint({ contract: contract(), census: squashed });
    expect(strict.some((i) => i.code === ISSUE_CODES.NON_UNIFORM_SCALE)).toBe(true);

    const relaxed = runLint({
      contract: normalizeContract({
        schemaVersion: 1,
        conventions: { geometry: { requireAppliedScale: false } },
      }),
      census: squashed,
    });
    expect(relaxed.some((i) => i.code === ISSUE_CODES.NON_UNIFORM_SCALE)).toBe(false);
    expect(relaxed.some((i) => i.code === ISSUE_CODES.UNAPPLIED_SCALE)).toBe(false);

    // Negative scale keeps its own gate — flipped winding is a worse problem.
    const mirrored = runLint({
      contract: normalizeContract({
        schemaVersion: 1,
        conventions: { geometry: { requireAppliedScale: false } },
      }),
      census: census({
        objects: [
          {
            name: "prp_rock",
            type: "MESH",
            parent: null,
            location: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, -1],
            dimensions: [2, 2, 2],
            visible: true,
            hasMeshData: true,
          },
        ],
      }),
    });
    expect(mirrored.some((i) => i.code === ISSUE_CODES.NEGATIVE_SCALE)).toBe(true);
  });

  it("relaxes negative scale on imported geometry, not on authored geometry", () => {
    // Mirrored limbs via negative scale are commonplace in real FBX/GLB
    // exports (a rigger mirrors an arm by flipping its transform), so the
    // inspection posture should note it, not hard-fail the compile.
    const mirroredCensus = census({
      objects: [
        {
          name: "prp_arm_l",
          type: "MESH",
          parent: null,
          location: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, -1],
          dimensions: [1, 1, 1],
          visible: true,
          hasMeshData: true,
        },
      ],
    });

    // Authored: still a hard error, unchanged.
    const authored = runLint({ contract: contract(), census: mirroredCensus });
    const authoredIssue = authored.find((i) => i.code === ISSUE_CODES.NEGATIVE_SCALE);
    expect(authoredIssue?.severity).toBe("error");
    expect(authoredIssue?.detail?.provenance).toBeUndefined();

    // The same object, marked as a `file:`-imported part.
    const imported = runLint({
      contract: contract(),
      census: mirroredCensus,
      solved: { parts: [{ id: "prp_arm_l", file: "arm.fbx" }] } as never,
    });
    const importedIssue = imported.find((i) => i.code === ISSUE_CODES.NEGATIVE_SCALE);
    expect(importedIssue, "NEGATIVE_SCALE must still be reported").toBeDefined();
    expect(importedIssue!.severity).toBe("info");
    expect(importedIssue!.detail?.provenance).toBe("imported");
    expect(imported.some((i) => i.severity === "error" && i.code === ISSUE_CODES.NEGATIVE_SCALE)).toBe(false);
  });
});