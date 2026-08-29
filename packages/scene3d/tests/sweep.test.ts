import { describe, expect, it } from "vitest";
import { motionEnvelopeIssues, sweptBox, sweptSceneFacts } from "../src/solve/sweep.js";
import { lintClaims } from "../src/lint/claims.js";
import type { Issue } from "../src/types.js";
import type { SolvedPart } from "../src/solve/types.js";

/**
 * The kinematic linter's math, pinned: motion flattened into geometry.
 * Two closed forms (corner-circle disc, exact bob translation) and one
 * symmetry theorem (a shape symmetric about its spin axis sweeps nothing).
 */

function part(overrides: Partial<SolvedPart> & { id: string }): SolvedPart {
  return {
    size: [1, 1, 1],
    center: [0, 0, 0.5],
    shape: "box",
    axis: "z",
    flip: false,
    ...overrides,
  } as SolvedPart;
}

describe("sweptBox", () => {
  it("is undefined for a part that does not move", () => {
    expect(sweptBox(part({ id: "prp_still" }))).toBeUndefined();
  });

  it("sweeps a spinning box to its corner circle", () => {
    // 0.4 × 0.2 cross about z: diagonal = hypot(0.4, 0.2).
    const env = sweptBox(part({ id: "prp_blade", size: [0.4, 0.2, 0.1], spin: { axis: "z" } }))!;
    const d = Math.hypot(0.4, 0.2);
    expect(env.spinGrew).toBe(true);
    expect(env.max[0] - env.min[0]).toBeCloseTo(d, 9);
    expect(env.max[1] - env.min[1]).toBeCloseTo(d, 9);
    // The spin axis extent never changes.
    expect(env.max[2] - env.min[2]).toBeCloseTo(0.1, 9);
  });

  it("costs a symmetric shape nothing: sphere, and a cylinder about its own axis", () => {
    const orb = sweptBox(part({ id: "prp_orb", shape: "sphere", size: [0.3, 0.3, 0.3], spin: { axis: "z" } }))!;
    expect(orb.spinGrew).toBe(false);
    expect(orb.max[0] - orb.min[0]).toBeCloseTo(0.3, 9);

    const column = sweptBox(
      part({ id: "prp_column", shape: "cylinder", axis: "z", size: [0.2, 0.2, 1], spin: { axis: "z" } }),
    )!;
    expect(column.spinGrew).toBe(false);
  });

  it("grows a cylinder spun about a FOREIGN axis — symmetry is axis-specific", () => {
    const env = sweptBox(
      part({ id: "prp_roller", shape: "cylinder", axis: "z", size: [0.2, 0.2, 1], spin: { axis: "x" } }),
    )!;
    expect(env.spinGrew).toBe(true);
  });

  it("bob sweeps exactly: trough-anchored rises 2A, floating spreads ±A", () => {
    const resting = sweptBox(
      part({ id: "prp_buoy", size: [0.2, 0.2, 0.2], center: [0, 0, 0.1], bob: { amplitude: 0.05 }, restsOn: "prp_raft" }),
    )!;
    expect(resting.bobRise).toBeCloseTo(0.1, 9);
    expect(resting.bobDip).toBe(0);
    expect(resting.max[2]).toBeCloseTo(0.2 + 0.1, 9);
    expect(resting.min[2]).toBeCloseTo(0, 9);

    const floating = sweptBox(
      part({ id: "prp_ember", size: [0.2, 0.2, 0.2], center: [0, 0, 0.5], bob: { amplitude: 0.05 } }),
    )!;
    expect(floating.bobRise).toBeCloseTo(0.05, 9);
    expect(floating.bobDip).toBeCloseTo(0.05, 9);
  });

  it("screws: the turn grows the cross, the rise extends the axis — signed", () => {
    const bit = sweptBox(
      part({ id: "prp_bit", size: [0.4, 0.2, 0.5], center: [0, 0, 1], screw: { axis: "z", rise: 0.3 } }),
    )!;
    const d = Math.hypot(0.4, 0.2);
    expect(bit.spinGrew).toBe(true);
    expect(bit.screwRise).toBe(0.3);
    expect(bit.max[0] - bit.min[0]).toBeCloseTo(d, 9);
    // Anchored at the solved pose: the cycle STARTS there and advances.
    expect(bit.min[2]).toBeCloseTo(0.75, 9);
    expect(bit.max[2]).toBeCloseTo(1.25 + 0.3, 9);

    const descent = sweptBox(
      part({ id: "prp_bit", size: [0.4, 0.2, 0.5], center: [0, 0, 1], screw: { axis: "z", rise: -0.3 } }),
    )!;
    expect(descent.min[2]).toBeCloseTo(0.75 - 0.3, 9);
    expect(descent.max[2]).toBeCloseTo(1.25, 9);
  });

  it("costs a symmetric screw nothing but its travel — the theorem survives the composition", () => {
    const auger = sweptBox(
      part({
        id: "prp_auger",
        shape: "cylinder",
        axis: "z",
        size: [0.2, 0.2, 1],
        center: [0, 0, 0.5],
        screw: { axis: "z", rise: 0.25 },
      }),
    )!;
    expect(auger.spinGrew).toBe(false);
    expect(auger.max[0] - auger.min[0]).toBeCloseTo(0.2, 9);
    expect(auger.max[2] - auger.min[2]).toBeCloseTo(1.25, 9);
  });

  it("composes a screw about x with a bob on z — two axes, two authorities", () => {
    const env = sweptBox(
      part({
        id: "prp_drill",
        size: [0.4, 0.2, 0.2],
        center: [0, 0, 1],
        screw: { axis: "x", rise: 0.5 },
        bob: { amplitude: 0.1 },
      }),
    )!;
    expect(env.max[0]).toBeCloseTo(0.2 + 0.5, 9);
    expect(env.max[2]).toBeCloseTo(1 + Math.hypot(0.2, 0.2) / 2 + 0.1, 9);
    expect(env.min[2]).toBeCloseTo(1 - Math.hypot(0.2, 0.2) / 2 - 0.1, 9);
  });
});

describe("motionEnvelopeIssues", () => {
  it("flags a blade that clears its post at rest and hits it mid-cycle", () => {
    const blade = part({ id: "prp_blade", size: [1, 0.1, 0.1], center: [0, 0, 1], spin: { axis: "z" } });
    // Post beside the blade: clear of the 1×0.1 rest box, inside the ⌀~1.005 disc.
    const post = part({ id: "prp_post", size: [0.1, 0.1, 2], center: [0, 0.4, 1] });
    const issues = motionEnvelopeIssues({ parts: [blade, post] });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe("S3D-W-108");
    expect(issues[0]!.message).toContain("the rest pose clears it");
    expect(issues[0]!.target).toBe("prp_blade <-> prp_post");
    expect(issues[0]!.detail?.cyclePenetration).toBeGreaterThan(0);
  });

  it("stays silent for a symmetric spinner flush against a neighbour", () => {
    const orb = part({ id: "prp_orb", shape: "sphere", size: [0.3, 0.3, 0.3], center: [0, 0, 0.15], spin: {} });
    const pedestal = part({ id: "prp_pedestal", size: [0.3, 0.3, 0.001], center: [0, 0, -0.0005] });
    expect(motionEnvelopeIssues({ parts: [orb, pedestal] })).toEqual([]);
  });

  it("flags a bobbing support pressing deeper into its rider than the rest contact", () => {
    const support = part({ id: "prp_float", size: [0.4, 0.4, 0.2], center: [0, 0, 0.5], bob: { amplitude: 0.05 } });
    // Rider resting 1mm embedded on the support's rest top (0.6).
    const rider = part({ id: "prp_lamp", size: [0.2, 0.2, 0.2], center: [0, 0, 0.699], restsOn: "prp_float" });
    const issues = motionEnvelopeIssues({ parts: [support, rider] });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain("presses");
    expect(issues[0]!.detail?.restPenetration).toBeCloseTo(0.001, 6);
  });

  it("hard-fails a footprint claim a spinning BOX provably exceeds — no census needed", () => {
    // The D1 mechanism: integer-frame samples of a fast spin never land on
    // the widest angle, so the sampled envelope under-measures. A box's
    // corner circle is EXACT (the corners really trace it), so the breach
    // is proven closed-form and adjudicated as S3D-E-701, not an advisory.
    const rotor = part({ id: "prp_rotor", size: [1, 0.1, 0.1], center: [0, 0, 1], spin: { axis: "z" } });
    const issues: Issue[] = [];
    lintClaims({ maxHeight: 2, footprint: [1, 0.5] }, undefined, issues, { solved: [rotor] });
    const failures = issues.filter((i) => i.code === "S3D-E-701" && i.detail?.claim === "footprint");
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0]!.message).toContain("provably sweeps");
    expect(failures[0]!.detail?.analytic).toBe(true);
    expect(failures[0]!.detail?.actual).toBeCloseTo(Math.hypot(1, 0.1), 6);
    // maxHeight 2 clears the 1.05 top: no failure, but with no census it is
    // honestly unchecked rather than silently held.
    expect(issues.some((i) => i.code === "S3D-E-701" && i.detail?.claim === "maxHeight")).toBe(false);
    expect(
      issues.some(
        (i) => i.code === "S3D-W-701" && i.detail?.claim === "maxHeight" && i.detail?.unadjudicated === true,
      ),
    ).toBe(true);
  });

  it("keeps the conservative bound advisory, never a hard failure, for round shapes", () => {
    // A cone spinning about x: the corner circle over-reserves, so the
    // exact-parts list must not contain it and no E-701 may fire from it.
    const cone = part({
      id: "prp_cone",
      shape: "cone",
      axis: "z",
      size: [0.4, 0.4, 1],
      center: [0, 0, 1],
      spin: { axis: "x" },
    });
    const facts = sweptSceneFacts([cone])!;
    expect(facts.exactParts).toEqual([]);
    expect(facts.exact).toBe(false);
    const issues: Issue[] = [];
    lintClaims({ maxHeight: 1.2 }, undefined, issues, { solved: [cone] });
    expect(issues.some((i) => i.code === "S3D-E-701")).toBe(false);
  });

  it("flags a screwing part that drives into the neighbour above its rise", () => {
    // A symmetric auger: the TURN costs nothing, so the only thing that can
    // reach the cap is the rise — W-108 here proves the advance is
    // adjudicated, not merely stored.
    const auger = part({
      id: "prp_auger",
      shape: "cylinder",
      axis: "z",
      size: [0.2, 0.2, 1],
      center: [0, 0, 0.5],
      screw: { axis: "z", rise: 0.4 },
    });
    const cap = part({ id: "prp_cap", size: [1, 1, 0.1], center: [0, 0, 1.15] });
    const issues = motionEnvelopeIssues({ parts: [auger, cap] });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe("S3D-W-108");
    expect(issues[0]!.message).toContain("(screw)");
    expect(issues[0]!.message).toContain("the rest pose clears it");
    // Rest top 1.0, cap 1.1–1.2, envelope top 1.4: the drive goes clean
    // through, and the reported penetration is the minimum overlap across
    // the axes — here the cap's own 0.1 thickness.
    expect(issues[0]!.detail?.cyclePenetration).toBeCloseTo(0.1, 9);
    // …and the same part with no rise to give would be silent.
    expect(
      motionEnvelopeIssues({ parts: [{ ...auger, screw: undefined, spin: { axis: "z" } }, cap] }),
    ).toEqual([]);
  });

  it("hard-fails maxHeight for a rise that provably climbs past it", () => {
    // A screw's advance is a pure translation — exact — so the crest over
    // the claim is a proven failure, and it needs no Blender.
    const auger = part({
      id: "prp_auger",
      shape: "cylinder",
      axis: "z",
      size: [0.2, 0.2, 1],
      center: [0, 0, 0.5],
      screw: { axis: "z", rise: 0.4 },
    });
    const issues: Issue[] = [];
    lintClaims({ maxHeight: 1.2 }, undefined, issues, { solved: [auger] });
    const failure = issues.find((i) => i.code === "S3D-E-701" && i.detail?.claim === "maxHeight");
    expect(failure).toBeDefined();
    expect(failure!.detail?.actual).toBeCloseTo(1.4, 6);
    expect(failure!.message).toContain("provably crests");
  });

  it("hard-fails footprint when a horizontal screw provably walks the plan", () => {
    // The turn is costless (a cylinder about its own axis), so a gate on
    // spinGrew alone would miss the metre of travel entirely.
    const roller = part({
      id: "prp_roller",
      shape: "cylinder",
      axis: "x",
      size: [1, 0.2, 0.2],
      center: [0, 0, 0.1],
      screw: { axis: "x", rise: 1 },
    });
    const issues: Issue[] = [];
    lintClaims({ footprint: [1, 1] }, undefined, issues, { solved: [roller] });
    const failure = issues.find((i) => i.code === "S3D-E-701" && i.detail?.claim === "footprint");
    expect(failure).toBeDefined();
    expect(failure!.detail?.actual).toBeCloseTo(2, 6);
  });

  it("is deterministic: identical scenes produce byte-identical issues", () => {
    const scene = () => ({
      parts: [
        part({ id: "prp_blade", size: [1, 0.1, 0.1], center: [0, 0, 1], spin: { axis: "z" } }),
        part({ id: "prp_post", size: [0.1, 0.1, 2], center: [0, 0.4, 1] }),
      ],
    });
    expect(JSON.stringify(motionEnvelopeIssues(scene()))).toBe(
      JSON.stringify(motionEnvelopeIssues(scene())),
    );
  });
});

describe("motionEnvelopeIssues — the swept solid is a cylinder, not a square", () => {
  /*
   * The red-team exhibit: a tilted ring (outer radius 0.166 after its world
   * box grows) spinning about z, with a bead at radial distance ~0.226 —
   * OUTSIDE the swept circle, but inside the corner of the envelope's
   * bounding SQUARE. The AABB verdict reported a -30mm interpenetration on a
   * pair with +40mm of true radial clearance; the disc narrow phase must
   * stay silent.
   */
  it("clears a neighbour outside the swept radius but inside the corner square", () => {
    const ring = part({
      id: "prp_ring",
      shape: "torus",
      size: [0.24, 0.23, 0.11], // world box of the tilted torus
      localSize: [0.24, 0.24, 0.04],
      center: [0, 0, 0.5],
      rotate: { axis: "x", deg: 23 },
      spin: { axis: "z", seconds: 36 },
    });
    const env = sweptBox(ring)!;
    expect(env.spinGrew).toBe(true);
    expect(env.spinDisc).toBeDefined();
    const radius = env.spinDisc!.radius;
    // A bead whose nearest rectangle corner sits beyond the radius, while its
    // axis-aligned coordinates stay inside the square.
    const off = radius * 0.96; // per-axis inside the square...
    expect(Math.hypot(off, off)).toBeGreaterThan(radius); // ...diagonally outside the circle
    const bead = part({ id: "prp_bead", size: [0.02, 0.02, 0.02], center: [off, off, 0.5] });
    expect(motionEnvelopeIssues({ parts: [ring, bead] })).toEqual([]);
  });

  it("still flags a neighbour genuinely inside the swept circle", () => {
    const ring = part({
      id: "prp_ring",
      shape: "torus",
      size: [0.24, 0.23, 0.11],
      localSize: [0.24, 0.24, 0.04],
      center: [0, 0, 0.5],
      rotate: { axis: "x", deg: 23 },
      spin: { axis: "z", seconds: 36 },
    });
    const radius = sweptBox(ring)!.spinDisc!.radius;
    const bead = part({ id: "prp_bead", size: [0.02, 0.02, 0.02], center: [radius * 0.8, 0, 0.5] });
    const issues = motionEnvelopeIssues({ parts: [ring, bead] });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.detail?.sweptRadius).toBeCloseTo(radius, 5); // detail rounds to 6 decimals
  });

  it("keeps the disc only when nothing else perturbs the cross plane", () => {
    // A bob moves along z: with an x spin, z lies IN the cross plane, so the
    // swept solid is no longer a cylinder and the disc must not be claimed.
    const wheel = part({
      id: "prp_wheel",
      size: [0.1, 0.4, 0.4],
      center: [0, 0, 1],
      spin: { axis: "x", seconds: 4 },
      bob: { amplitude: 0.1 },
    });
    expect(sweptBox(wheel)!.spinDisc).toBeUndefined();
    // With a z spin the bob rides the spin axis and the disc survives.
    const rotor = part({
      id: "prp_rotor",
      size: [0.4, 0.1, 0.1],
      center: [0, 0, 1],
      spin: { axis: "z", seconds: 4 },
      bob: { amplitude: 0.1 },
    });
    expect(sweptBox(rotor)!.spinDisc).toBeDefined();
  });
});
