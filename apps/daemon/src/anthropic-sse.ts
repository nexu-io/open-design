/**
 * Parses the Anthropic Messages API SSE stream
 * (`POST {baseUrl}/v1/messages` with `stream: true`) into the same
 * small set of UI-friendly events the rest of the daemon already
 * consumes.
 *
 * Wire format (SSE): each event is one or more `event: <name>\ndata: <json>`
 * lines, separated from the next by a blank line (`\n\n`). Comments
 * start with `:`. The provider sends the same envelope over
 * `ReadlineString` (claude CLI's `--output-format stream-json`) and
 * over HTTP+SSE; the parser cares only about the SSE framing.
 *
 * Event shape emitted to the caller's `onEvent` (matches the
 * conventions of `claude-stream.ts` so the streaming consumer in
 * `server.ts` doesn't need a new branch per provider):
 *
 *   - status          : { status: 'streaming' | 'done' [, stop_reason] }
 *   - text_delta      : { delta }                 — assistant text chunk
 *   - tool_use        : { id, name, input }       — input fully accumulated
 *   - tool_result     : { tool_use_id, content, is_error }
 *   - usage           : { input_tokens, output_tokens }
 *   - error           : { message }               — provider-side error event
 *
 * Tool-use accumulation mirrors `claude-stream.ts:BlockState`:
 * `content_block_start` (type `tool_use`) opens a buffer; each
 * `content_block_delta` of type `input_json_delta` appends
 * `partial_json`; the matching `content_block_stop` parses the
 * accumulated buffer and emits one `tool_use`. The downstream
 * `applyManualEditPatch` path tolerates string-valued inputs, so a
 * malformed JSON input is left as the raw string rather than
 * dropped.
 */

type StreamEvent = Record<string, unknown>;
export type AnthropicEventSink = (event: StreamEvent) => void;

interface ToolBlock {
  type: 'tool_use';
  id?: string;
  name?: string;
  input: string;
}

type BlockState = ToolBlock | null;

const FINAL_SSE_EVENT_TYPES: ReadonlySet<string> = new Set(['message_stop', 'error']);

export function createAnthropicStreamHandler(onEvent: AnthropicEventSink) {
  let buffer = '';
  let block: BlockState = null;
  let usage: { input_tokens?: number; output_tokens?: number } | null = null;
  let totalToolUseCount = 0;
  let sseEventCount = 0;

  function flushToolBlock(): void {
    if (!block || block.type !== 'tool_use') return;
    const raw = block.input;
    let parsedInput: unknown = raw;
    if (raw.length > 0) {
      try {
        parsedInput = JSON.parse(raw);
      } catch {
        // Leave as raw string; downstream consumers tolerate strings
        // and surface their own structured parse error if they care.
      }
    } else {
      parsedInput = {};
    }
    if (block.id) totalToolUseCount++;
    onEvent({
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input: parsedInput,
    });
    block = null;
  }

  function handleEvent(type: string, data: string): void {
    if (data.length === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      // Tolerate malformed frames; the provider signals hard errors
      // through a separate `error` event if it cares.
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;
    const evt = parsed as Record<string, unknown>;

    switch (type) {
      case 'message_start': {
        const message = evt.message as { usage?: { input_tokens?: number } } | undefined;
        if (message?.usage?.input_tokens !== undefined) {
          usage = { ...(usage ?? {}), input_tokens: message.usage.input_tokens };
        }
        onEvent({ type: 'status', status: 'streaming' });
        return;
      }

      case 'content_block_start': {
        const cb = evt.content_block as { type?: string; id?: string; name?: string } | undefined;
        if (cb?.type === 'tool_use') {
          // exactOptionalPropertyTypes forbids `id: undefined` for an
          // optional field, so build the object without absent keys.
          block = {
            type: 'tool_use',
            input: '',
            ...(typeof cb.id === 'string' ? { id: cb.id } : {}),
            ...(typeof cb.name === 'string' ? { name: cb.name } : {}),
          };
        } else {
          // text blocks don't need buffering; deltas go straight through.
          block = null;
        }
        return;
      }

      case 'content_block_delta': {
        const delta = evt.delta as { type?: string; text?: string; partial_json?: string } | undefined;
        if (!delta) return;
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          onEvent({ type: 'text_delta', delta: delta.text });
          return;
        }
        if (delta.type === 'input_json_delta' && block?.type === 'tool_use') {
          if (typeof delta.partial_json === 'string') {
            block.input += delta.partial_json;
          }
          return;
        }
        return;
      }

      case 'content_block_stop': {
        flushToolBlock();
        return;
      }

      case 'message_delta': {
        const delta = evt.delta as { stop_reason?: string } | undefined;
        const u = evt.usage as { output_tokens?: number } | undefined;
        if (u?.output_tokens !== undefined) {
          usage = { ...(usage ?? {}), output_tokens: u.output_tokens };
        }
        if (delta?.stop_reason) {
          onEvent({ type: 'status', status: 'streaming', stop_reason: delta.stop_reason });
        }
        return;
      }

      case 'message_stop': {
        // Defensive: flush any in-flight tool block in case the
        // provider sent a malformed stream that lacks a matching
        // content_block_stop.
        flushToolBlock();
        if (usage) onEvent({ type: 'usage', ...usage });
        onEvent({ type: 'status', status: 'done' });
        return;
      }

      case 'ping': {
        return; // keepalive frames are common with proxies
      }

      case 'error': {
        const err = evt.error as { type?: string; message?: string } | undefined;
        onEvent({
          type: 'error',
          message: err?.message ?? JSON.stringify(evt),
        });
        return;
      }

      default: {
        // Unknown event type — surface as a status so the UI can
        // log it without aborting the stream.
        onEvent({ type: 'status', status: 'streaming', unknown_event: type });
        return;
      }
    }
  }

  return {
    /**
     * Feed a raw text chunk (one read from the SSE response body)
     * to the parser. Splits on `\n\n` boundaries, dispatches each
     * `event: <type>\ndata: <json>` block to `handleEvent`.
     */
    feed(chunk: string): void {
      buffer += chunk;
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        // Each SSE block is a sequence of lines; we only care about
        // `event:` and `data:` lines (comments start with `:`).
        let eventName: string | null = null;
        const dataLines: string[] = [];
        for (const line of block.split('\n')) {
          if (line.length === 0) continue;
          if (line.startsWith(':')) continue;
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
        if (eventName && dataLines.length > 0) {
          sseEventCount++;
          const isFinal = FINAL_SSE_EVENT_TYPES.has(eventName);
          try {
            handleEvent(eventName, dataLines.join('\n'));
          } finally {
            if (isFinal) {
              // Surface a no-op observation so the streaming consumer
              // can detect end-of-stream; the Anthropic consumer also
              // watches fetch body close, but this makes the parser's
              // lifecycle self-contained.
              onEvent({ type: 'status', status: 'done', final_event: eventName });
            }
          }
        }
      }
    },

    /** Diagnostic counters; useful for tests + log enrichment. */
    counters(): { sseEventCount: number; totalToolUseCount: number } {
      return { sseEventCount, totalToolUseCount };
    },
  };
}

export type AnthropicStreamHandler = ReturnType<typeof createAnthropicStreamHandler>;
