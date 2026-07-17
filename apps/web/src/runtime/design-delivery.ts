import type { ChatSessionMode } from '@open-design/contracts';
import type { AgentEvent, ChatMessage } from '../types';
import { deriveFileOps, hasFileMutationToolUse } from './file-ops';
import { unfinishedTodosFromEvents } from './todos';

export type DesignDeliveryOutcome =
  | 'not_required'
  | 'awaiting_input'
  | 'delivered'
  | 'report_only'
  | 'no_result'
  | 'delivery_failed';

export interface DesignDeliveryInput {
  sessionMode: ChatSessionMode | null | undefined;
  runStatus: ChatMessage['runStatus'];
  content: string;
  events: AgentEvent[] | undefined;
  producedFileCount: number;
  traceObjectFileCount: number;
  persistenceSucceeded?: boolean;
  persistenceFailed?: boolean;
}

/**
 * Delivery failures retain the agent-process `succeeded` status, but they are
 * terminal user-facing failures and must follow the same retry path as a
 * failed process run.
 */
export function isRetryableAssistantTerminalFailure(
  message: Pick<ChatMessage, 'runStatus' | 'resultDeliveryState'>,
): boolean {
  return (
    message.runStatus === 'failed' ||
    message.resultDeliveryState === 'no_result' ||
    message.resultDeliveryState === 'delivery_failed'
  );
}

function asksForUserInput(content: string): boolean {
  return /<(?:question-form|ask-question)\b/i.test(content);
}

function isIntermediateDesignTurn(
  content: string,
  events: AgentEvent[] | undefined,
): boolean {
  return asksForUserInput(content) || unfinishedTodosFromEvents(events).length > 0;
}

function hasLiveArtifactDelivery(events: AgentEvent[] | undefined): boolean {
  return (events ?? []).some(
    (event) =>
      (event.kind === 'live_artifact' && event.action !== 'deleted') ||
      (event.kind === 'live_artifact_refresh' && event.phase === 'succeeded'),
  );
}

/**
 * True when at least one write/edit/delete tool call in the turn is *not known
 * to have failed*. Derived from `deriveFileOps` which already pairs tool_use ↔
 * tool_result and assigns per-file status:
 *   - 'done'    — paired tool_result, not an error (success)
 *   - 'running' — no paired tool_result yet (in-flight, or reattach where the
 *                 result event was dropped from the persisted events)
 *   - 'error'   — paired tool_result with isError, or a known tool failure
 *
 * Treats both 'done' and 'running' as a delivered mutation. The 'running'
 * case matters on reattach: a completed daemon run whose persisted events lost
 * the tool_result would regress to no_result under a strict 'done'-only gate,
 * resurrecting the very #5753 symptom this PR fixes. The only case that falls
 * through is an *all-errored* edit turn (every mutation has status 'error'),
 * which must surface a retry affordance rather than silently read as success.
 *
 * Per PerishCode review on PR #5776: 'hasFileMutationToolUse' matched any
 * attempt regardless of outcome and would flip a fully-failed edit turn to
 * delivered, leaving the preview stale with no error surfaced.
 */
function hasNonFailedFileMutation(events: AgentEvent[] | undefined): boolean {
  return (deriveFileOps(events) ?? []).some(
    (entry) =>
      entry.ops.some((op) => op === 'write' || op === 'edit' || op === 'delete') &&
      entry.status !== 'error',
  );
}

/**
 * A successful agent process is not necessarily a delivered design.
 *
 * Design mode is artifact-first, but clarification and explicitly unfinished
 * turns are valid intermediate outcomes. Chat and Plan remain text-first and
 * must never be failed merely because they did not write a project file.
 *
 * A successful turn is delivered when ANY of the following holds:
 *   - producedFiles / traceObjects non-empty (full file delivery)
 *   - persistenceSucceeded (daemon confirmed file write)
 *   - live_artifact delivery event (artifact rendered)
 *   - at least one file-mutation tool_use with a non-error tool_result
 *     (in-place edit, no new file produced but the file was actually changed)
 *
 * A zero-file, zero-successful-mutation success is:
 *   - delivery_failed if persistence explicitly failed,
 *   - report_only when no file-mutation tool was attempted at all (audits,
 *     image analysis, report-only design reviews) and substantive text exists,
 *   - no_result when a mutation was attempted but none succeeded — surfaces a
 *     retry affordance. The original `hasFileMutationToolUse` gate matched any
 *     attempt regardless of outcome, which would flip a fully-failed edit
 *     turn to delivered, leaving the preview stale with no error surfaced
 *     (PerishCode review on PR #5776).
 */
export function resolveDesignDeliveryOutcome(
  input: DesignDeliveryInput,
): DesignDeliveryOutcome {
  if (input.sessionMode !== 'design' || input.runStatus !== 'succeeded') {
    return 'not_required';
  }
  if (isIntermediateDesignTurn(input.content, input.events)) {
    return 'awaiting_input';
  }
  if (input.persistenceFailed) return 'delivery_failed';
  if (
    input.producedFileCount > 0 ||
    input.traceObjectFileCount > 0 ||
    input.persistenceSucceeded ||
    hasLiveArtifactDelivery(input.events) ||
    hasNonFailedFileMutation(input.events)
  ) {
    return 'delivered';
  }
  // No file-mutation tool was called at all → substantive text is a
  // report-only result (audits, image analysis, design reviews).
  if (!hasFileMutationToolUse(input.events) && input.content.trim().length > 0) {
    return 'report_only';
  }
  // Mutation was attempted but none succeeded → no_result, surface retry.
  return 'no_result';
}

/**
 * The run-status event can arrive before the final project-file refresh. Keep
 * completion feedback quiet during that gap so users never hear "success"
 * immediately before the same turn is downgraded to a delivery failure.
 */
export function designDeliveryVerificationPending(
  message: Pick<
    ChatMessage,
    | 'sessionMode'
    | 'runStatus'
    | 'resultDeliveryState'
    | 'content'
    | 'events'
    | 'producedFiles'
    | 'traceObjectFiles'
  >,
): boolean {
  if (message.sessionMode !== 'design' || message.runStatus !== 'succeeded') return false;
  if (message.resultDeliveryState) return false;
  if (isIntermediateDesignTurn(message.content, message.events)) return false;
  return message.producedFiles === undefined || message.traceObjectFiles === undefined;
}
