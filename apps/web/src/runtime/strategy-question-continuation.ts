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
