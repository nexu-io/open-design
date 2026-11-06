import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@open-design/contracts';
import { listMessages } from '../../src/state/projects';

const message: ChatMessage = {
  id: 'assistant-1',
  role: 'assistant',
  content: '完成设计 🌈\nSecond line',
  runId: 'run-1',
  runStatus: 'succeeded',
  strategyTaskExecutionId: 'task-1',
  strategyTaskRunIndex: 1,
  events: [{ kind: 'text', text: '完成设计 🌈\nSecond line' }],
};

function streamResponse(lines: unknown[]): Response {
  const text = lines.map((line) => `${JSON.stringify(line)}\n`).join('');
  const bytes = new TextEncoder().encode(text);
  // Split inside multi-byte text as well as JSON tokens and line delimiters.
  let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + 7, bytes.length);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  }), { headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('listMessages streamed transcript', () => {
  it('negotiates NDJSON and reconstructs complete messages across arbitrary UTF-8 chunks', async () => {
    const next = { ...message, id: 'assistant-2', content: 'Next answer' };
    const fetchMock = vi.fn<typeof fetch>(async () => streamResponse([
      { type: 'message', message },
      { type: 'message', message: next },
      { type: 'end', count: 2 },
    ]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listMessages('project-1', 'conversation-1')).resolves.toEqual([message, next]);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Accept: 'application/x-ndjson',
    });
  });

  it('does not call the whole-response JSON or text materializers for a streamed read', async () => {
    const response = streamResponse([{ type: 'message', message }, { type: 'end', count: 1 }]);
    vi.spyOn(response, 'json').mockRejectedValue(new RangeError('Invalid string length'));
    vi.spyOn(response, 'text').mockRejectedValue(new RangeError('Invalid string length'));
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => response));

    await expect(listMessages('project-1', 'conversation-1')).resolves.toEqual([message]);
  });

  it('does not impose a per-message event limit', async () => {
    const large = {
      ...message,
      events: [{ kind: 'text' as const, text: 'x'.repeat(2 * 1024 * 1024 + 1) }],
    };
    const body = JSON.stringify({ type: 'message', message: large }) + '\n'
      + JSON.stringify({ type: 'end', count: 1 }) + '\n';
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(body, {
      headers: { 'content-type': 'application/x-ndjson' },
    })));

    await expect(listMessages('project-1', 'conversation-1')).resolves.toEqual([large]);
  });

  it('accepts an explicitly completed empty conversation', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => streamResponse([{ type: 'end', count: 0 }])));
    await expect(listMessages('project-1', 'conversation-1')).resolves.toEqual([]);
  });

  it.each<[unknown[], string]>([
    [[{ type: 'message', message }], 'missing completion'],
    [[{ type: 'message', message }, { type: 'end', count: 2 }], 'wrong count'],
    [[{ type: 'end', count: 0 }, { type: 'message', message }], 'message after completion'],
    [[{ type: 'unexpected' }], 'unknown frame'],
  ])('rejects an incomplete or invalid transcript (%s, %s)', async (lines, _reason) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => streamResponse(lines)));
    await expect(listMessages('project-1', 'conversation-1')).rejects.toMatchObject({
      name: 'ProjectMessageListError',
      retryable: true,
    });
  });

  it('rejects a transport error after receiving messages instead of accepting partial history', async () => {
    let pulls = 0;
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(new ReadableStream({
      pull(controller) {
        if (pulls++ === 0) {
          controller.enqueue(new TextEncoder().encode(`${JSON.stringify({ type: 'message', message })}\n`));
        } else {
          controller.error(new Error('connection reset'));
        }
      },
    }), { headers: { 'content-type': 'application/x-ndjson' } })));
    await expect(listMessages('project-1', 'conversation-1')).rejects.toThrow('connection reset');
  });

  it('rejects malformed JSON and an unterminated final frame', async () => {
    for (const body of ['not json\n', '{"type":"end","count":0}']) {
      vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(body, {
        headers: { 'content-type': 'application/x-ndjson' },
      })));
      await expect(listMessages('project-1', 'conversation-1')).rejects.toMatchObject({
        name: 'ProjectMessageListError',
        retryable: true,
      });
    }
  });

  it('cancels a stalled response body when the conversation read is aborted', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    let reading!: () => void;
    const started = new Promise<void>((resolve) => { reading = resolve; });
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(new ReadableStream({
      start(stream) {
        stream.enqueue(new TextEncoder().encode(`${JSON.stringify({ type: 'message', message })}\n`));
      },
      pull() { reading(); },
      cancel,
    }), { headers: { 'content-type': 'application/x-ndjson' } })));
    const pending = listMessages('project-1', 'conversation-1', null, controller.signal);
    await started;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'ProjectMessageListError' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('keeps compatibility with a daemon returning the existing JSON envelope', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ messages: [message] })));
    await expect(listMessages('project-1', 'conversation-1')).resolves.toEqual([message]);
  });
});
