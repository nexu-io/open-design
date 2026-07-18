/** @module agent-protocol/pi-rpc/internal
 * Shared primitives for the pi-rpc submodule: base JSON record types, the
 * SendAgentEvent callback interface, the TokenUsage shape, and lightweight
 * type guards and error-extraction helpers consumed by events.ts and session.ts.
 */

/** A plain JSON object — the base payload type for pi RPC messages. */
export type JsonRecord = Record<string, unknown>;
/** Callback signature for forwarding a typed event to the daemon's SSE layer. */
export type SendAgentEvent = (channel: string, payload: JsonRecord) => void;
/** Optional token-count fields surfaced by pi's RPC protocol on turn completion. */
export type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cached_read_tokens?: number;
  cached_write_tokens?: number;
  total_tokens?: number;
};
/**
 * Returns `true` when `value` is a non-null object, narrowing it to
 * `JsonRecord` for safe property access on RPC message payloads.
 */
export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}
/**
 * Extracts a human-readable message string from an unknown thrown value;
 * falls back to `String(err)` for non-Error objects.
 *
 * @param err - Any caught value from a try/catch or error callback.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
/**
 * Extracts the `code` property from an unknown thrown value when it is a
 * string — useful for matching Node.js system-error codes such as `EPIPE`.
 * Returns `undefined` if the value carries no string `code`.
 *
 * @param err - Any caught value from a try/catch or error callback.
 */
export function errorCode(err: unknown): string | undefined {
  return isRecord(err) && typeof err.code === 'string' ? err.code : undefined;
}
/**
 * Returns `value` cast to `JsonRecord` when it is a non-null object, or
 * `undefined` otherwise — a narrowing helper for optional nested fields.
 *
 * @param value - An arbitrary value from a parsed JSON payload.
 */
export function getRecord(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}
