// The manifest is the machine-readable half of every compile result: the kit
// page, the sidecar, the report and the roll-up all read it. Two fields added
// for readers who cannot open a PNG or see a render — per-frame proof
// measurements and contact connectivity — are derived here from facts the
// census already measured. These pins hold both derivations to their
// contracts: arithmetic, not verdicts.

import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildManifest, writeProjectKit } from "../src/manifest.js";
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

describe("writeProjectKit sidecar truncation flags", () => {
  /**
   * The host caps artifact metadata at 16KB and drops the whole manifest
   * when it overflows — silently demoting a large kit to a plain HTML page.
   * The sidecar therefore truncates its scene list and deliverable list and
   * FLAGS the truncation. These pins hold both flags to their contract:
   * false only when nothing was dropped, true whenever anything was, and
   * the kept rows always being a prefix of the full set (a panel that says
   * "showing a subset" must actually be showing a subset).
   */
  const SCENE_MANIFEST = (glbName: string) => ({
    assetKind: "scene",
    partTree: [{ name: "prp_a" }],
    metrics: { totalTriangles: 12 },
    issues: { errors: 0, warnings: 0 },
    issueCodes: [] as string[],
    exportedAssets: [`out/${glbName}.glb`],
  });

  function projectWithScenes(root: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const dir = path.join(root, `scene_${String(i).padStart(2, "0")}`, "out");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(SCENE_MANIFEST(`s${i}`)));
      fs.writeFileSync(path.join(dir, "scene.glb"), "bytes");
    }
  }

  function readSidecar(root: string): Record<string, any> {
    return JSON.parse(fs.readFileSync(path.join(root, "kit.html.artifact.json"), "utf8"));
  }

  it("flags deliverablesTruncated when one scene's exports overflow the cap", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "od-kit-trunc-"));
    try {
      const dir = path.join(root, "big", "out");
      fs.mkdirSync(dir, { recursive: true });
      // One scene whose deliverables alone exceed MAX_KIT_DELIVERABLES (192).
      // A .glb must be present: a scene without one is not a kit entry.
      const manifest = {
        ...SCENE_MANIFEST("s0"),
        exportedAssets: ["out/scene.glb", ...Array.from({ length: 200 }, (_, i) => `out/tex_${i}.png`)],
      };
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
      writeProjectKit(root);
      const sidecar = readSidecar(root);
      expect(sidecar.metadata.scenesTruncated).toBe(false); // one scene, kept whole
      expect(sidecar.metadata.deliverablesTruncated).toBe(true);
      expect(sidecar.metadata.deliverables).toHaveLength(192);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps both flags false on a small kit — no false truncation alarms", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "od-kit-small-"));
    try {
      projectWithScenes(root, 3);
      writeProjectKit(root);
      const sidecar = readSidecar(root);
      expect(sidecar.metadata.scenesTruncated).toBe(false);
      expect(sidecar.metadata.deliverablesTruncated).toBe(false);
      expect(sidecar.metadata.scenes).toHaveLength(3);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("truncates the scene list at the cap and keeps a prefix of it", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "od-kit-scenes-"));
    try {
      // MAX_KIT_SCENES is 48; build 50 so two must fold away.
      projectWithScenes(root, 50);
      writeProjectKit(root);
      const sidecar = readSidecar(root);
      expect(sidecar.metadata.scenesTruncated).toBe(true);
      expect(sidecar.metadata.scenes.length).toBeLessThan(50);
      // Every kept row carries its counts — truncation drops rows, never
      // empties them into placeholders.
      for (const scene of sidecar.metadata.scenes) {
        expect(typeof scene.parts).toBe("number");
        expect(Array.isArray(scene.scenePath)).toBe(false);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
