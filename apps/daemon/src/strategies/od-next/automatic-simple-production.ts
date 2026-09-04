import {
  composeOdNextStrategyContinuationV2,
  type StrategyTaskProjectionV2,
} from '@open-design/contracts';
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
  strategyPlanContractHash,
  type StrategyTaskExecutionRecord,
} from '../task-store.js';
import {
  finalizeStrategyPlanningResult,
  type OdNextCoordinatorResult,
  odNextTurnMayInferDirectEditCompletion,
  odNextTurnMayInferProductionCompletion,
} from './coordinator.js';
import type { OdNextMachineProtocolStream } from './protocol.js';
import type { OdNextExecutionPreflightInput } from './resolver.js';
import {
  evaluateOdNextComplexEligibility,
  evaluateOdNextComplexProduction,
  type OdNextComplexRuntimeEvidence,
} from './complex-production.js';
import { createOdNextNativeBuildPackageBindings } from './native-build-package.js';

type SqliteDb = Database.Database;

const TERMINAL_OUTCOMES = new Set(['completed', 'blocked', 'canceled']);

export class OdNextAutomaticProductionError extends Error {
  constructor(
    message: string,
    readonly reasonCodes: string[],
  ) {
    super(message);
    this.name = 'OdNextAutomaticProductionError';
  }
}

export function projectStrategyTask(
  task: StrategyTaskExecutionRecord,
  viewedRunId?: string,
): StrategyTaskProjectionV2 {
  const viewedIndex = viewedRunId
    ? task.runs.findIndex((mapping) => mapping.runId === viewedRunId)
    : -1;
  const nextRunId = viewedIndex >= 0 ? task.runs[viewedIndex + 1]?.runId : undefined;
  const terminal = TERMINAL_OUTCOMES.has(task.outcome);
  return {
    taskExecutionId: task.taskExecutionId,
    strategy: {
      id: task.strategyId,
      version: task.strategyVersion,
      packageHash: task.strategyPackageHash,
      snapshotId: task.snapshotId,
    },
    inputStage: task.inputStage,
    outcome: task.outcome,
    route: task.route,
    executionMode: task.executionMode,
    activeRunId: task.activeRunId ?? task.terminalRunId ?? task.latestRunId,
    ...(!terminal && nextRunId ? { nextRunId } : {}),
    terminal,
    // A blocked outcome is a sticky terminal verdict: project its persisted
    // attribution so clients can terminate form interaction and explain why,
    // instead of letting the next clarification submit 409 blindly.
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

/**
 * Atomically binds a validated simple plan to its production Run. This is
 * intentionally separate from physical Run allocation; callers invoke it from
 * InternalRunCreationService.beforeClaimCommit so the Run/message claim and
 * task CAS share the same SQLite transaction.
 */
export function beginAutomaticSimpleProduction(db: SqliteDb, input: {
  task: StrategyTaskExecutionRecord;
  sourceRunId: string;
  nextRunId: string;
  finalText: string;
  updatedAt?: number;
}): StrategyTaskExecutionRecord {
  const current = input.task;
  if (
    current.route !== 'full_plan'
    || current.outcome !== 'plan_ready'
    || current.executionMode !== 'simple'
    || !current.planContract
    || !current.planContractHash
    || !['request', 'clarification', 'contract_repair'].includes(current.inputStage)
  ) {
    throw new OdNextAutomaticProductionError(
      'Only a hash-bound simple Full Plan can enter automatic production.',
      [current.executionMode === 'complex'
        ? 'od_next_complex_execution_not_implemented'
        : 'od_next_simple_production_not_ready'],
    );
  }
  if (current.latestRunId !== input.sourceRunId) {
    throw new OdNextAutomaticProductionError(
      'Production must continue from the latest physical Run.',
      ['od_next_task_run_mismatch'],
    );
  }
  return compareAndTransitionStrategyTaskExecution(db, {
    taskExecutionId: current.taskExecutionId,
    expectedRevision: current.revision,
    to: {
      route: 'full_plan',
      inputStage: 'production',
      outcome: 'running',
      executionMode: 'simple',
    },
    nextRun: {
      runId: input.nextRunId,
      sourceRunId: input.sourceRunId,
      finalText: input.finalText,
    },
    ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
  });
}

/** Claim a complex Production Run only after the exact locked capability
 * snapshot proves native continuation plus structured native Child support. */
export function beginAutomaticComplexProduction(db: SqliteDb, input: {
  task: StrategyTaskExecutionRecord;
  sourceRunId: string;
  nextRunId: string;
  finalText: string;
  capabilitySnapshot?: unknown;
  updatedAt?: number;
}): StrategyTaskExecutionRecord {
  const current = input.task;
  if (
    current.route !== 'full_plan'
    || current.outcome !== 'plan_ready'
    || current.executionMode !== 'complex'
    || !current.planContract
    || !current.planContractHash
    || !['request', 'clarification', 'contract_repair'].includes(current.inputStage)
  ) {
    throw new OdNextAutomaticProductionError(
      'Only a hash-bound complex Full Plan can enter automatic production.',
      ['od_next_complex_production_not_ready'],
    );
  }
  if (current.latestRunId !== input.sourceRunId) {
    throw new OdNextAutomaticProductionError(
      'Production must continue from the latest physical Run.',
      ['od_next_task_run_mismatch'],
    );
  }
  const eligibility = evaluateOdNextComplexEligibility({
    plan: current.planContract,
    selectedAgentId: current.selectedAgentId,
    capabilitySnapshot: input.capabilitySnapshot,
  });
  if (!eligibility.eligible) {
    throw new OdNextAutomaticProductionError(
      'Complex Production requires its exact verified native Child capability snapshot.',
      eligibility.reasonCodes,
    );
  }
  return compareAndTransitionStrategyTaskExecution(db, {
    taskExecutionId: current.taskExecutionId,
    expectedRevision: current.revision,
    to: {
      route: 'full_plan',
      inputStage: 'production',
      outcome: 'running',
      executionMode: 'complex',
    },
    nextRun: {
      runId: input.nextRunId,
      sourceRunId: input.sourceRunId,
      finalText: input.finalText,
    },
    ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
  });
}

/**
 * Allocate the next physical Run and claim the task transition inside the
 * assistant-message transaction. The returned Run is deliberately not started:
 * the caller first publishes the source Run's terminal state, then invokes the
 * shared service's start method so subscribers never observe an inverted chain.
 */
export function prepareAutomaticSimpleProductionRun<
  TMeta extends InternalRunCreateInput,
  TRun extends InternalPhysicalRun,
>(input: {
  db: SqliteDb;
  service: InternalRunCreationService<TMeta, TRun>;
  task: StrategyTaskExecutionRecord;
  createMeta: (instruction: string, taskRunIndex: number) => TMeta;
  updatedAt?: number;
}): {
  prepared: PreparedInternalRunResult<TRun>;
  task: StrategyTaskExecutionRecord;
  projection: StrategyTaskProjectionV2;
} {
  const { task } = input;
  if (!task.planContractHash) {
    throw new OdNextAutomaticProductionError(
      'Automatic production requires the immutable Plan Contract hash.',
      ['od_next_simple_production_not_ready'],
    );
  }
  const instruction = composeOdNextStrategyContinuationV2({
    stage: 'production',
    nativeSessionResume: true,
    taskExecutionId: task.taskExecutionId,
    taskRunIndex: task.runs.length,
    planContractHash: task.planContractHash,
  });
  let claimed: StrategyTaskExecutionRecord | null = null;
  const prepared = input.service.prepare({
    meta: input.createMeta(instruction, task.runs.length),
    beforeClaimCommit: (run) => {
      claimed = beginAutomaticSimpleProduction(input.db, {
        task,
        sourceRunId: task.latestRunId,
        nextRunId: run.id,
        finalText: instruction,
        ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
      });
    },
  });
  if (prepared.kind !== 'ready' || !claimed) {
    throw new OdNextAutomaticProductionError(
      `Automatic production Run could not be claimed (${prepared.kind}).`,
      ['od_next_next_run_claim_failed'],
    );
  }
  const claimedTask = claimed as StrategyTaskExecutionRecord;
  return {
    prepared,
    task: claimedTask,
    projection: projectStrategyTask(claimedTask, task.latestRunId),
  };
}

export interface PreparedAutomaticStrategyContinuation<TRun> {
  result: OdNextCoordinatorResult;
  prepared?: PreparedInternalRunResult<TRun>;
  start: boolean;
  stage?: 'contract_repair' | 'production';
}

/**
 * Accept one successful strategy Run and, when it yields a repairable contract
 * or a simple plan, claim the next physical Run in the same transaction as the
 * coordinator transition. A caller starts `prepared.run` only after publishing
 * the source Run terminal event.
 */
export function prepareAutomaticStrategyContinuation<
  TMeta extends InternalRunCreateInput,
  TRun extends InternalPhysicalRun,
>(input: {
  db: SqliteDb;
  service: InternalRunCreationService<TMeta, TRun>;
  task: StrategyTaskExecutionRecord;
  parsed: ReturnType<OdNextMachineProtocolStream['finish']>;
  createMeta: (
    stage: 'contract_repair' | 'production',
    instruction: string,
    taskRunIndex: number,
  ) => TMeta;
  toolUseCount?: number;
  executionPreflight?: OdNextExecutionPreflightInput;
  completionEvidence?: {
    physicalStatus: 'succeeded' | 'failed' | 'canceled';
    deliverableValid: boolean;
  };
  complexRuntimeEvidence?: OdNextComplexRuntimeEvidence;
  updatedAt?: number;
}): PreparedAutomaticStrategyContinuation<TRun> {
  const complexPlanningReasonCodes = (() => {
    const plan = input.parsed.planContract ?? input.parsed.repairPlanContract;
    if (
      input.parsed.issues.length > 0
      || input.parsed.runtimeState?.outcome !== 'plan_ready'
      || plan?.fullPlan.executionMode !== 'complex'
    ) return [];
    return evaluateOdNextComplexEligibility({
      plan,
      selectedAgentId: input.task.selectedAgentId,
      capabilitySnapshot: input.complexRuntimeEvidence?.capabilitySnapshot,
    }).reasonCodes;
  })();
  const complexCompletionReasonCodes = (() => {
    if (
      input.task.inputStage !== 'production'
      || input.task.executionMode !== 'complex'
      || input.parsed.runtimeState?.outcome !== 'completed'
      || !input.task.planContract
    ) return [];
    const mapping = input.task.runs.find((candidate) => (
      candidate.runId === input.task.latestRunId
    ));
    return evaluateOdNextComplexProduction({
      plan: input.task.planContract,
      selectedAgentId: input.task.selectedAgentId,
      taskExecutionId: input.task.taskExecutionId,
      runId: input.task.latestRunId,
      taskRunIndex: mapping?.taskRunIndex ?? input.task.runs.length - 1,
      ...(input.complexRuntimeEvidence
        ? { evidence: input.complexRuntimeEvidence }
        : {}),
    }).reasonCodes;
  })();
  const finalize = (repairRun?: {
    runId: string;
    sourceRunId: string;
    finalText: string;
  }) =>
    finalizeStrategyPlanningResult(input.db, {
      taskExecutionId: input.task.taskExecutionId,
      runId: input.task.latestRunId,
      parsed: input.parsed,
      ...(repairRun ? { repairRun } : {}),
      ...(input.toolUseCount === undefined ? {} : { toolUseCount: input.toolUseCount }),
      ...(input.executionPreflight ? { executionPreflight: input.executionPreflight } : {}),
      ...(input.completionEvidence ? { completionEvidence: input.completionEvidence } : {}),
      ...(
        complexPlanningReasonCodes.length > 0
        || complexCompletionReasonCodes.length > 0
          ? {
              productionEnforcementReasonCodes: [
                ...complexPlanningReasonCodes,
                ...complexCompletionReasonCodes,
              ],
            }
          : {}
      ),
      ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
    });

  const plan = input.parsed.planContract ?? input.parsed.repairPlanContract;
  const repairCandidate =
    input.parsed.issues.length > 0
    && Boolean(plan)
    && (input.task.route === null || input.task.route === 'full_plan')
    && ['request', 'clarification'].includes(input.task.inputStage)
    && input.task.planContractRepairAttempts === 0;
  const simplePlanCandidate =
    input.parsed.issues.length === 0
    && input.parsed.runtimeState?.outcome === 'plan_ready'
    && input.parsed.runtimeState.executionMode === 'simple'
    && Boolean(input.parsed.planContract);
  const complexPlanCandidate =
    input.parsed.issues.length === 0
    && input.parsed.runtimeState?.outcome === 'plan_ready'
    && input.parsed.runtimeState.executionMode === 'complex'
    && Boolean(input.parsed.planContract);

  if (!repairCandidate && !simplePlanCandidate && !complexPlanCandidate) {
    return { result: finalize(), start: false };
  }

  if (complexPlanCandidate && complexPlanningReasonCodes.length > 0) {
    return { result: finalize(), start: false };
  }

  const stage = repairCandidate ? 'contract_repair' : 'production';
  // The binding transport below is the exact Claude 2.1.233 `--agents` /
  // structured `subagent_type` contract. Other runtimes keep their existing
  // continuation text and remain fail-closed until their own native handle
  // owner is wired; never teach Codex/OpenCode a Claude tool shape.
  const nativeBuildPackageBindings = complexPlanCandidate
    && input.task.selectedAgentId === 'claude'
    ? createOdNextNativeBuildPackageBindings({
        taskExecutionId: input.task.taskExecutionId,
        taskRunIndex: input.task.runs.length,
        planContractHash: strategyPlanContractHash(input.parsed.planContract!),
        plan: input.parsed.planContract!,
      })
    : [];
  const instruction = repairCandidate
      ? composeOdNextStrategyContinuationV2({
          stage: 'contract_repair',
          nativeSessionResume: true,
          taskExecutionId: input.task.taskExecutionId,
          taskRunIndex: input.task.runs.length,
          serializationIssue: [...new Set(input.parsed.issues.map((issue) => issue.code))].join(', '),
        })
      : composeOdNextStrategyContinuationV2({
          stage: 'production',
          nativeSessionResume: true,
          taskExecutionId: input.task.taskExecutionId,
          taskRunIndex: input.task.runs.length,
          planContractHash: strategyPlanContractHash(input.parsed.planContract!),
          ...(nativeBuildPackageBindings.length > 0
            ? { nativeBuildPackageBindings }
            : {}),
        });
  let result: OdNextCoordinatorResult | null = null;
  try {
    const prepared = input.service.prepare({
      meta: input.createMeta(stage, instruction, input.task.runs.length),
      beforeClaimCommit: (nextRun) => {
        const accepted = finalize(
          repairCandidate
            ? {
                runId: nextRun.id,
                sourceRunId: input.task.latestRunId,
                finalText: instruction,
              }
            : undefined,
        );
        if (repairCandidate) {
          if (accepted.action !== 'contract_repair') {
            throw new OdNextAutomaticProductionError(
              'The parsed response was not eligible for contract repair.',
              accepted.reasonCodes,
            );
          }
          result = accepted;
          return;
        }
        if (accepted.action !== 'plan_ready') {
          throw new OdNextAutomaticProductionError(
            'The parsed response did not produce a simple Plan Contract.',
            accepted.reasonCodes,
          );
        }
        const claimed = accepted.task.executionMode === 'complex'
          ? beginAutomaticComplexProduction(input.db, {
              task: accepted.task,
              sourceRunId: input.task.latestRunId,
              nextRunId: nextRun.id,
              finalText: instruction,
              capabilitySnapshot: input.complexRuntimeEvidence?.capabilitySnapshot,
              ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
            })
          : beginAutomaticSimpleProduction(input.db, {
              task: accepted.task,
              sourceRunId: input.task.latestRunId,
              nextRunId: nextRun.id,
              finalText: instruction,
              ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
            });
        result = { ...accepted, task: claimed };
      },
    });
    if (prepared.kind === 'ready' && result) {
      return { result, prepared, start: true, stage };
    }
    if (prepared.kind === 'reused') {
      const current = getStrategyTaskExecutionByRunId(input.db, prepared.run.id);
      const expectedStage = repairCandidate ? 'contract_repair' : 'production';
      const mapping = current?.runs.find((candidate) => candidate.runId === prepared.run.id);
      if (
        current
        && current.taskExecutionId === input.task.taskExecutionId
        && current.latestRunId === prepared.run.id
        && current.inputStage === expectedStage
        && mapping?.sourceRunId === input.task.latestRunId
      ) {
        return {
          result: {
            action: repairCandidate ? 'contract_repair' : 'plan_ready',
            task: current,
            visibleText: input.parsed.visibleText,
            reasonCodes: input.parsed.issues.map((issue) => issue.code),
            ...(plan ? { decisionSummary: plan.decisionSummary } : {}),
          },
          prepared,
          start: false,
          stage,
        };
      }
    }
  } catch (error) {
    console.warn('[od-next] automatic continuation claim failed', {
      taskExecutionId: input.task.taskExecutionId,
      inputStage: input.task.inputStage,
      reasonCodes: error instanceof OdNextAutomaticProductionError
        ? error.reasonCodes
        : ['od_next_next_run_claim_failed'],
    });
    // The assistant-message claim transaction rolled back both the coordinator
    // transition and the physical Run. Re-run without a continuation mapping
    // so protocol/preflight failures converge the source task to blocked.
    return { result: finalize(), start: false };
  }

  const blocked = blockAutomaticContinuation(input.db, {
    runId: input.task.latestRunId,
    ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
  });
  if (!blocked) return { result: finalize(), start: false };
  return {
    result: {
      action: 'blocked',
      task: blocked,
      visibleText: input.parsed.visibleText,
      reasonCodes: ['od_next_next_run_claim_failed'],
    },
    start: false,
  };
}

/** Complete only the active build Run and only after the physical + delivery
 * facts are both authoritative. Planning text alone can never complete a task. */
export function completeAutomaticSimpleProduction(db: SqliteDb, input: {
  runId: string;
  physicalStatus: 'succeeded' | 'failed' | 'canceled';
  deliverableValid: boolean;
  updatedAt?: number;
}): StrategyTaskExecutionRecord | null {
  const current = getStrategyTaskExecutionByRunId(db, input.runId);
  if (!current) return null;
  if (current.latestRunId !== input.runId || current.outcome !== 'running') {
    return current;
  }
  const outcome = input.physicalStatus === 'canceled'
    ? 'canceled'
    : input.physicalStatus === 'succeeded' && input.deliverableValid
      ? 'completed'
      : 'blocked';
  // Attribute the block. Every other blocking path persists a `blockedContext`;
  // this one did not, so the most common production block — the Run finished
  // but delivered no resolvable canonical entry — reached the client with an
  // empty reason set and could only be rendered as an anonymous failure. The
  // codes mirror `validateAcceptedTurn`, which raises exactly these two for the
  // same two conditions, so one block never gets two different names.
  const blockedReasonCodes = outcome === 'blocked'
    ? [
        ...(input.physicalStatus === 'succeeded'
          ? []
          : ['od_next_physical_run_not_succeeded']),
        ...(input.deliverableValid ? [] : ['od_next_canonical_deliverable_invalid']),
      ]
    : [];
  if (blockedReasonCodes.length > 0) {
    console.warn('[od-next-task] blocked', {
      taskExecutionId: current.taskExecutionId,
      runId: input.runId,
      inputStage: current.inputStage,
      reasonCodes: blockedReasonCodes,
    });
  }
  return compareAndTransitionStrategyTaskExecution(db, {
    taskExecutionId: current.taskExecutionId,
    expectedRevision: current.revision,
    to: {
      route: current.route ?? 'full_plan',
      inputStage: current.inputStage,
      outcome,
      executionMode: current.executionMode,
    },
    ...(blockedReasonCodes.length > 0
      ? { blockedContext: { reasonCodes: blockedReasonCodes, visibleText: null } }
      : {}),
    ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
  });
}

/** Fail closed when a continuation cannot prove native-session continuity. */
export function blockAutomaticContinuation(db: SqliteDb, input: {
  runId: string;
  updatedAt?: number;
}): StrategyTaskExecutionRecord | null {
  const current = getStrategyTaskExecutionByRunId(db, input.runId);
  if (!current) return null;
  if (current.latestRunId !== input.runId || current.outcome !== 'running') return current;
  console.warn('[od-next-task] blocked', {
    taskExecutionId: current.taskExecutionId,
    runId: input.runId,
    inputStage: current.inputStage,
    reasonCodes: ['od_next_native_session_continuity_unproven'],
  });
  return compareAndTransitionStrategyTaskExecution(db, {
    taskExecutionId: current.taskExecutionId,
    expectedRevision: current.revision,
    to: {
      route: current.route ?? 'full_plan',
      inputStage: current.inputStage,
      outcome: 'blocked',
      executionMode: current.executionMode,
    },
    blockedContext: {
      reasonCodes: ['od_next_native_session_continuity_unproven'],
      visibleText: null,
    },
    ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
  });
}

export { odNextTurnMayInferDirectEditCompletion, odNextTurnMayInferProductionCompletion };
