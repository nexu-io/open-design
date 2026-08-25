import { describe, expect, it } from "vitest";
import { lintWorld } from "../src/lint/world.js";
import { normalizeContract } from "../src/contract.js";
import { Census, Issue, Scene3dContract } from "../src/types.js";

function census(
  objects: Array<{ name: string; min: number; tris?: number; type?: string }>,
): Census {
  return {
    blenderVersion: "5.0.1",
    sceneName: "Scene",
    objects: objects.map((o) => ({
      name: o.name,
      type: o.type ?? "MESH",
      parent: null,
      location: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      dimensions: [1, 1, 1],
      visible: true,
      hasMeshData: (o.type ?? "MESH") === "MESH",
      worldMin: [0, 0, o.min],
      worldMax: [1, 1, o.min + 1],
    })),
    meshes: objects
      .filter((o) => (o.type ?? "MESH") === "MESH")
      .map((o) => ({
        object: o.name,
        verts: 8,
        faces: 6,
        tris: o.tris ?? 12,
        ngons: 0,
        nonManifoldEdges: 0,
        zeroAreaFaces: 0,
        nan: false,
        uvLayers: ["UVMap"],
        // Real censuses always carry the vertex-exact spatial for real
        // geometry (it is null only for empty/all-loose meshes), and
        // grounding refuses to judge without it — so the fixture ships it.
        spatial: {
          worldMin: [0, 0, o.min] as [number, number, number],
          worldMax: [1, 1, o.min + 1] as [number, number, number],
          size: [1, 1, 1] as [number, number, number],
          bboxCenter: [0.5, 0.5, o.min + 0.5] as [number, number, number],
          centroid: [0.5, 0.5, o.min + 0.5] as [number, number, number],
          groundGap: o.min,
        },
      })),
    materials: [],
    textures: [],
    uvObjectsWithoutLayers: [],
    objectsWithoutMaterial: [],
    zFightingPairs: [],
    camera: { present: true, name: "cam" },
    lightCount: 1,
    animation: { fps: 24, frameStart: 1, frameEnd: 1, keyframedObjects: [] },
    offCameraObjects: [],
  };
}

function codes(contract: Scene3dContract, c: Census): string[] {
  const issues: Issue[] = [];
  lintWorld(normalizeContract(contract), c, issues);
  return issues.map((i) => i.code);
}

const grounded: Scene3dContract = {
  schemaVersion: 1,
  conventions: { grounding: { enabled: true, tolerance: 0.005 } },
};

describe("grounding", () => {
  it("is off unless a project opts in", () => {
    // A scene composed in world space is legitimately not ground-anchored,
    // so the rule must not fire on projects that never asked for it.
    expect(codes({ schemaVersion: 1 }, census([{ name: "prp_a", min: 4 }]))).toEqual([]);
  });

  it("passes a part resting on the ground plane", () => {
    expect(codes(grounded, census([{ name: "prp_a", min: 0 }]))).toEqual([]);
  });

  it("warns when a part floats", () => {
    expect(codes(grounded, census([{ name: "prp_a", min: 0.04 }]))).toEqual(["S3D-W-325"]);
  });

  it("errors when a part sinks through the ground", () => {
    expect(codes(grounded, census([{ name: "prp_a", min: -0.04 }]))).toEqual(["S3D-E-325"]);
  });

  it("forgives chamfer bleed inside the tolerance", () => {
    expect(codes(grounded, census([{ name: "prp_a", min: 0.004 }]))).toEqual([]);
    expect(codes(grounded, census([{ name: "prp_a", min: -0.004 }]))).toEqual([]);
  });

  it("honours a declared exemption by exact name and by prefix", () => {
    // The exemption list is the documentation: an asset that dips below zero
    // has to say so out loud rather than the rule silently not applying.
    const contract: Scene3dContract = {
      schemaVersion: 1,
      conventions: { grounding: { enabled: true, exempt: ["mount_", "prp_bedded_rock"] } },
    };
    expect(
      codes(
        contract,
        census([
          { name: "mount_bracket", min: 1.8 },
          { name: "prp_bedded_rock", min: -0.3 },
        ]),
      ),
    ).toEqual([]);
  });

  it("ignores non-mesh objects", () => {
    expect(
      codes(grounded, census([{ name: "lgt_key", min: 6, type: "LIGHT" }])),
    ).toEqual([]);
  });

  it("measures grounding from the vertex-exact spatial, not the object AABB (B-1)", () => {
    // A rotated plank: its bounding box min-z dips below the floor (the AABB of
    // an OBB does), but its actual lowest VERTEX rests on it. The vertex-based
    // claims.grounded passes it, so the AABB-based world grounding must not
    // contradict by reporting a sink.
    const c = census([{ name: "prp_plank", min: -0.05 }]);
    c.meshes[0]!.spatial = {
      worldMin: [0, 0, 0.001],
      worldMax: [1, 1, 1],
      size: [1, 1, 1],
      bboxCenter: [0.5, 0.5, 0.5],
      centroid: [0.5, 0.5, 0.5],
      groundGap: 0.001, // vertices rest on the floor within tolerance
    };
    expect(codes(grounded, c)).toEqual([]);
  });

  it("degrades to a named note — never a verdict from the AABB — when the vertex-exact spatial is missing", () => {
    // A mesh with no spatial (empty/all-loose geometry) used to be judged on
    // object.worldMin — the exact AABB-of-the-OBB measure the module's own
    // header rules out, so a canted part could be called sunk by an
    // instrument the vertex-based claims.grounded disagrees with.
    const c = census([{ name: "prp_shard", min: -0.05 }]);
    c.meshes[0]!.spatial = null;
    const issues: Issue[] = [];
    lintWorld(normalizeContract(grounded), c, issues);
    const grounding = issues.filter(
      (i) => i.code === "S3D-W-325" || i.code === "S3D-E-325",
    );
    expect(grounding).toHaveLength(1);
    expect(grounding[0]!.code).toBe("S3D-W-325");
    expect(grounding[0]!.severity).toBe("info");
    expect(grounding[0]!.message).toContain("not judged");
    expect(grounding[0]!.detail).toMatchObject({ unmeasured: true });
  });

  it("calls deep interpenetration what it is, not resting", () => {
    // A part 50mm INTO its support used to satisfy `gap <= tolerance` and
    // wear the "rests on / nothing to fix" message — advice to exempt
    // visibly broken geometry. Contact has a lower bound too.
    const c = census([
      { name: "prp_top", min: 0.5 },
      { name: "prp_base", min: 0 },
    ]);
    c.objects[1]!.worldMax = [1, 1, 0.55];
    c.contacts = [
      { a: "prp_top", b: "prp_base", gap: [0, 0, -0.05], separation: -0.05, intersects: true },
    ];
    const issues: Issue[] = [];
    lintWorld(normalizeContract(grounded), c, issues);
    const top = issues.find((i) => i.code === "S3D-W-325" && i.target === "prp_top")!;
    expect(top.message).toContain("INTO 'prp_base'");
    expect(top.message).not.toContain("rests on");
    expect(top.hint).toContain("raise it out of 'prp_base'");
  });

  it("still reads the solver's deliberate 1mm embed as resting", () => {
    const c = census([
      { name: "prp_top", min: 0.5 },
      { name: "prp_base", min: 0 },
    ]);
    c.objects[1]!.worldMax = [1, 1, 0.501];
    c.contacts = [
      { a: "prp_top", b: "prp_base", gap: [0, 0, -0.001], separation: -0.001, intersects: true },
    ];
    const issues: Issue[] = [];
    lintWorld(normalizeContract(grounded), c, issues);
    const top = issues.find((i) => i.code === "S3D-W-325" && i.target === "prp_top")!;
    expect(top.message).toContain("rests on 'prp_base'");
  });

  it("does not let a bare exempt prefix leak across a word boundary (W-1)", () => {
    // `exempt: ["mount"]` must cover the `mount_` family but NOT `mountain_`.
    const contract: Scene3dContract = {
      schemaVersion: 1,
      conventions: { grounding: { enabled: true, exempt: ["mount"] } },
    };
    // mount_bracket: exempt at the separator boundary — silent.
    expect(codes(contract, census([{ name: "mount_bracket", min: 1.8 }]))).toEqual([]);
    // mountain_rock: NOT the mount family — a real float must still surface.
    expect(codes(contract, census([{ name: "mountain_rock", min: 1.8 }]))).toEqual(["S3D-W-325"]);
  });
});

describe("budgets", () => {
  const budgeted: Scene3dContract = {
    schemaVersion: 1,
    conventions: { budgets: { maxTrianglesPerMesh: 20_000, maxTrianglesTotal: 30_000 } },
  };

  it("says nothing when no budget is declared", () => {
    expect(codes({ schemaVersion: 1 }, census([{ name: "prp_a", tris: 999_999 }].map((o) => ({ ...o, min: 0 }))))).toEqual([]);
  });

  it("errors on a mesh over the per-mesh cap", () => {
    expect(codes(budgeted, census([{ name: "prp_a", min: 0, tris: 25_000 }]))).toContain("S3D-E-326");
  });

  it("warns on a scene over the total budget", () => {
    const result = codes(
      budgeted,
      census([
        { name: "prp_a", min: 0, tris: 19_000 },
        { name: "prp_b", min: 0, tris: 19_000 },
      ]),
    );
    expect(result).toContain("S3D-W-326");
    expect(result).not.toContain("S3D-E-326");
  });

  it("passes a scene inside both budgets", () => {
    expect(codes(budgeted, census([{ name: "prp_a", min: 0, tris: 1_000 }]))).toEqual([]);
  });
});

/**
 * S3D-W-337: a restsOn pair the solver flushed to its 1mm floor must show a
 * measured contact. The field failure this pins: cage bars beside the ring
 * they were meant to carry, zero errors, the missing contact measured in the
 * census and read by nobody.
 */
describe("rested pairs must actually touch (W-337)", () => {
  const contract = normalizeContract({ schemaVersion: 1 });
  const withContacts = (
    contacts: Array<{ a: string; b: string; separation: number }>,
    skipped: string[] = [],
  ): Census => ({
    ...census([
      { name: "prp_ring", min: 0.5 },
      { name: "prp_bar", min: 0 },
    ]),
    contacts: contacts.map((c) => ({
      a: c.a,
      b: c.b,
      gap: [0, 0, c.separation] as [number, number, number],
      separation: c.separation,
      intersects: c.separation <= 0,
    })),
    contactsSkipped: skipped,
  });
  const solved = { parts: [{ id: "prp_ring", restsOn: "prp_bar" }] };
  const run = (c: Census, s?: typeof solved) => {
    const issues: Issue[] = [];
    lintWorld(contract, c, issues, s);
    return issues.filter((i) => i.code === "S3D-W-337");
  };

  it("stays silent when the rested pair is in measured contact", () => {
    expect(run(withContacts([{ a: "prp_bar", b: "prp_ring", separation: 0.001 }]), solved)).toEqual([]);
  });

  it("warns when no contact was measured between the pair at all", () => {
    const found = run(withContacts([]), solved);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("never comes near it");
    expect(found[0]!.target).toBe("prp_ring <-> prp_bar");
  });

  it("warns with the measured gap when the pair is near but apart", () => {
    const found = run(withContacts([{ a: "prp_ring", b: "prp_bar", separation: 0.04 }]), solved);
    expect(found).toHaveLength(1);
    expect(found[0]!.detail?.separation).toBe(0.04);
  });

  it("stays silent when the contact scan was skipped — unmeasured is not untouching", () => {
    expect(run(withContacts([], ["scene has 91 meshes, above the 60-mesh contact limit"]), solved)).toEqual([]);
  });

  it("stays silent without a solved scene (nothing declared restsOn)", () => {
    expect(run(withContacts([]))).toEqual([]);
  });
});
