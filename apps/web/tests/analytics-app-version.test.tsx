// @vitest-environment jsdom
//
// Regression test for "every PostHog event ships with app_version='0.0.0'".
//
// `useAppVersion()` reads /api/version at runtime so the same web bundle
// reports the daemon-pinned version even when running against a newer or
// older daemon during dev. The previous implementation stored the fetched
// version in a `useRef`, which silently broke the contract: ref writes do
// NOT trigger a re-render, so the hook kept returning '0.0.0' forever and
// every downstream useEffect that depended on `appVersion`
// (`client.register({ app_version })` in particular) never re-ran with
// the real version. PostHog dashboards then showed `app_version=0.0.0`
// on every event.
//
// This test goes red on the `useRef` version and green on the `useState`
// version: after the mocked /api/version resolves, the hook must return
// the fetched value, not the boot placeholder.

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppVersion } from '../src/analytics/provider';

describe('useAppVersion', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/api/version')) {
        return new Response(
          JSON.stringify({
            version: {
              version: '1.2.3',
              channel: 'development',
              packaged: false,
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
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('boots to the 0.0.0 placeholder before the fetch resolves', () => {
    const { result } = renderHook(() => useAppVersion());
    expect(result.current).toBe('0.0.0');
  });

  it('updates to the fetched version once /api/version resolves', async () => {
    const { result } = renderHook(() => useAppVersion());
    await waitFor(() => {
      expect(result.current).toBe('1.2.3');
    });
  });

  it('keeps the 0.0.0 placeholder when the fetch fails', async () => {
    globalThis.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const { result } = renderHook(() => useAppVersion());
    // Let any pending microtasks settle so a buggy implementation has the
    // same opportunity to "succeed" with stale data as the happy path.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current).toBe('0.0.0');
  });
});
