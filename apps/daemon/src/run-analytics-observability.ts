import type { TrackingRuntimeType } from '@open-design/contracts/analytics';
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
  firstTokenAt?: number;
  finalizeStartAt?: number;
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
  cache_token_source: 'anthropic' | 'openai' | 'unavailable';
  token_count_source: 'provider_usage' | 'estimated' | 'unknown';
  agent_reported_model: string | null;
}

export interface RunTimingAnalytics {
  queue_duration_ms?: number;
  pre_spawn_duration_ms?: number;
  process_spawn_duration_ms?: number;
  time_to_first_token_ms?: number;
  spawn_to_first_token_ms?: number;
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
  finalize_duration_ms?: number;
  total_duration_ms: number;
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
        inputTokens = firstNumber(usage, ['input_tokens', 'prompt_tokens']);
        outputTokens = firstNumber(usage, ['output_tokens', 'completion_tokens']);
        providerTotalTokens = firstNumber(usage, ['total_tokens', 'totalTokens']);
        const anthropicCacheReadInputTokens = firstNumber(
          usage,
          ['cache_read_input_tokens'],
        );
        const normalizedCachedReadInputTokens = firstNumber(
          usage,
          ['cached_input_tokens', 'cache_read_tokens', 'cached_read_tokens'],
        );
        const openAiCachedInputTokens = readNestedNumber(
          usage,
          ['prompt_tokens_details', 'cached_tokens'],
        );
        cacheReadInputTokens =
          anthropicCacheReadInputTokens ??
          normalizedCachedReadInputTokens ??
          openAiCachedInputTokens;
        const anthropicCacheCreationInputTokens = firstNumber(
          usage,
          [
            'cache_creation_input_tokens',
            'cache_write_input_tokens',
            'cache_creation_tokens',
          ],
          [['cache_creation', 'input_tokens']],
        );
        const normalizedCachedWriteInputTokens = firstNumber(
          usage,
          ['cached_write_tokens'],
        );
        cacheCreationInputTokens =
          anthropicCacheCreationInputTokens ?? normalizedCachedWriteInputTokens;
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
  const openTools = new Map<string, number>();

  for (const rec of args.events) {
    if (rec.event !== 'agent') continue;
    const data = rec.data as
      | { type?: string; id?: unknown; toolUseId?: unknown }
      | null
      | undefined;
    const ts = eventTimestamp(rec);
    if (ts === undefined) continue;
    if (data?.type === 'tool_use' && typeof data.id === 'string') {
      toolCallCount += 1;
      openTools.set(data.id, ts);
    } else if (
      data?.type === 'tool_result' &&
      typeof data.toolUseId === 'string'
    ) {
      const startedAt = openTools.get(data.toolUseId);
      if (startedAt !== undefined && ts >= startedAt) {
        toolDurationMs += ts - startedAt;
        openTools.delete(data.toolUseId);
      }
    }
  }

  const startAt = telemetry.startChatRunStartedAt ?? telemetry.startRequestedAt;
  const totalDurationMs = Math.max(0, args.analyticsCapturedAt - args.runCreatedAt);
  const result: RunTimingAnalytics = {
    tool_call_count: toolCallCount,
    total_duration_ms: Math.round(totalDurationMs),
  };
  const queueDuration = durationBetween(args.runCreatedAt, startAt);
  if (queueDuration !== undefined) result.queue_duration_ms = queueDuration;
  const preSpawnDuration = durationBetween(startAt, telemetry.processSpawnStartedAt);
  if (preSpawnDuration !== undefined) result.pre_spawn_duration_ms = preSpawnDuration;
  const processSpawnDuration = durationBetween(
    telemetry.processSpawnStartedAt,
    telemetry.processSpawnedAt,
  );
  if (processSpawnDuration !== undefined) {
    result.process_spawn_duration_ms = processSpawnDuration;
  }
  const timeToFirstToken = durationBetween(startAt, telemetry.firstTokenAt);
  if (timeToFirstToken !== undefined) {
    result.time_to_first_token_ms = timeToFirstToken;
  }
  const spawnToFirstToken = durationBetween(
    telemetry.processSpawnedAt,
    telemetry.firstTokenAt,
  );
  if (spawnToFirstToken !== undefined) {
    result.spawn_to_first_token_ms = spawnToFirstToken;
    // Split spawn->first-token into subsegments where the markers were
    // observed. Each subsegment is the gap between two adjacent marks; an
    // absent mark leaves its subsegment undefined and that time flows into the
    // remainder so the four parts always sum back to spawn_to_first_token_ms.
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
  const generationDuration = durationBetween(telemetry.firstTokenAt, runEndAt);
  if (generationDuration !== undefined) {
    result.generation_duration_ms = generationDuration;
  }
  if (toolCallCount > 0) result.tool_duration_ms = Math.round(toolDurationMs);
  const finalizeDuration = durationBetween(runEndAt, args.analyticsCapturedAt);
  if (finalizeDuration !== undefined) {
    result.finalize_duration_ms = finalizeDuration;
  }
  return result;
}
