import { describe, expect, it } from "vitest";
import { claimMargins, lintClaims } from "../src/lint/claims.js";
import { ISSUE_CODES } from "../src/errors.js";
import { Census, Issue, CensusMesh } from "../src/types.js";

/** A census carrying just the mesh facts a claim reads. */
function census(meshes: Partial<CensusMesh>[]): Census {
  return {
    blenderVersion: "5.0.1",
    sceneName: "Scene",
    objects: [],
    meshes: meshes.map((m) => ({
      object: "prp_x",
      verts: 8,
      faces: 6,
      tris: 12,
      ngons: 0,
      nonManifoldEdges: 0,
      zeroAreaFaces: 0,
      nan: false,
      uvLayers: ["UVMap"],
      ...m,
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

const spatial = (groundGap: number) => ({
  worldMin: [0, 0, groundGap] as [number, number, number],
  worldMax: [1, 1, groundGap + 1] as [number, number, number],
  size: [1, 1, 1] as [number, number, number],
  bboxCenter: [0.5, 0.5, 0.5] as [number, number, number],
  centroid: [0.5, 0.5, 0.5] as [number, number, number],
  groundGap,
});

function run(claims: Parameters<typeof lintClaims>[0], c: Census, options = {}): Issue[] {
  const issues: Issue[] = [];
  lintClaims(claims, c, issues, options);
  return issues;
}

describe("lintClaims grounding exemptions (CL-1)", () => {
  it("fails a grounded claim on a buried part by default", () => {
    const c = census([{ object: "rock_bed", spatial: spatial(-0.2) }]);
    const issues = run({ grounded: true }, c);
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_FAILED)).toBe(true);
  });

  it("honours the same grounding exemptions lintWorld does", () => {
    // A deliberately-bedded part the project exempted must not fail the
    // scene-level grounded claim — the two grounding authorities must agree.
    const c = census([{ object: "rock_bed", spatial: spatial(-0.2) }]);
    const issues = run({ grounded: true }, c, { groundExempt: ["rock_bed"] });
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_FAILED)).toBe(false);
  });
});

describe("lintClaims materialsUsed guard (CL-2)", () => {
  it("reports UNCHECKED, not FAILED, when the census carries no material bindings", () => {
    // A census that never measured per-mesh materials (materials: undefined on
    // every mesh) must not turn "couldn't measure" into "every material lost".
    const c = census([{ object: "prp_a" }, { object: "prp_b" }]);
    c.meshes.forEach((m) => {
      delete (m as { materials?: string[] }).materials;
    });
    const issues = run({ materialsUsed: ["mtl_wood"] }, c);
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_UNCHECKED)).toBe(true);
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_FAILED)).toBe(false);
  });

  it("still fails a genuinely-unbound material when bindings WERE measured", () => {
    const c = census([{ object: "prp_a", materials: ["mtl_metal"] }]);
    const issues = run({ materialsUsed: ["mtl_wood"] }, c);
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_FAILED)).toBe(true);
  });
});

/** Attach measured-over-time bounds to a census, the shape the runner emits. */
function withAnimatedBounds(
  c: Census,
  b: NonNullable<Census["animation"]["animatedBounds"]>,
): Census {
  c.animation.keyframedObjects = ["rig"];
  c.animation.frameEnd = 24;
  c.animation.animatedBounds = b;
  return c;
}

describe("lintClaims across time (animated bounds)", () => {
  it("fails maxHeight on an animated crest the rest pose clears, naming the frame", () => {
    // Rest pose tops out at 1m; the cycle reaches 2.4m at frame 13. A claim of
    // 2m holds at rest and is violated by the asset.
    const c = withAnimatedBounds(census([{ object: "prp_x", spatial: spatial(0) }]), {
      min: [0, 0, 0],
      max: [1, 1, 2.4],
      minFrame: [1, 1, 1],
      maxFrame: [1, 1, 13],
      framesSampled: 24,
      frameStep: 1,
      frameStart: 1,
      frameEnd: 24,
      parts: [{ object: "prp_x", minZ: 0, maxZ: 2.4, minZFrame: 1, maxZFrame: 13 }],
    });
    const issues = run({ maxHeight: 2 }, c);
    const failed = issues.filter((i) => i.code === ISSUE_CODES.CLAIM_FAILED);
    // Exactly one report: the animated envelope is a union with the rest pose,
    // so it supersedes rather than duplicates.
    expect(failed).toHaveLength(1);
    expect(failed[0]!.detail).toMatchObject({ claim: "maxHeight", overTime: true, frame: 13 });
    expect(failed[0]!.message).toContain("frame 13");
    // Exact sampling (frameStep 1) leaves nothing unchecked.
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_UNCHECKED)).toBe(false);
  });

  it("fails grounded on the cycle's worst dip, not the rest pose's gap", () => {
    const c = withAnimatedBounds(census([{ object: "prp_x", spatial: spatial(0.01) }]), {
      min: [0, 0, -0.3],
      max: [1, 1, 1],
      minFrame: [1, 1, 7],
      maxFrame: [1, 1, 1],
      framesSampled: 24,
      frameStep: 1,
      frameStart: 1,
      frameEnd: 24,
      parts: [{ object: "prp_x", minZ: -0.3, maxZ: 1, minZFrame: 7, maxZFrame: 1 }],
    });
    const issues = run({ grounded: true }, c);
    const failed = issues.filter((i) => i.code === ISSUE_CODES.CLAIM_FAILED);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.detail).toMatchObject({ claim: "grounded", overTime: true, frame: 7 });
  });

  it("does not double-report when the rest pose ALSO breaches — one violation, one issue", () => {
    const c = withAnimatedBounds(census([{ object: "prp_x", spatial: spatial(-0.2) }]), {
      min: [0, 0, -0.4],
      max: [1, 1, 1],
      minFrame: [1, 1, 9],
      maxFrame: [1, 1, 1],
      framesSampled: 24,
      frameStep: 1,
      frameStart: 1,
      frameEnd: 24,
      parts: [{ object: "prp_x", minZ: -0.4, maxZ: 1, minZFrame: 9, maxZFrame: 1 }],
    });
    const failed = run({ grounded: true }, c).filter((i) => i.code === ISSUE_CODES.CLAIM_FAILED);
    expect(failed).toHaveLength(1);
    // The binding measurement is the worst of the two, not the rest pose.
    expect(failed[0]!.detail).toMatchObject({ groundGap: -0.4, restGroundGap: -0.2 });
  });

  it("reports W-701 unchecked when a PASSING claim was only strided-sampled", () => {
    const c = withAnimatedBounds(census([{ object: "prp_x", spatial: spatial(0) }]), {
      min: [0, 0, 0],
      max: [1, 1, 1.2],
      minFrame: [1, 1, 1],
      maxFrame: [1, 1, 21],
      framesSampled: 8,
      frameStep: 4,
      frameStart: 1,
      frameEnd: 32,
      parts: [{ object: "prp_x", minZ: 0, maxZ: 1.2, minZFrame: 1, maxZFrame: 21 }],
    });
    const issues = run({ maxHeight: 2, grounded: true }, c);
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_FAILED)).toBe(false);
    const un = issues.filter((i) => i.code === ISSUE_CODES.CLAIM_UNCHECKED);
    // Both spatial claims passed only what was sampled — both say so.
    expect(un.map((i) => (i.detail as { claim: string }).claim).sort()).toEqual([
      "grounded",
      "maxHeight",
    ]);
    expect(un[0]!.message).toContain("every 4th frame");
  });

  it("does not caveat a claim that already FAILED a sampled frame", () => {
    // A sampled failure is a real failure; warning that other frames were
    // unmeasured adds nothing an author can act on.
    const c = withAnimatedBounds(census([{ object: "prp_x", spatial: spatial(0) }]), {
      min: [0, 0, 0],
      max: [1, 1, 3],
      minFrame: [1, 1, 1],
      maxFrame: [1, 1, 17],
      framesSampled: 8,
      frameStep: 4,
      frameStart: 1,
      frameEnd: 32,
      parts: [{ object: "prp_x", minZ: 0, maxZ: 3, minZFrame: 1, maxZFrame: 17 }],
    });
    const issues = run({ maxHeight: 2 }, c);
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_FAILED)).toBe(true);
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_UNCHECKED)).toBe(false);
  });

  it("reports unchecked when the sampler declined entirely — skipped is not passed", () => {
    const c = withAnimatedBounds(census([{ object: "prp_x", spatial: spatial(0) }]), {
      skipped: "scene has 900 meshes, above the 400-mesh animated-bounds limit",
      frameStart: 1,
      frameEnd: 24,
    });
    const issues = run({ maxHeight: 2 }, c);
    const un = issues.filter((i) => i.code === ISSUE_CODES.CLAIM_UNCHECKED);
    expect(un).toHaveLength(1);
    expect(un[0]!.message).toContain("400-mesh");
  });

  it("stays silent about time for a scene that does not animate", () => {
    const c = census([{ object: "prp_x", spatial: spatial(0) }]);
    const issues = run({ maxHeight: 2, grounded: true, footprint: [4, 4] }, c);
    expect(issues).toHaveLength(0);
  });

  it("adjudicates footprint against the animated span", () => {
    const c = withAnimatedBounds(census([{ object: "prp_x", spatial: spatial(0) }]), {
      min: [-2, 0, 0],
      max: [3, 1, 1],
      minFrame: [11, 1, 1],
      maxFrame: [19, 1, 1],
      framesSampled: 24,
      frameStep: 1,
      frameStart: 1,
      frameEnd: 24,
      parts: [{ object: "prp_x", minZ: 0, maxZ: 1, minZFrame: 1, maxZFrame: 1 }],
    });
    const failed = run({ footprint: [2, 2] }, c).filter((i) => i.code === ISSUE_CODES.CLAIM_FAILED);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.detail).toMatchObject({ axis: "x", actual: 5, overTime: true });
  });
});

describe("claimMargins", () => {
  it("reports budget usage per numeric claim, tightest first, from the adjudicator's own measurements", () => {
    // One 12-tri unit cube resting on the ground: height 1 of a claimed 2
    // (50%), footprint 1 of 4 (25%), triangles 12 of 1000 (1.2%).
    const c = census([{ object: "prp_x", spatial: spatial(0) }]);
    const margins = claimMargins(
      { maxTriangles: 1000, maxHeight: 2, footprint: [4, 4] },
      c,
    );
    expect(margins.length).toBeGreaterThan(0);
    // Sorted by used, descending — the tightest budget leads.
    for (let i = 1; i < margins.length; i++) {
      expect(margins[i - 1]!.used).toBeGreaterThanOrEqual(margins[i]!.used);
    }
    for (const m of margins) {
      expect(m.used).toBeCloseTo(m.measured / m.limit, 6);
    }
  });

  it("returns nothing without a census — unmeasured is not a margin", () => {
    expect(claimMargins({ maxHeight: 2 }, undefined)).toEqual([]);
  });

  it("measures the margin against the CYCLE's extreme, not the rest pose", () => {
    // The verdict is computed over time, so the margin must be too — a
    // rest-pose margin would report 50% of budget for a claim the cycle
    // spends 90% of.
    const c = withAnimatedBounds(census([{ object: "prp_x", spatial: spatial(0) }]), {
      min: [0, 0, 0],
      max: [1, 1, 1.8],
      minFrame: [1, 1, 1],
      maxFrame: [1, 1, 13],
      framesSampled: 24,
      frameStep: 1,
      frameStart: 1,
      frameEnd: 24,
      parts: [{ object: "prp_x", minZ: 0, maxZ: 1.8, minZFrame: 1, maxZFrame: 13 }],
    });
    const margin = claimMargins({ maxHeight: 2 }, c).find((m) => m.claim === "maxHeight");
    expect(margin?.measured).toBe(1.8);
    expect(margin?.used).toBeCloseTo(0.9, 6);
  });
});

/* ---- the two-sided grounded claim (field-audit D2) --------------------- */

describe("lintClaims grounded support (two-sided)", () => {
  const floating = (object: string, height: number) => ({ object, spatial: spatial(height) });

  it("fails a part floating with nothing beneath it when contacts were measured", () => {
    const c = census([floating("prp_float", 1.5)]);
    c.contacts = []; // measured: nothing within range
    const issues = run({ grounded: true }, c);
    const failed = issues.filter((i) => i.code === ISSUE_CODES.CLAIM_FAILED);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.message).toContain("floats");
    expect(failed[0]!.target).toBe("prp_float");
  });

  it("passes a stack: floating part supported through a contact chain to the ground", () => {
    const c = census([
      { object: "prp_base", spatial: spatial(0) },
      { object: "prp_top", spatial: { ...spatial(1.0), worldMin: [0, 0, 1], worldMax: [1, 1, 2] } },
    ]);
    c.contacts = [
      { a: "prp_base", b: "prp_top", gap: [0, 0, -0.001], separation: -0.001, intersects: true },
    ];
    const issues = run({ grounded: true }, c);
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_FAILED)).toBe(false);
  });

  it("licenses a declared float (an `above` part) and everything hanging from it", () => {
    const c = census([
      { object: "prp_roof", spatial: spatial(2.0) },
      { object: "prp_lamp", spatial: spatial(2.2) },
    ]);
    c.contacts = [
      { a: "prp_roof", b: "prp_lamp", gap: [0, 0, -0.001], separation: -0.001, intersects: true },
    ];
    const issues = run({ grounded: true }, c, { declaredFloating: ["prp_roof"] });
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_FAILED)).toBe(false);
  });

  it("fails a sunk support exactly once and never calls its rider unsupported", () => {
    // The division of labour between the claim's two directions, pinned: a
    // sunk part SEEDS the support closure (a chain standing on a sunk
    // plinth really does reach the ground), so its rider is supported and
    // earns no second finding — while the sinking itself is the per-part
    // groundGap direction's failure, which membership in the closure can
    // never launder away.
    const c = census([
      { object: "prp_plinth", spatial: spatial(-0.05) },
      { object: "prp_orb", spatial: spatial(0.95) },
    ]);
    c.contacts = [
      { a: "prp_plinth", b: "prp_orb", gap: [0, 0, -0.001], separation: -0.001, intersects: true },
    ];
    const issues = run({ grounded: true }, c);
    const failed = issues.filter((i) => i.code === ISSUE_CODES.CLAIM_FAILED);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.target).toBe("prp_plinth");
    expect(failed[0]!.message).toContain("sinks");
  });

  it("reports UNCHECKED, never failed, when the contact scan did not run", () => {
    const c = census([floating("prp_float", 1.5)]);
    // contacts undefined: the oracle that traces support never ran.
    const issues = run({ grounded: true }, c);
    expect(issues.some((i) => i.code === ISSUE_CODES.CLAIM_FAILED)).toBe(false);
    expect(
      issues.some(
        (i) => i.code === ISSUE_CODES.CLAIM_UNCHECKED && i.detail?.unadjudicated === true,
      ),
    ).toBe(true);
  });
});

describe("lintClaims ledger honesty (unadjudicated marker)", () => {
  it("marks every claim unadjudicated when there is no census", () => {
    const issues: Issue[] = [];
    lintClaims({ parts: 3, grounded: true, maxHeight: 1 }, undefined, issues, {});
    const unadjudicated = issues.filter(
      (i) => i.code === ISSUE_CODES.CLAIM_UNCHECKED && i.detail?.unadjudicated === true,
    );
    expect(unadjudicated.map((i) => i.detail?.claim).sort()).toEqual([
      "grounded",
      "maxHeight",
      "parts",
    ]);
  });
});
