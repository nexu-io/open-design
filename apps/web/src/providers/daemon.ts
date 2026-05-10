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
import type {
  ChatRunCreateResponse,
  ChatRunListResponse,
  ChatRunStatus,
  ChatRunStatusResponse,
  ChatRequest,
  ChatSseEvent,
  ChatSseStartPayload,
  DaemonAgentPayload,
  ResearchOptions,
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

export function latestUserPromptFromHistory(history: ChatMessage[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    if (message?.role === 'user') return message.content;
  }
  return '';
}

export interface DaemonStreamHandlers extends StreamHandlers {
  onAgentEvent: (ev: AgentEvent) => void;
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
  assistantMessageId?: string | null;
  clientRequestId?: string | null;
  skillId?: string | null;
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
  initialLastEventId?: string | null;
  onRunCreated?: (runId: string) => void;
  onRunStatus?: (status: ChatRunStatus) => void;
  onRunEventId?: (eventId: string) => void;
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

export async function streamViaDaemon({
  agentId,
  history,
  signal,
  cancelSignal,
  handlers,
  projectId,
  conversationId,
  assistantMessageId,
  clientRequestId,
  skillId,
  designSystemId,
  attachments,
  commentAttachments,
  model,
  reasoning,
  research,
  initialLastEventId,
  onRunCreated,
  onRunStatus,
  onRunEventId,
}: DaemonStreamOptions): Promise<void> {
  // Local CLIs are single-turn print-mode programs, so we collapse the whole
  // chat into one string. If this becomes too noisy for long histories, the
  // fix is to only include the final user turn.
  const transcript = history
    .map((m) => `## ${m.role}\n${m.content.trim()}`)
    .join('\n\n');
  const request: ChatRequest = {
    agentId,
    message: transcript,
    currentPrompt: latestUserPromptFromHistory(history),
    projectId: projectId ?? null,
    conversationId: conversationId ?? null,
    assistantMessageId: assistantMessageId ?? null,
    clientRequestId: clientRequestId ?? null,
    skillId: skillId ?? null,
    designSystemId: designSystemId ?? null,
    attachments: attachments ?? [],
    commentAttachments: commentAttachments ?? [],
    model: model ?? null,
    reasoning: reasoning ?? null,
    ...(research ? { research } : {}),
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
      onRunStatus?.('failed');
      handlers.onError(new Error(`daemon ${createResp.status}: ${text || 'no body'}`));
      return;
    }

    const created = (await createResp.json()) as ChatRunCreateResponse;
    const runId = created.runId;
    onRunCreated?.(runId);
    onRunStatus?.('queued');
    await consumeDaemonRun({
      runId,
      signal,
      cancelSignal,
      handlers,
      initialLastEventId,
      onRunStatus,
      onRunEventId,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    onRunStatus?.('failed');
    handlers.onError(err instanceof Error ? err : new Error(String(err)));
  }
}

export async function reattachDaemonRun(options: DaemonReattachOptions): Promise<void> {
  await consumeDaemonRun(options);
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

async function consumeDaemonRun({
  runId,
  signal,
  cancelSignal,
  handlers,
  initialLastEventId,
  onRunStatus,
  onRunEventId,
}: DaemonReattachOptions): Promise<void> {
  let acc = '';
  let stderrBuf = '';
  let exitCode: number | null = null;
  let exitSignal: string | null = null;
  let endStatus: ChatRunStatus | null = null;
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
            continue;
          }
          if (parsed.kind !== 'event') continue;
          sawStreamProgress = true;
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
            onRunStatus?.('failed');
            const data = event.data as SseErrorPayload;
            handlers.onError(new Error(String(data.error?.message ?? data.message ?? 'daemon error')));
            return;
          }

          if (event.event === 'end') {
            exitCode = typeof event.data.code === 'number' ? event.data.code : null;
            exitSignal = typeof event.data.signal === 'string' ? event.data.signal : null;
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
        onRunStatus?.(endStatus);
      } else {
        handlers.onError(new Error('daemon stream disconnected before run completed'));
        return;
      }
    }

    if (endStatus === 'canceled') return;

    if (endStatus === 'failed' || exitSignal || (exitCode !== null && exitCode !== 0)) {
      const tail = stderrBuf.trim().slice(-400);
      handlers.onError(
        new Error(`agent exited with ${exitSignal ? `signal ${exitSignal}` : `code ${exitCode}`}${tail ? `\n${tail}` : ''}`),
      );
      return;
    }
    handlers.onDone(acc);
  } finally {
    cancelSignal?.removeEventListener('abort', cancelRun);
  }
}

function isChatRunStatus(value: unknown): value is ChatRunStatus {
  return value === 'queued' || value === 'running' || value === 'succeeded' || value === 'failed' || value === 'canceled';
}

function normalizeToolInput(input: unknown): unknown {
  if (input == null || typeof input !== 'object') return input;
  const obj = input as Record<string, unknown>;
  if ('filePath' in obj && typeof obj.filePath === 'string') {
    return { ...obj, file_path: obj.filePath };
  }
  return input;
}

// Translate a raw `agent` SSE payload (what apps/daemon/src/claude-stream.ts emits)
// into the UI's AgentEvent union. Keep this liberal — unknown types just
// return null so the UI ignores them instead of rendering garbage.
function translateAgentEvent(data: DaemonAgentPayload): AgentEvent | null {
  const t = data.type;
  if (t === 'status' && typeof data.label === 'string') {
    return {
      kind: 'status',
      label: data.label,
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
