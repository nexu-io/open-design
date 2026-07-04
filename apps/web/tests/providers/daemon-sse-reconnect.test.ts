import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { reattachDaemonRun } from '../../src/providers/daemon';

// ---------------------------------------------------------------------------
// Helpers: build a fake SSE Response with a mock reader.
// Using direct reader mocks (instead of real ReadableStream) avoids
// unhandled-rejection noise from controller.error() after reader.cancel().
// ---------------------------------------------------------------------------

/** Encode a string as UTF-8 bytes. */
function enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** SSE event frame: `id: <id>\nevent: <event>\ndata: <json>\n\n`. */
function sseEvent(id: number, event: string, data: Record<string, unknown>): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** SSE comment frame (keepalive): `: <text>\n\n`. */
function sseComment(text: string): string {
  return `: ${text}\n\n`;
}

type ReadResult = { value: Uint8Array; done: false } | { value: undefined; done: true };

/** Build a mock reader that yields chunks, then rejects (network drop). */
function makeRejectingReader(
  chunks: Uint8Array[],
  rejectError: Error = new TypeError('network error'),
) {
  let i = 0;
  return {
    read: (): Promise<ReadResult> => {
      if (i < chunks.length) {
        return Promise.resolve({ value: chunks[i++], done: false }) as Promise<ReadResult>;
      }
      return Promise.reject(rejectError);
    },
    cancel: () => Promise.resolve(),
  };
}

/** Build a mock reader that yields chunks, then closes normally. */
function makeFiniteReader(chunks: Uint8Array[]) {
  let i = 0;
  return {
    read: (): Promise<ReadResult> => {
      if (i < chunks.length) {
        return Promise.resolve({ value: chunks[i++], done: false }) as Promise<ReadResult>;
      }
      return Promise.resolve({ value: undefined, done: true }) as Promise<ReadResult>;
    },
    cancel: () => Promise.resolve(),
  };
}

/** Build a fake Response with a mock reader body. */
function streamResponse(reader: { read: () => Promise<unknown>; cancel: () => Promise<void> }, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: { getReader: () => reader } as unknown as ReadableStream<Uint8Array>,
    text: () => Promise.resolve(''),
  } as unknown as Response;
}

/** Build a fake Response with a JSON body (for status endpoint). */
function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reattachDaemonRun SSE reader reconnection', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('reconnects and resumes when reader.read() rejects mid-stream', async () => {
    // First connection: send a start event + a delta, then reader.read()
    // rejects (simulating a network drop / tab backgrounding).
    const firstReader = makeRejectingReader([
      enc(sseEvent(1, 'start', { bin: 'hermes' })),
      enc(sseEvent(2, 'stdout', { chunk: 'hello ' })),
    ]);

    // Second connection (reconnect with ?after=2): send one more delta + end.
    const secondReader = makeFiniteReader([
      enc(sseEvent(3, 'stdout', { chunk: 'world' })),
      enc(sseEvent(4, 'end', { status: 'succeeded', code: 0 })),
    ]);

    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/events')) {
        if (u.includes('after=2')) {
          return streamResponse(secondReader);
        }
        return streamResponse(firstReader);
      }
      if (u.includes('/runs/') && !u.includes('/events') && !u.includes('/cancel')) {
        return jsonResponse({ status: 'succeeded', exitCode: 0, signal: null });
      }
      return jsonResponse({}, 404);
    });

    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const deltas: string[] = [];
    const statuses: string[] = [];
    let doneText: string | null = null;
    let error: Error | null = null;

    const controller = new AbortController();

    await reattachDaemonRun({
      runId: 'test-run-1',
      signal: controller.signal,
      handlers: {
        onDelta: (text) => deltas.push(text),
        onDone: (text) => { doneText = text; },
        onError: (err) => { error = err; },
        onAgentEvent: () => {},
      },
      onRunStatus: (s) => statuses.push(s),
    });

    // Should have received both deltas (from first + reconnected stream).
    expect(deltas).toEqual(['hello ', 'world']);
    // Should have completed successfully — no error.
    expect(error).toBeNull();
    expect(doneText).toBe('hello world');
    // Should have seen running + succeeded statuses.
    expect(statuses).toContain('running');
    expect(statuses).toContain('succeeded');
    // Should have made two fetch calls to /events (initial + reconnect).
    const eventCalls = fetchMock.mock.calls.filter(
      ([u]) => typeof u === 'string' && u.includes('/events'),
    ) as [string, RequestInit | undefined][];
    expect(eventCalls.length).toBe(2);
    // The second call should include ?after=2 (resuming from last event id).
    expect(eventCalls[1]![0]).toContain('after=2');
  });

  it('does not swallow handler exceptions as reconnection', async () => {
    // A handler callback (onDelta) throws — this should NOT be caught as a
    // stream break. It should propagate to the caller as an error, not
    // trigger a reconnect.
    const reader = makeFiniteReader([
      enc(sseEvent(1, 'start', { bin: 'hermes' })),
      enc(sseEvent(2, 'stdout', { chunk: 'boom' })),
    ]);

    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/events')) {
        return streamResponse(reader);
      }
      if (u.includes('/runs/') && !u.includes('/events') && !u.includes('/cancel')) {
        return jsonResponse({ status: 'succeeded', exitCode: 0, signal: null });
      }
      return jsonResponse({}, 404);
    });

    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const controller = new AbortController();
    const handlerError = new Error('handler crashed during processing');

    let doneCalled = false;

    // The handler exception should propagate out of reattachDaemonRun,
    // not be swallowed as a reconnection event.
    await expect(
      reattachDaemonRun({
        runId: 'test-run-2',
        signal: controller.signal,
        handlers: {
          onDelta: () => { throw handlerError; },
          onDone: () => { doneCalled = true; },
          onError: () => {},
          onAgentEvent: () => {},
        },
        onRunStatus: () => {},
      }),
    ).rejects.toThrow('handler crashed during processing');

    // onDone should NOT have been called — the run did not complete cleanly.
    expect(doneCalled).toBe(false);

    // Only one fetch call to /events — no reconnection should have occurred
    // because the error came from a handler, not from reader.read().
    const eventCalls = fetchMock.mock.calls.filter(
      ([u]) => typeof u === 'string' && u.includes('/events'),
    ) as [string, RequestInit | undefined][];
    expect(eventCalls.length).toBe(1);
  });
});
