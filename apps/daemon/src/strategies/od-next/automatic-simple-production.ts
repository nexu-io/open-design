import type { MarkerCompletionEvidence } from './marker-settlement.js';
import type { OdNextReply } from './protocol.js';

import { prepareMarkerContinuation } from './marker-continuation.js';
import { settleMarkerTurn } from './marker-settlement.js';

import type Database from 'better-sqlite3';

import type {
  InternalPhysicalRun,
  InternalRunCreateInput,
  InternalRunCreationService,
  PreparedInternalRunResult,
} from '../../services/internal-run-service.js';

import {
  compareAndTransitionStrategyTaskExecution,
  getStrategyTaskExecutionByRunId,
  type StrategyTaskExecutionRecord,
} from '../task-store.js';

import type { StrategyTaskProjectionV2 } from '@open-design/contracts';
import type { OdNextCoordinatorResult } from './coordinator.js';
type SqliteDb = Database.Database;
const TERMINAL_OUTCOMES = new Set(['completed', 'blocked', 'canceled']);

export function projectStrategyTask(
  task: StrategyTaskExecutionRecord,
  viewedRunId?: string,
): StrategyTaskProjectionV2 {
  const viewedIndex = viewedRunId
    ? task.runs.findIndex((mapping) => mapping.runId === viewedRunId)
    : -1;
  const viewedRound = task.runs[viewedRunId ? viewedIndex : task.runs.length - 1];
  const settlementReason = viewedRound?.settlementReason;
  const deliverableValid = viewedRound?.settlementFacts?.deliverableValid
    ?? (viewedRound?.runId === task.latestRunId ? task.deliverableValid : undefined);
  const nextRunId = viewedIndex >= 0 ? task.runs[viewedIndex + 1]?.runId : undefined;
  const terminal = TERMINAL_OUTCOMES.has(task.outcome);
  const activeRunId = task.activeRunId ?? task.terminalRunId ?? task.latestRunId;
  // The source end event is also used to subscribe to the next Run. Include
  // only the relevant Run identities, using persisted indices (not positions
  // inferred by the client from stage or task analytics).
  const projectedRunIds = new Set([viewedRunId, activeRunId, !terminal ? nextRunId : undefined]);
  const runMappings = task.runs
    .filter((mapping) => projectedRunIds.has(mapping.runId))
    .map(({ runId, taskRunIndex }) => ({ runId, taskRunIndex }));
  return {
    taskExecutionId: task.taskExecutionId,
    strategy: {
      id: task.strategyId,
      version: task.strategyVersion,
      packageHash: task.strategyPackageHash,
      snapshotId: task.snapshotId,
    },
    inputStage: task.inputStage,
    ...(settlementReason ? { settlementReason } : {}),
    ...(viewedRound?.settlementFacts ? { settlementFacts: viewedRound.settlementFacts } : {}),
    ...(deliverableValid === undefined ? {} : { deliverableValid }),
    outcome: task.outcome,
    route: task.route,
    executionMode: task.executionMode,
    ...(task.executionIntent === 'plan_only' ? { executionIntent: task.executionIntent } : {}),
    activeRunId,
    runMappings,
    ...(!terminal && nextRunId ? { nextRunId } : {}),
    terminal,
    // Preserve the historical verdict; a user follow-up creates a new task.
    ...(task.outcome === 'blocked' && task.blockedContext
      ? {
          blockedContext: {
            reasonCodes: [...task.blockedContext.reasonCodes],
            visibleText: task.blockedContext.visibleText,
          },
        }
      : {}),
  };
}

export function projectStrategyTaskByRunId(
  db: SqliteDb,
  runId: string,
): StrategyTaskProjectionV2 | undefined {
  const task = getStrategyTaskExecutionByRunId(db, runId);
  return task ? projectStrategyTask(task, runId) : undefined;
}

export interface PreparedAutomaticStrategyContinuation<TRun> {
  result: OdNextCoordinatorResult;
  prepared?: PreparedInternalRunResult<TRun>;
  start: boolean;
  stage?: 'production';
}
export function prepareAutomaticStrategyContinuation<TMeta extends InternalRunCreateInput, TRun extends InternalPhysicalRun>(input: {
  db: SqliteDb;
  service: InternalRunCreationService<TMeta, TRun>;
  task: StrategyTaskExecutionRecord;
  parsed: OdNextReply;
  createMeta: (stage: 'production', instruction: string, taskRunIndex: number) => TMeta;
  completionEvidence?: MarkerCompletionEvidence;
  updatedAt?: number;
}): PreparedAutomaticStrategyContinuation<TRun> {
  return prepareMarkerContinuation(input);
}
export function completeAutomaticSimpleProduction(db: SqliteDb, input: {
  runId: string; physicalStatus: 'succeeded' | 'failed' | 'canceled'; deliverableValid: boolean; updatedAt?: number;
}): StrategyTaskExecutionRecord | null {
  const current = getStrategyTaskExecutionByRunId(db, input.runId);
  if (!current || current.latestRunId !== input.runId || current.outcome !== 'running') return current;
  return settleMarkerTurn(db, {
    taskExecutionId: current.taskExecutionId, runId: input.runId,
    parsed: { visibleText: '', productionReady: false }, completionEvidence: input,
    ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
  }).task;
}
/** Retain a stop for legacy mappings without recovery context or unsafe replay. */
export function endFailedAutomaticContinuation(db: SqliteDb, input: {
  runId: string;
  updatedAt?: number;
}): StrategyTaskExecutionRecord | null {
  const current = getStrategyTaskExecutionByRunId(db, input.runId);
  if (!current) return null;
  if (current.latestRunId !== input.runId || current.outcome !== 'running') return current;
  console.warn('[od-next-task] continuation failed', {
    taskExecutionId: current.taskExecutionId,
    runId: input.runId,
    inputStage: current.inputStage,
    reasonCodes: ['od_next_native_session_continuity_unproven'],
  });
  return compareAndTransitionStrategyTaskExecution(db, {
    taskExecutionId: current.taskExecutionId,
    expectedRevision: current.revision,
    deliverableValid: false,
    settlementReason: 'ended',
    settlementFacts: { physicalStatus: 'failed' },
    to: {
      route: current.route ?? 'full_plan',
      inputStage: current.inputStage,
      outcome: 'completed',
      executionMode: current.executionMode,
    },
    ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
  });
}
