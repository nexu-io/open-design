/**
 * Daemon provider — fetch-based SSE client for /api/runs. The daemon can
 * emit three event streams depending on the agent's streamFormat:
 *   - 'agent'   : typed events emitted by Claude Code's stream-json parser
 *                 (status, text_delta, thinking_delta, tool_use, tool_result,
 *                 usage, raw). We forward these to the UI as AgentEvent items.
 *   - 'stdout'  : plain chunks from other CLIs. We wrap them in a single
 *                 rolling 'text' event.
 *   - 'stderr'  : incidental stderr. Shown only when the process exits
 *                 non-zero (tail appended to the error message).
 */
import type { AgentEvent, ChatCommentAttachment, ChatMessage } from '../types';
import type { AmrEntryAttribution } from '../analytics/amr-attribution';
import type {
  ChatAnalyticsHints,
  ChatRunCreateResponse,
  ChatRunListResponse,
  ChatRunStatus,
  ChatRunStatusResponse,
  ChatRequest,
  ChatSessionMode,
  ChatSseEvent,
  ChatSseStartPayload,
  DaemonAgentPayload,
  AmrModelsResponse,
  MediaExecutionPolicy,
  ResearchOptions,
  RunContextSelection,
  SseErrorPayload,
} from '@open-design/contracts';
import type { StreamHandlers } from './anthropic';

/**
 * Returns the front-end carrier that's about to send this request:
 * - 'desktop' when running inside the Electron shell
 * - 'web' when running in a regular browser
 * - 'unknown' in non-browser test environments (jsdom without a UA)
 *
 * The daemon uses this to label telemetry traces. Cheap, called once per
 * run so caching isn't worth the complexity.
 */
function detectClientType(): 'desktop' | 'web' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent ?? '';
  if (ua.includes('Electron/')) return 'desktop';
  if (ua) return 'web';
  return 'unknown';
}
import { parseSseFrame } from './sse';
import {
  summarizeArtifactsForTranscript,
  type PersistedArtifactFileRef,
} from '../artifacts/strip';
import { trackRunProgress, trackRunStart, trackRunTerminal } from '../observability/stuck-run';

const MAX_TRANSCRIPT_MESSAGE_CHARS = 12_000;
const LARGE_TOOL_RESULT_CHARS = 8_000;
const HIGH_INPUT_TOKEN_WARNING_THRESHOLD = 200_000;

export function latestUserPromptFromHistory(history: ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (message?.role === 'user') return message.content;
  }
  return '';
}

function truncateForTranscript(content: string): string {
  if (content.length <= MAX_TRANSCRIPT_MESSAGE_CHARS) return content;
  const omitted = content.length - MAX_TRANSCRIPT_MESSAGE_CHARS;
  return `${content.slice(0, MAX_TRANSCRIPT_MESSAGE_CHARS)}\n\n[Open Design truncated ${omitted} chars from this prior message before sending it to the agent. Full content remains in persisted history.]`;
}

function escapeTranscriptRoleDelimiters(content: string): string {
  return content.replace(/^(## (?:user|assistant)[ \t]*)(\r?)$/gm, '\\$1$2');
}

function compactInput(input: unknown): string {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function buildPriorRunContextWarning(history: ChatMessage[]): string | null {
  let highestInputTokens = 0;
  let largeToolResults = 0;
  let sawAgentBrowserCoreDump = false;

  for (const message of history) {
    for (const event of message.events ?? []) {
      if (event.kind === 'usage' && typeof event.inputTokens === 'number') {
        highestInputTokens = Math.max(highestInputTokens, event.inputTokens);
      }
      if (event.kind === 'tool_result') {
        if (event.content.length > LARGE_TOOL_RESULT_CHARS) largeToolResults += 1;
        if (
          event.content.includes('agent-browser skills get core') ||
          event.content.includes('Agent Browser Core') ||
          event.content.includes('name: core')
        ) {
          sawAgentBrowserCoreDump = true;
        }
      }
      if (event.kind === 'tool_use') {
        const input = compactInput(event.input);
        if (input.includes('agent-browser skills get core')) {
          sawAgentBrowserCoreDump = true;
        }
      }
    }
  }

  const notes: string[] = [];
  if (highestInputTokens >= HIGH_INPUT_TOKEN_WARNING_THRESHOLD) {
    notes.push(`a previous run reported ${highestInputTokens} input tokens`);
  }
  if (largeToolResults > 0) {
    notes.push(`${largeToolResults} large prior tool result${largeToolResults === 1 ? '' : 's'} exist only in persisted event history`);
  }
  if (sawAgentBrowserCoreDump) {
    notes.push('agent-browser documentation output was seen earlier; do not replay it into this turn');
  }
  if (notes.length === 0) return null;

  return [
    '## context warning',
    `Open Design detected ${notes.join(', ')}.`,
    'Keep this turn compact: summarize prior tool output, read large references from temp files, and quote only task-relevant lines.',
  ].join('\n');
}

function scopeHistoryToAgent(history: ChatMessage[], targetAgentId?: string): ChatMessage[] {
  if (!targetAgentId) return history;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (message?.role === 'assistant' && message.agentId && message.agentId !== targetAgentId) {
      return history.slice(i + 1);
    }
  }
  return history;
}

// Strip OD-specific markup that the agent emitted on a prior turn but
// that the model would otherwise pattern-match as a template to echo.
// Today this is `<question-form>` blocks (and the `<ask-question>` alias the
// UI parser and the daemon open-tag matcher both accept) and the ```json
// fenced schemas
// some models (GPT-OSS-120B Medium, Gemini 3.5 Flash) emit alongside
// them — leaving those literal in the transcript causes weak/medium
// plain-stream models to re-emit an identical form on the user's
// follow-up turn, looking like the discovery form loop never breaks
// (see PR #3157 form-loop investigation). If we only scrubbed the canonical
// tag, an alias-form turn would replay verbatim and re-trigger that loop.
//
// User content is preserved verbatim — a user message that legitimately
// quotes `<question-form>` (e.g. discussing the markup with the agent)
// must not be mangled.
export function sanitizePriorAssistantTurnForTranscript(
  content: string,
  persistedArtifactFiles: ReadonlyArray<PersistedArtifactFileRef> = [],
): string {
  let sanitized = content.replace(
    // `\1` backreference keeps the open/close tag names matched so we never
    // splice across a `<question-form>…</ask-question>` mismatch.
    /<(question-form|ask-question)\b[^>]*>[\s\S]*?<\/\1>/g,
    '[question-form was emitted here on a prior turn; the user already answered, see their reply below.]',
  );
  // Strip ```json (or plain ```) fenced blocks whose body matches the
  // form schema shape — `"questions": [` is the strongest tell. A
  // generic JSON snippet without that key (e.g. an API response the
  // agent shared) is left intact.
  sanitized = sanitized.replace(
    /```(?:json)?\s*\n([\s\S]*?)\n```/g,
    (match, body: string) => {
      if (/"questions"\s*:\s*\[/.test(body)) {
        return '[form schema was echoed here on a prior turn; stripped to avoid a loop.]';
      }
      return match;
    },
  );
  // Replace prior-turn `<artifact>` HTML with a one-line summary — but ONLY
  // for artifacts whose save to the project files is confirmed by the
  // message's producedFiles record. persistArtifact has refusal and
  // write-failure branches; on those paths the transcript copy is the only
  // surviving artifact body, so an unconfirmed block stays verbatim (the
  // 12K truncation below still bounds it) and a follow-up turn can repair it.
  // For confirmed saves the agent reads/edits the file from disk, never from
  // this transcript copy, so re-sending the whole document each turn is pure
  // waste — the summary keeps identifier/title/type plus the saved file name.
  // Runs before truncateForTranscript so the summarized message no longer
  // trips the 12K cap. Uses markdown-aware detection so a literal
  // `<artifact>` recited in a code fence survives.
  sanitized = summarizeArtifactsForTranscript(sanitized, persistedArtifactFiles);
  return sanitized;
}

// producedFiles → the persistence evidence summarizeArtifactsForTranscript
// matches artifact blocks against. producedFiles is the whole per-turn file
// diff — tool-written files included — so a name collision with an unrelated
// same-turn file must not count as proof the <artifact> body was saved. Only
// artifact-originated saves qualify: persistArtifact always writes an explicit
// (non-inferred) manifest, whereas tool-written files surface with no manifest
// or a daemon-inferred one (`metadata.inferred === true`). Within that
// narrowed set, the manifest identifier is the strongest link (it survives
// `-2`/`-3` collision renames); the file name is the fallback for artifact
// saves whose manifest predates identifier metadata.
function persistedArtifactFilesOf(message: ChatMessage): PersistedArtifactFileRef[] {
  return (message.producedFiles ?? [])
    .filter((file) => file.artifactManifest && file.artifactManifest.metadata?.inferred !== true)
    .map((file) => {
      const identifier = file.artifactManifest?.metadata?.identifier;
      return {
        name: file.name,
        identifier: typeof identifier === 'string' && identifier ? identifier : undefined,
      };
    });
}

export function buildDaemonTranscript(history: ChatMessage[], targetAgentId?: string): string {
  const scopedHistory = scopeHistoryToAgent(history, targetAgentId);
  const transcript = scopedHistory
    .map((m) => {
      const trimmed = m.content.trim();
      const sanitized =
        m.role === 'assistant'
          ? sanitizePriorAssistantTurnForTranscript(trimmed, persistedArtifactFilesOf(m))
          : trimmed;
      return `## ${m.role}\n${escapeTranscriptRoleDelimiters(truncateForTranscript(sanitized))}`;
    })
    .join('\n\n');
  const warning = buildPriorRunContextWarning(scopedHistory);
  return warning ? `${warning}\n\n${transcript}` : transcript;
}

export interface DaemonStreamHandlers extends StreamHandlers {
  onAgentEvent: (ev: AgentEvent) => void;
  /**
   * Live-only incremental tool-input fragment (Claude `input_json_delta`).
   * Kept off `AgentEvent`/`PersistedAgentEvent` because it is ephemeral and
   * never persisted — consumers accumulate by tool-use `id` for real-time
   * display and discard once the full `tool_use` event arrives. `name` is the
   * tool name so the UI can gate the live preview to code-writing tools.
   */
  onToolInputDelta?: (id: string, name: string, delta: string) => void;
}

export interface DaemonStreamOptions {
  agentId: string;
  history: ChatMessage[];
  /** Legacy field accepted by older tests/callers. Daemon-owned prompt composition ignores it. */
  systemPrompt?: string;
  /** Stops the current browser-side SSE subscription. The daemon run continues. */
  signal: AbortSignal;
  /** Explicit user cancellation signal. This maps to POST /api/runs/:id/cancel. */
  cancelSignal?: AbortSignal;
  handlers: DaemonStreamHandlers;
  // The active project's id. When supplied, the daemon spawns the agent
  // with cwd = the project folder so its file tools target the right
  // workspace.
  projectId?: string | null;
  conversationId?: string | null;
  sessionMode?: ChatSessionMode;
  assistantMessageId?: string | null;
  clientRequestId?: string | null;
  skillId?: string | null;
  // Per-turn skill ids picked via the composer's @-mention popover. These
  // are layered onto the system prompt for this run only and do not
  // change the project's persistent `skillId`.
  skillIds?: string[];
  designSystemId?: string | null;
  // Project-relative paths the user has staged for this turn. The
  // daemon resolves them inside the project folder, validates they
  // exist, and stitches them into the user message as `@<path>` hints.
  attachments?: string[];
  commentAttachments?: ChatCommentAttachment[];
  // Per-CLI model + reasoning the user picked in the model menu. Both are
  // optional; the daemon validates them against the agent's declared
  // options and falls back to the CLI default when missing.
  model?: string | null;
  reasoning?: string | null;
  research?: ResearchOptions;
  context?: RunContextSelection;
  appliedPluginSnapshotId?: string | null;
  mediaExecution?: MediaExecutionPolicy;
  titleGeneration?: { enabled?: boolean };
  locale?: string;
  initialLastEventId?: string | null;
  onRunCreated?: (runId: string) => void;
  onRunStatus?: (status: ChatRunStatus) => void;
  onRunEventId?: (eventId: string) => void;
  // v2 analytics context propagated to run_created / run_finished.
  // Optional; the daemon only consumes these to shape PostHog props
  // (page_name / area / entry_from / DS context). Behavior never
  // depends on them.
  analyticsHints?: ChatAnalyticsHints;
}

export interface DaemonReattachOptions {
  runId: string;
  signal: AbortSignal;
  cancelSignal?: AbortSignal;
  handlers: DaemonStreamHandlers;
  initialLastEventId?: string | null;
  onRunStatus?: (status: ChatRunStatus) => void;
  onRunEventId?: (eventId: string) => void;
}

export const RUNS_CHANGED_EVENT = 'open-design:runs-changed';

function notifyRunsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(RUNS_CHANGED_EVENT));
}

function daemonSseErrorMessage(data: SseErrorPayload): string {
  const formattedOpenCodeError = formatOpenCodeSessionError(data.error?.details);
  if (formattedOpenCodeError) return formattedOpenCodeError;

  const message = String(data.error?.message ?? data.message ?? 'daemon error');
  const legacyOpenCodeError = formatLegacyOpenCodeSessionError(message);
  if (legacyOpenCodeError) return legacyOpenCodeError;

  const detail =
    data.error?.details &&
    typeof data.error.details === 'object' &&
    !Array.isArray(data.error.details) &&
    typeof data.error.details.detail === 'string'
      ? data.error.details.detail
      : null;
  if (!detail || detail === message || message.includes(detail)) return message;
  return `${message}\n${detail}`;
}

function daemonSseError(data: SseErrorPayload): Error {
  const error = new Error(daemonSseErrorMessage(data)) as Error & {
    code?: string;
    details?: unknown;
  };
  if (data.error?.code) error.code = data.error.code;
  if (data.error?.details !== undefined) error.details = data.error.details;
  return error;
}

function shouldSuppressLifecycleExitFallback(
  agentId: string | undefined,
  exitCode: number | null,
  exitSignal: string | null,
  stderrTail: string,
): boolean {
  if (exitCode !== 130 || exitSignal) return false;
  if (agentId === 'amr') return true;
  const normalizedStderr = stderrTail.toLowerCase();
  return (
    normalizedStderr.includes('opencode server listening') ||
    normalizedStderr.includes('opencode_server_password')
  );
}

const AMR_OPENCODE_INCOMPLETE_MESSAGE =
  'AMR/OpenCode started, but the run did not complete. Please retry or check the run details for the session stream error.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readStringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumberField(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBooleanField(record: Record<string, unknown> | null, key: string): boolean | null {
  const value = record?.[key];
  return typeof value === 'boolean' ? value : null;
}

interface OpenCodeSessionErrorDetails {
  source: string | null;
  code: string | null;
  message: string | null;
  statusCode: number | null;
  retryable: boolean | null;
  suggestion: string | null;
  responseBodyPreview: string | null;
}

function inferOpenCodeRetryable(statusCode: number | null): boolean | null {
  if (statusCode === null) return null;
  return statusCode === 429 || statusCode >= 500;
}

function normalizeOpenCodeSessionErrorDetails(value: unknown): OpenCodeSessionErrorDetails | null {
  if (!isRecord(value) || value.kind !== 'opencode_session_error') return null;
  const statusCode = readNumberField(value, 'statusCode');
  return {
    source: readStringField(value, 'source'),
    code: readStringField(value, 'code'),
    message: readStringField(value, 'message'),
    statusCode,
    retryable: readBooleanField(value, 'retryable') ?? inferOpenCodeRetryable(statusCode),
    suggestion: readStringField(value, 'suggestion'),
    responseBodyPreview: readStringField(value, 'responseBodyPreview'),
  };
}

function linkErrorMessageFromResponseBodyPreview(preview: string | null): string | null {
  if (!preview) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(preview);
  } catch {
    return null;
  }
  const error = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : null;
  return readStringField(error, 'message');
}

function retryExhaustedMessage(details: OpenCodeSessionErrorDetails): string | null {
  const linkMessage = linkErrorMessageFromResponseBodyPreview(details.responseBodyPreview);
  if (!linkMessage) return null;
  const retryMatch = linkMessage.match(/\bRetried the upstream request\s+(\d+)\s+times\b/i);
  if (!retryMatch) return null;
  const retryCount = retryMatch[1];
  return [
    'The upstream model service is temporarily unavailable.',
    '',
    `We already retried ${retryCount} times, but the request still failed. Please retry later or switch to another model.`,
  ].join('\n');
}

function formatOpenCodeSessionError(value: unknown): string | null {
  const details = normalizeOpenCodeSessionErrorDetails(value);
  if (!details) return null;
  const statusCode = details.statusCode;
  const message = details.message;
  if (details.source === 'opencode' && details.code === 'ROLE_MARKER_HALLUCINATION') {
    return message;
  }
  if (statusCode === 404) {
    return 'The model service returned 404 Not Found for the configured runtime endpoint. Check the AMR Link URL or model route.';
  }
  if (statusCode === 401 || statusCode === 403) {
    return 'AMR authentication failed. Please sign in again or refresh the runtime key.';
  }
  if (statusCode === 429) {
    return 'The model service rejected the request due to quota or rate limits. Retry later or check quota and rate limits.';
  }
  if (typeof statusCode === 'number' && statusCode >= 500) {
    const exhaustedMessage = retryExhaustedMessage(details);
    if (exhaustedMessage) return exhaustedMessage;
    return 'The upstream model provider returned a temporary error. Please retry or switch models.';
  }
  const base = message ? `OpenCode session failed: ${message}` : 'OpenCode session failed.';
  return details.suggestion ? `${base}\n${details.suggestion}` : base;
}

function extractBalancedJsonObject(text: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, i + 1);
    }
  }
  return null;
}

function legacyOpenCodeSessionErrorDetails(text: string): OpenCodeSessionErrorDetails | null {
  const marker = 'opencode session error:';
  const markerIndex = text.toLowerCase().indexOf(marker);
  if (markerIndex === -1) return null;
  const jsonStart = text.indexOf('{', markerIndex + marker.length);
  if (jsonStart === -1) return null;
  const jsonText = extractBalancedJsonObject(text, jsonStart);
  if (!jsonText) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const error = isRecord(parsed.error) ? parsed.error : null;
  const data = isRecord(error?.data) ? error.data : null;
  const statusCode = readNumberField(data, 'statusCode');
  const retryable = readBooleanField(data, 'isRetryable') ?? inferOpenCodeRetryable(statusCode);
  return {
    source: null,
    code: null,
    message: readStringField(data, 'message') ?? readStringField(error, 'message'),
    statusCode,
    retryable,
    suggestion: null,
    responseBodyPreview: readStringField(data, 'responseBodyPreview') ?? readStringField(data, 'responseBody'),
  };
}

function formatLegacyOpenCodeSessionError(text: string): string | null {
  const details = legacyOpenCodeSessionErrorDetails(text);
  if (!details) return null;
  return formatOpenCodeSessionError({
    kind: 'opencode_session_error',
    ...details,
  });
}

function isAmrOpenCodeExitFallback(agentId: string | undefined, stderr: string): boolean {
  if (agentId === 'amr' || agentId === 'opencode') return true;
  const normalized = stderr.toLowerCase();
  return normalized.includes('opencode server listening') || normalized.includes('opencode session error:');
}

function isAmrOpenCodeBootstrapLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^AMR run id:\s*\S+/i.test(trimmed) ||
    /^Performing one time database migration/i.test(trimmed) ||
    /^sqlite-migration:done$/i.test(trimmed) ||
    /^Database migration complete\.?$/i.test(trimmed) ||
    /^Warning:\s*OPENCODE_SERVER_PASSWORD is not set/i.test(trimmed) ||
    /^opencode server listening on http:\/\/127\.0\.0\.1:\d+/i.test(trimmed)
  );
}

function cleanAmrOpenCodeStderrFallback(agentId: string | undefined, stderr: string): string {
  if (!isAmrOpenCodeExitFallback(agentId, stderr)) return stderr.trim();
  return stderr
    .split(/\r?\n/)
    .filter((line) => line.trim() && !isAmrOpenCodeBootstrapLine(line))
    .join('\n')
    .trim();
}

export async function streamViaDaemon({
  agentId,
  history,
  signal,
  cancelSignal,
  handlers,
  projectId,
  conversationId,
  sessionMode,
  assistantMessageId,
  clientRequestId,
  skillId,
  skillIds,
  designSystemId,
  attachments,
  commentAttachments,
  model,
  reasoning,
  research,
  context,
  appliedPluginSnapshotId,
  mediaExecution,
  titleGeneration,
  locale,
  initialLastEventId,
  onRunCreated,
  onRunStatus,
  onRunEventId,
  analyticsHints,
}: DaemonStreamOptions): Promise<void> {
  const emitRunStatus = (status: ChatRunStatus) => {
    onRunStatus?.(status);
    notifyRunsChanged();
  };
  // Local CLIs are single-turn print-mode programs, so we collapse the whole
  // chat into one string. If this becomes too noisy for long histories, the
  // fix is to only include the final user turn.
  const transcript = buildDaemonTranscript(history, agentId);
  const request: ChatRequest = {
    agentId,
    message: transcript,
    currentPrompt: latestUserPromptFromHistory(history),
    projectId: projectId ?? null,
    conversationId: conversationId ?? null,
    sessionMode,
    assistantMessageId: assistantMessageId ?? null,
    clientRequestId: clientRequestId ?? null,
    skillId: skillId ?? null,
    skillIds: Array.isArray(skillIds) ? skillIds : [],
    designSystemId: designSystemId ?? null,
    attachments: attachments ?? [],
    commentAttachments: commentAttachments ?? [],
    model: model ?? null,
    reasoning: reasoning ?? null,
    locale,
    ...(appliedPluginSnapshotId ? { appliedPluginSnapshotId } : {}),
    ...(context ? { context } : {}),
    ...(research ? { research } : {}),
    ...(mediaExecution ? { mediaExecution } : {}),
    ...(titleGeneration?.enabled ? { titleGeneration: { enabled: true } } : {}),
    ...(analyticsHints ? { analyticsHints } : {}),
  };
  const body = JSON.stringify(request);

  try {
    const createResp = await fetch('/api/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Tells the daemon which front-end carrier started the run so the
        // telemetry trace can be tagged 'client:desktop' vs 'client:web'.
        // The daemon falls back to a User-Agent sniff when this header is
        // absent (e.g. third-party clients), so omitting it in tests is OK.
        'X-OD-Client': detectClientType(),
      },
      body,
    });

    if (!createResp.ok) {
      const text = await createResp.text().catch(() => '');
      emitRunStatus('failed');
      handlers.onError(new Error(`daemon ${createResp.status}: ${text || 'no body'}`));
      return;
    }

    const created = (await createResp.json()) as ChatRunCreateResponse;
    const runId = created.runId;
    onRunCreated?.(runId);
    // Start the stuck-run watchdog. trackRunProgress is called inside the
    // SSE consumer below on every event; trackRunTerminal fires when the
    // stream resolves to a terminal state (or errors out).
    trackRunStart(runId, {
      agent_id: agentId,
      project_id: projectId ?? undefined,
      conversation_id: conversationId ?? undefined,
      client_type: detectClientType(),
    });
    notifyRunsChanged();
    emitRunStatus('queued');
    await consumeDaemonRun({
      agentId,
      runId,
      signal,
      cancelSignal,
      handlers,
      initialLastEventId,
      onRunStatus: emitRunStatus,
      onRunEventId,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    emitRunStatus('failed');
    handlers.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

export async function reattachDaemonRun(options: DaemonReattachOptions): Promise<void> {
  await consumeDaemonRun({
    ...options,
    onRunStatus: (status) => {
      options.onRunStatus?.(status);
      notifyRunsChanged();
    },
  });
}

export async function fetchChatRunStatus(runId: string): Promise<ChatRunStatusResponse | null> {
  try {
    const resp = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
    if (!resp.ok) return null;
    return (await resp.json()) as ChatRunStatusResponse;
  } catch {
    return null;
  }
}

// PR #3157: Antigravity's auth banner can offer a one-click "open
// system terminal with agy" button. The daemon endpoint spawns
// osascript / x-terminal-emulator / `cmd /c start` for the user; on
// success the new Terminal window pops up with agy running and the
// browser opens for OAuth. The Promise resolves once the daemon kicks
// off the spawn (not when OAuth completes), so the UI can disable the
// button momentarily and then re-enable for a retry click after the
// user finishes in the terminal.
export interface LaunchAntigravityOauthResult {
  ok: boolean;
  platform?: string;
  via?: string;
  error?: string;
}
export async function launchAntigravityOauth(): Promise<LaunchAntigravityOauthResult> {
  try {
    const resp = await fetch('/api/agents/antigravity/oauth-launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = (await resp.json().catch(() => null)) as
      | LaunchAntigravityOauthResult
      | null;
    if (!resp.ok) {
      return {
        ok: false,
        error:
          body?.error ?? `daemon returned ${resp.status} ${resp.statusText}`,
      };
    }
    return body ?? { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface VelaUser {
  id: string;
  email: string;
  name?: string;
  image?: string | null;
  plan?: string;
}

export interface VelaLoginStatus {
  loggedIn: boolean;
  loginInFlight?: boolean;
  profile: string;
  user: VelaUser | null;
  configPath: string;
  // Device-authorization details parsed from `vela login` output while a login
  // is in flight, so the UI can offer a manual sign-in link when the browser
  // did not auto-open. See parseVelaLoginActivation in the daemon's vela.ts.
  activationUrl?: string;
  userCode?: string;
  browserOpenFailed?: boolean;
}

// AMR (vela) login surfaces three thin endpoints on the daemon:
//   GET  /api/integrations/vela/status   — read ~/.amr/config.json projection
//   POST /api/integrations/vela/login    — spawn `vela login` (vela opens browser itself)
//   POST /api/integrations/vela/login/cancel — terminate a still-pending login
//   POST /api/integrations/vela/logout   — clear ~/.amr auth and Settings-backed AMR auth env
// The Settings UI polls /status after kicking off /login to detect completion.
export async function fetchVelaLoginStatus(): Promise<VelaLoginStatus | null> {
  try {
    const resp = await fetch('/api/integrations/vela/status');
    if (!resp.ok) return null;
    return (await resp.json()) as VelaLoginStatus;
  } catch {
    return null;
  }
}

export async function fetchAmrModels(): Promise<AmrModelsResponse | null> {
  try {
    const resp = await fetch('/api/amr/models', { cache: 'no-store' });
    if (!resp.ok) return null;
    return (await resp.json()) as AmrModelsResponse;
  } catch {
    return null;
  }
}

export interface StartVelaLoginResult {
  ok: boolean;
  status: number;
  pid?: number;
  alreadyRunning?: boolean;
  error?: string;
}

export async function startVelaLogin(
  attribution?: AmrEntryAttribution | null,
  odDeviceId?: string | null,
): Promise<StartVelaLoginResult> {
  try {
    const loginAttribution =
      attribution && odDeviceId ? { ...attribution, odDeviceId } : attribution;
    const resp = await fetch('/api/integrations/vela/login', {
      method: 'POST',
      headers: loginAttribution ? { 'Content-Type': 'application/json' } : undefined,
      body: loginAttribution ? JSON.stringify({ attribution: loginAttribution }) : undefined,
    });
    if (resp.ok) {
      const body = (await resp.json()) as { pid?: number };
      return { ok: true, status: resp.status, pid: body.pid };
    }
    const body = (await resp.json().catch(() => null)) as { error?: string } | null;
    return {
      ok: false,
      status: resp.status,
      alreadyRunning: resp.status === 409,
      error: body?.error ?? '',
    };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function cancelVelaLogin(): Promise<{ ok: boolean; canceled?: boolean }> {
  try {
    const resp = await fetch('/api/integrations/vela/login/cancel', { method: 'POST' });
    if (!resp.ok) return { ok: false };
    const body = (await resp.json().catch(() => null)) as { canceled?: boolean } | null;
    return { ok: true, canceled: body?.canceled };
  } catch {
    return { ok: false };
  }
}

export async function velaLogout(): Promise<{ ok: boolean }> {
  try {
    const resp = await fetch('/api/integrations/vela/logout', { method: 'POST' });
    return { ok: resp.ok };
  } catch {
    return { ok: false };
  }
}

// Forwards the user's assistant-turn rating to the daemon so it can emit
// a Langfuse `score-create`. Fire-and-forget — failures are not surfaced
// to the UI (the rating is already persisted on the message itself via
// the PUT /messages/:id round-trip).
export async function reportChatRunFeedback(req: {
  runId: string;
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  rating: 'positive' | 'negative';
  reasonCodes: string[];
  hasCustomReason: boolean;
  customReason: string;
}): Promise<void> {
  try {
    await fetch(`/api/runs/${encodeURIComponent(req.runId)}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch {
    // Best-effort.
  }
}

export async function listActiveChatRuns(
  projectId: string,
  conversationId: string,
): Promise<ChatRunStatusResponse[]> {
  try {
    const qs = new URLSearchParams({ projectId, conversationId, status: 'active' });
    const resp = await fetch(`/api/runs?${qs.toString()}`);
    if (!resp.ok) return [];
    const body = (await resp.json()) as ChatRunListResponse;
    return body.runs ?? [];
  } catch {
    return [];
  }
}

export async function listProjectRuns(): Promise<ChatRunStatusResponse[]> {
  try {
    const resp = await fetch('/api/runs');
    if (!resp.ok) return [];
    const body = (await resp.json()) as ChatRunListResponse;
    return body.runs ?? [];
  } catch {
    return [];
  }
}

async function consumeDaemonRun({
  agentId,
  runId,
  signal,
  cancelSignal,
  handlers,
  initialLastEventId,
  onRunStatus,
  onRunEventId,
}: DaemonReattachOptions & { agentId?: string }): Promise<void> {
  let acc = '';
  let stderrBuf = '';
  let exitCode: number | null = null;
  let exitSignal: string | null = null;
  let endStatus: ChatRunStatus | null = null;
  let pendingStructuredError: Error | null = null;
  // Tracks whether the server explicitly declared `status: 'succeeded'` in
  // the SSE end payload (or via the fallback run-status fetch). Distinct
  // from `endStatus === 'succeeded'`, which can be a local fallback when
  // the SSE end event omits or sends an invalid `status` field. Only the
  // explicit declaration is allowed to bypass the exit-code/signal safety
  // net below — a missing-status fallback keeps the old behavior so a
  // failure response with `{code:1}` or `{code:null,signal:"SIGTERM"}` and
  // no `status` field still surfaces an error banner.
  let serverDeclaredSuccess = false;
  // Set when the daemon reports this terminal failure can be recovered by
  // resuming the agent's CLI session (transient upstream drop / inactivity on
  // a session-resuming runtime). Carried onto the surfaced error so the chat
  // can offer a Continue affordance. See ChatRunStatusResponse.resumable.
  let endResumable = false;
  let lastEventId: string | null = initialLastEventId ?? null;
  let canceled = false;
  const cancelRun = () => {
    if (canceled) return;
    canceled = true;
    void fetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' }).catch(() => {});
  };

  cancelSignal?.addEventListener('abort', cancelRun, { once: true });
  try {
    if (cancelSignal?.aborted) {
      cancelRun();
      return;
    }

    for (let reconnects = 0; endStatus === null && reconnects < 5;) {
      const qs = lastEventId ? `?after=${encodeURIComponent(lastEventId)}` : '';
      let resp: Response;
      try {
        resp = await fetch(`/api/runs/${encodeURIComponent(runId)}/events${qs}`, {
          method: 'GET',
          signal,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        reconnects += 1;
        continue;
      }

      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => '');
        handlers.onError(new Error(`daemon ${resp.status}: ${text || 'no body'}`));
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let sawStreamProgress = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const parsed = parseSseFrame(frame);
          if (!parsed) continue;
          if (parsed.kind === 'comment') {
            sawStreamProgress = true;
            trackRunProgress(runId);
            continue;
          }
          if (parsed.kind !== 'event') continue;
          sawStreamProgress = true;
          trackRunProgress(runId);
          if (parsed.id) {
            lastEventId = parsed.id;
            onRunEventId?.(parsed.id);
          }

          const event = parsed as unknown as ChatSseEvent;

          if (event.event === 'stdout') {
            const chunk = String(event.data.chunk ?? '');
            acc += chunk;
            handlers.onDelta(chunk);
            handlers.onAgentEvent({ kind: 'text', text: chunk });
            continue;
          }

          if (event.event === 'stderr') {
            stderrBuf += event.data.chunk ?? '';
            continue;
          }

          if (event.event === 'agent') {
            if (event.data.type === 'tool_input_delta') {
              if (
                typeof event.data.id === 'string' &&
                typeof event.data.name === 'string' &&
                typeof event.data.delta === 'string'
              ) {
                handlers.onToolInputDelta?.(event.data.id, event.data.name, event.data.delta);
              }
              continue;
            }
            const translated = translateAgentEvent(event.data);
            if (!translated) continue;
            if (translated.kind === 'text') {
              acc += translated.text;
              handlers.onDelta(translated.text);
            }
            handlers.onAgentEvent(translated);
            continue;
          }

          if (event.event === 'start') {
            const data = event.data as ChatSseStartPayload;
            onRunStatus?.('running');
            handlers.onAgentEvent({
              kind: 'status',
              label: 'starting',
              detail: typeof data.bin === 'string' ? data.bin : undefined,
            });
            continue;
          }

          if (event.event === 'error') {
            const data = event.data as SseErrorPayload;
            const structuredError = daemonSseError(data);
            pendingStructuredError = structuredError;
            // The daemon emits this error frame from the child-close handler
            // BEFORE `finishWithRetryDecision()` runs, so a transient failure it
            // can recover via a same-run retry is reported here first and only
            // resolved later. `run.resumable` is also computed at that same
            // finalize step. Read the run status ONCE to classify, and let the
            // SSE `end` frame (always emitted on terminal) resolve in-flight
            // runs — this has no timeout, so even a slow retry is handled:
            //  - failed / canceled    -> surface the error now, with the
            //    finalized `resumable` bit (set just before status flips to
            //    failed, so a `failed` read already has it);
            //  - status unreachable   -> surface the structured error (safe
            //    default; never drop a real failure);
            //  - succeeded (recovered) or still running/queued (retry in
            //    flight) -> do NOT surface; keep consuming so the stream's
            //    `end` frame resolves it (succeeded -> onDone; failed ->
            //    the failure path below, carrying `end`'s resumable bit).
            const status = await fetchChatRunStatus(runId).catch(() => null);
            if (status && (status.status === 'failed' || status.status === 'canceled')) {
              onRunStatus?.('failed');
              handlers.onError(
                markErrorResumable(structuredError, status.resumable === true),
              );
              return;
            }
            if (!status) {
              onRunStatus?.('failed');
              handlers.onError(structuredError);
              return;
            }
            continue;
          }

          if (event.event === 'end') {
            exitCode = typeof event.data.code === 'number' ? event.data.code : null;
            exitSignal = typeof event.data.signal === 'string' ? event.data.signal : null;
            if (event.data.resumable === true) endResumable = true;
            // `serverDeclaredSuccess` records whether the server explicitly
            // set `status: 'succeeded'` in the end payload — the local
            // `'succeeded'` fallback below does not count and must keep
            // hitting the exit-code/signal safety net later.
            serverDeclaredSuccess = event.data.status === 'succeeded';
            endStatus = isChatRunStatus(event.data.status) ? event.data.status : 'succeeded';
            onRunStatus?.(endStatus);
          }
        }
      }
      reconnects = sawStreamProgress ? 0 : reconnects + 1;
    }

    if (endStatus === null) {
      const status = await fetchChatRunStatus(runId);
      if (status && isChatRunStatus(status.status) && status.status !== 'queued' && status.status !== 'running') {
        endStatus = status.status;
        exitCode = status.exitCode ?? null;
        exitSignal = status.signal ?? null;
        // Fallback REST path: `status.status` is explicitly declared by the
        // daemon's run record (it passed `isChatRunStatus()` above), so an
        // explicit `'succeeded'` here is just as authoritative as the SSE
        // end-event success.
        serverDeclaredSuccess = status.status === 'succeeded';
        if (status.resumable === true) endResumable = true;
        onRunStatus?.(endStatus);
      } else {
        onRunStatus?.('failed');
        handlers.onError(new Error('daemon stream disconnected before run completed'));
        return;
      }
    }

    if (endStatus === 'canceled') {
      handlers.onDone(acc);
      return;
    }

    // Trust the server's authoritative success declaration. When the server
    // explicitly sets `status: 'succeeded'` (either in the SSE end payload
    // or via the fallback run-status fetch), the run completed cleanly even
    // if the underlying process exited via a signal — some agents (e.g.
    // ACP agents like Devin for Terminal) intentionally exit via SIGTERM
    // after a clean prompt completion because they don't shut down on
    // `stdin.end()`. The signal/non-zero-code safety net is bypassed only
    // for that explicit declaration; a missing/invalid `status` from a
    // compatible or older daemon still falls back to `endStatus =
    // 'succeeded'` for the run-status surface but must keep the safety net
    // intact so a real failure response like `{code:1}` or
    // `{code:null,signal:"SIGTERM"}` without `status` still surfaces an
    // error banner.
    const looksLikeFailure =
      endStatus === 'failed' ||
      (!serverDeclaredSuccess &&
        (exitSignal || (exitCode !== null && exitCode !== 0)));
    if (looksLikeFailure) {
      if (pendingStructuredError) {
        handlers.onError(markErrorResumable(pendingStructuredError, endResumable));
        return;
      }
      if (shouldSuppressLifecycleExitFallback(agentId, exitCode, exitSignal, stderrBuf)) {
        handlers.onDone(acc);
        return;
      }
      const cleanedStderr = cleanAmrOpenCodeStderrFallback(agentId, stderrBuf);
      const formattedOpenCodeError = formatLegacyOpenCodeSessionError(cleanedStderr);
      const tail = (formattedOpenCodeError ?? cleanedStderr).trim().slice(-400);
      const fallbackTail =
        tail || (isAmrOpenCodeExitFallback(agentId, stderrBuf) ? AMR_OPENCODE_INCOMPLETE_MESSAGE : '');
      handlers.onError(
        markErrorResumable(
          new Error(`agent exited with ${exitSignal ? `signal ${exitSignal}` : `code ${exitCode}`}${fallbackTail ? `\n${fallbackTail}` : ''}`),
          endResumable,
        ),
      );
      return;
    }
    handlers.onDone(acc);
  } finally {
    cancelSignal?.removeEventListener('abort', cancelRun);
    // Settle the stuck-run watchdog with whatever terminal state we
    // resolved. If the watchdog was never armed (reattach paths that
    // hit the daemon for an already-finished run), trackRunTerminal
    // is a no-op for unknown runIds.
    trackRunTerminal(runId, endStatus ?? (canceled ? 'canceled' : 'unknown'));
  }
}

function isChatRunStatus(value: unknown): value is ChatRunStatus {
  return value === 'queued' || value === 'running' || value === 'succeeded' || value === 'failed' || value === 'canceled';
}

/** Tag an error surfaced to the chat with whether the failed run can be
 *  resumed (continued from its existing CLI session). Only stamps the property
 *  when true so non-resumable failures stay undefined. */
function markErrorResumable(err: Error, resumable: boolean): Error {
  if (resumable) (err as Error & { resumable?: boolean }).resumable = true;
  return err;
}

function normalizeToolInput(input: unknown): unknown {
  if (input == null || typeof input !== 'object') return input;
  const obj = input as Record<string, unknown>;
  if ('filePath' in obj && typeof obj.filePath === 'string') {
    return { ...obj, file_path: obj.filePath };
  }
  return input;
}

const TRANSIENT_ACP_STATUS_LABELS = new Set([
  'waiting_for_first_output',
  'tool_call',
  'tool_call_update',
  'session_update',
]);

function normalizeAgentStatusLabel(label: string): string {
  return TRANSIENT_ACP_STATUS_LABELS.has(label) ? 'running' : label;
}

// Translate a raw `agent` SSE payload (what apps/daemon/src/claude-stream.ts emits)
// into the UI's AgentEvent union. Keep this liberal — unknown types just
// return null so the UI ignores them instead of rendering garbage.
function translateAgentEvent(data: DaemonAgentPayload): AgentEvent | null {
  const t = data.type;
  if (t === 'status' && typeof data.label === 'string') {
    return {
      kind: 'status',
      label: normalizeAgentStatusLabel(data.label),
      detail:
        typeof data.detail === 'string'
          ? data.detail
          : typeof data.model === 'string'
          ? data.model
          : typeof data.ttftMs === 'number'
            ? `first token in ${Math.round((data.ttftMs as number) / 100) / 10}s`
            : undefined,
    };
  }
  if (t === 'text_delta' && typeof data.delta === 'string') {
    return { kind: 'text', text: data.delta };
  }
  if (t === 'conversation_title' && typeof data.title === 'string') {
    return { kind: 'conversation_title', title: data.title };
  }
  if (t === 'thinking_delta' && typeof data.delta === 'string') {
    return { kind: 'thinking', text: data.delta };
  }
  if (t === 'thinking_start') {
    return { kind: 'status', label: 'thinking' };
  }
  if (t === 'live_artifact') {
    return {
      kind: 'live_artifact',
      action: data.action,
      projectId: data.projectId,
      artifactId: data.artifactId,
      title: data.title,
      refreshStatus: data.refreshStatus,
    };
  }
  if (t === 'live_artifact_refresh') {
    return {
      kind: 'live_artifact_refresh',
      phase: data.phase,
      projectId: data.projectId,
      artifactId: data.artifactId,
      refreshId: data.refreshId,
      title: data.title,
      refreshedSourceCount: data.refreshedSourceCount,
      error: data.error,
    };
  }
  if (t === 'tool_use' && typeof data.id === 'string' && typeof data.name === 'string') {
    return { kind: 'tool_use', id: data.id, name: data.name, input: normalizeToolInput(data.input) };
  }
  if (t === 'tool_result' && typeof data.toolUseId === 'string') {
    return {
      kind: 'tool_result',
      toolUseId: data.toolUseId,
      content: String(data.content ?? ''),
      isError: Boolean(data.isError),
    };
  }
  if (t === 'usage') {
    const usage = (data.usage ?? {}) as Record<string, number>;
    return {
      kind: 'usage',
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costUsd: typeof data.costUsd === 'number' ? data.costUsd : undefined,
      durationMs: typeof data.durationMs === 'number' ? data.durationMs : undefined,
    };
  }
  if (t === 'fabricated_role_marker' && typeof data.marker === 'string') {
    return {
      kind: 'status',
      label: 'warning',
      detail: `Model emitted fabricated role marker ("${data.marker}"). Response was truncated to prevent unauthorized instruction injection.`,
    };
  }
  if (t === 'raw' && typeof data.line === 'string') {
    return { kind: 'raw', line: data.line };
  }
  return null;
}

export async function saveArtifact(
  identifier: string,
  title: string,
  html: string,
): Promise<{ url: string; path: string } | null> {
  try {
    const resp = await fetch('/api/artifacts/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, title, html }),
    });
    if (!resp.ok) return null;
    return (await resp.json()) as { url: string; path: string };
  } catch {
    return null;
  }
}
