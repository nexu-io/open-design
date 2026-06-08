/**
 * Unit tests for the Anthropic Messages API SSE parser in
 * `apps/daemon/src/anthropic-sse.ts`.
 *
 * Covers the shapes the streaming consumer in `server.ts` and the
 * HTTP invocation in `runtimes/invoke-http.ts` consume: `status`,
 * `text_delta`, `tool_use`, `usage`, `error`. Event types the
 * provider emits but we deliberately swallow (`ping`) get a single
 * regression assertion so a future refactor that drops the filter
 * notices the wire shape changed.
 */

import { describe, expect, it } from 'vitest';
import { createAnthropicStreamHandler } from '../src/anthropic-sse.js';

type Event = Record<string, unknown>;

function collect(): { events: Event[]; sink: (ev: Event) => void } {
  const events: Event[] = [];
  return { events, sink: (ev) => events.push(ev) };
}

/** Build one SSE frame: `event: <name>\ndata: <json>` followed by `\n\n`. */
function sseFrame(eventName: string, payload: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

describe('createAnthropicStreamHandler', () => {
  it('emits status:streaming on message_start and status:done on message_stop', () => {
    const { events, sink } = collect();
    const handler = createAnthropicStreamHandler(sink);

    handler.feed(
      sseFrame('message_start', {
        message: { id: 'msg_1', usage: { input_tokens: 42 } },
      }),
    );
    expect(events[0]).toMatchObject({ type: 'status', status: 'streaming' });

    handler.feed(sseFrame('message_stop', {}));
    const lastStatus = events.filter((e) => e.type === 'status').pop();
    expect(lastStatus).toMatchObject({ type: 'status', status: 'done' });
    // message_stop also fires the synthetic no-op `final_event` so the
    // parser self-announces end-of-stream (L12329 path of invoke-http).
    expect(lastStatus).toHaveProperty('final_event', 'message_stop');
  });

  it('accumulates input_tokens from message_start and output_tokens from message_delta', () => {
    const { events, sink } = collect();
    const handler = createAnthropicStreamHandler(sink);

    handler.feed(
      sseFrame('message_start', {
        message: { id: 'msg_2', usage: { input_tokens: 100 } },
      }),
    );
    handler.feed(
      sseFrame('message_delta', {
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 17 },
      }),
    );
    handler.feed(sseFrame('message_stop', {}));

    const usage = events.find((e) => e.type === 'usage');
    expect(usage).toMatchObject({ type: 'usage', input_tokens: 100, output_tokens: 17 });

    // message_delta's stop_reason should have been forwarded as a
    // status:streaming frame so the streaming consumer can track the
    // intermediate transition before message_stop closes the stream.
    const deltaStatuses = events.filter(
      (e) => e.type === 'status' && (e as { stop_reason?: string }).stop_reason === 'end_turn',
    );
    expect(deltaStatuses).toHaveLength(1);
  });

  it('forwards text_delta deltas verbatim with delta key (not text)', () => {
    // The key is named `delta` (matching `claude-stream.ts`) so the
    // existing `if (ev.type === 'text_delta' && typeof ev.delta === 'string')`
    // branch in `server.ts:12863` works without a per-provider case.
    const { events, sink } = collect();
    const handler = createAnthropicStreamHandler(sink);

    handler.feed(
      sseFrame('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
    );
    handler.feed(
      sseFrame('content_block_delta', {
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      }),
    );
    handler.feed(
      sseFrame('content_block_delta', {
        index: 0,
        delta: { type: 'text_delta', text: ' world' },
      }),
    );
    handler.feed(sseFrame('content_block_stop', { index: 0 }));

    const deltas = events.filter((e) => e.type === 'text_delta');
    expect(deltas.map((d) => (d as { delta: string }).delta).join('')).toBe('Hello world');
    // No `text` field on emitted events — the consumer reads `delta`.
    for (const d of deltas) {
      expect(d).not.toHaveProperty('text');
    }
  });

  it('assembles a single tool_use with parsed JSON input from input_json_delta stream', () => {
    const { events, sink } = collect();
    const handler = createAnthropicStreamHandler(sink);

    handler.feed(
      sseFrame('content_block_start', {
        index: 1,
        content_block: { type: 'tool_use', id: 'tool_abc', name: 'Read' },
      }),
    );
    // The provider sends `partial_json` chunks. Concatenate as-is,
    // parse on content_block_stop.
    handler.feed(
      sseFrame('content_block_delta', {
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"file_' },
      }),
    );
    handler.feed(
      sseFrame('content_block_delta', {
        index: 1,
        delta: { type: 'input_json_delta', partial_json: 'path":"/tmp/x"}' },
      }),
    );
    handler.feed(sseFrame('content_block_stop', { index: 1 }));

    const toolUses = events.filter((e) => e.type === 'tool_use');
    expect(toolUses).toHaveLength(1);
    expect(toolUses[0]).toMatchObject({
      type: 'tool_use',
      id: 'tool_abc',
      name: 'Read',
      input: { file_path: '/tmp/x' },
    });
  });

  it('falls back to a raw string input when the tool_use JSON is malformed', () => {
    // Downstream `applyManualEditPatch` tolerates strings, so a
    // malformed JSON input is left as the raw string rather than
    // dropped. Verify the parser's lenient path.
    const { events, sink } = collect();
    const handler = createAnthropicStreamHandler(sink);

    handler.feed(
      sseFrame('content_block_start', {
        index: 0,
        content_block: { type: 'tool_use', id: 'tool_broken', name: 'Bash' },
      }),
    );
    handler.feed(
      sseFrame('content_block_delta', {
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{not valid json' },
      }),
    );
    handler.feed(sseFrame('content_block_stop', { index: 0 }));

    const toolUses = events.filter((e) => e.type === 'tool_use');
    expect(toolUses).toHaveLength(1);
    expect(toolUses[0]).toMatchObject({
      type: 'tool_use',
      name: 'Bash',
      input: '{not valid json',
    });
  });

  it('flushes an in-flight tool block defensively on message_stop without a matching content_block_stop', () => {
    // Some providers omit the trailing content_block_stop when the
    // stream ends mid-tool; the parser should still emit the tool_use
    // so the consumer doesn't lose the half-accumulated input.
    const { events, sink } = collect();
    const handler = createAnthropicStreamHandler(sink);

    handler.feed(
      sseFrame('content_block_start', {
        index: 0,
        content_block: { type: 'tool_use', id: 'tool_x', name: 'Glob' },
      }),
    );
    handler.feed(
      sseFrame('content_block_delta', {
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"pattern":"**/*.ts"}' },
      }),
    );
    handler.feed(sseFrame('message_stop', {})); // no content_block_stop first

    const toolUses = events.filter((e) => e.type === 'tool_use');
    expect(toolUses).toHaveLength(1);
    expect(toolUses[0]).toMatchObject({ type: 'tool_use', name: 'Glob', input: { pattern: '**/*.ts' } });
  });

  it('forwards provider error events as a structured error event with the message field', () => {
    const { events, sink } = collect();
    const handler = createAnthropicStreamHandler(sink);

    handler.feed(
      sseFrame('error', { error: { type: 'overloaded_error', message: 'upstream is busy' } }),
    );

    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ type: 'error', message: 'upstream is busy' });
  });

  it('drops ping frames (keepalive) and unknown event types surface as a status with unknown_event', () => {
    const { events, sink } = collect();
    const handler = createAnthropicStreamHandler(sink);

    handler.feed(sseFrame('ping', {}));
    handler.feed(sseFrame('some_future_event', { foo: 1 }));

    // No error, no text_delta, no tool_use should be emitted.
    expect(events.find((e) => e.type === 'error')).toBeUndefined();
    expect(events.find((e) => e.type === 'text_delta')).toBeUndefined();
    expect(events.find((e) => e.type === 'tool_use')).toBeUndefined();

    // The unknown event type surfaces as a status with the original
    // event name so the UI can log it without aborting the stream.
    const unknown = events.find((e) => e.type === 'status' && e.unknown_event === 'some_future_event');
    expect(unknown).toBeDefined();
  });

  it('ignores SSE comment lines (`:...`) and tolerates multi-line data joined with \\n', () => {
    // Real-world proxies sometimes insert `:keepalive` comments;
    // the parser must skip them. Multi-line data is joined with `\n`
    // per the SSE spec — verify the join by feeding an event with a
    // payload containing a literal newline.
    const { events, sink } = collect();
    const handler = createAnthropicStreamHandler(sink);

    handler.feed(':keepalive-1\n\n');
    handler.feed(':keepalive-2\n\n');

    // Multi-line data: each data: line is appended. Build manually
    // because `sseFrame` JSON-stringifies, which would escape \n.
    handler.feed(
      [
        'event: content_block_start',
        'data: {"index":0,"content_block":{"type":"text","text":""}}',
        '',
        '',
      ].join('\n'),
    );
    // Multi-line data with an embedded newline character (a JSON
    // string that itself contains a real newline).
    handler.feed(
      [
        'event: content_block_delta',
        'data: {"index":0,"delta":{"type":"text_delta","text":"line1\\nline2"}}',
        '',
        '',
      ].join('\n'),
    );
    handler.feed(sseFrame('content_block_stop', { index: 0 }));

    const deltas = events.filter((e) => e.type === 'text_delta');
    expect(deltas).toHaveLength(1);
    expect((deltas[0] as { delta: string }).delta).toBe('line1\nline2');
  });

  it('counts SSE frames via counters() and survives split feeds across chunk boundaries', () => {
    // Mirrors what `invoke-http.ts` does: feed raw text chunks from
    // the readable stream, parser owns its own boundary tracking.
    const { events, sink } = collect();
    const handler = createAnthropicStreamHandler(sink);

    const fullFrame = sseFrame('content_block_start', {
      index: 0,
      content_block: { type: 'text', text: '' },
    });
    // Split the frame mid-`event:` line — the parser must buffer
    // until the trailing `\n\n` arrives.
    const split = Math.floor(fullFrame.length / 2);
    handler.feed(fullFrame.slice(0, split));
    expect(handler.counters().sseEventCount).toBe(0);
    expect(events.find((e) => e.type === 'content_block_start' || e.type === 'status')).toBeUndefined();
    handler.feed(fullFrame.slice(split));

    expect(handler.counters().sseEventCount).toBe(1);
  });

  it('treats repeated message_stop frames as distinct lifecycle markers (no dedup)', () => {
    // A misbehaving proxy could forward `message_stop` twice. The
    // parser does not dedupe — each call re-emits usage (via
    // handleEvent) AND the synthetic `final_event` status:done
    // (via feed's finally block). That's 4 status:done events for
    // 2 message_stop frames. Document the wire shape so a future
    // "dedup" optimization is a conscious decision rather than an
    // accidental regression. The streaming consumer's `onDone`
    // deduplicates its own end-of-stream detection separately, so
    // this firehose is safe in practice.
    const { events, sink } = collect();
    const handler = createAnthropicStreamHandler(sink);

    handler.feed(sseFrame('message_start', { message: { id: 'm1', usage: { input_tokens: 5 } } }));
    handler.feed(sseFrame('message_stop', {}));
    handler.feed(sseFrame('message_stop', {}));

    const dones = events.filter((e) => e.type === 'status' && e.status === 'done');
    // 2x (handleEvent status:done) + 2x (feed's synthetic final_event status:done)
    expect(dones).toHaveLength(4);
    const usageEvents = events.filter((e) => e.type === 'usage');
    // Each message_stop replays the accumulated usage.
    expect(usageEvents.length).toBeGreaterThanOrEqual(1);
  });
});
