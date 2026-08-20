/**
 * Canonical Projective Viewport Pipeline & Differentials
 * Single source of truth for forward projection, inverse ray unprojection,
 * view-frustum clipping, and screen projection Jacobians.
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // [x, y, z, w]
export type Mat4 = Float64Array;

export interface CameraState {
  position: Vec3;
  rotation: Quat; // camera-local -> world
  fovY: number;
  near: number;
  far: number;
}

export interface ViewportMetrics {
  cssWidth: number;
  cssHeight: number;
  drawingBufferWidth: number;
  drawingBufferHeight: number;
}

export interface Ray {
  origin: Vec3;
  dir: Vec3; // normalized
}

export interface ProjectionContext {
  camera: CameraState;
  viewport: ViewportMetrics;
  view: Mat4;
  projection: Mat4;
  viewProjection: Mat4;
  inverseViewProjection: Mat4;
  cameraRightWorld: Vec3;
  cameraUpWorld: Vec3;
  cameraForwardWorld: Vec3;
}

export interface ProjectedScreenPoint {
  x: number;
  y: number;
  viewDepth: number;
  valid: boolean;
  ndcX: number;
  ndcY: number;
  clipW: number;
}

export interface ProjectionDifferential {
  jacobian: [[number, number, number], [number, number, number]];
  valid: boolean;
  clipW: number;
  viewDepth: number;
}

/* -------------------------------------------------------------------------- */
/* Linear Algebra Helpers (Double Precision)                                  */
/* -------------------------------------------------------------------------- */

export function normalizeVec3(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dotVec3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function rotateVec3WithQuat(q: Quat, v: Vec3): Vec3 {
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

export function mulMat4(a: Mat4, b: Mat4): Mat4 {
  const o = new Float64Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) {
        s += a[k * 4 + r] * b[c * 4 + k];
      }
      o[c * 4 + r] = s;
    }
  }
  return o;
}

export function invertMat4(m: Mat4): Mat4 {
  const inv = new Float64Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];

  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];

  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];

  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];

  let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (det === 0) return new Float64Array(16);
  det = 1.0 / det;
  for (let i = 0; i < 16; i++) inv[i] *= det;
  return inv;
}

export function perspectiveMatrix(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  const o = new Float64Array(16);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) / (near - far);
  o[11] = -1;
  o[14] = (2 * far * near) / (near - far);
  return o;
}

export function viewMatrixFromCamera(position: Vec3, rotation: Quat): Mat4 {
  // Camera basis vectors in world space:
  const right = rotateVec3WithQuat(rotation, [1, 0, 0]);
  const up = rotateVec3WithQuat(rotation, [0, 1, 0]);
  const forward = rotateVec3WithQuat(rotation, [0, 0, -1]); // -Z forward

  // View matrix rotates by inverse rotation (transpose) and translates by -position
  const zAxis: Vec3 = [-forward[0], -forward[1], -forward[2]]; // +Z points backward in eye space
  return new Float64Array([
    right[0], up[0], zAxis[0], 0,
    right[1], up[1], zAxis[1], 0,
    right[2], up[2], zAxis[2], 0,
    -dotVec3(right, position), -dotVec3(up, position), -dotVec3(zAxis, position), 1,
  ]);
}

/* -------------------------------------------------------------------------- */
/* Canonical Context Builder                                                  */
/* -------------------------------------------------------------------------- */

export function buildProjectionContext(camera: CameraState, viewport: ViewportMetrics): ProjectionContext {
  const aspect = viewport.drawingBufferWidth / Math.max(1, viewport.drawingBufferHeight);
  const P = perspectiveMatrix(camera.fovY, aspect, camera.near, camera.far);
  const V = viewMatrixFromCamera(camera.position, camera.rotation);
  const PV = mulMat4(P, V);
  const invPV = invertMat4(PV);

  const cameraRightWorld = rotateVec3WithQuat(camera.rotation, [1, 0, 0]);
  const cameraUpWorld = rotateVec3WithQuat(camera.rotation, [0, 1, 0]);
  const cameraForwardWorld = rotateVec3WithQuat(camera.rotation, [0, 0, -1]);

  return {
    camera,
    viewport,
    view: V,
    projection: P,
    viewProjection: PV,
    inverseViewProjection: invPV,
    cameraRightWorld,
    cameraUpWorld,
    cameraForwardWorld,
  };
}

/* -------------------------------------------------------------------------- */
/* Forward Projection & Differentials                                         */
/* -------------------------------------------------------------------------- */

export function projectWorldToScreen(p: Vec3, ctx: ProjectionContext): ProjectedScreenPoint {
  const PV = ctx.viewProjection;
  const x = p[0], y = p[1], z = p[2];
  const cx = PV[0] * x + PV[4] * y + PV[8] * z + PV[12];
  const cy = PV[1] * x + PV[5] * y + PV[9] * z + PV[13];
  const cz = PV[2] * x + PV[6] * y + PV[10] * z + PV[14];
  const cw = PV[3] * x + PV[7] * y + PV[11] * z + PV[15];

  const viewDepth = - (ctx.view[2] * x + ctx.view[6] * y + ctx.view[10] * z + ctx.view[14]);

  if (cw <= 1e-5 || viewDepth <= 1e-5) {
    return { x: 0, y: 0, viewDepth, valid: false, ndcX: 0, ndcY: 0, clipW: cw };
  }

  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const screenX = ((ndcX * 0.5) + 0.5) * ctx.viewport.cssWidth;
  const screenY = (1.0 - ((ndcY * 0.5) + 0.5)) * ctx.viewport.cssHeight;

  return {
    x: screenX,
    y: screenY,
    viewDepth,
    valid: true,
    ndcX,
    ndcY,
    clipW: cw,
  };
}

export function screenToWorldRay(screen: Vec2, ctx: ProjectionContext): Ray {
  const nx = (2 * screen[0]) / ctx.viewport.cssWidth - 1;
  const ny = 1 - (2 * screen[1]) / ctx.viewport.cssHeight;

  // Unproject near plane point (NDC z = -1)
  const invPV = ctx.inverseViewProjection;
  const hx = invPV[0] * nx + invPV[4] * ny + invPV[8] * (-1) + invPV[12];
  const hy = invPV[1] * nx + invPV[5] * ny + invPV[9] * (-1) + invPV[13];
  const hz = invPV[2] * nx + invPV[6] * ny + invPV[10] * (-1) + invPV[14];
  const hw = invPV[3] * nx + invPV[7] * ny + invPV[11] * (-1) + invPV[15];

  const pNear: Vec3 = [hx / hw, hy / hw, hz / hw];
  const dir: Vec3 = [
    pNear[0] - ctx.camera.position[0],
    pNear[1] - ctx.camera.position[1],
    pNear[2] - ctx.camera.position[2],
  ];

  return {
    origin: [...ctx.camera.position],
    dir: normalizeVec3(dir),
  };
}

export function screenJacobianAtWorldPoint(p: Vec3, ctx: ProjectionContext): ProjectionDifferential {
  const PV = ctx.viewProjection;
  const x = p[0], y = p[1], z = p[2];
  const cx = PV[0] * x + PV[4] * y + PV[8] * z + PV[12];
  const cy = PV[1] * x + PV[5] * y + PV[9] * z + PV[13];
  const cw = PV[3] * x + PV[7] * y + PV[11] * z + PV[15];

  const viewDepth = - (ctx.view[2] * x + ctx.view[6] * y + ctx.view[10] * z + ctx.view[14]);

  if (cw <= 1e-5 || viewDepth <= 1e-5) {
    return {
      jacobian: [[0, 0, 0], [0, 0, 0]],
      valid: false,
      clipW: cw,
      viewDepth,
    };
  }

  const cw2 = cw * cw;
  const W = ctx.viewport.cssWidth;
  const H = ctx.viewport.cssHeight;
  const J: [[number, number, number], [number, number, number]] = [[0, 0, 0], [0, 0, 0]];

  for (let j = 0; j < 3; j++) {
    const A0j = PV[j * 4 + 0];
    const A1j = PV[j * 4 + 1];
    const A3j = PV[j * 4 + 3];
    J[0][j] = (W / 2) * ((A0j * cw - cx * A3j) / cw2);
    J[1][j] = -(H / 2) * ((A1j * cw - cy * A3j) / cw2);
  }

  return {
    jacobian: J,
    valid: true,
    clipW: cw,
    viewDepth,
  };
}

/* -------------------------------------------------------------------------- */
/* Frustum Clipping & Handle Observability                                    */
/* -------------------------------------------------------------------------- */

export function clipWorldSegmentToViewFrustum(
  p0: Vec3,
  p1: Vec3,
  ctx: ProjectionContext
): { clippedP0: Vec3; clippedP1: Vec3; visible: boolean } {
  const PV = ctx.viewProjection;

  // Homogeneous coordinates
  function toClip(p: Vec3): [number, number, number, number] {
    return [
      PV[0] * p[0] + PV[4] * p[1] + PV[8] * p[2] + PV[12],
      PV[1] * p[0] + PV[5] * p[1] + PV[9] * p[2] + PV[13],
      PV[2] * p[0] + PV[6] * p[1] + PV[10] * p[2] + PV[14],
      PV[3] * p[0] + PV[7] * p[1] + PV[11] * p[2] + PV[15],
    ];
  }

  let t0 = 0.0, t1 = 1.0;
  const c0 = toClip(p0);
  const c1 = toClip(p1);

  // 6 homogeneous clip planes: w + x >= 0, w - x >= 0, w + y >= 0, w - y >= 0, w + z >= 0, w - z >= 0
  const planes = [
    [ c0[3] + c0[0], (c1[3] + c1[0]) - (c0[3] + c0[0]) ],
    [ c0[3] - c0[0], (c1[3] - c1[0]) - (c0[3] - c0[0]) ],
    [ c0[3] + c0[1], (c1[3] + c1[1]) - (c0[3] + c0[1]) ],
    [ c0[3] - c0[1], (c1[3] - c1[1]) - (c0[3] - c0[1]) ],
    [ c0[3] + c0[2], (c1[3] + c1[2]) - (c0[3] + c0[2]) ],
    [ c0[3] - c0[2], (c1[3] - c1[2]) - (c0[3] - c0[2]) ],
  ];

  for (const [p, d] of planes) {
    if (d === 0) {
      if (p < 0) return { clippedP0: p0, clippedP1: p1, visible: false };
    } else {
      const t = -p / d;
      if (d > 0) {
        if (t > t0) t0 = t;
      } else {
        if (t < t1) t1 = t;
      }
      if (t0 > t1) return { clippedP0: p0, clippedP1: p1, visible: false };
    }
  }

  const cp0: Vec3 = [
    p0[0] + t0 * (p1[0] - p0[0]),
    p0[1] + t0 * (p1[1] - p0[1]),
    p0[2] + t0 * (p1[2] - p0[2]),
  ];
  const cp1: Vec3 = [
    p0[0] + t1 * (p1[0] - p0[0]),
    p0[1] + t1 * (p1[1] - p0[1]),
    p0[2] + t1 * (p1[2] - p0[2]),
  ];

  return { clippedP0: cp0, clippedP1: cp1, visible: true };
}

export function handleObservabilityScreenPx(
  p: Vec3,
  u: Vec3,
  handleLengthWorld: number,
  ctx: ProjectionContext
): number {
  const p1: Vec3 = [
    p[0] + handleLengthWorld * u[0],
    p[1] + handleLengthWorld * u[1],
    p[2] + handleLengthWorld * u[2],
  ];

  const clip = clipWorldSegmentToViewFrustum(p, p1, ctx);
  if (!clip.visible) return 0;

  const s0 = projectWorldToScreen(clip.clippedP0, ctx);
  const s1 = projectWorldToScreen(clip.clippedP1, ctx);
  if (!s0.valid || !s1.valid) return 0;

  return Math.hypot(s1.x - s0.x, s1.y - s0.y);
}

export function constantScreenGizmoWorldRadius(
  pivot: Vec3,
  targetRadiusCss: number,
  ctx: ProjectionContext
): number {
  const viewDepth = - (ctx.view[2] * pivot[0] + ctx.view[6] * pivot[1] + ctx.view[10] * pivot[2] + ctx.view[14]);
  if (viewDepth <= 1e-4) return 1.0;
  const eta = (2 * viewDepth * Math.tan(ctx.camera.fovY / 2)) / Math.max(1, ctx.viewport.cssHeight);
  return targetRadiusCss * eta;
}
