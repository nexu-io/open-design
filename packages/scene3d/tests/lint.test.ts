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
    upAxis: "Y",
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
    ]) {
      const issue = byCode.get(code);
      expect(issue, `${code} must still be reported`).toBeDefined();
      expect(issue!.severity).toBe("info"); // relaxed, and says so
      expect(issue!.detail?.provenance).toBe("imported");
    }
    // Real defects are untouched: an ngon or a zero-area face is wrong in
    // anybody's asset, so provenance buys it nothing.
    for (const code of [ISSUE_CODES.NGONS, ISSUE_CODES.ZERO_AREA_FACES]) {
      const issue = byCode.get(code);
      expect(issue, `${code} must still fire`).toBeDefined();
      expect(issue!.severity).not.toBe("info");
      expect(issue!.detail?.provenance).toBeUndefined();
    }
    expect(imported.some((i) => i.severity === "error" && i.code === ISSUE_CODES.NON_MANIFOLD)).toBe(false);
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
    const imported = runLint({ ...args, allImported: true });
    const depth = imported.filter((i) => i.code === ISSUE_CODES.DEPTH_LIMIT);
    expect(depth.length).toBeGreaterThan(0);
    for (const issue of depth) {
      expect(issue.severity).toBe("info");
      expect(issue.detail?.provenance).toBe("imported");
    }

    // ...unless the project stated an opinion about hierarchy.
    const strict = runLint({ ...args, allImported: true, authoredBlocks: new Set(["hierarchy"]) });
    expect(strict.filter((i) => i.code === ISSUE_CODES.DEPTH_LIMIT).every((i) => i.severity === "error")).toBe(true);
  });

  it("lets an explicit convention block cancel the relaxation it governs", () => {
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
    // Writing in `geometry` says you meant its rules — for this asset too.
    const strict = runLint({ ...args, authoredBlocks: new Set(["geometry"]) });
    expect(strict.find((i) => i.code === ISSUE_CODES.NON_MANIFOLD)!.severity).toBe("error");
    // ...and ONLY its rules: an unrelated block leaves geometry relaxed.
    const unrelated = runLint({ ...args, authoredBlocks: new Set(["print"]) });
    expect(unrelated.find((i) => i.code === ISSUE_CODES.NON_MANIFOLD)!.severity).toBe("info");
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
});