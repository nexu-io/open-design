import { Issue, ProofFrameStats } from "../types.js";
import { ISSUE_CODES } from "../errors.js";

/**
 * Proof integrity — does the render actually show the model?
 *
 * The proof frames are the loop's vision feedback, and a black render is the
 * one failure that reads as success: the pipeline reports "compiles clean",
 * the PNGs exist at a plausible size, and nothing downstream can tell that
 * the agent is iterating against an empty image. So the frames are measured,
 * not assumed. Every rule here is a coverage fact from the renderer, and the
 * codes are pinned by the fixture corpus like every other rule.
 *
 * Real bugs this caught on the way in: a camera aimed 180° away from the
 * subject (`to_track_quat('-Z')`), and a stale `matrix_world` that made an
 * eight-step turntable emit eight identical frames.
 */

/**
 * Proof-quality thresholds. Physical defaults, but overridable per project
 * through `conventions.proof` — a deliberately dark or flat-lit stylized asset
 * has a legitimately different notion of "too dark" or "blown out", and the
 * fork's rule is that a lint threshold is the contract's call, not a constant
 * buried in the module.
 */
export interface ProofThresholds {
  /** Below this mean luminance a frame carries no recoverable detail. */
  emptyLuminance: number;
  /** Below this lit-pixel fraction the subject is a speck in an empty frame. */
  sparseCoverage: number;
  /** Above this fraction of lit pixels near white, the frame is blown out. */
  blownRatio: number;
}

// Frozen: this object is the default parameter of every lintProof call in
// the process, so a caller mutating a field would silently retune the
// thresholds for every later invocation — cross-project config leakage.
export const DEFAULT_PROOF_THRESHOLDS: Readonly<ProofThresholds> = Object.freeze({
  emptyLuminance: 0.002,
  sparseCoverage: 0.01,
  blownRatio: 0.6,
});

export function lintProof(
  frames: ProofFrameStats[] | undefined,
  issues: Issue[],
  thresholds: ProofThresholds = DEFAULT_PROOF_THRESHOLDS,
  /** Largest dimension of the scene, metres — measured, for the empty-frame
   *  diagnosis. Absent when there is no census to measure it from. */
  sceneSizeMetres?: number,
): void {
  if (!frames || frames.length === 0) return;

  // Valid-range-only: NaN/Infinity from a corrupt readback satisfies a null
  // check and then sails past every threshold comparison, and a FINITE
  // impossibility (coverage 1.3, luminance −0.2) is the same corruption in
  // a subtler coat — both fractions live in [0,1] by construction. Anything
  // outside is UNMEASURED, and falls into the coverage note below.
  const frac = (v: number | null | undefined): v is number =>
    Number.isFinite(v) && (v as number) >= 0 && (v as number) <= 1;
  const measured = frames.filter((f) => frac(f.meanLuminance) && frac(f.coverage));
  // Frames the stats pass could not read are NOT silently dropped from the
  // verdict: a proof whose pixels were never measured is unchecked, and
  // unchecked must never read as clean — the black-render trap this module
  // exists to catch, reinstated one layer up.
  if (measured.length < frames.length) {
    const skipped = frames.length - measured.length;
    issues.push({
      code: ISSUE_CODES.PROOF_UNCHECKED,
      severity: "warning",
      message:
        measured.length === 0
          ? `no proof frame could be measured (${skipped} frame(s) returned no pixel stats) — the render was not visually verified`
          : `proof coverage is PARTIAL: ${measured.length} frame(s) measured, ${skipped} returned no pixel stats`,
      hint: "the frames rendered but their pixels could not be read back; inspect the PNGs by eye and the proof stage's stderr",
      detail: { frames: frames.length, measured: measured.length, skipped },
    });
  }
  if (measured.length === 0) return;

  const empty = measured.filter(
    (f) => f.meanLuminance! <= thresholds.emptyLuminance || f.coverage! === 0,
  );
  // The compile-failing "EVERY frame rendered empty" claim requires every
  // frame to have been MEASURED: with unmeasured frames in the set, an
  // all-measured-empty result only proves the frames it saw, so it degrades
  // to the per-frame warning instead of overclaiming a total render failure.
  if (empty.length === measured.length && measured.length === frames.length) {
    issues.push({
      code: ISSUE_CODES.EMPTY_PROOF,
      severity: "error",
      message: `every proof frame rendered empty (${measured.length} frame(s))`,
      hint: "check the camera aim, the scene lights, and that the subject is in front of the camera",
      // Scene size travels with the finding because scale WAS the cause of
      // every empty-frame report worth investigating here: a fixed camera
      // distance and Blender's fixed clip planes each blanked one end of the
      // range, and covered for each other so neither showed alone. Both are
      // derived now and the proof renders sub-millimetre to kilometre, so an
      // empty frame is a real framing or lighting fault again — but the
      // number that led to the diagnosis stays in the record.
      detail: {
        frames: measured.length,
        meanLuminance: measured[0]!.meanLuminance,
        ...(sceneSizeMetres !== undefined ? { sceneSizeMetres } : {}),
      },
    });
  } else if (empty.length > 0) {
    for (const frame of empty) {
      issues.push({
        // A single empty angle is a WARNING (its own code), not the
        // compile-failing EMPTY_PROOF error that EVERY frame black is: 7 of 8
        // good frames is a materially milder defect than a total render
        // failure, and one off-angle should not fail the whole compile.
        code: ISSUE_CODES.PARTIAL_EMPTY_PROOF,
        severity: "warning",
        message: `proof frame rendered empty: ${basename(frame.path)}`,
        hint: "the subject leaves frame at this turntable angle",
        target: basename(frame.path),
        detail: { meanLuminance: frame.meanLuminance, coverage: frame.coverage },
      });
    }
  } else {
    const sparse = measured.filter((f) => f.coverage! < thresholds.sparseCoverage);
    if (sparse.length === measured.length) {
      issues.push({
        code: ISSUE_CODES.SPARSE_PROOF,
        severity: "warning",
        message: `the subject fills under ${thresholds.sparseCoverage * 100}% of every proof frame`,
        hint: "the camera is too far out; tighten the framing",
        detail: { coverage: measured[0]!.coverage },
      });
    }
  }

  // Overexposure is the failure the black-frame rule cannot see: the frame
  // is "technically not black, but blown out to pastel mush" — lint-clean,
  // shadowless, illegible. Lighting mistakes overwhelmingly err bright
  // (energy values are opaque and agents guess high), so this is measured
  // over lit pixels only: a dark background must not dilute the signal.
  const withBlown = measured.filter((f) => frac(f.blownRatio));
  // Exposure coverage is stated like frame coverage: a measured frame whose
  // blownRatio is absent or non-finite was never exposure-checked, and
  // silence there let a corrupt readback pass without an overexposure
  // verdict. PARTIAL coverage is the corruption signature and is named;
  // a census with NO blownRatio anywhere predates the field entirely
  // (uniform absence = version skew, not corruption) and stays quiet, or
  // every legacy compile would wear the note. Info, not warning — the
  // luminance verdicts above still ran either way.
  if (withBlown.length > 0 && withBlown.length < measured.length) {
    issues.push({
      code: ISSUE_CODES.PROOF_UNCHECKED,
      severity: "info",
      message: `overexposure was not measured for ${measured.length - withBlown.length} of ${measured.length} frame(s) (no finite blownRatio) — the blown-out check covers only the rest`,
      detail: { frames: measured.length, exposureMeasured: withBlown.length },
    });
  }
  if (withBlown.length > 0) {
    const blownFrames = withBlown.filter((f) => f.blownRatio! > thresholds.blownRatio);
    if (blownFrames.length === withBlown.length) {
      // The message claims only what was measured: "every proof frame" over
      // a partially-measured set (an older stats runner, a failed readback)
      // would overstate coverage exactly like the EMPTY_PROOF total claim.
      const scope =
        withBlown.length === frames.length
          ? "every proof frame is blown out"
          : `all ${withBlown.length} measured proof frame(s) are blown out (${frames.length - withBlown.length} unmeasured)`;
      issues.push({
        code: ISSUE_CODES.OVEREXPOSED_PROOF,
        severity: "warning",
        message: `${scope} (${Math.round(withBlown[0]!.blownRatio! * 100)}% of lit pixels near white)`,
        hint: "cut light energy — start at roughly a quarter and re-render; shadows should be visible",
        detail: { blownRatio: withBlown[0]!.blownRatio },
      });
    }
  }

  // A turntable whose frames are all identical adds no information. Usually a
  // stale transform (N renders, one viewpoint), but a rotationally symmetric
  // subject (a sphere, an on-axis cylinder) genuinely renders the same from
  // every angle with the sun keyed to the camera's quarter — so the trigger
  // stays (the stale-transform case is real and worth catching), but the hint
  // names BOTH causes so an agent does not "fix" a camera that is fine.
  if (measured.length > 2) {
    // Identity over every statistic the stats pass carries, not just two:
    // distinct views colliding on mean AND coverage AND blown ratio at
    // full float precision is the strongest aggregate evidence available
    // short of hashing pixels. The hint below still names the legitimate
    // cause (rotational symmetry) so a matching subject is not "fixed".
    const identical = measured.every(
      (f) =>
        f.meanLuminance === measured[0]!.meanLuminance &&
        f.coverage === measured[0]!.coverage &&
        f.blownRatio === measured[0]!.blownRatio,
    );
    if (identical) {
      issues.push({
        code: ISSUE_CODES.STATIC_TURNTABLE,
        severity: "warning",
        message: `all ${measured.length} turntable frames are identical`,
        hint: "either the camera is not moving between frames, or the subject is rotationally symmetric about the turntable axis",
        detail: { frames: measured.length },
      });
    }
  }
}

function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}
