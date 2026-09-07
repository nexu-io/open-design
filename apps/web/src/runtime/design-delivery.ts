import type { ChatSessionMode } from '@open-design/contracts';
import { containsQuestionFormAsk } from '../artifacts/question-form';
import type { AgentEvent, ChatMessage } from '../types';
import {
  declaredDeletionTargets,
  hasFileMutationToolUse,
  hasPossibleFileMutationFailure,
} from './file-ops';
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
  /**
   * Project-relative files the daemon observed this run remove, from its own
   * before/after snapshots of the project tree (`RunStatus.removedPaths`).
   *
   * This is the only sound source for the signal. A browser-side listing diff
   * proves a file is gone but not who removed it, and the run's shell commands
   * cannot supply the difference: `cd x && rm y`, `find … -delete` and
   * `xargs rm` are not parseable from the command text, and the text never
   * says whether the command executed. The daemon watches the tree either side
   * of the run, so it answers both questions at once.
   */
  removedPaths?: readonly string[];
  /**
   * Resolved project directory, used to place an absolute path a `Delete`
   * tool supplied. Without it such a path cannot be shown to be in-project
   * and is ignored.
   */
  projectRoot?: string | null;
  /** Authoritative artifact count reported by the daemon at run finalization. */
  artifactCount?: number;
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
 * Removals this run can be held responsible for: files the daemon observed
 * leave the project, intersected with the paths the run declared it was
 * deleting through a structured `Delete`-family tool call.
 *
 * Each half answers what the other cannot. The daemon's record is a
 * before/after diff of the project tree, so it proves a file left but spans
 * the run's window rather than its actions — a user or sync client deleting
 * something mid-turn lands in it. The tool call names a target with no command
 * text to parse, but proves only intent. Requiring both means a turn is
 * credited for a removal only when it asked for that exact path and that exact
 * path is gone.
 *
 * A shell deletion contributes nothing, because a command string can supply
 * neither half: it cannot be parsed for what it removed, and running a shell
 * is not evidence of having removed anything. That leaves the `cd … && rm …`
 * form of issue #7744 uncredited, pending run-scoped provenance at the
 * mutation boundary.
 */
function attributedRemovalCount(input: DesignDeliveryInput): number {
  const removed = input.removedPaths;
  if (!removed || removed.length === 0) return 0;
  const declared = declaredDeletionTargets(input.events, input.projectRoot);
  if (declared.size === 0) return 0;
  return removed.filter((path) => declared.has(path)).length;
}

/**
 * A daemon-observed deletion is delivery evidence unless something in the turn
 * errored in a way that could have left the project half-mutated. A successful
 * cleanup next to a failed write is still a turn that did not land its work,
 * and must keep the "attempted but failed -> no_result -> Retry" path.
 */
function hasAttributedDeletionDelivery(input: DesignDeliveryInput): boolean {
  return attributedRemovalCount(input) > 0 && !hasPossibleFileMutationFailure(input.events);
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
 * Deletions are the one mutation that never leaves a produced file behind. A
 * turn whose only file work was removing project files has no artifact to
 * count, yet it is not report-only either, because the `rm` was a mutation
 * attempt. The daemon settles it: it snapshots the project tree either side of
 * the run and reports what left. Absent any errored mutation, that counts as
 * delivery.
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
    hasLiveArtifactDelivery(input.events) ||
    hasAttributedDeletionDelivery(input)
  ) {
    return 'delivered';
  }
  if (input.persistenceFailed) return 'delivery_failed';
  // A removal that arrived alongside a failed mutation is a partial failure,
  // and it must reach the user as one. The report-only fallback below cannot
  // be trusted to do that: it asks whether the turn *looks* like it tried to
  // mutate, which a deletion the command text cannot be parsed for does not,
  // so the turn would settle on `report_only` — no failure card, no Retry —
  // while the daemon saw files leave the project and a mutation error.
  if (attributedRemovalCount(input) > 0 && hasPossibleFileMutationFailure(input.events)) {
    return 'no_result';
  }
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
