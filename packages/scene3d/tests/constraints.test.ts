import { describe, expect, it } from "vitest";
import {
  buildPickedRingBasis,
  mapArcball,
  shoemakeArcballQuat,
  solve2DScreenJacobianSVD,
  solveDampedLevenbergMarquardtRing,
  solveExactFiniteRayPlaneUV,
  solveProjectedLineParameterAdmissible,
} from "../src/viewer/math/constraints.js";
import {
  buildProjectionContext,
  projectWorldToScreen,
  type CameraState,
  type Vec2,
  type Vec3,
  type ViewportMetrics,
} from "../src/viewer/math/projection.js";

describe("1D & 2D Projective Constraint Geometry (constraints.ts)", () => {
  const camera: CameraState = {
    position: [2, 3, 6],
    rotation: [0, 0, 0, 1], // looking along -Z
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

  it("recovers exact finite (u, v) coordinates on tilted plane via Gram projection", () => {
    const origin: Vec3 = [2, 3, 1]; // Plane centered at pivot
    const e1: Vec3 = [1, 0, 0];
    const e2: Vec3 = [0, 0.70710678, -0.70710678]; // tilted 45 degrees
    const normal: Vec3 = [0, 0.70710678, 0.70710678];

    // Arbitrary target (u, v)
    const targetU = 1.35;
    const targetV = -0.85;
    const pTarget: Vec3 = [
      origin[0] + targetU * e1[0] + targetV * e2[0],
      origin[1] + targetU * e1[1] + targetV * e2[1],
      origin[2] + targetU * e1[2] + targetV * e2[2],
    ];

    const s = projectWorldToScreen(pTarget, ctx);
    expect(s.valid).toBe(true);

    const solved = solveExactFiniteRayPlaneUV(origin, e1, e2, normal, [s.x, s.y], ctx);
    expect(solved.hit).toBe(true);
    expect(solved.wellConditioned).toBe(true);
    expect(solved.uv[0]).toBeCloseTo(targetU, 5);
    expect(solved.uv[1]).toBeCloseTo(targetV, 5);
  });

  it("solves 1D horizon-clamped line parameter with identity anchor", () => {
    const origin: Vec3 = [2, 3, 1];
    const axis: Vec3 = [1, 0, 0]; // X axis

    const targetLambda = 2.45;
    const pTarget: Vec3 = [origin[0] + targetLambda * axis[0], origin[1], origin[2]];
    const s = projectWorldToScreen(pTarget, ctx);

    const result = solveProjectedLineParameterAdmissible(origin, axis, [s.x, s.y], ctx, 0);
    expect(result.degenerate).toBe(false);
    expect(result.lambda).toBeCloseTo(targetLambda, 5);
  });

  /**
   * The same solve, but with nothing axis-aligned to flatter it.
   *
   * The case above runs an identity camera down a screen-aligned X axis,
   * where the projected line is horizontal and the rational backward solve
   * degenerates into something a much weaker method would also get right.
   * A tilted axis under a rotated camera exercises the actual projective
   * solve, including the branch that picks whichever of the two NDC
   * equations is better conditioned.
   */
  it("recovers the line parameter exactly for a tilted axis under a rotated camera", () => {
    const tilted = buildProjectionContext(
      { ...camera, rotation: [0.0923, 0.1846, 0.2306, 0.9497] },
      viewport,
    );
    const origin: Vec3 = [0, 0, -2];
    const axis: Vec3 = [0.4364, 0.2182, 0.8729];

    for (const targetLambda of [-1.5, -0.4, 0, 0.7, 2.3]) {
      const pTarget: Vec3 = [
        origin[0] + targetLambda * axis[0],
        origin[1] + targetLambda * axis[1],
        origin[2] + targetLambda * axis[2],
      ];
      const s = projectWorldToScreen(pTarget, tilted);
      expect(s.valid).toBe(true);

      const result = solveProjectedLineParameterAdmissible(origin, axis, [s.x, s.y], tilted, 0);
      expect(result.degenerate).toBe(false);
      expect(result.clamped).toBe(false);
      expect(result.lambda).toBeCloseTo(targetLambda, 10);
    }
  });

  /**
   * A Gram determinant carries units of length^4, so any absolute floor on
   * it is a statement about scene scale rather than about degeneracy. The
   * conditioning test used an absolute 1e-6, which a millimetre-scale plane
   * basis fails by construction — and the failure was silent: uv came back
   * (0, 0), pinning every drag to the plane origin, while the result still
   * reported wellConditioned.
   */
  it("solves plane uv at millimetre scale, and reports a truly collapsed basis", () => {
    const origin: Vec3 = [2, 3, 1];
    const mm = 0.001;
    const e1: Vec3 = [mm, 0, 0];
    const e2: Vec3 = [0, mm, 0];
    const normal: Vec3 = [0, 0, 1];

    const targetU = 3.5;
    const targetV = -2.25;
    const hit: Vec3 = [
      origin[0] + targetU * e1[0],
      origin[1] + targetV * e2[1],
      origin[2],
    ];
    const s = projectWorldToScreen(hit, ctx);
    expect(s.valid).toBe(true);

    const solved = solveExactFiniteRayPlaneUV(origin, e1, e2, normal, [s.x, s.y], ctx);
    expect(solved.hit).toBe(true);
    expect(solved.wellConditioned).toBe(true);
    expect(solved.uv[0]).toBeCloseTo(targetU, 4);
    expect(solved.uv[1]).toBeCloseTo(targetV, 4);

    // Genuinely parallel basis vectors are still rejected, at any scale.
    const collapsed = solveExactFiniteRayPlaneUV(
      origin, e1, [mm * 2, 0, 0], normal, [s.x, s.y], ctx,
    );
    expect(collapsed.wellConditioned).toBe(false);
    expect(collapsed.hit).toBe(false);
  });

  it("verifies Shoemake Arcball angular double invariant (theta = 2 alpha)", () => {
    const radius = 300;
    const cx = 600, cy = 400;

    // Start at center (0, 0, 1)
    const v0 = mapArcball(cx, cy, cx, cy, radius);
    expect(v0[0]).toBeCloseTo(0, 6);
    expect(v0[1]).toBeCloseTo(0, 6);
    expect(v0[2]).toBeCloseTo(1, 6);

    // Move to 45 degree angle on virtual sphere: r = sin(45 deg) = 0.70710678 * radius
    const v1 = mapArcball(cx + radius * Math.SQRT1_2, cy, cx, cy, radius);
    expect(v1[0]).toBeCloseTo(Math.SQRT1_2, 5);
    expect(v1[2]).toBeCloseTo(Math.SQRT1_2, 5);

    const qArc = shoemakeArcballQuat(v0, v1);
    // Angle of rotation: w = cos(theta / 2). If alpha = 45 deg, theta = 90 deg => w = cos(45 deg) = 0.70710678
    expect(qArc[3]).toBeCloseTo(Math.cos(Math.PI / 4), 5);
  });

  it("optimizes edge-on ring rotation using damped Levenberg-Marquardt with offset correction", () => {
    const pivot: Vec3 = [2, 3, 1];
    const u: Vec3 = [0, 1, 0]; // Y-axis rotation
    const pickPoint: Vec3 = [3.5, 3, 1]; // grabbed at X = +1.5
    const basis = buildPickedRingBasis(pivot, u, pickPoint);
    const ringRadius = 1.5;

    // Target rotation: 60 degrees (PI / 3)
    const targetTheta = Math.PI / 3;
    const pTrue: Vec3 = [
      pivot[0] + ringRadius * (basis.a[0] * Math.cos(targetTheta) + basis.b[0] * Math.sin(targetTheta)),
      pivot[1] + ringRadius * (basis.a[1] * Math.cos(targetTheta) + basis.b[1] * Math.sin(targetTheta)),
      pivot[2] + ringRadius * (basis.a[2] * Math.cos(targetTheta) + basis.b[2] * Math.sin(targetTheta)),
    ];
    const sTrue = projectWorldToScreen(pTrue, ctx);

    // Grab had 4px hit slop offset:
    const deltaS: Vec2 = [4.0, -3.0];
    const mt: Vec2 = [sTrue.x + deltaS[0], sTrue.y + deltaS[1]];
    const mEff: Vec2 = [mt[0] - deltaS[0], mt[1] - deltaS[1]];

    const solvedTheta = solveDampedLevenbergMarquardtRing(
      pivot,
      u,
      basis.a,
      basis.b,
      ringRadius,
      mEff,
      0.0,
      ctx,
      6
    );

    expect(solvedTheta).toBeCloseTo(targetTheta, 4);
  });

  it("detects edge-on plane collapse via 2D Screen Jacobian SVD singular values", () => {
    const origin: Vec3 = [2, 3, 1];
    const eFront1: Vec3 = [1, 0, 0];
    const eFront2: Vec3 = [0, 1, 0];
    const svdFront = solve2DScreenJacobianSVD(origin, eFront1, eFront2, ctx);
    expect(svdFront.observable).toBe(true);
    expect(svdFront.sigmaMin).toBeGreaterThan(50);

    // Edge-on plane pointing directly along optical ray (Z)
    const eEdge1: Vec3 = [1, 0, 0];
    const eEdge2: Vec3 = [0, 0, -1];
    const svdEdge = solve2DScreenJacobianSVD(origin, eEdge1, eEdge2, ctx);
    // sigmaMin for edge pointing towards camera collapses to near-zero
    expect(svdEdge.sigmaMin).toBeLessThan(svdFront.sigmaMin * 0.1);
  });
});

describe("degenerate-input escapes (bug-shaker round)", () => {
  it("returns a 180° turn, not the identity, for an antipodal arcball drag", () => {
    // Red before the fix: opposite sphere points produced [0,0,0,-1] — the
    // identity in quaternion clothing — so the largest drag did nothing.
    const q = shoemakeArcballQuat([0, 0, 1], [0, 0, -1]);
    // Unit quaternion with w = 0: a half turn about SOME perpendicular axis.
    expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 9);
    expect(Math.abs(q[3])).toBeLessThan(1e-6);
    // The axis must be perpendicular to the drag start.
    expect(q[0] * 0 + q[1] * 0 + q[2] * 1).toBeCloseTo(0, 6);
    // And an ordinary drag is untouched by the escape: for unit vectors
    // 45° apart, Shoemake's construction yields w = cos 45° exactly (the
    // quat encodes the DOUBLE-angle 90° turn — that is the arcball's
    // defining property, not an approximation to assert loosely).
    const plain = shoemakeArcballQuat([0, 0, 1], [Math.SQRT1_2, 0, Math.SQRT1_2]);
    expect(plain[3]).toBeCloseTo(Math.SQRT1_2, 9);
    expect(Math.hypot(plain[0], plain[1], plain[2], plain[3])).toBeCloseTo(1, 9);
  });

  it("returns an orthonormal, non-zero ring basis for a pick ON the rotation axis", () => {
    // Red before the fix: the projection of an on-axis pick is the zero
    // vector, and normalising it collapsed every ring point to the pivot.
    const { a, b } = buildPickedRingBasis([0, 0, 0], [0, 0, 1], [0, 0, 2.5]);
    expect(Math.hypot(...a)).toBeCloseTo(1, 9);
    expect(Math.hypot(...b)).toBeCloseTo(1, 9);
    expect(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]).toBeCloseTo(0, 9);
    // Both perpendicular to the axis — a real ring plane.
    expect(a[2]).toBeCloseTo(0, 9);
    expect(b[2]).toBeCloseTo(0, 9);
    // An ordinary off-axis pick keeps its anchored phase.
    const { a: a2 } = buildPickedRingBasis([0, 0, 0], [0, 0, 1], [3, 0, 0.4]);
    expect(a2[0]).toBeCloseTo(1, 9);
  });
});

describe("degenerate rotation axes (bug-shaker round)", () => {
  it("substitutes a deterministic axis for a zero axis instead of collapsing the ring basis", () => {
    // normalizeVec3 maps zero to zero, and a zero u zeroes b = u×a even
    // with a good anchor: every ring point became the pivot and the LM
    // solver lost rotation entirely. Red before the fix: |a| and |b| were 0.
    const { a, b } = buildPickedRingBasis([0, 0, 0], [0, 0, 0], [1, 0, 0]);
    expect(Math.hypot(a[0], a[1], a[2])).toBeCloseTo(1, 12);
    expect(Math.hypot(b[0], b[1], b[2])).toBeCloseTo(1, 12);
    // Orthogonal to each other — a real basis, arbitrary phase.
    expect(Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2])).toBeLessThan(1e-9);
  });
});
