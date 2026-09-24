import { composeColdProductionBundle } from './cold-production.js';
import type { MarkerCompletionEvidence } from './marker-settlement.js';
import type { OdNextReply } from './protocol.js';
import { composeOdNextMarkerProductionTurn } from '@open-design/contracts';
import type Database from 'better-sqlite3';
import type { InternalPhysicalRun, InternalRunCreateInput, InternalRunCreationService } from '../../services/internal-run-service.js';
import { mintRunDoneKey } from '../../runtimes/run-done-key.js';
import { compareAndTransitionStrategyTaskExecution, getStrategyTaskExecutionByRunId, type StrategyTaskExecutionRecord } from '../task-store.js';
import type { PreparedAutomaticStrategyContinuation } from './automatic-simple-production.js';
import type { OdNextCoordinatorResult } from './coordinator.js';

import { markerMayContinue, settleMarkerTurn } from './marker-settlement.js';

/** The source verdict and successor claim commit together, before either is published. */
export function prepareMarkerContinuation<TMeta extends InternalRunCreateInput, TRun extends InternalPhysicalRun>(input: {
  db: Database.Database;
  service: InternalRunCreationService<TMeta, TRun>;
  task: StrategyTaskExecutionRecord;
  parsed: OdNextReply;
  createMeta: (stage: 'production', instruction: string, taskRunIndex: number) => TMeta;
  completionEvidence?: MarkerCompletionEvidence;
  updatedAt?: number;
}): PreparedAutomaticStrategyContinuation<TRun> {
  const settle = () => settleMarkerTurn(input.db, {
    taskExecutionId: input.task.taskExecutionId, runId: input.task.latestRunId,
    parsed: input.parsed,
    ...(input.completionEvidence ? { completionEvidence: input.completionEvidence } : {}),
    ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
  });
  if (input.completionEvidence?.physicalStatus !== 'succeeded' || !markerMayContinue(input.task, input.parsed)) {
    return { result: settle(), start: false };
  }
  const instruction = composeOdNextMarkerProductionTurn({
    taskExecutionId: input.task.taskExecutionId, taskRunIndex: input.task.runs.length,
  });
  const coldStartText = composeColdProductionBundle({
    frozenBundleText: input.task.promptBundle.text, planningReply: input.parsed.visibleText, productionTurn: instruction,
  });
  const meta = input.createMeta('production', instruction, input.task.runs.length);
  meta.doneKey = mintRunDoneKey();
  let result: OdNextCoordinatorResult | undefined;
  const prepared = input.service.prepare({
    meta,
    beforeClaimCommit: nextRun => {
      const accepted = settle();
      if (accepted.action !== 'plan_ready') throw new Error('Production marker no longer eligible.');
      const task = compareAndTransitionStrategyTaskExecution(input.db, {
        taskExecutionId: accepted.task.taskExecutionId, expectedRevision: accepted.task.revision,
        to: { route: 'full_plan', inputStage: 'production', outcome: 'running', executionMode: accepted.task.executionMode },
        nextRun: { runId: nextRun.id, sourceRunId: input.task.latestRunId, finalText: instruction, coldStartText },
        ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
      });
      result = { ...accepted, task };
    },
  });
  if (prepared.kind === 'ready' && result) return { result, prepared, start: true, stage: 'production' };
  if (prepared.kind === 'reused') {
    const task = getStrategyTaskExecutionByRunId(input.db, prepared.run.id);
    const mapping = task?.runs.find(run => run.runId === prepared.run.id);
    if (task?.taskExecutionId === input.task.taskExecutionId
      && mapping?.sourceRunId === input.task.latestRunId && mapping.inputStage === 'production') {
      return { result: { action: 'plan_ready', task, visibleText: input.parsed.visibleText, reasonCodes: [] }, prepared, start: false, stage: 'production' };
    }
  }
  throw new Error('Production continuation could not claim its physical run.');
}
