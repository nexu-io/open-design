/**
 * Multi-Selection Group Transforms & Polar TRS Decomposition
 * Implements Sim(3) group matrix batching with translation,
 * volume-weighted selection barycenter, continuity-aware reflection axis selection (Fx, Fy, Fz),
 * and relative shear residual metrics.
 */

import {
  mulMat4,
  normalizeVec3,
  type Mat4,
  type Quat,
  type Vec3,
} from "./projection.js";

export interface PolarTRSResult {
  translation: Vec3;
  rotation: Quat; // [x, y, z, w] with det(R) = +1 in SO(3)
  scale: Vec3; // Signed scale preserving reflected axis
  shearResidual: number;
  isSheared: boolean;
  chosenReflectionAxis: "none" | "X" | "Y" | "Z";
  /**
   * At least one basis column collapsed to zero length, so the rotation
   * reported for it is a placeholder rather than a measurement. Callers
   * must not write this back as an authored transform.
   */
  degenerate: boolean;
}

/* -------------------------------------------------------------------------- */
/* Matrix & Translation Helpers                                               */
/* -------------------------------------------------------------------------- */

export function translationMatrix(t: Vec3): Mat4 {
  return new Float64Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    t[0], t[1], t[2], 1,
  ]);
}

export function scaleMatrix(s: Vec3): Mat4 {
  return new Float64Array([
    s[0], 0, 0, 0,
    0, s[1], 0, 0,
    0, 0, s[2], 0,
    0, 0, 0, 1,
  ]);
}

export function rotationMatrixFromQuat(q: Quat): Mat4 {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;

  return new Float64Array([
    1 - (yy + zz), xy + wz, xz - wy, 0,
    xy - wz, 1 - (xx + zz), yz + wx, 0,
    xz + wy, yz - wx, 1 - (xx + yy), 0,
    0, 0, 0, 1,
  ]);
}

export function quatFromRotationMatrix(R: number[]): Quat {
  /*
   * R is a 3x3 in COLUMN-major order, matching rotationMatrixFromQuat and
   * the Mat4 layout used everywhere else here:
   *
   *   index 0 1 2 3 4 5 6 7 8
   *   entry R00 R10 R20 R01 R11 R21 R02 R12 R22
   *
   * The antisymmetric terms therefore read (R21 - R12) = R[5] - R[7], and
   * so on. They were written the other way round, which returns the
   * CONJUGATE — a rotation of the same magnitude about the opposite axis.
   * Nothing caught it because it is self-consistent: the quaternion is
   * still unit length, still valid SO(3), and round-trips cleanly through
   * any test that only feeds identity or an axis-aligned matrix. Only a
   * general rotation shows it, and then the whole selection turns the
   * wrong way.
   */
  const tr = R[0] + R[4] + R[8];
  let x = 0, y = 0, z = 0, w = 1;

  if (tr > 0) {
    const s = Math.sqrt(tr + 1.0) * 2;
    w = 0.25 * s;
    x = (R[5] - R[7]) / s;
    y = (R[6] - R[2]) / s;
    z = (R[1] - R[3]) / s;
  } else if (R[0] > R[4] && R[0] > R[8]) {
    const s = Math.sqrt(1.0 + R[0] - R[4] - R[8]) * 2;
    w = (R[5] - R[7]) / s;
    x = 0.25 * s;
    y = (R[1] + R[3]) / s;
    z = (R[2] + R[6]) / s;
  } else if (R[4] > R[8]) {
    const s = Math.sqrt(1.0 + R[4] - R[0] - R[8]) * 2;
    w = (R[6] - R[2]) / s;
    x = (R[1] + R[3]) / s;
    y = 0.25 * s;
    z = (R[5] + R[7]) / s;
  } else {
    const s = Math.sqrt(1.0 + R[8] - R[0] - R[4]) * 2;
    w = (R[1] - R[3]) / s;
    x = (R[2] + R[6]) / s;
    y = (R[5] + R[7]) / s;
    z = 0.25 * s;
  }

  const len = Math.hypot(x, y, z, w) || 1;
  return [x / len, y / len, z / len, w / len];
}

/* -------------------------------------------------------------------------- */
/* Multi-Selection Sim(3) Group Matrix Builder                                */
/* -------------------------------------------------------------------------- */

export function buildMultiSelectionGroupMatrix(
  deltaTranslationWorld: Vec3,
  pivotWorld: Vec3,
  deltaRotationWorld: Quat,
  uniformScale: number
): Mat4 {
  const T_delta = translationMatrix(deltaTranslationWorld);
  const T_p = translationMatrix(pivotWorld);
  const T_neg_p = translationMatrix([-pivotWorld[0], -pivotWorld[1], -pivotWorld[2]]);
  const R_delta = rotationMatrixFromQuat(deltaRotationWorld);
  const S_factor = scaleMatrix([uniformScale, uniformScale, uniformScale]);

  // G = T(deltaT) * T(p) * R(deltaQ) * S(s) * T(-p)
  const pivotTransform = mulMat4(T_p, mulMat4(R_delta, mulMat4(S_factor, T_neg_p)));
  return mulMat4(T_delta, pivotTransform);
}

/* -------------------------------------------------------------------------- */
/* Polar TRS Decomposition with Continuity-Aware Reflection Selection         */
/* -------------------------------------------------------------------------- */

export function decomposePolarTRSWithContinuity(
  M: Mat4,
  qRef?: Quat,
  sRef?: Vec3,
  shearTolerance: number = 1e-4
): PolarTRSResult {
  const translation: Vec3 = [M[12], M[13], M[14]];

  // 3x3 column vectors from column-major matrix
  const c0: Vec3 = [M[0], M[1], M[2]];
  const c1: Vec3 = [M[4], M[5], M[6]];
  const c2: Vec3 = [M[8], M[9], M[10]];

  const sxRaw = Math.hypot(c0[0], c0[1], c0[2]);
  const syRaw = Math.hypot(c1[0], c1[1], c1[2]);
  const szRaw = Math.hypot(c2[0], c2[1], c2[2]);

  /*
   * A collapsed axis has no recoverable rotation: the column is the zero
   * vector, so its direction is not merely imprecise, it does not exist.
   * Substituting 1 to avoid the division — which is what this did — hands
   * back a singular basis dressed up as a unit quaternion, and the caller
   * has no way to tell. The substitution stays, because the other two axes
   * are still worth reporting, but the result now says so.
   *
   * The threshold is relative to the largest axis: an object modelled in
   * millimetres has legitimately small columns, and a fixed epsilon would
   * call the whole thing degenerate.
   */
  const largest = Math.max(sxRaw, syRaw, szRaw);
  const collapseEpsilon = Math.max(1e-12, largest * 1e-9);
  const degenerate =
    sxRaw <= collapseEpsilon || syRaw <= collapseEpsilon || szRaw <= collapseEpsilon;

  const sx = sxRaw > collapseEpsilon ? sxRaw : 1;
  const sy = syRaw > collapseEpsilon ? syRaw : 1;
  const sz = szRaw > collapseEpsilon ? szRaw : 1;

  // Raw rotation columns
  const r0: Vec3 = [c0[0] / sx, c0[1] / sx, c0[2] / sx];
  const r1: Vec3 = [c1[0] / sy, c1[1] / sy, c1[2] / sy];
  const r2: Vec3 = [c2[0] / sz, c2[1] / sz, c2[2] / sz];

  // Determinant of R_raw
  const detR_raw =
    r0[0] * (r1[1] * r2[2] - r1[2] * r2[1]) -
    r1[0] * (r0[1] * r2[2] - r0[2] * r2[1]) +
    r2[0] * (r0[1] * r1[2] - r0[2] * r1[1]);

  let finalScale: Vec3 = [sx, sy, sz];
  let finalR: number[] = [r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], r2[0], r2[1], r2[2]];
  let chosenAxis: "none" | "X" | "Y" | "Z" = "none";
  let rotation = quatFromRotationMatrix(finalR);

  if (detR_raw < 0) {
    /*
     * A mirrored matrix A = RS with det(R) = -1 has three equally exact
     * decompositions — one per axis sign flip F_i — all of which reproduce
     * A. Choosing between them on SCALE DISTANCE ALONE, which is what this
     * did, is not enough: on a pure reflection the three candidate scales
     * are equidistant from any symmetric reference, the comparison ties,
     * and the first candidate wins by iteration order. The rotations behind
     * those three scales differ by 180 degrees, so an object mirrored in Y
     * comes back as an X-mirror plus a half turn and visibly pops.
     *
     * The cost therefore carries both terms, as the derivation requires:
     *
     *   E_i = wR * d_SO(3)(R_i, R_ref)^2 + wS * || s_i - s_ref ||^2
     *
     * with the rotation distance taken as 1 - |<q_i, q_ref>|, the standard
     * quaternion metric, absolute so that q and -q read as the same
     * orientation. Rotation is weighted above scale because a half-turn is
     * the failure a user actually sees; a sign landing on a different axis
     * with the same visual result is not.
     */
    const F_candidates: Array<{ axis: "X" | "Y" | "Z"; F: Vec3 }> = [
      { axis: "X", F: [-1, 1, 1] },
      { axis: "Y", F: [1, -1, 1] },
      { axis: "Z", F: [1, 1, -1] },
    ];

    const refScale = sRef || [1, 1, 1];
    const W_ROTATION = 4;
    const W_SCALE = 1;
    let minCost = Infinity;

    for (const cand of F_candidates) {
      const sCandidate: Vec3 = [sx * cand.F[0], sy * cand.F[1], sz * cand.F[2]];
      const rCandidate = [
        r0[0] * cand.F[0], r0[1] * cand.F[0], r0[2] * cand.F[0],
        r1[0] * cand.F[1], r1[1] * cand.F[1], r1[2] * cand.F[1],
        r2[0] * cand.F[2], r2[1] * cand.F[2], r2[2] * cand.F[2],
      ];
      const qCandidate = quatFromRotationMatrix(rCandidate);

      const scaleCost =
        (sCandidate[0] - refScale[0]) ** 2 +
        (sCandidate[1] - refScale[1]) ** 2 +
        (sCandidate[2] - refScale[2]) ** 2;
      // No reference orientation means no continuity to preserve, so the
      // rotation term drops out rather than being measured against a made
      // up identity.
      const rotationCost = qRef
        ? 1 -
          Math.abs(
            qCandidate[0] * qRef[0] +
              qCandidate[1] * qRef[1] +
              qCandidate[2] * qRef[2] +
              qCandidate[3] * qRef[3],
          )
        : 0;
      const cost = W_ROTATION * rotationCost * rotationCost + W_SCALE * scaleCost;

      if (cost < minCost) {
        minCost = cost;
        chosenAxis = cand.axis;
        finalScale = sCandidate;
        finalR = rCandidate;
        rotation = qCandidate;
      }
    }
  }

  // Sign continuity against previous rotation representation
  if (qRef) {
    const dot = rotation[0] * qRef[0] + rotation[1] * qRef[1] + rotation[2] * qRef[2] + rotation[3] * qRef[3];
    if (dot < 0) {
      rotation[0] = -rotation[0];
      rotation[1] = -rotation[1];
      rotation[2] = -rotation[2];
      rotation[3] = -rotation[3];
    }
  }

  // Relative shear residual computation
  const dot01 = r0[0] * r1[0] + r0[1] * r1[1] + r0[2] * r1[2];
  const dot02 = r0[0] * r2[0] + r0[1] * r2[1] + r0[2] * r2[2];
  const dot12 = r1[0] * r2[0] + r1[1] * r2[1] + r1[2] * r2[2];
  const shearResidual = Math.sqrt(dot01 * dot01 + dot02 * dot02 + dot12 * dot12);

  return {
    translation,
    rotation,
    scale: finalScale,
    shearResidual,
    isSheared: shearResidual > shearTolerance,
    chosenReflectionAxis: chosenAxis,
    degenerate,
  };
}

/* -------------------------------------------------------------------------- */
/* Volume-Weighted Selection Barycenter                                       */
/* -------------------------------------------------------------------------- */

export interface PartBoundingVolume {
  id: string;
  localCenter: Vec3;
  localVolume: number;
  worldTransform: Mat4;
}

export function computeVolumeWeightedBarycenter(parts: PartBoundingVolume[]): Vec3 {
  if (parts.length === 0) return [0, 0, 0];

  let sumWeights = 0;
  let sumX = 0, sumY = 0, sumZ = 0;

  for (const part of parts) {
    const M = part.worldTransform;
    const lc = part.localCenter;

    // Transform local center to world
    const wx = M[0] * lc[0] + M[4] * lc[1] + M[8] * lc[2] + M[12];
    const wy = M[1] * lc[0] + M[5] * lc[1] + M[9] * lc[2] + M[13];
    const wz = M[2] * lc[0] + M[6] * lc[1] + M[10] * lc[2] + M[14];

    // Compute determinant of linear 3x3 to scale volume
    const detLin =
      M[0] * (M[5] * M[10] - M[6] * M[9]) -
      M[4] * (M[1] * M[10] - M[2] * M[9]) +
      M[8] * (M[1] * M[6] - M[2] * M[5]);

    const weight = Math.max(1e-6, part.localVolume * Math.abs(detLin));
    sumWeights += weight;
    sumX += wx * weight;
    sumY += wy * weight;
    sumZ += wz * weight;
  }

  if (sumWeights <= 1e-6) {
    // Arithmetic mean fallback
    let ax = 0, ay = 0, az = 0;
    for (const p of parts) {
      ax += p.worldTransform[12];
      ay += p.worldTransform[13];
      az += p.worldTransform[14];
    }
    return [ax / parts.length, ay / parts.length, az / parts.length];
  }

  return [sumX / sumWeights, sumY / sumWeights, sumZ / sumWeights];
}
