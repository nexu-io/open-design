// @vitest-environment jsdom
//
// Regression test for "PostHog session replay is enabled but privacy-masked".
//
// Session replay was previously off (`disable_session_recording: true`)
// because Open Design's DOM is full of sensitive content — prompts, generated
// artifacts, and BYOK provider keys. Turning replay on without masking would
// violate the no-prompt-content rule.
//
// The contract this test pins: when the daemon reports analytics enabled,
// `posthog.init` must be called with replay ENABLED and the three redaction
// layers in place, so a raw screen recording can never leak prompt content:
//   1. maskTextSelector '*'      — every text node masked
//   2. maskAllInputs true        — every input/textarea value masked
//   3. blockSelector 'iframe'    — artifact/preview iframes fully blocked
//
// Goes red on the `disable_session_recording: true` version (replay off, no
// session_recording config) and green once replay ships masked.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface InitConfig {
  disable_session_recording?: boolean;
  session_recording?: {
    maskAllInputs?: boolean;
    maskTextSelector?: string | null;
    blockSelector?: string | null;
    recordCrossOriginIframes?: boolean;
  };
}

let lastInitConfig: InitConfig | null = null;
let lastRegisterPayload: Record<string, unknown> | null = null;
let lastPersonProperties: Record<string, unknown> | null = null;

vi.mock('posthog-js', () => {
  const stub = {
    init: (_key: string, config: InitConfig) => {
      lastInitConfig = config;
      // posthog-js's loaded() callback fires synchronously enough for the
      // test; invoke it so the register payload path runs too.
      const loaded = (config as unknown as { loaded?: (i: unknown) => void }).loaded;
      loaded?.(stub);
      return stub;
    },
    register: (payload: Record<string, unknown>) => {
      lastRegisterPayload = payload;
    },
    setPersonProperties: (payload: Record<string, unknown>) => {
      lastPersonProperties = payload;
    },
    opt_in_capturing: () => undefined,
    opt_out_capturing: () => undefined,
    reset: () => undefined,
    identify: () => undefined,
  };
  return { default: stub };
});

describe('PostHog session replay configuration', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    lastInitConfig = null;
    lastRegisterPayload = null;
    lastPersonProperties = null;
    vi.resetModules();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
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
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function initClient() {
    const { getAnalyticsClient } = await import('../src/analytics/client');
    await getAnalyticsClient({
      anonymousId: 'anon-1',
      sessionId: 'sess-1',
      clientType: 'web',
      locale: 'en',
      appVersion: '1.2.3',
    });
    return lastInitConfig;
  }

  it('enables session replay (replay off would leak prompt content)', async () => {
    const config = await initClient();
    expect(config).not.toBeNull();
    expect(config?.disable_session_recording).toBe(false);
    expect(config?.session_recording).toBeDefined();
  });

  it('masks every text node so prompts and artifact text never render', async () => {
    const config = await initClient();
    expect(config?.session_recording?.maskTextSelector).toBe('*');
  });

  it('masks every input value so BYOK provider keys are blanked', async () => {
    const config = await initClient();
    expect(config?.session_recording?.maskAllInputs).toBe(true);
  });

  it('blocks all iframes so generated artifact frames are never serialized', async () => {
    const config = await initClient();
    expect(config?.session_recording?.blockSelector).toBe('iframe');
    expect(config?.session_recording?.recordCrossOriginIframes).toBe(false);
  });

  it('registers the daemon-provided telemetry environment', async () => {
    await initClient();
    expect(lastRegisterPayload).toMatchObject({
      env: 'local_development',
    });
  });

  it('flushes person properties staged before PostHog init finishes', async () => {
    const { getAnalyticsClient, setAnalyticsPersonProperties } = await import('../src/analytics/client');
    setAnalyticsPersonProperties({
      od_app_user_id: 'usr_amr_42',
      od_source_resolved: 'social',
    });

    await getAnalyticsClient({
      anonymousId: 'anon-1',
      sessionId: 'sess-1',
      clientType: 'web',
      locale: 'en',
      appVersion: '1.2.3',
    });

    expect(lastPersonProperties).toEqual({
      od_app_user_id: 'usr_amr_42',
      od_source_resolved: 'social',
    });
  });
});
