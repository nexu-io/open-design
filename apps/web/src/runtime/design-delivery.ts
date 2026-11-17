import type { ChatSessionMode } from '@open-design/contracts';
import {
  containsQuestionFormAsk,
  containsUnrenderableQuestionForm,
} from '../artifacts/question-form';
import type { AgentEvent, ChatMessage } from '../types';
import { hasFileMutationToolUse, extractSimpleBashDeletes, classifyToolName } from './file-ops';
import { unfinishedTodosFromEvents } from './todos';

/**
 * True when the event stream contains a file-mutation tool (Write / Edit /
 * Delete / Bash rm) whose result was an error. An errored mutation must not
 * be upgraded to `delivered` just because the file is absent from the
 * post-turn snapshot — the absence could be an unrelated external deletion.
 */
function hasErroredFileMutation(events: AgentEvent[] | undefined): boolean {
  const eventsList = events ?? [];
  for (let i = 0; i < eventsList.length; i++) {
    const ev = eventsList[i]!;
    if (ev.kind !== 'tool_result') continue;
    if (ev.isError) {
      // Walk backwards to find the matching tool_use.
      for (let j = i - 1; j >= 0; j--) {
        const prev = eventsList[j]!;
        if (prev.kind !== 'tool_use') continue;
        if (prev.id === ev.toolUseId) {
          if (prev.name === 'Bash') {
            // Bash is not exclusively a file mutation — check if it
            // contained an rm/unlink targeting a project path.
            if (extractSimpleBashDeletes(prev.input).length > 0) return true;
          } else {
            const kind = classifyToolName(prev.name);
            if (kind === 'write' || kind === 'edit' || kind === 'delete') return true;
          }
          break;
        }
      }
    }
  }
  return false;
}

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
  /** Authoritative artifact count reported by the daemon at run finalization. */
  artifactCount?: number;
  /**
   * Count of project files that existed before the turn and are confirmed
   * missing from the post-turn snapshot. Distinct from `producedFileCount`,
   * which only includes files that survived the turn. Lets a Bash `rm`-only
   * turn or an in-place Edit that deletes project files qualify as a real
   * delivery even when the post-turn `producedFileCount` is zero — #7744.
   */
  confirmedDeletions?: number;
  persistenceSucceeded?: boolean;
  persistenceFailed?: boolean;
}

/**
 * Whether a turn failed, as the user is told it did: only when the run itself
 * ended in error (P0-24). A delivery outcome (`no_result` / `delivery_failed`)
 * describes the artifact, not the run — whether files were produced, saved or
 * usable never changes the turn's status, so it no longer earns the failure
 * card or its retry path.
 */
export function isRetryableAssistantTerminalFailure(
  message: Pick<ChatMessage, 'runStatus'>,
): boolean {
  return message.runStatus === 'failed';
}

/**
 * A bare open-tag scan is not enough: a turn that needed no clarification can
 * narrate its decision straight into a `<question-form>` tag, and treating
 * that prose as an ask latches the turn to `awaiting_input` no matter what it
 * delivered. Share the form protocol's own body precondition instead of
 * growing a second regex here.
 */
function asksForUserInput(content: string): boolean {
  return containsQuestionFormAsk(content);
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
 *
 * Turns that mutated files (Write / Edit / Delete / Bash rm) but produced
 * zero new files are still deliveries — the mutation itself was the work.
 * For example: an agent deleting stale scaffolding, renaming a file via
 * Bash mv, or editing config in-place without adding new files. Skipping
 * the mutation check for these cases incorrectly marks them as no_result
 * even though the run accomplished its task.
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
    (input.artifactCount ?? 0) > 0 ||
    input.persistenceSucceeded ||
    hasLiveArtifactDelivery(input.events)
  ) {
    return 'delivered';
  }
  // A snapshot-confirmed deletion requires a successful (non-errored) file
  // mutation in the event stream. An errored mutation must not be upgraded to
  // `delivered` — the matching tool_result's isError means the command failed,
  // so the file absence could be an unrelated external deletion rather than
  // an intentional agent action. Without a successful mutation, the turn
  // remains `no_result` so the user can retry.
  if (
    (input.confirmedDeletions ?? 0) > 0 &&
    !hasErroredFileMutation(input.events)
  ) {
    return 'delivered';
  }
  if (input.persistenceFailed) return 'delivery_failed';
  // A succeeded Design turn whose only output is a closed, unparseable
  // <question-form> is a protocol error that must not be treated as a
  // successful text answer. Restore the unrenderable-question gate that
  // main runs immediately after persistenceFailed.
  if (containsUnrenderableQuestionForm(input.content)) return 'no_result';
  // A zero-mutation, text-only turn is a report-only result (image
  // analysis, audit-style reports). A mutation-only turn with no new files
  // — e.g. Bash `rm stale.html` or an in-place Edit that doesn't add files —
  // is a real project change. Treat those as delivered when the project
  // file snapshot can confirm the deletion landed (a path existed pre-turn
  // and is missing post-turn). When the snapshot cannot prove the mutation
  // happened, fall through to `no_result` so the user can still retry.
  const mutated = hasFileMutationToolUse(input.events);
  if (!mutated && input.content.trim().length > 0) {
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

/**
 * A succeeded Design message that still lacks delivery metadata long after its
 * run finished is a historical row whose delivery never materialized (e.g. a
 * row persisted by an older build before the final project-file refresh, or an
 * interrupted persistence path). Auto-replaying such a row on every reload is
 * the #6505 loop — the metadata will never appear, so each reload re-enters the
 * reattach path and the chat stays visually loading.
 *
 * Reconcile only within a short window after the run's terminal time (enough
 * for the run-status event to race ahead of the project-file refresh the
 * `designDeliveryVerificationPending` gap exists to absorb); past that window
 * the row is treated as a terminal outcome instead of being replayed.
 */
export function designDeliveryReconciliationStale(
  message: Pick<
    ChatMessage,
    | 'sessionMode'
    | 'runStatus'
    | 'resultDeliveryState'
    | 'endedAt'
    | 'startedAt'
    | 'createdAt'
  >,
  now: number = Date.now(),
): boolean {
  if (message.sessionMode !== 'design' || message.runStatus !== 'succeeded') return false;
  if (message.resultDeliveryState) return false;
  // The #6505 legacy shape can lack `endedAt` entirely (rows persisted before
  // `endedAt` existed), so bound the reconciliation age from any persisted
  // terminal timestamp — `endedAt` first, then the run/message start time. A
  // row with no timestamp at all defers to the existing verification logic.
  const terminalAt = message.endedAt ?? message.startedAt ?? message.createdAt;
  if (terminalAt == null) return false;
  return now - terminalAt > DESIGN_DELIVERY_RECONCILIATION_WINDOW_MS;
}

/** How long after a run's terminal time a Design-mode delivery may be reconciled. */
export const DESIGN_DELIVERY_RECONCILIATION_WINDOW_MS = 5 * 60 * 1000;
