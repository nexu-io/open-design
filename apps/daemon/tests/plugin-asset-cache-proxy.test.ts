// Proxy coverage for `safeExternalFetch`
// (apps/daemon/src/plugins/plugin-asset-cache.ts).
//
// `safeExternalFetch` is the daemon's single SSRF-guarded exit for
// user-supplied URLs, and the guard it installs — a validating DNS lookup
// pinned to the socket — only makes sense for a *direct* connection. On a host
// that reaches the internet through a proxy (the situation the plugin installer
// hit when raw.githubusercontent.com was unreachable) the daemon must hand the
// request to that proxy instead, or every external fetch fails while the user's
// browser and `git` work fine.
//
// The observable is the `dispatcher` handed to `fetch`, not a round-trip
// through a stand-in proxy server: a proxied request is an absolute-form
// request naming an external host, which the test host's network policy is free
// to block, while which dispatcher gets attached is exactly the decision under
// test — and it is fully determined without opening a socket.

import { describe, expect, it, vi } from 'vitest';

import { externalFetchDispatcher, safeExternalFetch } from '../src/plugins/plugin-asset-cache.js';

const { resolveSystemProxyEnvMock } = vi.hoisted(() => ({
  // Never inherit the developer's system proxy, so "no proxy configured" below
  // means no proxy anywhere — on every platform.
  resolveSystemProxyEnvMock: vi.fn(() => ({})),
}));

vi.mock('@open-design/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@open-design/platform')>()),
  resolveSystemProxyEnv: resolveSystemProxyEnvMock,
}));

/** A proxy-shaped environment with nothing set, so each test opts in to exactly
 *  the proxy variables it means to exercise. */
function proxyEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    HTTP_PROXY: '',
    http_proxy: '',
    HTTPS_PROXY: '',
    https_proxy: '',
    ALL_PROXY: '',
    all_proxy: '',
    NO_PROXY: '',
    no_proxy: '',
    ...overrides,
  };
}

function withProxy(): NodeJS.ProcessEnv {
  return proxyEnv({ HTTP_PROXY: 'http://127.0.0.1:9', http_proxy: 'http://127.0.0.1:9' });
}

/** A `fetch` that records what it was asked to do and answers locally. */
function recordingFetch() {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    seen.push({ url: String(input), init: init ?? {} });
    return new Response('body', { status: 200 });
  };
  return { seen, fetchImpl };
}

function dispatcherOf(entry: { init: RequestInit } | undefined): unknown {
  const dispatcher = (entry?.init as { dispatcher?: unknown } | undefined)?.dispatcher;
  expect(dispatcher).toBeTruthy();
  return dispatcher;
}

function dispatcherName(dispatcher: unknown): string {
  return (dispatcher as { constructor?: { name?: string } })?.constructor?.name ?? '';
}

const TARGET = 'http://external.invalid/a.png';

describe('safeExternalFetch with a configured proxy', () => {
  it('hands the request to the proxy dispatcher, keeping url and redirect policy', async () => {
    const { seen, fetchImpl } = recordingFetch();

    const response = await safeExternalFetch(TARGET, {}, fetchImpl, withProxy());

    expect(response.status).toBe(200);
    const [first] = seen;
    expect(first?.url).toBe(TARGET);
    expect(first?.init.redirect).toBe('follow');
    expect(dispatcherName(dispatcherOf(first))).toBe('EnvHttpProxyAgent');
  });

  it('keeps the direct guarded dispatcher when no proxy is configured', async () => {
    const direct = recordingFetch();
    await safeExternalFetch(TARGET, {}, direct.fetchImpl, proxyEnv());

    const proxied = recordingFetch();
    await safeExternalFetch(TARGET, {}, proxied.fetchImpl, withProxy());

    const directDispatcher = dispatcherOf(direct.seen[0]);
    const proxiedDispatcher = dispatcherOf(proxied.seen[0]);
    expect(dispatcherName(directDispatcher)).toBe('Agent');
    // Replaced, not layered: the connection-time SSRF lookup rejects the
    // proxy's own loopback hop, so both dispatchers can never be in play.
    expect(proxiedDispatcher).not.toBe(directDispatcher);
  });

  it('still refuses a literal private target while a proxy is configured', async () => {
    const { seen, fetchImpl } = recordingFetch();

    await expect(
      safeExternalFetch('http://127.0.0.1/a.png', {}, fetchImpl, withProxy()),
    ).rejects.toThrow('url points at a private address');
    expect(seen).toEqual([]);
  });
});

describe('externalFetchDispatcher', () => {
  it('reports no proxy for a proxy-free environment', () => {
    expect(externalFetchDispatcher(proxyEnv())).toBeNull();
  });

  it('builds a fresh dispatcher per call, so a changed configuration cannot go stale', async () => {
    const first = externalFetchDispatcher(withProxy());
    const second = externalFetchDispatcher(withProxy());

    expect(first).not.toBeNull();
    expect(second).not.toBe(first);
    await Promise.all([first?.close(), second?.close()]);
  });
});
