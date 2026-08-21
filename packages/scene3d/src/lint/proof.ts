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

export const DEFAULT_PROOF_THRESHOLDS: ProofThresholds = {
  emptyLuminance: 0.002,
  sparseCoverage: 0.01,
  blownRatio: 0.6,
};

export function lintProof(
  frames: ProofFrameStats[] | undefined,
  issues: Issue[],
  thresholds: ProofThresholds = DEFAULT_PROOF_THRESHOLDS,
): void {
  if (!frames || frames.length === 0) return;

  const measured = frames.filter((f) => f.meanLuminance !== null && f.coverage !== null);
  if (measured.length === 0) return;

  const empty = measured.filter(
    (f) => f.meanLuminance! <= thresholds.emptyLuminance || f.coverage! === 0,
  );
  if (empty.length === measured.length) {
    issues.push({
      code: ISSUE_CODES.EMPTY_PROOF,
      severity: "error",
      message: `every proof frame rendered empty (${measured.length} frame(s))`,
      hint: "check the camera aim, the scene lights, and that the subject is in front of the camera",
      detail: { frames: measured.length, meanLuminance: measured[0]!.meanLuminance },
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
  const withBlown = measured.filter((f) => typeof f.blownRatio === "number");
  if (withBlown.length > 0) {
    const blownFrames = withBlown.filter((f) => f.blownRatio! > thresholds.blownRatio);
    if (blownFrames.length === withBlown.length) {
      issues.push({
        code: ISSUE_CODES.OVEREXPOSED_PROOF,
        severity: "warning",
        message: `every proof frame is blown out (${Math.round(withBlown[0]!.blownRatio! * 100)}% of lit pixels near white)`,
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
    const identical = measured.every(
      (f) =>
        f.meanLuminance === measured[0]!.meanLuminance && f.coverage === measured[0]!.coverage,
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
