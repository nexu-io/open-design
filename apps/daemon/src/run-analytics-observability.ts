import type {
  TrackingArtifactWriteSource,
  TrackingArtifactWriteStatus,
  TrackingFirstModelEventType,
  TrackingRunLifecyclePhase,
  TrackingRunPhaseTimingStatus,
  TrackingRuntimeType,
} from '@open-design/contracts/analytics';
import type { VelaLoginStatus } from './integrations/vela.js';

const RUNTIME_TYPES: readonly TrackingRuntimeType[] = [
  'amr_cloud',
  'byok',
  'local_cli',
  'none',
];

// Resolve the `runtime_type` to stamp on daemon-emitted run_created /
// run_finished. The daemon derives a best-effort value from the run's agent +
// AMR sign-in, but it can never observe a saved BYOK key (those live only in
// the web client), so a BYOK run looks like local_cli/amr_cloud server-side.
// The web client passes the true runtime for the run it launched as a request
// hint; a valid hint wins. Anything outside the closed runtime set (missing,
// malformed) falls back to the daemon's own derivation.
export function runtimeTypeForRunAnalytics(args: {
  derived: TrackingRuntimeType;
  hint?: unknown;
}): TrackingRuntimeType {
  if (
    typeof args.hint === 'string' &&
    (RUNTIME_TYPES as readonly string[]).includes(args.hint)
  ) {
    return args.hint as TrackingRuntimeType;
  }
  return args.derived;
}

// AMR account id stamp for daemon-emitted run events. Browser captures get
// `user_id` from the PostHog super-property register (analytics/client.ts);
// daemon-side run_created/run_finished must stamp it at capture time or the
// highest-value generation events stay unjoinable against the AMR project's
// `app_user_id`. Env-configured auth (VELA_RUNTIME_KEY/VELA_LINK_URL) is
// authorized but carries no profile, so it yields no stamp — only
// file-backed sign-in knows the account id.
export function amrUserIdForRunAnalytics(
  status: VelaLoginStatus | null,
): Record<string, string> {
  if (status?.loggedIn !== true) return {};
  const id = status.user?.id?.trim() ?? '';
  return id ? { user_id: id } : {};
}

export interface RunEventForAnalyticsObservability {
  id?: number;
  event: string;
  data: unknown;
  timestamp?: number;
}

export interface RunTelemetryTimestamps {
  startRequestedAt?: number;
  startChatRunStartedAt?: number;
  promptBuildStartAt?: number;
  promptBuildEndAt?: number;
  launchPreflightStartAt?: number;
  launchPreflightEndAt?: number;
  processSpawnStartedAt?: number;
  processSpawnedAt?: number;
  // Subsegment boundaries inside `processSpawnedAt -> firstTokenAt`. The
  // markers are keyed by runtime family (see `noteCliReadyAt` /
  // `noteSessionInitDoneAt` in server.ts and the ACP callbacks): `cliReadyAt`
  // is the first well-formed adapter output (first JSONL line / first ACP
  // JSON-RPC message / first decoded stream event / first non-empty stdout
  // chunk), and `sessionInitDoneAt` is the resume/`session/new` ack for ACP or
  // the first model-bound request for stream agents. Either may be absent when
  // its declared marker cannot be observed; the unattributed time then rolls
  // into `spawn_to_first_token_remainder_ms`.
  cliReadyAt?: number;
  sessionInitDoneAt?: number;
  modelCallStartAt?: number;
  stdinWriteStartAt?: number;
  stdinWriteEndAt?: number;
  firstModelEventAt?: number;
  firstModelEventType?: TrackingFirstModelEventType;
  firstTokenAt?: number;
  firstVisibleOutputAt?: number;
  firstArtifactWriteAt?: number;
  finalizeStartAt?: number;
  attemptIndex?: number;
  attemptStartedAt?: number;
}

export interface RunUsageAnalytics {
  input_tokens?: number;
  input_tokens_provider?: number;
  input_tokens_effective?: number;
  output_tokens?: number;
  total_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  uncached_input_tokens?: number;
  estimated_context_tokens?: number;
  cache_hit_ratio?: number;
  // The turn's FIRST model call (forward scan), as opposed to the fields above
  // which reflect the LAST usage event (reverse scan). The first call is the
  // session-reuse signal: for per-call-usage agents (claude / opencode /
  // codebuddy / pi) it is the turn's opening request, whose cached input shows
  // whether the resumed session's prior context was reused. The last/aggregate
  // call is saturated by within-turn prefix caching and masks the resume win.
  // (codex emits only a cumulative `turn.completed` usage, so its first-call
  // number is sourced from the rollout separately, not from these stream fields.)
  first_call_input_tokens?: number;
  first_call_cache_read_input_tokens?: number;
  first_call_cache_hit_ratio?: number;
  cache_token_source: 'anthropic' | 'openai' | 'unavailable';
  token_count_source: 'provider_usage' | 'estimated' | 'unknown';
  agent_reported_model: string | null;
}

export interface RunTimingAnalytics {
  queue_duration_ms?: number;
  pre_spawn_duration_ms?: number;
  prompt_build_duration_ms?: number;
  launch_preflight_duration_ms?: number;
  process_spawn_duration_ms?: number;
  stdin_write_duration_ms?: number;
  time_to_first_model_event_ms?: number;
  first_model_event_type?: TrackingFirstModelEventType;
  time_to_first_token_ms?: number;
  time_to_first_visible_output_ms?: number;
  runtime_init_to_first_token_ms?: number;
  spawn_to_first_token_ms?: number;
  time_to_first_artifact_ms?: number;
  // `spawn_to_first_token_ms` split into auditable subsegments. By construction
  // `cli_ready_ms + session_init_ms + model_first_token_ms +
  // spawn_to_first_token_remainder_ms === spawn_to_first_token_ms` (absent
  // subsegments count as 0 and their time falls into the remainder).
  cli_ready_ms?: number;
  session_init_ms?: number;
  model_first_token_ms?: number;
  spawn_to_first_token_remainder_ms?: number;
  generation_duration_ms?: number;
  tool_call_count: number;
  tool_duration_ms?: number;
  artifact_write_duration_ms?: number;
  artifact_write_status?: TrackingArtifactWriteStatus;
  artifact_write_source?: TrackingArtifactWriteSource;
  finalize_duration_ms?: number;
  total_duration_ms: number;
  bottleneck_phase?: TrackingRunLifecyclePhase;
  last_observed_phase?: TrackingRunLifecyclePhase;
  phase_timing_status?: TrackingRunPhaseTimingStatus;
  attempt_index?: number;
  attempt_duration_ms?: number;
  attempt_time_to_first_token_ms?: number;
  attempt_terminal_phase?: TrackingRunLifecyclePhase;
}

export function hasExplicitRequestedModelForAnalytics(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const model = value.trim();
  return model.length > 0 && model !== 'default';
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function readNestedNumber(
  value: Record<string, unknown>,
  path: string[],
): number | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return readNumber(current);
}

function firstNumber(
  value: Record<string, unknown>,
  keys: string[],
  nested: string[][] = [],
): number | undefined {
  for (const key of keys) {
    const direct = readNumber(value[key]);
    if (direct !== undefined) return direct;
  }
  for (const path of nested) {
    const found = readNestedNumber(value, path);
    if (found !== undefined) return found;
  }
  return undefined;
}

function durationBetween(
  start: number | undefined,
  end: number | undefined,
): number | undefined {
  if (start === undefined || end === undefined) return undefined;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  if (end < start) return undefined;
  return Math.round(end - start);
}

function isAgentEventPayload(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function toolName(value: unknown): string | undefined {
  if (!isAgentEventPayload(value)) return undefined;
  const name = value.name;
  return typeof name === 'string' && name.trim() ? name.trim() : undefined;
}

function isArtifactWriteToolName(name: string | undefined): boolean {
  return name === 'Write' || name === 'Edit' || name === 'MultiEdit';
}

function latestDefinedNumber(...values: Array<number | undefined>): number | undefined {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] !== undefined) return values[i];
  }
  return undefined;
}

function measuredStatus(values: Array<number | undefined>): TrackingRunPhaseTimingStatus {
  if (values.length === 0) return 'missing';
  const measured = values.filter((value) => value !== undefined).length;
  if (measured === 0) return 'missing';
  return measured === values.length ? 'complete' : 'partial';
}

function setMeasuredDuration(
  result: Partial<RunTimingAnalytics>,
  key: string,
  phaseDurations: Array<{ phase: TrackingRunLifecyclePhase; duration: number }>,
  phase: TrackingRunLifecyclePhase,
  start: number | undefined,
  end: number | undefined,
): void {
  const duration = durationBetween(start, end);
  if (duration === undefined) return;
  (result as Record<string, unknown>)[key] = duration;
  phaseDurations.push({ phase, duration });
}

function largestMeasuredPhase(
  phaseDurations: Array<{ phase: TrackingRunLifecyclePhase; duration: number }>,
): TrackingRunLifecyclePhase | undefined {
  let largest: { phase: TrackingRunLifecyclePhase; duration: number } | undefined;
  for (const entry of phaseDurations) {
    if (!largest || entry.duration > largest.duration) largest = entry;
  }
  return largest?.phase;
}

function laterThan(a: number | undefined, b: number | undefined): boolean {
  return a !== undefined && (b === undefined || a >= b);
}

interface UsageCacheFields {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
  cacheReadInputTokens: number | undefined;
  cacheCreationInputTokens: number | undefined;
  cacheTokenSource: 'anthropic' | 'openai' | undefined;
}

// Single source of truth for the provider/runtime cache-token alias matrix.
// Both the last-call (reverse) scan and the first-call (forward) scan extract
// usage through this so their effective-input denominators — and therefore
// `cache_hit_ratio` vs `first_call_cache_hit_ratio` — can never drift apart as
// new aliases are added.
function extractUsageCacheFields(usage: Record<string, unknown>): UsageCacheFields {
  const inputTokens = firstNumber(usage, ['input_tokens', 'prompt_tokens']);
  const outputTokens = firstNumber(usage, ['output_tokens', 'completion_tokens']);
  const totalTokens = firstNumber(usage, ['total_tokens', 'totalTokens']);
  const anthropicCacheReadInputTokens = firstNumber(usage, ['cache_read_input_tokens']);
  const normalizedCachedReadInputTokens = firstNumber(usage, [
    'cached_input_tokens',
    'cache_read_tokens',
    'cached_read_tokens',
  ]);
  const openAiCachedInputTokens = readNestedNumber(usage, [
    'prompt_tokens_details',
    'cached_tokens',
  ]);
  const cacheReadInputTokens =
    anthropicCacheReadInputTokens ??
    normalizedCachedReadInputTokens ??
    openAiCachedInputTokens;
  const anthropicCacheCreationInputTokens = firstNumber(
    usage,
    ['cache_creation_input_tokens', 'cache_write_input_tokens', 'cache_creation_tokens'],
    [['cache_creation', 'input_tokens']],
  );
  const normalizedCachedWriteInputTokens = firstNumber(usage, ['cached_write_tokens']);
  const cacheCreationInputTokens =
    anthropicCacheCreationInputTokens ?? normalizedCachedWriteInputTokens;
  let cacheTokenSource: 'anthropic' | 'openai' | undefined;
  if (
    anthropicCacheReadInputTokens !== undefined ||
    anthropicCacheCreationInputTokens !== undefined
  ) {
    cacheTokenSource = 'anthropic';
  } else if (
    normalizedCachedReadInputTokens !== undefined ||
    normalizedCachedWriteInputTokens !== undefined ||
    openAiCachedInputTokens !== undefined
  ) {
    cacheTokenSource = 'openai';
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    cacheTokenSource,
  };
}

export function scanRunEventsForUsageAnalytics(
  events: RunEventForAnalyticsObservability[],
  reqBodyModel: unknown,
  userQueryTokens: number,
): RunUsageAnalytics {
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let providerTotalTokens: number | undefined;
  let cacheReadInputTokens: number | undefined;
  let cacheCreationInputTokens: number | undefined;
  let cacheTokenSource: RunUsageAnalytics['cache_token_source'] = 'unavailable';
  let agentReportedModel: string | null = null;
  const needAgentModel = !hasExplicitRequestedModelForAnalytics(reqBodyModel);
  let haveUsageTokens = false;

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    const data = ev?.data as
      | {
          type?: string;
          usage?: Record<string, unknown> | null;
          modelUsage?: Record<string, unknown> | null;
          label?: string;
          model?: unknown;
          detail?: unknown;
        }
      | null
      | undefined;
    if (ev?.event === 'agent' && data?.type === 'usage' && !haveUsageTokens) {
      const usage = data.usage && typeof data.usage === 'object'
        ? data.usage
        : data.modelUsage && typeof data.modelUsage === 'object'
          ? data.modelUsage
          : null;
      if (usage) {
        const fields = extractUsageCacheFields(usage);
        inputTokens = fields.inputTokens;
        outputTokens = fields.outputTokens;
        providerTotalTokens = fields.totalTokens;
        cacheReadInputTokens = fields.cacheReadInputTokens;
        cacheCreationInputTokens = fields.cacheCreationInputTokens;
        if (fields.cacheTokenSource) cacheTokenSource = fields.cacheTokenSource;
        haveUsageTokens = inputTokens !== undefined || outputTokens !== undefined;
      }
    }

    if (
      !agentReportedModel &&
      ev?.event === 'agent' &&
      data?.type === 'status' &&
      (data.label === 'model' || data.label === 'initializing')
    ) {
      const candidate =
        typeof data.model === 'string'
          ? data.model
          : typeof data.detail === 'string'
            ? data.detail
            : null;
      if (candidate && candidate.trim()) {
        agentReportedModel = candidate.trim();
      }
    }

    if (haveUsageTokens && (!needAgentModel || agentReportedModel)) break;
  }

  // Forward scan for the turn's FIRST model-call usage (the reverse loop above
  // captured the LAST). For per-call-usage agents this isolates the resume
  // signal from within-turn prefix caching; see the type docs.
  let firstCallInputTokens: number | undefined;
  let firstCallCacheReadInputTokens: number | undefined;
  let firstCallCacheCreationInputTokens: number | undefined;
  let firstCallCacheTokenSource: 'anthropic' | 'openai' | undefined;
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    const data = ev?.data as
      | { type?: string; usage?: Record<string, unknown> | null; modelUsage?: Record<string, unknown> | null }
      | null
      | undefined;
    if (ev?.event !== 'agent' || data?.type !== 'usage') continue;
    const usage = data.usage && typeof data.usage === 'object'
      ? data.usage
      : data.modelUsage && typeof data.modelUsage === 'object'
        ? data.modelUsage
        : null;
    if (!usage) continue;
    // Same extraction as the last-call scan above, so the two denominators
    // stay locked across the full provider alias matrix.
    const fields = extractUsageCacheFields(usage);
    firstCallInputTokens = fields.inputTokens;
    firstCallCacheReadInputTokens = fields.cacheReadInputTokens;
    firstCallCacheCreationInputTokens = fields.cacheCreationInputTokens;
    firstCallCacheTokenSource = fields.cacheTokenSource;
    break;
  }
  // Anthropic reports input_tokens as the UNCACHED portion (cache_read and
  // cache_creation are separate), so the effective input is their sum; OpenAI
  // folds cached into input_tokens. Mirrors the last-call effective computation
  // below exactly, including cache_creation, so the first-call and last-call
  // ratios share one denominator definition.
  const firstCallInputEffective =
    firstCallInputTokens !== undefined
      ? firstCallCacheTokenSource === 'anthropic'
        ? firstCallInputTokens +
          (firstCallCacheReadInputTokens ?? 0) +
          (firstCallCacheCreationInputTokens ?? 0)
        : firstCallInputTokens
      : undefined;
  const firstCallCacheHitRatio =
    firstCallInputEffective !== undefined &&
    firstCallInputEffective > 0 &&
    firstCallCacheReadInputTokens !== undefined
      ? firstCallCacheReadInputTokens / firstCallInputEffective
      : undefined;

  const inputTokensEffective =
    inputTokens !== undefined
      ? cacheTokenSource === 'anthropic'
        ? inputTokens + (cacheReadInputTokens ?? 0) + (cacheCreationInputTokens ?? 0)
        : inputTokens
      : undefined;
  const totalTokens =
    providerTotalTokens ??
    (inputTokensEffective !== undefined && outputTokens !== undefined
      ? inputTokensEffective + outputTokens
      : undefined);
  const uncachedInputTokens =
    inputTokens !== undefined && cacheTokenSource === 'anthropic'
      ? inputTokens
      : inputTokens !== undefined &&
          cacheTokenSource === 'openai' &&
          cacheReadInputTokens !== undefined
        ? Math.max(0, inputTokens - cacheReadInputTokens)
        : undefined;
  const estimatedContextTokens =
    inputTokensEffective !== undefined && userQueryTokens > 0
      ? Math.max(0, inputTokensEffective - userQueryTokens)
      : undefined;
  const cacheHitRatio =
    inputTokensEffective !== undefined &&
    inputTokensEffective > 0 &&
    cacheReadInputTokens !== undefined
      ? cacheReadInputTokens / inputTokensEffective
      : undefined;

  return {
    ...(inputTokens !== undefined ? { input_tokens: inputTokens } : {}),
    ...(inputTokens !== undefined ? { input_tokens_provider: inputTokens } : {}),
    ...(inputTokensEffective !== undefined
      ? { input_tokens_effective: inputTokensEffective }
      : {}),
    ...(outputTokens !== undefined ? { output_tokens: outputTokens } : {}),
    ...(totalTokens !== undefined ? { total_tokens: totalTokens } : {}),
    ...(cacheReadInputTokens !== undefined
      ? { cache_read_input_tokens: cacheReadInputTokens }
      : {}),
    ...(cacheCreationInputTokens !== undefined
      ? { cache_creation_input_tokens: cacheCreationInputTokens }
      : {}),
    ...(uncachedInputTokens !== undefined
      ? { uncached_input_tokens: uncachedInputTokens }
      : {}),
    ...(estimatedContextTokens !== undefined
      ? { estimated_context_tokens: estimatedContextTokens }
      : {}),
    ...(cacheHitRatio !== undefined ? { cache_hit_ratio: cacheHitRatio } : {}),
    // The first-call group is only meaningful when we have a real opening-call
    // input total; gate cache_read on that so cache-only alias payloads don't
    // emit a dangling first_call_cache_read with no input to ratio against.
    ...(firstCallInputTokens !== undefined
      ? { first_call_input_tokens: firstCallInputTokens }
      : {}),
    ...(firstCallInputTokens !== undefined && firstCallCacheReadInputTokens !== undefined
      ? { first_call_cache_read_input_tokens: firstCallCacheReadInputTokens }
      : {}),
    ...(firstCallCacheHitRatio !== undefined
      ? { first_call_cache_hit_ratio: firstCallCacheHitRatio }
      : {}),
    cache_token_source: cacheTokenSource,
    token_count_source: haveUsageTokens ? 'provider_usage' : 'unknown',
    agent_reported_model: agentReportedModel,
  };
}

function eventTimestamp(
  rec: RunEventForAnalyticsObservability,
): number | undefined {
  return readNumber(rec.timestamp);
}

export function summarizeRunTimingAnalytics(args: {
  runCreatedAt: number;
  runUpdatedAt: number;
  analyticsCapturedAt: number;
  telemetry?: RunTelemetryTimestamps | null;
  events: RunEventForAnalyticsObservability[];
}): RunTimingAnalytics {
  const telemetry = args.telemetry ?? {};
  const runEndAt = args.runUpdatedAt;
  let toolCallCount = 0;
  let toolDurationMs = 0;
  let firstToolUseAt: number | undefined;
  let firstObservedModelEventType: TrackingFirstModelEventType | undefined;
  let lastToolActivityAt: number | undefined;
  let firstArtifactWriteToolStartedAt: number | undefined;
  let firstArtifactWriteToolEndedAt: number | undefined;
  let artifactWriteSource: TrackingArtifactWriteSource | undefined;
  let liveArtifactSeen = false;
  const openTools = new Map<string, number>();
  const openToolNames = new Map<string, string>();

  for (const rec of args.events) {
    const data = rec.data as
      | { type?: string; id?: unknown; toolUseId?: unknown; name?: unknown }
      | null
      | undefined;
    const ts = eventTimestamp(rec);
    if (
      ts !== undefined &&
      (rec.event === 'live_artifact' ||
        (rec.event === 'agent' && data?.type === 'live_artifact'))
    ) {
      liveArtifactSeen = true;
      if (artifactWriteSource === undefined) artifactWriteSource = 'live_artifact';
    }

    if (
      ts !== undefined &&
      rec.event === 'agent' &&
      data?.type === 'artifact'
    ) {
      firstObservedModelEventType = firstObservedModelEventType ?? 'artifact';
      if (artifactWriteSource === undefined) artifactWriteSource = 'artifact_event';
    }

    if (rec.event !== 'agent') continue;
    if (ts === undefined) continue;
    if (data?.type === 'tool_use' && typeof data.id === 'string') {
      firstObservedModelEventType = firstObservedModelEventType ?? 'tool_use';
      toolCallCount += 1;
      openTools.set(data.id, ts);
      const name = toolName(data);
      if (name) openToolNames.set(data.id, name);
      firstToolUseAt = firstToolUseAt ?? ts;
      lastToolActivityAt = ts;
      if (
        firstArtifactWriteToolStartedAt === undefined &&
        isArtifactWriteToolName(name)
      ) {
        firstArtifactWriteToolStartedAt = ts;
        artifactWriteSource = 'write_tool';
      }
    } else if (
      data?.type === 'tool_result' &&
      typeof data.toolUseId === 'string'
    ) {
      const startedAt = openTools.get(data.toolUseId);
      if (startedAt !== undefined && ts >= startedAt) {
        toolDurationMs += ts - startedAt;
        lastToolActivityAt = ts;
        const name = openToolNames.get(data.toolUseId);
        if (
          firstArtifactWriteToolEndedAt === undefined &&
          isArtifactWriteToolName(name)
        ) {
          firstArtifactWriteToolEndedAt = ts;
        }
        openTools.delete(data.toolUseId);
        openToolNames.delete(data.toolUseId);
      }
    }
  }

  const startAt = telemetry.startChatRunStartedAt ?? telemetry.startRequestedAt;
  const totalDurationMs = Math.max(0, args.analyticsCapturedAt - args.runCreatedAt);
  const firstModelEventAt = telemetry.firstModelEventAt ?? firstToolUseAt ?? telemetry.firstTokenAt;
  const firstModelEventType =
    telemetry.firstModelEventType ??
    firstObservedModelEventType ??
    (telemetry.firstTokenAt !== undefined ? 'text_delta' : undefined);
  const firstVisibleOutputAt = telemetry.firstVisibleOutputAt ?? telemetry.firstTokenAt;
  const firstArtifactWriteAt =
    telemetry.firstArtifactWriteAt ??
    firstArtifactWriteToolEndedAt ??
    (liveArtifactSeen ? lastToolActivityAt : undefined);
  const phaseDurations: Array<{ phase: TrackingRunLifecyclePhase; duration: number }> = [];
  const result: RunTimingAnalytics = {
    tool_call_count: toolCallCount,
    total_duration_ms: Math.round(totalDurationMs),
  };
  setMeasuredDuration(result, 'queue_duration_ms', phaseDurations, 'queued', args.runCreatedAt, startAt);
  setMeasuredDuration(result, 'prompt_build_duration_ms', phaseDurations, 'prompt_build', telemetry.promptBuildStartAt, telemetry.promptBuildEndAt);
  setMeasuredDuration(result, 'launch_preflight_duration_ms', phaseDurations, 'launch_preflight', telemetry.launchPreflightStartAt, telemetry.launchPreflightEndAt);
  const preSpawnDuration = durationBetween(startAt, telemetry.processSpawnStartedAt);
  if (preSpawnDuration !== undefined) result.pre_spawn_duration_ms = preSpawnDuration;
  setMeasuredDuration(result, 'process_spawn_duration_ms', phaseDurations, 'process_spawn', telemetry.processSpawnStartedAt, telemetry.processSpawnedAt);
  setMeasuredDuration(result, 'stdin_write_duration_ms', phaseDurations, 'stdin_write', telemetry.stdinWriteStartAt, telemetry.stdinWriteEndAt);
  const timeToFirstModelEvent = durationBetween(startAt, firstModelEventAt);
  if (timeToFirstModelEvent !== undefined) result.time_to_first_model_event_ms = timeToFirstModelEvent;
  if (firstModelEventType !== undefined) result.first_model_event_type = firstModelEventType;
  const timeToFirstToken = durationBetween(startAt, telemetry.firstTokenAt);
  if (timeToFirstToken !== undefined) result.time_to_first_token_ms = timeToFirstToken;
  const timeToFirstVisibleOutput = durationBetween(startAt, firstVisibleOutputAt);
  if (timeToFirstVisibleOutput !== undefined) result.time_to_first_visible_output_ms = timeToFirstVisibleOutput;
  setMeasuredDuration(result, 'runtime_init_to_first_token_ms', phaseDurations, 'runtime_init', telemetry.stdinWriteEndAt ?? telemetry.modelCallStartAt ?? telemetry.processSpawnedAt, telemetry.firstTokenAt);
  const spawnToFirstToken = durationBetween(telemetry.processSpawnedAt, telemetry.firstTokenAt);
  if (spawnToFirstToken !== undefined) result.spawn_to_first_token_ms = spawnToFirstToken;
  const timeToFirstArtifact = durationBetween(startAt, firstArtifactWriteAt);
  if (timeToFirstArtifact !== undefined) result.time_to_first_artifact_ms = timeToFirstArtifact;
  setMeasuredDuration(result, 'generation_duration_ms', phaseDurations, 'stream_output', telemetry.firstTokenAt, runEndAt);
  if (toolCallCount > 0) result.tool_duration_ms = Math.round(toolDurationMs);
  if (toolCallCount > 0) {
    phaseDurations.push({ phase: 'tool_execution', duration: Math.round(toolDurationMs) });
  }
  setMeasuredDuration(result, 'artifact_write_duration_ms', phaseDurations, 'artifact_write', firstArtifactWriteToolStartedAt, firstArtifactWriteToolEndedAt ?? firstArtifactWriteAt);
  setMeasuredDuration(result, 'finalize_duration_ms', phaseDurations, 'finalize', runEndAt, args.analyticsCapturedAt);

  const artifactStarted = firstArtifactWriteToolStartedAt !== undefined;
  const artifactCompleted = firstArtifactWriteAt !== undefined;
  result.artifact_write_status = artifactCompleted
    ? 'completed'
    : artifactStarted
      ? firstArtifactWriteToolStartedAt !== undefined && runEndAt > firstArtifactWriteToolStartedAt
        ? 'failed'
        : 'started'
      : 'none';
  if (artifactWriteSource !== undefined) result.artifact_write_source = artifactWriteSource;

  const lastObservedAt = latestDefinedNumber(
    args.analyticsCapturedAt,
    runEndAt,
    telemetry.finalizeStartAt,
    firstArtifactWriteAt,
    lastToolActivityAt,
    firstVisibleOutputAt,
    telemetry.firstTokenAt,
    firstModelEventAt,
    telemetry.stdinWriteEndAt,
    telemetry.stdinWriteStartAt,
    telemetry.modelCallStartAt,
    telemetry.processSpawnedAt,
    telemetry.processSpawnStartedAt,
    telemetry.launchPreflightEndAt,
    telemetry.launchPreflightStartAt,
    telemetry.promptBuildEndAt,
    telemetry.promptBuildStartAt,
    startAt,
  );

  if (laterThan(firstArtifactWriteAt, lastToolActivityAt)) result.last_observed_phase = 'artifact_write';
  else if (laterThan(lastToolActivityAt, firstVisibleOutputAt)) result.last_observed_phase = 'tool_execution';
  else if (laterThan(firstVisibleOutputAt, telemetry.firstTokenAt)) result.last_observed_phase = 'stream_output';
  else if (laterThan(telemetry.firstTokenAt, telemetry.stdinWriteEndAt ?? telemetry.modelCallStartAt)) result.last_observed_phase = 'stream_output';
  else if (laterThan(firstModelEventAt, telemetry.stdinWriteEndAt ?? telemetry.modelCallStartAt)) result.last_observed_phase = 'first_token_wait';
  else if (laterThan(telemetry.stdinWriteEndAt, telemetry.stdinWriteStartAt)) result.last_observed_phase = 'stdin_write';
  else if (laterThan(telemetry.modelCallStartAt, telemetry.processSpawnedAt)) result.last_observed_phase = 'runtime_init';
  else if (laterThan(telemetry.processSpawnedAt, telemetry.processSpawnStartedAt)) result.last_observed_phase = 'process_spawn';
  else if (laterThan(telemetry.processSpawnStartedAt, telemetry.launchPreflightEndAt ?? telemetry.launchPreflightStartAt)) result.last_observed_phase = 'process_spawn';
  else if (laterThan(telemetry.launchPreflightEndAt, telemetry.launchPreflightStartAt)) result.last_observed_phase = 'launch_preflight';
  else if (laterThan(telemetry.promptBuildEndAt, telemetry.promptBuildStartAt)) result.last_observed_phase = 'prompt_build';
  else if (laterThan(startAt, args.runCreatedAt)) result.last_observed_phase = 'queued';
  else if (laterThan(runEndAt, telemetry.finalizeStartAt)) result.last_observed_phase = 'finalize';
  else if (lastObservedAt !== undefined) result.last_observed_phase = 'unknown';

  const bottleneckPhase = largestMeasuredPhase(phaseDurations);
  if (bottleneckPhase !== undefined) result.bottleneck_phase = bottleneckPhase;
  result.phase_timing_status = measuredStatus([
    startAt,
    telemetry.promptBuildStartAt,
    telemetry.promptBuildEndAt,
    telemetry.processSpawnStartedAt,
    telemetry.processSpawnedAt,
    telemetry.modelCallStartAt,
    telemetry.firstTokenAt,
    runEndAt,
  ]);

  if (spawnToFirstToken !== undefined) {
    const cliReady = durationBetween(
      telemetry.processSpawnedAt,
      telemetry.cliReadyAt,
    );
    const sessionInit = durationBetween(
      telemetry.cliReadyAt,
      telemetry.sessionInitDoneAt,
    );
    const modelFirstToken = durationBetween(
      telemetry.sessionInitDoneAt,
      telemetry.firstTokenAt,
    );
    if (cliReady !== undefined) result.cli_ready_ms = cliReady;
    if (sessionInit !== undefined) result.session_init_ms = sessionInit;
    if (modelFirstToken !== undefined) {
      result.model_first_token_ms = modelFirstToken;
    }
    const attributed = (cliReady ?? 0) + (sessionInit ?? 0) + (modelFirstToken ?? 0);
    result.spawn_to_first_token_remainder_ms = Math.max(
      0,
      spawnToFirstToken - attributed,
    );
  }

  if (typeof telemetry.attemptIndex === 'number') result.attempt_index = telemetry.attemptIndex;
  const attemptStartAt = telemetry.attemptStartedAt ?? startAt;
  setMeasuredDuration(result, 'attempt_duration_ms', [], 'unknown', attemptStartAt, runEndAt);
  setMeasuredDuration(result, 'attempt_time_to_first_token_ms', [], 'unknown', attemptStartAt, telemetry.firstTokenAt);
  if (result.last_observed_phase !== undefined) {
    result.attempt_terminal_phase = result.last_observed_phase;
  }

  return result;
}
