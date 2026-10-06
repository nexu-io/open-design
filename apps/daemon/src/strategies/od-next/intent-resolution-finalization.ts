import type Database from 'better-sqlite3';

import { consumeStrategyExecutionIntentResolution, getStrategyTaskExecution, type StrategyTaskExecutionRecord } from '../task-store.js';
import { finalizeStrategyPlanningResult } from './coordinator.js';
import type { validateStrategyIntentResolutionReply } from './intent-resolution.js';

type ResolvedIntent = ReturnType<typeof validateStrategyIntentResolutionReply>;

/** Reply capture precedes this transaction; the consume and business verdict are atomic. */
export function consumeIntentResolutionWithVerdict<T>(
  db: Database.Database,
  taskExecutionId: string,
  resolution: ResolvedIntent,
  verdict: (consumed: StrategyTaskExecutionRecord) => T,
  updatedAt?: number,
): T {
  return db.transaction(() => {
    const current = getStrategyTaskExecution(db, taskExecutionId);
    if (!current) throw new TypeError('Agent output must belong to the latest physical Run.');
    const consumed = consumeStrategyExecutionIntentResolution(db, {
      taskExecutionId, expectedRevision: current.revision, runId: current.latestRunId,
      executionIntent: resolution.executionIntent,
      ...(updatedAt === undefined ? {} : { updatedAt }),
    });
    return verdict(consumed);
  }).immediate();
}

/** Shared live/startup completion. It has no physical-run creation or provider dependency. */
export function completePlanningIntentResolution(
  db: Database.Database,
  taskExecutionId: string,
  resolution: ResolvedIntent,
  updatedAt?: number,
) {
  if (resolution.executionIntent !== 'plan_only') {
    throw new TypeError('The parsed response was not eligible for contract repair.');
  }
  return consumeIntentResolutionWithVerdict(db, taskExecutionId, resolution, consumed => (
    finalizeStrategyPlanningResult(db, {
      taskExecutionId, runId: consumed.latestRunId,
      parsed: resolution.parsed, resultSourceRunId: resolution.source.runId,
      toolUseCount: resolution.source.toolUseCount,
      ...(resolution.source.completionEvidence ? { completionEvidence: resolution.source.completionEvidence } : {}),
      ...(updatedAt === undefined ? {} : { updatedAt }),
    })
  ), updatedAt);
}
