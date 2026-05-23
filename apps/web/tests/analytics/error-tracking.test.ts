// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearExceptionTrackingContext,
  installErrorHandlers,
  reportHandledException,
  setExceptionTrackingContext,
} from '../../src/analytics/error-tracking';

/**
 * These tests exercise the always-on, consent-independent exception
 * pipeline. They do NOT touch posthog-js. The pipeline's full contract:
 *
 *   1. `installErrorHandlers()` hooks `window.error` and
 *      `unhandledrejection` at module load. Idempotent.
 *   2. Captured exceptions buffer in memory until
 *      `setExceptionTrackingContext({apiKey, host, distinctId})` arrives.
 *   3. Once a context is set, buffered events drain to the PostHog ingest
 *      endpoint via `fetch`. Subsequent captures dispatch immediately.
 *   4. Buffer is capped at 50 entries to bound memory in an error loop.
 *   5. Scrubbing (file path redaction) runs before dispatch.
 */

const fetchMock = vi.fn();

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  clearExceptionTrackingContext();
});

afterEach(() => {
  clearExceptionTrackingContext();
  globalThis.fetch = ORIGINAL_FETCH;
});

function lastFetchedBody(): Record<string, unknown> {
  expect(fetchMock).toHaveBeenCalled();
  const lastCall = fetchMock.mock.calls.at(-1)!;
  const init = lastCall[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('error-tracking', () => {
  it('buffers captures dispatched before a context is set, then flushes', async () => {
    installErrorHandlers();

    // Fire a captured (handled) exception BEFORE the context is wired up.
    reportHandledException(new Error('early-boom'));
    expect(fetchMock).not.toHaveBeenCalled();

    // Now the bootstrap completes — buffer should drain.
    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-1',
      appVersion: '1.2.3',
      sessionId: 'session-abc',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = lastFetchedBody();
    expect(body).toMatchObject({
      api_key: 'phc_test',
      event: '$exception',
      distinct_id: 'user-1',
      properties: expect.objectContaining({
        $exception_type: 'Error',
        $exception_message: 'early-boom',
        app_version: '1.2.3',
        session_id: 'session-abc',
      }),
    });
  });

  it('dispatches immediately when a context is already set', () => {
    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-2',
    });

    reportHandledException(new TypeError('immediate'));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = lastFetchedBody();
    expect(body.properties).toMatchObject({
      $exception_type: 'TypeError',
      $exception_message: 'immediate',
      handled: true,
    });
  });

  it('captures unhandledrejection events via the window hook', () => {
    installErrorHandlers();
    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-3',
    });

    // jsdom's PromiseRejectionEvent constructor exists but doesn't auto-fire
    // when a promise rejects; we synthesize one to drive the listener.
    const reason = new RangeError('boom-async');
    const event = new Event('unhandledrejection') as Event & {
      reason?: unknown;
      promise?: Promise<unknown>;
    };
    event.reason = reason;
    event.promise = Promise.reject(reason);
    // Silence Node's actual unhandled-rejection warning on the synthesized
    // promise. jsdom forwards it to process otherwise.
    event.promise.catch(() => undefined);
    window.dispatchEvent(event);

    expect(fetchMock).toHaveBeenCalled();
    const body = lastFetchedBody();
    expect(body.properties).toMatchObject({
      $exception_type: 'RangeError',
      $exception_message: 'boom-async',
      handled: false,
    });
  });

  it('captures synchronous window.error events', () => {
    installErrorHandlers();
    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-4',
    });

    const error = new Error('sync-boom');
    const event = new Event('error') as Event & {
      error?: unknown;
      message?: string;
      filename?: string;
      lineno?: number;
      colno?: number;
    };
    event.error = error;
    event.message = 'sync-boom';
    event.filename = 'app://apps/web/src/foo.tsx';
    event.lineno = 42;
    event.colno = 7;
    window.dispatchEvent(event);

    expect(fetchMock).toHaveBeenCalled();
    const body = lastFetchedBody();
    expect(body.properties).toMatchObject({
      $exception_type: 'Error',
      $exception_message: 'sync-boom',
      handled: false,
    });
  });

  it('caps the buffer at 50 entries to bound memory in an error loop', () => {
    // No context — every capture lands in the buffer.
    for (let i = 0; i < 75; i += 1) {
      reportHandledException(new Error(`loop-${i}`));
    }
    expect(fetchMock).not.toHaveBeenCalled();

    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-loop',
    });

    // Buffer cap is 50; the oldest 25 should have been evicted in FIFO order.
    expect(fetchMock).toHaveBeenCalledTimes(50);
    const firstBody = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(
      (firstBody.properties as Record<string, unknown>).$exception_message,
    ).toBe('loop-25');
    const lastBody = lastFetchedBody();
    expect(
      (lastBody.properties as Record<string, unknown>).$exception_message,
    ).toBe('loop-74');
  });

  it('scrubs absolute filesystem paths from stack frames before dispatch', () => {
    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-scrub',
    });

    // Synthesize an Error with a stack that contains a packaged-app path —
    // the scrub layer should rewrite it to the repo-relative form.
    const error = new Error('scrub-target');
    error.stack = [
      'Error: scrub-target',
      '    at handleClick (file:///Applications/Open Design.app/Contents/Resources/apps/web/src/FileViewer.tsx:147:23)',
      '    at /Users/jane/dev/checkout/apps/web/src/index.tsx:12:1',
    ].join('\n');
    reportHandledException(error);

    const body = lastFetchedBody();
    const list = (body.properties as Record<string, unknown>).$exception_list as Array<{
      stacktrace?: { frames?: Array<Record<string, unknown>> };
    }>;
    const frames = list[0]?.stacktrace?.frames;
    expect(frames).toBeTruthy();
    expect(frames!.length).toBeGreaterThanOrEqual(2);
    for (const frame of frames!) {
      const filename = frame.filename;
      if (typeof filename === 'string') {
        expect(filename).toMatch(/^app:\/\/apps\/web\//);
        expect(filename).not.toContain('Applications/Open Design.app');
        expect(filename).not.toContain('/Users/jane');
      }
    }
  });

  it('treats reportHandledException string input as a non-Error message', () => {
    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-str',
    });

    reportHandledException('weird global signal');
    const body = lastFetchedBody();
    expect(body.properties).toMatchObject({
      $exception_message: 'weird global signal',
      handled: true,
    });
  });

  it('drops events silently when no context is ever set (no key in env)', () => {
    reportHandledException(new Error('orphan'));
    expect(fetchMock).not.toHaveBeenCalled();
    // Even after explicitly clearing — the buffer is bounded and harmless.
    clearExceptionTrackingContext();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
