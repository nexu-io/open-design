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
  thought_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  uncached_input_tokens?: number;
  estimated_context_tokens?: number;
  cache_hit_ratio?: number;
  cache_token_source: 'anthropic' | 'openai' | 'unavailable';
  token_count_source: 'provider_usage' | 'estimated' | 'unknown';
  agent_reported_model: string | null;
}

/** Compact tool histogram for PostHog `run_finished` (no inputs/outputs). */
export interface RunToolAnalyticsSummary {
  /** Unique toolUseIds that reported isError (not duplicate result frames). */
  tool_error_count: number;
  /** Distinct canonical tool families seen (uncapped true count). */
  tool_name_count: number;
  /** Sorted unique canonical tool families (bounded allowlist). */
  tool_names: string[];
  /** Comma-separated unique canonical families for sinks that prefer a string prop. */
  tool_names_csv: string;
}

export interface RunTimingAnalytics {
  queue_duration_ms?: number;
  pre_spawn_duration_ms?: number;
  process_spawn_duration_ms?: number;
  time_to_first_token_ms?: number;
  spawn_to_first_token_ms?: number;
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

<<<<<<< HEAD
=======
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
  thoughtTokens: number | undefined;
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
  const inputTokens = firstNumber(usage, [
    'input_tokens',
    'prompt_tokens',
    'inputTokens',
  ]);
  const outputTokens = firstNumber(usage, [
    'output_tokens',
    'completion_tokens',
    'outputTokens',
  ]);
  const totalTokens = firstNumber(usage, ['total_tokens', 'totalTokens']);
  const thoughtTokens = firstNumber(usage, [
    'thought_tokens',
    'thoughtTokens',
    'reasoning_tokens',
    'reasoning_output_tokens',
  ]);
  const anthropicCacheReadInputTokens = firstNumber(usage, [
    'cache_read_input_tokens',
    'cacheReadInputTokens',
  ]);
  const normalizedCachedReadInputTokens = firstNumber(usage, [
    'cached_input_tokens',
    'cache_read_tokens',
    'cached_read_tokens',
    'cachedReadTokens',
  ]);
  const openAiCachedInputTokens = readNestedNumber(usage, [
    'prompt_tokens_details',
    'cached_tokens',
  ]);
  const cacheReadInputTokens =
    anthropicCacheReadInputTokens ??
    normalizedCachedReadInputTokens ??
    openAiCachedInputTokens;
  // Anthropic-only creation aliases (additive). Do NOT include
  // `cache_creation_tokens` / `cacheCreationTokens` here — those are the
  // OpenAI-like family used by ACP formatUsage and must stay inclusive.
  const anthropicCacheCreationInputTokens = firstNumber(
    usage,
    [
      'cache_creation_input_tokens',
      'cache_write_input_tokens',
      'cacheCreationInputTokens',
    ],
    [['cache_creation', 'input_tokens']],
  );
  const normalizedCachedWriteInputTokens = firstNumber(usage, [
    'cached_write_tokens',
    'cachedWriteTokens',
    'cache_creation_tokens',
    'cacheCreationTokens',
  ]);
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
    thoughtTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    cacheTokenSource,
  };
}

interface EffectiveInputTokens {
  // The cache-inclusive prompt size, the denominator a cache-hit ratio divides
  // into. `undefined` when there is no input figure to anchor on.
  effectiveInput: number | undefined;
  // The portion that was NOT served from cache. `undefined` when the provider
  // gave no cache split to compute it from.
  uncachedInput: number | undefined;
}

// `input_tokens` is reported in two incompatible conventions across the
// provider/runtime matrix, and the SAME field name (`cached_input_tokens` etc.)
// appears under both:
//   - INCLUSIVE (OpenAI chat-completions, codex's rollout `last_token_usage`):
//     input_tokens already contains the cache-read subset → effective = input,
//     uncached = input - read.
//   - ADDITIVE (Anthropic, and the Responses-API / ACP usage that the AMR/vela
//     and pi STREAM emits): input_tokens is the UNCACHED remainder and the
//     cache-read/creation tokens are reported separately on top → effective =
//     input + read + creation, uncached = input.
// Picking the wrong convention is not cosmetic: treating an additive payload as
// inclusive makes the denominator far too small, so `cache_hit_ratio` /
// `first_call_cache_hit_ratio` blow past 1.0 (observed ~78% of AMR and ~57% of
// pi follow-up runs) and `uncached_input_tokens` collapses to 0.
//
// The discriminator is a hard arithmetic invariant, not a heuristic guess: a
// cache-read subset can never exceed the total it is a subset of, so
// `cacheRead > input` is impossible under inclusive accounting and proves the
// payload is additive. Anthropic is additive by field shape regardless. Every
// `cacheRead <= input` payload therefore stays byte-identical to the prior
// behavior; only the previously-corrupt additive case is repaired.
function resolveEffectiveInputTokens(
  inputTokens: number | undefined,
  cacheReadInputTokens: number | undefined,
  cacheCreationInputTokens: number | undefined,
  cacheTokenSource: 'anthropic' | 'openai' | 'unavailable' | undefined,
): EffectiveInputTokens {
  if (inputTokens === undefined) {
    return { effectiveInput: undefined, uncachedInput: undefined };
  }
  const read = cacheReadInputTokens ?? 0;
  const additive =
    cacheTokenSource === 'anthropic' ||
    (cacheTokenSource === 'openai' &&
      cacheReadInputTokens !== undefined &&
      read > inputTokens);
  if (additive) {
    return {
      effectiveInput: inputTokens + read + (cacheCreationInputTokens ?? 0),
      uncachedInput: inputTokens,
    };
  }
  return {
    effectiveInput: inputTokens,
    uncachedInput:
      cacheTokenSource === 'openai' && cacheReadInputTokens !== undefined
        ? Math.max(0, inputTokens - cacheReadInputTokens)
        : undefined,
  };
}

>>>>>>> upstream/main
export function scanRunEventsForUsageAnalytics(
  events: RunEventForAnalyticsObservability[],
  reqBodyModel: unknown,
  userQueryTokens: number,
): RunUsageAnalytics {
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let providerTotalTokens: number | undefined;
  let thoughtTokens: number | undefined;
  let cacheReadInputTokens: number | undefined;
  let cacheCreationInputTokens: number | undefined;
  let cacheTokenSource: RunUsageAnalytics['cache_token_source'] = 'unavailable';
  let agentReportedModel: string | null = null;
  const needAgentModel = !hasExplicitRequestedModelForAnalytics(reqBodyModel);
  // Provider-usage is true for any real token field (including thought/cache-only
  // ACP frames). Primary usage is complete only once both input and output are
  // known — a trailing output-only or input-only frame must keep the reverse
  // scan open so earlier frames can fill the missing primary fields (and cache).
  // total alone is not enough to stop; providers often emit it without the pair.
  // Cache counters are independent of the primary pair: a newer complete
  // input/output frame that omits cache must not freeze the scan before an
  // earlier cache_read/cache_creation frame is merged (the inverse of a
  // trailing cache-only frame).
  let haveProviderUsage = false;
  let havePrimaryUsage = false;
  let haveCacheFields = false;

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
    // Keep merging usage while primary or cache counters are still incomplete.
    // Stopping on primary alone drops earlier cache-only frames when a newer
    // frame already supplied input+output without cache.
    if (
      ev?.event === 'agent' &&
      data?.type === 'usage' &&
      !(havePrimaryUsage && haveCacheFields)
    ) {
      const usage = data.usage && typeof data.usage === 'object'
        ? data.usage
        : data.modelUsage && typeof data.modelUsage === 'object'
          ? data.modelUsage
          : null;
      if (usage) {
<<<<<<< HEAD
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
=======
        const fields = extractUsageCacheFields(usage);
        // Reverse-scan merge: most-recent frame wins per field; fill gaps from
        // older frames so a trailing partial update still keeps earlier
        // input/output/total/cache counters.
        if (inputTokens === undefined && fields.inputTokens !== undefined) {
          inputTokens = fields.inputTokens;
        }
        if (outputTokens === undefined && fields.outputTokens !== undefined) {
          outputTokens = fields.outputTokens;
        }
        if (providerTotalTokens === undefined && fields.totalTokens !== undefined) {
          providerTotalTokens = fields.totalTokens;
        }
        if (thoughtTokens === undefined && fields.thoughtTokens !== undefined) {
          thoughtTokens = fields.thoughtTokens;
        }
        if (cacheReadInputTokens === undefined && fields.cacheReadInputTokens !== undefined) {
          cacheReadInputTokens = fields.cacheReadInputTokens;
        }
        if (
          cacheCreationInputTokens === undefined &&
          fields.cacheCreationInputTokens !== undefined
        ) {
          cacheCreationInputTokens = fields.cacheCreationInputTokens;
        }
        if (cacheTokenSource === 'unavailable' && fields.cacheTokenSource) {
          cacheTokenSource = fields.cacheTokenSource;
        }
        // Any real provider token field counts as provider_usage (not only
        // input/output) so thought-only or total-only ACP payloads still mark
        // the source correctly for PostHog/Langfuse.
        if (
          fields.inputTokens !== undefined ||
          fields.outputTokens !== undefined ||
          fields.totalTokens !== undefined ||
          fields.thoughtTokens !== undefined ||
          fields.cacheReadInputTokens !== undefined ||
          fields.cacheCreationInputTokens !== undefined
        ) {
          haveProviderUsage = true;
        }
        // Require both input and output before treating primary usage as
        // complete. A single-field trailing frame (output-only / input-only /
        // total-only) must not freeze the reverse scan.
        havePrimaryUsage =
          inputTokens !== undefined && outputTokens !== undefined;
        // Cache fields resolve only once both counters are present. If a
        // stream never emits them, the loop exhausts usage events instead of
        // treating "no cache seen yet" as complete.
        haveCacheFields =
          cacheReadInputTokens !== undefined &&
          cacheCreationInputTokens !== undefined;
>>>>>>> upstream/main
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

    // Stop only once primary input/output and both cache counters are known.
    // Partial primary frames, cache-only frames, and the inverse (complete
    // primary without cache) keep the reverse scan open so earlier counters
    // still merge. Streams with no cache frames simply finish the loop.
    if (
      havePrimaryUsage &&
      haveCacheFields &&
      (!needAgentModel || agentReportedModel)
    ) {
      break;
    }
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
    ...(thoughtTokens !== undefined ? { thought_tokens: thoughtTokens } : {}),
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
    token_count_source: haveProviderUsage ? 'provider_usage' : 'unknown',
    agent_reported_model: agentReportedModel,
  };
}

/**
 * Canonical tool families shipped to PostHog. Raw ACP/CLI tool names are
 * never forwarded — only this small allowlist (plus `other`).
 */
const TOOL_ANALYTICS_FAMILIES = [
  'Write',
  'Edit',
  'Read',
  'Bash',
  'Grep',
  'Search',
  'Fetch',
  'Think',
  'Tool',
  'other',
] as const;

type ToolAnalyticsFamily = (typeof TOOL_ANALYTICS_FAMILIES)[number];

const TOOL_ANALYTICS_FAMILY_SET = new Set<string>(TOOL_ANALYTICS_FAMILIES);

/** Case-insensitive aliases → canonical family (privacy-safe, bounded). */
const TOOL_ANALYTICS_FAMILY_ALIASES: Readonly<Record<string, ToolAnalyticsFamily>> = {
  write: 'Write',
  edit: 'Edit',
  multiedit: 'Edit',
  read: 'Read',
  bash: 'Bash',
  shell: 'Bash',
  terminal: 'Bash',
  grep: 'Grep',
  search: 'Search',
  glob: 'Search',
  find: 'Search',
  fetch: 'Fetch',
  webfetch: 'Fetch',
  websearch: 'Search',
  think: 'Think',
  thinking: 'Think',
  tool: 'Tool',
  other: 'other',
  unknown: 'other',
};

/**
 * Map an arbitrary tool name to a PostHog-safe canonical family.
 * Never returns paths, URLs, or free-text titles.
 */
export function canonicalizeToolAnalyticsName(raw: string | undefined): ToolAnalyticsFamily {
  if (!raw) return 'other';
  const trimmed = raw.trim();
  if (!trimmed) return 'other';
  // Reject anything that looks like a path, URL, or free-text title.
  if (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('://') ||
    trimmed.includes(' ') ||
    trimmed.length > 64
  ) {
    return 'other';
  }
  const lower = trimmed.toLowerCase();
  const compact = lower.replace(/[^a-z0-9]/g, '');
  const aliased =
    TOOL_ANALYTICS_FAMILY_ALIASES[lower] ??
    (compact ? TOOL_ANALYTICS_FAMILY_ALIASES[compact] : undefined);
  if (aliased) return aliased;
  // Exact canonical family (already Title-case allowlist member).
  if (TOOL_ANALYTICS_FAMILY_SET.has(trimmed)) {
    return trimmed as ToolAnalyticsFamily;
  }
  // Case-insensitive match against the allowlist itself.
  for (const family of TOOL_ANALYTICS_FAMILIES) {
    if (family.toLowerCase() === lower || family.toLowerCase() === compact) {
      return family;
    }
  }
  return 'other';
}

/**
 * Cheap tool family histogram + error counts from tool_use/tool_result events.
 * Canonicalizes names to a small allowlist; never includes inputs/outputs
 * (PostHog payload safety). tool_error_count is unique failed toolUseIds.
 */
export function summarizeToolAnalytics(
  events: RunEventForAnalyticsObservability[],
): RunToolAnalyticsSummary {
  const seenIds = new Set<string>();
  const namesById = new Map<string, ToolAnalyticsFamily>();
  const uniqueNameSet = new Set<ToolAnalyticsFamily>();
  const erroredToolUseIds = new Set<string>();

  for (const rec of events) {
    if (rec.event !== 'agent') continue;
    const data = rec.data as
      | {
          type?: string;
          id?: unknown;
          name?: unknown;
          toolUseId?: unknown;
          isError?: unknown;
        }
      | null
      | undefined;
    if (!data) continue;

    if (data.type === 'tool_use' && typeof data.id === 'string') {
      if (seenIds.has(data.id)) continue;
      seenIds.add(data.id);
      const family = canonicalizeToolAnalyticsName(toolName(data));
      namesById.set(data.id, family);
      uniqueNameSet.add(family);
    } else if (data.type === 'tool_result' && data.isError === true) {
      const toolUseId =
        typeof data.toolUseId === 'string' && data.toolUseId
          ? data.toolUseId
          : undefined;
      if (toolUseId) {
        if (erroredToolUseIds.has(toolUseId)) continue;
        erroredToolUseIds.add(toolUseId);
        // Orphan error results (no prior tool_use) still count as `other`.
        if (!namesById.has(toolUseId)) {
          uniqueNameSet.add('other');
        }
      } else {
        // No toolUseId: count once per frame under a synthetic key so we do
        // not silently drop errors, but still avoid unbounded inflation from
        // the same anonymous frame if callers re-scan.
        const synthetic = `__anon_error_${erroredToolUseIds.size}`;
        erroredToolUseIds.add(synthetic);
        uniqueNameSet.add('other');
      }
    }
  }

  // Stable allowlist order (not locale-dependent); `other` stays last.
  const uniqueNames = TOOL_ANALYTICS_FAMILIES.filter((family) =>
    uniqueNameSet.has(family),
  );

  return {
    tool_error_count: erroredToolUseIds.size,
    tool_name_count: uniqueNames.length,
    tool_names: [...uniqueNames],
    tool_names_csv: uniqueNames.join(','),
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
<<<<<<< HEAD
=======
  const openToolNames = new Map<string, string>();
  // Count unique tool_use ids so historical double-emits (or retries) do not
  // inflate tool_call_count.
  const seenToolUseIds = new Set<string>();
>>>>>>> upstream/main

  for (const rec of args.events) {
    if (rec.event !== 'agent') continue;
    const data = rec.data as
      | { type?: string; id?: unknown; toolUseId?: unknown }
      | null
      | undefined;
    const ts = eventTimestamp(rec);
    if (ts === undefined) continue;
    if (data?.type === 'tool_use' && typeof data.id === 'string') {
<<<<<<< HEAD
      toolCallCount += 1;
      openTools.set(data.id, ts);
=======
      firstObservedModelEventType = firstObservedModelEventType ?? 'tool_use';
      if (!seenToolUseIds.has(data.id)) {
        seenToolUseIds.add(data.id);
        toolCallCount += 1;
      }
      // Prefer producer-supplied start time (ACP firstSeenAt) when present.
      const payloadStartedAt =
        typeof (data as { startedAt?: unknown }).startedAt === 'number' &&
        Number.isFinite((data as { startedAt: number }).startedAt)
          ? (data as { startedAt: number }).startedAt
          : undefined;
      const toolStartedAt = payloadStartedAt ?? ts;
      // First tool_use timestamp wins for duration pairing.
      if (!openTools.has(data.id)) {
        openTools.set(data.id, toolStartedAt);
      } else if (payloadStartedAt !== undefined) {
        const prev = openTools.get(data.id);
        if (prev !== undefined && payloadStartedAt < prev) {
          openTools.set(data.id, payloadStartedAt);
        }
      }
      const name = toolName(data);
      if (name) openToolNames.set(data.id, name);
      firstToolUseAt = firstToolUseAt ?? toolStartedAt;
      lastToolActivityAt = ts;
      if (
        firstArtifactWriteToolStartedAt === undefined &&
        isArtifactWriteToolName(name)
      ) {
        firstArtifactWriteToolStartedAt = toolStartedAt;
        artifactWriteSource = 'write_tool';
      }
>>>>>>> upstream/main
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
