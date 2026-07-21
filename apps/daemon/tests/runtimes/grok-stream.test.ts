import { describe, expect, it } from 'vitest';

import { createGrokStreamHandler } from '../../src/runtimes/grok-stream.js';
import { extractPlainStreamArtifacts } from '../../src/runtimes/plain-stream.js';

function collect(feedLines: string[]) {
  const events: Record<string, unknown>[] = [];
  const handler = createGrokStreamHandler((ev) => events.push(ev));
  for (const line of feedLines) {
    handler.feed(`${line}\n`);
  }
  handler.flush();
  return { events, text: handler.getReconstructedText() };
}

describe('createGrokStreamHandler', () => {
  it('maps thought chunks to thinking_start + thinking_delta', () => {
    const { events } = collect([
      JSON.stringify({ type: 'thought', data: 'Analyzing' }),
      JSON.stringify({ type: 'thought', data: ' layout' }),
    ]);
    expect(events[0]).toEqual({ type: 'thinking_start' });
    expect(events.filter((e) => e.type === 'thinking_delta')).toEqual([
      { type: 'thinking_delta', delta: 'Analyzing' },
      { type: 'thinking_delta', delta: ' layout' },
    ]);
  });

  it('maps text chunks to text_delta and reconstructs assistant text', () => {
    const { events, text } = collect([
      JSON.stringify({ type: 'text', data: 'Hello' }),
      JSON.stringify({ type: 'text', data: ' world' }),
    ]);
    expect(events).toEqual([
      { type: 'text_delta', delta: 'Hello' },
      { type: 'text_delta', delta: ' world' },
    ]);
    expect(text).toBe('Hello world');
  });

  it('closes thinking before first text and emits status+usage on end', () => {
    const { events } = collect([
      JSON.stringify({ type: 'thought', data: 'plan' }),
      JSON.stringify({ type: 'text', data: 'Done' }),
      JSON.stringify({
        type: 'end',
        stopReason: 'EndTurn',
        sessionId: 'sess-abc',
        usage: { input_tokens: 10, output_tokens: 2 },
        total_cost_usd: 0.01,
        num_turns: 1,
      }),
    ]);
    expect(events).toContainEqual({ type: 'thinking_end' });
    expect(events).toContainEqual({
      type: 'status',
      label: 'completed',
      sessionId: 'sess-abc',
    });
    const usage = events.find((e) => e.type === 'usage');
    expect(usage).toMatchObject({
      type: 'usage',
      costUsd: 0.01,
      stopReason: 'EndTurn',
      numTurns: 1,
      isError: false,
    });
    expect(usage?.usage).toEqual({ input_tokens: 10, output_tokens: 2 });
  });

  it('maps error events', () => {
    const { events } = collect([
      JSON.stringify({ type: 'error', message: 'auth required' }),
    ]);
    expect(events[0]).toMatchObject({
      type: 'error',
      message: 'auth required',
    });
  });

  it('buffers partial lines across feed calls', () => {
    const events: Record<string, unknown>[] = [];
    const handler = createGrokStreamHandler((ev) => events.push(ev));
    handler.feed('{"type":"text","data":"Hel');
    handler.feed('lo"}\n');
    handler.flush();
    expect(events).toEqual([{ type: 'text_delta', delta: 'Hello' }]);
    expect(handler.getReconstructedText()).toBe('Hello');
  });

  it('ignores unknown event types as raw without breaking reconstruction', () => {
    const { events, text } = collect([
      JSON.stringify({ type: 'max_turns_reached' }),
      JSON.stringify({ type: 'text', data: 'ok' }),
    ]);
    expect(events[0]).toEqual({
      type: 'raw',
      line: JSON.stringify({ type: 'max_turns_reached' }),
    });
    expect(text).toBe('ok');
  });

  it('reconstructed text with an artifact block is extractable by plain-stream', () => {
    const html = '<!doctype html><html><body><h1>Hi</h1></body></html>';
    const body = [
      'Here is the page:\n',
      `<artifact type="text/html" identifier="landing" title="Landing">\n${html}\n</artifact>\n`,
    ].join('');
    // Emit as chunked text events like the real CLI.
    const lines = body.match(/.{1,12}/gs)?.map((chunk) =>
      JSON.stringify({ type: 'text', data: chunk }),
    ) ?? [];
    const { text } = collect(lines);
    const artifacts = extractPlainStreamArtifacts(text);
    expect(artifacts.length).toBe(1);
    expect(artifacts[0]?.extension).toBe('.html');
    expect(artifacts[0]?.content).toContain('<h1>Hi</h1>');
  });
});
