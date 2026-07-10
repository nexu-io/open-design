// Transport adapters for `/api/mcp/servers`. Mocks the global `fetch` to pin the
// ok/non-ok/throw branches and the `Array.isArray(...) ? ... : []` fallbacks.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMcpServers, saveMcpServers } from '../../../src/providers/mcp/servers';

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

describe('fetchMcpServers', () => {
  it('parses servers + templates on a 2xx', async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ servers: [{ id: 'a' }], templates: [{ id: 't' }] }) }));
    const data = await fetchMcpServers();
    expect(data).toEqual({ servers: [{ id: 'a' }], templates: [{ id: 't' }] });
  });
  it('coerces non-array fields to empty arrays', async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ servers: null, templates: undefined }) }));
    expect(await fetchMcpServers()).toEqual({ servers: [], templates: [] });
  });
  it('returns null on a non-2xx', async () => {
    mockFetch(() => ({ ok: false }));
    expect(await fetchMcpServers()).toBeNull();
  });
  it('returns null when fetch throws', async () => {
    mockFetch(() => {
      throw new Error('boom');
    });
    expect(await fetchMcpServers()).toBeNull();
  });
});

describe('saveMcpServers', () => {
  it('PUTs the payload and parses the rehydrated list', async () => {
    const fn = mockFetch(() => ({ ok: true, json: async () => ({ servers: [{ id: 'a' }], templates: [] }) }));
    const data = await saveMcpServers([{ id: 'a', transport: 'stdio', enabled: true }]);
    expect(data).toEqual({ servers: [{ id: 'a' }], templates: [] });
    const [, init] = fn.mock.calls[0]!;
    expect(init).toMatchObject({ method: 'PUT' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      servers: [{ id: 'a', transport: 'stdio', enabled: true }],
    });
  });
  it('returns null on a non-2xx and on a throw', async () => {
    mockFetch(() => ({ ok: false }));
    expect(await saveMcpServers([])).toBeNull();
    mockFetch(() => {
      throw new Error('net');
    });
    expect(await saveMcpServers([])).toBeNull();
  });
});
