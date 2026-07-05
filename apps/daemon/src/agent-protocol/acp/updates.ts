import type { JsonObject } from './types.js';
import { asObject, acpValueKind, objectKeys, extractAcpUpdateText } from './json.js';
import { classifyAmrAccountFailure, amrAccountFailureDetails } from '../../integrations/vela-errors.js';

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
export function acpUpdateStatus(update: JsonObject): string {
  return typeof update.status === 'string'
    ? update.status.trim().toLowerCase().replace(/[\s_-]+/g, '')
    : '';
}
export function isAcpCompletedStatus(update: JsonObject): boolean {
  const status = acpUpdateStatus(update);
  return status === 'completed' || status === 'complete' || status === 'succeeded' || status === 'success';
}
export function isAcpTerminalFailureStatus(update: JsonObject): boolean {
  const status = acpUpdateStatus(update);
  return status === 'failed' || status === 'failure' || status === 'error' || status === 'cancelled' || status === 'canceled';
}
export function isAcpRetryStatus(update: JsonObject): boolean {
  return acpUpdateStatus(update) === 'retry';
}
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
export function acpToolCallId(update: JsonObject): string | null {
  return typeof update.toolCallId === 'string' && update.toolCallId.trim()
    ? update.toolCallId.trim()
    : null;
}
export function isAcpArtifactWriteLabel(update: JsonObject): boolean {
  const label = [
    typeof update.title === 'string' ? update.title : '',
    typeof update.name === 'string' ? update.name : '',
  ].join(' ');
  return /\b(?:edit|write|create|update|save|patch|replace)\b/i.test(label);
}
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
