// Analytics shaping for chat artifact capture (design §10.3).
//
// Pure on purpose: the call site owns the sink and the identity, this owns the
// numbers. That is what makes "does the alarm actually fire" a testable
// question instead of an integration one.
//
// PRIVACY (design §10.3, §11): counts only. No paths, labels, digests, byte
// sizes, prompts, or snapshot URLs — a snapshot is a copy of the user's own
// design work, and the failure code is the whole diagnostic.

import type { ChatArtifactCaptureResultProps } from '@open-design/contracts';

import type { CaptureRunChatArtifactsReport } from './run-capture.js';

export interface ChatArtifactCaptureTelemetryInput {
  projectId: string;
  runId: string;
  report: CaptureRunChatArtifactsReport;
}

/**
 * Build the event for one finished turn, or `null` when the turn produced no
 * cards at all.
 *
 * The null case matters: most turns write no artifacts, and emitting a row of
 * zeroes for each of them would make the failure rate this event exists to
 * watch a rounding error against a flood of no-ops.
 */
export function chatArtifactCaptureResultProps(
  input: ChatArtifactCaptureTelemetryInput,
): ChatArtifactCaptureResultProps | null {
  const { report } = input;
  if (report.refs === 0) return null;
  const sourceChanged = report.failureCodes.source_changed ?? 0;
  return {
    page_name: 'studio',
    area: 'chat_artifact_capture',
    project_id: input.projectId,
    run_id: input.runId,
    ref_count: report.refs,
    captured_count: report.captured,
    reused_count: report.reused,
    failed_count: report.failed,
    // Broken out of `failed_count`, not subtracted from it: this is a lens on
    // the failures, not a separate bucket, and a dashboard that had to
    // reconstruct the total from disjoint columns would get it wrong the first
    // time a new failure code appears.
    source_changed_count: sourceChanged,
    // A turn where nothing failed is a success even if every snapshot was
    // reused rather than freshly written — reuse is the strong path, not a
    // shortfall.
    result: report.failed > 0 ? 'degraded' : 'success',
  };
}
