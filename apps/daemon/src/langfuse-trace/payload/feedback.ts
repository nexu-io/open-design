/** @module langfuse-trace/payload/feedback
 * `buildFeedbackPayload` — score-create batch for user turn ratings (thumbs up/down + reason codes).
 * Imports only from `core/`; independent of the trace batch pipeline in `trace-payload.ts`.
 */
import { randomUUID } from 'node:crypto';

import type { FeedbackReportContext } from '../core/index.js';

// Build a Langfuse `score-create` batch for a user-supplied turn rating.
//
// Langfuse scores let evals filter traces by user feedback. We emit one
// NUMERIC score (`user_rating`, +1 / -1) plus optional CATEGORICAL scores
// for each reason code, so the Langfuse UI's score filters work out of
// the box. Raw custom-reason text rides in the score metadata when the
// user opted into telemetry.content; the consent gate lives in
// reportRunFeedback below, so this builder stays content-agnostic.
//
// Limitation: stable score ids (`${traceId}-rating`, `${traceId}-reason-${code}`)
// mean re-submission overwrites cleanly, but reason codes the user removes
// in a follow-up submission do not get a tombstone. A future change can
// thread `removedReasonCodes` through and emit overwriting "cleared"
// scores for them; not done here to keep this PR scoped to the bridge.
/**
 * Builds a Langfuse `score-create` batch from a user-supplied turn rating.
 * Emits one NUMERIC score (`user_rating`: `+1` for positive, `-1` for negative) plus
 * one CATEGORICAL score per reason code so Langfuse's score filters work out of the box.
 * Score IDs are stable (`${traceId}-rating` and `${traceId}-reason-${code}`) so
 * re-submissions overwrite cleanly rather than accumulate duplicates.
 * Raw custom-reason text is included only when the caller has already verified
 * `telemetry.content` consent; this function is content-agnostic by design.
 *
 * @param ctx - A {@link FeedbackReportContext} carrying the run ID, rating, and reason codes.
 * @returns An ordered array of `score-create` batch items ready for the Langfuse ingestion API.
 */
export function buildFeedbackPayload(ctx: FeedbackReportContext): unknown[] {
  const traceId = ctx.runId;
  const nowIso = new Date().toISOString();
  const batch: unknown[] = [];

  const ratingMetadata: Record<string, unknown> = {
    reasonCodes: ctx.reasonCodes,
    reasonCount: ctx.reasonCodes.length,
    hasCustomReason: ctx.hasCustomReason,
    // Raw text — gated upstream by telemetry.content consent.
    customReason: ctx.customReason || undefined,
    installationId: ctx.installationId ?? undefined,
    ...(ctx.metadata ?? {}),
  };

  batch.push({
    id: randomUUID(),
    type: 'score-create',
    timestamp: nowIso,
    body: {
      id: `${traceId}-rating`,
      traceId,
      name: 'user_rating',
      value: ctx.rating === 'positive' ? 1 : -1,
      dataType: 'NUMERIC',
      comment: ctx.rating,
      metadata: ratingMetadata,
    },
  });

  for (const code of ctx.reasonCodes) {
    batch.push({
      id: randomUUID(),
      type: 'score-create',
      timestamp: nowIso,
      body: {
        // Stable per (run, code) so re-submission overwrites cleanly.
        id: `${traceId}-reason-${code}`,
        traceId,
        name: 'user_rating_reason',
        value: code,
        dataType: 'CATEGORICAL',
        // Group the reason under the rating it was submitted with so a
        // "matched_request" tag on a thumbs-down run is still visibly
        // negative in the Langfuse UI.
        comment: ctx.rating,
      },
    });
  }

  return batch;
}
