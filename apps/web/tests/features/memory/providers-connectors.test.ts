// Transport adapters for connector discovery and the suggest-memories call.
// These mock the global `fetch` to pin the ok/non-ok branches, the
// `connectors ?? []` fallback, and the optional chatAgentId/chatModel body keys.
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchMemoryConnectors,
  suggestConnectorMemories,
} from '../../../src/providers/memory/connectors';

const originalFetch = globalThis.fetch;

function mockFetch(impl: (url: string, init?: RequestInit) => {
  ok: boolean;
  status?: number;
  json?: () => Promise<unknown>;
}) {
  const fn = vi.fn(async (url: unknown, init?: RequestInit) => impl(String(url), init) as unknown as Response);
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('connectors transport', () => {
  it('returns discovered connectors, a present empty catalogue, and rejects on failure', async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ connectors: [{ id: 'notion' }] }) }));
    expect(await fetchMemoryConnectors()).toEqual([{ id: 'notion' }]);
    mockFetch(() => ({ ok: true, json: async () => ({ connectors: [] }) }));
    expect(await fetchMemoryConnectors()).toEqual([]);
    mockFetch(() => ({ ok: false, status: 503 }));
    await expect(fetchMemoryConnectors()).rejects.toThrow('Connector discovery request failed');
  });

  it('rejects rather than mapping a malformed 2xx discovery response (missing connectors) to []', async () => {
    mockFetch(() => ({ ok: true, json: async () => ({}) }));
    await expect(fetchMemoryConnectors()).rejects.toThrow(
      "Connector discovery request succeeded without a 'connectors' field",
    );
  });

  it('omits chatAgentId/chatModel from the body when not provided', async () => {
    const fn = mockFetch((url, init) => {
      expect(url).toBe('/api/memory/connectors/suggest');
      const body = JSON.parse((init?.body as string) ?? '{}');
      expect(body).toEqual({ connectorIds: ['notion'] });
      return { ok: true, json: async () => ({ suggestions: [] }) };
    });
    const res = await suggestConnectorMemories(['notion']);
    expect(res).toEqual({ suggestions: [] });
    expect(fn).toHaveBeenCalledOnce();
  });

  it('includes chatAgentId/chatModel when provided', async () => {
    mockFetch((_url, init) => {
      const body = JSON.parse((init?.body as string) ?? '{}');
      expect(body.chatAgentId).toBe('claude');
      expect(body.chatModel).toBe('opus');
      return { ok: true, json: async () => ({ suggestions: [] }) };
    });
    await suggestConnectorMemories(['notion'], { chatAgentId: 'claude', chatModel: 'opus' });
  });

  it('returns null when the suggest call fails', async () => {
    mockFetch(() => ({ ok: false }));
    expect(await suggestConnectorMemories(['notion'])).toBeNull();
  });
});
