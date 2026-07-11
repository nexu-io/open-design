// @vitest-environment jsdom
//
// The GitHub connect-repo status transport narrows the generic connector
// status endpoint to a boolean; the refresh-trigger bridge wires window
// focus / tab visibility listeners. Mock the global `fetch` for the former
// and dispatch real DOM events for the latter. See the `.node.test.ts`
// companion for the SSR-guard branch (no `window`).
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchGithubConnectorConnected,
  subscribeGithubConnectRefreshTriggers,
} from '../../../src/providers/project-view/github-connect';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('fetchGithubConnectorConnected transport', () => {
  it('resolves true when the github connector status is connected', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ statuses: { github: { status: 'connected' } } }),
    }) as unknown as Response) as unknown as typeof fetch;
    expect(await fetchGithubConnectorConnected()).toBe(true);
  });

  it('resolves false when the github connector is not connected', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ statuses: { github: { status: 'not_connected' } } }),
    }) as unknown as Response) as unknown as typeof fetch;
    expect(await fetchGithubConnectorConnected()).toBe(false);
  });

  it('resolves false (best-effort) on a non-ok response', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false }) as unknown as Response) as unknown as typeof fetch;
    expect(await fetchGithubConnectorConnected()).toBe(false);
  });

  it('resolves false (best-effort) when the fetch rejects', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await fetchGithubConnectorConnected()).toBe(false);
  });
});

describe('subscribeGithubConnectRefreshTriggers bridge', () => {
  it('fires onTrigger on window focus and tab visibility change, and unsubscribes cleanly', () => {
    const onTrigger = vi.fn();
    const unsubscribe = subscribeGithubConnectRefreshTriggers(onTrigger);

    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onTrigger).toHaveBeenCalledTimes(2);

    unsubscribe();
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onTrigger).toHaveBeenCalledTimes(2);
  });
});
