/** @module agent-protocol/acp/json
 * Pure JSON value-extraction and text-traversal helpers for the ACP layer,
 * plus the `OD_ACP_TIMEOUT_MS` environment resolver. Has no side effects and
 * performs no I/O; depends only on acp/types and acp/constants.
 * Consumed by acp/rpc.ts, acp/session.ts, acp/models.ts, and acp/updates.ts.
 */
import type { JsonObject } from './types.js';
import { MAX_TIMEOUT_MS } from './constants.js';

/**
 * Extracts a human-readable error message from an unknown thrown value.
 * Returns `err.message` for `Error` instances, `String(err)` otherwise.
 *
 * @param err - Any caught value (typically an `Error` but may be anything).
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
/**
 * Resolves the effective ACP timeout from `OD_ACP_TIMEOUT_MS` in the process
 * environment, falling back to `fallbackMs` when the variable is absent or
 * non-finite. Clamps the result to `[0, MAX_TIMEOUT_MS]`.
 *
 * @param env - The process environment object to read `OD_ACP_TIMEOUT_MS` from.
 * @param fallbackMs - The default timeout to use when the env var is unset.
 * @returns The resolved timeout in milliseconds.
 */
export function resolveAcpTimeoutMs(env: NodeJS.ProcessEnv, fallbackMs: number): number {
  const raw = Number(env.OD_ACP_TIMEOUT_MS);
  if (!Number.isFinite(raw)) return fallbackMs;
  return Math.min(MAX_TIMEOUT_MS, Math.max(0, Math.floor(raw)));
}
/**
 * Coerces an unknown value to a `JsonObject` if it is a non-null, non-array
 * plain object, or returns `null` otherwise. The primary guard used throughout
 * the ACP layer before accessing named properties on parsed JSON frames.
 *
 * @param value - Any value from a JSON parse result.
 * @returns The value cast as `JsonObject`, or `null` when the cast is unsafe.
 */
export function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' ? value as JsonObject : null;
}
/**
 * Returns a short diagnostic string describing the JSON kind of `value`:
 * `'array'`, `'null'`, or the result of `typeof`. Used to build
 * `acp_raw_event_shape` diagnostics without touching the value.
 *
 * @param value - Any value from a parsed ACP update object.
 */
export function acpValueKind(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}
/**
 * Returns a sorted array of own string keys from `value` if it is a
 * `JsonObject`, or an empty array otherwise. Used to snapshot object
 * structure for diagnostic payloads without risking a throw.
 *
 * @param value - Any value from a parsed ACP update object.
 */
export function objectKeys(value: unknown): string[] {
  const obj = asObject(value);
  return obj ? Object.keys(obj).sort() : [];
}
/**
 * Recursively traverses an ACP update value up to 4 levels deep and returns
 * the first non-empty string found, checking common text-bearing keys in order:
 * `text`, `delta`, `content`, `message`, `output`, `answer`, `value`, `body`,
 * `parts`, `choices`. Handles string scalars, flat arrays, and nested objects.
 *
 * Used as the extraction primitive by `extractAcpUpdateText`.
 *
 * @param value - A value from a parsed ACP session update.
 * @param depth - Current recursion depth (max 4); callers omit this.
 * @returns The first non-empty string found, or `null` when none is present.
 */
export function extractAcpTextValue(value: unknown, depth = 0): string | null {
  if (depth > 4) return null;
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (Array.isArray(value)) {
    const text = value
      .map((item) => extractAcpTextValue(item, depth + 1))
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join('');
    return text.length > 0 ? text : null;
  }
  const obj = asObject(value);
  if (!obj) return null;
  for (const key of [
    'text',
    'delta',
    'content',
    'message',
    'output',
    'answer',
    'value',
    'body',
    'parts',
    'choices',
  ]) {
    const text = extractAcpTextValue(obj[key], depth + 1);
    if (text) return text;
  }
  return null;
}
/**
 * Extracts the first non-empty text string from the top-level properties of a
 * parsed ACP session update object. Checks the same key list as
 * `extractAcpTextValue` but at only one level of depth (the update object
 * itself), delegating deep traversal to that helper.
 *
 * @param update - A parsed ACP `session/update` params object.
 * @returns The first non-empty text string, or `null` when none is present.
 */
export function extractAcpUpdateText(update: JsonObject): string | null {
  for (const key of [
    'content',
    'text',
    'delta',
    'message',
    'output',
    'answer',
    'value',
    'body',
    'parts',
    'choices',
  ]) {
    const text = extractAcpTextValue(update[key]);
    if (text) return text;
  }
  return null;
}
