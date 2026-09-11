// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The two boot-time halves of the chat correlation block.
 *
 * `replay_session_id` and `release_channel` are the fields that turn a
 * `client_chat_*` row from a number into something a triager can act on — one
 * opens the session replay, the other separates "the packaged stable build is
 * janky" from "a dev daemon is janky". Both had a producer sitting one line
 * away from a value that was already in hand, and neither was ever called.
 *
 * `registerChatReplaySessionSource` in particular is a trap with no failure
 * mode: we load posthog-js through `await import('posthog-js')`, whose ESM
 * build never publishes itself as `window.posthog`, so the global-lookup
 * fallback silently returns undefined forever and every replay link on the
 * dashboard is dead while the code reads as implemented.
 */

let lastRegisterPayload: Record<string, unknown> | null = null;

vi.mock('posthog-js', () => {
  const stub = {
    init: (_key: string, config: Record<string, unknown>) => {
      const loaded = config.loaded as ((i: unknown) => void) | undefined;
      loaded?.(stub);
      return stub;
    },
    register: (payload: Record<string, unknown>) => {
      lastRegisterPayload = payload;
    },
    setPersonProperties: () => undefined,
    opt_in_capturing: () => undefined,
    opt_out_capturing: () => undefined,
    reset: () => undefined,
    identify: () => undefined,
    get_session_id: () => 'replay-sess-1',
  };
  return { default: stub };
});

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  lastRegisterPayload = null;
  vi.resetModules();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/api/analytics/config')) {
      return new Response(
        JSON.stringify({
          enabled: true,
          env: 'local_development',
          key: 'phc_test_key',
          host: 'https://us.i.posthog.com',
          installationId: 'install-123',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.endsWith('/api/version')) {
      return new Response(
        JSON.stringify({
          version: {
            version: '1.2.3',
            channel: 'prerelease',
            packaged: true,
            platform: 'darwin',
            arch: 'arm64',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('chat correlation — boot-time identity', () => {
  it('takes the replay session id from the posthog instance, not from a global', async () => {
    const { getAnalyticsClient } = await import('../../src/analytics/client');
    const { chatCorrelation } = await import('../../src/observability/chat-context');

    // No `window.posthog` on purpose: that is exactly the shape production
    // runs in, and the shape the global-lookup fallback cannot serve.
    expect((globalThis as { posthog?: unknown }).posthog).toBeUndefined();

    await getAnalyticsClient({
      anonymousId: 'anon-1',
      sessionId: 'sess-1',
      clientType: 'web',
      locale: 'en',
      appVersion: '1.2.3',
    });

    expect(lastRegisterPayload).not.toBeNull();
    expect(chatCorrelation().replay_session_id).toBe('replay-sess-1');
  });

  it('keeps the release channel the daemon already answers with', async () => {
    const { resolveAppVersionForCapture } = await import('../../src/analytics/provider');
    const { chatCorrelation } = await import('../../src/observability/chat-context');

    await resolveAppVersionForCapture('0.0.0');

    expect(chatCorrelation().release_channel).toBe('prerelease');
  });
});
