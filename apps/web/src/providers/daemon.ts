/**
 * Daemon provider — fetch-based SSE client for /api/chat. The daemon can
 * emit three event streams depending on the agent's streamFormat:
 *   - 'agent'   : typed events emitted by Claude Code's stream-json parser
 *                 (status, text_delta, thinking_delta, tool_use, tool_result,
 *                 usage, raw). We forward these to the UI as AgentEvent items.
 *   - 'stdout'  : plain chunks from other CLIs. We wrap them in a single
 *                 rolling 'text' event.
 *   - 'stderr'  : incidental stderr. Shown only when the process exits
 *                 non-zero (tail appended to the error message).
 */
import type { AgentEvent, ChatMessage } from '../types';
import type {
  ChatRunCreateResponse,
  ChatRequest,
  ChatSseEvent,
  ChatSseStartPayload,
  DaemonAgentPayload,
  SseErrorPayload,
} from '@open-design/contracts';
import type { StreamHandlers } from './anthropic';
import { parseSseFrame } from './sse';

export interface DaemonStreamHandlers extends StreamHandlers {
  onAgentEvent: (ev: AgentEvent) => void;
}

export interface DaemonStreamOptions {
  agentId: string;
  history: ChatMessage[];
  systemPrompt: string;
  signal: AbortSignal;
  handlers: DaemonStreamHandlers;
  // The active project's id. When supplied, the daemon spawns the agent
  // with cwd = the project folder so its file tools target the right
  // workspace.
  projectId?: string | null;
  // Project-relative paths the user has staged for this turn. The
  // daemon resolves them inside the project folder, validates they
  // exist, and stitches them into the user message as `@<path>` hints.
  attachments?: string[];
  // Per-CLI model + reasoning the user picked in the model menu. Both are
  // optional; the daemon validates them against the agent's declared
  // options and falls back to the CLI default when missing.
  model?: string | null;
  reasoning?: string | null;
}

export async function streamViaDaemon({
  agentId,
  history,
  systemPrompt,
  signal,
  handlers,
  projectId,
  attachments,
  model,
  reasoning,
}: DaemonStreamOptions): Promise<void> {
  // Local CLIs are single-turn print-mode programs, so we collapse the whole
  // chat into one string. If this becomes too noisy for long histories, the
  // fix is to only include the final user turn.
  const transcript = history
    .map((m) => `## ${m.role}\n${m.content.trim()}`)
    .join('\n\n');
  const request: ChatRequest = {
    agentId,
    systemPrompt,
    message: transcript,
    projectId: projectId ?? null,
    attachments: attachments ?? [],
    model: model ?? null,
    reasoning: reasoning ?? null,
  };
  const body = JSON.stringify(request);

  let acc = '';
  let stderrBuf = '';
  let exitCode: number | null = null;
  let exitSignal: string | null = null;
  let endStatus: string | null = null;
  let lastEventId: string | null = null;
  let abortListener: (() => void) | null = null;

  try {
    const createResp = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    });

    if (!createResp.ok) {
      const text = await createResp.text().catch(() => '');
      handlers.onError(new Error(`daemon ${createResp.status}: ${text || 'no body'}`));
      return;
    }

    const created = (await createResp.json()) as ChatRunCreateResponse;
    const runId = created.runId;
    let canceled = false;
    const cancelRun = () => {
      if (canceled) return;
      canceled = true;
      void fetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' }).catch(() => {});
    };
    if (signal.aborted) {
      cancelRun();
      return;
    }
    abortListener = cancelRun;
    signal.addEventListener('abort', cancelRun, { once: true });

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
        cancelRun();
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
          if (parsed.id) lastEventId = parsed.id;

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
            handlers.onAgentEvent({
              kind: 'status',
              label: 'starting',
              detail: typeof data.bin === 'string' ? data.bin : undefined,
            });
            continue;
          }

          if (event.event === 'error') {
            const data = event.data as SseErrorPayload;
            handlers.onError(new Error(String(data.error?.message ?? data.message ?? 'daemon error')));
            if (abortListener) signal.removeEventListener('abort', abortListener);
            return;
          }

          if (event.event === 'end') {
            exitCode = typeof event.data.code === 'number' ? event.data.code : null;
            exitSignal = typeof event.data.signal === 'string' ? event.data.signal : null;
            endStatus = typeof event.data.status === 'string' ? event.data.status : 'succeeded';
          }
        }
      }
      reconnects = sawStreamProgress ? 0 : reconnects + 1;
    }

    if (endStatus === null) {
      cancelRun();
      handlers.onError(new Error('daemon stream disconnected before run completed'));
      if (abortListener) signal.removeEventListener('abort', abortListener);
      return;
    }

    if (endStatus === 'canceled') {
      if (abortListener) signal.removeEventListener('abort', abortListener);
      return;
    }

    if (endStatus === 'failed' || exitSignal || (exitCode !== null && exitCode !== 0)) {
      const tail = stderrBuf.trim().slice(-400);
      handlers.onError(
        new Error(`agent exited with ${exitSignal ? `signal ${exitSignal}` : `code ${exitCode}`}${tail ? `\n${tail}` : ''}`),
      );
      if (abortListener) signal.removeEventListener('abort', abortListener);
      return;
    }
    if (abortListener) signal.removeEventListener('abort', abortListener);
    handlers.onDone(acc);
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    handlers.onError(err instanceof Error ? err : new Error(String(err)));
  }
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
        typeof data.model === 'string'
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
  if (t === 'tool_use' && typeof data.id === 'string' && typeof data.name === 'string') {
    return { kind: 'tool_use', id: data.id, name: data.name, input: data.input ?? null };
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
