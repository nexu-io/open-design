import { describe, expect, it } from "vitest";
import {
  computePalladianElevations,
  findClosestHarmonicAngle,
  findClosestHarmonicScale,
  parseTypedVCBExpression,
  PersistentSnapBroadphase,
  PHI,
} from "../src/viewer/math/harmonics.js";

describe("Harmonic Inference & Broadphase Engine (harmonics.ts)", () => {
  it("snaps continuous angles to 15° and 36° harmonic lattices", () => {
    // 44.5 deg -> snaps to 45 deg (multiple of 15°)
    const match45 = findClosestHarmonicAngle((44.5 * Math.PI) / 180);
    expect(match45.angle).toBeCloseTo((45 * Math.PI) / 180, 5);

    // 71.8 deg -> snaps to 72 deg (multiple of 36°)
    const match72 = findClosestHarmonicAngle((71.8 * Math.PI) / 180);
    expect(match72.angle).toBeCloseTo((72 * Math.PI) / 180, 5);
  });

  it("snaps continuous scale factors to canonical ratios and golden section octaves", () => {
    // 1.615 -> snaps to PHI (1.6180339887)
    const matchPhi = findClosestHarmonicScale(1.615);
    expect(matchPhi.scale).toBeCloseTo(PHI, 4);
    expect(matchPhi.label).toBe("phi");

    // 0.748 -> snaps to 3/4 (0.75)
    const matchThreeQuarters = findClosestHarmonicScale(0.748);
    expect(matchThreeQuarters.scale).toBeCloseTo(0.75, 4);
    expect(matchThreeQuarters.label).toBe("3/4");

    // 2.825 -> snaps to sqrt2 * 2 = 2.828427
    const matchOctave = findClosestHarmonicScale(2.825);
    expect(matchOctave.scale).toBeCloseTo(Math.SQRT2 * 2, 4);
  });

  it("computes classical Palladian arithmetic, geometric, and harmonic room elevations", () => {
    const L = 12.0;
    const W = 8.0;
    const elevations = computePalladianElevations(L, W);

    expect(elevations.arithmeticHeight).toBeCloseTo(10.0, 4); // (12 + 8) / 2
    expect(elevations.geometricHeight).toBeCloseTo(Math.sqrt(96), 4); // sqrt(12 * 8) = 9.7979
    expect(elevations.harmonicHeight).toBeCloseTo(9.6, 4); // (2 * 96) / 20 = 9.6
  });

  it("parses typed VCB expressions with unit-conversion and syntax safety", () => {
    // Length in cm with stageMetersPerUnit = 0.01 (1 unit = 1cm)
    const resCm = parseTypedVCBExpression("150cm", 0.01);
    expect(resCm.valid).toBe(true);
    expect(resCm.parsed?.type).toBe("Length");
    if (resCm.parsed?.type === "Length") {
      expect(resCm.parsed.rawMeters).toBeCloseTo(1.5, 4);
      expect(resCm.parsed.valueSceneUnits).toBeCloseTo(150.0, 4);
    }

    // Length in meters with stageMetersPerUnit = 0.01 (1 unit = 1cm)
    const resM = parseTypedVCBExpression("2.5m", 0.01);
    expect(resM.valid).toBe(true);
    if (resM.parsed?.type === "Length") {
      expect(resM.parsed.rawMeters).toBeCloseTo(2.5, 4);
      expect(resM.parsed.valueSceneUnits).toBeCloseTo(250.0, 4);
    }

    // Angle in degrees
    const resDeg = parseTypedVCBExpression("45deg");
    expect(resDeg.valid).toBe(true);
    if (resDeg.parsed?.type === "Angle") {
      expect(resDeg.parsed.valueRad).toBeCloseTo(Math.PI / 4, 5);
    }

    // Dimensionless scale (phi and fractions)
    const resPhi = parseTypedVCBExpression("phi");
    expect(resPhi.valid).toBe(true);
    if (resPhi.parsed?.type === "DimensionlessScale") {
      expect(resPhi.parsed.factor).toBeCloseTo(PHI, 5);
    }

    const resFrac = parseTypedVCBExpression("16/9");
    expect(resFrac.valid).toBe(true);
    if (resFrac.parsed?.type === "DimensionlessScale") {
      expect(resFrac.parsed.factor).toBeCloseTo(16 / 9, 5);
    }

    // Reject division by zero
    const resDiv0 = parseTypedVCBExpression("5/0");
    expect(resDiv0.valid).toBe(false);
  });

  /**
   * The unit default is a product decision, not a USD one.
   *
   * scene3d's contract declares metersPerUnit 1 (src/contract.ts), so a
   * scene authored without overriding it is in metres. This defaulted to
   * USD's unauthored-stage fallback of 0.01 instead, and every length typed
   * on an ordinary scene came out 100x too large. Every call in the suite
   * above passes the factor explicitly, so nothing pinned the default.
   */
  it("defaults to the scene3d contract's metres, not USD's centimetres", () => {
    const res = parseTypedVCBExpression("2m");
    expect(res.valid).toBe(true);
    if (res.parsed?.type === "Length") {
      expect(res.parsed.rawMeters).toBeCloseTo(2, 6);
      expect(res.parsed.valueSceneUnits).toBeCloseTo(2, 6);
    }

    // A nonsensical stage factor is refused rather than producing Infinity
    // or a silently negative length.
    expect(parseTypedVCBExpression("2m", 0).valid).toBe(false);
    expect(parseTypedVCBExpression("2m", -1).valid).toBe(false);
    expect(parseTypedVCBExpression("2m", Number.NaN).valid).toBe(false);
  });

  it("indexes semantic scene features and filters queries excluding moving objects", () => {
    const broadphase = new PersistentSnapBroadphase();

    broadphase.insertFeature({
      id: "table_corner_1",
      kind: "vertex",
      ownerObjectId: "table_1",
      worldBounds: { min: [0.9, 0, 0.9], max: [1.1, 0.1, 1.1] },
      worldPosition: [1.0, 0.0, 1.0],
    });

    broadphase.insertFeature({
      id: "chair_foot_1",
      kind: "vertex",
      ownerObjectId: "chair_moving",
      worldBounds: { min: [1.0, 0, 1.0], max: [1.2, 0.1, 1.2] },
      worldPosition: [1.1, 0.0, 1.1],
    });

    // Query near (1.0, 0.0, 1.0) with radius 0.5 excluding "chair_moving"
    const results = broadphase.queryCandidatesNear([1.0, 0.0, 1.0], 0.5, "chair_moving");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("table_corner_1");
  });
});
