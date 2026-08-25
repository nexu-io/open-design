import { describe, expect, it } from "vitest";
import {
  mulMat4,
  perspectiveMatrix,
  rotateVec3WithQuat,
  type Mat4,
  type Quat,
  type Vec3,
} from "../src/viewer/math/projection.js";
import {
  rotationMatrixFromQuat,
  translationMatrix,
} from "../src/viewer/math/group-transforms.js";

/**
 * Fixture-only helper: builds a unit quaternion for a rotation of `angle`
 * radians about `axis`. This is test INPUT construction (mirroring how
 * projection.test.ts hardcodes camera rotations as literal quaternions),
 * not a re-implementation of anything under test — every assertion below
 * runs the axis-angle result through the real exported functions
 * (`rotateVec3WithQuat`, `rotationMatrixFromQuat`, `mulMat4`,
 * `perspectiveMatrix`).
 */
function axisAngleQuatFixture(axis: Vec3, angle: number): Quat {
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const h = angle / 2;
  const s = Math.sin(h) / len;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
}

describe("Canonical Mathematical Conventions & Fingerprints", () => {
  it("verifies column-major matrix layout via translationMatrix()", () => {
    // Column-major 4x4: basis vectors in cols 0, 1, 2, translation in col 3 (indices 12, 13, 14)
    const T: Mat4 = translationMatrix([10, 20, 30]);
    expect(T[12]).toBe(10);
    expect(T[13]).toBe(20);
    expect(T[14]).toBe(30);
  });

  it("verifies quaternion world left-composition vs local right-composition via rotationMatrixFromQuat/mulMat4", () => {
    const q0 = axisAngleQuatFixture([1, 0, 0], Math.PI / 4);
    const uLocal: Vec3 = [0, 1, 0];
    const uWorld = rotateVec3WithQuat(q0, uLocal);

    // World-space delta applied on the LEFT: R(qDeltaWorld) * R(q0)
    const qDeltaWorld = axisAngleQuatFixture(uWorld, Math.PI / 2);
    const rNextLeft = mulMat4(rotationMatrixFromQuat(qDeltaWorld), rotationMatrixFromQuat(q0));

    // Local-space delta applied on the RIGHT: R(q0) * R(qDeltaLocal)
    const qDeltaLocal = axisAngleQuatFixture(uLocal, Math.PI / 2);
    const rNextRight = mulMat4(rotationMatrixFromQuat(q0), rotationMatrixFromQuat(qDeltaLocal));

    // Both compositions describe the same physical rotation (a world-axis
    // delta and its equivalent local-axis delta produce the same matrix),
    // which is the load-bearing convention the old local qMul reimplementation
    // asserted — now checked against the matrices the real pipeline builds.
    for (let i = 0; i < 16; i++) {
      expect(rNextLeft[i]).toBeCloseTo(rNextRight[i], 6);
    }
  });

  it("verifies perspectiveMatrix() NDC depth mapping z = -n -> -1 and z = -f -> +1", () => {
    const near = 0.1;
    const far = 100.0;
    const P = perspectiveMatrix(Math.PI / 4, 1.5, near, far);

    // Point on near plane: (0, 0, -near)
    const pNear = [0, 0, -near, 1];
    const cNear_z = P[2] * pNear[0] + P[6] * pNear[1] + P[10] * pNear[2] + P[14] * pNear[3];
    const cNear_w = P[3] * pNear[0] + P[7] * pNear[1] + P[11] * pNear[2] + P[15] * pNear[3];
    const ndcNear_z = cNear_z / cNear_w;
    expect(ndcNear_z).toBeCloseTo(-1.0, 6);

    // Point on far plane: (0, 0, -far)
    const pFar = [0, 0, -far, 1];
    const cFar_z = P[2] * pFar[0] + P[6] * pFar[1] + P[10] * pFar[2] + P[14] * pFar[3];
    const cFar_w = P[3] * pFar[0] + P[7] * pFar[1] + P[11] * pFar[2] + P[15] * pFar[3];
    const ndcFar_z = cFar_z / cFar_w;
    expect(ndcFar_z).toBeCloseTo(1.0, 6);
  });
});
