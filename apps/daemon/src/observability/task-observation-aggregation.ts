import { createHash } from 'node:crypto';

import {
  NORMALIZED_AGENT_OBSERVATION_V1_SCHEMA,
  SAFE_RUN_QUALITY_V1_SCHEMA,
  NormalizedAgentObservationV1Schema,
  normalizeAgentObservationV1,
  type NormalizedAgentObservationKindV1,
  type NormalizedAgentObservationStatusV1,
  type NormalizedAgentObservationV1,
  type ObservationUsageValuesV1,
  type OdNextRolloutDecision,
  type PromptBoundaryEvidenceV1,
  type StrategyInputStageV2,
} from '@open-design/contracts';
import type Database from 'better-sqlite3';

import type { TelemetryPrefs } from '../app-config.js';
import { getSnapshot } from '../plugins/snapshots.js';
import {
  getStrategyTaskExecution,
  type StrategyTaskExecutionRecord,
  type StrategyTaskOutcome,
} from '../strategies/task-store.js';
import {
  deriveRunTelemetryExportExpectation,
  type RunTelemetryExportExpectation,
} from './run-exporter.js';

const STAGE_ORDER: readonly StrategyInputStageV2[] = [
  'request',
  'clarification',
  'contract_repair',
  'production',
];
const KIND_ORDER: Readonly<Record<NormalizedAgentObservationKindV1, number>> = {
  task_run: 0,
  child_agent: 1,
  model_call: 2,
  tool: 3,
};
const TERMINAL_OBSERVATION_STATUSES = new Set<NormalizedAgentObservationStatusV1>([
  'completed',
  'failed',
  'canceled',
]);

export interface TaskObservationCoverageV1 {
  runs: {
    availability: 'complete' | 'partial';
    expected: number;
    observed: number;
    missingRunIds: string[];
  };
  children: {
    availability: 'complete' | 'partial' | 'unavailable';
    knownObservationCount: number;
    expectedRunCount: number;
    completeRunCount: number;
    partialRunCount: number;
    unavailableRunCount: number;
    explicitZeroRunCount: number;
  };
  prompt: ObservationAvailabilityCountsV1;
  usage: ObservationAvailabilityCountsV1;
  timing: ObservationAvailabilityCountsV1;
}

export interface ObservationAvailabilityCountsV1 {
  complete: number;
  partial: number;
  unavailable: number;
}

export interface KnownUsageSummaryV1 extends ObservationAvailabilityCountsV1 {
  observedObservationCount: number;
  values?: Partial<ObservationUsageValuesV1>;
}

export interface TaskObservationStageTotalV1 {
  stage: StrategyInputStageV2;
  runCount: number;
  runStatuses: NormalizedAgentObservationStatusV1[];
  knownMainRunUsage: KnownUsageSummaryV1;
  knownChildUsage: KnownUsageSummaryV1;
}

export interface StrategyTaskObservationRootV1 {
  observationId: string;
  taskExecutionId: string;
  projectId: string;
  conversationId: string;
  status: StrategyTaskOutcome;
  route: StrategyTaskExecutionRecord['route'];
  executionMode: StrategyTaskExecutionRecord['executionMode'];
  taskType: string | null;
  strategyId: StrategyTaskExecutionRecord['strategyId'];
  strategyVersion: string;
  strategyPackageHash: string;
  snapshotId: string;
  planContractHash: string | null;
  selectedAgentId: string;
  agentCliVersions: string[];
  runtimeCompanionVersions: string[];
  runtimeAdapterVersions: string[];
  rolloutAdmission?: {
    requestedMode: OdNextRolloutDecision['requestedMode'];
    effectiveMode: OdNextRolloutDecision['effectiveMode'];
    primaryReasonCode: string;
    compatibilityBasis: 'local_synthetic_canary' | 'runtime_adapter_family_fixture_evidence';
    admissionStage: 'activation_admission';
  };
  createdAt: number;
  updatedAt: number;
}

const SAFE_RUNTIME_VERSION_ATTRIBUTE_KEYS = [
  'agentCliVersion',
  'runtimeCompanionVersion',
  'runtimeAdapterVersion',
] as const;

function safeRuntimeVersion(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 128 && !/[\u0000-\u001f\u007f]/u.test(trimmed)
    ? trimmed
    : undefined;
}

export function safeTaskObservationRuntimeVersions(
  observation: NormalizedAgentObservationV1,
): Partial<Record<typeof SAFE_RUNTIME_VERSION_ATTRIBUTE_KEYS[number], string>> {
  return Object.fromEntries(SAFE_RUNTIME_VERSION_ATTRIBUTE_KEYS.flatMap((key) => {
    const value = safeRuntimeVersion(observation.attributes?.[key]);
    return value ? [[key, value] as const] : [];
  }));
}

function distinctRuntimeVersions(
  observations: readonly NormalizedAgentObservationV1[],
  key: typeof SAFE_RUNTIME_VERSION_ATTRIBUTE_KEYS[number],
): string[] {
  return [...new Set(observations.flatMap((observation) => {
    const value = safeRuntimeVersion(observation.attributes?.[key]);
    return value ? [value] : [];
  }))].sort(compareCodeUnits);
}

export interface StrategyTaskObservationAggregateV1 {
  schema: 'open-design.strategy-task-observation/v1';
  root: StrategyTaskObservationRootV1;
  observations: NormalizedAgentObservationV1[];
  coverage: TaskObservationCoverageV1;
  stageTotals: TaskObservationStageTotalV1[];
  limitations: string[];
}

export const TASK_OBSERVATION_SCHEMA_CAPABILITY_V1 = {
  schema: 'open-design.task-observation-schema-capability/v1',
  aggregateSchema: 'open-design.strategy-task-observation/v1',
  normalizedObservationSchema: NORMALIZED_AGENT_OBSERVATION_V1_SCHEMA,
  safeRunQualitySchema: SAFE_RUN_QUALITY_V1_SCHEMA,
  safeQualityFields: [
    'assistant_output',
    'error',
    'tool_io',
    'manifests',
    'usage',
    'timing',
  ],
} as const;

export interface LegacyTaskObservationExportPlan {
  expectation: RunTelemetryExportExpectation;
  batch: unknown[];
}

export interface TaskObservationExportContextV1 {
  environment: string;
  tag: string;
  installationId?: string | null;
  appVersion?: string;
  appChannel?: string;
  packaged?: boolean;
  clientType?: 'desktop' | 'web' | 'unknown';
}

export function canonicalTaskObservationTraceTags(
  aggregate: StrategyTaskObservationAggregateV1,
  context?: TaskObservationExportContextV1,
): string[] {
  return [
    'od-next-strategy-v2',
    `route:${aggregate.root.route}`,
    `execution-mode:${aggregate.root.executionMode}`,
    ...(context
      ? [`environment:${context.environment}`, `rollout:${context.tag}`]
      : []),
  ];
}

export class InvalidTaskObservationAggregateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTaskObservationAggregateError';
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function strategyTaskRootObservationId(taskExecutionId: string): string {
  return `strategy-task:${taskExecutionId}`;
}

export function strategyTaskRunObservationId(
  taskExecutionId: string,
  runId: string,
): string {
  return `task-run:${taskExecutionId}:${runId}`;
}

function stableLegacyEventId(type: string, bodyId: string): string {
  return `od-${createHash('sha256')
    .update(`open-design/task-observation-legacy/v1\n${type}\n${bodyId}`, 'utf8')
    .digest('hex')}`;
}

function ensureTaskMapping(task: StrategyTaskExecutionRecord): void {
  for (const [index, mapping] of task.runs.entries()) {
    if (mapping.taskRunIndex !== index) {
      throw new InvalidTaskObservationAggregateError(
        `Task Run mapping ${mapping.runId} has non-contiguous taskRunIndex.`,
      );
    }
  }
}

function sameIdentity(
  left: NormalizedAgentObservationV1,
  right: NormalizedAgentObservationV1,
): boolean {
  return left.kind === right.kind &&
    left.stage === right.stage &&
    left.identity.taskExecutionId === right.identity.taskExecutionId &&
    left.identity.runId === right.identity.runId &&
    left.identity.taskRunIndex === right.identity.taskRunIndex &&
    left.identity.parentObservationId === right.identity.parentObservationId &&
    left.identity.runtimeSessionId === right.identity.runtimeSessionId;
}

function mergeObservationLifecycle(
  facts: readonly NormalizedAgentObservationV1[],
): NormalizedAgentObservationV1[] {
  const byId = new Map<string, NormalizedAgentObservationV1>();
  for (const fact of facts) {
    const current = byId.get(fact.identity.observationId);
    if (!current) {
      byId.set(fact.identity.observationId, fact);
      continue;
    }
    if (!sameIdentity(current, fact)) {
      throw new InvalidTaskObservationAggregateError(
        `Observation ${fact.identity.observationId} changed immutable identity.`,
      );
    }
    if (
      TERMINAL_OBSERVATION_STATUSES.has(current.status) &&
      current.status !== fact.status
    ) {
      throw new InvalidTaskObservationAggregateError(
        `Observation ${fact.identity.observationId} changed terminal status.`,
      );
    }
    byId.set(fact.identity.observationId, fact);
  }
  return [...byId.values()];
}

function validateFactAgainstTask(
  task: StrategyTaskExecutionRecord,
  fact: NormalizedAgentObservationV1,
): void {
  const mapping = task.runs.find((run) => run.runId === fact.identity.runId);
  if (!mapping) {
    throw new InvalidTaskObservationAggregateError(
      `Observation ${fact.identity.observationId} references an unmapped Run.`,
    );
  }
  if (
    fact.identity.taskExecutionId !== task.taskExecutionId ||
    fact.identity.taskRunIndex !== mapping.taskRunIndex ||
    fact.stage !== mapping.inputStage
  ) {
    throw new InvalidTaskObservationAggregateError(
      `Observation ${fact.identity.observationId} conflicts with the durable task mapping.`,
    );
  }
  if (
    fact.kind === 'task_run' &&
    fact.identity.observationId !== strategyTaskRunObservationId(
      task.taskExecutionId,
      mapping.runId,
    )
  ) {
    throw new InvalidTaskObservationAggregateError(
      `Run ${mapping.runId} does not use its stable task observation identity.`,
    );
  }
}

function validateParentGraph(
  task: StrategyTaskExecutionRecord,
  facts: readonly NormalizedAgentObservationV1[],
): void {
  const byId = new Map(facts.map((fact) => [fact.identity.observationId, fact]));
  const turnOwners = new Map<string, string>();
  for (const fact of facts) {
    const accounting = fact.turnAccounting;
    if (!accounting) continue;
    const turnKey = `${fact.identity.runId}\n${accounting.turnId}`;
    if (accounting.disposition === 'owner') {
      const existing = turnOwners.get(turnKey);
      if (existing && existing !== fact.identity.observationId) {
        throw new InvalidTaskObservationAggregateError(
          `Turn ${accounting.turnId} has multiple accounting owners in one Run.`,
        );
      }
      turnOwners.set(turnKey, fact.identity.observationId);
    }
  }
  for (const fact of facts) {
    const accounting = fact.turnAccounting;
    if (accounting?.disposition !== 'exclude_inherited') continue;
    const owner = byId.get(accounting.ownerObservationId);
    if (
      !owner ||
      owner.identity.runId !== fact.identity.runId ||
      owner.turnAccounting?.disposition !== 'owner' ||
      owner.turnAccounting.turnId !== accounting.turnId
    ) {
      throw new InvalidTaskObservationAggregateError(
        `Inherited Turn ${accounting.turnId} does not resolve to its declared owner.`,
      );
    }
  }
  for (const fact of facts) {
    if (fact.kind === 'task_run') continue;
    const seen = new Set([fact.identity.observationId]);
    let cursor: NormalizedAgentObservationV1 | undefined = fact;
    while (cursor && cursor.kind !== 'task_run') {
      const parentObservationId = cursor.identity.parentObservationId;
      if (!parentObservationId) break;
      const parent = byId.get(parentObservationId);
      if (!parent) {
        throw new InvalidTaskObservationAggregateError(
          `Observation ${fact.identity.observationId} has an unavailable parent.`,
        );
      }
      if (
        parent.identity.runId !== fact.identity.runId ||
        parent.identity.taskRunIndex !== fact.identity.taskRunIndex
      ) {
        throw new InvalidTaskObservationAggregateError(
          `Observation ${fact.identity.observationId} crosses a physical Run boundary.`,
        );
      }
      if (seen.has(parent.identity.observationId)) {
        throw new InvalidTaskObservationAggregateError(
          `Observation ${fact.identity.observationId} forms a parent cycle.`,
        );
      }
      seen.add(parent.identity.observationId);
      cursor = parent;
    }
    if (cursor?.kind !== 'task_run') {
      throw new InvalidTaskObservationAggregateError(
        `Observation ${fact.identity.observationId} does not resolve to its task Run root.`,
      );
    }
  }

  const taskRunIds = new Set(
    task.runs.map((run) => strategyTaskRunObservationId(task.taskExecutionId, run.runId)),
  );
  for (const fact of facts) {
    if (fact.kind === 'task_run' && !taskRunIds.has(fact.identity.observationId)) {
      throw new InvalidTaskObservationAggregateError('Unexpected task Run observation.');
    }
  }
}

function missingRunObservation(
  task: StrategyTaskExecutionRecord,
  mapping: StrategyTaskExecutionRecord['runs'][number],
): NormalizedAgentObservationV1 {
  return normalizeAgentObservationV1({
    identity: {
      observationId: strategyTaskRunObservationId(task.taskExecutionId, mapping.runId),
      taskExecutionId: task.taskExecutionId,
      runId: mapping.runId,
      taskRunIndex: mapping.taskRunIndex,
      parentObservationId: strategyTaskRootObservationId(task.taskExecutionId),
    },
    kind: 'task_run',
    stage: mapping.inputStage,
    status: 'unknown',
    limitations: ['run_observation_not_observed'],
  });
}

function observationDepth(
  fact: NormalizedAgentObservationV1,
  byId: ReadonlyMap<string, NormalizedAgentObservationV1>,
): number {
  let depth = 0;
  let cursor: NormalizedAgentObservationV1 | undefined = fact;
  const seen = new Set<string>();
  while (cursor?.identity.parentObservationId) {
    if (seen.has(cursor.identity.observationId)) return Number.MAX_SAFE_INTEGER;
    seen.add(cursor.identity.observationId);
    cursor = byId.get(cursor.identity.parentObservationId);
    depth += 1;
  }
  return depth;
}

function sortObservations(
  observations: readonly NormalizedAgentObservationV1[],
): NormalizedAgentObservationV1[] {
  const byId = new Map(observations.map((fact) => [fact.identity.observationId, fact]));
  return [...observations].sort((left, right) => (
    left.identity.taskRunIndex - right.identity.taskRunIndex ||
    observationDepth(left, byId) - observationDepth(right, byId) ||
    KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
    compareCodeUnits(left.identity.observationId, right.identity.observationId)
  ));
}

function availabilityCounts(
  observations: readonly NormalizedAgentObservationV1[],
  selector: (observation: NormalizedAgentObservationV1) => 'complete' | 'partial' | 'unavailable',
): ObservationAvailabilityCountsV1 {
  const counts: ObservationAvailabilityCountsV1 = {
    complete: 0,
    partial: 0,
    unavailable: 0,
  };
  for (const observation of observations) counts[selector(observation)] += 1;
  return counts;
}

function promptBoundaryForObservation(
  observation: NormalizedAgentObservationV1,
): PromptBoundaryEvidenceV1 | undefined {
  switch (observation.kind) {
    case 'task_run':
      return observation.prompt.hostComposed;
    case 'child_agent':
      return observation.prompt.childInjected;
    case 'model_call':
      return observation.prompt.agentEffectiveContext;
    case 'tool':
      return undefined;
  }
}

function promptCoverageAvailability(
  evidence: PromptBoundaryEvidenceV1,
): 'complete' | 'partial' | 'unavailable' {
  return evidence.availability === 'exact'
    ? 'complete'
    : evidence.availability === 'partial'
      ? 'partial'
      : 'unavailable';
}

function usageSummary(
  observations: readonly NormalizedAgentObservationV1[],
): KnownUsageSummaryV1 {
  const included = observations.filter(
    (observation) => observation.turnAccounting?.disposition !== 'exclude_inherited',
  );
  const counts = availabilityCounts(included, (observation) => observation.usage.availability);
  const values: Record<string, number> = {};
  let observedObservationCount = 0;
  for (const observation of included) {
    if (!observation.usage.values) continue;
    observedObservationCount += 1;
    for (const [key, value] of Object.entries(observation.usage.values)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      values[key] = (values[key] ?? 0) + value;
    }
  }
  return {
    ...counts,
    observedObservationCount,
    ...(Object.keys(values).length > 0
      ? { values: values as Partial<ObservationUsageValuesV1> }
      : {}),
  };
}

function childCoverage(
  taskRuns: readonly NormalizedAgentObservationV1[],
  children: readonly NormalizedAgentObservationV1[],
): TaskObservationCoverageV1['children'] {
  const coverages = taskRuns.map((run) => run.childEvidenceCoverage ?? {
    availability: 'unavailable' as const,
    source: 'runtime',
    knownChildCount: 0,
    explicitZero: false,
    limitations: ['child_evidence_collection_summary_unavailable'],
    diagnosticCounts: [],
  });
  const completeRunCount = coverages.filter((coverage) => coverage.availability === 'complete').length;
  const partialRunCount = coverages.filter((coverage) => coverage.availability === 'partial').length;
  const unavailableRunCount = coverages.filter(
    (coverage) => coverage.availability === 'unavailable',
  ).length;
  const declaredChildCount = coverages.reduce(
    (total, coverage) => total + coverage.knownChildCount,
    0,
  );
  return {
    availability: unavailableRunCount > 0
      ? 'unavailable'
      : partialRunCount > 0 || declaredChildCount !== children.length || children.some(
        (child) => !TERMINAL_OBSERVATION_STATUSES.has(child.status),
      )
        ? 'partial'
        : 'complete',
    knownObservationCount: children.length,
    expectedRunCount: taskRuns.length,
    completeRunCount,
    partialRunCount,
    unavailableRunCount,
    explicitZeroRunCount: coverages.filter((coverage) => coverage.explicitZero).length,
  };
}

function aggregateLimitations(args: {
  missingRunIds: readonly string[];
  children: TaskObservationCoverageV1['children'];
  observations: readonly NormalizedAgentObservationV1[];
  taskType: string | null;
}): string[] {
  return [...new Set([
    ...(args.missingRunIds.length > 0 ? ['physical_run_observation_partial'] : []),
    ...(args.children.availability === 'unavailable'
      ? ['child_lifecycle_unavailable_not_zero']
      : args.children.availability === 'partial'
        ? ['child_lifecycle_partial']
        : []),
    ...(args.taskType === null ? ['task_type_unavailable'] : []),
    ...(args.observations.some(
      (observation) => observation.turnAccounting?.disposition === 'exclude_inherited',
    ) ? ['inherited_turn_copies_excluded_from_usage'] : []),
    ...(args.observations.flatMap((observation) => observation.limitations)),
    ...(args.observations.flatMap(
      (observation) => observation.childEvidenceCoverage?.limitations ?? [],
    )),
    ...(args.observations.flatMap(
      (observation) => observation.childEvidenceCoverage?.diagnosticCounts
        .map((diagnostic) => diagnostic.code) ?? [],
    )),
  ])].sort(compareCodeUnits);
}

export function aggregateStrategyTaskObservations(input: {
  task: StrategyTaskExecutionRecord;
  observations: readonly unknown[];
  taskType?: string;
  strategyRolloutDecision?: OdNextRolloutDecision | null;
}): StrategyTaskObservationAggregateV1 {
  ensureTaskMapping(input.task);
  const parsed = input.observations.map((observation) => (
    NormalizedAgentObservationV1Schema.parse(observation)
  ));
  const merged = mergeObservationLifecycle(parsed);
  for (const fact of merged) validateFactAgainstTask(input.task, fact);

  const rootObservationId = strategyTaskRootObservationId(input.task.taskExecutionId);
  const taskRunByRunId = new Map(
    merged
      .filter((fact) => fact.kind === 'task_run')
      .map((fact) => [fact.identity.runId, fact]),
  );
  const missingRunIds: string[] = [];
  const taskRuns = input.task.runs.map((mapping) => {
    const observed = taskRunByRunId.get(mapping.runId);
    if (!observed) {
      missingRunIds.push(mapping.runId);
      return missingRunObservation(input.task, mapping);
    }
    return NormalizedAgentObservationV1Schema.parse({
      ...observed,
      identity: {
        ...observed.identity,
        parentObservationId: rootObservationId,
      },
    });
  });
  const nested = merged.filter((fact) => fact.kind !== 'task_run');
  const observations = [...taskRuns, ...nested];
  validateParentGraph(input.task, observations);
  const sorted = sortObservations(observations);
  const childObservations = sorted.filter((observation) => observation.kind === 'child_agent');
  const children = childCoverage(taskRuns, childObservations);
  const coverage: TaskObservationCoverageV1 = {
    runs: {
      availability: missingRunIds.length === 0 ? 'complete' : 'partial',
      expected: input.task.runs.length,
      observed: input.task.runs.length - missingRunIds.length,
      missingRunIds,
    },
    children,
    prompt: availabilityCounts(
      sorted.filter((observation) => promptBoundaryForObservation(observation) !== undefined),
      (observation) => promptCoverageAvailability(
        promptBoundaryForObservation(observation)!,
      ),
    ),
    usage: availabilityCounts(sorted, (observation) => observation.usage.availability),
    timing: availabilityCounts(sorted, (observation) => observation.timing.availability),
  };
  const stageTotals = STAGE_ORDER
    .filter((stage) => input.task.runs.some((run) => run.inputStage === stage))
    .map((stage): TaskObservationStageTotalV1 => {
      const stageObservations = sorted.filter((observation) => observation.stage === stage);
      const stageRuns = stageObservations.filter((observation) => observation.kind === 'task_run');
      const stageChildren = stageObservations.filter(
        (observation) => observation.kind === 'child_agent',
      );
      return {
        stage,
        runCount: stageRuns.length,
        runStatuses: stageRuns.map((run) => run.status),
        knownMainRunUsage: usageSummary(stageRuns),
        knownChildUsage: usageSummary(stageChildren),
      };
    });
  const taskType = input.taskType ?? input.task.planContract?.taskProfile.taskType ?? null;
  const limitations = aggregateLimitations({
    missingRunIds,
    children,
    observations: sorted,
    taskType,
  });

  return {
    schema: 'open-design.strategy-task-observation/v1',
    root: {
      observationId: rootObservationId,
      taskExecutionId: input.task.taskExecutionId,
      projectId: input.task.projectId,
      conversationId: input.task.conversationId,
      status: input.task.outcome,
      route: input.task.route,
      executionMode: input.task.executionMode,
      taskType,
      strategyId: input.task.strategyId,
      strategyVersion: input.task.strategyVersion,
      strategyPackageHash: input.task.strategyPackageHash,
      snapshotId: input.task.snapshotId,
      planContractHash: input.task.planContractHash ?? null,
      selectedAgentId: input.task.selectedAgentId,
      agentCliVersions: distinctRuntimeVersions(sorted, 'agentCliVersion'),
      runtimeCompanionVersions: distinctRuntimeVersions(
        sorted,
        'runtimeCompanionVersion',
      ),
      runtimeAdapterVersions: distinctRuntimeVersions(sorted, 'runtimeAdapterVersion'),
      ...(input.strategyRolloutDecision
        ? {
            rolloutAdmission: {
              requestedMode: input.strategyRolloutDecision.requestedMode,
              effectiveMode: input.strategyRolloutDecision.effectiveMode,
              primaryReasonCode: input.strategyRolloutDecision.primaryReasonCode,
              compatibilityBasis: input.strategyRolloutDecision.syntheticCanary
                ? 'local_synthetic_canary' as const
                : 'runtime_adapter_family_fixture_evidence' as const,
              admissionStage: 'activation_admission' as const,
            },
          }
        : {}),
      createdAt: input.task.createdAt,
      updatedAt: input.task.updatedAt,
    },
    observations: sorted,
    coverage,
    stageTotals,
    limitations,
  };
}

export function aggregateStoredStrategyTaskObservations(input: {
  db: Database.Database;
  taskExecutionId: string;
  observations: readonly unknown[];
}): StrategyTaskObservationAggregateV1 {
  const task = getStrategyTaskExecution(input.db, input.taskExecutionId);
  if (!task) {
    throw new InvalidTaskObservationAggregateError(
      `Unknown strategy task execution ${input.taskExecutionId}.`,
    );
  }
  const snapshot = getSnapshot(input.db, task.snapshotId);
  const taskType = snapshot?.strategy?.selectedTaskProfile.taskType;
  return aggregateStrategyTaskObservations({
    task,
    observations: input.observations,
    ...(taskType ? { taskType } : {}),
  });
}

function legacyLevel(status: NormalizedAgentObservationStatusV1 | StrategyTaskOutcome): string {
  if (status === 'failed' || status === 'blocked') return 'ERROR';
  if (status === 'canceled') return 'WARNING';
  return 'DEFAULT';
}

function legacyAbsoluteTiming(
  observation: NormalizedAgentObservationV1,
): { startTime?: string; endTime?: string } {
  const evidence = observation.timing.evidence?.find((candidate) => (
    candidate.clockDomain === 'unix_epoch_ms' &&
    (candidate.startedAtMs !== undefined || candidate.endedAtMs !== undefined)
  ));
  if (!evidence) return {};
  return {
    ...(evidence.startedAtMs !== undefined
      ? { startTime: new Date(evidence.startedAtMs).toISOString() }
      : {}),
    ...(evidence.endedAtMs !== undefined
      ? { endTime: new Date(evidence.endedAtMs).toISOString() }
      : {}),
  };
}

function legacyUsage(observation: NormalizedAgentObservationV1): Record<string, unknown> | undefined {
  const values = safeTaskObservationUsageValues(observation);
  if (!values) return undefined;
  return {
    input: values.effectiveInputTokens ?? values.inputTokens,
    output: values.outputTokens,
    total: values.totalTokens,
    unit: 'TOKENS',
  };
}

const SAFE_USAGE_VALUE_KEYS = [
  'inputTokens',
  'effectiveInputTokens',
  'outputTokens',
  'totalTokens',
  'thoughtTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'uncachedInputTokens',
  'estimatedContextTokens',
] as const;

export function safeTaskObservationUsageValues(
  observation: NormalizedAgentObservationV1,
): Record<string, number> | undefined {
  if (observation.turnAccounting?.disposition === 'exclude_inherited') {
    return undefined;
  }
  const source = observation.usage.values;
  if (!source) return undefined;
  const values: Record<string, number> = {};
  for (const key of SAFE_USAGE_VALUE_KEYS) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      values[key] = value;
    }
  }
  return Object.keys(values).length > 0 ? values : undefined;
}

export function safeTaskObservationUsageValueSources(
  observation: NormalizedAgentObservationV1,
): Record<string, string> | undefined {
  if (observation.turnAccounting?.disposition === 'exclude_inherited') {
    return undefined;
  }
  const source = observation.usage.valueSources;
  if (!source) return undefined;
  const valueSources: Record<string, string> = {};
  for (const key of SAFE_USAGE_VALUE_KEYS) {
    const value = source[key];
    if (typeof value === 'string') valueSources[key] = value;
  }
  return Object.keys(valueSources).length > 0 ? valueSources : undefined;
}

function safePromptInput(observation: NormalizedAgentObservationV1): unknown {
  const boundary = promptBoundaryForObservation(observation);
  if (!boundary) return undefined;
  return boundary.availability === 'exact' || boundary.availability === 'partial'
    ? boundary.safePayload
    : undefined;
}

export function safeTaskObservationLimitationCodes(
  limitations: readonly string[],
): string[] {
  return limitations.filter((limitation) => (
    /^[a-z0-9][a-z0-9_:.-]{0,127}$/.test(limitation)
  ));
}

/** Plan-owned Build Package ids are observable only when they fit a bounded
 * identifier shape; arbitrary provider attributes never cross the sink. */
export function safeTaskObservationBuildPackageId(
  observation: NormalizedAgentObservationV1,
): string | undefined {
  const value = observation.attributes?.['buildPackageId'];
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
    ? value
    : undefined;
}

export function safeTaskObservationModelName(
  observation: NormalizedAgentObservationV1,
): string | undefined {
  const model = observation.attributes?.['modelId'] ?? observation.attributes?.['model'];
  return typeof model === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)
    ? model
    : undefined;
}

export function safeTaskObservationAgentId(
  observation: NormalizedAgentObservationV1,
): string | undefined {
  const agentId = observation.attributes?.['agentId'];
  return typeof agentId === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(agentId)
    ? agentId
    : undefined;
}

export function safeTaskObservationToolName(
  observation: NormalizedAgentObservationV1,
): string | undefined {
  const value = observation.attributes?.['toolName'];
  return observation.kind === 'tool' &&
    typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(value)
    ? value
    : undefined;
}

export function safeTaskObservationToolCallHash(
  observation: NormalizedAgentObservationV1,
): string | undefined {
  const value = observation.attributes?.['toolCallHash'];
  return observation.kind === 'tool' &&
    typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
    ? value
    : undefined;
}

export interface SafeTaskObservationQualityProjectionV1 {
  input?: string;
  output?: string;
  statusMessage?: string;
  metadata: Record<string, unknown>;
}

/**
 * Resolve the already-validated safe quality payload for one exported
 * observation. Tool I/O is owned by the parent task_run quality projection
 * and joined by the stable raw-call hash, so arbitrary observation attributes
 * never become transport content.
 */
export function safeTaskObservationQualityProjection(
  aggregate: StrategyTaskObservationAggregateV1,
  observation: NormalizedAgentObservationV1,
): SafeTaskObservationQualityProjectionV1 {
  if (observation.kind === 'task_run') {
    const quality = observation.quality;
    return {
      ...(quality?.result?.output?.text !== undefined
        ? { output: quality.result.output.text }
        : {}),
      ...(quality?.result?.error?.message?.text !== undefined
        ? { statusMessage: quality.result.error.message.text }
        : {}),
      metadata: {
        errorCode: quality?.result?.error?.code,
        failureCategory: quality?.result?.error?.category,
        failureDetail: quality?.result?.error?.detail,
        failureStage: quality?.result?.error?.stage,
        // Terminal process evidence for a failed Run. Classification alone
        // cannot answer "what did the process actually print and how did it
        // die", which the single-Run trace always carried.
        exitCode: quality?.process?.exitCode,
        signal: quality?.process?.signal,
        stderr: quality?.process?.stderr,
        stdout: quality?.process?.stdout,
        diagnostics: quality?.process?.diagnostics,
        manifestCompleteness: quality?.manifests?.completeness,
        attachmentManifest: quality?.manifests?.attachments,
        artifactManifest: quality?.manifests?.artifacts,
        inputTextSnapshotManifest: quality?.manifests?.inputTextSnapshots,
      },
    };
  }
  if (observation.kind !== 'tool') return { metadata: {} };
  const callHash = safeTaskObservationToolCallHash(observation);
  const toolName = safeTaskObservationToolName(observation);
  if (!callHash || !toolName) return { metadata: {} };
  const parentRun = aggregate.observations.find((candidate) => (
    candidate.kind === 'task_run' &&
    candidate.identity.runId === observation.identity.runId &&
    candidate.identity.taskRunIndex === observation.identity.taskRunIndex
  ));
  const tool = parentRun?.quality?.tools?.find((candidate) => (
    candidate.callHash === callHash && candidate.name === toolName
  ));
  if (!tool) return { metadata: {} };
  return {
    ...(tool.input ? { input: tool.input.text } : {}),
    ...(tool.output ? { output: tool.output.text } : {}),
    metadata: {
      toolStatus: tool.status,
      isError: tool.isError,
    },
  };
}

/**
 * Map one protocol-neutral task aggregate to legacy ingestion events.
 *
 * This builder performs no I/O. The caller must pass through the consent/sink
 * plan below before delivery. Inherited Turn copies stay in the exported
 * hierarchy, while their usage is omitted and marked unaccounted so the legacy
 * sink cannot count an owner/exclude pair twice.
 */
export function buildLegacyTaskObservationPayload(
  aggregate: StrategyTaskObservationAggregateV1,
  context?: TaskObservationExportContextV1,
): unknown[] {
  const traceId = aggregate.root.observationId;
  const nowIso = new Date(aggregate.root.updatedAt).toISOString();
  const events: unknown[] = [];
  const pushEvent = (type: string, body: Record<string, unknown>) => {
    const bodyId = String(body.id);
    events.push({
      id: stableLegacyEventId(type, bodyId),
      type,
      timestamp: nowIso,
      body,
    });
  };
  pushEvent('trace-create', {
    id: traceId,
    name: 'open-design-strategy-task',
    sessionId: aggregate.root.conversationId,
    userId: context?.installationId ?? undefined,
    release: context?.appVersion,
    version: context?.appVersion ?? aggregate.root.strategyVersion,
    timestamp: new Date(aggregate.root.createdAt).toISOString(),
    tags: canonicalTaskObservationTraceTags(aggregate, context),
    ...(context
      ? {
          environment: context.environment,
        }
      : {}),
    metadata: {
      schema: aggregate.schema,
      taskExecutionId: aggregate.root.taskExecutionId,
      projectId: aggregate.root.projectId,
      conversationId: aggregate.root.conversationId,
      route: aggregate.root.route,
      executionMode: aggregate.root.executionMode,
      taskType: aggregate.root.taskType,
      outcome: aggregate.root.status,
      strategyId: aggregate.root.strategyId,
      strategyVersion: aggregate.root.strategyVersion,
      strategyPackageHash: aggregate.root.strategyPackageHash,
      snapshotId: aggregate.root.snapshotId,
      planContractHash: aggregate.root.planContractHash,
      selectedAgentId: aggregate.root.selectedAgentId,
      appVersion: context?.appVersion,
      appChannel: context?.appChannel,
      packaged: context?.packaged,
      clientType: context?.clientType,
      agentCliVersions: aggregate.root.agentCliVersions,
      runtimeCompanionVersions: aggregate.root.runtimeCompanionVersions,
      runtimeAdapterVersions: aggregate.root.runtimeAdapterVersions,
      rolloutAdmission: aggregate.root.rolloutAdmission,
      ...(context
        ? {
            environment: context.environment,
            rolloutTag: context.tag,
          }
        : {}),
      coverage: aggregate.coverage,
      stageTotals: aggregate.stageTotals,
      limitations: safeTaskObservationLimitationCodes(aggregate.limitations),
    },
  });

  for (const observation of aggregate.observations) {
    const promptBoundary = promptBoundaryForObservation(observation);
    const promptInput = safePromptInput(observation);
    const quality = safeTaskObservationQualityProjection(aggregate, observation);
    const common = {
      id: observation.identity.observationId,
      traceId,
      ...(observation.kind === 'task_run'
        ? {}
        : { parentObservationId: observation.identity.parentObservationId }),
      name: observation.kind === 'task_run'
        ? `strategy-stage:${observation.stage}`
        : observation.kind,
      ...legacyAbsoluteTiming(observation),
      ...(quality.input !== undefined
        ? { input: quality.input }
        : promptInput !== undefined
          ? { input: promptInput }
          : {}),
      ...(quality.output !== undefined ? { output: quality.output } : {}),
      ...(quality.statusMessage !== undefined
        ? { statusMessage: quality.statusMessage }
        : {}),
      level: legacyLevel(observation.status),
      metadata: {
        schema: observation.schema,
        taskExecutionId: observation.identity.taskExecutionId,
        runId: observation.identity.runId,
        taskRunIndex: observation.identity.taskRunIndex,
        stage: observation.stage,
        status: observation.status,
        buildPackageId: safeTaskObservationBuildPackageId(observation),
        modelId: safeTaskObservationModelName(observation),
        modelName: safeTaskObservationModelName(observation),
        agentId: safeTaskObservationAgentId(observation),
        toolName: safeTaskObservationToolName(observation),
        toolCallHash: safeTaskObservationToolCallHash(observation),
        ...(promptBoundary
          ? { promptAvailability: promptBoundary.availability }
          : {}),
        usageAvailability: observation.usage.availability,
        usageSource: observation.usage.source,
        usageAccountingMode: observation.usage.accountingMode,
        usageValues: safeTaskObservationUsageValues(observation),
        usageValueSources: safeTaskObservationUsageValueSources(observation),
        usageLimitations: safeTaskObservationLimitationCodes(
          observation.usage.limitations,
        ),
        usageAccounted:
          observation.turnAccounting?.disposition !== 'exclude_inherited',
        turnAccountingDisposition: observation.turnAccounting?.disposition,
        turnAccountingOwnerObservationId:
          observation.turnAccounting?.ownerObservationId,
        timingAvailability: observation.timing.availability,
        childEvidenceCoverage: observation.childEvidenceCoverage,
        ...safeTaskObservationRuntimeVersions(observation),
        ...quality.metadata,
        limitations: safeTaskObservationLimitationCodes(observation.limitations),
      },
    };
    if (observation.kind === 'model_call') {
      const usage = observation.turnAccounting?.disposition === 'exclude_inherited'
        ? undefined
        : legacyUsage(observation);
      pushEvent('generation-create', {
        ...common,
        ...(usage ? { usage } : {}),
        model: safeTaskObservationModelName(observation),
      });
    } else {
      pushEvent('span-create', common);
    }
  }
  return events;
}

export function prepareLegacyTaskObservationExport(input: {
  aggregate: StrategyTaskObservationAggregateV1;
  prefs: TelemetryPrefs;
  hasEffectiveSink: boolean;
  context?: TaskObservationExportContextV1;
}): LegacyTaskObservationExportPlan {
  const expectation = deriveRunTelemetryExportExpectation(
    input.prefs,
    input.hasEffectiveSink,
  );
  return {
    expectation,
    batch: expectation.expected
      ? buildLegacyTaskObservationPayload(input.aggregate, input.context)
      : [],
  };
}
