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

  it("relaxes findings about an imported asset's MATERIALS, not just its objects", () => {
    // Calibration against the Khronos corpus found this: OrientationTest, a
    // model whose entire purpose is to be correct, failed with six metallic
    // errors. The posture held OBJECT names, and metallic is reported against
    // a MATERIAL — so a material-level finding could never match, and the
    // relaxation silently covered half the surface it claimed to.
    const census2 = census({
      objects: [
        { name: "Mesh", type: "MESH", parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], dimensions: [1, 1, 1], visible: true, hasMeshData: true },
      ],
      meshes: [{ object: "Mesh", verts: 8, faces: 6, ngons: 0, nonManifoldEdges: 0, zeroAreaFaces: 0, nan: false, uvLayers: ["UVMap"], materials: ["MatX1"] }],
      materials: [
        {
          name: "MatX1",
          usedByObjectCount: 1,
          textureNames: [],
          principled: {
            present: true,
            metallic: 0.4, // the value OrientationTest ships, and is correct with
            roughness: 0.5,
            ior: 1.45,
            baseColor: [0.5, 0.5, 0.5],
            hasTexture: false,
            untouchedDefault: false,
          },
        },
      ] as never,
    });
    const authored = runLint({ contract: contract(), census: census2 });
    expect(authored.find((i) => i.code === ISSUE_CODES.METALLIC_VALUE)!.severity).toBe("error");

    const imported = runLint({ contract: contract(), census: census2, sourceKind: "mesh" });
    const metallic = imported.find((i) => i.code === ISSUE_CODES.METALLIC_VALUE)!;
    expect(metallic.severity).toBe("info");
    expect(metallic.detail?.provenance).toBe("imported");
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
        offCameraObjects: ["prp_cube"],
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
      census: census({ offCameraObjects: ["prp_far"] }),
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
      census: census({ offCameraObjects: ["prp_far"] }),
      offByFrame: [{ frame: 1, objects: ["prp_other"] }],
    });
    const far = issues.filter((i) => i.code === ISSUE_CODES.OFF_CAMERA && i.target === "prp_far");
    expect(far).toHaveLength(1);
    expect(far[0]!.message).toContain("outside the camera frustum");
  });

  it("attributes an orphaned material to the override only when every file part is overridden", () => {
    // One file part, overridden: attribution is unambiguous and names it.
    const orphanCensus = () =>
      census({
        materials: [
          {
            name: "fox_material",
            usedByObjectCount: 0,
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