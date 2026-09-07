import { describe, expect, it } from "vitest";
import {
  computeSnapBlendFactor,
  criticalSpringStep,
  evaluateSnapStep,
  type SnapConstraint,
  type SnapLatchState,
} from "../src/viewer/math/dynamics.js";
import {
  buildProjectionContext,
  type CameraState,
  type Vec2,
  type ViewportMetrics,
} from "../src/viewer/math/projection.js";

describe("Snap State Machine & Dynamics (dynamics.ts)", () => {
  const camera: CameraState = {
    position: [0, 0, 5],
    rotation: [0, 0, 0, 1],
    fovY: Math.PI / 4,
    near: 0.1,
    far: 100.0,
  };

  const viewport: ViewportMetrics = {
    cssWidth: 1200,
    cssHeight: 800,
    drawingBufferWidth: 1200,
    drawingBufferHeight: 800,
  };

  const ctx = buildProjectionContext(camera, viewport);

  it("steers through the full snap lifecycle (unlatched -> acquire -> core -> breakaway -> release)", () => {
    let currentDistance = 25.0; // Outside 18px

    const candidate1: SnapConstraint = {
      id: "candidate_floor",
      branchKey: "branch_0",
      kind: "plane",
      priorityTier: 1,
      labels: ["Floor Contact"],
      resolve: (rawXi) => ({
        xiSnap: 0.0,
        distanceCss: currentDistance,
        contactWorld: [0, 0, 0],
        valid: true,
      }),
    };

    let latch: SnapLatchState = { candidateId: null, branchKey: null, kind: null };

    // 1. Outside (25px) -> Unlatched
    let step = evaluateSnapStep(latch, [candidate1], 1.5, ctx);
    expect(step.snapped).toBe(false);
    expect(step.latchState.candidateId).toBeNull();
    latch = step.latchState;

    // 2. Crosses into breakaway region (15px) -> Acquired into latch
    currentDistance = 15.0;
    step = evaluateSnapStep(latch, [candidate1], 1.5, ctx);
    expect(step.snapped).toBe(true);
    expect(step.latchState.candidateId).toBe("candidate_floor");
    expect(step.blendFactor).toBeGreaterThan(0.0);
    expect(step.blendFactor).toBeLessThan(1.0);
    latch = step.latchState;

    // 3. Reaches exact core (8px) -> beta = 1.0
    currentDistance = 8.0;
    step = evaluateSnapStep(latch, [candidate1], 1.5, ctx);
    expect(step.blendFactor).toBe(1.0);
    expect(step.xiOut).toBe(0.0); // Exact target
    latch = step.latchState;

    // 4. Pulls out into breakaway region (15px) -> Candidate retained
    currentDistance = 15.0;
    step = evaluateSnapStep(latch, [candidate1], 1.5, ctx);
    expect(step.latchState.candidateId).toBe("candidate_floor");
    expect(step.blendFactor).toBeGreaterThan(0.0);
    latch = step.latchState;

    // 5. Exceeds release threshold (19px) -> Cleanly released
    currentDistance = 19.0;
    step = evaluateSnapStep(latch, [candidate1], 1.5, ctx);
    expect(step.snapped).toBe(false);
    expect(step.latchState.candidateId).toBeNull();
  });

  it("projects 2D manifold constraints snapping contact while leaving tangential movement live", () => {
    // Floor plane contact at Y = 2.0 with X (tangential) free
    const floorManifold: SnapConstraint = {
      id: "floor_shelf_manifold",
      branchKey: "branch_main",
      kind: "plane",
      priorityTier: 0,
      labels: ["Shelf Plane"],
      resolve: (rawXi) => {
        const uv = rawXi as Vec2;
        const targetY = 2.0;
        const distCss = Math.abs(uv[1] - targetY) * 50; // 50px per unit
        return {
          xiSnap: [uv[0], targetY], // Tangential U remains raw!
          distanceCss: distCss,
          contactWorld: [uv[0], targetY, 0],
          valid: true,
        };
      },
    };

    const latch: SnapLatchState = { candidateId: null, branchKey: null, kind: null };
    const rawUV: Vec2 = [3.85, 2.08]; // 4px away from Y = 2.0

    const step = evaluateSnapStep(latch, [floorManifold], rawUV, ctx);
    expect(step.snapped).toBe(true);
    const outUV = step.xiOut as Vec2;
    expect(outUV[0]).toBeCloseTo(3.85, 4); // Tangential preserved!
    expect(outUV[1]).toBeCloseTo(2.0, 2); // Snapped towards 2.0
  });

  it("validates analytical critical spring discrete semigroup invariant on full state (x, v)", () => {
    const initialState = { x: 10.0, v: 2.0 };
    const target = 0.0;
    const omega = 28.0;

    const dt1 = 0.016; // ~60fps step 1
    const dt2 = 0.033; // ~30fps step 2
    const totalDt = dt1 + dt2;

    // Direct two-step
    const step1 = criticalSpringStep(initialState, target, dt1, omega);
    const step2 = criticalSpringStep(step1, target, dt2, omega);

    // Single combined step
    const combinedStep = criticalSpringStep(initialState, target, totalDt, omega);

    expect(step2.x).toBeCloseTo(combinedStep.x, 8);
    expect(step2.v).toBeCloseTo(combinedStep.v, 8);
  });
});

describe("NaN snap distances (bug-shaker round)", () => {
  it("rejects a candidate whose resolved distance is NaN instead of latching it", () => {
    // Red before the fix: `distanceCss >= OUT` let NaN through (every NaN
    // comparison is false) and the blend carried NaN into the manipulation
    // state. The positive-form gate rejects it like the latched path does.
    const nanCandidate = {
      id: "c_nan",
      branchKey: "b",
      kind: "grid" as never,
      priorityTier: 0,
      labels: [],
      resolve: () => ({
        xiSnap: Number.NaN,
        distanceCss: Number.NaN,
        contactWorld: [0, 0, 0] as [number, number, number],
        valid: true,
      }),
    };
    const result = evaluateSnapStep(
      { candidateId: null, branchKey: null, kind: null },
      [nanCandidate as never],
      0.5,
      {} as never,
    );
    expect(result.activeConstraint).toBeNull();
    expect(result.snapped).toBe(false);
    expect(Number.isFinite(result.xiOut as number)).toBe(true);
  });
});
