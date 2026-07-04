// Authors: Leon Aburime using Claude Fable 5
// @ts-nocheck — carried over verbatim from server.ts's file-level @ts-nocheck.
// Strangler-fig MOVE of the run-completion telemetry fallback; do NOT copy.
/** @module run-telemetry-fallback
 * Terminal-fallback telemetry finalizer: when a run reaches a reportable
 * terminal status, schedules a delayed check that reports a synthetic
 * finalized assistant message IFF the run wasn't already reported and its
 * message telemetry wasn't already finalized — so a run that ends without a
 * normal finalize path still lands exactly one Langfuse completion event.
 *
 * Extracted from startServer as an explicit-deps factory.
 */

import { getMessageTelemetryFinalizationState } from './db.js';
import { shouldReportRunCompletionTelemetryFallbackStatus } from './run-telemetry.js';

export function createReportRunCompletionTelemetryFallback(deps: any) {
  const {
    db,
    reportedRuns,
    reportFinalizedMessage,
    LANGFUSE_TERMINAL_FALLBACK_DELAY_MS,
  } = deps;
  const reportRunCompletionTelemetryFallback = ({
    analyticsContext,
    run,
    status,
  }: {
    analyticsContext: any;
    run: any;
    status: string;
  }) => {
    if (!shouldReportRunCompletionTelemetryFallbackStatus(status)) return;
    const timer = setTimeout(() => {
      if (reportedRuns.has(run.id)) return;
      if (run.assistantMessageId) {
        const messageTelemetry = getMessageTelemetryFinalizationState(db, run.assistantMessageId);
        if (messageTelemetry.finalizedAt !== null) return;
      }
      reportFinalizedMessage(
        {
          id: run.assistantMessageId ?? `${run.id}-terminal`,
          conversationId: run.conversationId,
          endedAt: run.updatedAt,
          role: 'assistant',
          runId: run.id,
          runStatus: status,
        },
        { telemetryFinalized: true },
        {
          analyticsContext,
          conversationId: run.conversationId,
          projectId: run.projectId,
          reportTrigger: 'terminal_fallback',
        },
      );
    }, LANGFUSE_TERMINAL_FALLBACK_DELAY_MS);
    timer.unref?.();
  };
  return reportRunCompletionTelemetryFallback;
}
