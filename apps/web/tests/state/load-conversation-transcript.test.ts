import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConversationTranscript } from '../../src/state/load-conversation-transcript';

const messages = [{
  id: 'history-after-http-recovery', role: 'user',
  content: 'Persisted history after a transient HTTP read', createdAt: 1,
}];

// Exercise the actual fetch -> Response parser -> listMessages -> bounded-read
// chain. Hand-constructing ProjectMessageListError(retryable: true) would bypass
// precisely the missing-hint classification that failed in real Chrome.
describe('transcript recovery from actual HTTP responses', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    [503, 'legacy JSON'],
    [408, 'legacy JSON'],
    [429, 'legacy JSON'],
    [500, 'legacy JSON'],
    [502, 'proxy text'],
    [504, 'legacy JSON'],
    [503, 'structured JSON'],
  ] as const)('retries HTTP %s with no retryability hint (%s)', async (status, shape) => {
    const failure = shape === 'proxy text'
      ? new Response('connect ECONNREFUSED', { status })
      : Response.json(shape === 'structured JSON'
        ? { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Temporary upstream failure' } }
        : { error: 'QA transient transcript read failure' }, { status });
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(Response.json({ messages }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    // Attach rejection handling immediately so the expected pre-fix failure is
    // an assertion failure, never an unhandled promise rejection.
    const result = loadConversationTranscript('project-1', 'conversation-1', null, controller.signal)
      .then(value => ({ messages: value }), error => ({ error }));
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(499);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(await result).toEqual({ messages });
      expect(fetchMock.mock.calls[1]?.[1]?.signal).toBe(fetchMock.mock.calls[0]?.[1]?.signal);
    } finally {
      controller.abort();
      await result;
    }
  });

  it('retries an explicitly retryable HTTP response through the real parser', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        error: { message: 'Temporary upstream failure', retryable: true },
      }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ messages }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const result = loadConversationTranscript('project-1', 'conversation-1', null, controller.signal)
      .then(value => ({ messages: value }), error => ({ error }));
    try {
      await vi.advanceTimersByTimeAsync(500);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(await result).toEqual({ messages });
    } finally {
      controller.abort();
      await result;
    }
  });

  it.each([
    [503, { error: { message: 'Do not retry this failure', retryable: false } }],
    [503, { error: 'Do not retry this failure', retryable: false }],
    [401, { error: { message: 'Sign in required', retryable: true } }],
    [403, { error: { message: 'Access refused', retryable: true } }],
    [404, { error: { message: 'Conversation missing', retryable: true } }],
  ] as const)('does not replay HTTP %s when denied by the hint or status (%j)', async (status, body) => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(body, { status }))
      .mockResolvedValueOnce(Response.json({ messages }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const result = loadConversationTranscript('project-1', 'conversation-1', null, controller.signal)
      .then(value => ({ messages: value }), error => ({ error }));
    try {
      await vi.advanceTimersByTimeAsync(15_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await result).toMatchObject({ error: { status } });
    } finally {
      controller.abort();
      await result;
    }
  });
});
