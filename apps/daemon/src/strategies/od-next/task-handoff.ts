import { parseOdNextPromptBundleV1, parseOdNextPromptBundleV2 } from '@open-design/contracts';
import type Database from 'better-sqlite3';
import { listMessages } from '../../db.js';
import { getStrategyTaskExecution, getStrategyTaskExecutionByRunId, type StrategyTaskExecutionRecord } from '../task-store.js';
import { LegacyBlockFilter } from './protocol.js';

export class StrategyHandoffError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'StrategyHandoffError';
  }
}

function visible(text: string): string {
  return new LegacyBlockFilter().push(text, true);
}

/**
 * Whether a Run still owns its conversation, so a follow-up has to wait for it.
 *
 * A Run the user already asked to stop does not. Stopping answers only after the
 * agent process exits, while the Web client sends its next message (Stop, or
 * "send now" on a queued message) as soon as the stop is requested. Counting the
 * draining Run would refuse exactly the message the user stopped it for.
 */
export function holdsConversation(run: { status: string; cancelRequested?: boolean }): boolean {
  return ['queued', 'running'].includes(run.status) && run.cancelRequested !== true;
}

/**
 * Read the previous task that an implicit follow-up would continue.
 *
 * History selects context; it never decides whether the user may send. A record
 * this build cannot read is treated as absent, so the follow-up starts a new task
 * exactly as it would in a conversation without OD Next history.
 */
function readPreviousTask(
  runId: string,
  read: () => StrategyTaskExecutionRecord | null,
): StrategyTaskExecutionRecord | null {
  try {
    return read();
  } catch (error) {
    console.warn('[od-next-task] previous task unreadable; follow-up starts a new task', {
      runId,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Host records select context; the agent interprets the latest user request. */
export function resolveStrategyHandoff(db: Database.Database, input: {
  projectId?: unknown;
  conversationId?: unknown;
  taskExecutionId?: unknown;
  clientRequestId?: unknown;
  pluginId?: unknown;
  appliedPluginSnapshotId?: unknown;
}, runs: readonly { id: string; status: string; clientRequestId?: string | null; cancelRequested?: boolean }[]): StrategyTaskExecutionRecord | null {
  let task: StrategyTaskExecutionRecord | null = null;
  if (input.taskExecutionId !== undefined) {
    if (typeof input.taskExecutionId !== 'string' || !/^[A-Za-z0-9._-]+$/.test(input.taskExecutionId)) {
      throw new StrategyHandoffError(400, 'BAD_REQUEST', 'taskExecutionId must be a safe id');
    }
    task = getStrategyTaskExecution(db, input.taskExecutionId);
    if (!task) throw new StrategyHandoffError(404, 'STRATEGY_TASK_NOT_FOUND', 'strategy task not found');
    if (task.projectId !== input.projectId || task.conversationId !== input.conversationId) {
      throw new StrategyHandoffError(409, 'STRATEGY_TASK_SCOPE_MISMATCH', 'strategy task belongs to another project or conversation');
    }
  } else if (typeof input.conversationId === 'string' && typeof input.projectId === 'string') {
    // The latest assistant, not any old task in this conversation, supplies context.
    // Explicitly selecting another plugin remains a new request for that plugin.
    if (input.pluginId && input.pluginId !== 'od-next-strategy') return null;
    const retry = typeof input.clientRequestId === 'string'
      ? runs.find(run => run.clientRequestId === input.clientRequestId)
      : null;
    const retryTask = retry
      ? readPreviousTask(retry.id, () => getStrategyTaskExecutionByRunId(db, retry.id))
      : null;
    const sourceTaskId = retryTask?.continuedFromTaskExecutionId;
    if (retry && sourceTaskId) {
      return readPreviousTask(retry.id, () => getStrategyTaskExecution(db, sourceTaskId));
    }
    if (retryTask) return null;
    const latest = listMessages(db, input.conversationId)
      .filter(message => message.role === 'assistant' && (!retry || message.runId !== retry.id))
      .at(-1);
    const latestRunId = typeof latest?.runId === 'string' ? latest.runId : null;
    if (latestRunId) task = readPreviousTask(latestRunId, () => getStrategyTaskExecutionByRunId(db, latestRunId));
    if (task && task.projectId !== input.projectId) return null;
    if (input.appliedPluginSnapshotId && input.appliedPluginSnapshotId !== task?.snapshotId) return null;
  }
  if (!task) return null;
  const active = runs.find(run => holdsConversation(run)
    && !(typeof input.clientRequestId === 'string' && run.clientRequestId === input.clientRequestId));
  if (active) throw new StrategyHandoffError(409, 'RUN_IN_PROGRESS', 'a run is still active in this conversation');
  return task;
}

export function strategyHandoffTranscript(db: Database.Database, task: StrategyTaskExecutionRecord): string {
  let original: string;
  try {
    original = parseOdNextPromptBundleV2(task.promptBundle.text).userFirstPrompt;
  } catch {
    original = parseOdNextPromptBundleV1(task.promptBundle.text).userPrompt;
  }
  const history = listMessages(db, task.conversationId);
  const cutoff = history.map(message => message.role === 'assistant' ? message.runId : undefined).lastIndexOf(task.latestRunId);
  const messages = (cutoff >= 0 ? history.slice(0, cutoff + 1) : history)
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => `${message.role}: ${visible(message.content ?? '')}`);
  return [
    'Historical task context. Use current instructions, not the retired machine protocol. '
      + 'The latest user message determines whether to continue, revise, or start different work. '
      + 'Reuse an existing actionable plan when asked to continue production; do not repeat planning. '
      + 'A prior canceled, failed, or completed run is not authorization to repeat its side effects. '
      + 'Inspect existing files before resuming interrupted work.',
    `Original user request:\n${original}`,
    `Previous host state: ${task.inputStage}/${task.outcome}.`,
    ...messages,
  ].join('\n\n');
}
