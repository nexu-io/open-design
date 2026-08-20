/**
 * Dynamics & Snap State Machine
 * Implements the non-overlapping candidate latch state machine,
 * Gaussian C1 smoothstep blending, 2D manifold snap projection,
 * and Ryan Juckett's analytical discrete critical spring step.
 */

import type { ProjectionContext, Vec2, Vec3 } from "./projection.js";

export type SnapKind =
  | "point"
  | "edge"
  | "plane"
  | "harmonic-angle"
  | "harmonic-scale"
  | "palladian";

export interface SnapLatchState {
  candidateId: string | null;
  branchKey: string | null;
  kind: SnapKind | null;
}

export interface SnapResolvedOutput {
  xiSnap: number | Vec2;
  distanceCss: number;
  contactWorld: Vec3;
  valid: boolean;
}

export interface SnapConstraint {
  id: string;
  branchKey: string;
  kind: SnapKind;
  priorityTier: number; // 0 = highest, 1 = medium, 2 = low
  labels: string[];
  resolve(rawXi: number | Vec2, ctx: ProjectionContext): SnapResolvedOutput;
}

export const SNAP_R_IN_CSS = 10.0;
export const SNAP_R_OUT_CSS = 18.0;
export const SNAP_SIGMA_CSS = 12.0;

/* -------------------------------------------------------------------------- */
/* Gaussian-Normalized C1 Smoothstep Blend Factor                              */
/* -------------------------------------------------------------------------- */

export function computeSnapBlendFactor(distanceCss: number): number {
  if (distanceCss < SNAP_R_IN_CSS) return 1.0;
  if (distanceCss >= SNAP_R_OUT_CSS) return 0.0;

  const w = (d: number) => Math.exp(-(d * d) / (2 * SNAP_SIGMA_CSS * SNAP_SIGMA_CSS));
  const wDist = w(distanceCss);
  const wIn = w(SNAP_R_IN_CSS);
  const wOut = w(SNAP_R_OUT_CSS);

  const g = Math.max(0.0, Math.min(1.0, (wDist - wOut) / (wIn - wOut)));
  return 3 * g * g - 2 * g * g * g;
}

/* -------------------------------------------------------------------------- */
/* Snap State Machine & Candidate Resolution                                  */
/* -------------------------------------------------------------------------- */

export interface SnapStepResult {
  latchState: SnapLatchState;
  activeConstraint: SnapConstraint | null;
  xiOut: number | Vec2;
  blendFactor: number;
  snapped: boolean;
  distanceCss: number;
  contactWorld?: Vec3;
  labels: string[];
}

export function evaluateSnapStep(
  currentLatch: SnapLatchState,
  candidates: SnapConstraint[],
  rawXi: number | Vec2,
  ctx: ProjectionContext
): SnapStepResult {
  // 1. If currently latched, evaluate the locked candidate first
  if (currentLatch.candidateId !== null) {
    const latched = candidates.find(
      (c) => c.id === currentLatch.candidateId && c.branchKey === currentLatch.branchKey
    );
    if (latched) {
      const res = latched.resolve(rawXi, ctx);
      if (res.valid && res.distanceCss < SNAP_R_OUT_CSS) {
        // Retain candidate (smooth breakaway or exact core)
        const beta = computeSnapBlendFactor(res.distanceCss);
        const xiOut = blendXi(rawXi, res.xiSnap, beta);
        return {
          latchState: currentLatch,
          activeConstraint: latched,
          xiOut,
          blendFactor: beta,
          snapped: beta > 0.0,
          distanceCss: res.distanceCss,
          contactWorld: res.contactWorld,
          labels: latched.labels,
        };
      }
    }
  }

  // 2. Unlatched or candidate lost -> Evaluate all candidates with deterministic lexicographical ranking
  let bestConstraint: SnapConstraint | null = null;
  let bestResolution: SnapResolvedOutput | null = null;

  for (const c of candidates) {
    const res = c.resolve(rawXi, ctx);
    if (!res.valid || res.distanceCss >= SNAP_R_OUT_CSS) continue;

    if (!bestResolution) {
      bestConstraint = c;
      bestResolution = res;
      continue;
    }

    // Lexicographic comparison: (priorityTier ASC, distanceCss ASC, candidateId ASC)
    if (c.priorityTier < bestConstraint!.priorityTier) {
      bestConstraint = c;
      bestResolution = res;
    } else if (c.priorityTier === bestConstraint!.priorityTier) {
      if (res.distanceCss < bestResolution.distanceCss - 1e-4) {
        bestConstraint = c;
        bestResolution = res;
      } else if (
        Math.abs(res.distanceCss - bestResolution.distanceCss) <= 1e-4 &&
        c.id < bestConstraint!.id
      ) {
        bestConstraint = c;
        bestResolution = res;
      }
    }
  }

  if (bestConstraint && bestResolution) {
    const newLatch: SnapLatchState = {
      candidateId: bestConstraint.id,
      branchKey: bestConstraint.branchKey,
      kind: bestConstraint.kind,
    };
    const beta = computeSnapBlendFactor(bestResolution.distanceCss);
    const xiOut = blendXi(rawXi, bestResolution.xiSnap, beta);
    return {
      latchState: newLatch,
      activeConstraint: bestConstraint,
      xiOut,
      blendFactor: beta,
      snapped: beta > 0.0,
      distanceCss: bestResolution.distanceCss,
      contactWorld: bestResolution.contactWorld,
      labels: bestConstraint.labels,
    };
  }

  // 3. No candidate in range (< 18px)
  return {
    latchState: { candidateId: null, branchKey: null, kind: null },
    activeConstraint: null,
    xiOut: rawXi,
    blendFactor: 0.0,
    snapped: false,
    distanceCss: Infinity,
    labels: [],
  };
}

function blendXi(raw: number | Vec2, target: number | Vec2, beta: number): number | Vec2 {
  if (typeof raw === "number" && typeof target === "number") {
    return raw + beta * (target - raw);
  }
  if (Array.isArray(raw) && Array.isArray(target)) {
    return [
      raw[0] + beta * (target[0] - raw[0]),
      raw[1] + beta * (target[1] - raw[1]),
    ];
  }
  return raw;
}

/* -------------------------------------------------------------------------- */
/* Ryan Juckett's Analytical Critical Spring Semigroup Step                   */
/* -------------------------------------------------------------------------- */

export interface SpringState1D {
  x: number;
  v: number;
}

export function criticalSpringStep(
  state: SpringState1D,
  target: number,
  dt: number,
  omega: number = 28.0
): SpringState1D {
  const y0 = state.x - target;
  const c2 = state.v + omega * y0;
  const e = Math.exp(-omega * dt);

  const xNext = target + (y0 + c2 * dt) * e;
  const vNext = (state.v - omega * c2 * dt) * e;

  return { x: xNext, v: vNext };
}

export interface SpringStateVec3 {
  x: Vec3;
  v: Vec3;
}

export function criticalSpringStepVec3(
  state: SpringStateVec3,
  target: Vec3,
  dt: number,
  omega: number = 28.0
): SpringStateVec3 {
  const resX = criticalSpringStep({ x: state.x[0], v: state.v[0] }, target[0], dt, omega);
  const resY = criticalSpringStep({ x: state.x[1], v: state.v[1] }, target[1], dt, omega);
  const resZ = criticalSpringStep({ x: state.x[2], v: state.v[2] }, target[2], dt, omega);

  return {
    x: [resX.x, resY.x, resZ.x],
    v: [resX.v, resY.v, resZ.v],
  };
}
