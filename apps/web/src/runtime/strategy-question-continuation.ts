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
 * A task blocks when its physical Run failed before the round settled. The
 * stamp records that task-level fact next to the Run's own failure; it gates
 * nothing — the turn's question form stays answerable, and the answer opens
 * a new task like any follow-up. Every surface that observes a task
 * projection (run-status probe, SSE end, reattach) derives the same stamp
 * through this helper: the blocked flag plus the agent-visible text the
 * daemon persisted with the verdict (trimmed; null when there was none).
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
 * `blocked` records a Run that failed before settling (above). The other
 * stamp a surface has to remember is `strategyTaskDelivered`: a round of the task
 * wrote a deliverable, which the daemon watched happen and reports as
 * `deliverableWritten`. That fact outranks a TodoWrite snapshot the agent left
 * with stale pending items: without the stamp the chat keeps offering to
 * "continue remaining tasks" on finished work.
 *
 * A task also settles `completed` when it asked a question, declared the
 * request non-design or plan-only, or ran out of automatic rounds without
 * writing anything. None of those delivered, so none of them is stamped and
 * the "continue remaining tasks" offer stays available where the transcript
 * calls for it.
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
  if (
    strategyTask?.terminal
    && strategyTask.outcome === 'completed'
    && strategyTask.deliverableWritten === true
  ) {
    return { strategyTaskDelivered: true };
  }
  return null;
}

/** Resolve a physical Run's task position only from the daemon's matching map.
 * The same projection can accompany a predecessor end and its successor start.
 * Old/mismatched projections must not acquire a guessed continuation index.
 */
export function strategyTaskRunIndex(
  strategyTask: StrategyTaskProjectionV2 | undefined,
  runId: string,
): number | undefined {
  const matches = strategyTask?.runMappings?.filter((mapping) => mapping.runId === runId);
  if (matches?.length !== 1) return undefined;
  const index = matches[0]?.taskRunIndex;
  return typeof index === 'number' && Number.isSafeInteger(index) && index >= 0 ? index : undefined;
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
