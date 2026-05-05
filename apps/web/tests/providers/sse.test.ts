import { afterEach, describe, expect, it, vi } from 'vitest';

import { reattachDaemonRun, streamViaDaemon } from '../../src/providers/daemon';
import { streamMessageOpenAI } from '../../src/providers/openai-compatible';
import { parseSseFrame } from '../../src/providers/sse';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseSseFrame', () => {
  it('parses JSON event frames', () => {
    expect(parseSseFrame('id: 12\nevent: stdout\ndata: {"chunk":"hello"}')).toEqual({
      kind: 'event',
      id: '12',
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
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ runId: 'run-1' }))
      .mockResolvedValueOnce(sseResponse(': keepalive\n\nevent: end\ndata: {"code":0,"status":"succeeded"}\n\n')));

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
      vi.fn()
        .mockResolvedValueOnce(jsonResponse({ runId: 'run-1' }))
        .mockResolvedValueOnce(
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

  it('reads unified SSE error payload messages', async () => {
    const handlers = createDaemonHandlers();
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(jsonResponse({ runId: 'run-1' }))
        .mockResolvedValueOnce(
          sseResponse(
          [
            'event: error',
            'data: {"message":"legacy message","error":{"code":"AGENT_UNAVAILABLE","message":"typed message"}}',
            '',
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

    expect(handlers.onError).toHaveBeenCalledWith(new Error('typed message'));
    expect(handlers.onDone).not.toHaveBeenCalled();
  });

  it('keeps the daemon run alive when the browser-side stream aborts', async () => {
    const handlers = createDaemonHandlers();
    const controller = new AbortController();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/runs') return jsonResponse({ runId: 'run-1' });
      if (url === '/api/runs/run-1/events') {
        controller.abort();
        throw new DOMException('aborted', 'AbortError');
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await streamViaDaemon({
      agentId: 'mock',
      history: [{ id: '1', role: 'user', content: 'hello' }],
      systemPrompt: '',
      signal: controller.signal,
      handlers,
    });

    expect(fetchMock).not.toHaveBeenCalledWith('/api/runs/run-1/cancel', { method: 'POST' });
    expect(handlers.onDone).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('cancels the daemon run when the explicit cancel signal aborts', async () => {
    const handlers = createDaemonHandlers();
    const streamController = new AbortController();
    const cancelController = new AbortController();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/runs') return jsonResponse({ runId: 'run-1' });
      if (url === '/api/runs/run-1/cancel') return jsonResponse({ ok: true });
      if (url === '/api/runs/run-1/events') {
        cancelController.abort();
        streamController.abort();
        throw new DOMException('aborted', 'AbortError');
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await streamViaDaemon({
      agentId: 'mock',
      history: [{ id: '1', role: 'user', content: 'hello' }],
      systemPrompt: '',
      signal: streamController.signal,
      cancelSignal: cancelController.signal,
      handlers,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/runs', expect.objectContaining({
      method: 'POST',
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/runs/run-1/events', {
      method: 'GET',
      signal: streamController.signal,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/runs/run-1/cancel', { method: 'POST' });
    expect(handlers.onDone).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('keeps the create-run request alive across browser-side stream aborts', async () => {
    const handlers = createDaemonHandlers();
    const controller = new AbortController();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/runs') {
        controller.abort();
        return jsonResponse({ runId: 'run-1' });
      }
      if (url === '/api/runs/run-1/events') throw new DOMException('aborted', 'AbortError');
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await streamViaDaemon({
      agentId: 'mock',
      history: [{ id: '1', role: 'user', content: 'hello' }],
      systemPrompt: '',
      signal: controller.signal,
      handlers,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith('/api/runs', expect.objectContaining({
      method: 'POST',
    }));
    expect(handlers.onDone).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('cancels an accepted daemon run when explicit cancel happens during create-run', async () => {
    const handlers = createDaemonHandlers();
    const streamController = new AbortController();
    const cancelController = new AbortController();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/runs') {
        cancelController.abort();
        streamController.abort();
        return jsonResponse({ runId: 'run-1' });
      }
      if (url === '/api/runs/run-1/cancel') return jsonResponse({ ok: true });
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await streamViaDaemon({
      agentId: 'mock',
      history: [{ id: '1', role: 'user', content: 'hello' }],
      systemPrompt: '',
      signal: streamController.signal,
      cancelSignal: cancelController.signal,
      handlers,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/runs', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/runs/run-1/cancel', { method: 'POST' });
    expect(handlers.onDone).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('marks create-run HTTP failures as failed', async () => {
    const handlers = createDaemonHandlers();
    const onRunStatus = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('down', { status: 503 })));

    await streamViaDaemon({
      agentId: 'mock',
      history: [{ id: '1', role: 'user', content: 'hello' }],
      systemPrompt: '',
      signal: new AbortController().signal,
      handlers,
      onRunStatus,
    });

    expect(onRunStatus).toHaveBeenCalledWith('failed');
    expect(handlers.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'daemon 503: down' }));
    expect(handlers.onDone).not.toHaveBeenCalled();
  });

  it('marks invalid create-run JSON as failed', async () => {
    const handlers = createDaemonHandlers();
    const onRunStatus = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('not json', { status: 202 })));

    await streamViaDaemon({
      agentId: 'mock',
      history: [{ id: '1', role: 'user', content: 'hello' }],
      systemPrompt: '',
      signal: new AbortController().signal,
      handlers,
      onRunStatus,
    });

    expect(onRunStatus).toHaveBeenCalledWith('failed');
    expect(handlers.onError).toHaveBeenCalledWith(expect.any(Error));
    expect(handlers.onDone).not.toHaveBeenCalled();
  });

  it('reconnects to a daemon run after an incomplete stream closes', async () => {
    const handlers = createDaemonHandlers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ runId: 'run-1' }))
      .mockResolvedValueOnce(sseResponse('id: 1\nevent: stdout\ndata: {"chunk":"he"}\n\n'))
      .mockResolvedValueOnce(sseResponse('id: 2\nevent: stdout\ndata: {"chunk":"llo"}\n\nid: 3\nevent: end\ndata: {"code":0,"status":"succeeded"}\n\n'));
    vi.stubGlobal('fetch', fetchMock);

    await streamViaDaemon({
      agentId: 'mock',
      history: [{ id: '1', role: 'user', content: 'hello' }],
      systemPrompt: '',
      signal: new AbortController().signal,
      handlers,
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/runs/run-1/events?after=1', {
      method: 'GET',
      signal: expect.any(AbortSignal),
    });
    expect(handlers.onDone).toHaveBeenCalledWith('hello');
  });

  it('posts run correlation fields and reports run metadata callbacks', async () => {
    const handlers = createDaemonHandlers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ runId: 'run-1' }))
      .mockResolvedValueOnce(sseResponse('id: 4\nevent: start\ndata: {"bin":"mock-agent"}\n\nid: 5\nevent: end\ndata: {"code":0,"status":"succeeded"}\n\n'));
    const onRunCreated = vi.fn();
    const onRunStatus = vi.fn();
    const onRunEventId = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await streamViaDaemon({
      agentId: 'mock',
      history: [{ id: '1', role: 'user', content: 'hello' }],
      systemPrompt: '',
      signal: new AbortController().signal,
      handlers,
      projectId: 'project-1',
      conversationId: 'conversation-1',
      assistantMessageId: 'assistant-1',
      clientRequestId: 'client-1',
      onRunCreated,
      onRunStatus,
      onRunEventId,
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toMatchObject({
      projectId: 'project-1',
      conversationId: 'conversation-1',
      assistantMessageId: 'assistant-1',
      clientRequestId: 'client-1',
    });
    expect(onRunCreated).toHaveBeenCalledWith('run-1');
    expect(onRunStatus).toHaveBeenCalledWith('queued');
    expect(onRunStatus).toHaveBeenCalledWith('running');
    expect(onRunStatus).toHaveBeenCalledWith('succeeded');
    expect(onRunEventId).toHaveBeenCalledWith('4');
    expect(onRunEventId).toHaveBeenCalledWith('5');
  });

  it('reattaches to an existing daemon run after the last stored event id', async () => {
    const handlers = createDaemonHandlers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse('id: 8\nevent: stdout\ndata: {"chunk":"lo"}\n\nid: 9\nevent: end\ndata: {"code":0,"status":"succeeded"}\n\n'));
    vi.stubGlobal('fetch', fetchMock);

    await reattachDaemonRun({
      runId: 'run-1',
      signal: new AbortController().signal,
      initialLastEventId: '7',
      handlers,
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/runs/run-1/events?after=7', {
      method: 'GET',
      signal: expect.any(AbortSignal),
    });
    expect(handlers.onDelta).toHaveBeenCalledWith('lo');
    expect(handlers.onDone).toHaveBeenCalledWith('lo');
  });

  it('keeps reconnecting when quiet resumed streams only receive keepalives', async () => {
    const handlers = createDaemonHandlers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ runId: 'run-1' }))
      .mockResolvedValueOnce(sseResponse(': keepalive\n\n'))
      .mockResolvedValueOnce(sseResponse(': keepalive\n\n'))
      .mockResolvedValueOnce(sseResponse(': keepalive\n\n'))
      .mockResolvedValueOnce(sseResponse(': keepalive\n\n'))
      .mockResolvedValueOnce(sseResponse(': keepalive\n\n'))
      .mockResolvedValueOnce(sseResponse('event: end\ndata: {"code":0,"status":"succeeded"}\n\n'));
    vi.stubGlobal('fetch', fetchMock);

    await streamViaDaemon({
      agentId: 'mock',
      history: [{ id: '1', role: 'user', content: 'hello' }],
      systemPrompt: '',
      signal: new AbortController().signal,
      handlers,
    });

    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onDone).toHaveBeenCalledWith('');
  });

  it('reports an error when reconnects are exhausted before an end event', async () => {
    const handlers = createDaemonHandlers();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/runs') return jsonResponse({ runId: 'run-1' });
      if (url === '/api/runs/run-1/events') return sseResponse('');
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await streamViaDaemon({
      agentId: 'mock',
      history: [{ id: '1', role: 'user', content: 'hello' }],
      systemPrompt: '',
      signal: new AbortController().signal,
      handlers,
    });

    expect(fetchMock).not.toHaveBeenCalledWith('/api/runs/run-1/cancel', { method: 'POST' });
    expect(handlers.onError).toHaveBeenCalledWith(new Error('daemon stream disconnected before run completed'));
    expect(handlers.onDone).not.toHaveBeenCalled();
  });

  it('includes selected preview comments without requiring visible draft text', async () => {
    const handlers = createDaemonHandlers();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/runs') return jsonResponse({ runId: 'run-1' });
      if (url === '/api/runs/run-1/events') {
        return sseResponse('event: end\ndata: {"code":0,"status":"succeeded"}\n\n');
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await streamViaDaemon({
      agentId: 'mock',
      history: [{ id: '1', role: 'user', content: '' }],
      systemPrompt: '',
      signal: new AbortController().signal,
      handlers,
      commentAttachments: [
        {
          id: 'c1',
          order: 1,
          filePath: 'index.html',
          elementId: 'hero-title',
          selector: '[data-od-id="hero-title"]',
          label: 'h1.hero-title',
          comment: 'Shorten the headline',
          currentText: 'A very long headline',
          pagePosition: { x: 12, y: 44, width: 500, height: 60 },
          htmlHint: '<h1 data-od-id="hero-title">',
        },
      ],
    });

    const [, createRunInit] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    const body = JSON.parse(String(createRunInit.body));
    expect(body.message).toBe('## user\n');
    expect(body.commentAttachments).toEqual([
      expect.objectContaining({
        id: 'c1',
        elementId: 'hero-title',
        comment: 'Shorten the headline',
      }),
    ]);
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

  it('routes through the OpenAI-specific proxy endpoint and handles CRLF frames', async () => {
    const handlers = createStreamHandlers();
    const fetchMock = vi.fn(async () =>
      sseResponse(
        [
          'event: delta',
          'data: {"delta":"hi"}',
          '',
          'event: end',
          'data: {}',
          '',
        ].join('\r\n'),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

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

    expect(fetchMock).toHaveBeenCalledWith('/api/proxy/openai/stream', expect.any(Object));
    expect(handlers.onDelta).toHaveBeenCalledWith('hi');
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

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 202,
    headers: { 'content-type': 'application/json' },
  });
}
