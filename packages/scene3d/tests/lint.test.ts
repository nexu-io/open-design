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