import type { ChatSessionMode } from '@open-design/contracts';
import type { AgentEvent, ChatMessage } from '../types';
import { hasFileMutationToolUse } from './file-ops';
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
 * A successful agent process is not necessarily a delivered design.
 *
 * Design mode is artifact-first, but clarification and explicitly unfinished
 * turns are valid intermediate outcomes. Chat and Plan remain text-first and
 * must never be failed merely because they did not write a project file.
 *
 * A zero-file success is only a missing deliverable when the turn attempted
 * to mutate project files (or an artifact save failed). A turn that never
 * tried to write and answered with substantive text is a report-only result —
 * image analysis and report-only audits end exactly this way — and must not
 * be downgraded to ARTIFACT_NOT_FOUND. The known cost: an agent that merely
 * claims completion without ever calling a write tool now passes as text; the
 * text itself makes that visible to the user.
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
  if (
    input.producedFileCount > 0 ||
    input.traceObjectFileCount > 0 ||
    input.persistenceSucceeded ||
    hasLiveArtifactDelivery(input.events)
  ) {
    return 'delivered';
  }
  if (input.persistenceFailed) return 'delivery_failed';
  if (!hasFileMutationToolUse(input.events) && input.content.trim().length > 0) {
    return 'report_only';
  }
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
