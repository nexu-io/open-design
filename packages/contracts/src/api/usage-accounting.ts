/**
 * Provider usage accounting — the alias matrix and the inclusive-vs-additive
 * rule for reading token counts out of a `usage` payload.
 *
 * WHY THIS IS SHARED. The same knowledge is needed in two places that must not
 * disagree: the daemon's run analytics (`cache_hit_ratio`,
 * `uncached_input_tokens` for PostHog/Langfuse) and the run cost decomposition
 * consumed by the web panel and `od run cost`. It lived only in the daemon
 * first, and the cost report was written against raw `cached_read_tokens`,
 * which silently read ZERO context for every Anthropic-shaped payload. A second
 * copy of this matrix would reintroduce that class of bug the next time an
 * alias is added, so there is exactly one.
 *
 * PURITY. Pure TypeScript by contract, in line with the rest of
 * `packages/contracts`: no Node APIs, no filesystem, no `Buffer`.
 */

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

export interface UsageCacheFields {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
  thoughtTokens: number | undefined;
  cacheReadInputTokens: number | undefined;
  cacheCreationInputTokens: number | undefined;
  cacheTokenSource: 'anthropic' | 'openai' | undefined;
}

// Single source of truth for the provider/runtime cache-token alias matrix.
// Every consumer extracts usage through this so their effective-input
// denominators — and therefore `cache_hit_ratio` vs
// `first_call_cache_hit_ratio`, and the cost report's context curve — can never
// drift apart as new aliases are added.
export function extractUsageCacheFields(
  usage: Record<string, unknown>,
): UsageCacheFields {
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

/** Which convention a provider reports `input_tokens` under. */
export type UsageAccountingConvention = 'additive' | 'inclusive';

/**
 * Resolve the convention for a WHOLE RUN from all of its usage frames.
 *
 * WHY NOT PER FRAME. The convention is a property of the provider, not of an
 * individual call, so deciding it per frame can hand one run two different
 * answers. That is not hypothetical: on a real OpenCode run the first call
 * reported `input_tokens: 84,212` against `cached_read_tokens: 3,072` — a large
 * fresh prompt against a barely-warm cache — which reads as inclusive and had
 * 3,072 genuinely-paid tokens subtracted from it, while calls 2 and 3
 * (`564` input against `104,448` cached) were correctly read as additive.
 *
 * The run-level inference is sound because the discriminator is an impossibility
 * proof, not a guess: under inclusive accounting the cache-read figure is a
 * SUBSET of `input_tokens`, so `read > input` cannot occur. One frame exhibiting
 * it proves the provider is additive, and every other frame of that run —
 * including a first call whose cache had not warmed up yet — inherits it.
 */
export function detectUsageAccountingConvention(
  frames: readonly UsageCacheFields[],
): UsageAccountingConvention {
  for (const fields of frames) {
    // Anthropic is additive by field shape, whatever the magnitudes say.
    if (fields.cacheTokenSource === 'anthropic') return 'additive';
    if (
      fields.inputTokens !== undefined &&
      fields.cacheReadInputTokens !== undefined &&
      fields.cacheReadInputTokens > fields.inputTokens
    ) {
      return 'additive';
    }
  }
  return 'inclusive';
}

/**
 * Input tokens NOT served from cache for one frame, under a run-level
 * convention. Additive payloads already report the uncached remainder; inclusive
 * ones carry the cached subset inside `input_tokens` and must have it removed.
 */
export function uncachedInputForConvention(
  fields: UsageCacheFields,
  convention: UsageAccountingConvention,
): number {
  const input = fields.inputTokens ?? 0;
  if (convention === 'additive') return input;
  const read = fields.cacheReadInputTokens;
  return read === undefined ? input : Math.max(0, input - read);
}

export interface EffectiveInputTokens {
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
export function resolveEffectiveInputTokens(
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
