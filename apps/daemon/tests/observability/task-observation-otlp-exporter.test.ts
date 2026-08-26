import {
  normalizeAgentObservationV1,
  type NormalizedAgentObservationV1,
} from '@open-design/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  aggregateStrategyTaskObservations,
  buildLegacyTaskObservationPayload,
  TASK_OBSERVATION_SCHEMA_CAPABILITY_V1,
  strategyTaskRunObservationId,
  type StrategyTaskObservationAggregateV1,
} from '../../src/observability/task-observation-aggregation.js';
import {
  LANGFUSE_OTLP_TRACES_PATH,
  buildOtlpTaskObservationPayload,
  describeTaskObservationExporter,
  exportTaskObservationAggregate,
  legacyAndOtlpTaskMappingsMatch,
  otlpTaskSpanId,
  otlpTaskTraceId,
  readTaskObservationExporterConfig,
  type OtlpSpanV1,
  type TaskObservationExporterConfig,
} from '../../src/observability/task-observation-otlp-exporter.js';
import { readTaskTelemetrySinkConfig } from '../../src/langfuse-trace.js';
import { buildStructuredMainRunObservationV1 } from '../../src/observability/main-run-observation.js';
import { createEmptyFrozenSkillPackage } from '../../src/strategies/od-next/frozen-skill-package.js';
import type { StrategyTaskExecutionRecord } from '../../src/strategies/task-store.js';

const RUN_ID = 'run-production';
const TASK_ID = 'task-otlp-fixture';
const RUN_OBSERVATION_ID = strategyTaskRunObservationId(TASK_ID, RUN_ID);
const FINAL_TEXT = {
  kind: 'turn' as const,
  schema: 'open-design.od-next-request-turn/v1' as const,
  text: 'production-fixture',
  utf8Bytes: 'production-fixture'.length,
  sha256: 'a'.repeat(64),
};

function task(outcome: StrategyTaskExecutionRecord['outcome'] = 'completed'):
StrategyTaskExecutionRecord {
  return {
    schemaVersion: 1,
    revision: 2,
    taskExecutionId: TASK_ID,
    projectId: 'project-fixture',
    conversationId: 'conversation-fixture',
    snapshotId: 'snapshot-fixture',
    strategyId: 'od-next-strategy',
    strategyVersion: '2.0.0',
    strategyPackageHash: 'sha256:package-fixture',
    selectedAgentId: 'codex',
    route: 'full_plan',
    inputStage: 'production',
    outcome,
    executionMode: 'simple',
    planContractHash: 'sha256:plan-fixture',
    clarificationCount: 0,
    planContractRepairAttempts: 0,
    initialRunId: RUN_ID,
    latestRunId: RUN_ID,
    activeRunId: outcome === 'running' ? RUN_ID : null,
    terminalRunId: outcome === 'running' ? null : RUN_ID,
    runs: [{ runId: RUN_ID, inputStage: 'production', taskRunIndex: 0, finalText: FINAL_TEXT }],
    frozenSkillPackage: createEmptyFrozenSkillPackage(),
    promptBundle: {
      ...FINAL_TEXT,
      kind: 'bundle',
      schema: 'open-design.od-next-prompt-bundle/v2',
    },
    frozenInputIdentity: {
      schema: 'open-design.od-next-frozen-input-identity/v1',
      snapshotId: 'snapshot-fixture',
      strategyPackageHash: 'sha256:package-fixture',
      frozenSkillPackageIdentity: createEmptyFrozenSkillPackage().identity,
      taskInputManifestSha256: 'b'.repeat(64),
    },
    createdAt: 1_000,
    updatedAt: 5_000,
  };
}

function usage(inputTokens: number, outputTokens: number) {
  return {
    availability: 'complete' as const,
    source: 'provider_stream' as const,
    accountingMode: 'additive' as const,
    values: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cacheReadTokens: 2,
    },
    valueSources: {
      inputTokens: 'provider_stream' as const,
      outputTokens: 'provider_stream' as const,
      totalTokens: 'provider_stream' as const,
      cacheReadTokens: 'provider_stream' as const,
    },
    limitations: [
      'usage_provider_reported',
      'unsafe usage detail /private/usage-secret',
    ],
  };
}

function observation(input: {
  id: string;
  kind: NormalizedAgentObservationV1['kind'];
  parentId?: string;
  status?: NormalizedAgentObservationV1['status'];
  promptBoundary?: 'hostComposed' | 'childInjected';
  usage?: ReturnType<typeof usage>;
  timing?: NormalizedAgentObservationV1['timing'];
  turnAccounting?: NormalizedAgentObservationV1['turnAccounting'];
  quality?: NormalizedAgentObservationV1['quality'];
  attributes?: Record<string, unknown>;
  limitations?: string[];
}): NormalizedAgentObservationV1 {
  const boundary = input.promptBoundary;
  return normalizeAgentObservationV1({
    identity: {
      observationId: input.id,
      taskExecutionId: TASK_ID,
      runId: RUN_ID,
      taskRunIndex: 0,
      ...(input.parentId ? { parentObservationId: input.parentId } : {}),
    },
    kind: input.kind,
    stage: 'production',
    status: input.status ?? 'completed',
    ...(boundary ? {
      prompt: {
        [boundary]: {
          availability: 'exact',
          source: boundary === 'hostComposed' ? 'daemon' : 'runtime',
          hash: boundary === 'hostComposed' ? FINAL_TEXT.sha256 : `sha256:${input.id}`,
          bytes: boundary === 'hostComposed' ? FINAL_TEXT.utf8Bytes : 32,
          safePayload: boundary === 'hostComposed'
            ? {
                type: 'open-design.od-next-host-composed-prompt',
                schema: 'open-design.od-next-exact-send-prompt/v1',
                boundary: 'hostComposed',
                kind: FINAL_TEXT.kind,
                promptSchema: FINAL_TEXT.schema,
                stage: 'production',
                sha256: FINAL_TEXT.sha256,
                utf8Bytes: FINAL_TEXT.utf8Bytes,
                promptStack: {
                  type: 'open-design.prompt-stack',
                  redactionVersion: 'prompt-stack-redaction-v1',
                  sections: [{ kind: 'odNextExactFinalText', redactedContent: 'fixture' }],
                },
              }
            : { fixture: input.id },
          limitations: ['safe_payload_redacted'],
        },
      },
    } : {}),
    usage: input.usage,
    timing: input.timing ?? {
      availability: 'complete',
      evidence: [{
        source: 'host_wall_clock',
        clockDomain: 'unix_epoch_ms',
        startedAtMs: 2_000,
        endedAtMs: 3_000,
      }],
      limitations: [],
    },
    turnAccounting: input.turnAccounting,
    quality: input.quality,
    attributes: input.attributes,
    limitations: input.limitations ?? [],
  });
}

function aggregate(): StrategyTaskObservationAggregateV1 {
  const childId = 'child-fixture';
  return aggregateStrategyTaskObservations({
    task: task(),
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
    observations: [
      observation({
        id: RUN_OBSERVATION_ID,
        kind: 'task_run',
        promptBoundary: 'hostComposed',
        usage: usage(100, 10),
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
        attributes: {
          agentCliVersion: 'opencode 1.18.18',
          runtimeAdapterVersion: 'od-opencode-json-events/v1',
        },
      }),
      observation({
        id: childId,
        kind: 'child_agent',
        parentId: RUN_OBSERVATION_ID,
        status: 'failed',
        promptBoundary: 'childInjected',
        usage: usage(40, 4),
        attributes: { buildPackageId: 'shell', model: 'claude-haiku-4-5' },
        limitations: ['child_failed_parent_recovered'],
      }),
      observation({
        id: 'model-owner',
        kind: 'model_call',
        parentId: childId,
        usage: usage(20, 2),
        turnAccounting: {
          turnId: 'turn-1',
          disposition: 'owner',
          ownerObservationId: 'model-owner',
        },
        attributes: { model: 'gpt-fixture', secret: 'must-not-export' },
      }),
      observation({
        id: 'model-inherited',
        kind: 'model_call',
        parentId: childId,
        usage: usage(20, 2),
        turnAccounting: {
          turnId: 'turn-1',
          disposition: 'exclude_inherited',
          ownerObservationId: 'model-owner',
        },
      }),
      observation({
        id: 'tool-fixture',
        kind: 'tool',
        parentId: childId,
        attributes: {
          toolName: 'Bash',
          toolCallHash: 'c'.repeat(64),
          opaqueRuntimePayload: 'token=fixture-secret',
        },
        timing: {
          availability: 'unavailable',
          limitations: ['timing_not_observed'],
        },
        limitations: ['unsafe detail /Users/alice'],
      }),
    ],
  });
}

function config(mode: TaskObservationExporterConfig['mode']): TaskObservationExporterConfig {
  return {
    mode,
    authHeader: 'Basic fixture-auth',
    baseUrl: 'https://langfuse.example.test',
    timeoutMs: 1_000,
    retries: 1,
  };
}

function spans(payload: ReturnType<typeof buildOtlpTaskObservationPayload>): OtlpSpanV1[] {
  return payload.resourceSpans[0]!.scopeSpans[0]!.spans;
}

function stringAttribute(span: OtlpSpanV1, key: string): string | undefined {
  return span.attributes.find((attribute) => attribute.key === key)?.value.stringValue;
}

function spanFor(payload: ReturnType<typeof buildOtlpTaskObservationPayload>, id: string): OtlpSpanV1 {
  return spans(payload).find((span) => (
    stringAttribute(span, 'langfuse.observation.metadata.observation_id') === id
  ))!;
}

interface LegacyFixtureEvent {
  type: string;
  body: Record<string, unknown>;
}

function legacyEventFor(batch: unknown[], id: string): LegacyFixtureEvent {
  return (batch as LegacyFixtureEvent[]).find((event) => event.body.id === id)!;
}

function setStringAttribute(span: OtlpSpanV1, key: string, value = 'semantic-drift'): void {
  const attribute = span.attributes.find((candidate) => candidate.key === key);
  if (attribute) {
    attribute.value = { stringValue: value };
    return;
  }
  span.attributes.push({ key, value: { stringValue: value } });
}

const LEGACY_TRACE_METADATA_FIELDS = [
  'schema',
  'taskExecutionId',
  'route',
  'executionMode',
  'taskType',
  'outcome',
  'strategyId',
  'strategyVersion',
  'strategyPackageHash',
  'snapshotId',
  'planContractHash',
  'selectedAgentId',
  'agentCliVersions',
  'runtimeCompanionVersions',
  'runtimeAdapterVersions',
  'coverage',
  'stageTotals',
  'limitations',
] as const;

const OTLP_TRACE_STRING_ATTRIBUTE_FIELDS = [
  'langfuse.trace.name',
  'langfuse.session.id',
  'langfuse.version',
  'langfuse.trace.metadata.task_execution_id',
  'langfuse.trace.metadata.route',
  'langfuse.trace.metadata.execution_mode',
  'langfuse.trace.metadata.task_type',
  'langfuse.trace.metadata.outcome',
  'langfuse.trace.metadata.strategy_id',
  'langfuse.trace.metadata.strategy_package_hash',
  'langfuse.trace.metadata.snapshot_id',
  'langfuse.trace.metadata.plan_contract_hash',
  'langfuse.trace.metadata.selected_agent_id',
  'langfuse.trace.metadata.agent_cli_versions',
  'langfuse.trace.metadata.runtime_companion_versions',
  'langfuse.trace.metadata.runtime_adapter_versions',
  'langfuse.trace.metadata.coverage',
  'langfuse.trace.metadata.stage_totals',
  'langfuse.trace.metadata.limitations',
] as const;

const LEGACY_OBSERVATION_METADATA_FIELDS = [
  'schema',
  'taskExecutionId',
  'runId',
  'taskRunIndex',
  'stage',
  'status',
  'buildPackageId',
  'modelId',
  'modelName',
  'agentId',
  'toolName',
  'toolCallHash',
  'promptAvailability',
  'usageAvailability',
  'usageSource',
  'usageAccountingMode',
  'usageValues',
  'usageValueSources',
  'usageLimitations',
  'usageAccounted',
  'turnAccountingDisposition',
  'turnAccountingOwnerObservationId',
  'timingAvailability',
  'limitations',
] as const;

const OTLP_OBSERVATION_METADATA_FIELDS = [
  'langfuse.observation.metadata.kind',
  'langfuse.observation.metadata.run_id',
  'langfuse.observation.metadata.task_run_index',
  'langfuse.observation.metadata.stage',
  'langfuse.observation.metadata.status',
  'langfuse.observation.metadata.build_package_id',
  'langfuse.observation.metadata.model_id',
  'langfuse.observation.metadata.model_name',
  'langfuse.observation.metadata.agent_id',
  'langfuse.observation.metadata.tool_name',
  'langfuse.observation.metadata.tool_call_hash',
  'langfuse.observation.metadata.prompt_availability',
  'langfuse.observation.metadata.usage_availability',
  'langfuse.observation.metadata.usage_source',
  'langfuse.observation.metadata.usage_accounting_mode',
  'langfuse.observation.metadata.usage_accounted',
  'langfuse.observation.metadata.turn_accounting_disposition',
  'langfuse.observation.metadata.turn_accounting_owner_observation_id',
  'langfuse.observation.metadata.usage_values',
  'langfuse.observation.metadata.usage_value_sources',
  'langfuse.observation.metadata.usage_limitations',
  'langfuse.observation.metadata.timing_availability',
  'langfuse.observation.metadata.limitations',
  'langfuse.observation.metadata.agent_cli_version',
  'langfuse.observation.metadata.runtime_companion_version',
  'langfuse.observation.metadata.runtime_adapter_version',
] as const;

describe('task observation OTLP exporter', () => {
  it('carries the structured main-Run model and agent through legacy and OTLP payloads', () => {
    const runObservation = buildStructuredMainRunObservationV1({
      taskExecutionId: TASK_ID,
      runId: RUN_ID,
      taskRunIndex: 0,
      parentObservationId: `strategy-task:${TASK_ID}`,
      stage: 'production',
      status: 'succeeded',
      modelId: 'openai/gpt-5.6-codex',
      agentId: 'codex',
    });
    const source = aggregateStrategyTaskObservations({
      task: task(),
      observations: [runObservation],
    });

    const legacy = buildLegacyTaskObservationPayload(source);
    const otlp = buildOtlpTaskObservationPayload(source);
    const legacyRun = legacyEventFor(legacy, RUN_OBSERVATION_ID);
    expect(legacyRun.body.metadata).toMatchObject({
      modelId: 'openai/gpt-5.6-codex',
      modelName: 'openai/gpt-5.6-codex',
      agentId: 'codex',
    });

    const otlpRun = spanFor(otlp, RUN_OBSERVATION_ID);
    expect(stringAttribute(otlpRun, 'langfuse.observation.metadata.model_id')).toBe(
      'openai/gpt-5.6-codex',
    );
    expect(stringAttribute(otlpRun, 'langfuse.observation.metadata.agent_id')).toBe('codex');
    expect(legacyAndOtlpTaskMappingsMatch(source, legacy, otlp)).toBe(true);
  });

  it('maps one complete OTLP span per task/run/child/model/tool with stable parent context', () => {
    const source = aggregate();
    const first = buildOtlpTaskObservationPayload(source);
    const second = buildOtlpTaskObservationPayload(source);
    expect(second).toEqual(first);
    expect(spans(first)).toHaveLength(source.observations.length + 1);
    expect(new Set(spans(first).map((span) => span.traceId))).toEqual(
      new Set([otlpTaskTraceId(TASK_ID)]),
    );
    expect(otlpTaskTraceId(TASK_ID)).toMatch(/^[0-9a-f]{32}$/);
    expect(spans(first).every((span) => /^[0-9a-f]{16}$/.test(span.spanId))).toBe(true);

    const root = spanFor(first, source.root.observationId);
    const run = spanFor(first, RUN_OBSERVATION_ID);
    const child = spanFor(first, 'child-fixture');
    const model = spanFor(first, 'model-owner');
    const tool = spanFor(first, 'tool-fixture');
    expect(root.parentSpanId).toBeUndefined();
    expect(run.parentSpanId).toBe(root.spanId);
    expect(stringAttribute(
      root,
      'langfuse.trace.metadata.agent_cli_versions',
    )).toBe(JSON.stringify(['opencode 1.18.18']));
    expect(stringAttribute(
      run,
      'langfuse.observation.metadata.agent_cli_version',
    )).toBe('opencode 1.18.18');
    expect(child.parentSpanId).toBe(run.spanId);
    expect(model.parentSpanId).toBe(child.spanId);
    expect(tool.parentSpanId).toBe(child.spanId);
    expect(model.spanId).toBe(otlpTaskSpanId('model-owner'));

    expect(stringAttribute(child, 'langfuse.observation.metadata.status')).toBe('failed');
    expect(stringAttribute(child, 'langfuse.observation.metadata.model_name')).toBe(
      'claude-haiku-4-5',
    );
    expect(stringAttribute(child, 'langfuse.observation.level')).toBe('ERROR');
    expect(stringAttribute(model, 'langfuse.observation.type')).toBe('generation');
    expect(stringAttribute(model, 'langfuse.observation.model.name')).toBe('gpt-fixture');
    expect(JSON.parse(stringAttribute(model, 'langfuse.observation.usage_details')!)).toEqual({
      input: 20,
      output: 2,
      total: 22,
      cache_read_input: 2,
    });
    expect(
      stringAttribute(spanFor(first, 'model-inherited'), 'langfuse.observation.usage_details'),
    ).toBeUndefined();
    expect(
      stringAttribute(spanFor(first, 'model-inherited'), 'langfuse.observation.metadata.usage_values'),
    ).toBeUndefined();
    expect(stringAttribute(tool, 'langfuse.observation.metadata.timing_mapping')).toBe(
      'aggregate_updated_at_zero_duration',
    );
    expect(stringAttribute(tool, 'langfuse.observation.metadata.tool_name')).toBe('Bash');
    expect(stringAttribute(tool, 'langfuse.observation.metadata.tool_call_hash')).toBe(
      'c'.repeat(64),
    );
    expect(tool.startTimeUnixNano).toBe(tool.endTimeUnixNano);
    expect(stringAttribute(tool, 'langfuse.observation.input')).toBe('safe command');
    expect(stringAttribute(tool, 'langfuse.observation.output')).toBe('safe result');
    const legacyTool = legacyEventFor(buildLegacyTaskObservationPayload(source), 'tool-fixture');
    expect(legacyTool.body.input).toBe('safe command');
    expect(legacyTool.body.output).toBe('safe result');
    expect(legacyTool.body.startTime).toBeUndefined();
    expect(legacyTool.body.endTime).toBeUndefined();
    expect(legacyTool.body.metadata).toMatchObject({
      toolName: 'Bash',
      toolCallHash: 'c'.repeat(64),
    });
    expect(JSON.stringify(first)).not.toContain('fixture-secret');
    expect(JSON.stringify(first)).not.toContain('must-not-export');
    expect(JSON.stringify(first)).not.toContain('/Users/alice');
    expect(JSON.stringify(first)).not.toContain('/private/usage-secret');
    const legacyRun = legacyEventFor(buildLegacyTaskObservationPayload(source), RUN_OBSERVATION_ID);
    expect(legacyRun.body.output).toBe('safe assistant output');
    expect(legacyRun.body.statusMessage).toBe('safe failure');
    expect(stringAttribute(run, 'langfuse.observation.output')).toBe('safe assistant output');
    expect(stringAttribute(run, 'langfuse.observation.status_message')).toBe('safe failure');
    const expectedPromptInput = {
      type: 'open-design.od-next-host-composed-prompt',
      schema: 'open-design.od-next-exact-send-prompt/v1',
      boundary: 'hostComposed',
      kind: FINAL_TEXT.kind,
      promptSchema: FINAL_TEXT.schema,
      stage: 'production',
      sha256: FINAL_TEXT.sha256,
      utf8Bytes: FINAL_TEXT.utf8Bytes,
      promptStack: {
        type: 'open-design.prompt-stack',
        redactionVersion: 'prompt-stack-redaction-v1',
        sections: [{ kind: 'odNextExactFinalText', redactedContent: 'fixture' }],
      },
    };
    expect(legacyRun.body.input).toEqual(expectedPromptInput);
    expect(JSON.parse(stringAttribute(run, 'langfuse.observation.input')!)).toEqual(
      expectedPromptInput,
    );
    expect(JSON.parse(
      stringAttribute(model, 'langfuse.observation.metadata.usage_limitations')!,
    )).toEqual(['usage_provider_reported']);
    expect(
      (legacyEventFor(
        buildLegacyTaskObservationPayload(source),
        'child-fixture',
      ).body.metadata as Record<string, unknown>)
        .buildPackageId,
    ).toBe('shell');
    expect(stringAttribute(
      spanFor(first, 'child-fixture'),
      'langfuse.observation.metadata.build_package_id',
    )).toBe('shell');
  });

  it('keeps legacy and OTLP hierarchy, status, usage, and limitations equivalent', () => {
    const source = aggregate();
    const legacy = buildLegacyTaskObservationPayload(source);
    const otlp = buildOtlpTaskObservationPayload(source);
    expect(legacyAndOtlpTaskMappingsMatch(source, legacy, otlp)).toBe(true);
    expect(
      (legacyEventFor(legacy, 'model-owner').body.metadata as Record<string, unknown>)
        .usageLimitations,
    ).toEqual(['usage_provider_reported']);
    expect(JSON.stringify(legacy)).not.toContain('/private/usage-secret');

    const broken = structuredClone(otlp);
    spanFor(broken, 'child-fixture').parentSpanId = otlpTaskSpanId('wrong-parent');
    expect(legacyAndOtlpTaskMappingsMatch(source, legacy, broken)).toBe(false);
  });

  it('maps Task user/session/project and app runtime dimensions to OTLP trace attributes', () => {
    const payload = buildOtlpTaskObservationPayload(aggregate(), {
      environment: 'production',
      tag: 'od-next-task-v1',
      installationId: 'installation-fixture',
      appVersion: '0.19.2',
      appChannel: 'beta',
      packaged: true,
      clientType: 'desktop',
    });
    const root = spanFor(payload, strategyTaskRunObservationId(TASK_ID, RUN_ID))
      .parentSpanId!;
    const rootSpan = spans(payload).find((span) => span.spanId === root)!;
    expect(stringAttribute(rootSpan, 'langfuse.session.id')).toBe('conversation-fixture');
    expect(stringAttribute(rootSpan, 'user.id')).toBe('installation-fixture');
    expect(stringAttribute(rootSpan, 'langfuse.release')).toBe('0.19.2');
    expect(stringAttribute(rootSpan, 'langfuse.trace.metadata.project_id')).toBe(
      'project-fixture',
    );
    expect(stringAttribute(rootSpan, 'langfuse.trace.metadata.app_channel')).toBe('beta');
    expect(stringAttribute(rootSpan, 'langfuse.trace.metadata.client_type')).toBe('desktop');
  });

  it('rejects omission of safe Child model and tool behavior metadata', () => {
    const source = aggregate();
    const legacy = buildLegacyTaskObservationPayload(source);
    const otlp = buildOtlpTaskObservationPayload(source);

    const legacyWithoutTool = structuredClone(legacy);
    delete (legacyEventFor(legacyWithoutTool, 'tool-fixture').body.metadata as Record<string, unknown>)
      .toolName;
    expect(legacyAndOtlpTaskMappingsMatch(source, legacyWithoutTool, otlp)).toBe(false);

    const otlpWithoutToolHash = structuredClone(otlp);
    const toolSpan = spanFor(otlpWithoutToolHash, 'tool-fixture');
    toolSpan.attributes = toolSpan.attributes.filter((attribute) => (
      attribute.key !== 'langfuse.observation.metadata.tool_call_hash'
    ));
    expect(legacyAndOtlpTaskMappingsMatch(source, legacy, otlpWithoutToolHash)).toBe(false);

    const otlpWithoutChildModel = structuredClone(otlp);
    const childSpan = spanFor(otlpWithoutChildModel, 'child-fixture');
    childSpan.attributes = childSpan.attributes.filter((attribute) => (
      attribute.key !== 'langfuse.observation.metadata.model_name'
    ));
    expect(legacyAndOtlpTaskMappingsMatch(source, legacy, otlpWithoutChildModel)).toBe(false);
  });

  it.each(LEGACY_TRACE_METADATA_FIELDS)(
    'rejects a single-field legacy trace metadata drift: %s',
    (field) => {
      const source = aggregate();
      const legacy = buildLegacyTaskObservationPayload(source);
      const trace = legacyEventFor(legacy, source.root.observationId);
      (trace.body.metadata as Record<string, unknown>)[field] = 'semantic-drift';
      expect(legacyAndOtlpTaskMappingsMatch(
        source,
        legacy,
        buildOtlpTaskObservationPayload(source),
      )).toBe(false);
    },
  );

  it.each(OTLP_TRACE_STRING_ATTRIBUTE_FIELDS)(
    'rejects a single-field propagated OTLP trace drift: %s',
    (field) => {
      const source = aggregate();
      const legacy = buildLegacyTaskObservationPayload(source);
      const otlp = buildOtlpTaskObservationPayload(source);
      setStringAttribute(spanFor(otlp, source.root.observationId), field);
      expect(legacyAndOtlpTaskMappingsMatch(source, legacy, otlp)).toBe(false);
    },
  );

  it('rejects root tags, outcome output, name, level, and status drift one field at a time', () => {
    const source = aggregate();
    const legacy = buildLegacyTaskObservationPayload(source);
    const mutations: Array<(payload: ReturnType<typeof buildOtlpTaskObservationPayload>) => void> = [
      (payload) => {
        const root = spanFor(payload, source.root.observationId);
        root.attributes.find((attribute) => attribute.key === 'langfuse.trace.tags')!.value = {
          arrayValue: { values: [{ stringValue: 'semantic-drift' }] },
        };
      },
      (payload) => setStringAttribute(
        spanFor(payload, source.root.observationId),
        'langfuse.observation.output',
      ),
      (payload) => setStringAttribute(
        spanFor(payload, source.root.observationId),
        'langfuse.observation.input',
      ),
      (payload) => {
        spanFor(payload, source.root.observationId).name = 'semantic-drift';
      },
      (payload) => setStringAttribute(
        spanFor(payload, source.root.observationId),
        'langfuse.observation.level',
      ),
      (payload) => {
        spanFor(payload, source.root.observationId).status = { code: 2, message: 'semantic-drift' };
      },
    ];
    for (const mutate of mutations) {
      const otlp = buildOtlpTaskObservationPayload(source);
      mutate(otlp);
      expect(legacyAndOtlpTaskMappingsMatch(source, legacy, otlp)).toBe(false);
    }
  });

  it.each(LEGACY_OBSERVATION_METADATA_FIELDS)(
    'rejects a single-field legacy observation evidence drift: %s',
    (field) => {
      const source = aggregate();
      const legacy = buildLegacyTaskObservationPayload(source);
      const event = legacyEventFor(legacy, 'model-owner');
      (event.body.metadata as Record<string, unknown>)[field] = 'semantic-drift';
      expect(legacyAndOtlpTaskMappingsMatch(
        source,
        legacy,
        buildOtlpTaskObservationPayload(source),
      )).toBe(false);
    },
  );

  it.each(OTLP_OBSERVATION_METADATA_FIELDS)(
    'rejects a single-field OTLP observation evidence drift: %s',
    (field) => {
      const source = aggregate();
      const legacy = buildLegacyTaskObservationPayload(source);
      const otlp = buildOtlpTaskObservationPayload(source);
      setStringAttribute(spanFor(otlp, 'model-owner'), field);
      expect(legacyAndOtlpTaskMappingsMatch(source, legacy, otlp)).toBe(false);
    },
  );

  it('rejects legacy event type, OTLP observation type, usage details, and usage body drift', () => {
    const source = aggregate();
    const mutations: Array<{
      legacy?: (batch: unknown[]) => void;
      otlp?: (payload: ReturnType<typeof buildOtlpTaskObservationPayload>) => void;
    }> = [
      {
        legacy: (batch) => {
          legacyEventFor(batch, 'child-fixture').type = 'generation-create';
        },
      },
      {
        otlp: (payload) => setStringAttribute(
          spanFor(payload, 'child-fixture'),
          'langfuse.observation.type',
          'generation',
        ),
      },
      {
        otlp: (payload) => setStringAttribute(
          spanFor(payload, 'model-owner'),
          'langfuse.observation.usage_details',
        ),
      },
      {
        legacy: (batch) => {
          legacyEventFor(batch, 'model-owner').body.usage = { total: 999 };
        },
      },
    ];
    for (const mutate of mutations) {
      const legacy = buildLegacyTaskObservationPayload(source);
      const otlp = buildOtlpTaskObservationPayload(source);
      mutate.legacy?.(legacy);
      mutate.otlp?.(otlp);
      expect(legacyAndOtlpTaskMappingsMatch(source, legacy, otlp)).toBe(false);
    }
  });

  it('rejects prompt input, generation model, level, and timing drift one field at a time', () => {
    const source = aggregate();
    const mutations: Array<{
      legacy?: (batch: unknown[]) => void;
      otlp?: (payload: ReturnType<typeof buildOtlpTaskObservationPayload>) => void;
    }> = [
      {
        legacy: (batch) => {
          legacyEventFor(batch, RUN_OBSERVATION_ID).body.input = { fixture: 'semantic-drift' };
        },
      },
      {
        otlp: (payload) => setStringAttribute(
          spanFor(payload, RUN_OBSERVATION_ID),
          'langfuse.observation.input',
        ),
      },
      {
        legacy: (batch) => {
          legacyEventFor(batch, 'tool-fixture').body.input = { fabricated: true };
        },
      },
      {
        otlp: (payload) => setStringAttribute(
          spanFor(payload, 'tool-fixture'),
          'langfuse.observation.input',
        ),
      },
      {
        legacy: (batch) => {
          legacyEventFor(batch, 'model-owner').body.model = 'semantic-drift';
        },
      },
      {
        otlp: (payload) => setStringAttribute(
          spanFor(payload, 'model-owner'),
          'langfuse.observation.model.name',
        ),
      },
      {
        legacy: (batch) => {
          legacyEventFor(batch, 'child-fixture').body.level = 'DEFAULT';
        },
      },
      {
        legacy: (batch) => {
          legacyEventFor(batch, RUN_OBSERVATION_ID).body.startTime =
            new Date(2_001).toISOString();
        },
      },
      {
        legacy: (batch) => {
          legacyEventFor(batch, RUN_OBSERVATION_ID).body.endTime =
            new Date(3_001).toISOString();
        },
      },
      {
        legacy: (batch) => {
          legacyEventFor(batch, 'tool-fixture').body.startTime =
            new Date(2_000).toISOString();
        },
      },
      {
        otlp: (payload) => {
          spanFor(payload, RUN_OBSERVATION_ID).startTimeUnixNano = '2001000000';
        },
      },
      {
        otlp: (payload) => {
          spanFor(payload, RUN_OBSERVATION_ID).endTimeUnixNano = '3001000000';
        },
      },
      {
        otlp: (payload) => setStringAttribute(
          spanFor(payload, RUN_OBSERVATION_ID),
          'langfuse.observation.metadata.timing_mapping',
        ),
      },
      {
        otlp: (payload) => {
          spanFor(payload, 'tool-fixture').endTimeUnixNano = '5001000000';
        },
      },
      {
        otlp: (payload) => setStringAttribute(
          spanFor(payload, 'tool-fixture'),
          'langfuse.observation.metadata.timing_mapping',
        ),
      },
    ];
    for (const mutate of mutations) {
      const legacy = buildLegacyTaskObservationPayload(source);
      const otlp = buildOtlpTaskObservationPayload(source);
      mutate.legacy?.(legacy);
      mutate.otlp?.(otlp);
      expect(legacyAndOtlpTaskMappingsMatch(source, legacy, otlp)).toBe(false);
    }
  });

  it('rejects stable trace and span identity drift one field at a time', () => {
    const source = aggregate();
    const mutations: Array<{
      legacy?: (batch: unknown[]) => void;
      otlp?: (payload: ReturnType<typeof buildOtlpTaskObservationPayload>) => void;
    }> = [
      {
        legacy: (batch) => {
          legacyEventFor(batch, 'model-owner').body.traceId = 'semantic-drift';
        },
      },
      {
        otlp: (payload) => {
          spanFor(payload, source.root.observationId).traceId = '0'.repeat(32);
        },
      },
      {
        otlp: (payload) => {
          spanFor(payload, source.root.observationId).spanId = '0'.repeat(16);
        },
      },
      {
        otlp: (payload) => {
          spanFor(payload, 'model-owner').traceId = '0'.repeat(32);
        },
      },
      {
        otlp: (payload) => {
          spanFor(payload, 'model-owner').spanId = '0'.repeat(16);
        },
      },
    ];
    for (const mutate of mutations) {
      const legacy = buildLegacyTaskObservationPayload(source);
      const otlp = buildOtlpTaskObservationPayload(source);
      mutate.legacy?.(legacy);
      mutate.otlp?.(otlp);
      expect(legacyAndOtlpTaskMappingsMatch(source, legacy, otlp)).toBe(false);
    }
  });

  it('reads an explicit mode while reusing existing Langfuse auth and transport defaults', () => {
    const env = {
      LANGFUSE_PUBLIC_KEY: 'pk-fixture',
      LANGFUSE_SECRET_KEY: 'sk-fixture',
      LANGFUSE_BASE_URL: 'https://self-host.example.test/',
      LANGFUSE_EXPORTER_MODE: 'otlp',
      LANGFUSE_TIMEOUT_MS: '4321',
      LANGFUSE_RETRIES: '3',
    };
    const parsed = readTaskObservationExporterConfig(
      readTaskTelemetrySinkConfig(env),
      env,
    );
    expect(parsed).toMatchObject({
      mode: 'otlp',
      baseUrl: 'https://self-host.example.test',
      timeoutMs: 4321,
      retries: 3,
    });
    expect(parsed?.authHeader).toBe(
      `Basic ${Buffer.from('pk-fixture:sk-fixture').toString('base64')}`,
    );
    expect(readTaskObservationExporterConfig(null, {})).toBeNull();
    const relayAndDirect = {
      LANGFUSE_PUBLIC_KEY: 'pk-fixture',
      LANGFUSE_SECRET_KEY: 'sk-fixture',
      OPEN_DESIGN_TELEMETRY_RELAY_URL: 'https://relay.example.test',
      LANGFUSE_EXPORTER_MODE: 'otlp',
    };
    expect(readTaskObservationExporterConfig(
      readTaskTelemetrySinkConfig(relayAndDirect),
      relayAndDirect,
    )).toBeNull();
    expect(describeTaskObservationExporter('dual')).toEqual({
      mode: 'dual',
      primaryProtocol: 'legacy-v1',
      shadowProtocol: 'otlp-v4',
      shadowNetworkEnabled: false,
    });
  });

  it('selects a Task-capable sink independently from Vela and exposes a versioned schema capability', () => {
    const env = {
      LANGFUSE_PUBLIC_KEY: 'pk-fixture',
      LANGFUSE_SECRET_KEY: 'sk-fixture',
      LANGFUSE_BASE_URL: 'https://self-host.example.test',
    };
    const configuredVela = {
      VELA_CONTROL_KEY: 'ck-fixture',
      VELA_API_URL: 'https://vela.example.test',
    };

    expect(readTaskTelemetrySinkConfig({
      ...env,
      OPEN_DESIGN_TELEMETRY_RELAY_URL: 'https://relay.example.test',
    })).toMatchObject({ kind: 'relay', relayUrl: 'https://relay.example.test' });
    const direct = readTaskTelemetrySinkConfig(env);
    expect(direct).toMatchObject({ kind: 'langfuse', baseUrl: 'https://self-host.example.test' });
    expect(readTaskObservationExporterConfig(direct, {
      ...env,
      ...configuredVela,
      LANGFUSE_EXPORTER_MODE: 'otlp',
    })).toMatchObject({ mode: 'otlp', baseUrl: 'https://self-host.example.test' });
    expect(readTaskTelemetrySinkConfig({})).toBeNull();
    expect(TASK_OBSERVATION_SCHEMA_CAPABILITY_V1).toMatchObject({
      schema: 'open-design.task-observation-schema-capability/v1',
      aggregateSchema: 'open-design.strategy-task-observation/v1',
      normalizedObservationSchema: 'open-design.normalized-agent-observation/v1',
    });
    expect(TASK_OBSERVATION_SCHEMA_CAPABILITY_V1.safeQualityFields).toEqual(
      expect.arrayContaining(['assistant_output', 'tool_io', 'manifests', 'error']),
    );
  });

  it('sends OTLP/JSON with Basic Auth, ingestion v4, and the durable idempotency identity', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), ...(init ? { init } : {}) });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const result = await exportTaskObservationAggregate(aggregate(), {
      prefs: { metrics: true, content: true, artifactManifest: true },
      config: config('otlp'),
      fetchImpl,
      deliveryIdempotencyKey: 'od-task-fixture',
    });
    expect(result).toMatchObject({
      langfuse_delivery_status: 'accepted',
      langfuse_attempt_count: 1,
      langfuse_idempotency_key: 'od-task-fixture',
      exporter_mode: 'otlp',
      primary_protocol: 'otlp-v4',
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(`https://langfuse.example.test${LANGFUSE_OTLP_TRACES_PATH}`);
    expect(requests[0]!.init?.headers).toMatchObject({
      Authorization: 'Basic fixture-auth',
      'Content-Type': 'application/json',
      'x-langfuse-ingestion-version': '4',
      'Idempotency-Key': 'od-task-fixture',
    });
    expect(JSON.parse(String(requests[0]!.init?.body))).toEqual(
      buildOtlpTaskObservationPayload(aggregate()),
    );
  });

  it('uses dual as a zero-network OTLP shadow and can repeat rollback/cutover', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ successes: [], errors: [] }), { status: 207 });
    }) as unknown as typeof fetch;
    const source = aggregate();
    const dual = await exportTaskObservationAggregate(source, {
      prefs: { metrics: true, content: true, artifactManifest: true },
      config: config('dual'),
      fetchImpl,
    });
    const rollback = await exportTaskObservationAggregate(source, {
      prefs: { metrics: true, content: true, artifactManifest: true },
      config: config('legacy'),
      fetchImpl,
    });
    expect(dual).toMatchObject({
      exporter_mode: 'dual',
      primary_protocol: 'legacy-v1',
      shadow_protocol: 'otlp-v4',
      shadow_status: 'matched',
      langfuse_delivery_status: 'accepted',
    });
    expect(rollback).toMatchObject({
      exporter_mode: 'legacy',
      primary_protocol: 'legacy-v1',
      langfuse_delivery_status: 'accepted',
    });
    expect(urls).toEqual([
      'https://langfuse.example.test/api/public/ingestion',
      'https://langfuse.example.test/api/public/ingestion',
    ]);
    expect(buildOtlpTaskObservationPayload(source)).toEqual(
      buildOtlpTaskObservationPayload(source),
    );
  });

  it.each([
    { metrics: false, content: true, reason: 'metrics_consent_off' },
    { metrics: true, content: false, reason: 'content_consent_off' },
  ])('makes zero requests when consent is disabled: $reason', async ({ metrics, content, reason }) => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await exportTaskObservationAggregate(aggregate(), {
      prefs: { metrics, content, artifactManifest: true },
      config: config('otlp'),
      fetchImpl,
    });
    expect(result).toMatchObject({
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: reason,
      langfuse_attempt_count: 0,
      primary_protocol: 'none',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('makes zero requests without credentials and keeps the missing-sink terminal', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await exportTaskObservationAggregate(aggregate(), {
      prefs: { metrics: true, content: true, artifactManifest: true },
      config: null,
      fetchImpl,
    });
    expect(result).toMatchObject({
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'missing_sink_config',
      langfuse_attempt_count: 0,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('retries only transient OTLP failures and finalizes normal failure in-request', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 503 })) as unknown as typeof fetch;
    const result = await exportTaskObservationAggregate(aggregate(), {
      prefs: { metrics: true, content: true, artifactManifest: true },
      config: config('otlp'),
      fetchImpl,
      retryDelayMs: 0,
    });
    expect(result).toMatchObject({
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'langfuse_5xx',
      langfuse_attempt_count: 2,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('drops an oversized OTLP request before the transport boundary', async () => {
    const source = aggregate();
    const run = source.observations.find((observation) => observation.kind === 'task_run')!;
    const oversized: StrategyTaskObservationAggregateV1 = {
      ...source,
      observations: source.observations.map((observation) => (
        observation === run
          ? {
              ...observation,
              prompt: {
                ...observation.prompt,
                hostComposed: {
                  ...observation.prompt.hostComposed,
                  safePayload: { fixture: 'x'.repeat(1024 * 1024) },
                },
              },
            }
          : observation
      )),
    };
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await exportTaskObservationAggregate(oversized, {
      prefs: { metrics: true, content: true, artifactManifest: true },
      config: config('otlp'),
      fetchImpl,
    });
    expect(result).toMatchObject({
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'payload_too_large',
      langfuse_attempt_count: 0,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('turns an unencodable safe payload into a non-throwing terminal failure', async () => {
    const source = aggregate();
    const run = source.observations.find((observation) => observation.kind === 'task_run')!;
    const invalid: StrategyTaskObservationAggregateV1 = {
      ...source,
      observations: source.observations.map((observation) => (
        observation === run
          ? {
              ...observation,
              prompt: {
                ...observation.prompt,
                hostComposed: {
                  ...observation.prompt.hostComposed,
                  safePayload: { invalidBigInt: 1n },
                },
              },
            }
          : observation
      )),
    };
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(exportTaskObservationAggregate(invalid, {
      prefs: { metrics: true, content: true, artifactManifest: true },
      config: config('otlp'),
      fetchImpl,
    })).resolves.toMatchObject({
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'payload_build_error',
      langfuse_attempt_count: 0,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed on OTLP partial success and does not log the response body', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      partialSuccess: { rejectedSpans: '1', errorMessage: 'secret server detail' },
    }), { status: 200 })) as unknown as typeof fetch;
    const result = await exportTaskObservationAggregate(aggregate(), {
      prefs: { metrics: true, content: true, artifactManifest: true },
      config: config('otlp'),
      fetchImpl,
    });
    expect(result).toMatchObject({
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'langfuse_4xx',
      langfuse_attempt_count: 1,
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
