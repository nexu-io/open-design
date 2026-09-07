/**
 * Harmonic Inference Engine & Spatial Broadphase
 * Implements harmonic angle/scale lattices, typed VCB expression parser,
 * Palladian architectural footprints, and USD stage unit conversions.
 */

import type { Vec3 } from "./projection.js";

export const PHI = (1 + Math.sqrt(5)) / 2;

export const HARMONIC_SCALE_BASES = [
  { value: 1.0, label: "1" },
  { value: Math.sqrt(2), label: "sqrt2" },
  { value: Math.sqrt(3), label: "sqrt3" },
  { value: Math.sqrt(5), label: "sqrt5" },
  { value: 1 / Math.sqrt(2), label: "1/sqrt2" },
  { value: 1 / Math.sqrt(3), label: "1/sqrt3" },
  { value: 1 / Math.sqrt(5), label: "1/sqrt5" },
  { value: PHI, label: "phi" },
  { value: Math.sqrt(PHI), label: "sqrtPhi" },
  { value: 1 / PHI, label: "1/phi" },
  { value: 2 / 3, label: "2/3" },
  { value: 3 / 4, label: "3/4" },
  { value: 4 / 5, label: "4/5" },
  { value: 5 / 4, label: "5/4" },
  { value: 4 / 3, label: "4/3" },
  { value: 3 / 2, label: "3/2" },
  { value: 5 / 3, label: "5/3" },
] as const;

/* -------------------------------------------------------------------------- */
/* Harmonic Angle Lattice (15° Z U 36° Z)                                     */
/* -------------------------------------------------------------------------- */

export interface HarmonicAngleMatch {
  angle: number;
  deltaRad: number;
  label: string;
}

export function findClosestHarmonicAngle(theta: number): HarmonicAngleMatch {
  // A non-finite angle has no nearest lattice point: without the guard,
  // NaN propagated straight through round() into the returned angle, delta,
  // AND label — a poisoned match that looked shaped like a real one. The
  // identity posture (angle unchanged... but NaN) cannot work, so report
  // zero with an infinite delta: no snap consumer treats an infinite-delta
  // match as close enough to act on.
  if (!Number.isFinite(theta)) {
    return { angle: 0, deltaRad: Infinity, label: "indeterminate" };
  }
  const deg = (theta * 180) / Math.PI;

  // Lattices: multiples of 15° and multiples of 36°
  const step15 = Math.round(deg / 15) * 15;
  const step36 = Math.round(deg / 36) * 36;

  const diff15 = Math.abs(deg - step15);
  const diff36 = Math.abs(deg - step36);

  let chosenDeg = step15;
  let label = `${step15}°`;

  if (diff36 < diff15) {
    chosenDeg = step36;
    label = `${step36}° (36° pentagonal)`;
  }

  const chosenRad = (chosenDeg * Math.PI) / 180;
  return {
    angle: chosenRad,
    deltaRad: Math.abs(theta - chosenRad),
    label,
  };
}

/* -------------------------------------------------------------------------- */
/* Harmonic Scale Lattice (S_canonical * 2^k)                                 */
/* -------------------------------------------------------------------------- */

export interface HarmonicScaleMatch {
  scale: number;
  delta: number;
  label: string;
}

export function findClosestHarmonicScale(
  rawScale: number,
  octaveRange: [number, number] = [-3, 3]
): HarmonicScaleMatch {
  // Non-finite input first: NaN fails every `diff < minDiff` comparison, so
  // the loop's seed values survive and the caller received scale 1 labelled
  // "1" with delta Infinity — a match-shaped object for an unmatchable
  // input. Same posture as the angle guard: infinite delta, named label.
  if (!Number.isFinite(rawScale)) {
    return { scale: 1.0, delta: Infinity, label: "indeterminate" };
  }
  if (rawScale <= 1e-6) {
    return { scale: 1.0, delta: Math.abs(rawScale - 1.0), label: "1:1" };
  }

  let bestScale = 1.0;
  let minDiff = Infinity;
  let bestLabel = "1";
  let bestOctave = Infinity;

  for (let k = octaveRange[0]; k <= octaveRange[1]; k++) {
    const octave = Math.pow(2, k);
    for (const base of HARMONIC_SCALE_BASES) {
      const candidate = base.value * octave;
      const diff = Math.abs(rawScale - candidate);
      // Prefer closer match, or prefer simpler octave (smaller |k|) if difference is identical
      if (diff < minDiff - 1e-9 || (Math.abs(diff - minDiff) <= 1e-9 && Math.abs(k) < Math.abs(bestOctave))) {
        minDiff = diff;
        bestScale = candidate;
        bestOctave = k;
        bestLabel = k === 0 ? base.label : `${base.label} · 2^${k}`;
      }
    }
  }

  return {
    scale: bestScale,
    delta: minDiff,
    label: bestLabel,
  };
}

/* -------------------------------------------------------------------------- */
/* Palladian Architectural Footprint Proportions                              */
/* -------------------------------------------------------------------------- */

export interface PalladianElevations {
  arithmeticHeight: number;
  geometricHeight: number;
  harmonicHeight: number;
}

export function computePalladianElevations(
  lengthWorld: number,
  widthWorld: number
): PalladianElevations {
  const L = Math.max(1e-4, lengthWorld);
  const W = Math.max(1e-4, widthWorld);

  const hA = (L + W) / 2;
  const hG = Math.sqrt(L * W);
  const hH = (2 * L * W) / (L + W);

  return {
    arithmeticHeight: hA,
    geometricHeight: hG,
    harmonicHeight: hH,
  };
}

/* -------------------------------------------------------------------------- */
/* Typed VCB Architectural Expression Parser                                  */
/* -------------------------------------------------------------------------- */

export type VCBValue =
  | { type: "Length"; valueSceneUnits: number; rawMeters: number }
  | { type: "Angle"; valueRad: number; rawDeg: number }
  | { type: "DimensionlessScale"; factor: number };

export interface VCBParseResult {
  valid: boolean;
  parsed?: VCBValue;
  error?: string;
}

export function parseTypedVCBExpression(
  input: string,
  /*
   * Scene units per metre for the stage being edited.
   *
   * The default is scene3d's contract default (src/contract.ts: units
   * metersPerUnit 1), NOT USD's unauthored-stage fallback of 0.01. Those
   * differ by a factor of 100, and this defaulted to the USD one: typing
   * "2m" into the measurements box on an ordinary scene3d scene resolved to
   * 200 scene units. Callers that know the resolved stage value should pass
   * it rather than rely on any default.
   */
  stageMetersPerUnit: number = 1,
): VCBParseResult {
  const s = input.trim().toLowerCase();
  if (!s) return { valid: false, error: "Empty input" };

  // Angle check. ANCHORED like the length branch below, never
  // suffix-stripped: `parseFloat` after a replace accepted "12xdeg" and
  // "12junk°" as 12 — a typo silently became a transform. The whole
  // string must be number-then-unit or it is an error the user can fix.
  const NUM = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?`;
  const degMatch = s.match(new RegExp(`^(${NUM})\\s*(?:deg|°)$`));
  if (degMatch) {
    const val = parseFloat(degMatch[1]!);
    return {
      valid: true,
      parsed: { type: "Angle", valueRad: (val * Math.PI) / 180, rawDeg: val },
    };
  }
  if (s.endsWith("deg") || s.endsWith("°")) {
    return { valid: false, error: "Invalid angle value" };
  }

  const radMatch = s.match(new RegExp(`^(${NUM})\\s*rad$`));
  if (radMatch) {
    const val = parseFloat(radMatch[1]!);
    return {
      valid: true,
      parsed: { type: "Angle", valueRad: val, rawDeg: (val * 180) / Math.PI },
    };
  }
  if (s.endsWith("rad")) {
    return { valid: false, error: "Invalid radian value" };
  }

  // Length check (m, cm, mm, ft, in)
  if (!(stageMetersPerUnit > 0) || !Number.isFinite(stageMetersPerUnit)) {
    return { valid: false, error: "Stage metersPerUnit must be a positive number" };
  }
  const lengthMatch = s.match(/^([+-]?\d+(?:\.\d+)?)\s*(m|cm|mm|ft|in)$/);
  if (lengthMatch) {
    const num = parseFloat(lengthMatch[1]);
    const unit = lengthMatch[2];
    let meters = num;
    if (unit === "cm") meters = num * 0.01;
    else if (unit === "mm") meters = num * 0.001;
    else if (unit === "ft") meters = num * 0.3048;
    else if (unit === "in") meters = num * 0.0254;

    const sceneUnits = meters / stageMetersPerUnit;
    return {
      valid: true,
      parsed: { type: "Length", valueSceneUnits: sceneUnits, rawMeters: meters },
    };
  }

  // Dimensionless Scale (phi, sqrt2, fractions, numbers)
  // Lowercase phi, because `s` is already lowercased at entry — comparing
  // against uppercase Φ could never match, so BOTH Greek spellings failed
  // while the docs offered them. "Φ".toLowerCase() is "φ", covering both.
  if (s === "phi" || s === "φ") {
    return { valid: true, parsed: { type: "DimensionlessScale", factor: PHI } };
  }
  if (s === "1/phi") {
    return { valid: true, parsed: { type: "DimensionlessScale", factor: 1 / PHI } };
  }
  if (s === "sqrt2") {
    return { valid: true, parsed: { type: "DimensionlessScale", factor: Math.SQRT2 } };
  }
  if (s === "sqrt3") {
    return { valid: true, parsed: { type: "DimensionlessScale", factor: Math.sqrt(3) } };
  }
  if (s === "sqrt5") {
    return { valid: true, parsed: { type: "DimensionlessScale", factor: Math.sqrt(5) } };
  }

  // Fraction (e.g. 3/4, 4/3, 16/9)
  const fractionMatch = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    const num = parseFloat(fractionMatch[1]);
    const denom = parseFloat(fractionMatch[2]);
    if (denom !== 0 && Number.isFinite(num / denom)) {
      return { valid: true, parsed: { type: "DimensionlessScale", factor: num / denom } };
    }
    return { valid: false, error: "Division by zero" };
  }

  // Raw number as dimensionless scale or raw scene units. Whole-string
  // only: parseFloat("3.5meters") is 3.5, and a unit this parser does not
  // know must be a loud error, never a silently unitless value.
  if (new RegExp(`^${NUM}$`).test(s)) {
    const rawNum = parseFloat(s);
    if (Number.isFinite(rawNum)) {
      return { valid: true, parsed: { type: "DimensionlessScale", factor: rawNum } };
    }
  }

  return { valid: false, error: "Unrecognized expression" };
}

/* -------------------------------------------------------------------------- */
/* Persistent Spatial Snap Broadphase Cache                                   */
/* -------------------------------------------------------------------------- */

export interface SemanticAABB {
  min: Vec3;
  max: Vec3;
}

export interface SemanticSnapFeature {
  id: string;
  kind: "vertex" | "edge" | "plane" | "bounding-face";
  ownerObjectId: string;
  worldBounds: SemanticAABB;
  worldPosition: Vec3;
  normalOrDirection?: Vec3;
}

export class PersistentSnapBroadphase {
  private features: SemanticSnapFeature[] = [];
  public version: number = 0;

  public clear(): void {
    this.features = [];
    this.version++;
  }

  public insertFeature(feature: SemanticSnapFeature): void {
    this.features.push(feature);
    this.version++;
  }

  public queryCandidatesNear(
    queryPointWorld: Vec3,
    searchRadiusWorld: number,
    excludedObjectId?: string
  ): SemanticSnapFeature[] {
    const r = searchRadiusWorld;
    const qMin: Vec3 = [queryPointWorld[0] - r, queryPointWorld[1] - r, queryPointWorld[2] - r];
    const qMax: Vec3 = [queryPointWorld[0] + r, queryPointWorld[1] + r, queryPointWorld[2] + r];

    return this.features.filter((f) => {
      if (excludedObjectId && f.ownerObjectId === excludedObjectId) return false;
      // AABB overlap test
      const b = f.worldBounds;
      return (
        b.min[0] <= qMax[0] && b.max[0] >= qMin[0] &&
        b.min[1] <= qMax[1] && b.max[1] >= qMin[1] &&
        b.min[2] <= qMax[2] && b.max[2] >= qMin[2]
      );
    });
  }
}
