/** @module langfuse-trace/core/primitives
 * Pure helper functions for value validation, duration calculation, token
 * aggregation, integer parsing, and manifest size-capping used throughout
 * payload assembly. Part of the foundation kernel: the only intra-core imports
 * are constants.ts and types.ts; no sibling subdirectory is imported.
 */
import { ARTIFACTS_MAX_ITEMS } from './constants.js';
import type { MessageSummary } from './types.js';

/**
 * Return `value` if it is a finite, non-negative number; otherwise `undefined`.
 *
 * Used to guard epoch-ms timestamps before they are embedded in trace payloads.
 * Rejects `NaN`, `Infinity`, and negative values that would produce nonsensical
 * timestamps in Langfuse spans.
 *
 * @param value - Any value to check.
 * @returns The number, or `undefined` when the value fails validation.
 */
export function validTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/**
 * Return `value` if it is a finite, non-negative number; otherwise `undefined`.
 *
 * Shares the same guard logic as `validTimestamp` but is applied to generic
 * numeric fields (counts, sizes, durations) rather than timestamps, keeping
 * the call-site intent readable.
 *
 * @param value - Any value to check.
 * @returns The number, or `undefined` when the value fails validation.
 */
export function cleanNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/**
 * Elapsed milliseconds between two epoch-ms timestamps, clamped to zero.
 *
 * Clamping prevents negative durations when clock skew or test fixtures
 * produce an `endedAt` that precedes `startedAt`. Rounding to an integer
 * avoids sub-millisecond noise in Langfuse span durations.
 *
 * @param startedAt - Start epoch-ms timestamp.
 * @param endedAt - End epoch-ms timestamp.
 * @returns Non-negative integer millisecond duration.
 */
export function durationMs(startedAt: number, endedAt: number): number {
  return Math.max(0, Math.round(endedAt - startedAt));
}

/**
 * Sum all finite token-count fields present in a `MessageSummary` usage object.
 *
 * This is a diagnostic aggregate rather than a billing total — fields like
 * `inputTokens` and `inputTokensEffective` can overlap, so the result should
 * not be interpreted as "total unique tokens billed". It is useful for quickly
 * detecting runs with zero token data (returns 0) versus populated usage objects.
 *
 * @param usage - The usage object from a `MessageSummary`, or `undefined`.
 * @returns Sum of all finite numeric fields, or 0 if `usage` is absent.
 */
export function usageTotal(usage: MessageSummary['usage']): number {
  if (!usage) return 0;
  const values = [
    usage.inputTokens,
    usage.inputTokensProvider,
    usage.inputTokensEffective,
    usage.outputTokens,
    usage.totalTokens,
    usage.cacheReadInputTokens,
    usage.cacheCreationInputTokens,
    usage.uncachedInputTokens,
    usage.estimatedContextTokens,
  ];
  let total = 0;
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) total += value;
  }
  return total;
}

/**
 * Parse `value` as a base-10 integer and return it if it is strictly positive;
 * otherwise return `fallback`.
 *
 * Used to parse environment variable overrides for limits such as retry count
 * or batch size, where zero or negative values are not meaningful.
 *
 * @param value - The string to parse, or `undefined`.
 * @param fallback - Value returned when parsing fails or the result is non-positive.
 * @returns A positive integer, or `fallback`.
 */
export function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Parse `value` as a base-10 integer and return it if it is zero or greater;
 * otherwise return `fallback`.
 *
 * Similar to `parsePositiveInt` but permits zero — used for settings such as
 * retry count where zero is a valid "no retries" choice.
 *
 * @param value - The string to parse, or `undefined`.
 * @param fallback - Value returned when parsing fails or the result is negative.
 * @returns A non-negative integer, or `fallback`.
 */
export function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Slice a manifest entries array to at most `ARTIFACTS_MAX_ITEMS` entries.
 *
 * Enforces the batch-size invariant defined in constants.ts by preventing any
 * single manifest array from growing unboundedly. Returns `undefined` when
 * `entries` is absent so callers can use optional chaining naturally.
 *
 * @param entries - Array of typed manifest entries, or `undefined`.
 * @returns The capped array, or `undefined` when input is undefined.
 */
export function cappedManifestEntries<T>(entries: T[] | undefined): T[] | undefined {
  return entries ? entries.slice(0, ARTIFACTS_MAX_ITEMS) : undefined;
}

/**
 * Return `true` (not a count) when the original `entries` array was longer
 * than `ARTIFACTS_MAX_ITEMS`, indicating that `cappedManifestEntries` would
 * have dropped entries. Returns `undefined` otherwise.
 *
 * Omitting `false` (returning `undefined` instead) lets callers spread this
 * into a trace payload without emitting a `manifest_truncated: false` key
 * for the common non-truncated case.
 *
 * @param entries - The full (pre-cap) array, or `undefined`.
 * @returns `true` if truncation occurred, `undefined` otherwise.
 */
export function manifestTruncated(entries: unknown[] | undefined): true | undefined {
  return entries && entries.length > ARTIFACTS_MAX_ITEMS ? true : undefined;
}
