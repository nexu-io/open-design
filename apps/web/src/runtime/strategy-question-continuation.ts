import type {
  ChatRunStatusResponse,
  StrategyTaskProjectionV2,
} from '@open-design/contracts';

type FetchRunStatus = (runId: string) => Promise<ChatRunStatusResponse | null>;

/**
 * Recover the daemon-issued strategy task handle when the question form and
 * the run-created React projection become visible in the same render. Status
 * lookup is best-effort: an ordinary form, a missing Run, or a transport
 * failure must still submit as an ordinary next user turn.
 */
export async function resolveQuestionFormStrategyTaskExecutionId(input: {
  persistedTaskExecutionId?: string;
  sourceRunId?: string;
  fetchRunStatus: FetchRunStatus;
}): Promise<string | undefined> {
  if (input.persistedTaskExecutionId) return input.persistedTaskExecutionId;
  if (!input.sourceRunId) return undefined;

  try {
    const status = await input.fetchRunStatus(input.sourceRunId);
    return status?.strategyTask?.taskExecutionId;
  } catch {
    return undefined;
  }
}

/**
 * Message fields persisting a terminal `blocked` strategy-task verdict.
 *
 * A blocked outcome is sticky: the daemon rejects every further continuation
 * of the task with 409 STRATEGY_TASK_STATE_MISMATCH, so the turn's question
 * form must stop accepting submissions. Every surface that observes a task
 * projection (run-status probe, SSE end, reattach) derives the same message
 * stamp through this helper: the blocked flag plus the gate's agent-visible
 * text (trimmed; null when the gate left none, so the UI falls back to its
 * generic localized notice).
 *
 * Returns null for anything that is not a blocked terminal projection —
 * callers then leave the message untouched.
 */
export function strategyBlockedMessageFields(
  strategyTask: StrategyTaskProjectionV2 | undefined,
): { strategyTaskBlocked: true; strategyTaskBlockedText: string | null } | null {
  if (!strategyTask?.terminal || strategyTask.outcome !== 'blocked') return null;
  const visibleText = strategyTask.blockedContext?.visibleText?.trim();
  return {
    strategyTaskBlocked: true,
    strategyTaskBlockedText: visibleText ? visibleText : null,
  };
}

/**
 * Message fields persisting ANY terminal strategy-task verdict.
 *
 * `blocked` terminates the turn's question form (above). `completed` is the
 * other verdict a surface has to remember: the daemon reached it by verifying
 * the canonical deliverable on disk, which outranks a TodoWrite snapshot the
 * agent left with stale pending items. Without the stamp the chat keeps
 * offering to "continue remaining tasks" on finished work, and accepting opens
 * a second task that can only block.
 *
 * Every surface observing a task projection (run-status probe, SSE settle,
 * reattach) derives its message stamp here, so the three cannot drift. Returns
 * null for a non-terminal projection — callers then leave the message untouched.
 */
export function strategySettledMessageFields(
  strategyTask: StrategyTaskProjectionV2 | undefined,
):
  | { strategyTaskBlocked: true; strategyTaskBlockedText: string | null }
  | { strategyTaskDelivered: true }
  | null {
  const blocked = strategyBlockedMessageFields(strategyTask);
  if (blocked) return blocked;
  if (strategyTask?.terminal && strategyTask.outcome === 'completed') {
    return { strategyTaskDelivered: true };
  }
  return null;
}

/**
 * True when a Run status probe proves the Run left its logical task parked on
 * the user: the Run itself succeeded, and the task is neither terminal nor
 * running on this Run (`clarification_required`, `plan_ready`).
 *
 * Such a Run has nothing left for a reattach to follow. The daemon task store
 * keeps an active Run only while the outcome is `running`, and it claims any
 * automatic successor in the same transaction as the Run's verdict — a probe
 * would then project that successor as a different `activeRunId`. The wire
 * projection names this same Run only because it falls back to the latest Run
 * when none is active. A row that already holds this Run's transcript gains
 * nothing from a replay from event 0; the replay only re-streams text that a
 * concurrent conversation refresh can double up (OPEND-3230).
 */
export function strategyTaskParkedOnSucceededRun(
  status: Pick<ChatRunStatusResponse, 'status' | 'strategyTask'>,
  runId: string,
): boolean {
  const task = status.strategyTask;
  return status.status === 'succeeded'
    && task !== undefined
    && !task.terminal
    && task.outcome !== 'running'
    && task.activeRunId === runId;
}
