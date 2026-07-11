/** @module agent-protocol/pi-rpc/events
 * Pure event mapper for pi's JSON-RPC stream protocol. Translates raw JSON
 * objects emitted by `pi --mode rpc` into the daemon's typed UI events:
 * status, text_delta, thinking, tool_use, tool_result, usage, and error.
 * No I/O — all side effects flow through the SendAgentEvent callback.
 */
import type { JsonRecord, SendAgentEvent, TokenUsage } from './internal.js';
import { getRecord } from './internal.js';

/** Timing and first-token-tracking context threaded through every mapPiRpcEvent call. */
export type PiRpcContext = {
  runStartedAt: number;
  sentFirstToken: { value: boolean };
};
/**
 * Maps a single raw pi RPC JSON object to zero or more daemon SSE events,
 * dispatching each through `send`. Returns `'agent_end'` when pi signals the
 * end of the run; returns `null` for every other event type.
 *
 * @param raw  - Parsed JSON object read from pi's stdout.
 * @param send - Callback that forwards a typed event to the daemon SSE layer.
 * @param ctx  - Per-run context: start timestamp and first-token sentinel.
 * @returns `'agent_end'` on run completion, `null` otherwise.
 */
export function mapPiRpcEvent(
  raw: JsonRecord,
  send: SendAgentEvent,
  ctx: PiRpcContext,
): 'agent_end' | null {
  if (raw.type === 'agent_start') {
    send('agent', { type: 'status', label: 'working' });
    return null;
  }

  if (raw.type === 'agent_end') {
    return 'agent_end';
  }

  if (raw.type === 'turn_start') {
    send('agent', { type: 'status', label: 'thinking' });
    return null;
  }

  if (raw.type === 'turn_end') {
    const message = getRecord(raw.message);
    const messageUsage = getRecord(message?.usage);
    if (messageUsage) {
      const u = messageUsage;
      const usage: TokenUsage = {};
      if (typeof u.input === 'number') usage.input_tokens = u.input;
      if (typeof u.output === 'number') usage.output_tokens = u.output;
      if (typeof u.cacheRead === 'number') usage.cached_read_tokens = u.cacheRead;
      if (typeof u.cacheWrite === 'number') usage.cached_write_tokens = u.cacheWrite;
      if (typeof u.totalTokens === 'number') usage.total_tokens = u.totalTokens;
      if (Object.keys(usage).length > 0) {
        const cost = getRecord(u.cost);
        send('agent', {
          type: 'usage',
          usage,
          costUsd: cost?.total ?? cost?.totalCost ?? null,
          durationMs: Date.now() - ctx.runStartedAt,
        });
      }
    }

    if (message?.stopReason === 'error') {
      const messageText =
        typeof message.errorMessage === 'string' && message.errorMessage.length > 0
          ? message.errorMessage
          : 'Pi agent error';
      send('agent', { type: 'error', message: messageText, raw });
    }
    return null;
  }

  const assistantMessageEvent = getRecord(raw.assistantMessageEvent);
  if (raw.type === 'message_update' && assistantMessageEvent) {
    const ev = assistantMessageEvent;

    if (ev.type === 'text_delta' && typeof ev.delta === 'string') {
      if (!ctx.sentFirstToken.value) {
        ctx.sentFirstToken.value = true;
        send('agent', {
          type: 'status',
          label: 'streaming',
          ttftMs: Date.now() - ctx.runStartedAt,
        });
      }
      send('agent', { type: 'text_delta', delta: ev.delta });
      return null;
    }

    if (ev.type === 'thinking_delta' && typeof ev.delta === 'string') {
      send('agent', { type: 'thinking_delta', delta: ev.delta });
      return null;
    }

    if (ev.type === 'thinking_start') {
      send('agent', { type: 'thinking_start' });
      return null;
    }

    if (ev.type === 'thinking_end') {
      send('agent', { type: 'thinking_end' });
      return null;
    }

    // pi's RPC protocol emits a message_update with error delta when
    // the model returns an error (e.g. aborted, context overflow).
    // Surface it so sendAgentEvent's error-handling path sets
    // agentStreamError and the run flips to `failed` on close.
    if (ev.type === 'error') {
      const message =
        typeof ev.reason === 'string' && ev.reason.length > 0
          ? ev.reason
          : typeof ev.delta === 'string' && ev.delta.length > 0
            ? ev.delta
            : 'Agent error';
      send('agent', { type: 'error', message, raw });
      return null;
    }

    return null;
  }

  if (raw.type === 'message_end') {
    // message_end carries usage (already emitted from turn_end) and
    // tool call blocks (already emitted from tool_execution_start).
    // Nothing to extract here.
    return null;
  }

  if (raw.type === 'tool_execution_start') {
    send('agent', {
      type: 'tool_use',
      id: raw.toolCallId ?? null,
      name: raw.toolName ?? null,
      input: raw.args ?? null,
    });
    return null;
  }

  if (raw.type === 'tool_execution_end') {
    const result = getRecord(raw.result);
    const content = result?.content;
    const text =
      Array.isArray(content)
        ? content
            .map((c: unknown) => {
              const item = getRecord(c);
              return item?.type === 'text' ? String(item.text ?? '') : JSON.stringify(c);
            })
            .join('\n')
        : typeof content === 'string'
          ? content
          : '';
    send('agent', {
      type: 'tool_result',
      toolUseId: raw.toolCallId ?? null,
      content: text,
      isError: raw.isError === true,
    });
    return null;
  }

  // pi's RPC protocol can emit `extension_error` when an extension
  // throws during a tool call or event handler. Surface it so the
  // daemon's error-handling path (sendAgentEvent → agentStreamError)
  // can flip the run to `failed` and forward a visible SSE error.
  if (raw.type === 'extension_error') {
    const message =
      typeof raw.error === 'string' && raw.error.length > 0
        ? raw.error
        : 'Extension error';
    send('agent', { type: 'error', message, raw });
    return null;
  }

  if (raw.type === 'compaction_start') {
    send('agent', { type: 'status', label: 'compacting' });
    return null;
  }
  if (raw.type === 'auto_retry_start') {
    send('agent', { type: 'status', label: 'retrying' });
    return null;
  }

  if (raw.type === 'auto_retry_end' && raw.success === false) {
    // Auto-retry exhausted — the agent is about to give up. Surface
    // the final error so the daemon marks the run as failed rather
    // than silently succeeding with empty output.
    const message =
      typeof raw.finalError === 'string' && raw.finalError.length > 0
        ? raw.finalError
        : 'Auto-retry exhausted';
    send('agent', { type: 'error', message, raw });
    return null;
  }

  return null;
}
