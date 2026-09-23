import {
  normalizeAgentObservationV1,
  type StrategyInputStageV2,
  type StrategyTaskTypeV2,
} from '@open-design/contracts';
import { describe, expect, it } from 'vitest';

import {
  TASK_ANALYTICS_METRIC_DICTIONARY_V1,
  buildTaskAnalyticsReportV1,
  type TaskAnalyticsRecordV1,
} from '../../src/observability/task-analytics-operations.js';
import type {
  StrategyTaskObservationAggregateV1,
  TaskObservationStageTotalV1,
} from '../../src/observability/task-observation-aggregation.js';

function usageSummary(input: {
  complete?: number;
  partial?: number;
  unavailable?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
}) {
  const values = {
    ...(input.inputTokens === undefined ? {} : { inputTokens: input.inputTokens }),
    ...(input.outputTokens === undefined ? {} : { outputTokens: input.outputTokens }),
    ...(input.cacheReadTokens === undefined ? {} : { cacheReadTokens: input.cacheReadTokens }),
  };
  return {
    complete: input.complete ?? 0,
    partial: input.partial ?? 0,
    unavailable: input.unavailable ?? 0,
    observedObservationCount: Object.keys(values).length > 0 ? 1 : 0,
    ...(Object.keys(values).length > 0 ? { values } : {}),
  };
}

function stageTotal(input: {
  stage: StrategyInputStageV2;
  main?: Parameters<typeof usageSummary>[0];
  child?: Parameters<typeof usageSummary>[0];
}): TaskObservationStageTotalV1 {
  return {
    stage: input.stage,
    runCount: 1,
    runStatuses: ['completed'],
    knownMainRunUsage: usageSummary(input.main ?? { unavailable: 1 }),
    knownChildUsage: usageSummary(input.child ?? {}),
  };
}

function normalizedUsage(summary: TaskObservationStageTotalV1['knownMainRunUsage']) {
  if (summary.complete === 0 && summary.partial === 0) {
    return {
      availability: 'unavailable' as const,
      source: 'unknown' as const,
      accountingMode: 'unknown' as const,
      limitations: ['usage_not_observed'],
    };
  }
  const availability = summary.complete > 0 ? 'complete' as const : 'partial' as const;
  const values = summary.values!;
  return {
    availability,
    source: 'provider_stream' as const,
    accountingMode: 'additive' as const,
    values,
    valueSources: Object.fromEntries(
      Object.keys(values).map((key) => [key, 'provider_stream']),
    ),
    limitations: availability === 'complete' ? [] : ['provider_usage_partial'],
  };
}

function record(input: {
  id: string;
  taskType: StrategyTaskTypeV2 | null;
  environment?: string;
  agent?: string;
  model?: string;
  strategyVersion?: string;
  stages?: TaskObservationStageTotalV1[];
  childStatus?: 'completed' | 'failed' | 'canceled';
  externalSignals?: TaskAnalyticsRecordV1['externalSignals'];
}): TaskAnalyticsRecordV1 {
  const rootId = `strategy-task:${input.id}`;
  const stages = input.stages ?? [stageTotal({ stage: 'production' })];
  const taskRuns = stages.map((stage, index) => {
    const runId = `run-${input.id}-${stage.stage}`;
    return normalizeAgentObservationV1({
      identity: {
        observationId: `task-run:${input.id}:${runId}`,
        taskExecutionId: input.id,
        runId,
        taskRunIndex: index,
        parentObservationId: rootId,
      },
      kind: 'task_run',
      stage: stage.stage,
      status: stage.runStatuses[0] ?? 'unknown',
      prompt: {
        hostComposed: {
          availability: 'exact',
          source: 'daemon',
          hash: `sha256:prompt-${input.id}-${stage.stage}`,
          bytes: 32,
          safePayload: { type: 'synthetic-task-analytics-fixture' },
          limitations: ['safe_payload_redacted'],
        },
      },
      usage: normalizedUsage(stage.knownMainRunUsage),
      timing: {
        availability: 'complete',
        evidence: [{
          source: 'host_wall_clock',
          clockDomain: 'unix_epoch_ms',
          startedAtMs: 1_000 + index * 100,
          endedAtMs: 1_050 + index * 100,
        }],
        limitations: [],
      },
      limitations: [],
    });
  });
  const productionRun = taskRuns.find((run) => run.stage === 'production') ?? taskRuns.at(-1)!;
  const productionStage = stages.find((stage) => stage.stage === 'production') ?? stages.at(-1)!;
  const observations = [
    ...taskRuns,
    ...(input.model ? [normalizeAgentObservationV1({
      identity: {
        observationId: `model-${input.id}`,
        taskExecutionId: input.id,
        runId: productionRun.identity.runId,
        taskRunIndex: productionRun.identity.taskRunIndex,
        parentObservationId: productionRun.identity.observationId,
      },
      kind: 'model_call',
      stage: productionRun.stage,
      status: 'completed',
      prompt: {
        agentEffectiveContext: {
          availability: 'partial',
          source: 'provider_stream',
          hash: `sha256:model-prompt-${input.id}`,
          limitations: ['provider_effective_context_partial'],
        },
      },
      usage: {
        availability: 'unavailable',
        source: 'unknown',
        accountingMode: 'unknown',
        limitations: ['usage_not_observed'],
      },
      timing: { availability: 'unavailable', limitations: ['timing_not_observed'] },
      attributes: { model: input.model },
      limitations: [],
    })] : []),
    ...(input.childStatus ? [normalizeAgentObservationV1({
      identity: {
        observationId: `child-${input.id}`,
        taskExecutionId: input.id,
        runId: productionRun.identity.runId,
        taskRunIndex: productionRun.identity.taskRunIndex,
        parentObservationId: productionRun.identity.observationId,
      },
      kind: 'child_agent',
      stage: productionRun.stage,
      status: input.childStatus,
      prompt: {
        childInjected: {
          availability: 'partial',
          source: 'runtime',
          bytes: 64,
          limitations: ['child_prompt_hash_unavailable'],
        },
      },
      usage: normalizedUsage(productionStage.knownChildUsage),
      timing: { availability: 'unavailable', limitations: ['timing_not_observed'] },
      limitations: [],
    })] : []),
  ];
  const aggregate: StrategyTaskObservationAggregateV1 = {
    schema: 'open-design.strategy-task-observation/v1',
    root: {
      observationId: rootId,
      taskExecutionId: input.id,
      projectId: 'project-analytics',
      conversationId: 'conversation-analytics',
      status: 'completed',
      route: 'full_plan',
      executionMode: 'simple',
      taskType: input.taskType,
      strategyId: 'od-next-strategy',
      strategyVersion: input.strategyVersion ?? '2.0.0',
      strategyPackageHash: `sha256:package-${input.id}`,
      snapshotId: `snapshot-${input.id}`,
      planContractHash: `sha256:plan-${input.id}`,
      selectedAgentId: input.agent ?? 'opencode',
      agentCliVersions: [],
      runtimeCompanionVersions: [],
      runtimeAdapterVersions: [],
      createdAt: 1_000,
      updatedAt: 2_500,
    },
    observations,
    coverage: {
      runs: {
        availability: 'complete',
        expected: taskRuns.length,
        observed: taskRuns.length,
        missingRunIds: [],
      },
      children: input.childStatus
        ? {
            availability: 'complete',
            knownObservationCount: 1,
            expectedRunCount: taskRuns.length,
            completeRunCount: taskRuns.length,
            partialRunCount: 0,
            unavailableRunCount: 0,
            explicitZeroRunCount: 0,
          }
        : {
            availability: 'unavailable',
            knownObservationCount: 0,
            expectedRunCount: taskRuns.length,
            completeRunCount: 0,
            partialRunCount: 0,
            unavailableRunCount: taskRuns.length,
            explicitZeroRunCount: 0,
          },
      prompt: {
        complete: taskRuns.length,
        partial: Number(Boolean(input.model)) + Number(Boolean(input.childStatus)),
        unavailable: 0,
      },
      usage: {
        complete: observations.filter((observation) => observation.usage.availability === 'complete')
          .length,
        partial: observations.filter((observation) => observation.usage.availability === 'partial')
          .length,
        unavailable: observations.filter(
          (observation) => observation.usage.availability === 'unavailable',
        ).length,
      },
      timing: {
        complete: taskRuns.length,
        partial: 0,
        unavailable: observations.length - taskRuns.length,
      },
    },
    stageTotals: stages,
    limitations: input.childStatus ? [] : ['child_lifecycle_unavailable_not_zero'],
  };
  return {
    aggregate,
    context: {
      environment: input.environment ?? 'synthetic-test',
      tag: `bucket-${input.id}`,
    },
    ...(input.externalSignals ? { externalSignals: input.externalSignals } : {}),
  };
}

describe('task analytics operations', () => {
  const records = [
    record({
      id: 'prototype',
      taskType: 'prototype',
      model: 'openai/gpt-5.6-sol',
      childStatus: 'completed',
      stages: [
        stageTotal({
          stage: 'request',
          main: { complete: 1, inputTokens: 10, outputTokens: 2 },
        }),
        stageTotal({
          stage: 'production',
          main: { complete: 1, inputTokens: 100, outputTokens: 10, cacheReadTokens: 20 },
          child: { complete: 1, inputTokens: 40, outputTokens: 4 },
        }),
      ],
    }),
    record({
      id: 'ppt',
      taskType: 'ppt',
      agent: 'codex',
      model: 'openai/gpt-5.6-terra',
      childStatus: 'failed',
      stages: [stageTotal({
        stage: 'production',
        main: { partial: 1, inputTokens: 50 },
        child: { unavailable: 1 },
      })],
    }),
    record({ id: 'marketing', taskType: 'marketing' }),
    record({
      id: 'hyperframes',
      taskType: 'hyperframes',
      externalSignals: { feedbackCount: 2, blindEvaluationCount: 1 },
    }),
    record({ id: 'unknown', taskType: null, environment: 'dev' }),
  ];

  it('defines source and missingness for every operational metric', () => {
    expect(TASK_ANALYTICS_METRIC_DICTIONARY_V1.map((metric) => metric.key)).toEqual([
      'task_outcome_count',
      'physical_run_count_by_stage',
      'main_usage_tokens',
      'child_usage_tokens',
      'task_wall_clock_ms',
      'child_lifecycle_count',
      'prompt_identity_coverage',
      'usage_and_timing_coverage',
      'feedback_and_blind_eval_count',
    ]);
    expect(TASK_ANALYTICS_METRIC_DICTIONARY_V1.every(
      (metric) => metric.missingness !== undefined && metric.source !== undefined,
    )).toBe(true);
  });

  it('reports task buckets, stages, known usage, coverage, and external signals separately', () => {
    const report = buildTaskAnalyticsReportV1(records);
    expect(report.taskCount).toBe(5);
    expect(report.dimensions.taskBuckets).toEqual({
      prototype: 1,
      ppt: 1,
      marketing: 1,
      hyperframes: 1,
      unknown: 1,
    });
    expect(report.dimensions.stages).toEqual({ request: 1, production: 5 });
    expect(report.knownFacts.mainUsageValues).toEqual({
      inputTokens: 160,
      outputTokens: 12,
      cacheReadTokens: 20,
    });
    expect(report.knownFacts.childUsageValues).toEqual({ inputTokens: 40, outputTokens: 4 });
    expect(report.coverage.mainUsage).toEqual({ complete: 2, partial: 1, unavailable: 3 });
    expect(report.coverage.childUsage).toEqual({ complete: 1, partial: 0, unavailable: 1 });
    expect(report.knownFacts.childLifecycle).toEqual({ completed: 1, failed: 1 });
    expect(report.knownFacts).toMatchObject({
      feedbackCount: 2,
      blindEvaluationCount: 1,
      defaultCritiqueSkippedCount: 0,
      qualityRegressionCount: 0,
      externalSignalRecordCount: 1,
    });
    expect(report.dimensions.usageProvenance).toMatchObject({
      'task_run:complete:provider_stream:additive': 2,
      'task_run:partial:provider_stream:additive': 1,
      'task_run:unavailable:unknown:unknown': 3,
      'child_agent:complete:provider_stream:additive': 1,
    });
    expect(report.coverage.prompt).toEqual({ complete: 6, partial: 4, unavailable: 0 });
    expect(report.coverage.timing).toEqual({ complete: 6, partial: 0, unavailable: 4 });
  });

  it('filters by environment, task bucket, agent, model, version, and stage', () => {
    const report = buildTaskAnalyticsReportV1(records, {
      environments: ['synthetic-test'],
      taskBuckets: ['prototype'],
      selectedAgentIds: ['opencode'],
      models: ['openai/gpt-5.6-sol'],
      strategyVersions: ['2.0.0'],
      routes: ['full_plan'],
      executionModes: ['simple'],
      stages: ['production'],
    });
    expect(report.taskCount).toBe(1);
    expect(report.dimensions.stages).toEqual({ production: 1 });
    expect(report.knownFacts.mainUsageValues).toEqual({
      inputTokens: 100,
      outputTokens: 10,
      cacheReadTokens: 20,
    });

    const requestOnly = buildTaskAnalyticsReportV1(records, { stages: ['request'] });
    expect(requestOnly.taskCount).toBe(1);
    expect(requestOnly.dimensions.stages).toEqual({ request: 1 });
    expect(requestOnly.knownFacts.mainUsageValues).toEqual({ inputTokens: 10, outputTokens: 2 });
    expect(requestOnly.coverage.prompt).toEqual({ complete: 1, partial: 0, unavailable: 0 });
    expect(requestOnly.coverage.runs).toEqual({
      expected: 1,
      observed: 1,
      partialTaskCount: 0,
    });
  });

  it('does not match unavailable route or mode against explicit filters', () => {
    const missingRoute = structuredClone(records[2]!);
    missingRoute.aggregate.root.route = null;
    missingRoute.aggregate.root.executionMode = null;
    expect(buildTaskAnalyticsReportV1([missingRoute], { routes: ['full_plan'] }).taskCount).toBe(0);
    expect(buildTaskAnalyticsReportV1(
      [missingRoute],
      { executionModes: ['simple'] },
    ).taskCount).toBe(0);
  });

  it('keeps unsupported cost, TTFT, prompt estimates, eligibility, and quality unavailable', () => {
    const report = buildTaskAnalyticsReportV1([records[2]!]);
    expect(report.knownFacts.feedbackCount).toBe(0);
    expect(report.knownFacts.blindEvaluationCount).toBe(0);
    expect(report.knownFacts.externalSignalRecordCount).toBe(0);
    expect(report.unavailableFacts).toEqual({
      cost: 'no_cost_fact_in_normalized_observation',
      ttft: 'no_ttft_fact_in_task_aggregate',
      promptSectionEstimatedTokens: 'no_prompt_section_token_fact_in_task_aggregate',
      childEligibility: 'no_child_eligibility_fact_in_task_aggregate',
      childPlanned: 'no_child_planned_fact_in_task_aggregate',
      externalQualityWhenMissing: 'requires_explicit_feedback_or_blind_evaluation_source',
    });
    expect(report.traceLink).toEqual({ exposed: false, reason: 'A5_not_approved' });
    expect(report.stopSignalSources).toEqual({
      wallClock: 'task_root',
      tokenThreshold: 'known_normalized_usage_only',
      defaultCritique: 'external_signal_only',
      qualityRegression: 'external_signal_only',
    });
  });
});
