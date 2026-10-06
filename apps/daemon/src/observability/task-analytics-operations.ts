import type {
  NormalizedAgentObservationV1,
  ObservationUsageValuesV1,
  PromptBoundaryEvidenceV1,
  StrategyExecutionModeV2,
  StrategyInputStageV2,
  StrategyRouteV2,
  StrategyTaskTypeV2,
} from '@open-design/contracts';

import type {
  ObservationAvailabilityCountsV1,
  StrategyTaskObservationAggregateV1,
  TaskObservationExportContextV1,
} from './task-observation-aggregation.js';

export const TASK_ANALYTICS_REPORT_SCHEMA = 'open-design.task-analytics-report/v1' as const;

export type TaskAnalyticsBucketV1 = StrategyTaskTypeV2 | 'unknown';

export interface TaskAnalyticsRecordV1 {
  aggregate: StrategyTaskObservationAggregateV1;
  context: TaskObservationExportContextV1;
  externalSignals?: {
    feedbackCount?: number;
    blindEvaluationCount?: number;
    defaultCritiqueSkipped?: boolean;
    qualityRegression?: boolean;
  };
}

export interface TaskAnalyticsFilterV1 {
  environments?: string[];
  tags?: string[];
  taskBuckets?: TaskAnalyticsBucketV1[];
  selectedAgentIds?: string[];
  models?: string[];
  strategyVersions?: string[];
  routes?: StrategyRouteV2[];
  executionModes?: StrategyExecutionModeV2[];
  stages?: StrategyInputStageV2[];
}

export interface TaskAnalyticsMetricDefinitionV1 {
  key: string;
  source: 'task_root' | 'normalized_observation' | 'external_signal';
  aggregation: 'count' | 'sum_known' | 'distribution_known' | 'coverage';
  missingness: 'exclude_and_report_coverage' | 'report_unavailable';
  notes: string;
}

export const TASK_ANALYTICS_METRIC_DICTIONARY_V1:
readonly TaskAnalyticsMetricDefinitionV1[] = [
  {
    key: 'task_outcome_count',
    source: 'task_root',
    aggregation: 'count',
    missingness: 'exclude_and_report_coverage',
    notes: 'Group only durable completed, blocked, canceled, or other observed outcomes.',
  },
  {
    key: 'physical_run_count_by_stage',
    source: 'normalized_observation',
    aggregation: 'count',
    missingness: 'exclude_and_report_coverage',
    notes: 'Use durable stage mapping; never infer a missing Run.',
  },
  {
    key: 'main_usage_tokens',
    source: 'normalized_observation',
    aggregation: 'sum_known',
    missingness: 'exclude_and_report_coverage',
    notes: 'Keep main Run usage separate from Child usage and inherited Turn copies.',
  },
  {
    key: 'child_usage_tokens',
    source: 'normalized_observation',
    aggregation: 'sum_known',
    missingness: 'exclude_and_report_coverage',
    notes: 'Sum only explicitly accounted Child facts; unavailable is not zero.',
  },
  {
    key: 'task_wall_clock_ms',
    source: 'task_root',
    aggregation: 'distribution_known',
    missingness: 'exclude_and_report_coverage',
    notes: 'Use durable task created/updated boundaries; do not mix clock domains.',
  },
  {
    key: 'child_lifecycle_count',
    source: 'normalized_observation',
    aggregation: 'count',
    missingness: 'exclude_and_report_coverage',
    notes: 'Count only observed Child lifecycle facts by terminal status.',
  },
  {
    key: 'prompt_identity_coverage',
    source: 'normalized_observation',
    aggregation: 'coverage',
    missingness: 'report_unavailable',
    notes: 'Count exact, partial, and unavailable Prompt boundaries; do not infer token cost.',
  },
  {
    key: 'usage_and_timing_coverage',
    source: 'normalized_observation',
    aggregation: 'coverage',
    missingness: 'report_unavailable',
    notes: 'Preserve usage source/accounting mode and timing availability.',
  },
  {
    key: 'feedback_and_blind_eval_count',
    source: 'external_signal',
    aggregation: 'sum_known',
    missingness: 'report_unavailable',
    notes: 'Require explicit Langfuse score or evaluation source; never infer quality.',
  },
] as const;

const USAGE_KEYS = [
  'inputTokens',
  'effectiveInputTokens',
  'outputTokens',
  'totalTokens',
  'thoughtTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'uncachedInputTokens',
  'estimatedContextTokens',
] as const satisfies readonly (keyof ObservationUsageValuesV1)[];

const STAGES: readonly StrategyInputStageV2[] = [
  'request',
  'clarification',
  'contract_repair',
  'production',
];

function increment(record: Record<string, number>, key: string, amount = 1): void {
  record[key] = (record[key] ?? 0) + amount;
}

function emptyAvailability(): ObservationAvailabilityCountsV1 {
  return { complete: 0, partial: 0, unavailable: 0 };
}

function incrementAvailability(
  target: ObservationAvailabilityCountsV1,
  availability: keyof ObservationAvailabilityCountsV1,
): void {
  target[availability] += 1;
}

function addAvailability(
  target: ObservationAvailabilityCountsV1,
  source: ObservationAvailabilityCountsV1,
): void {
  target.complete += source.complete;
  target.partial += source.partial;
  target.unavailable += source.unavailable;
}

function addUsageValues(
  target: Partial<Record<keyof ObservationUsageValuesV1, number>>,
  source: Partial<ObservationUsageValuesV1> | undefined,
): void {
  if (!source) return;
  for (const key of USAGE_KEYS) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      target[key] = (target[key] ?? 0) + value;
    }
  }
}

function safeModel(observation: NormalizedAgentObservationV1): string | null {
  const model = observation.attributes?.['model'];
  return typeof model === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)
    ? model
    : null;
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
): keyof ObservationAvailabilityCountsV1 {
  return evidence.availability === 'exact'
    ? 'complete'
    : evidence.availability === 'partial'
      ? 'partial'
      : 'unavailable';
}

function safeExternalCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function taskBucket(aggregate: StrategyTaskObservationAggregateV1): TaskAnalyticsBucketV1 {
  const value = aggregate.root.taskType;
  return value === 'prototype' || value === 'ppt' || value === 'marketing' ||
    value === 'hyperframes' || value === 'generic'
    ? value
    : 'unknown';
}

function matchesFilter(record: TaskAnalyticsRecordV1, filter: TaskAnalyticsFilterV1): boolean {
  const { aggregate, context } = record;
  const models = new Set(aggregate.observations.flatMap((observation) => {
    const model = safeModel(observation);
    return model ? [model] : [];
  }));
  return (!filter.environments || filter.environments.includes(context.environment)) &&
    (!filter.tags || filter.tags.includes(context.tag)) &&
    (!filter.taskBuckets || filter.taskBuckets.includes(taskBucket(aggregate))) &&
    (!filter.selectedAgentIds || filter.selectedAgentIds.includes(
      aggregate.root.selectedAgentId,
    )) &&
    (!filter.models || filter.models.some((model) => models.has(model))) &&
    (!filter.strategyVersions || filter.strategyVersions.includes(
      aggregate.root.strategyVersion,
    )) &&
    (!filter.routes || (aggregate.root.route !== null && filter.routes.includes(
      aggregate.root.route,
    ))) &&
    (!filter.executionModes || (aggregate.root.executionMode !== null &&
      filter.executionModes.includes(aggregate.root.executionMode))) &&
    (!filter.stages || aggregate.stageTotals.some((stage) => filter.stages!.includes(stage.stage)));
}

function selectedStages(filter: TaskAnalyticsFilterV1): Set<StrategyInputStageV2> {
  return new Set(filter.stages ?? STAGES);
}

/**
 * Reduce already-normalized task facts into an operations-only report. This
 * function performs no I/O, does not read Prompt content, and cannot affect a
 * task outcome or delivery checkpoint.
 */
export function buildTaskAnalyticsReportV1(
  records: readonly TaskAnalyticsRecordV1[],
  filter: TaskAnalyticsFilterV1 = {},
): {
  schema: typeof TASK_ANALYTICS_REPORT_SCHEMA;
  filters: TaskAnalyticsFilterV1;
  taskCount: number;
  dimensions: {
    environments: Record<string, number>;
    tags: Record<string, number>;
    taskBuckets: Record<string, number>;
    outcomes: Record<string, number>;
    routes: Record<string, number>;
    executionModes: Record<string, number>;
    stages: Record<string, number>;
    selectedAgents: Record<string, number>;
    models: Record<string, number>;
    strategyVersions: Record<string, number>;
    usageProvenance: Record<string, number>;
  };
  coverage: {
    runs: { expected: number; observed: number; partialTaskCount: number };
    prompt: ObservationAvailabilityCountsV1;
    timing: ObservationAvailabilityCountsV1;
    mainUsage: ObservationAvailabilityCountsV1;
    childUsage: ObservationAvailabilityCountsV1;
    children: Record<'complete' | 'partial' | 'unavailable', number>;
  };
  knownFacts: {
    mainUsageValues: Partial<Record<keyof ObservationUsageValuesV1, number>>;
    childUsageValues: Partial<Record<keyof ObservationUsageValuesV1, number>>;
    taskWallClockMs: number[];
    childLifecycle: Record<string, number>;
    feedbackCount: number;
    blindEvaluationCount: number;
    defaultCritiqueSkippedCount: number;
    qualityRegressionCount: number;
    externalSignalRecordCount: number;
  };
  unavailableFacts: {
    cost: string;
    ttft: string;
    promptSectionEstimatedTokens: string;
    childEligibility: string;
    childPlanned: string;
    externalQualityWhenMissing: string;
  };
  stopSignalSources: {
    wallClock: 'task_root';
    tokenThreshold: 'known_normalized_usage_only';
    defaultCritique: 'external_signal_only';
    qualityRegression: 'external_signal_only';
  };
  traceLink: { exposed: false; reason: 'A5_not_approved' };
} {
  const selected = records.filter((record) => matchesFilter(record, filter));
  const stages = selectedStages(filter);
  const dimensions = {
    environments: {} as Record<string, number>,
    tags: {} as Record<string, number>,
    taskBuckets: {} as Record<string, number>,
    outcomes: {} as Record<string, number>,
    routes: {} as Record<string, number>,
    executionModes: {} as Record<string, number>,
    stages: {} as Record<string, number>,
    selectedAgents: {} as Record<string, number>,
    models: {} as Record<string, number>,
    strategyVersions: {} as Record<string, number>,
    usageProvenance: {} as Record<string, number>,
  };
  const coverage = {
    runs: { expected: 0, observed: 0, partialTaskCount: 0 },
    prompt: emptyAvailability(),
    timing: emptyAvailability(),
    mainUsage: emptyAvailability(),
    childUsage: emptyAvailability(),
    children: { complete: 0, partial: 0, unavailable: 0 },
  };
  const knownFacts = {
    mainUsageValues: {} as Partial<Record<keyof ObservationUsageValuesV1, number>>,
    childUsageValues: {} as Partial<Record<keyof ObservationUsageValuesV1, number>>,
    taskWallClockMs: [] as number[],
    childLifecycle: {} as Record<string, number>,
    feedbackCount: 0,
    blindEvaluationCount: 0,
    defaultCritiqueSkippedCount: 0,
    qualityRegressionCount: 0,
    externalSignalRecordCount: 0,
  };

  for (const record of selected) {
    const { aggregate, context, externalSignals } = record;
    increment(dimensions.environments, context.environment);
    increment(dimensions.tags, context.tag);
    increment(dimensions.taskBuckets, taskBucket(aggregate));
    increment(dimensions.outcomes, aggregate.root.status);
    increment(dimensions.routes, aggregate.root.route ?? 'unavailable');
    increment(dimensions.executionModes, aggregate.root.executionMode ?? 'unavailable');
    increment(dimensions.selectedAgents, aggregate.root.selectedAgentId);
    increment(dimensions.strategyVersions, aggregate.root.strategyVersion);
    for (const model of new Set(aggregate.observations.flatMap((observation) => {
      const value = safeModel(observation);
      return value ? [value] : [];
    }))) increment(dimensions.models, model);
    const selectedObservations = aggregate.observations.filter(
      (observation) => stages.has(observation.stage),
    );
    for (const observation of selectedObservations) {
      if (observation.turnAccounting?.disposition === 'exclude_inherited') continue;
      increment(
        dimensions.usageProvenance,
        `${observation.kind}:${observation.usage.availability}:${observation.usage.source}:` +
          observation.usage.accountingMode,
      );
    }

    const selectedRuns = selectedObservations.filter(
      (observation) => observation.kind === 'task_run',
    );
    const selectedObservedRuns = selectedRuns.filter(
      (observation) => !observation.limitations.includes('run_observation_not_observed'),
    );
    coverage.runs.expected += selectedRuns.length;
    coverage.runs.observed += selectedObservedRuns.length;
    if (selectedObservedRuns.length !== selectedRuns.length) coverage.runs.partialTaskCount += 1;
    for (const observation of selectedObservations) {
      const prompt = promptBoundaryForObservation(observation);
      if (prompt) {
        incrementAvailability(coverage.prompt, promptCoverageAvailability(prompt));
      }
      incrementAvailability(coverage.timing, observation.timing.availability);
    }
    const selectedChildren = selectedObservations.filter(
      (observation) => observation.kind === 'child_agent',
    );
    increment(
      coverage.children,
      selectedChildren.length === 0
        ? 'unavailable'
        : selectedChildren.every((child) => (
            child.status === 'completed' || child.status === 'failed' || child.status === 'canceled'
          ))
          ? 'complete'
          : 'partial',
    );
    knownFacts.taskWallClockMs.push(Math.max(
      0,
      aggregate.root.updatedAt - aggregate.root.createdAt,
    ));

    for (const stage of aggregate.stageTotals) {
      if (!stages.has(stage.stage)) continue;
      increment(dimensions.stages, stage.stage, stage.runCount);
      addAvailability(coverage.mainUsage, stage.knownMainRunUsage);
      addAvailability(coverage.childUsage, stage.knownChildUsage);
      addUsageValues(knownFacts.mainUsageValues, stage.knownMainRunUsage.values);
      addUsageValues(knownFacts.childUsageValues, stage.knownChildUsage.values);
    }
    for (const child of aggregate.observations.filter(
      (observation) => observation.kind === 'child_agent' && stages.has(observation.stage),
    )) increment(knownFacts.childLifecycle, child.status);

    if (externalSignals) {
      knownFacts.externalSignalRecordCount += 1;
      knownFacts.feedbackCount += safeExternalCount(externalSignals.feedbackCount);
      knownFacts.blindEvaluationCount += safeExternalCount(
        externalSignals.blindEvaluationCount,
      );
      if (externalSignals.defaultCritiqueSkipped === true) {
        knownFacts.defaultCritiqueSkippedCount += 1;
      }
      if (externalSignals.qualityRegression === true) {
        knownFacts.qualityRegressionCount += 1;
      }
    }
  }

  return {
    schema: TASK_ANALYTICS_REPORT_SCHEMA,
    filters: filter,
    taskCount: selected.length,
    dimensions,
    coverage,
    knownFacts,
    unavailableFacts: {
      cost: 'no_cost_fact_in_normalized_observation',
      ttft: 'no_ttft_fact_in_task_aggregate',
      promptSectionEstimatedTokens: 'no_prompt_section_token_fact_in_task_aggregate',
      childEligibility: 'no_child_eligibility_fact_in_task_aggregate',
      childPlanned: 'no_child_planned_fact_in_task_aggregate',
      externalQualityWhenMissing: 'requires_explicit_feedback_or_blind_evaluation_source',
    },
    stopSignalSources: {
      wallClock: 'task_root',
      tokenThreshold: 'known_normalized_usage_only',
      defaultCritique: 'external_signal_only',
      qualityRegression: 'external_signal_only',
    },
    traceLink: { exposed: false, reason: 'A5_not_approved' },
  };
}
