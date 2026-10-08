import type Database from 'better-sqlite3';
import { RESTART_ERROR_CODE, type RestartRecoverableDurableRunState } from '../../runtimes/run-restart-recovery.js';

import { InvalidFrozenSkillPackageError } from './frozen-skill-package.js';
import { InvalidStrategyTaskRecordError, getStrategyTaskExecutionByRunId } from '../task-store.js';
import { projectStrategyTask } from './automatic-simple-production.js';
import { completePlanningIntentResolution } from './intent-resolution-finalization.js';
import { validateStrategyIntentResolutionReply, validateConsumedStrategyIntentResolutionReply, type IntentResolutionResult } from './intent-resolution.js';

export interface IntentRecoveryRunState extends Pick<RestartRecoverableDurableRunState, 'errorCode' | 'terminalRecoveryReason'> {
  id: string;
  status: string;
  projectId: string | null;
  conversationId: string | null;
  agentId: string | null;
  cancelOrigin?: string | null;
  odNextTaskInputSnapshot?: unknown;
}

/** Only daemon-persisted ownership participates; no mutable launch defaults are reconstructed. */
function hasFrozenOwner(
  run: IntentRecoveryRunState,
  task: NonNullable<ReturnType<typeof getStrategyTaskExecutionByRunId>>,
): boolean {
  const owner = run.odNextTaskInputSnapshot;
  return run.projectId === task.projectId && run.conversationId === task.conversationId
    && run.agentId === task.selectedAgentId && typeof owner === 'object' && owner !== null
    && 'taskExecutionId' in owner && owner.taskExecutionId === task.taskExecutionId
    && 'manifestSha256' in owner && owner.manifestSha256 === task.frozenInputIdentity.taskInputManifestSha256;
}

/** Synchronous local replay only. Never hydrate a run, create a successor, or contact a provider. */
export function recoverPlanningIntentResolution(
  db: Database.Database,
  run: IntentRecoveryRunState,
  states: ReadonlyMap<string, IntentRecoveryRunState>,
  now: number,
) {
  const derivedRestartFailure = run.status === 'failed' && run.errorCode === RESTART_ERROR_CODE
    && run.terminalRecoveryReason === 'daemon_restart';
  if ((['succeeded', 'failed', 'canceled'].includes(run.status) && !derivedRestartFailure) || run.cancelOrigin) return null;
  let task;
  try { task = getStrategyTaskExecutionByRunId(db, run.id); }
  catch (error) {
    if (error instanceof InvalidStrategyTaskRecordError || error instanceof InvalidFrozenSkillPackageError) return null;
    throw error;
  }
  const saved = task?.intentResolution;
  if (!task || !saved?.replyJson || !saved.sourceRunId || saved.runId !== run.id
    || task.outcome === 'canceled' || !hasFrozenOwner(run, task)) return null;
  const source = states.get(saved.sourceRunId);
  if (!source || source.status !== 'succeeded' || !hasFrozenOwner(source, task)) return null;
  if (saved.state !== 'started' && saved.state !== 'resolved') return null;
  // A read between a failed physical write and the next boot can checkpoint a
  // restart failure. Only an already consumed SQL verdict may correct that
  // derived state; ordinary failure/cancellation and unconsumed replies stay terminal.
  if (derivedRestartFailure && saved.state !== 'resolved') return null;
  let resolution;
  try {
    const reply = JSON.parse(saved.replyJson) as IntentResolutionResult;
    resolution = saved.state === 'resolved'
      ? validateConsumedStrategyIntentResolutionReply(task, reply)
      : validateStrategyIntentResolutionReply(task, reply);
  } catch { return null; }
  // Durable state deliberately does not contain all launch context (or credentials).
  // Production therefore follows existing interrupted recovery, without guessed preflight.
  if (saved.state !== 'resolved' && resolution.executionIntent !== 'plan_only') return null;
  let terminal = task;
  if (saved.state === 'started') {
    if (task.latestRunId !== run.id || task.outcome !== 'running') return null;
    terminal = completePlanningIntentResolution(db, task.taskExecutionId, resolution, now).task;
  }
  if (saved.state !== 'resolved' && !['completed', 'blocked'].includes(terminal.outcome)) return null;
  return {
    status: 'succeeded' as const, updatedAt: now, terminalAt: now,
    exitCode: 0, signal: null, error: null, errorCode: null,
    strategyTask: projectStrategyTask(terminal, run.id),
  };
}
