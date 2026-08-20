import { describe, expect, it } from "vitest";

describe("Canonical Mathematical Conventions & Fingerprints", () => {
  it("verifies column-major matrix multiplication and layout", () => {
    // Column-major 4x4: basis vectors in cols 0, 1, 2, translation in col 3 (indices 12, 13, 14)
    const T = new Float64Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      10, 20, 30, 1
    ]);
    expect(T[12]).toBe(10);
    expect(T[13]).toBe(20);
    expect(T[14]).toBe(30);
  });

  it("verifies quaternion [x, y, z, w] multiplication and world left-composition", () => {
    function qMul(a: number[], b: number[]): number[] {
      return [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
      ];
    }
    function qNorm(q: number[]): number[] {
      const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
      return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
    }
    function qAxisAngle(axis: number[], angle: number): number[] {
      const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
      const h = angle / 2;
      const s = Math.sin(h) / len;
      return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
    }
    function rotateVec3(q: number[], v: number[]): number[] {
      const [x, y, z, w] = q;
      const qv = [
        w * v[0] + y * v[2] - z * v[1],
        w * v[1] + z * v[0] - x * v[2],
        w * v[2] + x * v[1] - y * v[0],
        -x * v[0] - y * v[1] - z * v[2],
      ];
      return [
        qv[0] * w - qv[3] * x - qv[1] * z + qv[2] * y,
        qv[1] * w - qv[3] * y - qv[2] * x + qv[0] * z,
        qv[2] * w - qv[3] * z - qv[0] * y + qv[1] * x,
      ];
    }

    const q0 = qAxisAngle([1, 0, 0], Math.PI / 4);
    const uLocal = [0, 1, 0];
    const uWorld = rotateVec3(q0, uLocal);

    const qDeltaWorld = qAxisAngle(uWorld, Math.PI / 2);
    const qNextLeft = qNorm(qMul(qDeltaWorld, q0));

    const qDeltaLocal = qAxisAngle(uLocal, Math.PI / 2);
    const qNextRight = qNorm(qMul(q0, qDeltaLocal));

    for (let i = 0; i < 4; i++) {
      expect(qNextLeft[i]).toBeCloseTo(qNextRight[i], 6);
    }
  });

  it("verifies perspective matrix NDC depth mapping z = -n -> -1 and z = -f -> +1", () => {
    function perspective(fovy: number, aspect: number, near: number, far: number): Float64Array {
      const f = 1 / Math.tan(fovy / 2);
      const o = new Float64Array(16);
      o[0] = f / aspect;
      o[5] = f;
      o[10] = (far + near) / (near - far);
      o[11] = -1;
      o[14] = (2 * far * near) / (near - far);
      return o;
    }

    const near = 0.1;
    const far = 100.0;
    const P = perspective(Math.PI / 4, 1.5, near, far);

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
