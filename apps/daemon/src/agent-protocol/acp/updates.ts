/** @module agent-protocol/acp/updates
 * ACP session-update classification helpers: status normalisation,
 * artifact-write detection, AMR retry/stderr failure promotion, and raw
 * event-shape diagnostics. Depends on acp/types, acp/json, and the vela-errors
 * integration; consumed exclusively by acp/session.ts.
 */
import { createHash } from 'node:crypto';
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
 * Returns `true` when the update's status is a terminal tool outcome
 * (completed or failed). Used to decide when to emit `tool_result`.
 */
export function isAcpTerminalToolStatus(update: JsonObject): boolean {
  return isAcpCompletedStatus(update) || isAcpTerminalFailureStatus(update);
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
 * Promotes an AMR `retry` status update into a structured OpenDesign error
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
 * signals and promotes a match to a structured OpenDesign error payload.
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
/** True when ACP `kind` is a recognized write/edit family token. */
function isAcpWriteEditKind(kind: string): boolean {
  const token = kind.trim().toLowerCase();
  return (
    token === 'edit' ||
    token === 'write' ||
    token === 'create' ||
    token === 'patch' ||
    token === 'replace' ||
    token === 'update' ||
    token === 'save'
  );
}

/**
 * True when ACP `kind` is a known tool family we trust over title heuristics.
 * Unknown kinds still map to a display name but do not lock the tool name
 * across partial frames (agents sometimes invent kind strings).
 */
export function isAcpRecognizedKind(kind: string): boolean {
  const token = kind.trim().toLowerCase();
  if (!token) return false;
  if (isAcpWriteEditKind(token)) return true;
  return (
    token === 'read' ||
    token === 'execute' ||
    token === 'bash' ||
    token === 'shell' ||
    token === 'terminal' ||
    token === 'search' ||
    token === 'grep' ||
    token === 'glob' ||
    token === 'think' ||
    token === 'thought' ||
    token === 'reason' ||
    token === 'reasoning' ||
    token === 'fetch' ||
    token === 'web' ||
    token === 'other'
  );
}

/**
 * Returns `true` when the update's `kind`, `title`, or `name` field indicates
 * a file-write operation (`edit`, `write`, `create`, `update`, `save`,
 * `patch`, or `replace`). Used to identify artifact-write tool calls for the
 * DSML suppressor (including kind-only write frames with no title words).
 *
 * @param update - A parsed ACP `session/update` params object.
 */
export function isAcpArtifactWriteLabel(update: JsonObject): boolean {
  if (typeof update.kind === 'string' && isAcpWriteEditKind(update.kind)) {
    return true;
  }
  const label = [
    typeof update.title === 'string' ? update.title : '',
    typeof update.name === 'string' ? update.name : '',
  ].join(' ');
  return /\b(?:edit|write|create|update|save|patch|replace)\b/i.test(label);
}

/**
 * Returns `true` when the tool is pure think/reason activity and must not
 * count as a concrete tool event for AMR no-output detection (and is omitted
 * from the tool_use/tool_result transcript).
 */
export function isAcpThinkOnlyTool(update: JsonObject): boolean {
  const kind = typeof update.kind === 'string' ? update.kind.trim().toLowerCase() : '';
  if (
    kind === 'think' ||
    kind === 'thought' ||
    kind === 'reason' ||
    kind === 'reasoning'
  ) {
    return true;
  }
  const name = typeof update.name === 'string' ? update.name.trim() : '';
  if (name && /^(think|thinking|thought|reason|reasoning)$/i.test(name)) {
    return true;
  }
  const title = typeof update.title === 'string' ? update.title.trim() : '';
  if (title && /^(think|thinking|thought|reason|reasoning)\b/i.test(title)) {
    return true;
  }
  return false;
}

/** Path source rank: higher wins when merging partial ACP frames. */
export const ACP_PATH_RANK_LOCATIONS = 3;
export const ACP_PATH_RANK_RAW_INPUT = 2;
export const ACP_PATH_RANK_TITLE = 1;

export type AcpPathCandidate = { path: string; rank: number };

/**
 * Best-effort path extraction with a precedence rank so partial-frame merges
 * can upgrade a weak title path when locations/rawInput arrive later.
 */
export function acpArtifactWritePathRanked(update: JsonObject): AcpPathCandidate | null {
  // 1. ACP `locations: [{ path }]` and `content: [{ path }]` (diff entries).
  for (const field of [update.locations, update.content]) {
    if (!Array.isArray(field)) continue;
    for (const entry of field) {
      const path = asObject(entry)?.path;
      if (typeof path === 'string' && path.trim()) {
        return { path: path.trim(), rank: ACP_PATH_RANK_LOCATIONS };
      }
    }
  }
  // 2. Tool input: path / file_path / filename / filePath (camelCase).
  const rawInput = asObject(update.rawInput);
  for (const key of ['path', 'file_path', 'filename', 'filePath']) {
    const value = rawInput?.[key];
    if (typeof value === 'string' && value.trim()) {
      return { path: value.trim(), rank: ACP_PATH_RANK_RAW_INPUT };
    }
  }
  // 3. A path-like filename token in the human title (reject `Image.open`).
  const title = typeof update.title === 'string' ? update.title : '';
  const match = title.match(/[\w./\\-]+\.[A-Za-z0-9]+/);
  if (match?.[0] && isAcpPathLikeToken(match[0])) {
    return { path: match[0], rank: ACP_PATH_RANK_TITLE };
  }
  return null;
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
/** Tool names that `countNewArtifacts` treats as write/edit operations. */
const ACP_WRITE_OR_EDIT_TOOL_NAMES: ReadonlySet<string> = new Set([
  'Write',
  'create_file',
  'Edit',
  'str_replace_edit',
  'MultiEdit',
  'multi_edit',
]);

/** Extensions that make a dotted title token look like a real file path. */
const ACP_PATH_LIKE_EXTENSIONS: ReadonlySet<string> = new Set([
  'html',
  'htm',
  'css',
  'js',
  'ts',
  'tsx',
  'jsx',
  'mjs',
  'cjs',
  'md',
  'mdx',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'toml',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'ico',
  'mp4',
  'mov',
  'webm',
  'mp3',
  'wav',
  'm4a',
  'pdf',
  'txt',
  'csv',
  'xml',
  'py',
  'go',
  'rs',
  'rb',
  'php',
  'sh',
  'bash',
  'zsh',
  'vue',
  'svelte',
  'astro',
  'scss',
  'less',
  'map',
  'wasm',
]);

/**
 * Returns `true` when `token` looks like a filesystem path rather than a
 * dotted identifier (`Image.open`, `f.read`, `pptx.util`).
 */
export function isAcpPathLikeToken(token: string): boolean {
  const value = token.trim();
  if (!value) return false;
  if (value.startsWith('.') || value.includes('/') || value.includes('\\')) return true;
  const dot = value.lastIndexOf('.');
  if (dot <= 0 || dot === value.length - 1) return false;
  const ext = value.slice(dot + 1).toLowerCase();
  return ACP_PATH_LIKE_EXTENSIONS.has(ext);
}

/**
 * Maps a common ACP `kind` string to a stable Claude-shaped tool name.
 */
function acpToolNameFromKind(kind: string): string | null {
  const token = kind.trim().toLowerCase();
  if (!token) return null;
  if (token === 'edit' || token === 'patch' || token === 'replace' || token === 'update') {
    return 'Edit';
  }
  if (token === 'write' || token === 'create' || token === 'save') return 'Write';
  if (token === 'read') return 'Read';
  if (token === 'execute' || token === 'bash' || token === 'shell' || token === 'terminal') {
    return 'Bash';
  }
  if (token === 'search' || token === 'grep' || token === 'glob') return 'Grep';
  if (token === 'think' || token === 'thought' || token === 'reason' || token === 'reasoning') {
    return 'Think';
  }
  if (token === 'fetch' || token === 'web') return 'Fetch';
  // Title-case unknown kinds for a stable display name.
  return token.charAt(0).toUpperCase() + token.slice(1);
}

/**
 * Derives a tool name from a human `title` when `name`/`kind` are absent.
 */
function acpToolNameFromTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  if (/\b(?:grep|search|glob)\b/i.test(trimmed)) return 'Grep';
  if (/\b(?:bash|shell|execute|terminal|run)\b/i.test(trimmed)) return 'Bash';
  if (/\bread\b/i.test(trimmed)) return 'Read';
  if (/\b(?:edit|patch|replace)\b/i.test(trimmed)) return 'Edit';
  if (/\b(?:write|create|save|update)\b/i.test(trimmed)) return 'Write';
  const first = trimmed.split(/\s+/)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/**
 * Execute-family names that Langfuse treats as partial-redact only (secret+path
 * lexical masking, not full payload replacement). Custom `kind:other` tools must
 * never inherit these labels — a malicious or misconfigured MCP adapter can
 * otherwise place private content in `rawInput` and bypass fail-closed redaction.
 * Keep in sync with `PARTIAL_REDACT_TOOL_NAMES_LOWER` in langfuse-trace.ts.
 */
const ACP_PARTIAL_REDACT_TOOL_NAMES_LOWER: ReadonlySet<string> = new Set([
  'bash',
  'shell',
  'execute',
  'terminal',
]);

/** True when a tool name would enter Langfuse's Bash-like partial-redact allowlist. */
export function isAcpPartialRedactToolName(toolName: string): boolean {
  const normalized = toolName.trim().toLowerCase();
  if (!normalized) return false;
  return ACP_PARTIAL_REDACT_TOOL_NAMES_LOWER.has(normalized);
}

/**
 * Sanitizes an ACP custom/adapter tool name before it enters the transcript.
 *
 * Kind `other` tools may ship free-text `name` values that embed paths, URLs,
 * tokens, or other user-specific strings. Those names flow into tool_use events
 * and then into Langfuse span labels / toolName metadata (even when content
 * telemetry is off). Only identifier-like names are kept; everything else
 * collapses to the opaque family label `Other`. Langfuse additionally
 * canonicalizes non-allowlisted names at the telemetry boundary.
 *
 * Callers that resolve names without a recognized execute-family kind
 * (missing kind, kind:other, unknown kinds) must also reject Bash-like
 * partial-redact labels via `isAcpPartialRedactToolName` so custom tools
 * cannot impersonate the sole non-fail-closed family.
 */
export function sanitizeAcpCustomToolName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'Other';
  // Paths, URLs, free-text titles, and overlong strings are never safe labels.
  if (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('://') ||
    /\s/.test(trimmed) ||
    trimmed.length > 64
  ) {
    return 'Other';
  }
  // Identifier-like only (snake_case, TitleCase, mcp__server__tool, …).
  if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(trimmed)) {
    return 'Other';
  }
  return trimmed;
}

/**
 * Maps an ACP adapter `toolCallId` to a transcript/telemetry-safe id.
 *
 * Adapters may embed user paths or secrets in toolCallId (for example
 * `read:/home/alice/.env`, `sk-proj-…`, `ghp_…`, or a JWT). Those values
 * would otherwise flow into tool_use/tool_result events, then into Langfuse
 * span ids and `metadata.toolCallId`. Every non-empty adapter id is replaced
 * with a stable opaque hash so identifier-shaped secrets cannot leak even
 * when they contain no path characters. Session-local maps may still key
 * off the raw id for frame correlation.
 */
export function acpTelemetryToolCallId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'acp_empty';
  return `acp_${createHash('sha256').update(trimmed, 'utf8').digest('hex').slice(0, 24)}`;
}

/**
 * Resolves a stable Claude-shaped tool name from an ACP tool-call update.
 * Trusted ACP `kind` wins over both explicit `name` and title heuristics when
 * the kind is a known tool family (so `kind: read` + `name: read_file` or
 * title "update …" stays Read). That keeps content-tool redaction and analytics
 * families aligned with Langfuse's canonical name set. Kind `other` is the
 * exception: it is recognized for stickiness but is not a family, so an
 * explicit identifier-like name still wins there for UI/transcript — except
 * Bash-like partial-redact labels, which collapse to `Other` so custom MCP
 * tools cannot bypass Langfuse fail-closed payload redaction. The same rule
 * applies when `kind` is missing: a bare `name: "Bash"` (or Bash-like title)
 * must not unlock partial redaction without a recognized execute-family kind.
 * Untrusted free-text names (paths, tokens, titles) are collapsed to `Other`
 * before the event is emitted so Langfuse span labels cannot carry
 * user-specific strings. Payloads for unknown tools still fail closed in
 * Langfuse (`shouldFullyRedactToolPayload`). Write-label override to Write/Edit
 * applies only when there is no recognized non-write kind, so
 * `countNewArtifacts` keeps working for title-only write frames.
 */
export function acpToolName(update: JsonObject): string {
  const kindRaw = typeof update.kind === 'string' ? update.kind.trim() : '';
  const kindToken = kindRaw.toLowerCase();
  const recognizedKind = kindRaw ? isAcpRecognizedKind(kindRaw) : false;
  const kindName = kindRaw ? acpToolNameFromKind(kindRaw) : null;
  // "other" is a valid ACP kind for custom tools, not a canonical family.
  const kindIsCanonicalFamily = recognizedKind && kindToken !== 'other';

  let name: string | null = null;
  if (kindIsCanonicalFamily && kindName) {
    // Canonical kind wins over explicit noncanonical names (read_file, etc.).
    // Content-tool redaction keys off stable Claude-shaped families; keeping
    // adapter-local names would skip the known-content path (unknown names
    // still fail closed in Langfuse, but canonical families stay precise).
    // Execute-family kinds are the only path that may emit Bash (partial-redact).
    name = kindName;
  } else if (typeof update.name === 'string' && update.name.trim()) {
    // kind:other / missing kind / unknown kind: keep only identifier-like
    // adapter names. Paths, tokens, and free text collapse to Other before
    // the event is emitted.
    name = sanitizeAcpCustomToolName(update.name);
    // Fail closed: without a recognized execute-family kind, never claim
    // Bash/shell/execute/terminal. Those names unlock Langfuse partial-redact
    // (lexical masking only); unclassified custom tools (no kind, kind:other)
    // can put arbitrary private content in rawInput.
    if (isAcpPartialRedactToolName(name)) {
      name = 'Other';
    }
  } else if (recognizedKind && kindName) {
    // kind:other without an explicit name (title-case "Other"), or remaining
    // recognized kinds without a preferred name.
    name = kindName;
  } else if (typeof update.title === 'string' && update.title.trim()) {
    const fromTitle = acpToolNameFromTitle(update.title);
    // Title heuristics can still surface path-like first tokens; sanitize.
    name = fromTitle ? sanitizeAcpCustomToolName(fromTitle) : null;
    // Same fail-closed rule for title-derived Bash labels without execute kind
    // (missing kind, kind:other, or any non-canonical-family path).
    if (name && isAcpPartialRedactToolName(name)) {
      name = 'Other';
    }
  } else if (kindName) {
    name = kindName;
  }
  if (!name) name = 'Tool';

  // Write-label override: only when kind is absent/unrecognized, or is already
  // a write/edit family kind. Never turn kind:read into Write because the title
  // contains "update".
  if (isAcpArtifactWriteLabel(update) && !ACP_WRITE_OR_EDIT_TOOL_NAMES.has(name)) {
    if (recognizedKind && !isAcpWriteEditKind(kindRaw)) {
      return name;
    }
    const label = [
      typeof update.title === 'string' ? update.title : '',
      typeof update.name === 'string' ? update.name : '',
      typeof update.kind === 'string' ? update.kind : '',
    ].join(' ');
    if (/\b(?:edit|patch|replace)\b/i.test(label)) return 'Edit';
    return 'Write';
  }
  return name;
}

/**
 * Builds a Claude-shaped tool input object from an ACP tool-call update.
 * Starts from `rawInput` when present, attaches `file_path` when a real path
 * is available, and never fabricates a path from `toolCallId`.
 */
export function acpToolInput(update: JsonObject): Record<string, unknown> {
  const rawInput = asObject(update.rawInput);
  const input: Record<string, unknown> = rawInput ? { ...rawInput } : {};
  const path = acpArtifactWritePath(update);
  if (path) {
    input.file_path = path;
  }
  if (Object.keys(input).length === 0) {
    if (typeof update.title === 'string' && update.title.trim()) {
      return { title: update.title.trim() };
    }
    return {};
  }
  return input;
}

/**
 * Extracts tool-result text from an ACP terminal tool-call update.
 * Prefers `rawOutput`, then text/diff content entries. Truncates large
 * payloads so trace storage stays bounded.
 */
export function acpToolResultContent(update: JsonObject, maxChars = 8000): string {
  const rawOutput = update.rawOutput;
  let text = '';
  if (typeof rawOutput === 'string') {
    text = rawOutput;
  } else if (rawOutput !== undefined && rawOutput !== null) {
    try {
      text = JSON.stringify(rawOutput);
    } catch {
      text = String(rawOutput);
    }
  } else if (Array.isArray(update.content)) {
    const parts: string[] = [];
    for (const entry of update.content) {
      const obj = asObject(entry);
      if (!obj) {
        if (typeof entry === 'string' && entry) parts.push(entry);
        continue;
      }
      if (typeof obj.text === 'string' && obj.text) {
        parts.push(obj.text);
        continue;
      }
      if (typeof obj.diff === 'string' && obj.diff) {
        parts.push(obj.diff);
        continue;
      }
      // ACP diff entries often carry oldText/newText instead of a unified diff.
      const oldText = typeof obj.oldText === 'string' ? obj.oldText : '';
      const newText = typeof obj.newText === 'string' ? obj.newText : '';
      if (oldText || newText) {
        parts.push(`--- old\n${oldText}\n+++ new\n${newText}`);
        continue;
      }
      const extracted = extractAcpUpdateText(obj);
      if (extracted) parts.push(extracted);
    }
    text = parts.join('\n');
  } else {
    text = extractAcpUpdateText(update) ?? '';
  }
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…[truncated]`;
}

/**
 * Execute-family tools whose stdout can contain arbitrary private file content
 * (`cat .env`, dumps of secrets, etc.). Normalized ACP names for these kinds
 * are Claude-shaped `Bash` plus common aliases.
 */
const ACP_EXECUTE_TOOL_NAMES_LOWER: ReadonlySet<string> = new Set([
  'bash',
  'shell',
  'execute',
  'terminal',
]);

/** True when `toolName` is an ACP execute/bash-family tool. */
export function isAcpExecuteToolName(toolName: string): boolean {
  const normalized = toolName.trim().toLowerCase();
  if (!normalized) return false;
  return ACP_EXECUTE_TOOL_NAMES_LOWER.has(normalized);
}

/**
 * Sanitizes ACP tool_result content for the canonical agent transcript.
 *
 * Content tools (Read/Write/…) keep full bodies so the local UI and Langfuse
 * content-tool redactor can each do their job. Execute/Bash is different:
 * Langfuse only applies lexical secret+path masking to Bash, and ACP only
 * started forwarding execute results with the full-transcript change — so a
 * `cat .env` body would ship to telemetry almost intact. Replace raw stdout
 * with a length summary before emit.
 */
export function acpSafeToolResultContent(toolName: string, content: string): string {
  if (!content) return content;
  if (!isAcpExecuteToolName(toolName)) return content;
  return `[REDACTED:acp_bash_output:${content.length}_chars]`;
}

/**
 * Best-effort extraction of a concrete file path from an ACP tool-call update,
 * checking three sources in priority order:
 * 1. `locations` or `content` array entries with a `path` field.
 * 2. `rawInput.path`, `rawInput.file_path`, `rawInput.filename`, or `rawInput.filePath`.
 * 3. A path-like filename token embedded in the human-readable `title` field
 *    (rejects dotted identifiers like `Image.open`).
 *
 * Returns `null` when no concrete path is present. Does not use `toolCallId`
 * as a path — callers decide how to key pathless writes.
 *
 * @param update - A parsed ACP `session/update` params object.
 * @returns An absolute or relative file path string, or `null` when absent.
 */
export function acpArtifactWritePath(update: JsonObject): string | null {
  return acpArtifactWritePathRanked(update)?.path ?? null;
}
