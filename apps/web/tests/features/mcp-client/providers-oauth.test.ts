// Transport adapters for `/api/mcp/oauth/*`. Mocks the global `fetch` to pin the
// structured start-result branches (network error, 404, other non-ok with /
// without a detail body, 200 parse, 200 unparseable) plus status/disconnect.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  disconnectMcpOAuth,
  fetchMcpOAuthStatus,
  startMcpOAuth,
} from '../../../src/providers/mcp/oauth';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(impl: (url: string, init?: RequestInit) => unknown) {
  const fn = vi.fn(async (url: unknown, init?: RequestInit) => impl(String(url), init) as Response);
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('startMcpOAuth', () => {
  it('returns the authorize response on a 2xx', async () => {
    mockFetch(() => ({ ok: true, status: 200, json: async () => ({ authorizeUrl: 'https://a', state: 's', redirectUri: 'r' }) }));
    const result = await startMcpOAuth('srv');
    expect(result).toEqual({ ok: true, response: { authorizeUrl: 'https://a', state: 's', redirectUri: 'r' } });
  });
  it('maps a thrown fetch to a network-error result', async () => {
    mockFetch(() => {
      throw new Error('offline');
    });
    const result = await startMcpOAuth('srv');
    expect(result).toEqual({ ok: false, status: null, message: 'Network error: offline' });
  });
  it('special-cases a 404 with a restart hint', async () => {
    mockFetch(() => ({ ok: false, status: 404, statusText: 'Not Found', text: async () => '' }));
    const result = await startMcpOAuth('srv');
    expect(result).toMatchObject({ ok: false, status: 404 });
    expect((result as { message: string }).message).toMatch(/older build/);
  });
  it('surfaces a typed error body on other non-ok statuses', async () => {
    mockFetch(() => ({ ok: false, status: 500, statusText: 'err', text: async () => JSON.stringify({ error: 'discovery failed' }) }));
    const result = await startMcpOAuth('srv');
    expect(result).toEqual({ ok: false, status: 500, message: 'discovery failed' });
  });
  it('falls back to a status message when the body has no typed error', async () => {
    mockFetch(() => ({ ok: false, status: 503, statusText: 'Unavailable', text: async () => 'plain text' }));
    const result = await startMcpOAuth('srv');
    expect((result as { message: string }).message).toBe('plain text');
  });
  it('reports an unparseable 200 body', async () => {
    mockFetch(() => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json');
      },
    }));
    const result = await startMcpOAuth('srv');
    expect(result).toEqual({ ok: false, status: 200, message: 'Daemon returned a 200 with an unparseable body.' });
  });
});

describe('fetchMcpOAuthStatus', () => {
  it('parses status on a 2xx and encodes the serverId', async () => {
    const fn = mockFetch(() => ({ ok: true, json: async () => ({ connected: true }) }));
    expect(await fetchMcpOAuthStatus('a b')).toEqual({ connected: true });
    expect(String(fn.mock.calls[0]![0])).toContain('serverId=a%20b');
  });
  it('returns null on a non-2xx and on a throw', async () => {
    mockFetch(() => ({ ok: false }));
    expect(await fetchMcpOAuthStatus('s')).toBeNull();
    mockFetch(() => {
      throw new Error('x');
    });
    expect(await fetchMcpOAuthStatus('s')).toBeNull();
  });
});

describe('disconnectMcpOAuth', () => {
  it('returns res.ok and false on a throw', async () => {
    mockFetch(() => ({ ok: true }));
    expect(await disconnectMcpOAuth('s')).toBe(true);
    mockFetch(() => ({ ok: false }));
    expect(await disconnectMcpOAuth('s')).toBe(false);
    mockFetch(() => {
      throw new Error('x');
    });
    expect(await disconnectMcpOAuth('s')).toBe(false);
  });
});
