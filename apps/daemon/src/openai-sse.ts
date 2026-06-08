/**
 * Parses the OpenAI Chat Completions streaming API
 * (`POST {baseUrl}/v1/chat/completions` with `stream: true`) into
 * the same UI-friendly event set the rest of the daemon already
 * consumes.
 *
 * Wire format (SSE): each event is exactly one `data: <json>` line
 * followed by a blank line (`\n\n`). The stream terminates with
 * `data: [DONE]`. Comments start with `:`. The wire format is the
 * de-facto standard for OpenAI, DeepSeek, OpenRouter, GLM, vLLM,
 * Ollama — any provider that speaks "OpenAI-compatible" chat
 * completions will emit this shape.
 *
 * Event shape emitted to the caller's `onEvent` (matches the
 * conventions of `claude-stream.ts` and `anthropic-sse.ts` so the
 * streaming consumer in `server.ts` doesn't need a per-provider
 * branch):
 *
 *   - status          : { status: 'streaming' | 'done' [, stop_reason] }
 *   - text_delta      : { delta }                 — assistant text chunk
 *   - tool_use        : { id, name, input }       — input fully accumulated
 *   - usage           : { input_tokens, output_tokens }
 *   - error           : { message }               — provider-side error event
 *
 * Tool-call accumulation mirrors Anthropic's: each `delta.tool_calls`
 * entry is keyed by `index`; `id` and `function.name` arrive on the
 * first delta, `function.arguments` is a JSON string that
 * accumulates across deltas. The parser flushes any in-flight tool
 * calls on `[DONE]` or any `finish_reason` (e.g. `stop`,
 * `tool_calls`, `length`). Malformed `function.arguments` JSON is
 * left as the raw string — downstream consumers tolerate strings and
 * surface their own structured parse error if they care.
 */

type StreamEvent = Record<string, unknown>;
export type OpenaiEventSink = (event: StreamEvent) => void;

interface ToolCallAccumulator {
  /** Set on the first delta that carries the tool call id. */
  id?: string;
  /** Set on the first delta that carries the function name. */
  name?: string;
  /** Raw JSON string accumulated across deltas. Parsed at flush. */
  args: string;
}

type ToolCallsByIndex = Map<number, ToolCallAccumulator>;

export function createOpenaiStreamHandler(onEvent: OpenaiEventSink) {
  let buffer = '';
  let sseEventCount = 0;
  let totalToolUseCount = 0;
  const toolCalls: ToolCallsByIndex = new Map();

  function flushToolCalls(): void {
    if (toolCalls.size === 0) return;
    for (const [, tc] of toolCalls) {
      let input: unknown = tc.args;
      if (input && typeof input === 'string' && input.length > 0) {
        try {
          input = JSON.parse(input);
        } catch {
          // Leave as raw string; downstream consumers tolerate strings.
        }
      } else {
        input = {};
      }
      onEvent({
        type: 'tool_use',
        id: tc.id,
        name: tc.name,
        input,
      });
      if (tc.id) totalToolUseCount++;
    }
    toolCalls.clear();
  }

  function handleFrame(payload: string): void {
    if (payload === '[DONE]') {
      // End of stream. Flush any in-flight tool calls defensively
      // (the provider should have sent `finish_reason: tool_calls`
      // first, but a misbehaving proxy may skip that).
      flushToolCalls();
      onEvent({ type: 'status', status: 'done', final_event: 'data_[DONE]' });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      // Tolerate malformed frames; some providers insert keepalive
      // comments or extra whitespace that survives our trim.
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;
    const evt = parsed as Record<string, unknown>;

    // OpenAI error envelope: `{ "error": { "message": "...", "type": "..." } }`.
    // Surface as a structured `error` event so the streaming consumer's
    // existing error path can pick it up.
    const errField = evt.error;
    if (errField && typeof errField === 'object') {
      const msg = (errField as Record<string, unknown>).message;
      onEvent({
        type: 'error',
        message: typeof msg === 'string' ? msg : JSON.stringify(errField),
      });
      return;
    }

    // Usage accounting. Some providers (DeepSeek) emit usage on a
    // final frame with `choices: []` and a `usage` field; OpenAI's
    // own API requires `stream_options: { include_usage: true }`.
    // We forward the frame regardless of which slot the usage lives
    // in, so the consumer can stamp it for the `usage` SSE event.
    const usage = evt.usage as
      | { prompt_tokens?: number; completion_tokens?: number }
      | undefined;
    if (usage && (typeof usage.prompt_tokens === 'number' || typeof usage.completion_tokens === 'number')) {
      const next: { input_tokens?: number; output_tokens?: number } = {};
      if (typeof usage.prompt_tokens === 'number') next.input_tokens = usage.prompt_tokens;
      if (typeof usage.completion_tokens === 'number') next.output_tokens = usage.completion_tokens;
      onEvent({ type: 'usage', ...next });
    }

    const choices = evt.choices;
    if (!Array.isArray(choices) || choices.length === 0) return;

    for (const choice of choices) {
      if (!choice || typeof choice !== 'object') continue;
      const c = choice as Record<string, unknown>;
      const delta = c.delta as
        | { role?: string; content?: string; tool_calls?: Array<Record<string, unknown>> }
        | undefined;
      const finishReason = c.finish_reason;

      if (delta?.content && typeof delta.content === 'string') {
        onEvent({ type: 'text_delta', delta: delta.content });
      }

      if (Array.isArray(delta?.tool_calls)) {
        for (const tcDelta of delta.tool_calls) {
          if (!tcDelta || typeof tcDelta !== 'object') continue;
          const idx = typeof tcDelta.index === 'number' ? tcDelta.index : 0;
          let acc = toolCalls.get(idx);
          if (!acc) {
            acc = { args: '' };
            toolCalls.set(idx, acc);
          }
          if (typeof tcDelta.id === 'string') acc.id = tcDelta.id;
          const fn = tcDelta.function as { name?: string; arguments?: string } | undefined;
          if (fn?.name) acc.name = fn.name;
          if (typeof fn?.arguments === 'string') acc.args += fn.arguments;
        }
      }

      if (typeof finishReason === 'string' && finishReason.length > 0) {
        // Flush any accumulated tool calls before signaling the
        // turn-end status — downstream consumers expect to see the
        // tool_use events before the status:done / stop_reason frame.
        flushToolCalls();
        onEvent({ type: 'status', status: 'streaming', stop_reason: finishReason });
      }
    }
  }

  return {
    /**
     * Feed a raw text chunk (one read from the SSE response body)
     * to the parser. Splits on `\n\n` boundaries, dispatches each
     * `data: <json>` line to `handleFrame`.
     */
    feed(chunk: string): void {
      buffer += chunk;
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        // Each SSE block is a sequence of lines; we only care about
        // `data:` lines (comments start with `:`). The OpenAI
        // protocol puts exactly one `data:` line per block; multiple
        // `data:` lines in a single block are joined with `\n` so
        // a multi-line JSON payload round-trips intact.
        const dataLines: string[] = [];
        for (const line of block.split('\n')) {
          if (line.length === 0) continue;
          if (line.startsWith(':')) continue;
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
        if (dataLines.length > 0) {
          sseEventCount++;
          handleFrame(dataLines.join('\n'));
        }
      }
    },

    /** Diagnostic counters; useful for tests + log enrichment. */
    counters(): { sseEventCount: number; totalToolUseCount: number } {
      return { sseEventCount, totalToolUseCount };
    },
  };
}

export type OpenaiStreamHandler = ReturnType<typeof createOpenaiStreamHandler>;
