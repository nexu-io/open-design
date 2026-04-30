import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamViaDaemon } from './daemon';
import { streamMessageOpenAI } from './openai-compatible';
import { parseSseFrame } from './sse';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseSseFrame', () => {
  it('parses JSON event frames', () => {
    expect(parseSseFrame('event: stdout\ndata: {"chunk":"hello"}')).toEqual({
      kind: 'event',
      event: 'stdout',
      data: { chunk: 'hello' },
    });
  });

  it('parses SSE comment frames', () => {
    expect(parseSseFrame(': keepalive')).toEqual({
      kind: 'comment',
      comment: 'keepalive',
    });
  });

  it('returns empty for frames without data or comments', () => {
    expect(parseSseFrame('')).toEqual({ kind: 'empty' });
  });
});

describe('streamViaDaemon', () => {
  it('ignores comment frames without notifying handlers', async () => {
    const handlers = createDaemonHandlers();
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse(': keepalive\n\n')));

    await streamViaDaemon({
      agentId: 'mock',
      history: [{ id: '1', role: 'user', content: 'hello' }],
      systemPrompt: '',
      signal: new AbortController().signal,
      handlers,
    });

    expect(handlers.onDelta).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onAgentEvent).not.toHaveBeenCalled();
    expect(handlers.onDone).toHaveBeenCalledWith('');
  });

  it('continues normal stdout and end handling around comments', async () => {
    const handlers = createDaemonHandlers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse(
          [
            ': keepalive',
            '',
            'event: start',
            'data: {"bin":"mock-agent"}',
            '',
            'event: stdout',
            'data: {"chunk":"hello"}',
            '',
            ': keepalive',
            '',
            'event: end',
            'data: {"code":0}',
            '',
          ].join('\n'),
        ),
      ),
    );

    await streamViaDaemon({
      agentId: 'mock',
      history: [{ id: '1', role: 'user', content: 'hello' }],
      systemPrompt: '',
      signal: new AbortController().signal,
      handlers,
    });

    expect(handlers.onDelta).toHaveBeenCalledWith('hello');
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onDone).toHaveBeenCalledWith('hello');
  });
});

describe('streamMessageOpenAI', () => {
  it('ignores comments and keeps delta/end behavior unchanged', async () => {
    const handlers = createStreamHandlers();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse(
          [
            ': keepalive',
            '',
            'event: delta',
            'data: {"text":"hi"}',
            '',
            ': keepalive',
            '',
            'event: end',
            'data: {}',
            '',
          ].join('\n'),
        ),
      ),
    );

    await streamMessageOpenAI(
      {
        mode: 'api',
        apiKey: 'test-key',
        baseUrl: 'https://example.test',
        model: 'gpt-test',
        agentId: null,
        skillId: null,
        designSystemId: null,
      },
      '',
      [{ id: '1', role: 'user', content: 'hello' }],
      new AbortController().signal,
      handlers,
    );

    expect(handlers.onDelta).toHaveBeenCalledTimes(1);
    expect(handlers.onDelta).toHaveBeenCalledWith('hi');
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onDone).toHaveBeenCalledWith('hi');
  });
});

function createStreamHandlers() {
  return {
    onDelta: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  };
}

function createDaemonHandlers() {
  return {
    ...createStreamHandlers(),
    onAgentEvent: vi.fn(),
  };
}

function sseResponse(text: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  );
}
