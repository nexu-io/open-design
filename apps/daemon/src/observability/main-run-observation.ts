import {
  normalizeAgentObservationV1,
  type NormalizedAgentObservationV1,
  type NormalizedTimingEvidenceV1,
  type NormalizedUsageEvidenceV1,
  type SafeRunQualityV1,
  type StrategyInputStageV2,
} from '@open-design/contracts';

import {
  structuredPromptStackInput,
  type OdNextExactSendPromptEvidenceV1,
  type PromptStackTelemetry,
} from '../prompt-telemetry.js';
import type {
  RunTimingAnalytics,
  RunUsageAnalytics,
} from '../run-analytics-observability.js';

export interface StructuredMainRunObservationV1Input {
  /**
   * Existing analytics lineage when available. Historical ordinary Runs may
   * predate it; those receive an explicit one-Run compatibility identity.
   */
  taskExecutionId?: string;
  runId: string;
  taskRunIndex: number;
  runtimeSessionId?: string;
  parentObservationId?: string;
  stage: StrategyInputStageV2;
  status: string;
  /** Resolved provider model identifier; emitted only after bounded validation. */
  modelId?: string;
  /** Runtime adapter identifier; emitted only after bounded validation. */
  agentId?: string;
  promptTelemetry?: PromptStackTelemetry;
  usage?: RunUsageAnalytics;
  timing?: RunTimingAnalytics;
  startedAtMs?: number;
  endedAtMs?: number;
  agentCliVersion?: string;
  runtimeCompanionName?: string;
  runtimeCompanionVersion?: string;
  runtimeAdapterVersion?: string;
  /** Safe projection rebuilt from the same durable sources as single-Run telemetry. */
  quality?: SafeRunQualityV1;
}

interface SafeOdNextHostComposedPromptV1 extends Record<string, unknown> {
  type: 'open-design.od-next-host-composed-prompt';
  schema: OdNextExactSendPromptEvidenceV1['schema'];
  boundary: OdNextExactSendPromptEvidenceV1['boundary'];
  kind: OdNextExactSendPromptEvidenceV1['kind'];
  promptSchema: OdNextExactSendPromptEvidenceV1['promptSchema'];
  stage: StrategyInputStageV2;
  sha256: string;
  utf8Bytes: number;
  promptStack: ReturnType<typeof structuredPromptStackInput>;
}

function safeOdNextHostComposedPrompt(
  exact: OdNextExactSendPromptEvidenceV1,
  promptTelemetry: PromptStackTelemetry,
  stage: StrategyInputStageV2,
): SafeOdNextHostComposedPromptV1 {
  if (exact.stage !== stage) {
    throw new Error('OD Next exact-send Prompt stage does not match its task Run mapping.');
  }
  return {
    type: 'open-design.od-next-host-composed-prompt',
    schema: exact.schema,
    boundary: exact.boundary,
    kind: exact.kind,
    promptSchema: exact.promptSchema,
    stage,
    sha256: exact.sha256,
    utf8Bytes: exact.utf8Bytes,
    promptStack: structuredPromptStackInput(promptTelemetry),
  };
}

function usageValues(
  usage: RunUsageAnalytics,
): {
  values: NonNullable<NormalizedUsageEvidenceV1['values']>;
  valueSources: NonNullable<NormalizedUsageEvidenceV1['valueSources']>;
} | undefined {
  const values = {
    ...(usage.input_tokens_provider !== undefined
      ? { inputTokens: usage.input_tokens_provider }
      : usage.input_tokens !== undefined
        ? { inputTokens: usage.input_tokens }
        : {}),
    ...(usage.input_tokens_effective !== undefined
      ? { effectiveInputTokens: usage.input_tokens_effective }
      : {}),
    ...(usage.output_tokens !== undefined ? { outputTokens: usage.output_tokens } : {}),
    ...(usage.thought_tokens !== undefined ? { thoughtTokens: usage.thought_tokens } : {}),
    ...(usage.cache_read_input_tokens !== undefined
      ? { cacheReadTokens: usage.cache_read_input_tokens }
      : {}),
    ...(usage.cache_creation_input_tokens !== undefined
      ? { cacheWriteTokens: usage.cache_creation_input_tokens }
      : {}),
    ...(usage.uncached_input_tokens !== undefined
      ? { uncachedInputTokens: usage.uncached_input_tokens }
      : {}),
    ...(usage.estimated_context_tokens !== undefined
      ? { estimatedContextTokens: usage.estimated_context_tokens }
      : {}),
  };
  if (Object.keys(values).length === 0) return undefined;
  const providerSource = usage.token_count_source === 'provider_usage'
    ? 'provider_stream' as const
    : usage.token_count_source === 'estimated'
      ? 'derived' as const
      : 'unknown' as const;
  return {
    values,
    valueSources: {
      ...(values.inputTokens !== undefined ? { inputTokens: providerSource } : {}),
      ...(values.outputTokens !== undefined ? { outputTokens: providerSource } : {}),
      ...(values.thoughtTokens !== undefined ? { thoughtTokens: providerSource } : {}),
      ...(values.cacheReadTokens !== undefined ? { cacheReadTokens: providerSource } : {}),
      ...(values.cacheWriteTokens !== undefined ? { cacheWriteTokens: providerSource } : {}),
      ...(values.effectiveInputTokens !== undefined
        ? { effectiveInputTokens: 'derived' as const }
        : {}),
      ...(values.uncachedInputTokens !== undefined
        ? { uncachedInputTokens: 'derived' as const }
        : {}),
      ...(values.estimatedContextTokens !== undefined
        ? { estimatedContextTokens: 'derived' as const }
        : {}),
    },
  };
}

function normalizeMainRunUsage(
  usage: RunUsageAnalytics | undefined,
): NormalizedUsageEvidenceV1 | undefined {
  if (!usage) return undefined;
  const normalized = usageValues(usage);
  if (!normalized) return undefined;
  const { values, valueSources } = normalized;
  const providerComplete =
    usage.token_count_source === 'provider_usage' &&
    values.inputTokens !== undefined &&
    values.outputTokens !== undefined;
  const source = usage.token_count_source === 'provider_usage'
    ? 'provider_stream'
    : usage.token_count_source === 'estimated'
      ? 'derived'
      : 'unknown';
  const limitations = [
    ...(!providerComplete ? ['usage_fields_partial'] : []),
    ...(usage.input_accounting_mode === 'unknown'
      ? ['input_accounting_mode_unknown']
      : []),
    ...(source === 'unknown' ? ['usage_source_unknown'] : []),
    ...(usage.estimated_context_tokens !== undefined
      ? ['estimated_context_tokens_are_derived']
      : []),
    ...(usage.input_tokens_effective !== undefined
      ? ['effective_input_tokens_are_derived']
      : []),
    ...(usage.uncached_input_tokens !== undefined
      ? ['uncached_input_tokens_are_derived']
      : []),
    // The existing scanner may synthesize total_tokens from effective input
    // plus output without retaining raw-vs-derived provenance. Do not forward
    // that ambiguous field until the producer exposes an explicit source.
    ...(usage.total_tokens !== undefined
      ? ['total_tokens_omitted_without_raw_provenance']
      : []),
  ];
  return {
    availability: providerComplete ? 'complete' : 'partial',
    source,
    accountingMode: usage.input_accounting_mode,
    values,
    valueSources,
    limitations,
  };
}

function timingMeasurements(timing: RunTimingAnalytics): Record<string, number> {
  const measurements: Record<string, number> = {};
  for (const [key, value] of Object.entries(timing)) {
    if (
      key !== 'tool_call_count' &&
      key !== 'total_duration_ms' &&
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0
    ) {
      measurements[key] = value;
    }
  }
  return measurements;
}

function normalizeMainRunTiming(args: {
  timing?: RunTimingAnalytics;
  startedAtMs?: number;
  endedAtMs?: number;
}): NormalizedTimingEvidenceV1 | undefined {
  const measurements = args.timing ? timingMeasurements(args.timing) : {};
  const durationMs = args.timing?.total_duration_ms;
  const hasEvidence =
    args.startedAtMs !== undefined ||
    args.endedAtMs !== undefined ||
    durationMs !== undefined ||
    Object.keys(measurements).length > 0;
  if (!hasEvidence) return undefined;

  const collection = args.timing?.phase_timing_status;
  const availability = collection === 'complete'
    ? 'complete'
    : collection === 'missing'
      ? 'unavailable'
      : 'partial';
  const evidence: NormalizedTimingEvidenceV1['evidence'] = [{
    source: 'host_wall_clock',
    clockDomain: 'unix_epoch_ms',
    ...(args.startedAtMs !== undefined ? { startedAtMs: args.startedAtMs } : {}),
    ...(args.endedAtMs !== undefined ? { endedAtMs: args.endedAtMs } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(Object.keys(measurements).length > 0 ? { measurements } : {}),
  }];
  return {
    availability: availability === 'unavailable' ? 'partial' : availability,
    evidence,
    limitations: [
      ...(availability !== 'complete' ? ['host_phase_timing_partial'] : []),
      'host_wall_clock_not_runtime_clock',
    ],
  };
}

/**
 * Compatibility adapter for the current top-level Run facts. It deliberately
 * consumes the already-structured Prompt/usage/timing outputs rather than
 * re-parsing runtime text, and it is not wired into the legacy exporter.
 */
export function buildStructuredMainRunObservationV1(
  input: StructuredMainRunObservationV1Input,
): NormalizedAgentObservationV1 {
  const taskExecutionId = input.taskExecutionId ?? `compat-run:${input.runId}`;
  const usage = normalizeMainRunUsage(input.usage);
  const timing = normalizeMainRunTiming(input);
  const exactPrompt = input.promptTelemetry?.odNextExactSend;
  const safeModelId = typeof input.modelId === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(input.modelId)
    ? input.modelId
    : undefined;
  const safeAgentId = typeof input.agentId === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(input.agentId)
    ? input.agentId
    : undefined;
  const prompt = input.promptTelemetry
    ? {
        hostComposed: {
          availability: 'exact' as const,
          source: 'daemon',
          hash: exactPrompt
            ? exactPrompt.sha256
            : input.promptTelemetry.promptFingerprint,
          bytes: exactPrompt
            ? exactPrompt.utf8Bytes
            : input.promptTelemetry.rawBytes,
          safePayload: exactPrompt
            ? safeOdNextHostComposedPrompt(exactPrompt, input.promptTelemetry, input.stage)
            : structuredPromptStackInput(input.promptTelemetry),
          limitations: [
            'safe_payload_redacted',
            ...(exactPrompt ? ['raw_identity_verified_before_transport'] : []),
            ...(input.promptTelemetry.sections.some((section) => section.truncated)
              ? ['safe_payload_truncated']
              : []),
          ],
        },
      }
    : undefined;

  return normalizeAgentObservationV1({
    identity: {
      observationId: `task-run:${taskExecutionId}:${input.runId}`,
      taskExecutionId,
      runId: input.runId,
      taskRunIndex: input.taskRunIndex,
      ...(input.parentObservationId
        ? { parentObservationId: input.parentObservationId }
        : {}),
      ...(input.runtimeSessionId ? { runtimeSessionId: input.runtimeSessionId } : {}),
    },
    kind: 'task_run',
    stage: input.stage,
    status: input.status,
    ...(prompt ? { prompt } : {}),
    ...(usage ? { usage } : {}),
    ...(timing ? { timing } : {}),
    ...(input.quality ? { quality: input.quality } : {}),
    attributes: {
      ...(safeModelId ? { modelId: safeModelId } : {}),
      ...(safeAgentId ? { agentId: safeAgentId } : {}),
      ...(input.usage?.agent_reported_model
        ? { agentReportedModel: input.usage.agent_reported_model }
        : {}),
      ...(input.agentCliVersion ? { agentCliVersion: input.agentCliVersion } : {}),
      ...(input.runtimeCompanionName
        ? { runtimeCompanionName: input.runtimeCompanionName }
        : {}),
      ...(input.runtimeCompanionVersion
        ? { runtimeCompanionVersion: input.runtimeCompanionVersion }
        : {}),
      ...(input.runtimeAdapterVersion
        ? { runtimeAdapterVersion: input.runtimeAdapterVersion }
        : {}),
    },
    limitations: [
      'main_run_host_structured_facts_only',
      ...(!input.taskExecutionId ? ['compatibility_task_identity_from_run_id'] : []),
    ],
  });
}
