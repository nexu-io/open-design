/**
 * Unit tests for the OpenAI Chat Completions streaming parser in
 * `apps/daemon/src/openai-sse.ts`.
 *
 * Mirrors `anthropic-sse.test.ts` in shape: covers the event types
 * the streaming consumer in `server.ts` and the HTTP invocation in
 * `runtimes/invoke-http.ts` consume. The OpenAI wire format is one
 * `data: <json>` line per event followed by `\n\n`, terminating with
 * `data: [DONE]`. Tool calls accumulate across deltas; the parser
 * flushes them on `[DONE]` or any `finish_reason` and tolerates
 * malformed `function.arguments` JSON.
 */

import { describe, expect, it } from 'vitest';
import { createOpenaiStreamHandler } from '../src/openai-sse.js';

type Event = Record<string, unknown>;

function collect(): { events: Event[]; sink: (ev: Event) => void } {
  const events: Event[] = [];
  return { events, sink: (ev) => events.push(ev) };
}

/** Build one SSE frame: `data: <payload>` followed by `\n\n`. */
function dataFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** Build the [DONE] sentinel frame. */
function doneFrame(): string {
  return 'data: [DONE]\n\n';
}

describe('createOpenaiStreamHandler', () => {
  it('emits text_delta on each content delta and ends with status:done on [DONE]', () => {
    const { events, sink } = collect();
    const handler = createOpenaiStreamHandler(sink);

    handler.feed(dataFrame({
      id: 'cmpl-1',
      object: 'chat.completion.chunk',
      model: 'deepseek-chat',
      choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
    }));
    handler.feed(dataFrame({
      choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
    }));
    handler.feed(dataFrame({
      choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
    }));
    handler.feed(doneFrame());

    const deltas = events.filter((e) => e.type === 'text_delta');
    expect(deltas.map((d) => (d as { delta: string }).delta).join('')).toBe('Hello world');

    const lastDone = events
      .filter((e) => e.type === 'status' && e.status === 'done')
      .pop();
    expect(lastDone).toMatchObject({ type: 'status', status: 'done' });
    expect(lastDone).toHaveProperty('final_event', 'data_[DONE]');
  });

  it('forwards usage as a single usage event when present on a frame', () => {
    const { events, sink } = collect();
    const handler = createOpenaiStreamHandler(sink);

    handler.feed(dataFrame({
      choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }],
    }));
    handler.feed(dataFrame({
      choices: [],
      usage: { prompt_tokens: 17, completion_tokens: 7, total_tokens: 24 },
    }));
    handler.feed(doneFrame());

    const usageEvents = events.filter((e) => e.type === 'usage');
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toMatchObject({
      type: 'usage',
      input_tokens: 17,
      output_tokens: 7,
    });
  });

  it('assembles a single tool_use from accumulating tool_calls deltas and flushes on [DONE]', () => {
    const { events, sink } = collect();
    const handler = createOpenaiStreamHandler(sink);

    handler.feed(dataFrame({
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            index: 0,
            id: 'call_abc',
            type: 'function',
            function: { name: 'get_weather', arguments: '' },
          }],
        },
        finish_reason: null,
      }],
    }));
    handler.feed(dataFrame({
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{ index: 0, function: { arguments: '{"location"' } }],
        },
        finish_reason: null,
      }],
    }));
    handler.feed(dataFrame({
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{ index: 0, function: { arguments: ':"SF"}' } }],
        },
        finish_reason: null,
      }],
    }));
    handler.feed(dataFrame({
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
    }));
    handler.feed(doneFrame());

    const toolUses = events.filter((e) => e.type === 'tool_use');
    expect(toolUses).toHaveLength(1);
    expect(toolUses[0]).toMatchObject({
      type: 'tool_use',
      id: 'call_abc',
      name: 'get_weather',
      input: { location: 'SF' },
    });

    // finish_reason: tool_calls should also have produced a status:streaming
    // frame with stop_reason so the streaming consumer can track the
    // intermediate transition before [DONE] closes the stream.
    const stopFrames = events.filter(
      (e) => e.type === 'status' && (e as { stop_reason?: string }).stop_reason === 'tool_calls',
    );
    expect(stopFrames).toHaveLength(1);
  });

  it('falls back to a raw string input when tool_call arguments JSON is malformed', () => {
    const { events, sink } = collect();
    const handler = createOpenaiStreamHandler(sink);

    handler.feed(dataFrame({
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index: 0,
            id: 'call_broken',
            type: 'function',
            function: { name: 'Bash', arguments: '{not valid' },
          }],
        },
      }],
    }));
    handler.feed(doneFrame());

    const toolUses = events.filter((e) => e.type === 'tool_use');
    expect(toolUses).toHaveLength(1);
    expect(toolUses[0]).toMatchObject({
      type: 'tool_use',
      name: 'Bash',
      input: '{not valid',
    });
  });

  it('forwards error envelopes as a structured error event', () => {
    const { events, sink } = collect();
    const handler = createOpenaiStreamHandler(sink);

    handler.feed(dataFrame({
      error: { message: 'upstream overloaded', type: 'overloaded_error' },
    }));

    const errors = events.filter((e) => e.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ type: 'error', message: 'upstream overloaded' });
  });

  it('ignores SSE comment lines (`:...`) and tolerates malformed JSON', () => {
    const { events, sink } = collect();
    const handler = createOpenaiStreamHandler(sink);

    handler.feed(':keepalive-1\n\n');
    handler.feed(':keepalive-2\n\n');
    // Malformed JSON in a `data:` line is silently dropped; a
    // subsequent valid frame still parses.
    handler.feed('data: {not valid json\n\n');
    handler.feed(dataFrame({
      choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: null }],
    }));
    handler.feed(doneFrame());

    expect(events.find((e) => e.type === 'error')).toBeUndefined();
    const deltas = events.filter((e) => e.type === 'text_delta');
    expect(deltas).toHaveLength(1);
    expect((deltas[0] as { delta: string }).delta).toBe('ok');
  });

  it('counts SSE frames via counters() and survives split feeds across chunk boundaries', () => {
    const { events, sink } = collect();
    const handler = createOpenaiStreamHandler(sink);

    const fullFrame = dataFrame({
      choices: [{ index: 0, delta: { content: 'split' }, finish_reason: null }],
    });
    const split = Math.floor(fullFrame.length / 2);
    handler.feed(fullFrame.slice(0, split));
    expect(handler.counters().sseEventCount).toBe(0);
    expect(events.find((e) => e.type === 'text_delta')).toBeUndefined();
    handler.feed(fullFrame.slice(split));

    expect(handler.counters().sseEventCount).toBe(1);
    expect((events.find((e) => e.type === 'text_delta') as { delta: string }).delta).toBe('split');
  });

  it('handles multiple parallel tool_calls with distinct index values', () => {
    const { events, sink } = collect();
    const handler = createOpenaiStreamHandler(sink);

    // Two tool calls emitted in parallel; deltas arrive interleaved
    // across chunks but keyed by `index` so the parser keeps them
    // separate.
    handler.feed(dataFrame({
      choices: [{
        index: 0,
        delta: {
          tool_calls: [
            { index: 0, id: 'call_a', type: 'function', function: { name: 'fn_a', arguments: '' } },
            { index: 1, id: 'call_b', type: 'function', function: { name: 'fn_b', arguments: '' } },
          ],
        },
      }],
    }));
    handler.feed(dataFrame({
      choices: [{
        index: 0,
        delta: {
          tool_calls: [
            { index: 0, function: { arguments: '{"x":1}' } },
            { index: 1, function: { arguments: '{"y":2}' } },
          ],
        },
      }],
    }));
    handler.feed(doneFrame());

    const toolUses = events.filter((e) => e.type === 'tool_use');
    expect(toolUses).toHaveLength(2);
    const byId = Object.fromEntries(
      toolUses.map((t) => [t.id as string, t]),
    );
    expect(byId.call_a).toMatchObject({ name: 'fn_a', input: { x: 1 } });
    expect(byId.call_b).toMatchObject({ name: 'fn_b', input: { y: 2 } });
  });
});
