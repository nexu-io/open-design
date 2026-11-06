// @vitest-environment jsdom
//
// Regression test for "first-analytics-session marker must be consent-gated"
// (PR #5111 review). `isFirstSession()` is a pure read; the pin is written only
// once `/api/analytics/config` confirms capture is enabled, which every caller
// funnels through `getAnalyticsClient`. The contract pinned here: an install
// that first boots with analytics OFF and opts in later still records its real
// first *analytics* session as first, instead of leaving the marker unset and
// reporting `is_first_session=true` forever.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FIRST_SESSION_KEY = 'open-design:analytics.first_session_id';

const posthogState = vi.hoisted(() => ({ initShouldThrow: false }));

vi.mock('posthog-js', () => {
  const stub = {
    init: (_key: string, config: { loaded?: (i: unknown) => void }) => {
      if (posthogState.initShouldThrow) throw new Error('posthog init failed');
      config.loaded?.(stub);
      return stub;
    },
    register: () => undefined,
    setPersonProperties: () => undefined,
    opt_in_capturing: () => undefined,
    opt_out_capturing: () => undefined,
    reset: () => undefined,
    identify: () => undefined,
  };
  return { default: stub };
});

function analyticsConfigResponse(enabled: boolean): Response {
  const body = enabled
    ? {
        enabled: true,
        env: 'local_development',
        key: 'phc_test_key',
        host: 'https://us.i.posthog.com',
        installationId: 'install-123',
      }
    : { enabled: false };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function createStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe('first-analytics-session pin is consent-gated', () => {
  const originalFetch = globalThis.fetch;
  let captureEnabled = false;

  beforeEach(() => {
    vi.resetModules();
    // jsdom in this suite does not expose a working Storage, so pin the two
    // storage surfaces the analytics identity helpers touch to fresh stubs.
    Object.defineProperty(window, 'localStorage', {
      value: createStorageStub(),
      configurable: true,
    });
    Object.defineProperty(window, 'sessionStorage', {
      value: createStorageStub(),
      configurable: true,
    });
    captureEnabled = false;
    posthogState.initShouldThrow = false;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.endsWith('/api/analytics/config')) {
        return analyticsConfigResponse(captureEnabled);
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const ctx = {
    anonymousId: 'anon-1',
    sessionId: 'sess-1',
    clientType: 'web' as const,
    locale: 'en',
    appVersion: '1.2.3',
  };

  it('does not pin the first session when capture is disabled at boot', async () => {
    const { getAnalyticsClient } = await import('../src/analytics/client');
    captureEnabled = false;
    expect(await getAnalyticsClient(ctx)).toBeNull();
    // Let getAnalyticsClient reset its cached initPromise after a null result.
    await Promise.resolve();
    expect(window.localStorage.getItem(FIRST_SESSION_KEY)).toBeNull();
  });

  it('pins the current session once capture is enabled', async () => {
    const { getAnalyticsClient } = await import('../src/analytics/client');
    const { getSessionId, isFirstSession } = await import('../src/analytics/identity');
    captureEnabled = true;
    expect(await getAnalyticsClient(ctx)).not.toBeNull();
    expect(window.localStorage.getItem(FIRST_SESSION_KEY)).toBe(getSessionId());
    // A later browser session (fresh session id, surviving pin) is not first.
    window.sessionStorage.clear();
    expect(getSessionId()).not.toBe(window.localStorage.getItem(FIRST_SESSION_KEY));
    expect(isFirstSession()).toBe(false);
  });

  it('boots with metrics off, enabled later in the same session, still marks first', async () => {
    const { getAnalyticsClient } = await import('../src/analytics/client');
    const { getSessionId, isFirstSession } = await import('../src/analytics/identity');
    // Boot with metrics off: no client, no pin.
    captureEnabled = false;
    expect(await getAnalyticsClient(ctx)).toBeNull();
    await Promise.resolve();
    expect(window.localStorage.getItem(FIRST_SESSION_KEY)).toBeNull();
    const firstSessionId = getSessionId();
    // The user opts in later in the same tab session.
    captureEnabled = true;
    expect(await getAnalyticsClient(ctx)).not.toBeNull();
    // This session is pinned as the install's first analytics session.
    expect(window.localStorage.getItem(FIRST_SESSION_KEY)).toBe(firstSessionId);
    expect(isFirstSession()).toBe(true);
  });

  it('does not pin when config is enabled but client init fails', async () => {
    const { getAnalyticsClient } = await import('../src/analytics/client');
    const { isFirstSession } = await import('../src/analytics/identity');
    captureEnabled = true;
    posthogState.initShouldThrow = true;
    // Init throws → getAnalyticsClient collapses to null, and no analytics
    // session was ever captured, so the first-session marker must NOT advance.
    expect(await getAnalyticsClient(ctx)).toBeNull();
    await Promise.resolve();
    expect(window.localStorage.getItem(FIRST_SESSION_KEY)).toBeNull();
    // A later boot that DOES init is still the real first analytics session.
    vi.resetModules();
    posthogState.initShouldThrow = false;
    const { getAnalyticsClient: getAnalyticsClientRetry } = await import('../src/analytics/client');
    expect(await getAnalyticsClientRetry(ctx)).not.toBeNull();
    expect(window.localStorage.getItem(FIRST_SESSION_KEY)).not.toBeNull();
    expect(isFirstSession()).toBe(true);
  });
});
