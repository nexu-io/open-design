/** @module agent-protocol/acp/rpc
 * JSON-RPC 2.0 send helpers, error-shape parsers, usage normaliser, and
 * permission-outcome selector for the ACP protocol layer. Depends on
 * acp/types and acp/json; consumed by acp/session.ts and acp/models.ts.
 */
import type { JsonRpcId, RpcWritable } from './types.js';
import { asObject } from './json.js';

/**
 * Writes a JSON-RPC 2.0 request frame to `writable` as a single newline-terminated
 * line. Used to send ACP method calls (e.g. `initialize`, `session/new`,
 * `session/prompt`) to an agent subprocess's stdin.
 *
 * @param writable - The agent's stdin (or equivalent writable).
 * @param id - The JSON-RPC request id used to correlate the response.
 * @param method - The RPC method name.
 * @param params - The method parameter payload (any JSON-serialisable value).
 */
export function sendRpc(writable: RpcWritable, id: JsonRpcId, method: string, params: unknown): void {
  writable.write(
    `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
  );
}
/**
 * Writes a JSON-RPC 2.0 result response frame to `writable`. Used to reply to
 * incoming `session/request_permission` calls from an ACP agent.
 *
 * @param writable - The agent's stdin (or equivalent writable).
 * @param id - The id from the incoming request being answered.
 * @param result - The result payload to include in the response.
 */
export function sendRpcResult(writable: RpcWritable, id: JsonRpcId, result: unknown): void {
  writable.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}
/**
 * Type guard that returns `true` when `value` is a valid JSON-RPC id
 * (a `number` or `string`). Used before replying to incoming requests.
 */
export function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'number' || typeof value === 'string';
}
/**
 * Extracts a human-readable error message from a raw JSON-RPC response object
 * that contains an `error` field. Returns an empty string when the response
 * is not an error frame, allowing callers to use it as a truthy check.
 *
 * @param raw - A parsed JSON-RPC response object (unknown shape).
 * @returns A non-empty error message string, or `''` when not an error response.
 */
export function rpcErrorMessage(raw: unknown): string {
  const obj = asObject(raw);
  const error = asObject(obj?.error);
  if (!obj || !error) {
    return '';
  }
  const message =
    typeof error.message === 'string'
      ? error.message
      : typeof error.code === 'number'
        ? String(error.code)
        : 'json-rpc error';
  return typeof obj.id === 'number'
    ? `json-rpc id ${obj.id}: ${message}`
    : message;
}
/**
 * Extracts the structured `data` field from a JSON-RPC error response's `error`
 * object, if present. Used to retrieve typed failure details (e.g. `retryable`,
 * vendor-specific error codes) without throwing.
 *
 * @param raw - A parsed JSON-RPC response object (unknown shape).
 * @returns The `error.data` value, or `undefined` when absent.
 */
export function rpcErrorData(raw: unknown): unknown {
  const obj = asObject(raw);
  const error = asObject(obj?.error);
  return error && 'data' in error ? error.data : undefined;
}
/**
 * Reads the `retryable` boolean from a structured RPC error `data` payload.
 * Returns `undefined` when the field is absent so callers can distinguish
 * "explicitly false" from "not present" and apply their own default.
 *
 * @param data - The value of `error.data` extracted via `rpcErrorData`.
 */
export function rpcErrorRetryable(data: unknown): boolean | undefined {
  const details = asObject(data);
  return typeof details?.retryable === 'boolean' ? details.retryable : undefined;
}
/**
 * Promotes an opencode `ROLE_MARKER_HALLUCINATION` error embedded in an ACP
 * JSON-RPC `error.data` payload into a canonical Open Design error object.
 * Returns `null` when the data payload does not match the expected shape.
 * Exists so callers can surface a vendor-specific failure with a structured
 * error code rather than a bare generic message.
 *
 * @param data - The `error.data` field from a JSON-RPC error response.
 * @param fallbackMessage - Used when the payload's `message` field is blank.
 * @returns A structured error payload, or `null` when not applicable.
 */
export function promotedOpenCodeSessionErrorPayload(data: unknown, fallbackMessage: string) {
  const details = asObject(data);
  if (
    details?.kind !== 'opencode_session_error' ||
    details.source !== 'opencode' ||
    details.code !== 'ROLE_MARKER_HALLUCINATION'
  ) {
    return null;
  }
  const message =
    typeof details.message === 'string' && details.message.trim()
      ? details.message.trim()
      : fallbackMessage;
  return {
    message,
    error: {
      code: 'ROLE_MARKER_HALLUCINATION',
      message,
      retryable: typeof details.retryable === 'boolean' ? details.retryable : true,
      details: {
        ...details,
        promoted_by: 'open_design_acp',
      },
    },
  };
}
/** Normalised token-usage counters extracted from an ACP session result for downstream analytics and cost tracking. */
export interface FormattedUsage {
  input_tokens?: number;
  output_tokens?: number;
  cached_read_tokens?: number;
  thought_tokens?: number;
  total_tokens?: number;
}
/**
 * Normalises an ACP agent's raw `usage` object (camelCase keys) into the
 * snake_case `FormattedUsage` shape used by the daemon event stream. Returns
 * `null` when the input is not a recognisable usage object or has no known
 * fields.
 *
 * @param usage - The raw `result.usage` value from a `session/prompt` response.
 * @returns A `FormattedUsage` object with at least one field, or `null`.
 */
export function formatUsage(usage: unknown): FormattedUsage | null {
  const src = asObject(usage);
  if (!src) return null;
  const out: FormattedUsage = {};
  if (typeof src.inputTokens === 'number') out.input_tokens = src.inputTokens;
  if (typeof src.outputTokens === 'number') out.output_tokens = src.outputTokens;
  if (typeof src.cachedReadTokens === 'number') {
    out.cached_read_tokens = src.cachedReadTokens;
  }
  if (typeof src.thoughtTokens === 'number') out.thought_tokens = src.thoughtTokens;
  if (typeof src.totalTokens === 'number') out.total_tokens = src.totalTokens;
  return Object.keys(out).length > 0 ? out : null;
}
/**
 * Selects the best permission-outcome `optionId` to reply with when an ACP
 * agent sends a `session/request_permission` request. Prefers
 * `approve_for_session`, then `allow_always`, then `allow_once`.
 *
 * @param options - The `params.options` array from the incoming permission request.
 * @returns The chosen `optionId` string, or `null` when no approvable option is found.
 */
export function choosePermissionOutcome(options: unknown): string | null {
  const list = Array.isArray(options) ? options : [];
  const approveForSession = list.find((option) => option?.optionId === 'approve_for_session');
  if (approveForSession) return 'approve_for_session';
  const allowAlways = list.find((option) => option?.kind === 'allow_always');
  if (allowAlways?.optionId) return allowAlways.optionId;
  const allowOnce = list.find((option) => option?.kind === 'allow_once');
  if (allowOnce?.optionId) return allowOnce.optionId;
  return null;
}
