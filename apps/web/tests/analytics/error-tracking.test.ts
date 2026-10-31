// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  classifyBrowserOsName,
  clearExceptionTrackingContext,
  installErrorHandlers,
  patchExceptionTrackingAppVersion,
  patchExceptionTrackingDistinctId,
  reportHandledException,
  reportSafetyEvent,
  reportClientMetricEvent,
  setExceptionTrackingContext as setProductionExceptionTrackingContext,
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

// The consent-gated local diagnostic transport is covered independently.
// Shared setup imports analytics transitively; reload it after registering this mock.
vi.hoisted(() => vi.resetModules());
vi.mock('../../src/observability/experience-diagnostics', () => ({ reportExperienceEvent: vi.fn() }));

const fetchMock = vi.fn();

const ORIGINAL_FETCH = globalThis.fetch;

function setExceptionTrackingContext(
  next: {
    apiKey: string;
    host: string;
    distinctId: string;
    appVersion?: string;
    sessionId?: string;
    telemetryEnv?: string;
    clientType?: 'web' | 'desktop' | 'external_mcp';
    osName?: 'Mac OS X' | 'Windows' | 'Linux' | 'Android' | 'iOS' | 'Chrome OS' | 'unknown';
  },
): void {
  setProductionExceptionTrackingContext({
    clientType: 'web',
    osName: 'Mac OS X',
    ...next,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  clearExceptionTrackingContext();
});

afterEach(() => {
  clearExceptionTrackingContext();
  globalThis.fetch = ORIGINAL_FETCH;
  delete (globalThis as { _posthogChunkIds?: Record<string, string> })._posthogChunkIds;
});

function lastFetchedBody(): Record<string, unknown> {
  expect(fetchMock).toHaveBeenCalled();
  const lastCall = fetchMock.mock.calls.at(-1)!;
  const init = lastCall[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('error-tracking', () => {
  it.each([
    ['MacIntel', 'Mozilla/5.0 (Macintosh)', 0, 'Mac OS X'],
    ['Win32', 'Mozilla/5.0 (Windows NT 10.0)', 0, 'Windows'],
    ['Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64)', 0, 'Linux'],
    ['Linux armv8l', 'Mozilla/5.0 (Linux; Android 15)', 0, 'Android'],
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', 5, 'iOS'],
    ['MacIntel', 'Mozilla/5.0 (Macintosh)', 5, 'iOS'],
  ])(
    'classifies browser signals for %s',
    (platform, userAgent, maxTouchPoints, expected) => {
      expect(classifyBrowserOsName({ platform, userAgent, maxTouchPoints })).toBe(expected);
    },
  );

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
        event_schema_version: 4,
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

  it('stamps OS and client type on direct safety events', () => {
    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-platform-metadata',
      clientType: 'desktop',
      osName: 'Mac OS X',
    });

    reportSafetyEvent('client_boot_timing', { duration_ms: 42 });

    expect(lastFetchedBody().properties).toMatchObject({
      $os: 'Mac OS X',
      client_type: 'desktop',
      duration_ms: 42,
    });
  });

  it('stamps chunk_id on frames whose chunk registered one, so PostHog can match the uploaded sourcemap', () => {
    // Mirror what `@posthog/cli sourcemap inject` registers at chunk load:
    // key = the chunk's own Error().stack, value = its chunk id. The stack is
    // multi-frame — the injected IIFE (newest, the chunk itself) sits above a
    // webpack runtime frame (older) — so the id MUST key onto the newest
    // frame's file (page-abc.js), not the outermost one. A loop that picked
    // the wrong end would key it onto webpack-runtime.js and leave page-abc.js
    // unmatched.
    (globalThis as { _posthogChunkIds?: Record<string, string> })._posthogChunkIds = {
      [[
        'Error',
        '    at od://app/_next/static/chunks/page-abc.js:1:100',
        '    at __webpack_require__ (od://app/_next/static/chunks/webpack-runtime.js:2:200)',
      ].join('\n')]: 'chunk-page-abc',
    };
    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-chunk',
    });

    const err = new Error('kaboom');
    // Two frames: the first is from the chunk that registered an id, the
    // second from a chunk that did not.
    err.stack = [
      'Error: kaboom',
      '    at render (od://app/_next/static/chunks/page-abc.js:42:13)',
      '    at commit (od://app/_next/static/chunks/framework-xyz.js:7:9)',
    ].join('\n');
    reportHandledException(err);

    const body = lastFetchedBody();
    const list = (body.properties as Record<string, unknown>).$exception_list as Array<{
      stacktrace?: { frames?: Array<Record<string, unknown>> };
    }>;
    const frames = list[0]?.stacktrace?.frames ?? [];
    const withChunkId = frames.filter((f) => typeof f.chunk_id === 'string');
    // Exactly the frame from the registered chunk is stamped — and with the
    // id PostHog will use to locate the uploaded map. No spurious ids leak
    // onto frames whose chunk never registered one.
    expect(withChunkId).toHaveLength(1);
    expect(withChunkId[0]!.chunk_id).toBe('chunk-page-abc');
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

  it('patchExceptionTrackingAppVersion updates appVersion on dispatched events', () => {
    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-patch',
      appVersion: '0.0.0',
    });
    patchExceptionTrackingAppVersion('1.2.3');
    reportHandledException(new Error('patched'));
    const body = lastFetchedBody();
    expect((body.properties as Record<string, unknown>).app_version).toBe('1.2.3');
  });

  it('patchExceptionTrackingAppVersion is a no-op when no context is set', () => {
    expect(() => patchExceptionTrackingAppVersion('1.2.3')).not.toThrow();
    reportHandledException(new Error('no context'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Regression: 100% of our hand-built `$exception` events were failing to
  // ingest with "missing field platform" because the frames omitted the
  // `platform` key PostHog's exception pipeline requires. posthog-js stamps
  // `web:javascript` on every frame; we must too.
  it('stamps platform on every stack frame so PostHog ingestion accepts the event', () => {
    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-platform',
    });

    const error = new Error('needs-platform');
    error.stack = [
      'Error: needs-platform',
      '    at handleClick (app://apps/web/src/FileViewer.tsx:147:23)',
      '    at app://apps/web/src/index.tsx:12:1',
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
      expect(frame.platform).toBe('web:javascript');
    }
  });

  // Regression: `TypeError: Failed to fetch` from the packaged renderer's
  // daemon connection dropping (restart, boot race, navigation abort,
  // offline) was ~90% of all captured exceptions — environmental noise.
  // Drop it, but ONLY when it originates in packaged app code (od:// scheme).
  it('drops packaged-app fetch noise but keeps the same error from the web app', () => {
    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-noise',
    });

    // Packaged: the failing fetch ran in od:// app code → dropped.
    const packaged = new TypeError('Failed to fetch');
    packaged.stack = [
      'TypeError: Failed to fetch',
      '    at window.fetch (od://app/_next/static/chunks/abc.js:1:100)',
      '    at poll (od://app/_next/static/chunks/abc.js:1:200)',
    ].join('\n');
    reportHandledException(packaged);
    expect(fetchMock).not.toHaveBeenCalled();

    // Web app: SAME message, but the fetch failed in non-packaged code. In a
    // browser this can be the only signal of a broken /api/* deploy or a
    // CORS/TLS regression, so it must stay captured.
    const web = new TypeError('Failed to fetch');
    web.stack = [
      'TypeError: Failed to fetch',
      '    at loadProjects (https://app.example.com/_next/static/chunks/x.js:1:50)',
    ].join('\n');
    reportHandledException(web);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((lastFetchedBody().properties as Record<string, unknown>).$exception_message).toBe(
      'Failed to fetch',
    );
  });

  // Packaged exceptions don't only arrive as od:// frames — source-mapped
  // frames surface as `file:///…/<Channel>.app/Contents/Resources/…` (the
  // shape scrub.ts rewrites). Those packaged fetch failures must be dropped
  // too, otherwise part of the noise path leaks through.
  it('drops packaged fetch noise from file:// app-bundle stack frames', () => {
    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-bundle',
    });

    const bundled = new TypeError('Failed to fetch');
    bundled.stack = [
      'TypeError: Failed to fetch',
      '    at fetchProjects (file:///Applications/Open Design.app/Contents/Resources/apps/web/src/state/projects.ts:88:14)',
    ].join('\n');
    reportHandledException(bundled);
    expect(fetchMock).not.toHaveBeenCalled();

    // Beta/preview channels use a different app-bundle name — still dropped.
    const beta = new TypeError('Failed to fetch');
    beta.stack = [
      'TypeError: Failed to fetch',
      '    at fetchProjects (file:///Applications/Open Design Beta.app/Contents/Resources/apps/web/src/state/projects.ts:88:14)',
    ].join('\n');
    reportHandledException(beta);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // AbortError is NOT blanket-dropped: it isn't necessarily fetch-lifecycle
  // cancellation and was never a measured noise source. It flows through.
  it('does not drop AbortError', () => {
    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-abort',
    });
    const aborted = new Error('the operation was aborted.');
    aborted.name = 'AbortError';
    aborted.stack = 'AbortError: the operation was aborted.\n    at x (od://app/_next/static/chunks/y.js:1:1)';
    reportHandledException(aborted);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((lastFetchedBody().properties as Record<string, unknown>).$exception_type).toBe(
      'AbortError',
    );
  });

  // Regression: a failed telemetry beacon (PostHog unreachable) must not
  // manufacture another exception. In the real browser the beacon's own
  // `fetch` rejection is swallowed by the `.catch()` in dispatch(); if it
  // ever surfaces anyway — as an unhandledrejection whose TypeError
  // originates in our od:// transport code — the packaged noise filter is the
  // backstop that stops it re-entering as a second `$exception`/beacon. This
  // exercises that backstop (the part observable under jsdom — Node routes
  // promise rejections to `process`, not `window.onunhandledrejection`, so
  // the `.catch()` itself isn't unit-observable here).
  it('a failed beacon surfacing as an unhandledrejection does not spawn a second beacon', () => {
    installErrorHandlers();
    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-loop',
    });

    // A genuine exception dispatches exactly one beacon.
    reportHandledException(new Error('real-bug'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();

    // Now simulate that beacon's own request failing and surfacing as an
    // unhandledrejection from our od:// transport code.
    const beaconFailure = new TypeError('Failed to fetch');
    beaconFailure.stack = [
      'TypeError: Failed to fetch',
      '    at dispatch (od://app/_next/static/chunks/error-tracking.js:1:42)',
    ].join('\n');
    const rejection = new Event('unhandledrejection') as Event & {
      reason?: unknown;
      promise?: Promise<unknown>;
    };
    rejection.reason = beaconFailure;
    rejection.promise = Promise.reject(beaconFailure);
    rejection.promise.catch(() => undefined);
    window.dispatchEvent(rejection);

    // No second beacon — the loop is broken.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * Attribution guards for the un-typable exception.
 *
 * The stability report's frontend Top 5 carries a row literally rendered as
 * `Error  — 235 次 / ~74 台`: an exception with a type but no value, which no
 * amount of dashboard work can turn into a cause. Two independent sources:
 *
 *   1. `buildExceptionList` copied `error.name` / `error.message` straight
 *      through, and both can legitimately be '' (a bare `new Error()`, or a
 *      subclass whose `name` a minifier mangled away).
 *   2. `parseStack` returned `[]` for a stackless error. PostHog derives
 *      `$exception_types` / `$exception_values` from `$exception_list` at
 *      ingestion and drops entries failing frame validation, so a zero-frame
 *      entry lands with neither field set — this is how a cross-origin
 *      "Script error." disappears.
 */
describe('exception attribution', () => {
  beforeEach(() => {
    setExceptionTrackingContext({
      apiKey: 'phc_test',
      host: 'https://us.i.posthog.com',
      distinctId: 'user-attrib',
    });
  });

  it('never ships an empty exception value for a message-less Error', () => {
    reportHandledException(new Error(''));

    const props = lastFetchedBody().properties as Record<string, unknown>;
    const list = props.$exception_list as Array<{ type: string; value: string }>;
    expect(list[0]!.type).not.toBe('');
    expect(list[0]!.value).not.toBe('');
    expect(props.$exception_message).not.toBe('');
  });

  it('never ships an empty exception type when the name was mangled away', () => {
    const mangled = new Error('boom');
    Object.defineProperty(mangled, 'name', { value: '', configurable: true });

    reportHandledException(mangled);

    const list = (lastFetchedBody().properties as Record<string, unknown>)
      .$exception_list as Array<{ type: string; value: string }>;
    expect(list[0]!.type).toBe('Error');
    expect(list[0]!.value).toBe('boom');
  });

  it.each([
    ['missing stack', undefined],
    ['empty stack', ''],
    ['header-only stack', 'Error: Script error.'],
    ['unparseable stack', 'some vendor noise\nmore noise'],
  ])('ships a non-empty stacktrace for a %s', (_label, stackValue) => {
    const err = new Error('Script error.');
    if (stackValue === undefined) {
      delete (err as { stack?: string }).stack;
    } else {
      Object.defineProperty(err, 'stack', { value: stackValue, configurable: true });
    }

    reportHandledException(err);

    const list = (lastFetchedBody().properties as Record<string, unknown>)
      .$exception_list as Array<{ stacktrace?: { frames?: unknown[] } }>;
    expect(list[0]!.stacktrace?.frames?.length).toBeGreaterThan(0);
  });

  it('ships a synthetic frame rather than a zero-frame stacktrace', () => {
    // A cross-origin "Script error.": no stack, no filename, nothing to parse.
    const stackless = new Error('Script error.');
    delete (stackless as { stack?: string }).stack;

    reportHandledException(stackless);

    const list = (lastFetchedBody().properties as Record<string, unknown>)
      .$exception_list as Array<{ stacktrace?: { frames?: unknown[] } }>;
    expect(list[0]!.stacktrace?.frames?.length).toBeGreaterThan(0);
  });
});

describe('CS01 safety envelope', () => {
  it('does not replace a resolved version with placeholder or unknown', () => {
    setExceptionTrackingContext({ apiKey: 'phc_test', host: 'https://ingest.invalid', distinctId: 'install-1', appVersion: '1.2.3' });
    patchExceptionTrackingAppVersion('0.0.0');
    patchExceptionTrackingAppVersion('unknown');
    reportSafetyEvent('client_boot_timing');
    expect(lastFetchedBody().properties).toMatchObject({ app_version: '1.2.3' });
  });

  it('stamps stable event/device identity and separate occurrence/report timestamps', () => {
    reportSafetyEvent('client_boot_timing', { duration_ms: 12 });
    setExceptionTrackingContext({ apiKey: 'phc_test', host: 'https://ingest.invalid', distinctId: 'install-1', appVersion: '1.2.3', sessionId: 'session-1', telemetryEnv: 'test' });
    const body = lastFetchedBody();
    const properties = body.properties as Record<string, unknown>;
    expect(properties).toMatchObject({
      device_id: 'install-1', app_session_id: 'session-1', client_version: '1.2.3',
      env: 'test', occurred_at: body.timestamp, reported_at: expect.any(String),
      event_id: properties.$insert_id,
    });
  });
});

it('preserves buffered safety metric occurrence metadata and strips URL/content properties', () => {
  const properties = {
    metric_schema_version: 1, event_id: 'original-event', app_session_id: 'original-session',
    app_version: '1.0.0-beta.1', client_version: '1.0.0-beta.1', channel: 'beta',
    occurred_at: '2026-10-16T01:00:00.000Z', telemetry_capability: 'supported',
    navigation_id: 'nav-1', navigation_type: 'project_enter', source_type: 'home',
    target_type: 'project', result: 'cancelled', started_at: '2026-10-16T01:00:00.000Z', duration_ms: 100,
    prompt: 'private input', full_url: 'https://private.invalid',
  };
  reportSafetyEvent('client_navigation_result', properties);
  expect(fetchMock).not.toHaveBeenCalled();
  setExceptionTrackingContext({ apiKey: 'phc_test', host: 'https://ingest.invalid', distinctId: 'install-1', appVersion: '2.0.0', sessionId: 'current-session', telemetryEnv: 'test' });
  expect(fetchMock).toHaveBeenCalledOnce();
  reportSafetyEvent('client_navigation_result', properties);
  const body = lastFetchedBody();
  expect(body).toMatchObject({ timestamp: properties.occurred_at, properties: {
    event_id: 'original-event', $insert_id: 'original-event', app_session_id: 'original-session',
    app_version: '1.0.0-beta.1', channel: 'beta', result: 'cancelled', env: 'test',
    platform: null, os_version: null, arch: null,
  } });
  for (const key of ['prompt', 'full_url', '$current_url']) expect(body.properties).not.toHaveProperty(key);
});


it('buffers preview metrics and reports after product analytics is opted out', async () => {
  const { applyConsent } = await import('../../src/analytics/client');
  applyConsent(false);
  const fields = { metric_schema_version: 1, preview_attempt_id: 'a', render_mode: 'srcdoc',
    artifact_kind: null, started_at: new Date().toISOString(), telemetry_capability: 'supported',
    path: '/private', url: 'https://private.invalid', content: 'secret', prompt: 'secret', pid: 123 };
  expect(reportClientMetricEvent('client_preview_attempt', fields)).toBe(true);
  expect(fetchMock).not.toHaveBeenCalled();
  setExceptionTrackingContext({ apiKey: 'phc_test', host: 'https://ingest.invalid', distinctId: 'install' });
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(reportClientMetricEvent('client_preview_result', { ...fields, result: 'success', duration_ms: 1, monitoring_kind: 'visible_content' })).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  for (const [, init] of fetchMock.mock.calls) {
    const properties = JSON.parse(init.body).properties;
    for (const key of ['path', 'url', 'content', 'prompt', 'pid', '$current_url']) expect(properties).not.toHaveProperty(key);
  }
});

it('keeps legacy preview/app-white-screen/firstpaint events on the safety channel after opt-out', async () => {
  const { applyConsent } = await import('../../src/analytics/client');
  applyConsent(false);
  const names = ['client_preview_white_screen', 'client_preview_runtime_error', 'client_preview_resource_error', 'client_white_screen', 'client_chat_first_paint'];
  for (const event of names) reportSafetyEvent(event, { monitoring_kind: 'fixture' });
  expect(fetchMock).not.toHaveBeenCalled();
  setExceptionTrackingContext({ apiKey: 'phc_test', host: 'https://ingest.invalid', distinctId: 'install' });
  expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).event)).toEqual(names);
});

describe('safety identity on a fresh install (OPEND-4220)', () => {
  const base = { apiKey: 'phc_test', host: 'https://ingest.invalid', appVersion: '1.2.3', sessionId: 'session-1', telemetryEnv: 'test' };

  it('switches renderer stability events to the installation id minted after bootstrap', () => {
    setExceptionTrackingContext({ ...base, distinctId: 'anon-bootstrap' });
    patchExceptionTrackingDistinctId('install-1');
    reportSafetyEvent('client_boot_timing', { duration_ms: 1 });
    const body = lastFetchedBody();
    expect(body.distinct_id).toBe('install-1');
    expect((body.properties as Record<string, unknown>).device_id).toBe('install-1');
  });

  it('keeps the installation id when bootstrap resolves after setIdentity', () => {
    patchExceptionTrackingDistinctId('install-1');
    setExceptionTrackingContext({ ...base, distinctId: 'anon-bootstrap' });
    reportSafetyEvent('client_boot_timing', { duration_ms: 1 });
    expect((lastFetchedBody().properties as Record<string, unknown>).device_id).toBe('install-1');
  });

  it('ignores a missing installation id', () => {
    setExceptionTrackingContext({ ...base, distinctId: 'anon-bootstrap' });
    patchExceptionTrackingDistinctId(null);
    reportSafetyEvent('client_boot_timing', { duration_ms: 1 });
    expect((lastFetchedBody().properties as Record<string, unknown>).device_id).toBe('anon-bootstrap');
  });
});

describe('first-session metric hold until the installation id exists (OPEND-4220 retest 2)', () => {
  const base = { apiKey: 'phc_test', host: 'https://ingest.invalid', appVersion: '1.2.3', sessionId: 'session-1', telemetryEnv: 'test' };
  const metricBodies = () => fetchMock.mock.calls
    .map(([, init]) => JSON.parse((init as RequestInit).body as string) as { event: string; distinct_id: string; properties: Record<string, unknown> })
    .filter((body) => body.event.startsWith('client_') && body.event !== 'client_boot_timing');
  const pendingContext = () => setProductionExceptionTrackingContext({
    clientType: 'desktop', osName: 'Mac OS X', ...base, distinctId: 'anon-bootstrap', identityPending: true,
  });

  it('holds metrics emitted before the id and sends them under the installation id', () => {
    pendingContext();
    reportClientMetricEvent('client_process_memory_sample', {
      metric_schema_version: 1, telemetry_capability: 'supported', process_role: 'renderer',
      process_instance_id: 'p-1', uptime_ms: 1, rss_bytes: 1, heap_used_bytes: null, external_bytes: null,
      sampled_at: '2026-10-22T00:00:00.000Z', sampling_interval_ms: 60_000, event_id: 'early-1',
    });
    expect(metricBodies()).toHaveLength(0);
    patchExceptionTrackingDistinctId('install-1');
    const sent = metricBodies();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.distinct_id).toBe('install-1');
    expect(sent[0]!.properties.device_id).toBe('install-1');
  });

  it('keeps holding when a later re-bridge omits the identity flag (packaged retest)', () => {
    pendingContext();
    // posthog-js init re-bridges the context without identityPending.
    setProductionExceptionTrackingContext({ clientType: 'desktop', osName: 'Mac OS X', ...base, distinctId: 'anon-bootstrap' });
    reportClientMetricEvent('client_process_memory_sample', {
      metric_schema_version: 1, telemetry_capability: 'supported', process_role: 'renderer',
      process_instance_id: 'p-1', uptime_ms: 1, rss_bytes: 1, heap_used_bytes: null, external_bytes: null,
      sampled_at: '2026-10-22T00:00:00.000Z', sampling_interval_ms: 60_000, event_id: 'early-rebridge',
    });
    expect(metricBodies()).toHaveLength(0);
    patchExceptionTrackingDistinctId('install-1');
    expect(metricBodies().map((body) => body.properties.device_id)).toEqual(['install-1']);
  });

  it('holds legacy safety events such as client_boot_timing too (packaged retest)', () => {
    pendingContext();
    reportSafetyEvent('client_boot_timing', { duration_ms: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
    patchExceptionTrackingDistinctId('install-1');
    expect((lastFetchedBody().properties as Record<string, unknown>).device_id).toBe('install-1');
  });

  it('still sends exceptions immediately while metrics are held', () => {
    pendingContext();
    reportHandledException(new Error('boom'));
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string).event)).toContain('$exception');
  });

  it('releases held metrics under the bootstrap id if the installation id never arrives', () => {
    vi.useFakeTimers();
    try {
      pendingContext();
      reportClientMetricEvent('client_process_memory_sample', {
        metric_schema_version: 1, telemetry_capability: 'supported', process_role: 'renderer',
        process_instance_id: 'p-1', uptime_ms: 1, rss_bytes: 1, heap_used_bytes: null, external_bytes: null,
        sampled_at: '2026-10-22T00:00:00.000Z', sampling_interval_ms: 60_000, event_id: 'early-2',
      });
      expect(metricBodies()).toHaveLength(0);
      vi.advanceTimersByTime(60_000);
      const sent = metricBodies();
      expect(sent).toHaveLength(1);
      expect(sent[0]!.properties.device_id).toBe('anon-bootstrap');
    } finally { vi.useRealTimers(); }
  });

  it('does not hold when bootstrap already has the installation id', () => {
    setProductionExceptionTrackingContext({ clientType: 'desktop', osName: 'Mac OS X', ...base, distinctId: 'install-1', identityPending: false });
    reportClientMetricEvent('client_process_memory_sample', {
      metric_schema_version: 1, telemetry_capability: 'supported', process_role: 'renderer',
      process_instance_id: 'p-1', uptime_ms: 1, rss_bytes: 1, heap_used_bytes: null, external_bytes: null,
      sampled_at: '2026-10-22T00:00:00.000Z', sampling_interval_ms: 60_000, event_id: 'warm-1',
    });
    expect(metricBodies()).toHaveLength(1);
  });
});
