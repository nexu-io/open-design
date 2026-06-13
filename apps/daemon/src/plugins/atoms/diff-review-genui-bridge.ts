// Phase 8 entry slice / spec §10.3 / §21.5 — diff-review GenUI bridge.
//
// Glue between the daemon's GenUI respond endpoint and the
// `runDiffReview()` helper. When the user (or the agent) answers the
// auto-derived `__auto_diff_review_<stageId>` choice surface, the
// daemon should immediately persist that decision into the run's
// project cwd as `<cwd>/review/decision.json` so the next pipeline
// stage (handoff atom) sees the user's decision without a second
// turn through the agent.
//
// This module is intentionally narrow:
//   - `isDiffReviewSurfaceId(id)` — the only place the
//     '__auto_diff_review_' prefix is owned, so future renames flow
//     from one constant.
//   - `parseDiffReviewGenuiResponse(value)` — coerces the JSON body
//     the surface renderer submitted into the
//     `runDiffReview({ decision })` shape, with strict validation.
//   - `applyDiffReviewDecisionToCwd({ cwd, value, reviewer })` —
//     end-to-end glue that calls runDiffReview() with the parsed
//     decision and returns the report. Best-effort on the daemon
//     side: failures are swallowed and logged so the GenUI respond
//     route still returns 200.
//
// The bridge is filesystem-only (no SQLite). The respond endpoint
// owns the genui_surfaces row; this helper just persists the
// downstream review/decision.json + receipts.

import { runDiffReview, type DiffReviewer, type DiffReviewReport } from './diff-review.js';
import { runAndPersistHandoff, type RunAndPersistHandoffResult } from './handoff.js';

const DIFF_REVIEW_SURFACE_PREFIX = '__auto_diff_review_';

export function isDiffReviewSurfaceId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(DIFF_REVIEW_SURFACE_PREFIX);
}

export interface ParsedDiffReviewDecision {
  decision: 'accept' | 'reject' | 'partial';
  accepted_files?: string[];
  rejected_files?: string[];
  reason?: string;
}

export function parseDiffReviewGenuiResponse(value: unknown): ParsedDiffReviewDecision | { error: string } {
  if (!value || typeof value !== 'object') {
    return { error: 'diff-review response must be a JSON object' };
  }
  const v = value as Record<string, unknown>;
  const decision = v.decision;
  if (decision !== 'accept' && decision !== 'reject' && decision !== 'partial') {
    return { error: `decision must be one of accept / reject / partial; got ${typeof decision === 'string' ? decision : typeof decision}` };
  }
  const out: ParsedDiffReviewDecision = { decision };
  if (Array.isArray(v.accepted_files)) {
    out.accepted_files = v.accepted_files.filter((s): s is string => typeof s === 'string');
  }
  if (Array.isArray(v.rejected_files)) {
    out.rejected_files = v.rejected_files.filter((s): s is string => typeof s === 'string');
  }
  if (typeof v.reason === 'string' && v.reason.length > 0) out.reason = v.reason;
  return out;
}

export interface ApplyDiffReviewDecisionInput {
  cwd: string;
  value: unknown;
  reviewer: DiffReviewer;
}

export interface ApplyDiffReviewDecisionResult {
  ok: true;
  report: DiffReviewReport;
  // Plan §3.T1 — when the diff-review write succeeds, we also run the
  // handoff atom against the project cwd so `<cwd>/handoff/manifest.json`
  // tracks the promotion ladder live. Best-effort: a failure here
  // doesn't fail the overall bridge call (the diff-review write
  // already succeeded).
  handoff?: RunAndPersistHandoffResult;
  handoffError?: string;
}
export interface ApplyDiffReviewDecisionFailure {
  ok: false;
  error: string;
}

export async function applyDiffReviewDecisionToCwd(
  input: ApplyDiffReviewDecisionInput,
): Promise<ApplyDiffReviewDecisionResult | ApplyDiffReviewDecisionFailure> {
  const parsed = parseDiffReviewGenuiResponse(input.value);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  try {
    const decision: NonNullable<Parameters<typeof runDiffReview>[0]['decision']> = {
      decision: parsed.decision,
      reviewer: input.reviewer,
    };
    if (parsed.accepted_files) decision.accepted_files = parsed.accepted_files;
    if (parsed.rejected_files) decision.rejected_files = parsed.rejected_files;
    if (parsed.reason)         decision.reason = parsed.reason;
    const report = await runDiffReview({ cwd: input.cwd, decision });
    // Auto-promote `<cwd>/handoff/manifest.json` from the new
    // decision + any prior build-test signals. Best-effort.
    const result: ApplyDiffReviewDecisionResult = { ok: true, report };
    try {
      result.handoff = await runAndPersistHandoff({ cwd: input.cwd });
    } catch (err) {
      result.handoffError = (err as Error).message;
    }
    return result;
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
