/**
 * 1D & 2D Projective Constraint Geometry Solvers
 * Implements horizon-clamped projective line solvers, exact finite ray-plane UV solvers,
 * Shoemake Arcball, screen-picked Levenberg-Marquardt ring rotation, and SVD observability.
 */

import {
  crossVec3,
  dotVec3,
  normalizeVec3,
  projectWorldToScreen,
  screenJacobianAtWorldPoint,
  screenToWorldRay,
  type Mat4,
  type ProjectionContext,
  type Quat,
  type Vec2,
  type Vec3,
} from "./projection.js";

export interface Interval {
  min: number;
  max: number;
}

export interface ConstraintLocus1D {
  worldPoint(xi: number): Vec3;
  worldTangent(xi: number): Vec3;
  connectedDomainAround(xi0: number, ctx: ProjectionContext): Interval;
}

export interface ConstraintDomain2D {
  contains(uv: Vec2): boolean;
  projectToFeasible(uv: Vec2): Vec2;
}

export interface PlanarConstraintLocus2D {
  originWorld: Vec3;
  e1World: Vec3;
  e2World: Vec3;
  normalWorld: Vec3;
  connectedDomainAround(uv0: Vec2, ctx: ProjectionContext): ConstraintDomain2D;
}

/* -------------------------------------------------------------------------- */
/* Horizon-Clamped Projective Line Solver (Axis & Scale)                      */
/* -------------------------------------------------------------------------- */

export interface ProjectiveLineResult {
  lambda: number;
  rawLambda: number;
  clamped: boolean;
  admissibleInterval: Interval;
  degenerate: boolean;
}

export function solveProjectedLineParameterAdmissible(
  p: Vec3,
  u: Vec3,
  pointerCss: Vec2,
  ctx: ProjectionContext,
  lambda0: number = 0,
  admissibleDomainOverride?: Interval
): ProjectiveLineResult {
  const PV = ctx.viewProjection;

  // c0 = PV * [p, 1]^T
  const c0 = [
    PV[0] * p[0] + PV[4] * p[1] + PV[8] * p[2] + PV[12],
    PV[1] * p[0] + PV[5] * p[1] + PV[9] * p[2] + PV[13],
    PV[2] * p[0] + PV[6] * p[1] + PV[10] * p[2] + PV[14],
    PV[3] * p[0] + PV[7] * p[1] + PV[11] * p[2] + PV[15],
  ];
  // c1 = PV * [u, 0]^T
  const c1 = [
    PV[0] * u[0] + PV[4] * u[1] + PV[8] * u[2],
    PV[1] * u[0] + PV[5] * u[1] + PV[9] * u[2],
    PV[2] * u[0] + PV[6] * u[1] + PV[10] * u[2],
    PV[3] * u[0] + PV[7] * u[1] + PV[11] * u[2],
  ];

  // Admissible depth domain: near <= depth <= far
  let lambdaMin = -Infinity;
  let lambdaMax = Infinity;

  if (Math.abs(c1[3]) > 1e-9) {
    if (c1[3] > 0) {
      lambdaMin = (ctx.camera.near - c0[3]) / c1[3];
      lambdaMax = (ctx.camera.far - c0[3]) / c1[3];
    } else {
      lambdaMin = (ctx.camera.far - c0[3]) / c1[3];
      lambdaMax = (ctx.camera.near - c0[3]) / c1[3];
    }
  } else if (c0[3] < ctx.camera.near || c0[3] > ctx.camera.far) {
    // A depth-constant line (the direction contributes no w) sits at ONE
    // depth for its whole length: when that depth is outside [near, far]
    // the entire line is inadmissible, and leaving the interval infinite
    // here let an out-of-frustum manipulation solve and apply anyway.
    // Returned as DEGENERATE immediately — an empty interval fed to the
    // clamp below would come back as lambda = Infinity wearing
    // `degenerate: false`, which is worse than the hole it closes.
    return {
      lambda: lambda0,
      rawLambda: lambda0,
      clamped: false,
      admissibleInterval: { min: Infinity, max: -Infinity },
      degenerate: true,
    };
  }

  if (admissibleDomainOverride) {
    lambdaMin = Math.max(lambdaMin, admissibleDomainOverride.min);
    lambdaMax = Math.min(lambdaMax, admissibleDomainOverride.max);
  }

  const admissibleInterval: Interval = { min: lambdaMin, max: lambdaMax };

  // The override can be DISJOINT from the depth window (a caller's domain
  // entirely behind the camera, say). An empty interval fed to the clamp
  // below returns lambdaMin wearing `clamped: true` — a value OUTSIDE the
  // very interval the result reports as admissible.
  if (lambdaMin > lambdaMax) {
    return { lambda: lambda0, rawLambda: lambda0, clamped: false, admissibleInterval, degenerate: true };
  }

  // Tangent at start point
  const p0: Vec3 = [p[0] + lambda0 * u[0], p[1] + lambda0 * u[1], p[2] + lambda0 * u[2]];
  const s0 = projectWorldToScreen(p0, ctx);
  const J_diff = screenJacobianAtWorldPoint(p0, ctx);

  if (!s0.valid || !J_diff.valid) {
    return { lambda: lambda0, rawLambda: lambda0, clamped: false, admissibleInterval, degenerate: true };
  }

  const ts = [
    J_diff.jacobian[0][0] * u[0] + J_diff.jacobian[0][1] * u[1] + J_diff.jacobian[0][2] * u[2],
    J_diff.jacobian[1][0] * u[0] + J_diff.jacobian[1][1] * u[1] + J_diff.jacobian[1][2] * u[2],
  ];
  const tsLen = Math.hypot(ts[0], ts[1]);
  if (tsLen < 1e-4) {
    return { lambda: lambda0, rawLambda: lambda0, clamped: false, admissibleInterval, degenerate: true };
  }

  const tsNorm = [ts[0] / tsLen, ts[1] / tsLen];

  // Orthogonal projection onto 2D projected line
  const dCursor = [pointerCss[0] - s0.x, pointerCss[1] - s0.y];
  const dotT = dCursor[0] * tsNorm[0] + dCursor[1] * tsNorm[1];
  const sStar = [s0.x + tsNorm[0] * dotT, s0.y + tsNorm[1] * dotT];

  // Convert to NDC
  const nx = (2 * sStar[0]) / ctx.viewport.cssWidth - 1;
  const ny = 1 - (2 * sStar[1]) / ctx.viewport.cssHeight;

  // Rational backward solve
  const denomX = nx * c1[3] - c1[0];
  const denomY = ny * c1[3] - c1[1];
  let rawLambda: number;
  if (Math.abs(denomX) >= Math.abs(denomY)) {
    rawLambda = (c0[0] - nx * c0[3]) / denomX;
  } else {
    rawLambda = (c0[1] - ny * c0[3]) / denomY;
  }

  // The horizon singularity: a cursor at the projected line's vanishing
  // point makes BOTH denominators vanish, and 0/0 is NaN — which sails
  // through the min/max clamp below (every comparison with NaN is false)
  // and out of the function as a "solved" parameter.
  if (!Number.isFinite(rawLambda)) {
    return { lambda: lambda0, rawLambda: lambda0, clamped: false, admissibleInterval, degenerate: true };
  }

  const clampedLambda = Math.max(lambdaMin, Math.min(lambdaMax, rawLambda));

  return {
    lambda: clampedLambda,
    rawLambda,
    clamped: clampedLambda !== rawLambda,
    admissibleInterval,
    degenerate: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Exact Finite Ray-Plane UV Solver (Planar Handles & Free Move)              */
/* -------------------------------------------------------------------------- */

export interface RayPlaneUVResult {
  hit: boolean;
  wellConditioned: boolean;
  t: number;
  pointWorld: Vec3;
  uv: Vec2;
}

export function solveExactFiniteRayPlaneUV(
  originWorld: Vec3,
  e1World: Vec3,
  e2World: Vec3,
  normalWorld: Vec3,
  pointerCss: Vec2,
  ctx: ProjectionContext
): RayPlaneUVResult {
  const ray = screenToWorldRay(pointerCss, ctx);
  /* Normalised for the parallelism test only. The intersection itself is a
     ratio of two dot products with the same normal, so it is scale-free —
     but the 1e-4 threshold below is an angle, and comparing an angle
     against an unnormalised normal compares nothing in particular. */
  const n = normalizeVec3(normalWorld);
  const nDotD = dotVec3(n, ray.dir);

  if (Math.abs(nDotD) < 1e-4) {
    return {
      hit: false,
      wellConditioned: false,
      t: 0,
      pointWorld: [...originWorld],
      uv: [0, 0],
    };
  }

  const po: Vec3 = [
    originWorld[0] - ray.origin[0],
    originWorld[1] - ray.origin[1],
    originWorld[2] - ray.origin[2],
  ];
  const t = dotVec3(n, po) / nDotD;

  if (t < 0) {
    return {
      hit: false,
      wellConditioned: true,
      t,
      pointWorld: [...originWorld],
      uv: [0, 0],
    };
  }

  const h: Vec3 = [
    ray.origin[0] + t * ray.dir[0],
    ray.origin[1] + t * ray.dir[1],
    ray.origin[2] + t * ray.dir[2],
  ];

  const diff: Vec3 = [
    h[0] - originWorld[0],
    h[1] - originWorld[1],
    h[2] - originWorld[2],
  ];

  // Gram matrix solve: [e1.e1  e1.e2] [u] = [e1.diff]
  //                    [e1.e2  e2.e2] [v]   [e2.diff]
  const g11 = dotVec3(e1World, e1World);
  const g12 = dotVec3(e1World, e2World);
  const g22 = dotVec3(e2World, e2World);
  const detG = g11 * g22 - g12 * g12;

  /*
   * RELATIVE conditioning test. A Gram determinant carries units of
   * length^4, so an absolute floor is a statement about scene scale, not
   * about whether the basis is degenerate: a plane whose basis vectors are
   * a millimetre long has detG near 1e-12 while being perfectly
   * well-formed, and the absolute 1e-6 floor that used to guard this
   * rejected it — returning uv (0, 0), which silently pins every drag in a
   * small-scale scene to the plane origin. Dividing through by g11 * g22
   * leaves sin^2 of the angle between the basis vectors, which is the
   * quantity actually being asked about and is dimensionless.
   */
  const scale = g11 * g22;
  const basisDegenerate = !(scale > 0) || detG / scale < 1e-10;

  let u = 0, v = 0;
  if (!basisDegenerate) {
    const rhs1 = dotVec3(e1World, diff);
    const rhs2 = dotVec3(e2World, diff);
    u = (g22 * rhs1 - g12 * rhs2) / detG;
    v = (g11 * rhs2 - g12 * rhs1) / detG;
  }

  return {
    // A collapsed basis is reported, not papered over. This used to return
    // wellConditioned: true alongside uv (0, 0) — the caller was told the
    // answer was trustworthy and handed the origin.
    hit: !basisDegenerate,
    wellConditioned: !basisDegenerate,
    t,
    pointWorld: h,
    uv: [u, v],
  };
}

/* -------------------------------------------------------------------------- */
/* True Shoemake Arcball Virtual Sphere                                       */
/* -------------------------------------------------------------------------- */

export function mapArcball(
  mx: number,
  my: number,
  cx: number,
  cy: number,
  radius: number
): Vec3 {
  const x = (mx - cx) / radius;
  const y = (cy - my) / radius; // inverted Y
  const r2 = x * x + y * y;
  if (r2 <= 1.0) {
    return [x, y, Math.sqrt(Math.max(0, 1.0 - r2))];
  }
  const invR = 1.0 / Math.sqrt(r2);
  return [x * invR, y * invR, 0.0];
}

export function shoemakeArcballQuat(v0: Vec3, v1: Vec3): Quat {
  const cross = crossVec3(v0, v1);
  const dot = dotVec3(v0, v1);
  // The antipodal degeneracy: for opposite sphere points the cross vanishes
  // and the quat collapses to [0,0,0,-1] — the IDENTITY rotation — so a
  // drag across the sphere produced no turn at all where the user asked
  // for the largest one. A 180° turn about any axis perpendicular to v0
  // is the correct limit; the axis choice is the rotation's one free
  // parameter there, so a deterministic perpendicular is as right as any.
  const crossMag = Math.hypot(cross[0], cross[1], cross[2]);
  if (dot < -0.9999 && crossMag < 1e-6) {
    const axis =
      Math.abs(v0[0]) < 0.9
        ? crossVec3(v0, [1, 0, 0])
        : crossVec3(v0, [0, 1, 0]);
    const m = Math.hypot(axis[0], axis[1], axis[2]) || 1.0;
    return [axis[0] / m, axis[1] / m, axis[2] / m, 0];
  }
  const norm = Math.hypot(cross[0], cross[1], cross[2], dot) || 1.0;
  return [cross[0] / norm, cross[1] / norm, cross[2] / norm, dot / norm];
}

/* -------------------------------------------------------------------------- */
/* Screen-Picked Ring Basis & Levenberg-Marquardt Solver                      */
/* -------------------------------------------------------------------------- */

export function buildPickedRingBasis(
  pivot: Vec3,
  axisWorld: Vec3,
  pickedPointWorld: Vec3
): { a: Vec3; b: Vec3 } {
  // normalizeVec3 maps the zero vector to itself (mag||1), and a zero u
  // zeroes b = u×a even when the picked point anchors a — every ring point
  // becomes the pivot and the LM solver loses rotation entirely. No caller
  // ships a zero axis today (gizmo axes are fixed unit vectors), but a math
  // primitive must not return a collapsed basis for ANY input: substitute
  // the deterministic Z axis, the same arbitrary-but-valid posture as the
  // on-axis anchor fallback below.
  const axisMag = Math.hypot(axisWorld[0], axisWorld[1], axisWorld[2]);
  const u = axisMag > 1e-12 ? normalizeVec3(axisWorld) : ([0, 0, 1] as Vec3);
  const diff: Vec3 = [
    pickedPointWorld[0] - pivot[0],
    pickedPointWorld[1] - pivot[1],
    pickedPointWorld[2] - pivot[2],
  ];
  // Project diff onto plane perpendicular to u: (I - u u^T) diff
  const uDotDiff = dotVec3(u, diff);
  const perp: Vec3 = [
    diff[0] - uDotDiff * u[0],
    diff[1] - uDotDiff * u[1],
    diff[2] - uDotDiff * u[2],
  ];
  // A picked point ON the axis has no projection to anchor the basis: the
  // normalized zero vector collapsed a and b to zero and every ring point
  // to the pivot. Any perpendicular of u spans the same ring plane, so a
  // deterministic one keeps the solver alive with an arbitrary-but-valid
  // phase — exactly what an on-axis pick means geometrically.
  const perpMag = Math.hypot(perp[0], perp[1], perp[2]);
  const anchor: Vec3 =
    perpMag > 1e-12
      ? perp
      : Math.abs(u[0]) < 0.9
        ? crossVec3(u, [1, 0, 0])
        : crossVec3(u, [0, 1, 0]);
  const a = normalizeVec3(anchor);
  const b = normalizeVec3(crossVec3(u, a));
  return { a, b };
}

export function solveDampedLevenbergMarquardtRing(
  pivot: Vec3,
  uWorld: Vec3,
  aWorld: Vec3,
  bWorld: Vec3,
  ringRadiusWorld: number,
  mEffCss: Vec2,
  seedTheta: number,
  ctx: ProjectionContext,
  maxIterations: number = 6
): number {
  let theta = seedTheta;
  let mu = 0.01;

  function ringPoint(th: number): Vec3 {
    return [
      pivot[0] + ringRadiusWorld * (aWorld[0] * Math.cos(th) + bWorld[0] * Math.sin(th)),
      pivot[1] + ringRadiusWorld * (aWorld[1] * Math.cos(th) + bWorld[1] * Math.sin(th)),
      pivot[2] + ringRadiusWorld * (aWorld[2] * Math.cos(th) + bWorld[2] * Math.sin(th)),
    ];
  }

  function errorEnergy(th: number): number {
    const pt = ringPoint(th);
    const s = projectWorldToScreen(pt, ctx);
    if (!s.valid) return 1e6;
    const ex = s.x - mEffCss[0];
    const ey = s.y - mEffCss[1];
    return 0.5 * (ex * ex + ey * ey);
  }

  let currentE = errorEnergy(theta);

  for (let iter = 0; iter < maxIterations; iter++) {
    const pt = ringPoint(theta);
    const s = projectWorldToScreen(pt, ctx);
    const J_diff = screenJacobianAtWorldPoint(pt, ctx);

    if (!s.valid || !J_diff.valid) break;

    const ex = s.x - mEffCss[0];
    const ey = s.y - mEffCss[1];

    // Derivative: dx/dtheta = r * (-a sin theta + b cos theta)
    const sinTh = Math.sin(theta);
    const cosTh = Math.cos(theta);
    const dxdTh: Vec3 = [
      ringRadiusWorld * (-aWorld[0] * sinTh + bWorld[0] * cosTh),
      ringRadiusWorld * (-aWorld[1] * sinTh + bWorld[1] * cosTh),
      ringRadiusWorld * (-aWorld[2] * sinTh + bWorld[2] * cosTh),
    ];

    const sPrime = [
      J_diff.jacobian[0][0] * dxdTh[0] + J_diff.jacobian[0][1] * dxdTh[1] + J_diff.jacobian[0][2] * dxdTh[2],
      J_diff.jacobian[1][0] * dxdTh[0] + J_diff.jacobian[1][1] * dxdTh[1] + J_diff.jacobian[1][2] * dxdTh[2],
    ];

    const g = ex * sPrime[0] + ey * sPrime[1];
    const H = sPrime[0] * sPrime[0] + sPrime[1] * sPrime[1];

    let deltaTheta = -g / (H + mu);
    deltaTheta = Math.max(-0.35, Math.min(0.35, deltaTheta)); // Trust region clamp

    const nextTheta = theta + deltaTheta;
    const nextE = errorEnergy(nextTheta);

    if (nextE < currentE) {
      theta = nextTheta;
      currentE = nextE;
      mu *= 0.5;
      if (Math.abs(deltaTheta) < 1e-4) break;
    } else {
      mu *= 4.0;
    }
  }

  return theta;
}

/* -------------------------------------------------------------------------- */
/* 2D Screen Jacobian SVD Observability                                       */
/* -------------------------------------------------------------------------- */

export function solve2DScreenJacobianSVD(
  originWorld: Vec3,
  e1World: Vec3,
  e2World: Vec3,
  ctx: ProjectionContext
): { sigmaMin: number; sigmaMax: number; observable: boolean } {
  const J_diff = screenJacobianAtWorldPoint(originWorld, ctx);
  if (!J_diff.valid) return { sigmaMin: 0, sigmaMax: 0, observable: false };

  // J_s = J_Pi * [e1, e2] (2x2 matrix)
  const a = J_diff.jacobian[0][0] * e1World[0] + J_diff.jacobian[0][1] * e1World[1] + J_diff.jacobian[0][2] * e1World[2];
  const b = J_diff.jacobian[0][0] * e2World[0] + J_diff.jacobian[0][1] * e2World[1] + J_diff.jacobian[0][2] * e2World[2];
  const c = J_diff.jacobian[1][0] * e1World[0] + J_diff.jacobian[1][1] * e1World[1] + J_diff.jacobian[1][2] * e1World[2];
  const d = J_diff.jacobian[1][0] * e2World[0] + J_diff.jacobian[1][1] * e2World[1] + J_diff.jacobian[1][2] * e2World[2];

  const S1 = a * a + b * b;
  const S2 = c * c + d * d;
  const S12 = a * c + b * d;
  const trace = S1 + S2;
  const disc = Math.sqrt(Math.max(0, (S1 - S2) * (S1 - S2) + 4 * S12 * S12));
  const lambda1 = (trace + disc) / 2;
  const lambda2 = Math.max(0, (trace - disc) / 2);

  const sigmaMax = Math.sqrt(lambda1);
  const sigmaMin = Math.sqrt(lambda2);

  return {
    sigmaMin,
    sigmaMax,
    observable: sigmaMin >= 6.0, // Minimum 6px/unit observability
  };
}
