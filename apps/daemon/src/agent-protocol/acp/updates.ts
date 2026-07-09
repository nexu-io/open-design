/** @module agent-protocol/acp/updates
 * ACP session-update classification helpers: status normalisation,
 * artifact-write detection, AMR retry/stderr failure promotion, and raw
 * event-shape diagnostics. Depends on acp/types, acp/json, and the vela-errors
 * integration; consumed exclusively by acp/session.ts.
 */
import type { JsonObject } from './types.js';
import { asObject, acpValueKind, objectKeys, extractAcpUpdateText } from './json.js';
import { classifyAmrAccountFailure, amrAccountFailureDetails } from '../../integrations/vela-errors.js';

/**
 * Produces a shallow diagnostic snapshot of an ACP update object for the
 * `acp_raw_event_shape` diagnostic event. Captures key presence, value kinds,
 * and content structure without serialising the full update, so the payload
 * stays bounded in size. Emitted only for AMR sessions where unknown shapes
 * may require debugging.
 *
 * @param update - A parsed ACP `session/update` params object.
 * @returns A flat diagnostic object suitable for inclusion in an agent event payload.
 */
export function acpRawEventShape(update: JsonObject) {
  const content = update.content;
  const rawInput = update.rawInput;
  const locations = update.locations;
  return {
    sessionUpdate: typeof update.sessionUpdate === 'string' ? update.sessionUpdate : null,
    keys: objectKeys(update),
    contentKind: acpValueKind(content),
    contentKeys: objectKeys(content),
    hasText: Boolean(extractAcpUpdateText(update)),
    hasTopLevelText: typeof update.text === 'string' && update.text.length > 0,
    hasTopLevelDelta: typeof update.delta === 'string' && update.delta.length > 0,
    hasTopLevelMessage: update.message !== undefined,
    hasToolCallId: acpToolCallId(update) !== null,
    hasRawInput: rawInput !== undefined,
    rawInputKind: acpValueKind(rawInput),
    rawInputKeys: objectKeys(rawInput),
    locationsKind: acpValueKind(locations),
    locationsCount: Array.isArray(locations) ? locations.length : undefined,
    status: typeof update.status === 'string' ? update.status : undefined,
    titlePresent: typeof update.title === 'string' && update.title.length > 0,
  };
}
/**
 * Normalises the `status` field of an ACP update to a lowercase,
 * whitespace-and-punctuation-stripped token. Returns `''` when the field
 * is absent or not a string, so all status comparisons use the token form.
 *
 * @param update - A parsed ACP `session/update` params object.
 */
export function acpUpdateStatus(update: JsonObject): string {
  return typeof update.status === 'string'
    ? update.status.trim().toLowerCase().replace(/[\s_-]+/g, '')
    : '';
}
/**
 * Returns `true` when the update's `status` field represents a successful
 * terminal state (`completed`, `complete`, `succeeded`, or `success`).
 * Used to decide when to emit deferred artifact-write tool events.
 */
export function isAcpCompletedStatus(update: JsonObject): boolean {
  const status = acpUpdateStatus(update);
  return status === 'completed' || status === 'complete' || status === 'succeeded' || status === 'success';
}
/**
 * Returns `true` when the update's `status` field represents a terminal
 * failure state (`failed`, `failure`, `error`, `cancelled`, or `canceled`).
 * Used to clean up pending write-suppression state and emit failed tool events.
 */
export function isAcpTerminalFailureStatus(update: JsonObject): boolean {
  const status = acpUpdateStatus(update);
  return status === 'failed' || status === 'failure' || status === 'error' || status === 'cancelled' || status === 'canceled';
}
/**
 * Returns `true` when the update's status is `'retry'`. Signals that the AMR
 * agent wants to restart the request; the session promoter maps this to a
 * structured error payload via `promotedAmrRetryStatusPayload`.
 */
export function isAcpRetryStatus(update: JsonObject): boolean {
  return acpUpdateStatus(update) === 'retry';
}
/**
 * Recursively collects all text-bearing leaf values from an ACP update
 * (strings, numbers, booleans) up to 4 levels deep. Used to produce a flat
 * text corpus for `classifyAmrAccountFailure` pattern matching without
 * requiring knowledge of a specific agent's response shape.
 *
 * @param value - Any value from a parsed ACP session update.
 * @param depth - Current recursion depth (max 4); callers omit this.
 * @returns A flat array of trimmed non-empty string representations.
 */
export function acpUpdateDiagnosticText(value: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) {
    return value.flatMap((item) => acpUpdateDiagnosticText(item, depth + 1));
  }
  const obj = asObject(value);
  if (!obj) return [];
  const parts: string[] = [];
  for (const key of [
    'type',
    'status',
    'code',
    'message',
    'detail',
    'details',
    'error',
    'recovery',
    'pauseReason',
    'content',
    'text',
    'rawInput',
  ]) {
    if (key in obj) {
      parts.push(...acpUpdateDiagnosticText(obj[key], depth + 1));
    }
  }
  return parts;
}
/**
 * Promotes an AMR `retry` status update into a structured Open Design error
 * payload when the update's diagnostic text matches a known AMR account failure
 * pattern (e.g. quota exceeded, auth failure). Returns `null` when the update
 * is not a retry or does not match a known pattern.
 *
 * @param update - A parsed ACP `session/update` params object.
 * @returns A structured error payload with `message` and `error`, or `null`.
 */
export function promotedAmrRetryStatusPayload(update: JsonObject) {
  if (!isAcpRetryStatus(update)) return null;
  const diagnosticText = acpUpdateDiagnosticText(update).join('\n');
  const failure = classifyAmrAccountFailure(diagnosticText);
  if (!failure) return null;
  return {
    message: failure.message,
    error: {
      code: failure.code,
      message: failure.message,
      retryable: false,
      details: {
        ...amrAccountFailureDetails(failure),
        promoted_by: 'open_design_acp_retry_status',
      },
    },
  };
}
/**
 * Scans a rolling tail of AMR stderr output for known retry/session-failure
 * signals and promotes a match to a structured Open Design error payload.
 * Returns `null` when the chunk does not contain the expected markers or does
 * not match a known failure pattern.
 *
 * @param chunk - A tail slice of accumulated stderr bytes from the AMR subprocess.
 * @returns A structured error payload, or `null` when not applicable.
 */
export function promotedAmrStderrPayload(chunk: string) {
  if (!/opencode_event_stream_failure|session\.status/i.test(chunk)) return null;
  if (!/\bretry\b/i.test(chunk)) return null;
  const failure = classifyAmrAccountFailure(chunk);
  if (!failure) return null;
  return {
    message: failure.message,
    error: {
      code: failure.code,
      message: failure.message,
      retryable: false,
      details: {
        ...amrAccountFailureDetails(failure),
        promoted_by: 'open_design_acp_stderr_retry_status',
      },
    },
  };
}
/**
 * Extracts and trims the `toolCallId` string from an ACP update, or returns
 * `null` when absent or empty. Used as a stable dedup key for artifact-write
 * tracking across update frames.
 *
 * @param update - A parsed ACP `session/update` params object.
 */
export function acpToolCallId(update: JsonObject): string | null {
  return typeof update.toolCallId === 'string' && update.toolCallId.trim()
    ? update.toolCallId.trim()
    : null;
}
/**
 * Returns `true` when the update's `title` or `name` field contains a word
 * that indicates a file-write operation (`edit`, `write`, `create`, `update`,
 * `save`, `patch`, or `replace`). Used to heuristically identify
 * artifact-write tool calls before their `toolCallId` is known.
 *
 * @param update - A parsed ACP `session/update` params object.
 */
export function isAcpArtifactWriteLabel(update: JsonObject): boolean {
  const label = [
    typeof update.title === 'string' ? update.title : '',
    typeof update.name === 'string' ? update.name : '',
  ].join(' ');
  return /\b(?:edit|write|create|update|save|patch|replace)\b/i.test(label);
}
/**
 * Returns `true` when an ACP update represents the terminal completion of an
 * artifact-write tool call and should arm the DSML text suppressor. Requires
 * a completed status combined with either a write-style label or a tool call
 * id tracked in `writeToolCallIds`.
 *
 * @param update - A parsed ACP `session/update` params object.
 * @param writeToolCallIds - The set of tool call ids identified as artifact writes so far.
 */
export function isAcpArtifactWriteUpdate(update: JsonObject, writeToolCallIds: Set<string>): boolean {
  if (!isAcpCompletedStatus(update)) return false;
  const toolCallId = acpToolCallId(update);
  return isAcpArtifactWriteLabel(update) || (toolCallId ? writeToolCallIds.has(toolCallId) : false);
}
// Best-effort file path for an ACP artifact-write tool call. ACP can carry a
// `locations: [{ path }]` array and/or `content: [{ type:'diff', path }]`
// entries, but many agents omit both and send only a human `title` ("edit").
// Returns null when no concrete path is present; the caller then falls back to
// the toolCallId as a dedup key.
/**
 * Best-effort extraction of a concrete file path from an ACP artifact-write
 * tool call update, checking three sources in priority order:
 * 1. `locations` or `content` array entries with a `path` field.
 * 2. `rawInput.path`, `rawInput.file_path`, or `rawInput.filename`.
 * 3. A filename token embedded in the human-readable `title` field.
 *
 * Returns `null` when no concrete path is present; the caller then falls
 * back to the toolCallId as a dedup key.
 *
 * @param update - A parsed ACP `session/update` params object.
 * @returns An absolute or relative file path string, or `null` when absent.
 */
export function acpArtifactWritePath(update: JsonObject): string | null {
  // 1. ACP `locations: [{ path }]` and `content: [{ path }]` (diff entries).
  for (const field of [update.locations, update.content]) {
    if (!Array.isArray(field)) continue;
    for (const entry of field) {
      const path = asObject(entry)?.path;
      if (typeof path === 'string' && path.trim()) return path.trim();
    }
  }
  // 2. Tool input echoed by some agents as `rawInput.{path,file_path,filename}`.
  const rawInput = asObject(update.rawInput);
  for (const key of ['path', 'file_path', 'filename']) {
    const value = rawInput?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  // 3. A filename token embedded in the human title, e.g. "Write index.html".
  // Keeping the real extension lets `isArtifactPath` correctly EXCLUDE
  // non-artifact writes (e.g. "edit config.json"), matching the claude path.
  const title = typeof update.title === 'string' ? update.title : '';
  const match = title.match(/[\w./-]+\.[A-Za-z0-9]+/);
  if (match?.[0]) return match[0];
  return null;
}
