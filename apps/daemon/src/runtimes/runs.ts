// @ts-nocheck
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { strategyTaskProvesDelivery, todoSnapshotHasUnfinishedWork } from '@open-design/contracts';
import {
  collectProcessTreePids,
  listProcessSnapshots,
  stopProcesses,
} from '@open-design/platform';
import { normalizeMediaExecutionPolicyForRun } from '../media/policy.js';
import {
  normalizeRunToolBundleForRun,
  summarizeRunToolBundle,
} from '../run-tool-bundle.js';
import { createRunLifecycleTracer } from '../run-lifecycle-tracer.js';
import { projectWorkspaceProvenance } from '../workspace-contract.js';
import { OPEN_DESIGN_PLUGIN_ID } from '../mcp-observability.js';
import {
  scanRunEventsForUsageAnalytics,
  summarizeRunTimingAnalytics,
} from '../run-analytics-observability.js';
import {
  interruptDurableRunAfterDaemonRestart,
  RESTART_ERROR_CODE,
  RESTART_ERROR_MESSAGE,
} from './run-restart-recovery.js';
import {
  beginRunTelemetryDelivery,
  finalizeRunTelemetryDelivery,
  recordRunTelemetryDeliveryAttempt,
} from '../observability/delivery-state.js';
import {
  beginPosthogTerminalDelivery,
  finalizePosthogTerminalDelivery,
  recordIgnoredTerminalClaim,
  terminalLifecycleSnapshot,
  terminalPersistenceErrorType,
} from '../observability/run-terminal-lifecycle.js';
import { normalizeTelemetryAppVersionInfo } from '../app-version.js';

export const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

const RUN_STATE_SCHEMA_VERSION = 1;

const DIAGNOSTIC_SOURCE = 'open-design-daemon';

function availableDiagnostic(value, definition, complete = true, source = DIAGNOSTIC_SOURCE) {
  return {
    state: 'available',
    value,
    evidence: 'computed',
    source,
    complete,
    definition,
  };
}

function missingDiagnostic(missingReason, source = DIAGNOSTIC_SOURCE, state = 'not_collected') {
  return { state, source, missingReason };
}

function optionalDiagnostic(value, definition, complete = true, missingReason = 'upstream_did_not_emit_metric', source = DIAGNOSTIC_SOURCE) {
  return value === undefined
    ? missingDiagnostic(missingReason, source, 'upstream_unavailable')
    : availableDiagnostic(value, definition, complete, source);
}

function summarizeToolEvents(events, complete) {
  const calls = new Map();
  const byName = {};
  for (const record of events) {
    if (record?.event !== 'agent' || !record.data || typeof record.data !== 'object') continue;
    const data = record.data;
    if (data.type === 'tool_use' && typeof data.id === 'string') {
      const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'unknown';
      const startedAt = typeof data.startedAt === 'number' && Number.isFinite(data.startedAt)
        ? data.startedAt
        : record.timestamp;
      calls.set(data.id, { name, startedAt, status: 'unknown' });
      byName[name] = (byName[name] ?? 0) + 1;
    } else if (data.type === 'tool_result' && typeof data.toolUseId === 'string') {
      const call = calls.get(data.toolUseId);
      if (!call) continue;
      call.status = data.isError === true ? 'error' : 'ok';
      if (
        typeof record.timestamp === 'number' &&
        typeof call.startedAt === 'number' &&
        record.timestamp >= call.startedAt
      ) {
        call.durationMs = record.timestamp - call.startedAt;
      }
    }
  }
  let succeeded = 0;
  let failed = 0;
  let unknown = 0;
  let durationMs = 0;
  for (const call of calls.values()) {
    if (call.status === 'ok') succeeded += 1;
    else if (call.status === 'error') failed += 1;
    else unknown += 1;
    if (typeof call.durationMs === 'number') durationMs += call.durationMs;
  }
  return { total: calls.size, succeeded, failed, unknown, durationMs, byName, complete };
}

function percentileNearestRank(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index];
}

function summarizeModelStepEvents(events) {
  const steps = new Map();
  let lifecycleObserved = false;
  let retryCount = 0;
  let fallbackOrdinal = 0;
  for (const record of events) {
    if (record?.event !== 'agent' || !record.data || typeof record.data !== 'object') continue;
    const data = record.data;
    if (data.type !== 'diagnostic') continue;
    if (data.name === 'model_retry') {
      retryCount += 1;
      continue;
    }
    if (data.name !== 'model_step_lifecycle') continue;
    lifecycleObserved = true;
    const messageIndex = Number.isFinite(data.assistantMessageIndex)
      ? data.assistantMessageIndex
      : 'unknown';
    const stepIndex = Number.isFinite(data.stepIndex) ? data.stepIndex : undefined;
    const key = stepIndex === undefined
      ? `fallback-${fallbackOrdinal += 1}`
      : `${messageIndex}:${stepIndex}`;
    const current = steps.get(key) ?? {
      status: 'incomplete',
      startedAtMs: undefined,
      endedAtMs: undefined,
      durationMs: undefined,
      reasoningTokens: undefined,
    };
    if (data.phase === 'start') {
      if (Number.isFinite(data.startedAtMs)) current.startedAtMs = data.startedAtMs;
    } else if (data.phase === 'end') {
      if (Number.isFinite(data.startedAtMs)) current.startedAtMs = data.startedAtMs;
      if (Number.isFinite(data.endedAtMs)) current.endedAtMs = data.endedAtMs;
      const usage = data.usage && typeof data.usage === 'object' ? data.usage : undefined;
      if (Number.isFinite(usage?.reasoningTokens) && usage.reasoningTokens >= 0) {
        current.reasoningTokens = usage.reasoningTokens;
      }
      const preciseDurationBoundary = data.timingEvidence !== 'first_output_fallback';
      if (preciseDurationBoundary && Number.isFinite(data.durationMs) && data.durationMs >= 0) {
        current.durationMs = data.durationMs;
      } else if (
        preciseDurationBoundary &&
        Number.isFinite(current.startedAtMs) &&
        Number.isFinite(current.endedAtMs) &&
        current.endedAtMs >= current.startedAtMs
      ) {
        current.durationMs = current.endedAtMs - current.startedAtMs;
      }
      current.status =
        data.status === 'failed' || data.status === 'cancelled' || data.status === 'completed'
          ? data.status
          : 'incomplete';
    }
    steps.set(key, current);
  }
  const durations = [];
  let completed = 0;
  let failed = 0;
  let cancelled = 0;
  let incomplete = 0;
  let reasoningTokens = 0;
  let reasoningTokenSampleCount = 0;
  for (const step of steps.values()) {
    if (Number.isFinite(step.durationMs) && step.durationMs >= 0) durations.push(step.durationMs);
    if (Number.isFinite(step.reasoningTokens) && step.reasoningTokens >= 0) {
      reasoningTokens += step.reasoningTokens;
      reasoningTokenSampleCount += 1;
    }
    if (step.status === 'completed') completed += 1;
    else if (step.status === 'failed') failed += 1;
    else if (step.status === 'cancelled') cancelled += 1;
    else incomplete += 1;
  }
  const totalDurationMs = durations.reduce((sum, value) => sum + value, 0);
  return {
    lifecycleObserved,
    count: steps.size,
    durations,
    durationSampleCount: durations.length,
    durationComplete: steps.size > 0 && durations.length === steps.size,
    totalDurationMs,
    averageDurationMs: durations.length > 0 ? totalDurationMs / durations.length : undefined,
    p50DurationMs: percentileNearestRank(durations, 0.5),
    p90DurationMs: percentileNearestRank(durations, 0.9),
    maxDurationMs: durations.length > 0 ? Math.max(...durations) : undefined,
    over60sCount: durations.filter((duration) => duration > 60_000).length,
    completed,
    failed,
    cancelled,
    incomplete,
    retryCount,
    // AMR/OpenCode reports provider usage per model step. Summing the unique
    // step records recovers the turn total without treating the values as
    // cumulative snapshots or double-counting repeated lifecycle frames.
    reasoningTokens: reasoningTokenSampleCount > 0 ? reasoningTokens : undefined,
    reasoningTokensComplete: steps.size > 0 && reasoningTokenSampleCount === steps.size,
  };
}

function summarizeAssistantMessageEvents(events) {
  const messages = new Map();
  let lifecycleObserved = false;
  let retryCount = 0;
  let rateLimitedCount = 0;
  let timeoutCount = 0;
  let upstreamErrorCount = 0;
  let provider;
  let model;
  let usageProvider;
  let usageModel;
  let fallbackOrdinal = 0;
  const countErrorClass = (value) => {
    if (value === 'rate_limited') rateLimitedCount += 1;
    else if (value === 'timeout') timeoutCount += 1;
    else if (value === 'upstream_error') upstreamErrorCount += 1;
  };
  for (const record of events) {
    if (record?.event !== 'agent' || !record.data || typeof record.data !== 'object') continue;
    const data = record.data;
    if (data.type === 'usage') {
      if (typeof data.provider === 'string' && data.provider.trim()) {
        usageProvider = data.provider.trim();
      }
      if (typeof data.model === 'string' && data.model.trim()) {
        usageModel = data.model.trim();
      }
      continue;
    }
    if (data.type !== 'diagnostic') continue;
    if (data.name === 'model_retry') {
      retryCount += 1;
      countErrorClass(data.errorClass);
      continue;
    }
    if (data.name !== 'assistant_message_lifecycle') continue;
    lifecycleObserved = true;
    if (typeof data.provider === 'string' && data.provider.trim()) provider = data.provider.trim();
    if (typeof data.model === 'string' && data.model.trim()) model = data.model.trim();
    const messageIndex = Number.isFinite(data.assistantMessageIndex)
      ? data.assistantMessageIndex
      : `fallback-${fallbackOrdinal += 1}`;
    const current = messages.get(messageIndex) ?? {
      status: 'incomplete',
      startedAtMs: undefined,
      endedAtMs: undefined,
      durationMs: undefined,
    };
    if (data.phase === 'start') {
      if (Number.isFinite(data.startedAtMs)) current.startedAtMs = data.startedAtMs;
    } else if (data.phase === 'end') {
      if (Number.isFinite(data.startedAtMs)) current.startedAtMs = data.startedAtMs;
      if (Number.isFinite(data.endedAtMs)) current.endedAtMs = data.endedAtMs;
      if (Number.isFinite(data.durationMs) && data.durationMs >= 0) {
        current.durationMs = data.durationMs;
      } else if (
        Number.isFinite(current.startedAtMs)
        && Number.isFinite(current.endedAtMs)
        && current.endedAtMs >= current.startedAtMs
      ) {
        current.durationMs = current.endedAtMs - current.startedAtMs;
      }
      current.status =
        data.status === 'failed' || data.status === 'cancelled' || data.status === 'completed'
          ? data.status
          : 'incomplete';
      countErrorClass(data.errorClass);
    }
    messages.set(messageIndex, current);
  }
  const durations = [];
  let completed = 0;
  let failed = 0;
  let cancelled = 0;
  let incomplete = 0;
  for (const message of messages.values()) {
    if (Number.isFinite(message.durationMs) && message.durationMs >= 0) durations.push(message.durationMs);
    if (message.status === 'completed') completed += 1;
    else if (message.status === 'failed') failed += 1;
    else if (message.status === 'cancelled') cancelled += 1;
    else incomplete += 1;
  }
  const totalDurationMs = durations.reduce((sum, value) => sum + value, 0);
  return {
    lifecycleObserved,
    count: messages.size,
    durationSampleCount: durations.length,
    durationComplete: messages.size > 0 && durations.length === messages.size,
    totalDurationMs,
    averageDurationMs: durations.length > 0 ? totalDurationMs / durations.length : undefined,
    maxDurationMs: durations.length > 0 ? Math.max(...durations) : undefined,
    completed,
    failed,
    cancelled,
    incomplete,
    retryCount,
    rateLimitedCount,
    timeoutCount,
    upstreamErrorCount,
    provider: provider ?? usageProvider,
    model: model ?? usageModel,
  };
}

function classifyTerminalRunError(run) {
  const value = `${run.errorCode ?? ''} ${run.error ?? ''}`.trim().toLowerCase();
  if (!value) return undefined;
  if (value.includes('429') || value.includes('rate limit') || value.includes('too many requests')) {
    return 'rate_limited';
  }
  if (value.includes('timeout') || value.includes('timed out') || value.includes('deadline exceeded')) {
    return 'timeout';
  }
  if (value.includes('upstream') || value.includes('service unavailable') || value.includes('bad gateway') || value.includes('gateway timeout')) {
    return 'upstream_error';
  }
  return undefined;
}

function buildExecutionDiagnostics(run) {
  if (!TERMINAL_RUN_STATUSES.has(run.status)) return undefined;
  const eventStreamComplete = run.events.length === 0 || run.events[0]?.id === 1;
  const timing = summarizeRunTimingAnalytics({
    runCreatedAt: run.createdAt,
    runUpdatedAt: run.updatedAt,
    analyticsCapturedAt: run.updatedAt,
    ...(run.analyticsTelemetry ? { telemetry: run.analyticsTelemetry } : {}),
    events: run.events,
  });
  const usage = scanRunEventsForUsageAnalytics(run.events, run.model, 0);
  const tools = summarizeToolEvents(run.events, eventStreamComplete);
  const modelSteps = summarizeModelStepEvents(run.events);
  const assistantMessages = summarizeAssistantMessageEvents(run.events);
  const terminalErrorClass = classifyTerminalRunError(run);
  const firstModelEventAt = run.analyticsTelemetry?.firstModelEventAt;
  const agentExecutionDurationMs =
    typeof firstModelEventAt === 'number' && run.updatedAt >= firstModelEventAt
      ? Math.round(run.updatedAt - firstModelEventAt)
      : undefined;
  const eventCompletenessReason = eventStreamComplete
    ? undefined
    : 'run_event_ring_buffer_truncated';
  const toolValue = (value, definition) =>
    eventStreamComplete
      ? availableDiagnostic(value, definition, true)
      : missingDiagnostic(eventCompletenessReason);
  const cacheSource = usage.cache_token_source === 'unavailable'
    ? 'model-provider'
    : 'agent-runtime';
  const cacheMetric = (value, definition) => optionalDiagnostic(
    value,
    definition,
    eventStreamComplete,
    usage.cache_token_source === 'unavailable'
      ? 'model_provider_did_not_return_cache_usage'
      : eventCompletenessReason ?? 'upstream_did_not_emit_metric',
    cacheSource,
  );
  const modelStepMetric = (value, definition, complete = modelSteps.durationComplete) => {
    if (!eventStreamComplete) return missingDiagnostic(eventCompletenessReason, 'agent-runtime');
    if (!modelSteps.lifecycleObserved) {
      return missingDiagnostic('assistant_message_lifecycle_not_exposed_by_runtime', 'agent-runtime');
    }
    return value === undefined
      ? missingDiagnostic('model_step_duration_boundary_incomplete', 'agent-runtime', 'upstream_unavailable')
      : availableDiagnostic(value, definition, complete, 'agent-runtime');
  };
  const percentileMetric = (value, definition, minimumSamples) => {
    if (!eventStreamComplete) return missingDiagnostic(eventCompletenessReason, 'agent-runtime');
    if (!modelSteps.lifecycleObserved) {
      return missingDiagnostic('assistant_message_lifecycle_not_exposed_by_runtime', 'agent-runtime');
    }
    if (modelSteps.durationSampleCount < minimumSamples) {
      return missingDiagnostic(
        `insufficient_model_step_samples_min_${minimumSamples}`,
        'agent-runtime',
        'upstream_unavailable',
      );
    }
    return availableDiagnostic(value, definition, modelSteps.durationComplete, 'agent-runtime');
  };
  const assistantMetric = (value, definition, complete = assistantMessages.durationComplete) => {
    if (!eventStreamComplete) return missingDiagnostic(eventCompletenessReason, 'agent-runtime');
    if (!assistantMessages.lifecycleObserved) {
      return missingDiagnostic('assistant_message_lifecycle_not_exposed_by_runtime', 'agent-runtime');
    }
    return value === undefined
      ? missingDiagnostic('assistant_message_duration_boundary_incomplete', 'agent-runtime', 'upstream_unavailable')
      : availableDiagnostic(value, definition, complete, 'agent-runtime');
  };
  const anomalyMetric = (value, definition) => eventStreamComplete
    ? availableDiagnostic(value, definition, true, 'agent-runtime')
    : missingDiagnostic(eventCompletenessReason, 'agent-runtime');
  const reasoningTokens = usage.thought_tokens ?? modelSteps.reasoningTokens;
  const reasoningTokensComplete = usage.thought_tokens !== undefined
    ? eventStreamComplete
    : eventStreamComplete && modelSteps.reasoningTokensComplete;

  return {
    schemaVersion: 1,
    collectorVersion: 'open-design-execution-diagnostics-v2',
    collectedAt: run.updatedAt,
    eventStreamCompleteness: eventStreamComplete ? 'complete' : 'partial',
    timing: {
      queueDurationMs: optionalDiagnostic(timing.queue_duration_ms, 'run accepted to execution start'),
      promptBuildDurationMs: optionalDiagnostic(timing.prompt_build_duration_ms, 'prompt build start to end'),
      launchPreflightDurationMs: optionalDiagnostic(timing.launch_preflight_duration_ms, 'runtime preflight start to end'),
      processSpawnDurationMs: optionalDiagnostic(timing.process_spawn_duration_ms, 'process spawn start to child ready'),
      stdinWriteDurationMs: optionalDiagnostic(timing.stdin_write_duration_ms, 'prompt stdin write start to end'),
      firstModelEventWaitMs: optionalDiagnostic(timing.time_to_first_model_event_ms, 'execution start to first model event'),
      firstVisibleOutputWaitMs: optionalDiagnostic(timing.time_to_first_visible_output_ms, 'execution start to first visible assistant output'),
      agentExecutionDurationMs: optionalDiagnostic(agentExecutionDurationMs, 'first model event to terminal run state'),
      toolDurationMs: optionalDiagnostic(timing.tool_duration_ms, 'sum of paired tool_use to tool_result intervals', eventStreamComplete, eventCompletenessReason ?? 'no_paired_tool_duration'),
      artifactWriteDurationMs: optionalDiagnostic(timing.artifact_write_duration_ms, 'first observed artifact-write tool interval'),
      totalDurationMs: availableDiagnostic(timing.total_duration_ms, 'run accepted to terminal state'),
      ...(timing.phase_timing_status ? { phaseTimingStatus: timing.phase_timing_status } : {}),
      ...(timing.bottleneck_phase ? { bottleneckPhase: timing.bottleneck_phase } : {}),
    },
    modelSteps: {
      count: modelStepMetric(modelSteps.count, 'unique observed model-step lifecycle records', true),
      totalDurationMs: modelStepMetric(modelSteps.durationSampleCount > 0 ? modelSteps.totalDurationMs : undefined, 'sum of measured model-step durations'),
      averageDurationMs: percentileMetric(modelSteps.averageDurationMs, 'average measured model-step duration; shown with at least 3 samples', 3),
      p50DurationMs: percentileMetric(modelSteps.p50DurationMs, 'nearest-rank p50 measured model-step duration; shown with at least 3 samples', 3),
      p90DurationMs: percentileMetric(modelSteps.p90DurationMs, 'nearest-rank p90 measured model-step duration; shown with at least 10 samples', 10),
      maxDurationMs: modelStepMetric(modelSteps.maxDurationMs, 'maximum measured model-step duration'),
      over60sCount: modelStepMetric(modelSteps.durationSampleCount > 0 ? modelSteps.over60sCount : undefined, 'measured model steps longer than 60 seconds'),
      durationSampleCount: modelStepMetric(modelSteps.durationSampleCount, 'model steps with both start and end timing boundaries', true),
      completed: modelStepMetric(modelSteps.completed, 'model steps ending completed', true),
      failed: modelStepMetric(modelSteps.failed, 'model steps ending failed', true),
      cancelled: modelStepMetric(modelSteps.cancelled, 'model steps ending cancelled', true),
      incomplete: modelStepMetric(modelSteps.incomplete, 'model steps without a terminal lifecycle event', true),
      retryCount: modelStepMetric(modelSteps.retryCount, 'runtime-observed model retry events; retries do not increment model-step count', true),
      reasoningTokens: optionalDiagnostic(reasoningTokens, 'provider-reported reasoning token count summed across unique model steps when turn-level usage is absent', reasoningTokensComplete, 'model_provider_did_not_return_reasoning_tokens', 'model-provider'),
      reasoningDurationMs: missingDiagnostic('reasoning_interval_boundaries_not_exposed_by_runtime', 'agent-runtime'),
    },
    assistantMessages: {
      count: assistantMetric(assistantMessages.count, 'unique observed assistant-message lifecycle records', true),
      totalDurationMs: assistantMetric(assistantMessages.durationSampleCount > 0 ? assistantMessages.totalDurationMs : undefined, 'sum of measured assistant-message durations'),
      averageDurationMs: assistantMetric(assistantMessages.averageDurationMs, 'average measured assistant-message duration'),
      maxDurationMs: assistantMetric(assistantMessages.maxDurationMs, 'maximum measured assistant-message duration'),
      durationSampleCount: assistantMetric(assistantMessages.durationSampleCount, 'assistant messages with both timing boundaries', true),
      completed: assistantMetric(assistantMessages.completed, 'assistant messages ending completed', true),
      failed: assistantMetric(assistantMessages.failed, 'assistant messages ending failed', true),
      cancelled: assistantMetric(assistantMessages.cancelled, 'assistant messages ending cancelled', true),
      incomplete: assistantMetric(assistantMessages.incomplete, 'assistant messages without a terminal lifecycle event', true),
    },
    anomalies: {
      retryCount: anomalyMetric(assistantMessages.retryCount, 'runtime-observed model retry events'),
      rateLimitedCount: anomalyMetric(Math.max(assistantMessages.rateLimitedCount, terminalErrorClass === 'rate_limited' ? 1 : 0), 'runtime-observed 429 or rate-limit events'),
      timeoutCount: anomalyMetric(Math.max(assistantMessages.timeoutCount, terminalErrorClass === 'timeout' ? 1 : 0), 'runtime-observed provider timeout events'),
      upstreamErrorCount: anomalyMetric(Math.max(assistantMessages.upstreamErrorCount, terminalErrorClass === 'upstream_error' ? 1 : 0), 'runtime-observed upstream provider errors'),
    },
    tools: {
      total: toolValue(tools.total, 'count of observed tool_use events'),
      succeeded: toolValue(tools.succeeded, 'tool_result events without isError'),
      failed: toolValue(tools.failed, 'tool_result events with isError'),
      unknown: toolValue(tools.unknown, 'tool_use events without a matching terminal result'),
      durationMs: toolValue(tools.durationMs, 'sum of paired tool_use to tool_result intervals'),
      byName: toolValue(tools.byName, 'tool_use count grouped by redacted tool name'),
    },
    cache: {
      inputTokensEffective: cacheMetric(usage.input_tokens_effective, 'normalized full prompt tokens'),
      cacheReadInputTokens: cacheMetric(usage.cache_read_input_tokens, 'provider-reported cache-read input tokens'),
      cacheCreationInputTokens: cacheMetric(usage.cache_creation_input_tokens, 'provider-reported cache-write input tokens'),
      uncachedInputTokens: cacheMetric(usage.uncached_input_tokens, 'normalized uncached input tokens'),
      cacheHitRatio: cacheMetric(usage.cache_hit_ratio, 'cache read tokens divided by effective input tokens'),
      firstCallInputTokens: cacheMetric(usage.first_call_input_tokens, 'opening model call input tokens'),
      firstCallCacheReadInputTokens: cacheMetric(usage.first_call_cache_read_input_tokens, 'opening model call cache-read tokens'),
      firstCallCacheHitRatio: cacheMetric(usage.first_call_cache_hit_ratio, 'opening model call cache read divided by effective input'),
      stablePromptCacheHit: run.promptCache
        ? availableDiagnostic(Boolean(run.promptCache.hit), 'local stable-prompt hash matched the prior run')
        : missingDiagnostic('stable_prompt_cache_not_enabled'),
      stablePromptCacheMissReason: run.promptCache?.missReason
        ? availableDiagnostic(run.promptCache.missReason, 'local stable-prompt cache miss classification')
        : missingDiagnostic(run.promptCache?.hit ? 'stable_prompt_cache_hit' : 'stable_prompt_cache_not_enabled'),
    },
    environment: {
      agentId: run.agentId
        ? availableDiagnostic(run.agentId, 'requested agent runtime', true, 'agent-runtime')
        : missingDiagnostic('agent_id_not_recorded', 'agent-runtime'),
      provider: assistantMessages.provider
        ? availableDiagnostic(assistantMessages.provider, 'provider id reported by the agent runtime', true, 'agent-runtime')
        : missingDiagnostic('provider_not_reported_by_runtime', 'agent-runtime'),
      requestedModel: run.model
        ? availableDiagnostic(run.model, 'requested model configuration', true, 'agent-runtime')
        : missingDiagnostic('requested_model_not_recorded', 'agent-runtime'),
      resolvedModel: run.resolvedModelId || assistantMessages.model
        ? availableDiagnostic(run.resolvedModelId || assistantMessages.model, 'runtime-resolved model id', true, 'agent-runtime')
        : missingDiagnostic('resolved_model_not_reported', 'agent-runtime'),
      reasoning: run.reasoning
        ? availableDiagnostic(run.reasoning, 'requested reasoning configuration', true, 'agent-runtime')
        : missingDiagnostic('reasoning_configuration_not_recorded', 'agent-runtime'),
      agentCliVersion: run.preflightAgentCliVersion
        ? availableDiagnostic(run.preflightAgentCliVersion, 'runtime CLI version observed during preflight', true, 'agent-runtime')
        : missingDiagnostic('agent_cli_version_not_recorded', 'agent-runtime'),
    },
  };
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(tempPath, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, filePath);
    return { ok: true };
  } catch (error) {
    try { fs.unlinkSync(tempPath); } catch { /* best-effort cleanup */ }
    return { ok: false, errorType: terminalPersistenceErrorType(error) };
  }
}

function durableRunState(run) {
  return {
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    id: run.id,
    projectId: run.projectId,
    conversationId: run.conversationId,
    assistantMessageId: run.assistantMessageId,
    clientRequestId: run.clientRequestId,
    requestFingerprint: run.requestFingerprint,
    ...(run.strategyRolloutDecision
      ? { strategyRolloutDecision: run.strategyRolloutDecision }
      : {}),
    agentId: run.agentId,
    ...(run.appVersionInfo ? { appVersionInfo: run.appVersionInfo } : {}),
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    terminalAt: run.terminalAt ?? null,
    exitCode: run.exitCode,
    signal: run.signal,
    error: run.error,
    errorCode: run.errorCode,
    failureCategory: run.failureCategory ?? null,
    failureDetail: run.failureDetail ?? null,
    failureAction: run.failureAction ?? null,
    cancelOrigin: run.cancelOrigin ?? null,
    terminalTrigger: run.terminalTrigger ?? null,
    resumable: run.resumable ?? false,
    artifactCount: Number.isFinite(run.artifactCount) ? run.artifactCount : 0,
    ...(Array.isArray(run.artifactPaths) ? { artifactPaths: run.artifactPaths } : {}),
    endedWithUnfinishedWork: Boolean(run.endedWithUnfinishedWork),
    ...(typeof run.userPrompt === 'string' ? { userPrompt: run.userPrompt } : {}),
    ...(typeof run.model === 'string' ? { model: run.model } : {}),
    ...(typeof run.resolvedModelId === 'string'
      ? { resolvedModelId: run.resolvedModelId }
      : {}),
    ...(typeof run.preflightAgentCliVersion === 'string'
      ? { preflightAgentCliVersion: run.preflightAgentCliVersion }
      : {}),
    ...(typeof run.reasoning === 'string' ? { reasoning: run.reasoning } : {}),
    ...(typeof run.skillId === 'string' ? { skillId: run.skillId } : {}),
    ...(typeof run.designSystemId === 'string' ? { designSystemId: run.designSystemId } : {}),
    ...(typeof run.designSystemDigest === 'string' ? { designSystemDigest: run.designSystemDigest } : {}),
    ...(typeof run.designSystemSelectionSource === 'string'
      ? { designSystemSelectionSource: run.designSystemSelectionSource }
      : {}),
    ...(typeof run.clientType === 'string' ? { clientType: run.clientType } : {}),
    ...(run.workspaceScope !== undefined ? { workspaceScope: run.workspaceScope } : {}),
    ...(run.analyticsTelemetry ? { analyticsTelemetry: run.analyticsTelemetry } : {}),
    ...(run.promptTelemetry ? { promptTelemetry: run.promptTelemetry } : {}),
    ...(run.promptCache ? { promptCache: run.promptCache } : {}),
    ...(run.analyticsRecovery ? { analyticsRecovery: run.analyticsRecovery } : {}),
    ...(run.externalPluginAnalytics
      ? { externalPluginAnalytics: run.externalPluginAnalytics }
      : {}),
    ...(typeof run.cumulativeRetryAttemptCount === 'number'
      ? { cumulativeRetryAttemptCount: run.cumulativeRetryAttemptCount }
      : {}),
    ...(typeof run.retryAttemptCount === 'number'
      ? { retryAttemptCount: run.retryAttemptCount }
      : {}),
    ...(typeof run.manualResumeAttemptCount === 'number'
      ? { manualResumeAttemptCount: run.manualResumeAttemptCount }
      : {}),
    ...(typeof run.rechargeWaitDurationMs === 'number'
      ? { rechargeWaitDurationMs: run.rechargeWaitDurationMs }
      : {}),
    ...(typeof run.artifactOriginStatus === 'string'
      ? { artifactOriginStatus: run.artifactOriginStatus }
      : {}),
    ...(typeof run.artifactVersionId === 'string'
      ? { artifactVersionId: run.artifactVersionId }
      : {}),
    ...(typeof run.deliverableValid === 'boolean'
      ? { deliverableValid: run.deliverableValid }
      : {}),
    ...(typeof run.deliverableValidation === 'string'
      ? { deliverableValidation: run.deliverableValidation }
      : {}),
    ...(typeof run.deliverableEntryFile === 'string'
      ? { deliverableEntryFile: run.deliverableEntryFile }
      : {}),
    ...(typeof run.deliverableArtifactKind === 'string'
      ? { deliverableArtifactKind: run.deliverableArtifactKind }
      : {}),
    ...(run.strategyTask ? { strategyTask: run.strategyTask } : {}),
    ...(run.odNextTaskInputSnapshot
      ? { odNextTaskInputSnapshot: run.odNextTaskInputSnapshot }
      : {}),
    ...(typeof run.langfuseCompletedAt === 'number'
      ? { langfuseCompletedAt: run.langfuseCompletedAt }
      : {}),
    ...(run.telemetryDelivery ? { telemetryDelivery: run.telemetryDelivery } : {}),
    ...(run.terminalLifecycle ? { terminalLifecycle: run.terminalLifecycle } : {}),
  };
}

function readString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extractErrorDetails(data) {
  const payload = data && typeof data === 'object' ? data : {};
  const nested = payload.error && typeof payload.error === 'object' ? payload.error : {};
  return {
    error: readString(nested.message) ?? readString(payload.message),
    errorCode: readString(nested.code) ?? readString(payload.code),
  };
}

function readDurableRunState(statePath) {
  try {
    const value = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (
      !value
      || typeof value !== 'object'
      || value.schemaVersion !== RUN_STATE_SCHEMA_VERSION
      || typeof value.id !== 'string'
      || typeof value.status !== 'string'
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function readDurableRunEvents(eventsLogPath) {
  try {
    return fs.readFileSync(eventsLogPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((record) =>
        record
        && typeof record === 'object'
        && Number.isFinite(record.id)
        && typeof record.event === 'string');
  } catch {
    return [];
  }
}

export function createChatRunService({
  createSseResponse,
  createSseErrorPayload,
  maxEvents = 2_000,
  ttlMs = 30 * 60 * 1000,
  shutdownGraceMs = 3_000,
  // Absolute directory under which per-run event JSONL logs are written
  // (one file per run at <runsLogDir>/<runId>/events.jsonl). When null,
  // event persistence is disabled and statusBody.eventsLogPath = null —
  // legacy behavior. The path is surfaced through MCP get_run so an
  // external coding agent can `tail` the file in its own shell during
  // a long OD generation, instead of polling blindly and giving up.
  runsLogDir = null,
  // Optional observer invoked for every emitted event BEFORE the in-memory
  // ring buffer is truncated. The daemon uses it to fold committed side
  // effects (tool calls, artifact writes) into a per-run accumulator that
  // outlives buffer truncation. Kept generic here: this service does not
  // interpret event semantics, it just hands each record to the observer.
  onEventEmitted = null,
  // Optional synchronous hook invoked immediately before the single physical
  // terminal transition. The daemon uses this to converge durable logical
  // task state before the `end` event is persisted or published. Keeping the
  // hook here covers startup failures and daemon shutdown in addition to the
  // normal child-close path.
  beforeFinish = null,
  // Optional synchronous terminal hook. It runs after the terminal state is
  // durable but before the terminal SSE event is published, so local outbox
  // writes share the exact terminal timestamp without delaying on delivery.
  onTerminal = null,
  // Snapshot the daemon version at Run creation so a later daemon version
  // cannot rewrite this Run's terminal telemetry during restart recovery.
  getAppVersionInfo = () => null,
  // Test seam for deterministic storage-failure coverage. Production callers
  // use the atomic writer above; the result carries only a bounded error type.
  writeDurableState = atomicWriteJson,
}) {
  const runs = new Map();
  const runIdsByClientRequestId = new Map();
  const runIdsByPluginWorkflowId = new Map();

  const finalizeTerminalLocally = (run, status, terminalAt) => {
    if (!onTerminal) return;
    try {
      onTerminal(run, status, terminalAt);
    } catch (error) {
      console.warn('[runs] terminal local finalizer failed', error);
    }
  };

  const backfillDurableTerminal = (state) => {
    if (!TERMINAL_RUN_STATUSES.has(state?.status)) return;
    const terminalAt = Number.isFinite(state.terminalAt)
      ? state.terminalAt
      : state.updatedAt;
    if (!Number.isFinite(terminalAt)) return;
    finalizeTerminalLocally(state, state.status, terminalAt);
  };

  if (runsLogDir) {
    try {
      for (const entry of fs.readdirSync(runsLogDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const statePath = path.join(runsLogDir, entry.name, 'state.json');
        const state = readDurableRunState(statePath);
        if (!state) continue;
        if (
          typeof state.clientRequestId === 'string'
          && state.clientRequestId
          && typeof state.id === 'string'
        ) {
          runIdsByClientRequestId.set(state.clientRequestId, state.id);
        }
        const pluginWorkflowId =
          state?.externalPluginAnalytics?.externalPluginId
            === OPEN_DESIGN_PLUGIN_ID
          && typeof state.externalPluginAnalytics.pluginWorkflowId === 'string'
            ? state.externalPluginAnalytics.pluginWorkflowId
            : null;
        if (pluginWorkflowId && typeof state.id === 'string') {
          runIdsByPluginWorkflowId.set(pluginWorkflowId, state.id);
        }
      }
    } catch {
      // A fresh data root has no runs directory yet.
    }
  }

  const hydrateDurableRun = (id) => {
    if (!runsLogDir || typeof id !== 'string' || !id) return null;
    const statePath = path.join(runsLogDir, id, 'state.json');
    const state = readDurableRunState(statePath);
    if (!state || state.id !== id) return null;
    const interruptedAfterRestart =
      interruptDurableRunAfterDaemonRestart(state);
    if (interruptedAfterRestart) writeDurableState(statePath, state);
    backfillDurableTerminal(state);
    if (!TERMINAL_RUN_STATUSES.has(state.status)) return null;
    const eventsLogPath = path.join(runsLogDir, id, 'events.jsonl');
    const events = readDurableRunEvents(eventsLogPath);
    if (
      interruptedAfterRestart
      || state.terminalRecoveryReason === 'daemon_restart'
    ) {
      const timestamp = state.terminalAt ?? state.updatedAt;
      const nextEventId =
        events.reduce((max, record) => Math.max(max, record.id), 0) + 1;
      events.push(
        {
          id: nextEventId,
          event: 'error',
          data: {
            error: {
              code: RESTART_ERROR_CODE,
              message: RESTART_ERROR_MESSAGE,
              retryable: true,
            },
          },
          timestamp,
        },
        {
          id: nextEventId + 1,
          event: 'end',
          data: {
            code: 1,
            signal: null,
            status: 'failed',
            terminalAt: timestamp,
            resumable: false,
            endedWithUnfinishedWork: Boolean(state.endedWithUnfinishedWork),
          },
          timestamp,
        },
      );
    }
    const run = {
      ...state,
      projectId: typeof state.projectId === 'string' ? state.projectId : null,
      conversationId: typeof state.conversationId === 'string' ? state.conversationId : null,
      assistantMessageId:
        typeof state.assistantMessageId === 'string' ? state.assistantMessageId : null,
      clientRequestId:
        typeof state.clientRequestId === 'string' ? state.clientRequestId : null,
      requestFingerprint:
        typeof state.requestFingerprint === 'string' ? state.requestFingerprint : null,
      agentId: typeof state.agentId === 'string' ? state.agentId : null,
      projectMetadata: null,
      events,
      nextEventId: events.reduce((max, record) => Math.max(max, record.id), 0) + 1,
      clients: new Set(),
      waiters: new Set(),
      child: null,
      acpSession: null,
      childPid: null,
      processGroupId: null,
      cancelRequested: false,
      cancelOrigin: state.cancelOrigin ?? null,
      terminalTrigger: state.terminalTrigger ?? null,
      eventsLogPath,
      statePath,
      eventsLogStream: null,
      eventsLogClosed: true,
      mediaExecution: normalizeMediaExecutionPolicyForRun(null),
      toolBundle: normalizeRunToolBundleForRun(null),
    };
    runs.set(id, run);
    return run;
  };

  const create = (meta = {}) => {
    const now = Date.now();
    const id = randomUUID();
    let appVersionInfo = null;
    try {
      appVersionInfo = normalizeTelemetryAppVersionInfo(getAppVersionInfo());
    } catch {
      // Version attribution is best-effort; missing is explicit in the
      // durable state instead of persisting a placeholder release number.
    }
    const run = {
      id,
      projectId: typeof meta.projectId === 'string' && meta.projectId ? meta.projectId : null,
      conversationId: typeof meta.conversationId === 'string' && meta.conversationId ? meta.conversationId : null,
      assistantMessageId: typeof meta.assistantMessageId === 'string' && meta.assistantMessageId ? meta.assistantMessageId : null,
      clientRequestId: typeof meta.clientRequestId === 'string' && meta.clientRequestId ? meta.clientRequestId : null,
      requestFingerprint:
        typeof meta.requestFingerprint === 'string' && meta.requestFingerprint
          ? meta.requestFingerprint
          : null,
      strategyRolloutDecision:
        meta.strategyRolloutDecision
        && typeof meta.strategyRolloutDecision === 'object'
        && !Array.isArray(meta.strategyRolloutDecision)
          ? meta.strategyRolloutDecision
          : null,
      agentId: typeof meta.agentId === 'string' && meta.agentId ? meta.agentId : null,
      appVersionInfo,
      projectMetadata:
        meta.projectMetadata && typeof meta.projectMetadata === 'object' && !Array.isArray(meta.projectMetadata)
          ? meta.projectMetadata
          : null,
      workspace: projectWorkspaceProvenance(meta.projectMetadata),
      // Plan §3.A1 / spec §11.5. The applied plugin snapshot id pins
      // every prompt fragment and tool gate to a frozen view so replay
      // is byte-equal across plugin upgrades. Runs are in-memory in
      // v1 — the id lives on the run object plus on the
      // `applied_plugin_snapshots` row (FK back via run_id).
      appliedPluginSnapshotId:
        typeof meta.appliedPluginSnapshotId === 'string' && meta.appliedPluginSnapshotId
          ? meta.appliedPluginSnapshotId
          : null,
      pluginId:
        typeof meta.pluginId === 'string' && meta.pluginId ? meta.pluginId : null,
      mediaExecution: normalizeMediaExecutionPolicyForRun(meta.mediaExecution),
      toolBundle: normalizeRunToolBundleForRun(meta.toolBundle),
      browserUse: meta.browserUse && typeof meta.browserUse === 'object' ? meta.browserUse : null,
      sessionMode:
        meta.sessionMode === 'chat' || meta.sessionMode === 'design' || meta.sessionMode === 'plan'
          ? meta.sessionMode
          : null,
      context:
        meta.context && typeof meta.context === 'object' && !Array.isArray(meta.context)
          ? meta.context
          : null,
      externalPluginAnalytics:
        meta.analyticsHints
        && typeof meta.analyticsHints === 'object'
        && !Array.isArray(meta.analyticsHints)
        && meta.analyticsHints.externalPluginId === OPEN_DESIGN_PLUGIN_ID
          ? {
              entrySurface: meta.analyticsHints.entrySurface,
              hostProduct: meta.analyticsHints.hostProduct,
              externalPluginId: OPEN_DESIGN_PLUGIN_ID,
              externalPluginVersion: meta.analyticsHints.externalPluginVersion,
              distributionMechanism:
                meta.analyticsHints.distributionMechanism,
              publisherClass: meta.analyticsHints.publisherClass,
              attributionQuality: meta.analyticsHints.attributionQuality,
              pluginWorkflowId: meta.analyticsHints.pluginWorkflowId,
              logicalRequestDigest: meta.analyticsHints.logicalRequestDigest,
              logicalRequestDigestVersion:
                meta.analyticsHints.logicalRequestDigestVersion,
              briefState: meta.analyticsHints.briefState,
              generationSloWindowMs:
                meta.analyticsHints.generationSloWindowMs,
            }
          : null,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      terminalAt: null,
      events: [],
      nextEventId: 1,
      clients: new Set(),
      waiters: new Set(),
      child: null,
      acpSession: null,
      childPid: null,
      processGroupId: null,
      childExitObservedAt: null,
      exitCode: null,
      signal: null,
      error: null,
      errorCode: null,
      cancelRequested: false,
      cancelOrigin: null,
      terminalTrigger: null,
      runtimeFailureObservedBeforeCancellation: false,
      retryRestartTimer: null,
      // First failure that triggered a same-run retry. The next attempt creates
      // a fresh startChatRun closure and clears run.error/errorCode, so keep the
      // compact analytics snapshot on the shared run until terminal telemetry.
      retryOriginFailure: null,
      retryOriginErrorCode: null,
      retryStrategy: null,
      retryMaxAttempts: null,
      nativeSessionContinueAttemptCount: 0,
      nativeSessionContinuePending: null,
      stdinOpen: false,
      // E-lite root-cause telemetry. `stdinBackpressure` records whether the
      // prompt write to the child's stdin was queued (pipe buffer full — a
      // corroborating signal for a `stdin_write`-phase stall). `lastAgentActivityAt`
      // is the clock the inactivity watchdog keys off, read at finish to derive
      // `last_progress_age_ms`. (`approval_requested` and `tool_result_sent` are
      // derived from run.events by summarizeRunDiagnosticsForAnalytics.)
      stdinBackpressure: false,
      lastAgentActivityAt: now,
      // Work-completeness signals (#1247 / #1060), folded from agent events by
      // captureRunWorkCompletenessSignals (server.ts). `lastTodoSnapshot` is the
      // most recent TodoWrite `todos` array; `truncatedMidTurn` records a
      // max_tokens cut-off. At terminal time finish() derives
      // `endedWithUnfinishedWork` from them via the canonical predicate.
      lastTodoSnapshot: null,
      truncatedMidTurn: false,
      endedWithUnfinishedWork: false,
      artifactCount: undefined as number | undefined,
      artifactPaths: undefined as string[] | undefined,
      artifactOutcome: undefined,
      eventsLogPath: runsLogDir ? path.join(runsLogDir, id, 'events.jsonl') : null,
      statePath: runsLogDir ? path.join(runsLogDir, id, 'state.json') : null,
      eventsLogStream: null,
      // Set once finish() has closed the log stream, so a late post-finish emit
      // can't lazily re-open a stream nothing will ever close (FD leak).
      eventsLogClosed: false,
      cleanupGeneration: 0,
      cumulativeRetryAttemptCount: 0,
      manualResumeAttemptCount: 0,
      rechargeWaitDurationMs: 0,
    };
    if (
      meta.odNextTaskInputSnapshot
      && typeof meta.odNextTaskInputSnapshot === 'object'
      && !Array.isArray(meta.odNextTaskInputSnapshot)
    ) {
      run.odNextTaskInputSnapshot = meta.odNextTaskInputSnapshot;
    }
    if (Object.prototype.hasOwnProperty.call(meta, 'workspaceScope')) {
      run.workspaceScope = meta.workspaceScope ?? null;
    }
    runs.set(run.id, run);
    if (run.clientRequestId) runIdsByClientRequestId.set(run.clientRequestId, run.id);
    if (
      run.externalPluginAnalytics?.externalPluginId === OPEN_DESIGN_PLUGIN_ID
      && typeof run.externalPluginAnalytics.pluginWorkflowId === 'string'
    ) {
      runIdsByPluginWorkflowId.set(
        run.externalPluginAnalytics.pluginWorkflowId,
        run.id,
      );
    }
    if (run.statePath) writeDurableState(run.statePath, durableRunState(run));
    return run;
  };

  const createOrReuse = (meta = {}) => {
    const clientRequestId =
      typeof meta.clientRequestId === 'string' && meta.clientRequestId
        ? meta.clientRequestId
        : null;
    if (clientRequestId) {
      const existingId = runIdsByClientRequestId.get(clientRequestId);
      const existing = existingId
        ? runs.get(existingId) ?? hydrateDurableRun(existingId)
        : null;
      if (existing) {
        const fingerprint =
          typeof meta.requestFingerprint === 'string' ? meta.requestFingerprint : null;
        if (
          fingerprint
          && typeof existing.requestFingerprint === 'string'
          && existing.requestFingerprint
          && fingerprint !== existing.requestFingerprint
        ) {
          return { kind: 'conflict', run: existing };
        }
        return { kind: 'reused', run: existing };
      }
    }
    return { kind: 'created', run: create(meta) };
  };

  const persistState = (run) => {
    if (!run?.statePath) return { ok: false, errorType: 'storage_unavailable' };
    return writeDurableState(run.statePath, durableRunState(run));
  };

  const persistTerminalState = (run, lifecycleEvidence = run.terminalLifecycle) => {
    const priorTerminalPersistence = lifecycleEvidence?.terminalPersistence;
    const terminalPersistence = run.statePath
      ? { status: 'acknowledged', errorType: null }
      : { status: 'unknown', errorType: null };
    run.terminalLifecycle = terminalLifecycleSnapshot({
      cumulativeRetryAttemptCount: run.cumulativeRetryAttemptCount,
      retryAttemptCount: run.retryAttemptCount,
      manualResumeAttemptCount: run.manualResumeAttemptCount,
      runtimeGenerationId: run.runtimeGenerationId,
      cancelOrigin: run.cancelOrigin ?? null,
      terminalTrigger: run.terminalTrigger ?? null,
      terminalIntegrity:
        lifecycleEvidence?.terminalIntegrity ?? run.terminalIntegrity ?? 'canonical',
      terminalPersistence,
      posthogDelivery: lifecycleEvidence?.posthogDelivery,
      duplicateTerminalCount: lifecycleEvidence?.duplicateTerminalCount,
      lateTerminalCount: lifecycleEvidence?.lateTerminalCount,
    });
    if (!run.statePath) return { ok: false, errorType: 'storage_unavailable' };
    const result = persistState(run);
    if (!result.ok && priorTerminalPersistence?.status !== 'acknowledged') {
      run.terminalLifecycle = terminalLifecycleSnapshot({
        cumulativeRetryAttemptCount: run.cumulativeRetryAttemptCount,
        retryAttemptCount: run.retryAttemptCount,
        manualResumeAttemptCount: run.manualResumeAttemptCount,
        runtimeGenerationId: run.runtimeGenerationId,
        cancelOrigin: run.cancelOrigin ?? null,
        terminalTrigger: run.terminalTrigger ?? null,
        terminalIntegrity:
          run.terminalLifecycle?.terminalIntegrity ?? run.terminalIntegrity ?? 'canonical',
        posthogDelivery: run.terminalLifecycle?.posthogDelivery,
        duplicateTerminalCount: run.terminalLifecycle?.duplicateTerminalCount,
        lateTerminalCount: run.terminalLifecycle?.lateTerminalCount,
        terminalPersistence: {
          status: 'failed',
          errorType: result.errorType ?? 'unknown',
        },
      });
    }
    return result;
  };

  const setAnalyticsRecovery = (run, recovery) => {
    if (!run || !recovery) return;
    run.analyticsRecovery = {
      context: recovery.context,
      properties: recovery.properties,
      insertId: recovery.insertId,
    };
    persistState(run);
  };

  const markAnalyticsCompleted = (run) => {
    if (!run?.analyticsRecovery) return;
    run.analyticsRecovery.completedAt = Date.now();
    persistState(run);
  };

  const beginAnalyticsDelivery = (run) => {
    if (!run?.terminalLifecycle) return null;
    run.terminalLifecycle = beginPosthogTerminalDelivery(run.terminalLifecycle);
    persistState(run);
    return run.terminalLifecycle.posthogDelivery;
  };

  const finalizeAnalyticsDelivery = (run, delivery) => {
    if (!run?.terminalLifecycle || !delivery) return null;
    run.terminalLifecycle = finalizePosthogTerminalDelivery(
      run.terminalLifecycle,
      delivery,
    );
    persistState(run);
    return run.terminalLifecycle.posthogDelivery;
  };

  const beginTelemetryDelivery = (run) => {
    if (!run) return null;
    run.telemetryDelivery = beginRunTelemetryDelivery(
      run.telemetryDelivery,
      run.id,
    );
    persistState(run);
    return run.telemetryDelivery;
  };

  const finalizeTelemetryDelivery = (run, delivery) => {
    if (!run || !delivery) return null;
    run.telemetryDelivery = finalizeRunTelemetryDelivery(
      run.telemetryDelivery,
      run.id,
      delivery,
    );
    if (typeof run.telemetryDelivery.finalizedAt === 'number') {
      run.langfuseCompletedAt = run.telemetryDelivery.finalizedAt;
    } else {
      delete run.langfuseCompletedAt;
    }
    persistState(run);
    return run.telemetryDelivery;
  };

  const recordTelemetryDeliveryAttempt = (run) => {
    if (!run) return null;
    run.telemetryDelivery = recordRunTelemetryDeliveryAttempt(
      run.telemetryDelivery,
      run.id,
    );
    persistState(run);
    return run.telemetryDelivery;
  };

  // Compatibility alias for older in-process callers. New delivery paths use
  // the explicit begin/finalize pair so a daemon crash cannot be confused
  // with a terminal network failure.
  const markLangfuseCompleted = (run) => {
    if (!run) return;
    finalizeTelemetryDelivery(run, {
      langfuse_expected: true,
      langfuse_delivery_status: 'accepted',
      langfuse_attempt_count: 1,
    });
  };

  const setDeliverableValidation = (run, result) => {
    if (!run || !result) return;
    run.deliverableValid = result.valid === true;
    run.deliverableValidation =
      typeof result.validation === 'string' ? result.validation : 'entry_missing';
    run.deliverableEntryFile =
      typeof result.entryFile === 'string' ? result.entryFile : undefined;
    run.deliverableArtifactKind =
      typeof result.artifactKind === 'string' ? result.artifactKind : undefined;
    persistState(run);
  };

  const get = (id) => runs.get(id) ?? hydrateDurableRun(id);
  const findByPluginWorkflowId = (pluginWorkflowId) => {
    if (typeof pluginWorkflowId !== 'string' || !pluginWorkflowId) return null;
    const runId = runIdsByPluginWorkflowId.get(pluginWorkflowId);
    return runId ? get(runId) : null;
  };

  const scheduleCleanup = (run) => {
    const generation = (run.cleanupGeneration ?? 0) + 1;
    run.cleanupGeneration = generation;
    setTimeout(() => {
      if (
        run.cleanupGeneration === generation
        && TERMINAL_RUN_STATUSES.has(run.status)
      ) {
        runs.delete(run.id);
      }
    }, ttlMs).unref?.();
  };

  const prepareRestart = (run) => {
    if (!run || !TERMINAL_RUN_STATUSES.has(run.status)) return null;
    const resumedAt = Date.now();
    const rechargeWaitDurationMs = Math.max(0, resumedAt - run.updatedAt);
    // Invalidate the cleanup timer scheduled for the prior terminal attempt.
    run.cleanupGeneration = (run.cleanupGeneration ?? 0) + 1;
    run.status = 'queued';
    run.updatedAt = resumedAt;
    run.terminalAt = null;
    run.exitCode = null;
    run.signal = null;
    run.error = null;
    run.errorCode = null;
    run.failureCategory = null;
    run.failureDetail = null;
    run.failureAction = null;
    run.resumable = false;
    run.cancelRequested = false;
    run.cancelOrigin = null;
    run.terminalTrigger = null;
    run.runtimeFailureObservedBeforeCancellation = false;
    run.retryRestartTimer = null;
    run.cumulativeRetryAttemptCount = (run.cumulativeRetryAttemptCount ?? 0)
      + (run.retryAttemptCount ?? 0);
    run.retryAttemptCount = 0;
    run.retryFinalResult = undefined;
    run.retrySuppressedReason = undefined;
    run.retryOriginFailure = null;
    run.retryOriginErrorCode = null;
    run.artifactCount = undefined;
    run.artifactPaths = undefined;
    run.artifactOutcome = undefined;
    run.deliverableValid = undefined;
    run.deliverableValidation = undefined;
    run.deliverableEntryFile = undefined;
    run.deliverableArtifactKind = undefined;
    run.endedWithUnfinishedWork = false;
    run.child = null;
    run.acpSession = null;
    run.childPid = null;
    run.processGroupId = null;
    run.childExitObservedAt = null;
    run.stdinOpen = false;
    run.eventsLogStream = null;
    run.eventsLogClosed = false;
    run.runtimeGenerationId = null;
    run.terminalIntegrity = null;
    run.terminalLifecycle = undefined;
    // A resumed attempt is a fresh execution, so it must not inherit the prior
    // attempt's lifecycle marks. Keeping them makes every phase boundary
    // measure from before the recharge pause, putting the wait time inside the
    // new attempt's model-active window. Only the logical run start survives,
    // so queue time is still measured from when the user asked for the run.
    run.analyticsTelemetry = {
      ...(run.analyticsTelemetry?.startRequestedAt !== undefined
        ? { startRequestedAt: run.analyticsTelemetry.startRequestedAt }
        : {}),
      attemptStartedAt: resumedAt,
      attemptIndex: 0,
    };
    run.manualResumeAttemptCount = (run.manualResumeAttemptCount ?? 0) + 1;
    run.rechargeWaitDurationMs =
      (run.rechargeWaitDurationMs ?? 0) + rechargeWaitDurationMs;
    persistState(run);
    emit(run, 'run_resume_attempted', {
      runId: run.id,
      attempt: run.manualResumeAttemptCount,
      reason: 'recharge',
      rechargeWaitDurationMs: run.rechargeWaitDurationMs,
    });
    return run;
  };

  // Lazily open the per-run event log on first emit. The directory may
  // not exist yet; mkdir is recursive so it's safe to call repeatedly.
  // Disk failures are best-effort — if we can't write, the run still
  // proceeds (SSE clients keep getting events from memory).
  const ensureLogStream = (run) => {
    if (!run.eventsLogPath) return null;
    if (run.eventsLogStream) return run.eventsLogStream;
    // finish() has already closed + nulled this run's log stream. Re-opening it
    // here for a late event (async child-close diagnostic, trailing tool
    // callback, telemetry) would leak a file descriptor that nothing ever
    // closes. We gate on the explicit `eventsLogClosed` flag — NOT on terminal
    // status — so finish()'s own `end` emit (which runs while status is already
    // terminal but before the stream is closed) can still open + write + close
    // the log for a run that had no prior events. Late events still reach
    // memory + SSE clients below; we just stop persisting them to the closed
    // log. (#3408 P1 FD-leak fix; cf. #4163.)
    if (run.eventsLogClosed) return null;
    try {
      fs.mkdirSync(path.dirname(run.eventsLogPath), { recursive: true });
      run.eventsLogStream = fs.createWriteStream(run.eventsLogPath, { flags: 'a' });
      // Don't crash the daemon on a stream-level error; just stop
      // trying to use this stream so subsequent emits silently skip.
      run.eventsLogStream.on('error', () => {
        try { run.eventsLogStream?.destroy(); } catch { /* ignore */ }
        run.eventsLogStream = null;
      });
      return run.eventsLogStream;
    } catch {
      return null;
    }
  };

  const emit = (run, event, data, timestamp = Date.now(), persistLifecycle = true) => {
    // Once a terminal verdict is waiting only on process-tree quiescence, the
    // attempt no longer owns transcript or error state. Shutdown bytes and
    // duplicate child callbacks must not overwrite the classified verdict
    // during that bounded window. The termination barrier itself may still
    // publish `termination_failed` evidence before the final `end` event.
    if (run.pendingTerminalFinish && event !== 'diagnostic') return null;
    if (event === 'error') {
      const details = extractErrorDetails(data);
      if (details.error) run.error = details.error;
      if (details.errorCode) run.errorCode = details.errorCode;
    }
    const id = run.nextEventId++;
    const record = { id, event, data, timestamp };
    // Fold committed side effects BEFORE the ring buffer can drop this record,
    // so the finalization-time verdict survives truncation of run.events.
    if (onEventEmitted) {
      try { onEventEmitted(run, record); } catch { /* observer must never break emit */ }
    }
    run.events.push(record);
    if (run.events.length > maxEvents) run.events.splice(0, run.events.length - maxEvents);
    run.updatedAt = timestamp;
    // State writes are synchronous so they survive process termination. Keep
    // them on lifecycle boundaries only: agent/text deltas can arrive many
    // times per second and are already streamed to events.jsonl.
    if (persistLifecycle && (event === 'start' || event === 'error' || event === 'end')) persistState(run);
    const stream = ensureLogStream(run);
    if (stream) {
      try {
        stream.write(JSON.stringify(record) + '\n');
      } catch {
        // Stream-level write errors are caught by the on('error') above;
        // swallowing here keeps the SSE fan-out below from being skipped.
      }
    }
    for (const sse of run.clients) sse.send(event, data, id);
    return record;
  };

  const statusBody = (run) => ({
    id: run.id,
    projectId: run.projectId,
    conversationId: run.conversationId,
    assistantMessageId: run.assistantMessageId,
    clientRequestId: run.clientRequestId ?? null,
    agentId: run.agentId,
    designSystemId: run.designSystemId ?? null,
    designSystemRequestedId: run.designSystemRequestedId ?? null,
    designSystemSelectionSource: run.designSystemSelectionSource ?? null,
    designSystemDigest: run.designSystemDigest ?? null,
    appliedPluginSnapshotId: run.appliedPluginSnapshotId ?? null,
    pluginId: run.pluginId ?? null,
    strategyRolloutDecision: run.strategyRolloutDecision ?? null,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    terminalAt: run.terminalAt ?? null,
    cancelRequested: !!run.cancelRequested,
    cancelOrigin: run.cancelOrigin ?? null,
    terminalTrigger: run.terminalTrigger ?? null,
    childPid: typeof run.child?.pid === 'number' ? run.child.pid : run.childPid ?? null,
    processGroupId: run.processGroupId ?? null,
    childExited: !run.child || run.child.exitCode !== null || run.child.signalCode !== null,
    childExitObservedAt: run.childExitObservedAt ?? null,
    exitCode: run.exitCode,
    signal: run.signal,
    error: run.error ?? null,
    errorCode: run.errorCode ?? null,
    failureCategory: run.failureCategory ?? null,
    failureDetail: run.failureDetail ?? null,
    failureAction: run.failureAction ?? null,
    resumable: run.resumable ?? false,
    endedWithUnfinishedWork: !!run.endedWithUnfinishedWork,
    ...(Number.isFinite(run.artifactCount) ? { artifactCount: run.artifactCount } : {}),
    ...(Array.isArray(run.artifactPaths) ? { artifactPaths: run.artifactPaths } : {}),
    eventsLogPath: run.eventsLogPath ?? null,
    workspace: projectWorkspaceProvenance(run.projectMetadata),
    mediaExecution: run.mediaExecution ?? normalizeMediaExecutionPolicyForRun(null),
    toolBundle: summarizeRunToolBundle(run.toolBundle),
    ...(run.promptCache ? { promptCache: run.promptCache } : {}),
    ...(run.nativeSessionRecovery ? { nativeSessionRecovery: run.nativeSessionRecovery } : {}),
    ...(run.browserUse ? { browserUse: run.browserUse } : {}),
    ...(typeof run.clientType === 'string' ? { clientType: run.clientType } : {}),
    ...(run.externalPluginAnalytics
      ? { externalPluginAnalytics: run.externalPluginAnalytics }
      : {}),
    ...(typeof run.manualResumeAttemptCount === 'number'
      ? { manualResumeAttemptCount: run.manualResumeAttemptCount }
      : {}),
    ...(typeof run.rechargeWaitDurationMs === 'number'
      ? { rechargeWaitDurationMs: run.rechargeWaitDurationMs }
      : {}),
    ...(typeof run.artifactOriginStatus === 'string'
      ? { artifactOriginStatus: run.artifactOriginStatus }
      : {}),
    ...(typeof run.artifactVersionId === 'string'
      ? { artifactVersionId: run.artifactVersionId }
      : {}),
    ...(typeof run.deliverableValid === 'boolean'
      ? { deliverableValid: run.deliverableValid }
      : {}),
    ...(typeof run.deliverableValidation === 'string'
      ? { deliverableValidation: run.deliverableValidation }
      : {}),
    ...(typeof run.deliverableEntryFile === 'string'
      ? { deliverableEntryFile: run.deliverableEntryFile }
      : {}),
    ...(typeof run.deliverableArtifactKind === 'string'
      ? { deliverableArtifactKind: run.deliverableArtifactKind }
      : {}),
    ...(run.strategyTask ? { strategyTask: run.strategyTask } : {}),
    ...(run.terminalLifecycle ? { terminalLifecycle: run.terminalLifecycle } : {}),
    ...(TERMINAL_RUN_STATUSES.has(run.status)
      ? { executionDiagnostics: buildExecutionDiagnostics(run) }
      : {}),
  });

  const commitFinish = (
    run,
    status,
    code: number | null = null,
    signal: string | null = null,
    lifecycleEvidence = null,
  ) => {
    if (TERMINAL_RUN_STATUSES.has(run.status)) return;
    if (beforeFinish) beforeFinish(run, status, code, signal);
    const terminalAt = Date.now();
    run.status = status;
    run.exitCode = code;
    run.signal = signal;
    run.updatedAt = terminalAt;
    run.terminalAt = terminalAt;
    // Derive the work-completeness flag once, at the single terminal choke point,
    // from the signals the agent-event handler folded onto the run. Uses the
    // canonical predicate so it can never diverge from the web chat footer
    // (#1247 / #1060). A truncated turn (max_tokens) counts as unfinished even
    // if the last TodoWrite looked done. Absence of any TodoWrite snapshot keeps
    // the flag false, so a text-only answer stays "Completed".
    //
    // A settled strategy verdict outranks the TodoWrite narration: the task
    // reaches `completed` only once the deliverable was verified on disk, and
    // the agent's own checklist is routinely left with a stale `pending` item.
    // Truncation stays an independent term — a cut-off generation is unfinished
    // whatever verdict was recorded.
    run.endedWithUnfinishedWork =
      Boolean(run.truncatedMidTurn)
      || (!strategyTaskProvesDelivery(run.strategyTask)
        && todoSnapshotHasUnfinishedWork(run.lastTodoSnapshot));
    // Commit the terminal Run snapshot before exposing its terminal event. The
    // optional outbox hook is local-only and synchronous by contract.
    persistTerminalState(run, lifecycleEvidence);
    finalizeTerminalLocally(run, status, terminalAt);
    // Release run-scoped resources the starter registered (e.g. the minted
    // tool-token grant + agent event-sink entries). This runs on EVERY
    // terminal path — including a startup throw that never reached the child
    // lifecycle cleanup — so a failed run can never leave its capability token
    // live for the token TTL. Best-effort + one-shot.
    if (typeof run.onFinalize === 'function') {
      const finalize = run.onFinalize;
      run.onFinalize = null;
      try { finalize(); } catch { /* best-effort */ }
    }
    // Terminal finalizers can add artifact metadata after the authoritative
    // terminal timestamp snapshot. Persist once more before publishing `end`
    // so restart hydration sees the same artifact result as live clients.
    persistTerminalState(run);
    emit(run, 'end', {
      code,
      signal,
      status,
      terminalAt,
      resumable: run.resumable ?? false,
      endedWithUnfinishedWork: run.endedWithUnfinishedWork,
      ...(Number.isFinite(run.artifactCount) ? { artifactCount: run.artifactCount } : {}),
      ...(Array.isArray(run.artifactPaths) ? { artifactPaths: run.artifactPaths } : {}),
      failureCategory: run.failureCategory ?? null,
      failureDetail: run.failureDetail ?? null,
      ...(run.strategyTask ? { strategyTask: run.strategyTask } : {}),
    }, terminalAt, false);
    for (const sse of run.clients) sse.end();
    run.clients.clear();
    for (const waiter of run.waiters) waiter(statusBody(run));
    run.waiters.clear();
    // Close the event log stream now that no more events will be
    // emitted for this run. The file stays on disk for tail/grep.
    try { run.eventsLogStream?.end(); } catch { /* ignore */ }
    run.eventsLogStream = null;
    // Any event emitted after this point must not lazily re-open the log.
    run.eventsLogClosed = true;
    scheduleCleanup(run);
  };

  // A run may reach its logical verdict before the attempt's complete process
  // tree is quiet. Keep the public status/SSE/analytics terminal behind every
  // registered teardown barrier: `run_finished` is a claim that this run can no
  // longer produce model traffic, not merely that its direct child emitted
  // `close`. The first verdict owns the terminal fields; duplicate close/error
  // paths wait on the same pending finish instead of publishing twice.
  const finish = (run, status, code: number | null = null, signal: string | null = null) => {
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      if (run.terminalLifecycle) {
        const kind = run.status === status
          && (run.exitCode ?? null) === code
          && (run.signal ?? null) === signal
          ? 'duplicate'
          : 'late';
        run.terminalLifecycle = recordIgnoredTerminalClaim(run.terminalLifecycle, kind);
        persistState(run);
      }
      return;
    }
    if (run.pendingTerminalFinish) {
      const pending = run.pendingTerminalFinish;
      const kind = pending.status === status
        && (pending.code ?? null) === code
        && (pending.signal ?? null) === signal
        ? 'duplicate'
        : 'late';
      pending.lifecycle = recordIgnoredTerminalClaim(pending.lifecycle, kind);
      return;
    }
    if ((run.processTreeTerminationPending ?? 0) > 0) {
      run.pendingTerminalFinish = {
        status,
        code,
        signal,
        lifecycle: terminalLifecycleSnapshot({
          cumulativeRetryAttemptCount: run.cumulativeRetryAttemptCount,
          retryAttemptCount: run.retryAttemptCount,
          manualResumeAttemptCount: run.manualResumeAttemptCount,
          runtimeGenerationId: run.runtimeGenerationId,
          cancelOrigin: run.cancelOrigin ?? null,
          terminalTrigger: run.terminalTrigger ?? null,
          terminalIntegrity: run.terminalIntegrity ?? 'canonical',
          terminalPersistence: {
            status: 'unknown',
            errorType: null,
          },
        }),
      };
      return;
    }
    commitFinish(run, status, code, signal);
  };

  const fail = (run, code, message, init = {}) => {
    emit(run, 'error', createSseErrorPayload(code, message, init));
    finish(run, 'failed', 1, null);
  };

  const start = (run, starter) => {
    createRunLifecycleTracer(run).mark('start_requested');
    void starter(run).catch((err) => {
      fail(run, 'AGENT_EXECUTION_FAILED', err instanceof Error ? err.message : String(err));
    });
    return run;
  };

  const stream = (run, req, res) => {
    const sse = createSseResponse(res);
    const lastEventId = Number(req.get('Last-Event-ID') || req.query.after || 0);
    let sent = 0;
    for (const record of run.events) {
      if (!Number.isFinite(lastEventId) || record.id > lastEventId) {
        sse.send(record.event, record.data, record.id);
        sent++;
      }
    }
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      // Guarantee a reattaching client sees a terminal signal even if its
      // cursor is at or past the final event id — otherwise the SSE
      // stream ends silently and the client falls back to status-only fetch.
      if (sent === 0 && run.events.length > 0) {
        const last = run.events[run.events.length - 1];
        sse.send(last.event, last.data, last.id);
      }
      sse.end();
      return;
    }
    run.clients.add(sse);
    res.on('close', () => {
      run.clients.delete(sse);
      sse.cleanup();
    });
  };

  const list = ({ projectId, conversationId, status } = {}) => Array.from(runs.values()).filter((run) => {
    if (typeof projectId === 'string' && projectId && run.projectId !== projectId) return false;
    if (typeof conversationId === 'string' && conversationId && run.conversationId !== conversationId) return false;
    if (status === 'active') return !TERMINAL_RUN_STATUSES.has(run.status);
    if (typeof status === 'string' && status) return run.status === status;
    return true;
  });

  const childHasExited = (child) => !child || child.exitCode !== null || child.signalCode !== null;

  const recordChildExitObserved = (run) => {
    if (!run.childExitObservedAt) run.childExitObservedAt = Date.now();
  };

  const waitForChildExit = (child, timeoutMs, { closeOnly = false } = {}) => {
    if (!child) return Promise.resolve(true);
    if (!closeOnly && childHasExited(child)) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const done = (exited) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.off?.('close', onClose);
        if (!closeOnly) child.off?.('exit', onClose);
        resolve(exited);
      };
      const onClose = () => done(true);
      const timer = setTimeout(() => done(false), timeoutMs);
      timer.unref?.();
      child.once?.('close', onClose);
      if (!closeOnly) child.once?.('exit', onClose);
    });
  };

  const forceWaitMs = () => {
    const raw = Number(process.env.OD_CHAT_RUN_CANCEL_FORCE_WAIT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 500;
  };

  // Signal an EXPLICIT child + its captured process group, rather than
  // whatever currently occupies `run.child`. Escalation timers (SIGTERM ->
  // SIGKILL) that outlive a same-run retry MUST target the exact generation
  // they were scheduled for: after a retry swaps `run.child` to a fresh
  // child, signalling the shared field would kill the healthy new attempt and
  // leave the stalled old child unreaped. Callers that legitimately want the
  // current child use `killChild` below.
  const signalChildProcess = (child, processGroupId, signal) => {
    if (!child || childHasExited(child)) return false;
    if (process.platform !== 'win32' && Number.isInteger(processGroupId)) {
      try {
        process.kill(-processGroupId, signal);
        return true;
      } catch (err) {
        if (err?.code !== 'ESRCH') {
          // Fall through to the direct child signal path below. This keeps
          // cancellation working if the child was not spawned as a process
          // group leader for any reason.
        }
      }
    }
    try {
      return child.kill(signal);
    } catch {
      return false;
    }
  };

  const killChild = (run, signal) => {
    if (signalChildProcess(run.child, run.processGroupId, signal)) return true;
    // The direct child has already exited, but its process group can still hold
    // survivors — grandchildren that inherited its stdio outlive it. Reap them by
    // pgid so cancel/shutdown don't leave orphans (the same class the retry
    // teardown reaps). Safe here: every killChild caller is a terminating path
    // (cancel / shutdownActive) that never re-spawns into this pgid, so there is
    // no next-generation group to mis-target (cf. #5202).
    return signalProcessGroup(run.processGroupId, signal);
  };

  const cancelGraceMs = () => {
    const raw = Number(process.env.OD_CHAT_RUN_CANCEL_GRACE_MS || process.env.OD_CHAT_RUN_SHUTDOWN_GRACE_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 3000;
  };

  // Signal a whole process group by pgid, even after the direct child object has
  // already exited. A CLI's spawned descendants (MCP servers, tool subprocesses,
  // internal runners) share the attempt's process group and outlive the direct
  // child; reaping them requires targeting the group, not the child. Kept
  // deliberately SEPARATE from signalChildProcess so the shared cancel/escalation
  // path keeps its childHasExited guard against the cross-generation kill fixed
  // in #5202. Returns true when a group signal was actually attempted (POSIX +
  // a valid pgid), false when not applicable (win32 / no pgid).
  const signalProcessGroup = (processGroupId, signal) => {
    if (process.platform === 'win32' || !Number.isInteger(processGroupId)) return false;
    try {
      process.kill(-processGroupId, signal);
    } catch {
      // ESRCH (group already gone) or EPERM — nothing more we can do; the group
      // signal was still the right action to take.
    }
    return true;
  };

  const processGroupIsAlive = (processGroupId) => {
    if (process.platform === 'win32' || !Number.isInteger(processGroupId)) return false;
    try {
      process.kill(-processGroupId, 0);
      return true;
    } catch (err) {
      return err?.code !== 'ESRCH';
    }
  };

  const waitForProcessGroupExit = async (processGroupId, timeoutMs) => {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (Date.now() < deadline) {
      if (!processGroupIsAlive(processGroupId)) return true;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return !processGroupIsAlive(processGroupId);
  };

  /**
   * Terminate one captured attempt's complete process ownership boundary and
   * register it as a terminal-publication barrier on the logical run.
   *
   * POSIX agents are spawned as process-group leaders, so pgid signalling also
   * catches descendants created after teardown starts. Windows has no matching
   * group primitive here; reuse the platform package's process-tree snapshot +
   * bounded SIGTERM/SIGKILL escalation while the direct child is still alive.
   * The captured child/pgid key makes repeated verdict/close callbacks
   * idempotent and prevents a retry generation from targeting its successor.
   */
  const terminateProcessTree = (run, child, processGroupId, {
    gracefulWaitMs = 0,
    termGraceMs = cancelGraceMs(),
    killGraceMs = forceWaitMs(),
    reason = 'run_terminal',
  } = {}) => {
    const key = child ?? processGroupId;
    run.processTreeTerminations ??= new Map();
    if (key != null && run.processTreeTerminations.has(key)) {
      return run.processTreeTerminations.get(key);
    }

    run.processTreeTerminationPending = (run.processTreeTerminationPending ?? 0) + 1;
    const task = (async () => {
      if (process.platform !== 'win32' && Number.isInteger(processGroupId)) {
        if (!processGroupIsAlive(processGroupId)) {
          return { quiescent: true, forced: false, remainingPids: [] };
        }
        if (
          gracefulWaitMs > 0
          && await waitForProcessGroupExit(processGroupId, gracefulWaitMs)
        ) {
          return { quiescent: true, forced: false, remainingPids: [] };
        }
        if (gracefulWaitMs > 0) closeRunStdin(run);
        signalProcessGroup(processGroupId, 'SIGTERM');
        if (await waitForProcessGroupExit(processGroupId, termGraceMs)) {
          return { quiescent: true, forced: false, remainingPids: [] };
        }
        signalProcessGroup(processGroupId, 'SIGKILL');
        const quiescent = await waitForProcessGroupExit(processGroupId, killGraceMs);
        return {
          quiescent,
          forced: true,
          remainingPids: quiescent ? [] : [processGroupId],
        };
      }

      if (!Number.isInteger(child?.pid)) {
        if (
          gracefulWaitMs > 0
          && await waitForChildExit(child, gracefulWaitMs)
        ) {
          return { quiescent: true, forced: false, remainingPids: [] };
        }
        if (gracefulWaitMs > 0) closeRunStdin(run);
        signalChildProcess(child, null, 'SIGTERM');
        if (await waitForChildExit(child, termGraceMs)) {
          return { quiescent: true, forced: false, remainingPids: [] };
        }
        signalChildProcess(child, null, 'SIGKILL');
        const quiescent = await waitForChildExit(child, killGraceMs);
        return {
          quiescent,
          forced: true,
          remainingPids: [],
        };
      }

      const initialSnapshots = await listProcessSnapshots();
      let enumerationVerified = initialSnapshots.length > 0;
      let childExitedDuringGrace = childHasExited(child);
      if (gracefulWaitMs > 0) {
        childExitedDuringGrace = await waitForChildExit(child, gracefulWaitMs);
        if (!childExitedDuringGrace) closeRunStdin(run);
      }
      const refreshedSnapshots = await listProcessSnapshots();
      enumerationVerified &&= refreshedSnapshots.length > 0;
      const snapshots = [...initialSnapshots, ...refreshedSnapshots];
      const pids = collectProcessTreePids(snapshots, [child.pid])
        .filter((pid) => !childExitedDuringGrace || pid !== child.pid);
      const terminationPids = pids.length > 0 || childExitedDuringGrace
        ? pids
        : [child.pid];
      const result = await stopProcesses(terminationPids, { termGraceMs, killGraceMs });

      const verificationSnapshots = await listProcessSnapshots();
      enumerationVerified &&= verificationSnapshots.length > 0;
      const livePids = new Set(verificationSnapshots.map((snapshot) => snapshot.pid));
      let remainingPids = collectProcessTreePids(
        [...snapshots, ...verificationSnapshots],
        [child.pid, ...pids],
      ).filter((pid) => livePids.has(pid));
      let forcedPids = result.forcedPids;

      // A wrapper may create one last descendant while handling SIGTERM. Reap
      // anything the post-escalation verification newly attaches to the
      // captured ownership tree, then verify once more before terminalizing.
      if (enumerationVerified && remainingPids.length > 0) {
        const followUp = await stopProcesses(remainingPids, {
          termGraceMs: 0,
          killGraceMs,
        });
        forcedPids = [...new Set([...forcedPids, ...followUp.forcedPids])];
        const finalSnapshots = await listProcessSnapshots();
        enumerationVerified &&= finalSnapshots.length > 0;
        const finalLivePids = new Set(finalSnapshots.map((snapshot) => snapshot.pid));
        remainingPids = collectProcessTreePids(
          [...snapshots, ...verificationSnapshots, ...finalSnapshots],
          [...pids, ...remainingPids],
        ).filter((pid) => finalLivePids.has(pid));
      }
      return {
        quiescent: enumerationVerified && remainingPids.length === 0,
        forced: forcedPids.length > 0,
        remainingPids,
        ...(!enumerationVerified ? { error: 'process enumeration unavailable' } : {}),
      };
    })().catch((error) => ({
      quiescent: false,
      forced: false,
      remainingPids: [],
      error: error instanceof Error ? error.message : String(error),
    })).then((result) => {
      if (!result.quiescent) {
        emit(run, 'diagnostic', {
          type: 'termination_failed',
          reason,
          child_pid: child?.pid ?? null,
          process_group_id: processGroupId ?? null,
          remaining_pids: result.remainingPids,
          ...(result.error ? { error: result.error } : {}),
        });
      }
      return result;
    }).finally(() => {
      run.processTreeTerminationPending = Math.max(
        0,
        (run.processTreeTerminationPending ?? 1) - 1,
      );
      if (run.processTreeTerminationPending === 0 && run.pendingTerminalFinish) {
        const pending = run.pendingTerminalFinish;
        run.pendingTerminalFinish = null;
        commitFinish(
          run,
          pending.status,
          pending.code,
          pending.signal,
          pending.lifecycle,
        );
      }
    });

    if (key != null) run.processTreeTerminations.set(key, task);
    return task;
  };

  // Reap a torn-down attempt's whole process group: SIGTERM now, then SIGKILL any
  // survivors after the grace window. Both target the CAPTURED pgid passed in —
  // callers must snapshot run.processGroupId before a same-run retry overwrites
  // it, so the escalation can never hit the next attempt's group (#5202). Returns
  // whether the group path handled it (so callers can fall back on win32).
  const reapProcessGroup = (processGroupId) => {
    if (!signalProcessGroup(processGroupId, 'SIGTERM')) return false;
    const timer = setTimeout(() => {
      signalProcessGroup(processGroupId, 'SIGKILL');
    }, cancelGraceMs());
    timer.unref?.();
    return true;
  };

  const finishCanceledFromChildState = (run, fallbackSignal = 'SIGTERM') => {
    const child = run.child;
    if (childHasExited(child)) recordChildExitObserved(run);
    finish(
      run,
      'canceled',
      child?.exitCode ?? null,
      child?.signalCode ?? fallbackSignal,
    );
    return statusBody(run);
  };

  const closeRunStdin = (run) => {
    if (!run?.stdinOpen) return;
    const stdin = run.child?.stdin;
    if (stdin && !stdin.destroyed) {
      try {
        stdin.end();
      } catch {
        // Best-effort: cancellation still falls back to process signals below.
      }
    }
    run.stdinOpen = false;
  };

  // A same-run retry can be waiting out its backoff window (server.ts
  // scheduleRetryRestart). Cancellation/shutdown must drop that pending restart
  // so a cancelled run is not resurrected after the timer fires.
  const clearPendingRetryRestart = (run) => {
    if (run?.retryRestartTimer) {
      clearTimeout(run.retryRestartTimer);
      run.retryRestartTimer = null;
    }
  };

  const cancel = async (run, origin = 'unknown') => {
    if (TERMINAL_RUN_STATUSES.has(run.status)) return statusBody(run);
    run.cancelRequested = true;
    run.cancelOrigin = origin;
    run.updatedAt = Date.now();
    clearPendingRetryRestart(run);
    if (!run.child) {
      closeRunStdin(run);
      finish(run, 'canceled', null, 'SIGTERM');
      return statusBody(run);
    }

    const targetChild = run.child;
    const targetProcessGroupId = run.processGroupId;

    // Prefer RPC-level abort for agents that support it (pi, ACP adapters).
    // If the adapter does not exit within its grace window, fall back to
    // process signals and finally SIGKILL the process group.
    if (run.acpSession?.abort) {
      const graceMs = Number(process.env.PI_ABORT_GRACE_MS) || 3000;
      try {
        run.acpSession.abort();
      } catch {
        // Signal fallback below owns eventual process termination.
      }
      const termination = terminateProcessTree(
        run,
        targetChild,
        targetProcessGroupId,
        {
          gracefulWaitMs: graceMs,
          termGraceMs: graceMs,
          killGraceMs: forceWaitMs(),
          reason: 'run_cancel',
        },
      );
      const terminationResult = await termination;
      return finishCanceledFromChildState(run, terminationResult.forced ? 'SIGKILL' : 'SIGTERM');
    }

    closeRunStdin(run);
    const termination = await terminateProcessTree(
      run,
      targetChild,
      targetProcessGroupId,
      {
        termGraceMs: cancelGraceMs(),
        killGraceMs: forceWaitMs(),
        reason: 'run_cancel',
      },
    );
    return finishCanceledFromChildState(run, termination.forced ? 'SIGKILL' : 'SIGTERM');
  };

  const shutdownActive = async ({ graceMs = shutdownGraceMs } = {}) => {
    const activeRuns = Array.from(runs.values()).filter((run) => !TERMINAL_RUN_STATUSES.has(run.status));
    await Promise.all(activeRuns.map(async (run) => {
      run.cancelRequested = true;
      run.cancelOrigin = 'daemon_shutdown';
      run.updatedAt = Date.now();
      clearPendingRetryRestart(run);
      const termination = terminateProcessTree(
        run,
        run.child,
        run.processGroupId,
        {
          gracefulWaitMs: graceMs,
          termGraceMs: graceMs,
          killGraceMs: 500,
          reason: 'daemon_shutdown',
        },
      );
      if (run.acpSession?.abort) {
        try {
          run.acpSession.abort();
        } catch {
          // Process signals below are the shutdown fallback.
        }
      }
      closeRunStdin(run);
      const terminationResult = await termination;
      finish(run, 'canceled', null, terminationResult.forced ? 'SIGKILL' : 'SIGTERM');
    }));
  };

  const wait = (run) => {
    if (TERMINAL_RUN_STATUSES.has(run.status)) return Promise.resolve(statusBody(run));
    return new Promise((resolve) => run.waiters.add(resolve));
  };

  // Drop a run from the in-memory registry without emitting any terminal
  // event. Used by callers that prepared a run optimistically (created the
  // record before some external precondition was checked) and need to undo
  // the create without surfacing the run via `/api/runs`. Only valid before
  // the run reaches a terminal status — terminal runs use scheduleCleanup
  // and would already have notified any subscribers.
  const drop = (run) => {
    if (!run) return;
    if (TERMINAL_RUN_STATUSES.has(run.status)) return;
    if (typeof run.onFinalize === 'function') {
      const finalize = run.onFinalize;
      run.onFinalize = null;
      try { finalize(); } catch { /* best-effort */ }
    }
    runs.delete(run.id);
    if (
      run.clientRequestId
      && runIdsByClientRequestId.get(run.clientRequestId) === run.id
    ) {
      runIdsByClientRequestId.delete(run.clientRequestId);
    }
    const pluginWorkflowId =
      run.externalPluginAnalytics?.externalPluginId === OPEN_DESIGN_PLUGIN_ID
      && typeof run.externalPluginAnalytics.pluginWorkflowId === 'string'
        ? run.externalPluginAnalytics.pluginWorkflowId
        : null;
    if (
      pluginWorkflowId
      && runIdsByPluginWorkflowId.get(pluginWorkflowId) === run.id
    ) {
      runIdsByPluginWorkflowId.delete(pluginWorkflowId);
    }
    if (run.statePath) {
      try { fs.unlinkSync(run.statePath); } catch { /* best-effort */ }
    }
    for (const sse of run.clients) {
      try { sse.end(); } catch { /* best-effort detach */ }
    }
    run.clients.clear();
    // Resolve any pending waiters with a synthetic "canceled" status so
    // they unblock instead of hanging forever — the run is being dropped
    // because nothing will ever start.
    run.status = 'canceled';
    run.updatedAt = Date.now();
    for (const waiter of run.waiters) waiter(statusBody(run));
    run.waiters.clear();
  };

  return {
    create,
    createOrReuse,
    prepareRestart,
    start,
    get,
    findByPluginWorkflowId,
    list,
    stream,
    cancel,
    shutdownActive,
    wait,
    emit,
    persistState,
    setAnalyticsRecovery,
    beginAnalyticsDelivery,
    finalizeAnalyticsDelivery,
    markAnalyticsCompleted,
    beginTelemetryDelivery,
    recordTelemetryDeliveryAttempt,
    finalizeTelemetryDelivery,
    markLangfuseCompleted,
    setDeliverableValidation,
    finish,
    fail,
    drop,
    signalChild: killChild,
    reapProcessGroup,
    terminateProcessTree,
    signalProcessGroup,
    statusBody,
    signalChildProcess,
    isTerminal(status) {
      return TERMINAL_RUN_STATUSES.has(status);
    },
  };
}
