import { describe, expect, it } from "vitest";
import {
  buildProjectionContext,
  clipWorldSegmentToViewFrustum,
  constantScreenGizmoWorldRadius,
  handleObservabilityScreenPx,
  projectWorldToScreen,
  screenJacobianAtWorldPoint,
  screenToWorldRay,
  type CameraState,
  type Vec3,
  type ViewportMetrics,
} from "../src/viewer/math/projection.js";

describe("Canonical Projection Pipeline (projection.ts)", () => {
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

  it("projects world points to CSS pixels within viewport", () => {
    // Point at (2, 3, 1) is directly in front of camera (offset along -Z by 5m)
    const pCenter: Vec3 = [2, 3, 1];
    const s = projectWorldToScreen(pCenter, ctx);
    expect(s.valid).toBe(true);
    expect(s.x).toBeCloseTo(600, 4); // Center of 1200px width
    expect(s.y).toBeCloseTo(400, 4); // Center of 800px height
    expect(s.viewDepth).toBeCloseTo(5.0, 4);
  });

  it("unprojects screen points to rays passing through the original 3D points", () => {
    const testPoints: Vec3[] = [
      [1.5, 2.2, 0.5],
      [3.0, 4.0, 2.0],
      [0.0, 0.0, -10.0],
    ];

    for (const p of testPoints) {
      const s = projectWorldToScreen(p, ctx);
      expect(s.valid).toBe(true);

      const ray = screenToWorldRay([s.x, s.y], ctx);

      // Distance from p to ray line: dist = ||(p - o) - ((p - o) . d) d||
      const po: Vec3 = [p[0] - ray.origin[0], p[1] - ray.origin[1], p[2] - ray.origin[2]];
      const poDotD = po[0] * ray.dir[0] + po[1] * ray.dir[1] + po[2] * ray.dir[2];
      const proj: Vec3 = [ray.origin[0] + poDotD * ray.dir[0], ray.origin[1] + poDotD * ray.dir[1], ray.origin[2] + poDotD * ray.dir[2]];
      const dist = Math.hypot(p[0] - proj[0], p[1] - proj[1], p[2] - proj[2]);

      expect(dist).toBeLessThan(1e-10);
    }
  });

  it("evaluates analytical Screen Projection Jacobian matching central finite differences", () => {
    const p: Vec3 = [1.2, 2.5, 1.0];
    const J_diff = screenJacobianAtWorldPoint(p, ctx);
    expect(J_diff.valid).toBe(true);

    const h = 1e-6;
    for (let axis = 0; axis < 3; axis++) {
      const pPlus: Vec3 = [...p];
      const pMinus: Vec3 = [...p];
      pPlus[axis] += h;
      pMinus[axis] -= h;

      const sPlus = projectWorldToScreen(pPlus, ctx);
      const sMinus = projectWorldToScreen(pMinus, ctx);

      const numDx = (sPlus.x - sMinus.x) / (2 * h);
      const numDy = (sPlus.y - sMinus.y) / (2 * h);

      expect(J_diff.jacobian[0][axis]).toBeCloseTo(numDx, 2);
      expect(J_diff.jacobian[1][axis]).toBeCloseTo(numDy, 2);
    }
  });

  it("clips segments crossing behind the near plane before perspective division", () => {
    const pInFront: Vec3 = [2, 3, 5]; // z = 5 (viewDepth = 1m in front)
    const pBehind: Vec3 = [2, 3, 10]; // z = 10 (viewDepth = -4m behind camera)

    const clip = clipWorldSegmentToViewFrustum(pInFront, pBehind, ctx);
    expect(clip.visible).toBe(true);
    expect(clip.clippedP0[2]).toBeCloseTo(5, 4);
    // Clipped endpoint must have viewDepth >= near plane
    expect(clip.clippedP1[2]).toBeLessThanOrEqual(5.9); // near plane is at z = 5.9
  });

  it("calculates constant-screen gizmo world radius at pivot depth", () => {
    const pivot: Vec3 = [2, 3, 1]; // viewDepth = 5m
    const rWorld = constantScreenGizmoWorldRadius(pivot, 96, ctx);
    // At viewDepth = 5m, fovY = 45 deg, H = 800:
    // eta = 2 * 5 * tan(22.5 deg) / 800 = 10 * 0.41421356 / 800 = 0.00517767
    // rWorld = 96 * 0.00517767 = 0.497056 m
    expect(rWorld).toBeCloseTo(0.497056, 4);
  });
});
