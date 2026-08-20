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

/** Below this mean luminance a frame carries no recoverable detail. */
const EMPTY_LUMINANCE = 0.002;

/** Below this lit-pixel fraction the subject is a speck in an empty frame. */
const SPARSE_COVERAGE = 0.01;

export function lintProof(frames: ProofFrameStats[] | undefined, issues: Issue[]): void {
  if (!frames || frames.length === 0) return;

  const measured = frames.filter((f) => f.meanLuminance !== null && f.coverage !== null);
  if (measured.length === 0) return;

  const empty = measured.filter(
    (f) => f.meanLuminance! <= EMPTY_LUMINANCE || f.coverage! === 0,
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
        code: ISSUE_CODES.EMPTY_PROOF,
        severity: "error",
        message: `proof frame rendered empty: ${basename(frame.path)}`,
        hint: "the subject leaves frame at this turntable angle",
        target: basename(frame.path),
        detail: { meanLuminance: frame.meanLuminance, coverage: frame.coverage },
      });
    }
  } else {
    const sparse = measured.filter((f) => f.coverage! < SPARSE_COVERAGE);
    if (sparse.length === measured.length) {
      issues.push({
        code: ISSUE_CODES.SPARSE_PROOF,
        severity: "warning",
        message: `the subject fills under ${SPARSE_COVERAGE * 100}% of every proof frame`,
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
    const blownFrames = withBlown.filter((f) => f.blownRatio! > 0.6);
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

  // A turntable whose frames are all identical is not a turntable. This is
  // the shape a stale transform takes: N renders, one viewpoint.
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
        hint: "the camera is not moving between frames — the turntable adds no information",
        detail: { frames: measured.length },
      });
    }
  }
}

function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}
