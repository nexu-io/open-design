// @vitest-environment jsdom
//
// Red-spec (W82 item 4): `GET /api/analytics/config` was read 4-5 times on one
// cold conversation open. Measured in a real browser with `window.fetch`
// wrapped to record `new Error().stack`:
//
//   t=1988  bootstrapExceptionTracking  ← AnalyticsProvider.useEffect
//   t=4394  getAnalyticsClient          ← AnalyticsProvider.useMemo[value]  (setConsent)
//   t=5074  getAnalyticsClient          ← AnalyticsProvider.useCallback[track]
//   t=5970  getAnalyticsClient          ← AnalyticsProvider.useCallback[track]
//
// The first two are the two legitimate owners and they already share one
// in-flight read (ttl-0 `coalescedGet`, `fetchAnalyticsConfigShared`). The
// repeats are the last two: `getAnalyticsClient` deliberately drops its
// memoised init promise whenever it resolves to `null`, so that a later opt-in
// can retry — which also means EVERY `track()` call re-reads the endpoint for
// the whole life of a session where analytics is off. That is every user who
// declined the privacy toggle, and every dev build (no `POSTHOG_KEY` → the
// daemon answers `enabled:false, key:null`).
//
// The invariant pinned here: the retry belongs to the EVENT that can change
// the answer, not to every caller.
//   * before the app has applied a consent decision, a null answer is
//     provisional and the next caller may re-read (boot ordering);
//   * once a consent decision has been applied, only a fresh GRANT reopens it;
//   * `applyConsent(true)` still produces exactly one fresh read, so opting in
//     later in the same session still initialises the client.
//
// This is not a cache: nothing retains a config BODY. What is retained is the
// module's own resolved `PostHog | null` handle, which is what the non-null
// branch already did.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const ctx = {
  anonymousId: 'anon-1',
  sessionId: 'sess-1',
  clientType: 'web' as const,
  locale: 'en',
  appVersion: '1.2.3',
};

describe('/api/analytics/config is read once per event that can change it', () => {
  const originalFetch = globalThis.fetch;
  let captureEnabled = false;
  let configReads = 0;

  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(window, 'localStorage', {
      value: createStorageStub(),
      configurable: true,
    });
    Object.defineProperty(window, 'sessionStorage', {
      value: createStorageStub(),
      configurable: true,
    });
    captureEnabled = false;
    configReads = 0;
    posthogState.initShouldThrow = false;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.endsWith('/api/analytics/config')) {
        configReads += 1;
        const body = captureEnabled
          ? {
              enabled: true,
              env: 'local_development',
              key: 'phc_test_key',
              host: 'https://us.i.posthog.com',
              installationId: 'install-123',
            }
          : { enabled: false, env: 'development', key: null, host: null };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shares one read between the exception bootstrap and the client init', async () => {
    const { bootstrapExceptionTracking, getAnalyticsClient } = await import(
      '../../src/analytics/client'
    );
    const bootstrap = bootstrapExceptionTracking(ctx);
    const init = getAnalyticsClient(ctx);
    await Promise.all([bootstrap, init]);

    expect(configReads).toBe(1);
  });

  it('does not re-read on every track() once consent has been decided', async () => {
    const { applyConsent, getAnalyticsClient } = await import('../../src/analytics/client');
    // Boot: nothing has told the module what the user chose yet, so a null
    // answer is still provisional and one retry is allowed. This is the
    // ordering the existing consent contract depends on — the provider's mount
    // effect calls getAnalyticsClient before App's effect calls setConsent.
    expect(await getAnalyticsClient(ctx)).toBeNull();
    await Promise.resolve();

    // App applies the persisted decision (Privacy → metrics off).
    applyConsent(false);
    expect(await getAnalyticsClient(ctx)).toBeNull();
    await Promise.resolve();

    // Boot read + the one provisional retry. That is the whole budget for a
    // session where the user has declined.
    const settled = configReads;
    expect(settled).toBe(2);

    // Every later track() funnels through getAnalyticsClient. None of them is
    // an event that could have changed the daemon's answer, so none of them
    // may cost a request — this is the part that used to grow without bound.
    for (let i = 0; i < 5; i += 1) {
      expect(await getAnalyticsClient(ctx)).toBeNull();
      await Promise.resolve();
    }

    expect(configReads).toBe(settled);
  });

  it('re-reads exactly once when the user opts in later in the same session', async () => {
    // Reverse control for the fix. This is the behaviour the null-clearing was
    // introduced for, and it must survive: a grant reopens the read, and one
    // grant costs exactly one request no matter how many track() calls follow.
    const { applyConsent, getAnalyticsClient } = await import('../../src/analytics/client');
    expect(await getAnalyticsClient(ctx)).toBeNull();
    await Promise.resolve();
    applyConsent(false);
    expect(await getAnalyticsClient(ctx)).toBeNull();
    await Promise.resolve();
    const beforeGrant = configReads;

    captureEnabled = true;
    applyConsent(true);
    expect(await getAnalyticsClient(ctx)).not.toBeNull();
    expect(configReads).toBe(beforeGrant + 1);

    // A live client answers every later caller with no further reads.
    expect(await getAnalyticsClient(ctx)).not.toBeNull();
    expect(await getAnalyticsClient(ctx)).not.toBeNull();
    expect(configReads).toBe(beforeGrant + 1);
  });

  it('reopens the read again after an off/on toggle', async () => {
    // Anti-vacuum: the grant must be re-armable, not a one-shot latch.
    const { applyConsent, getAnalyticsClient } = await import('../../src/analytics/client');
    expect(await getAnalyticsClient(ctx)).toBeNull();
    await Promise.resolve();
    applyConsent(false);
    const base = configReads;

    applyConsent(true);
    expect(await getAnalyticsClient(ctx)).toBeNull();
    await Promise.resolve();
    expect(configReads).toBe(base + 1);

    applyConsent(false);
    applyConsent(true);
    expect(await getAnalyticsClient(ctx)).toBeNull();
    await Promise.resolve();
    expect(configReads).toBe(base + 2);
  });
});
