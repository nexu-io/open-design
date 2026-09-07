import { describe, expect, it } from "vitest";
import {
  buildMultiSelectionGroupMatrix,
  computeVolumeWeightedBarycenter,
  decomposePolarTRSWithContinuity,
  quatFromRotationMatrix,
  rotationMatrixFromQuat,
  scaleMatrix,
  translationMatrix,
} from "../src/viewer/math/group-transforms.js";
import {
  mulMat4,
  rotateVec3WithQuat,
  type Quat,
  type Vec3,
} from "../src/viewer/math/projection.js";

/** A rotation with nothing symmetric about it, so no sign error can hide. */
function tiltedRotation(angle: number): Quat {
  const axis: Vec3 = [0.3, 0.6, 0.74162]; // normalised below, so exactness is not required
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  const s = Math.sin(angle / 2) / len;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
}

describe("Multi-Selection Group Transforms & Polar TRS (group-transforms.ts)", () => {
  it("translates, rotates, and scales multiple selected parts about the shared pivot", () => {
    const pivot: Vec3 = [5, 2, -3];
    const deltaT: Vec3 = [2, -1, 4];
    const deltaQ = [0, 0, 0, 1] as [number, number, number, number]; // Identity rotation
    const uniformScale = 1.5;

    const G = buildMultiSelectionGroupMatrix(deltaT, pivot, deltaQ, uniformScale);

    // Initial point at pivot
    const pWorld0 = translationMatrix(pivot);
    const pWorldNext = mulMat4(G, pWorld0);

    expect(pWorldNext[12]).toBeCloseTo(pivot[0] + deltaT[0], 5);
    expect(pWorldNext[13]).toBeCloseTo(pivot[1] + deltaT[1], 5);
    expect(pWorldNext[14]).toBeCloseTo(pivot[2] + deltaT[2], 5);
  });

  it("decomposes mirrored matrix with single-axis reflection Fx = diag(-1, 1, 1) into valid SO(3) rotation", () => {
    // Mirrored matrix with X-mirroring and scale [-2, 3, 1]
    const M_mirrored = scaleMatrix([-2, 3, 1]);

    const res = decomposePolarTRSWithContinuity(M_mirrored, [0, 0, 0, 1], [-2, 3, 1]);

    expect(res.chosenReflectionAxis).toBe("X");
    expect(res.scale[0]).toBeCloseTo(-2, 5);
    expect(res.scale[1]).toBeCloseTo(3, 5);
    expect(res.scale[2]).toBeCloseTo(1, 5);
    expect(res.isSheared).toBe(false);

    // Rotation quaternion must have unit length
    const quatLen = Math.hypot(res.rotation[0], res.rotation[1], res.rotation[2], res.rotation[3]);
    expect(quatLen).toBeCloseTo(1.0, 5);
  });

  it("detects shear distortion via relative shear residual", () => {
    // Pure diagonal TRS scale
    const M_pure = scaleMatrix([2, 3, 4]);
    const resPure = decomposePolarTRSWithContinuity(M_pure);
    expect(resPure.isSheared).toBe(false);
    expect(resPure.shearResidual).toBeCloseTo(0, 5);

    // Sheared matrix
    const M_sheared = new Float64Array([
      2, 0.8, 0, 0,
      0.8, 3, 0, 0,
      0, 0, 4, 0,
      0, 0, 0, 1,
    ]);
    const resSheared = decomposePolarTRSWithContinuity(M_sheared);
    expect(resSheared.isSheared).toBe(true);
    expect(resSheared.shearResidual).toBeGreaterThan(0.05);
  });

  /**
   * The extraction is checked by what the rotation DOES, not by whether the
   * quaternion is well formed.
   *
   * Every case in this file used to be identity or axis-aligned, and the
   * only assertion on the quaternion was that it had unit length. A
   * conjugated extraction satisfies both — it is a perfectly valid rotation
   * of the same magnitude about the opposite axis — so the suite passed
   * while the decomposition returned the inverse of every general rotation
   * handed to it. Rotating a vector both ways and comparing is the check
   * that cannot be satisfied by the wrong answer.
   */
  it("recovers a general rotation, not its conjugate", () => {
    for (const angle of [0.7, 2.4, -1.1, Math.PI - 0.05]) {
      const q = tiltedRotation(angle);
      const M = rotationMatrixFromQuat(q);
      const recovered = quatFromRotationMatrix([
        M[0], M[1], M[2],
        M[4], M[5], M[6],
        M[8], M[9], M[10],
      ]);

      for (const v of [[1, 0, 0], [0, 1, 0], [0.2, -0.7, 0.5]] as Vec3[]) {
        const byMatrix = [
          M[0] * v[0] + M[4] * v[1] + M[8] * v[2],
          M[1] * v[0] + M[5] * v[1] + M[9] * v[2],
          M[2] * v[0] + M[6] * v[1] + M[10] * v[2],
        ];
        const byQuat = rotateVec3WithQuat(recovered, v);
        expect(byQuat[0]).toBeCloseTo(byMatrix[0], 9);
        expect(byQuat[1]).toBeCloseTo(byMatrix[1], 9);
        expect(byQuat[2]).toBeCloseTo(byMatrix[2], 9);
      }
    }
  });

  it("carries a general rotation through the full TRS decomposition", () => {
    const q = tiltedRotation(1.3);
    const R = rotationMatrixFromQuat(q);
    const M = mulMat4(R, scaleMatrix([2, 2, 2]));

    const res = decomposePolarTRSWithContinuity(M);
    expect(res.degenerate).toBe(false);
    expect(res.chosenReflectionAxis).toBe("none");

    const v: Vec3 = [0.2, -0.7, 0.5];
    const expected = rotateVec3WithQuat(q, v);
    const actual = rotateVec3WithQuat(res.rotation, v);
    expect(actual[0]).toBeCloseTo(expected[0], 9);
    expect(actual[1]).toBeCloseTo(expected[1], 9);
    expect(actual[2]).toBeCloseTo(expected[2], 9);
  });

  /**
   * On a pure reflection all three axis choices reproduce the matrix and
   * all three sit the same distance from a symmetric reference scale, so
   * scale alone cannot decide. Only the reference ORIENTATION can, and
   * without it the tie is broken by iteration order: an object mirrored in
   * Y comes back as an X-mirror plus a half turn.
   */
  it("breaks a tied reflection on orientation, not on iteration order", () => {
    const mirrorAll = scaleMatrix([-1, -1, -1]);
    const qAboutY: Quat = [0, 1, 0, 0];
    const qAboutZ: Quat = [0, 0, 1, 0];

    expect(
      decomposePolarTRSWithContinuity(mirrorAll, qAboutY, [1, 1, 1]).chosenReflectionAxis,
    ).toBe("Y");
    expect(
      decomposePolarTRSWithContinuity(mirrorAll, qAboutZ, [1, 1, 1]).chosenReflectionAxis,
    ).toBe("Z");
  });

  /**
   * A collapsed axis has no recoverable rotation. The substitution that
   * keeps the maths finite must not also make the result look measured.
   */
  it("reports a collapsed basis axis instead of returning a plausible rotation", () => {
    expect(decomposePolarTRSWithContinuity(scaleMatrix([2, 0, 3])).degenerate).toBe(true);
    expect(decomposePolarTRSWithContinuity(scaleMatrix([2, 1, 3])).degenerate).toBe(false);
    // Relative threshold: a model authored in millimetres is small, not
    // collapsed.
    expect(
      decomposePolarTRSWithContinuity(scaleMatrix([1e-4, 1e-4, 1e-4])).degenerate,
    ).toBe(false);
  });

  it("computes volume-weighted barycentric pivot correctly", () => {
    const parts = [
      {
        id: "large_box",
        localCenter: [0, 0, 0] as Vec3,
        localVolume: 10.0,
        worldTransform: translationMatrix([0, 0, 0]),
      },
      {
        id: "small_box",
        localCenter: [0, 0, 0] as Vec3,
        localVolume: 1.0,
        worldTransform: translationMatrix([11, 0, 0]),
      },
    ];

    const bary = computeVolumeWeightedBarycenter(parts);
    // Weight of large box is 10, small box is 1. (0*10 + 11*1) / 11 = 1.0
    expect(bary[0]).toBeCloseTo(1.0, 4);
    expect(bary[1]).toBeCloseTo(0.0, 4);
    expect(bary[2]).toBeCloseTo(0.0, 4);
  });
});

describe("sheared decomposition returns a real rotation (bug-shaker round)", () => {
  it("extracts a unit quaternion whose matrix is orthonormal even under shear", () => {
    // Red before the fix: the quaternion was read off non-orthogonal
    // columns, so it represented no rotation at all — reconstruction from
    // it changed the authored transform even when the caller checked
    // isSheared. Column-major matrix with an x-into-y shear of 0.4.
    const sheared: number[] = [
      1, 0, 0, 0,
      0.4, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const d = decomposePolarTRSWithContinuity(sheared as never);
    expect(d.isSheared).toBe(true);
    expect(d.shearResidual).toBeGreaterThan(0.1);
    // The returned rotation is a REAL rotation: unit quaternion, and its
    // matrix has orthonormal columns to floating point.
    const q = d.rotation;
    expect(Math.hypot(q[0], q[1], q[2], q[3])).toBeCloseTo(1, 9);
    const R = rotationMatrixFromQuat(q);
    const col = (i: number) => [R[i * 4], R[i * 4 + 1], R[i * 4 + 2]] as const;
    for (let i = 0; i < 3; i++) {
      const ci = col(i);
      expect(Math.hypot(ci[0], ci[1], ci[2])).toBeCloseTo(1, 6);
      for (let j = i + 1; j < 3; j++) {
        const cj = col(j);
        expect(ci[0] * cj[0] + ci[1] * cj[1] + ci[2] * cj[2]).toBeCloseTo(0, 6);
      }
    }
  });

  it("leaves a clean rotation matrix bit-stable through the orthonormalisation", () => {
    // The escape must be the identity on orthonormal input: a plain 30°
    // z-rotation with scale [2, 3, 4] decomposes exactly as before.
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    const M: number[] = [
      2 * c, 2 * s, 0, 0,
      -3 * s, 3 * c, 0, 0,
      0, 0, 4, 0,
      1, 2, 3, 1,
    ];
    const d = decomposePolarTRSWithContinuity(M as never);
    expect(d.isSheared).toBe(false);
    expect(d.scale[0]).toBeCloseTo(2, 9);
    expect(d.scale[1]).toBeCloseTo(3, 9);
    expect(d.scale[2]).toBeCloseTo(4, 9);
    const R = rotationMatrixFromQuat(d.rotation);
    expect(R[0]).toBeCloseTo(c, 9);
    expect(R[1]).toBeCloseTo(s, 9);
  });
});

describe("singular nonzero bases (bug-shaker round)", () => {
  it("marks a collinear-column matrix degenerate instead of returning a fake rotation", () => {
    // All three columns nonzero (so the length-based check passes) but
    // collinear: Gram-Schmidt annihilates the projections and falls back to
    // the raw directions, leaving the frame singular. Red before the fix:
    // degenerate=false over a rotation no decomposition produced, which a
    // caller could write back as an authored transform.
    const collinear = new Float64Array([
      1, 0, 0, 0,
      2, 0, 0, 0,
      3, 0, 0, 0,
      0, 0, 0, 1,
    ]);
    const res = decomposePolarTRSWithContinuity(collinear);
    expect(res.degenerate).toBe(true);
  });

  it("does not mark a clean orthonormal frame degenerate", () => {
    const identity = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(decomposePolarTRSWithContinuity(identity).degenerate).toBe(false);
  });
});
