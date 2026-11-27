import { describe, expect, it } from 'vitest';
import { createCommandCodeStreamHandler } from '../../src/runtimes/command-code-stream.js';

type StreamEvent = Record<string, unknown>;

function collect() {
  const events: StreamEvent[] = [];
  const handler = createCommandCodeStreamHandler((event) => {
    events.push(event);
  });
  return { events, handler };
}

/** One NDJSON line per frame, exactly as `--output-format json` writes it. */
function ndjson(...frames: unknown[]): string {
  return frames.map((frame) => JSON.stringify(frame)).join('\n') + '\n';
}

const event = (frame: Record<string, unknown>) => ({ type: 'event', event: frame });

/**
 * A real tool-using turn, captured from CLI 1.69.0 and trimmed only in the
 * `run_end` state blob. The frames the parser maps, the frames it must ignore
 * (cumulative `message_update` repeats), and the terminal result are all here
 * in the order the CLI emits them.
 */
function realToolRunFrames() {
  return [
    event({ type: 'run_start', sessionId: 'sess-1' }),
    event({ type: 'turn_start', turnNumber: 1 }),
    event({ type: 'message_start' }),
    event({ type: 'model_request_start', model: 'deepseek/deepseek-v4-flash' }),
    event({ type: 'model_trace', traceId: 'trace-1' }),
    event({ type: 'text_delta', delta: "I'll read notes" }),
    event({ type: 'message_update', content: [{ type: 'text', text: "I'll read notes" }] }),
    event({ type: 'text_delta', delta: '.txt.' }),
    event({
      type: 'message_update',
      content: [
        { type: 'text', text: "I'll read notes.txt." },
        {
          type: 'tool_use',
          id: 'call_00_read',
          name: 'read_file',
          input: { file_path: 'C:\\project\\notes.txt' },
        },
      ],
    }),
    event({
      type: 'model_request_end',
      model: 'deepseek/deepseek-v4-flash',
      usage: { inputTokens: 15913, outputTokens: 71 },
      stopReason: 'tool_calls',
    }),
    event({
      type: 'message_end',
      content: [
        { type: 'text', text: "I'll read notes.txt." },
        {
          type: 'tool_use',
          id: 'call_00_read',
          name: 'read_file',
          input: { file_path: 'C:\\project\\notes.txt' },
        },
      ],
    }),
    event({
      type: 'tool_queued',
      toolCallId: 'call_00_read',
      toolName: 'read_file',
      input: { file_path: 'C:\\project\\notes.txt' },
    }),
    event({ type: 'tool_running', toolCallId: 'call_00_read', toolName: 'read_file', description: null }),
    event({
      type: 'tool_completed',
      toolCallId: 'call_00_read',
      toolName: 'read_file',
      result: [{ type: 'text', text: 'Read 1/1 file, 1 line\n1: alpha beta gamma' }],
      deferred: false,
    }),
    event({ type: 'turn_end', turnNumber: 1, hadToolCalls: true }),
    event({ type: 'turn_start', turnNumber: 2 }),
    event({ type: 'message_start' }),
    event({ type: 'model_request_start', model: 'deepseek/deepseek-v4-flash' }),
    event({ type: 'text_delta', delta: 'alpha' }),
    event({ type: 'message_update', content: [{ type: 'text', text: 'alpha' }] }),
    event({ type: 'message_end', content: [{ type: 'text', text: 'alpha' }] }),
    {
      type: 'result',
      subtype: 'success',
      sessionId: 'sess-1',
      stopReason: 'end_turn',
      usage: { inputTokens: 20311, outputTokens: 12 },
      durationMs: 9021,
      finalText: "I'll read notes.txt. alpha",
    },
  ];
}

describe('command-code stream: real tool run', () => {
  it('maps exactly the frames that carry user-visible facts', () => {
    const { events, handler } = collect();
    handler.feed(ndjson(...realToolRunFrames()));
    handler.flush();

    expect(events.map((e) => e.type)).toEqual([
      'status', // run_start → session id
      'status', // first model_request_start → resolved model
      'text_delta',
      'text_delta',
      'tool_use', // tool_queued carries the input
      'tool_result', // tool_completed carries the output
      'text_delta',
      'usage',
    ]);
    expect(events[0]).toMatchObject({ label: 'initializing', sessionId: 'sess-1' });
    expect(events[1]).toMatchObject({ label: 'initializing', model: 'deepseek/deepseek-v4-flash' });
    expect(events[2]).toMatchObject({ delta: "I'll read notes" });
    expect(events[3]).toMatchObject({ delta: '.txt.' });
    expect(events[4]).toMatchObject({
      id: 'call_00_read',
      name: 'read_file',
      input: { file_path: 'C:\\project\\notes.txt' },
    });
    expect(events[5]).toMatchObject({
      toolUseId: 'call_00_read',
      content: 'Read 1/1 file, 1 line\n1: alpha beta gamma',
      isError: false,
    });
    expect(typeof events[5]!.completedAt).toBe('number');
    // The second turn streamed its text; the result frame must not repeat it.
    expect(events[6]).toMatchObject({ delta: 'alpha' });
    expect(events[7]).toMatchObject({
      usage: { input_tokens: 20311, output_tokens: 12 },
      durationMs: 9021,
      stopReason: 'end_turn',
      isError: false,
    });
  });

  it('starts each tool row once even though queued and running both arrive', () => {
    const { events, handler } = collect();
    handler.feed(ndjson(...realToolRunFrames()));
    handler.flush();

    expect(events.filter((e) => e.type === 'tool_use')).toHaveLength(1);
  });

  it('never stores the cumulative message repeats as raw events', () => {
    const { events, handler } = collect();
    handler.feed(ndjson(...realToolRunFrames()));
    handler.flush();

    expect(events.filter((e) => e.type === 'raw')).toEqual([]);
  });

  it('reports the session id once, not again from the result frame', () => {
    const { events, handler } = collect();
    handler.feed(ndjson(...realToolRunFrames()));
    handler.flush();

    expect(events.filter((e) => e.type === 'status' && e.sessionId === 'sess-1')).toHaveLength(1);
  });
});

describe('command-code stream: terminal result frame', () => {
  it('falls back to finalText when no delta streamed', () => {
    const { events, handler } = collect();
    handler.feed(
      ndjson({
        type: 'result',
        subtype: 'success',
        sessionId: 'sess-2',
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 4 },
        durationMs: 8421,
        finalText: 'READY',
      }),
    );

    expect(events.map((e) => e.type)).toEqual(['status', 'text_delta', 'usage']);
    expect(events[0]).toMatchObject({ sessionId: 'sess-2' });
    expect(events[1]).toMatchObject({ delta: 'READY' });
    expect(events[2]).toMatchObject({ usage: { input_tokens: 10, output_tokens: 4 } });
  });

  it('accepts snake_case usage and omits what the frame omits', () => {
    const { events, handler } = collect();
    handler.feed(
      ndjson({
        type: 'result',
        subtype: 'success',
        usage: { input_tokens: 7, output_tokens: 3 },
      }),
    );

    expect(events.map((e) => e.type)).toEqual(['usage']);
    expect(events[0]).toMatchObject({
      usage: { input_tokens: 7, output_tokens: 3 },
      durationMs: null,
      stopReason: null,
    });
  });

  it('surfaces a failed run as an error event', () => {
    const { events, handler } = collect();
    handler.feed(
      ndjson({
        type: 'result',
        subtype: 'error',
        error: { message: 'Invalid API key · Please run /login' },
        finalText: '',
      }),
    );

    expect(events.find((e) => e.type === 'error')).toMatchObject({
      message: 'Invalid API key · Please run /login',
    });
    expect(events.find((e) => e.type === 'usage')).toMatchObject({ isError: true });
  });

  it('reads a string error and falls back to a generic sentence', () => {
    const withString = collect();
    withString.handler.feed(ndjson({ type: 'result', subtype: 'error', error: 'boom' }));
    expect(withString.events.find((e) => e.type === 'error')).toMatchObject({ message: 'boom' });

    const withNothing = collect();
    withNothing.handler.feed(ndjson({ type: 'result', subtype: 'error' }));
    expect(withNothing.events.find((e) => e.type === 'error')).toMatchObject({
      message: 'Command Code reported a failed run.',
    });
  });

  it('fails the turn when the CLI hit its turn cap', () => {
    const { events, handler } = collect();
    handler.feed(ndjson({ type: 'result', subtype: 'max_turns', stopReason: 'max_turns' }));

    expect(events.find((e) => e.type === 'error')).toMatchObject({
      message: expect.stringContaining('--max-turns'),
    });
  });
});

describe('command-code stream: tool frames', () => {
  it('settles a failed tool call with its error text', () => {
    const { events, handler } = collect();
    handler.feed(
      ndjson(
        event({ type: 'tool_queued', toolCallId: 'call-x', toolName: 'read_file', input: { file_path: 'missing.txt' } }),
        event({ type: 'tool_errored', toolCallId: 'call-x', toolName: 'read_file', error: 'ENOENT: no such file' }),
      ),
    );

    expect(events.map((e) => e.type)).toEqual(['tool_use', 'tool_result']);
    expect(events[1]).toMatchObject({
      toolUseId: 'call-x',
      content: 'ENOENT: no such file',
      isError: true,
    });
  });

  it('announces a call whose terminal frame arrived first', () => {
    const { events, handler } = collect();
    handler.feed(
      ndjson(event({ type: 'tool_completed', toolCallId: 'call-y', toolName: 'grep', result: [] })),
    );

    expect(events.map((e) => e.type)).toEqual(['tool_use', 'tool_result']);
    expect(events[0]).toMatchObject({ id: 'call-y', name: 'grep' });
  });

  it('uses tool_running as the announcement when no queue frame arrives', () => {
    const { events, handler } = collect();
    handler.feed(
      ndjson(event({ type: 'tool_running', toolCallId: 'call-z', toolName: 'glob', description: 'src/**/*.ts' })),
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'tool_use',
      id: 'call-z',
      name: 'glob',
      input: { description: 'src/**/*.ts' },
    });
  });

  it('synthesises an id when a frame carries none', () => {
    const { events, handler } = collect();
    handler.feed(ndjson(event({ type: 'tool_running', toolName: 'grep' })));

    expect(String(events[0]!.id)).toContain('command-code-tool-');
    expect(events[0]!.name).toBe('grep');
  });
});

describe('command-code stream: framing', () => {
  it('reassembles lines split across chunks, including a split UTF-8 character', () => {
    const { events, handler } = collect();
    const line = JSON.stringify(event({ type: 'text_delta', delta: '中文文本 — ok' })) + '\n';
    const bytes = Buffer.from(line, 'utf8');
    // Split one byte into the multi-byte character: a per-chunk decode would
    // turn both halves into U+FFFD and lose it.
    const cut = bytes.indexOf(Buffer.from('中')) + 1;

    handler.feed(bytes.subarray(0, cut));
    handler.feed(bytes.subarray(cut));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'text_delta', delta: '中文文本 — ok' });
  });

  it('handles a final line with no trailing newline', () => {
    const { events, handler } = collect();
    handler.feed(
      JSON.stringify({ type: 'result', subtype: 'success', sessionId: 's', finalText: 'last line' }),
    );
    handler.flush();

    expect(events.map((e) => e.type)).toEqual(['status', 'text_delta', 'usage']);
  });

  it('keeps an unrecognised frame and non-JSON stdout as raw without throwing', () => {
    const unknown = collect();
    unknown.handler.feed(ndjson(event({ type: 'some_future_frame', value: 1 })));
    expect(unknown.events).toHaveLength(1);
    expect(unknown.events[0]).toMatchObject({ type: 'raw' });

    const noise = collect();
    noise.handler.feed('starting command code...\n');
    expect(noise.events).toHaveLength(1);
    expect(noise.events[0]).toMatchObject({ type: 'raw' });
    expect(noise.events[0]!.line).toContain('starting command code');
  });
});

describe('command-code stream: closing tool rows', () => {
  it('settles an unfinished call on flush without inventing output or a duration', () => {
    const { events, handler } = collect();
    handler.feed(
      ndjson(event({ type: 'tool_queued', toolCallId: 'call-open', toolName: 'shell_command', input: { command: 'pnpm test' } })),
    );
    handler.flush();

    const result = events.find((e) => e.type === 'tool_result');
    expect(result).toMatchObject({ toolUseId: 'call-open', content: '', isError: false });
    // The run was cut short, so when the call ended is unknown — a stopwatch
    // that ran to end-of-turn would be a fabricated duration.
    expect(result).not.toHaveProperty('completedAt');
  });

  it('does not settle a call that already completed', () => {
    const { events, handler } = collect();
    handler.feed(
      ndjson(
        event({ type: 'tool_queued', toolCallId: 'call-done', toolName: 'read_file', input: {} }),
        event({ type: 'tool_completed', toolCallId: 'call-done', toolName: 'read_file', result: [] }),
      ),
    );
    handler.flush();

    expect(events.filter((e) => e.type === 'tool_result')).toHaveLength(1);
  });

  it('leaves a run with no tool calls free of synthetic results', () => {
    const { events, handler } = collect();
    handler.feed(ndjson({ type: 'result', subtype: 'success', finalText: 'done' }));
    handler.flush();

    expect(events.some((e) => e.type === 'tool_result')).toBe(false);
    expect(events.filter((e) => e.type === 'text_delta')).toHaveLength(1);
  });
});
