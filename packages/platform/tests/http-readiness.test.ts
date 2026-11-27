import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import { waitForHttpOk } from '../src/http.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function response(status: number, cancel: () => void | Promise<void>) {
  return new Response(new ReadableStream<Uint8Array>({ cancel }), { status });
}

describe('HTTP readiness deadline and response ownership', () => {
  it('aborts a fetch that never supplies response headers at the configured deadline', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    let release!: (error: Error) => void;
    const fetcher = vi.fn((_url: unknown, options?: RequestInit) => {
      signal = options?.signal;
      return new Promise<Response>((_resolve, reject) => {
        release = reject;
        signal?.addEventListener('abort', () => reject(new Error('request aborted')), { once: true });
      });
    });
    vi.stubGlobal('fetch', fetcher);
    let outcome = 'pending';
    const waiting = waitForHttpOk('http://readiness.invalid/health', { timeoutMs: 100 })
      .then(() => { outcome = 'ready'; }, () => { outcome = 'rejected'; });
    await vi.advanceTimersByTimeAsync(100);
    const atDeadline = outcome;
    const aborted = signal?.aborted;
    release(new Error('test cleanup'));
    await vi.advanceTimersByTimeAsync(150);
    await waiting;
    assert.equal(atDeadline, 'rejected');
    assert.equal(aborted, true);
    assert.equal(fetcher.mock.calls.length, 1);
    assert.equal(vi.getTimerCount(), 0);
  });

  it('releases a successful streaming body and removes the deadline timer', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, cancel)));
    assert.equal(await waitForHttpOk('http://readiness.invalid/health'), true);
    assert.equal(cancel.mock.calls.length, 1);
    assert.equal(vi.getTimerCount(), 0);
  });

  it('releases a failed-status body before retrying and releases the successful body', async () => {
    const firstCancel = vi.fn(), readyCancel = vi.fn();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(503, firstCancel))
      .mockImplementationOnce(() => {
        assert.equal(firstCancel.mock.calls.length, 1);
        return Promise.resolve(response(200, readyCancel));
      });
    vi.stubGlobal('fetch', fetcher);
    assert.equal(await waitForHttpOk('http://readiness.invalid/health', { timeoutMs: 1_000 }), true);
    assert.equal(fetcher.mock.calls.length, 2);
    assert.equal(readyCancel.mock.calls.length, 1);
  });

  it('does not replace a successful readiness result when body cancellation rejects', async () => {
    const cancel = vi.fn(() => Promise.reject(new Error('stream cleanup failed')));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, cancel)));
    assert.equal(await waitForHttpOk('http://readiness.invalid/health'), true);
    await Promise.resolve();
    assert.equal(cancel.mock.calls.length, 1);
  });

  it('still retries a transient connection failure', async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    assert.equal(await waitForHttpOk('http://readiness.invalid/health', { timeoutMs: 1_000 }), true);
    assert.equal(fetcher.mock.calls.length, 2);
  });

  it('does not start a request when the wait budget is zero', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await assert.rejects(waitForHttpOk('http://readiness.invalid/health', { timeoutMs: 0 }), /timed out waiting/);
    assert.equal(fetcher.mock.calls.length, 0);
  });
});
