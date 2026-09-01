import {
  normalizeAgentObservationV1,
  type NormalizedAgentObservationKindV1,
  type NormalizedAgentObservationStatusV1,
  type NormalizedAgentObservationV1,
  type StrategyInputStageV2,
} from '@open-design/contracts';
import { describe, expect, it } from 'vitest';

import {
  InvalidTaskObservationAggregateError,
  aggregateStrategyTaskObservations,
  buildLegacyTaskObservationPayload,
  prepareLegacyTaskObservationExport,
  strategyTaskRootObservationId,
  strategyTaskRunObservationId,
} from '../../src/observability/task-observation-aggregation.js';
import { createEmptyFrozenSkillPackage } from '../../src/strategies/od-next/frozen-skill-package.js';
import type { StrategyTaskExecutionRecord } from '../../src/strategies/task-store.js';

const RUNS = [
  { runId: 'run-request', inputStage: 'request', taskRunIndex: 0 },
  {
    runId: 'run-clarification',
    inputStage: 'clarification',
    taskRunIndex: 1,
    sourceRunId: 'run-request',
  },
  {
    runId: 'run-contract-repair',
    inputStage: 'contract_repair',
    taskRunIndex: 2,
    sourceRunId: 'run-clarification',
  },
  {
    runId: 'run-production',
    inputStage: 'production',
    taskRunIndex: 3,
    sourceRunId: 'run-contract-repair',
  },
] as const;

function finalText(kind: 'bundle' | 'turn') {
  return {
    kind,
    schema: kind === 'bundle'
      ? 'open-design.od-next-prompt-bundle/v2' as const
      : 'open-design.od-next-request-turn/v1' as const,
    text: `${kind}-fixture`,
    utf8Bytes: `${kind}-fixture`.length,
    sha256: 'a'.repeat(64),
  };
}

function task(
  outcome: StrategyTaskExecutionRecord['outcome'] = 'completed',
): StrategyTaskExecutionRecord {
  return {
    schemaVersion: 1,
    revision: 5,
    taskExecutionId: 'task-1',
    projectId: 'project-1',
    conversationId: 'conversation-1',
    snapshotId: 'snapshot-1',
    strategyId: 'od-next-strategy',
    strategyVersion: '2.0.0',
    strategyPackageHash: 'sha256:package',
    selectedAgentId: 'codex',
    route: 'full_plan',
    inputStage: 'production',
    outcome,
    executionMode: 'simple',
    planContractHash: 'sha256:plan',
    clarificationCount: 1,
    planContractRepairAttempts: 1,
    initialRunId: 'run-request',
    latestRunId: 'run-production',
    activeRunId: outcome === 'running' ? 'run-production' : null,
    terminalRunId: outcome === 'running' ? null : 'run-production',
    runs: RUNS.map((run) => ({
      ...run,
      finalText: finalText(run.taskRunIndex === 0 ? 'bundle' : 'turn'),
    })),
    frozenSkillPackage: createEmptyFrozenSkillPackage(),
    promptBundle: finalText('bundle'),
    frozenInputIdentity: {
      schema: 'open-design.od-next-frozen-input-identity/v1',
      snapshotId: 'snapshot-1',
      strategyPackageHash: 'sha256:package',
      frozenSkillPackageIdentity: createEmptyFrozenSkillPackage().identity,
      taskInputManifestSha256: 'b'.repeat(64),
    },
    createdAt: 1_000,
    updatedAt: 9_000,
  };
}

function completeUsage(inputTokens: number, outputTokens: number) {
  return {
    availability: 'complete' as const,
    source: 'provider_stream' as const,
    accountingMode: 'additive' as const,
    values: { inputTokens, outputTokens },
    valueSources: {
      inputTokens: 'provider_stream' as const,
      outputTokens: 'provider_stream' as const,
    },
    limitations: [],
  };
}

function exactPrompt(label: string) {
  return {
    hostComposed: {
      availability: 'exact' as const,
      source: 'daemon' as const,
      hash: `sha256:${label}`,
      bytes: label.length,
      safePayload: { type: 'fixture', label },
      limitations: ['safe_payload_redacted'],
    },
  };
}

function exactBoundary(
  label: string,
  source: 'daemon' | 'provider_stream' | 'runtime',
) {
  return {
    availability: 'exact' as const,
    source,
    hash: `sha256:${label}`,
    bytes: label.length,
    safePayload: { type: 'fixture', label },
    limitations: ['safe_payload_redacted'],
  };
}

function observation(input: {
  id: string;
  runId: string;
  taskRunIndex: number;
  stage: StrategyInputStageV2;
  kind?: NormalizedAgentObservationKindV1;
  parentId?: string;
  status?: NormalizedAgentObservationStatusV1;
  usage?: ReturnType<typeof completeUsage>;
  prompt?: Record<string, unknown>;
  turnAccounting?: NormalizedAgentObservationV1['turnAccounting'];
  quality?: NormalizedAgentObservationV1['quality'];
  childEvidenceCoverage?: NormalizedAgentObservationV1['childEvidenceCoverage'];
  attributes?: Record<string, unknown>;
  limitations?: string[];
}): NormalizedAgentObservationV1 {
  return normalizeAgentObservationV1({
    identity: {
      observationId: input.id,
      taskExecutionId: 'task-1',
      runId: input.runId,
      taskRunIndex: input.taskRunIndex,
      ...(input.parentId ? { parentObservationId: input.parentId } : {}),
    },
    kind: input.kind ?? 'task_run',
    stage: input.stage,
    status: input.status ?? 'completed',
    ...(input.prompt ? { prompt: input.prompt } : {}),
    ...(input.usage ? { usage: input.usage } : {}),
    timing: {
      availability: 'complete',
      evidence: [{
        source: 'host_wall_clock',
        clockDomain: 'unix_epoch_ms',
        startedAtMs: 1_000 + input.taskRunIndex * 1_000,
        endedAtMs: 1_500 + input.taskRunIndex * 1_000,
      }],
      limitations: [],
    },
    ...(input.turnAccounting ? { turnAccounting: input.turnAccounting } : {}),
    ...(input.quality ? { quality: input.quality } : {}),
    ...(input.childEvidenceCoverage ? { childEvidenceCoverage: input.childEvidenceCoverage } : {}),
    ...(input.attributes ? { attributes: input.attributes } : {}),
    limitations: input.limitations ?? [],
  });
}

function runObservation(
  run: typeof RUNS[number],
  overrides: Partial<Parameters<typeof observation>[0]> = {},
): NormalizedAgentObservationV1 {
  return observation({
    id: strategyTaskRunObservationId('task-1', run.runId),
    runId: run.runId,
    taskRunIndex: run.taskRunIndex,
    stage: run.inputStage,
    usage: completeUsage(100 + run.taskRunIndex, 10 + run.taskRunIndex),
    prompt: exactPrompt(run.inputStage),
    attributes: {
      agentCliVersion: 'opencode 1.18.18',
      runtimeAdapterVersion: 'od-opencode-json-events/v1',
    },
    childEvidenceCoverage: {
      availability: 'complete',
      source: 'fixture',
      knownChildCount: 0,
      explicitZero: true,
      limitations: [],
      diagnosticCounts: [],
    },
    ...overrides,
  });
}

function fourStageFacts(): NormalizedAgentObservationV1[] {
  const productionRunId = strategyTaskRunObservationId('task-1', 'run-production');
  const childId = 'child:task-1:run-production:child-1';
  return [
    ...RUNS.map((run) => runObservation(run, run.runId === 'run-production'
      ? {
          childEvidenceCoverage: {
            availability: 'complete',
            source: 'fixture',
            knownChildCount: 1,
            explicitZero: false,
            limitations: [],
            diagnosticCounts: [],
          },
        }
      : {})),
    observation({
      id: childId,
      runId: 'run-production',
      taskRunIndex: 3,
      stage: 'production',
      kind: 'child_agent',
      parentId: productionRunId,
      status: 'running',
      prompt: { childInjected: exactBoundary('child-injected', 'runtime') },
      limitations: ['child_usage_pending'],
    }),
    observation({
      id: childId,
      runId: 'run-production',
      taskRunIndex: 3,
      stage: 'production',
      kind: 'child_agent',
      parentId: productionRunId,
      status: 'failed',
      prompt: { childInjected: exactBoundary('child-injected', 'runtime') },
      limitations: ['child_usage_unavailable'],
    }),
    observation({
      id: 'tool:task-1:run-production:tool-1',
      runId: 'run-production',
      taskRunIndex: 3,
      stage: 'production',
      kind: 'tool',
      parentId: childId,
      attributes: {
        toolName: 'Bash',
        opaqueRuntimePayload: 'token=fixture-secret',
      },
      prompt: { hostComposed: exactBoundary('tool-host-must-not-map', 'daemon') },
      limitations: ['unsafe detail /Users/alice'],
    }),
    observation({
      id: 'model:task-1:run-production:owner',
      runId: 'run-production',
      taskRunIndex: 3,
      stage: 'production',
      kind: 'model_call',
      parentId: childId,
      usage: completeUsage(25, 5),
      prompt: {
        agentEffectiveContext: exactBoundary(
          'model-effective-context',
          'provider_stream',
        ),
      },
      attributes: { model: 'fixture-model' },
      turnAccounting: {
        turnId: 'turn-1',
        disposition: 'owner',
        ownerObservationId: 'model:task-1:run-production:owner',
      },
    }),
    observation({
      id: 'model:task-1:run-production:inherited-copy',
      runId: 'run-production',
      taskRunIndex: 3,
      stage: 'production',
      kind: 'model_call',
      parentId: productionRunId,
      usage: completeUsage(25, 5),
      prompt: {
        hostComposed: exactBoundary('model-host-must-not-map', 'daemon'),
      },
      turnAccounting: {
        turnId: 'turn-1',
        disposition: 'exclude_inherited',
        ownerObservationId: 'model:task-1:run-production:owner',
      },
    }),
  ];
}

function eventBodies(batch: unknown[]) {
  return batch.map((event) => event as {
    id: string;
    type: string;
    body: Record<string, unknown>;
  });
}

describe('strategy task observation aggregation', () => {
  it('builds a stable four-stage hierarchy while preserving child failure after parent recovery', () => {
    const aggregate = aggregateStrategyTaskObservations({
      task: task('completed'),
      observations: fourStageFacts(),
      taskType: 'prototype',
    });

    expect(aggregate.root).toMatchObject({
      observationId: strategyTaskRootObservationId('task-1'),
      taskExecutionId: 'task-1',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      status: 'completed',
      route: 'full_plan',
      executionMode: 'simple',
      taskType: 'prototype',
      planContractHash: 'sha256:plan',
      agentCliVersions: ['opencode 1.18.18'],
      runtimeAdapterVersions: ['od-opencode-json-events/v1'],
    });
    expect(aggregate.observations.filter((fact) => fact.kind === 'task_run').map(
      (fact) => [fact.stage, fact.identity.taskRunIndex, fact.identity.parentObservationId],
    )).toEqual([
      ['request', 0, 'strategy-task:task-1'],
      ['clarification', 1, 'strategy-task:task-1'],
      ['contract_repair', 2, 'strategy-task:task-1'],
      ['production', 3, 'strategy-task:task-1'],
    ]);
    expect(aggregate.observations.find(
      (fact) => fact.identity.observationId === 'child:task-1:run-production:child-1',
    )?.status).toBe('failed');
    expect(aggregate.coverage).toMatchObject({
      runs: { availability: 'complete', expected: 4, observed: 4, missingRunIds: [] },
      children: { availability: 'complete', knownObservationCount: 1 },
      prompt: { complete: 6, partial: 0, unavailable: 1 },
    });
    expect(aggregate.stageTotals.map((stage) => stage.stage)).toEqual([
      'request',
      'clarification',
      'contract_repair',
      'production',
    ]);
    expect(aggregate.stageTotals.at(-1)?.knownMainRunUsage.values).toMatchObject({
      inputTokens: 103,
      outputTokens: 13,
    });
    expect(aggregate.stageTotals.at(-1)?.knownChildUsage).toMatchObject({
      unavailable: 1,
      observedObservationCount: 0,
    });
    expect(aggregate.limitations).toContain('inherited_turn_copies_excluded_from_usage');

    const restarted = aggregateStrategyTaskObservations({
      task: task('completed'),
      observations: fourStageFacts(),
      taskType: 'prototype',
    });
    expect(restarted).toEqual(aggregate);
    expect(buildLegacyTaskObservationPayload(restarted)).toEqual(
      buildLegacyTaskObservationPayload(aggregate),
    );
  });

  it('keeps missing physical Run and Child evidence visible instead of filling zeros', () => {
    const observations = RUNS
      .filter((run) => run.inputStage !== 'contract_repair')
      .map((run) => runObservation(run));
    const aggregate = aggregateStrategyTaskObservations({
      task: task('completed'),
      observations,
    });

    expect(aggregate.coverage.runs).toEqual({
      availability: 'partial',
      expected: 4,
      observed: 3,
      missingRunIds: ['run-contract-repair'],
    });
    expect(aggregate.coverage.children).toEqual({
      availability: 'unavailable',
      knownObservationCount: 0,
      expectedRunCount: 4,
      completeRunCount: 3,
      partialRunCount: 0,
      unavailableRunCount: 1,
      explicitZeroRunCount: 3,
    });
    const missing = aggregate.observations.find(
      (fact) => fact.identity.runId === 'run-contract-repair',
    );
    expect(missing).toMatchObject({
      status: 'unknown',
      usage: { availability: 'unavailable' },
      timing: { availability: 'unavailable' },
    });
    expect(missing?.usage).not.toHaveProperty('values');
    expect(aggregate.limitations).toEqual(expect.arrayContaining([
      'physical_run_observation_partial',
      'child_lifecycle_unavailable_not_zero',
      'run_observation_not_observed',
    ]));
  });

  it('keeps canceled as a distinct task and Run terminal', () => {
    const facts = RUNS.map((run) => runObservation(run, run.inputStage === 'production'
      ? { status: 'canceled' }
      : {}));
    const aggregate = aggregateStrategyTaskObservations({
      task: task('canceled'),
      observations: facts,
    });
    expect(aggregate.root.status).toBe('canceled');
    expect(aggregate.stageTotals.at(-1)?.runStatuses).toEqual(['canceled']);
    const production = eventBodies(buildLegacyTaskObservationPayload(aggregate)).find(
      (event) => event.body.id === strategyTaskRunObservationId('task-1', 'run-production'),
    );
    expect(production?.body.level).toBe('WARNING');
  });

  it('maps task, Run, Child, generation, and tool hierarchy with stable legacy ids', () => {
    const aggregate = aggregateStrategyTaskObservations({
      task: task(),
      observations: fourStageFacts(),
    });
    const batch = eventBodies(buildLegacyTaskObservationPayload(aggregate));
    const trace = batch.find((event) => event.type === 'trace-create');
    const productionRun = batch.find(
      (event) => event.body.id === strategyTaskRunObservationId('task-1', 'run-production'),
    );
    const child = batch.find(
      (event) => event.body.id === 'child:task-1:run-production:child-1',
    );
    const generation = batch.find(
      (event) => event.body.id === 'model:task-1:run-production:owner',
    );
    const tool = batch.find(
      (event) => event.body.id === 'tool:task-1:run-production:tool-1',
    );

    expect(trace).toMatchObject({
      type: 'trace-create',
      body: {
        id: 'strategy-task:task-1',
        name: 'open-design-strategy-task',
        metadata: {
          agentCliVersions: ['opencode 1.18.18'],
          runtimeAdapterVersions: ['od-opencode-json-events/v1'],
        },
      },
    });
    expect(productionRun).toMatchObject({
      type: 'span-create',
      body: {
        traceId: 'strategy-task:task-1',
        name: 'strategy-stage:production',
        metadata: {
          agentCliVersion: 'opencode 1.18.18',
          runtimeAdapterVersion: 'od-opencode-json-events/v1',
        },
      },
    });
    expect(productionRun?.body).not.toHaveProperty('parentObservationId');
    expect(child?.body.parentObservationId).toBe(
      strategyTaskRunObservationId('task-1', 'run-production'),
    );
    expect(generation).toMatchObject({
      type: 'generation-create',
      body: {
        parentObservationId: 'child:task-1:run-production:child-1',
        usage: { input: 25, output: 5, unit: 'TOKENS' },
        metadata: {
          turnAccountingDisposition: 'owner',
          turnAccountingOwnerObservationId: 'model:task-1:run-production:owner',
          usageAccounted: true,
        },
      },
    });
    expect(tool).toMatchObject({
      type: 'span-create',
      body: { parentObservationId: 'child:task-1:run-production:child-1' },
    });
    const inherited = batch.find(
      (event) => event.body.id === 'model:task-1:run-production:inherited-copy',
    );
    expect(inherited).toMatchObject({
      type: 'generation-create',
      body: {
        parentObservationId: strategyTaskRunObservationId('task-1', 'run-production'),
        metadata: {
          turnAccountingDisposition: 'exclude_inherited',
          turnAccountingOwnerObservationId: 'model:task-1:run-production:owner',
          usageAccounted: false,
        },
      },
    });
    expect(inherited?.body).not.toHaveProperty('usage');
    expect(inherited?.body).not.toHaveProperty('input');
    expect(child?.body.input).toEqual({ type: 'fixture', label: 'child-injected' });
    expect(generation?.body.input).toEqual({
      type: 'fixture',
      label: 'model-effective-context',
    });
    expect(tool?.body).not.toHaveProperty('input');
    expect((tool?.body.metadata as Record<string, unknown>)).not.toHaveProperty(
      'promptAvailability',
    );
    expect(batch.every((event) => event.id.startsWith('od-'))).toBe(true);
    expect(JSON.stringify(batch)).not.toContain('fixture-secret');
    expect(JSON.stringify(batch)).not.toContain('/Users/alice');
  });

  it('maps the safe main-Run result, error, tool payloads, and manifests without raw attributes', () => {
    const facts = RUNS.map((run) => runObservation(run, run.inputStage === 'production'
      ? {
          status: 'failed',
          quality: {
            schema: 'open-design.safe-run-quality/v1',
            result: {
              output: { text: 'safe assistant output', redacted: true, truncated: false },
              error: {
                message: { text: 'safe failure', redacted: true, truncated: false },
                code: 'AGENT_EXIT',
                category: 'runtime',
                detail: 'provider_error',
                stage: 'agent_call',
              },
            },
            tools: [{
              callHash: 'c'.repeat(64),
              name: 'Bash',
              input: { text: 'safe command', redacted: true, truncated: false },
              output: { text: 'safe result', redacted: true, truncated: false },
              status: 'completed',
              isError: false,
            }],
            manifests: {
              completeness: 'complete',
              attachments: [],
              artifacts: [{
                object_class: 'artifact',
                artifact_id: 'artifact-1',
                storage_ref: 'od://objects/artifact/artifact-1',
                status: 'ok',
                redacted: false,
                truncated: false,
              }],
              inputTextSnapshots: [],
            },
          },
        }
      : {}));
    facts.push(observation({
      id: 'tool:quality',
      runId: 'run-production',
      taskRunIndex: 3,
      stage: 'production',
      kind: 'tool',
      parentId: strategyTaskRunObservationId('task-1', 'run-production'),
      attributes: {
        toolName: 'Bash',
        toolCallHash: 'c'.repeat(64),
        rawInput: 'must-not-export',
      },
    }));
    const aggregate = aggregateStrategyTaskObservations({ task: task(), observations: facts });
    const batch = eventBodies(buildLegacyTaskObservationPayload(aggregate));
    const run = batch.find(
      (event) => event.body.id === strategyTaskRunObservationId('task-1', 'run-production'),
    )!;
    const tool = batch.find((event) => event.body.id === 'tool:quality')!;

    expect(run.body.output).toBe('safe assistant output');
    expect(run.body.statusMessage).toBe('safe failure');
    expect(run.body.metadata).toMatchObject({
      errorCode: 'AGENT_EXIT',
      failureCategory: 'runtime',
      manifestCompleteness: 'complete',
    });
    expect(tool.body).toMatchObject({ input: 'safe command', output: 'safe result' });
    expect((tool.body.metadata as Record<string, unknown>).isError).toBe(false);
    expect(JSON.stringify(batch)).not.toContain('must-not-export');
  });

  it('keeps Task trace identity aligned with the existing user, session, project, and release dimensions', () => {
    const aggregate = aggregateStrategyTaskObservations({
      task: task(),
      observations: RUNS.map((run) => runObservation(run)),
      strategyRolloutDecision: {
        schemaVersion: 1,
        decisionClass: 'active',
        requestedMode: 'active',
        effectiveMode: 'active',
        taskType: 'prototype',
        assignmentBucket: 1,
        eligible: true,
        syntheticCanary: false,
        reasonCodes: [],
        primaryReasonCode: 'od_next_rollout_eligible',
      },
    });
    const trace = eventBodies(buildLegacyTaskObservationPayload(aggregate, {
      environment: 'production',
      tag: 'od-next-task-v1',
      installationId: 'installation-1',
      appVersion: '0.19.2',
      appChannel: 'beta',
      packaged: true,
      clientType: 'desktop',
    })).find((event) => event.type === 'trace-create')!;

    expect(trace.body).toMatchObject({
      sessionId: 'conversation-1',
      userId: 'installation-1',
      release: '0.19.2',
      version: '0.19.2',
      metadata: {
        projectId: 'project-1',
        conversationId: 'conversation-1',
        appVersion: '0.19.2',
        appChannel: 'beta',
        packaged: true,
        clientType: 'desktop',
        rolloutAdmission: {
          requestedMode: 'active',
          effectiveMode: 'active',
          primaryReasonCode: 'od_next_rollout_eligible',
          compatibilityBasis: 'runtime_adapter_family_fixture_evidence',
          admissionStage: 'activation_admission',
        },
      },
    });
  });

  it('maps legacy absolute time from one unix-epoch evidence item only', () => {
    const request = runObservation(RUNS[0]);
    const mixedClockRequest = {
      ...request,
      timing: {
        availability: 'partial' as const,
        evidence: [
          {
            source: 'host_monotonic' as const,
            clockDomain: 'monotonic_ms',
            startedAtMs: 100,
            endedAtMs: 200,
          },
          {
            source: 'runtime' as const,
            clockDomain: 'runtime_monotonic_ms',
            startedAtMs: 300,
            endedAtMs: 400,
          },
          {
            source: 'host_wall_clock' as const,
            clockDomain: 'unix_epoch_ms',
            startedAtMs: 2_000,
          },
          {
            source: 'provider' as const,
            clockDomain: 'unix_epoch_ms',
            endedAtMs: 3_000,
          },
        ],
        limitations: ['mixed_clock_fixture'],
      },
    };
    const aggregate = aggregateStrategyTaskObservations({
      task: task(),
      observations: [mixedClockRequest],
    });
    const requestSpan = eventBodies(buildLegacyTaskObservationPayload(aggregate)).find(
      (event) => event.body.id === request.identity.observationId,
    );

    expect(requestSpan?.body.startTime).toBe('1970-01-01T00:00:02.000Z');
    expect(requestSpan?.body).not.toHaveProperty('endTime');

    const monotonicOnly = {
      ...request,
      timing: {
        availability: 'partial' as const,
        evidence: [{
          source: 'host_monotonic' as const,
          clockDomain: 'monotonic_ms',
          startedAtMs: 500,
          endedAtMs: 600,
        }],
        limitations: ['monotonic_only'],
      },
    };
    const monotonicAggregate = aggregateStrategyTaskObservations({
      task: task(),
      observations: [monotonicOnly],
    });
    const monotonicSpan = eventBodies(
      buildLegacyTaskObservationPayload(monotonicAggregate),
    ).find((event) => event.body.id === request.identity.observationId);
    expect(monotonicSpan?.body).not.toHaveProperty('startTime');
    expect(monotonicSpan?.body).not.toHaveProperty('endTime');
  });

  it('applies metrics and content consent before creating a legacy batch', () => {
    const aggregate = aggregateStrategyTaskObservations({
      task: task(),
      observations: fourStageFacts(),
    });
    const off = prepareLegacyTaskObservationExport({
      aggregate,
      prefs: { metrics: true, content: false, artifactManifest: true },
      hasEffectiveSink: true,
    });
    expect(off).toEqual({
      expectation: {
        expected: false,
        status: 'not_expected',
        reason: 'content_consent_off',
      },
      batch: [],
    });
    const on = prepareLegacyTaskObservationExport({
      aggregate,
      prefs: { metrics: true, content: true, artifactManifest: true },
      hasEffectiveSink: true,
    });
    expect(on.expectation).toEqual({ expected: true, status: 'queued' });
    expect(on.batch.length).toBeGreaterThan(0);
  });

  it('fails closed on store conflicts, broken parents, terminal resurrection, and orphan inherited usage', () => {
    const run = RUNS[0];
    const request = runObservation(run);
    expect(() => aggregateStrategyTaskObservations({
      task: task(),
      observations: [{
        ...request,
        identity: { ...request.identity, taskRunIndex: 3 },
      }],
    })).toThrow(/durable task mapping/i);

    const orphan = observation({
      id: 'tool:orphan',
      runId: 'run-request',
      taskRunIndex: 0,
      stage: 'request',
      kind: 'tool',
      parentId: 'missing-parent',
    });
    expect(() => aggregateStrategyTaskObservations({
      task: task(),
      observations: [request, orphan],
    })).toThrow(/unavailable parent/i);

    const childId = 'child:terminal';
    const child = observation({
      id: childId,
      runId: 'run-request',
      taskRunIndex: 0,
      stage: 'request',
      kind: 'child_agent',
      parentId: request.identity.observationId,
      status: 'failed',
    });
    expect(() => aggregateStrategyTaskObservations({
      task: task(),
      observations: [request, child, { ...child, status: 'completed' }],
    })).toThrow(/terminal status/i);

    const inherited = observation({
      id: 'model:orphan-inherited',
      runId: 'run-request',
      taskRunIndex: 0,
      stage: 'request',
      kind: 'model_call',
      parentId: request.identity.observationId,
      usage: completeUsage(50, 5),
      turnAccounting: {
        turnId: 'turn-orphan',
        disposition: 'exclude_inherited',
        ownerObservationId: 'missing-owner',
      },
    });
    expect(() => aggregateStrategyTaskObservations({
      task: task(),
      observations: [request, inherited],
    })).toThrow(InvalidTaskObservationAggregateError);
  });
});
