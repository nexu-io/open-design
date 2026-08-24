// The manifest is the machine-readable half of every compile result: the kit
// page, the sidecar, the report and the roll-up all read it. Two fields added
// for readers who cannot open a PNG or see a render — per-frame proof
// measurements and contact connectivity — are derived here from facts the
// census already measured. These pins hold both derivations to their
// contracts: arithmetic, not verdicts.

import { describe, expect, it } from "vitest";
import { buildManifest } from "../src/manifest.js";
import { Census, Issue, Scene3dManifest } from "../src/types.js";

const issues: Issue[] = [];
const summary = { errors: 0, warnings: 0, infos: 0 };
const source = { kind: "bpy" as const, files: ["build.py"] };

function mesh(name: string): Census["meshes"][number] {
  return {
    object: name,
    verts: 8,
    faces: 6,
    ngons: 0,
    nonManifoldEdges: 0,
    zeroAreaFaces: 0,
    nan: false,
    uvLayers: [],
  };
}

function censusWith(
  meshes: string[],
  contacts: Array<[string, string]> = [],
): Census {
  return {
    blenderVersion: "5.0.1",
    sceneName: "Scene",
    objects: meshes.map((name) => ({
      name,
      type: "MESH",
      parent: null,
      location: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      dimensions: [1, 1, 1],
      visible: true,
      hasMeshData: true,
    })),
    meshes: meshes.map(mesh),
    materials: [],
    textures: [],
    uvObjectsWithoutLayers: [],
    objectsWithoutMaterial: [],
    zFightingPairs: [],
    // Present even with no pairs: an empty contacts list is a MEASURED
    // "nothing touches anything", which is exactly the fact the
    // all-isolated cases below assert on. Omitting it would read as an
    // older census that never scanned.
    contacts: contacts.map(([a, b]) => ({
      a,
      b,
      gap: [0, 0, 0] as [number, number, number],
      separation: 0,
      intersects: false,
    })),
    camera: { present: false, name: null },
    lightCount: 0,
    animation: { fps: 24, frameStart: 1, frameEnd: 24, keyframedObjects: [] },
    offCameraObjects: [],
  };
}

function manifestWith(input: Partial<Parameters<typeof buildManifest>[0]>) {
  return buildManifest({
    source,
    issues,
    summary,
    proofImages: [],
    exportedAssets: [],
    blenderUsed: true,
    blenderVersion: "5.0.1",
    ...input,
  });
}

describe("buildManifest connectivity", () => {
  it("derives touching vs isolated from the census contacts", () => {
    // Three parts, one contact pair: two touch, one is an island.
    const m = manifestWith({
      census: censusWith(["prp_base", "prp_crate", "prp_orb"], [["prp_base", "prp_crate"]]),
    });
    expect(m.connectivity).toEqual({
      touching: 2,
      isolated: 1,
      isolatedParts: ["prp_orb"],
    });
  });

  it("counts a part touching several others once", () => {
    // Connectivity is about the part, not the pair count — a hub in a
    // machine touches five things and is still one connected part.
    const m = manifestWith({
      census: censusWith(
        ["hub", "spoke_a", "spoke_b"],
        [
          ["hub", "spoke_a"],
          ["hub", "spoke_b"],
        ],
      ),
    });
    expect(m.connectivity).toEqual({ touching: 3, isolated: 0, isolatedParts: [] });
  });

  it("omits the field entirely when there is no census", () => {
    // Absent means "not measured" (no Blender run); an all-connected field
    // would mean "measured and clean". The distinction is load-bearing for
    // readers deciding whether the fact is trustworthy.
    expect(manifestWith({}).connectivity).toBeUndefined();
  });

  it("omits the field when the census predates the contact scan", () => {
    // An older runner writes no `contacts` at all — same posture as above:
    // never render absence of measurement as a clean bill of health.
    const c = censusWith(["solo"]);
    delete (c as { contacts?: unknown }).contacts;
    expect(manifestWith({ census: c }).connectivity).toBeUndefined();
  });

  it("reports a fully connected scene with isolated 0", () => {
    const m = manifestWith({
      census: censusWith(["a", "b"], [["a", "b"]]),
    });
    expect(m.connectivity).toEqual({ touching: 2, isolated: 0, isolatedParts: [] });
  });

  it("caps the isolated name list but keeps the true count", () => {
    // The point is the COUNT plus enough names to start looking; thirteen
    // islands must not bloat a sidecar capped at 16KB.
    const names = Array.from({ length: 13 }, (_, i) => `part_${i}`);
    const m = manifestWith({ census: censusWith(names) });
    expect(m.connectivity!.isolated).toBe(13);
    expect(m.connectivity!.isolatedParts).toHaveLength(12);
    expect(m.connectivity!.isolatedParts[0]).toBe("part_0");
  });

  it("sorts the isolated names so the list is stable across runs", () => {
    const m = manifestWith({ census: censusWith(["zeta", "alpha"]) });
    expect(m.connectivity!.isolatedParts).toEqual(["alpha", "zeta"]);
  });
});

describe("buildManifest proofFrames", () => {
  const frames = [
    { path: "/tmp/proof-000.png", meanLuminance: 0.35, coverage: 0.4, blownRatio: 0 },
    { path: "/tmp/proof-001.png", meanLuminance: 0.31, coverage: 0.38, blownRatio: 0.01 },
  ];

  it("carries the per-frame measurements through to the manifest", () => {
    expect(manifestWith({ proofFrames: frames }).proofFrames).toEqual(frames);
  });

  it("omits the field when no frame was measured", () => {
    // Same absent-vs-empty discipline as connectivity: no proof stage is
    // not the same fact as "rendered and empty".
    expect(manifestWith({}).proofFrames).toBeUndefined();
    expect(
      manifestWith({ proofFrames: [] as Scene3dManifest["proofFrames"] }).proofFrames,
    ).toBeUndefined();
  });
});
