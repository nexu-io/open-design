import { strategyTaskProvesDelivery } from '@open-design/contracts';
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
 * Message fields persisting a terminal strategy-task verdict.
 *
 * A marker-based task may complete without a usable deliverable, so only stamp
 * delivery when the host's file check explicitly succeeded. Missing historical
 * evidence does not imply delivery.
 *
 * Every surface observing a task projection (run-status probe, SSE settle,
 * reattach) derives its message stamp here, so the three cannot drift. Returns
 * null unless the projection is a terminal `completed` task with a verified
 * deliverable — callers then leave the message untouched.
 */
export function strategySettledMessageFields(
  strategyTask: StrategyTaskProjectionV2 | undefined,
): { strategyTaskDelivered: true } | null {
  if (strategyTaskProvesDelivery(strategyTask)) {
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
