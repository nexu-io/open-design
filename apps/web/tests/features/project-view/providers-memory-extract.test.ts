// The memory-extract transport is a best-effort fire-and-forget `fetch`; mock
// the global `fetch` to pin the request shape and the swallow-on-error contract.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { postMemoryExtract } from '../../../src/providers/project-view/memory-extract';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('postMemoryExtract transport', () => {
  it('POSTs the ExtractMemoryRequest as JSON to /api/memory/extract', async () => {
    const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true }) as unknown as Response);
    globalThis.fetch = fn as unknown as typeof fetch;

    await postMemoryExtract({
      userMessage: 'hi',
      projectId: 'p1',
      conversationId: 'c1',
      chatProvider: { provider: 'anthropic', apiKey: 'k', baseUrl: 'https://x', apiVersion: '' },
    });

    expect(fn).toHaveBeenCalledOnce();
    const call = fn.mock.calls[0]!;
    const init = call[1]!;
    expect(String(call[0])).toBe('/api/memory/extract');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      userMessage: 'hi',
      projectId: 'p1',
      conversationId: 'c1',
      chatProvider: { provider: 'anthropic', apiKey: 'k', baseUrl: 'https://x', apiVersion: '' },
    });
  });

  it('never rejects when the fetch throws (best-effort contract)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(postMemoryExtract({ userMessage: 'hi' })).resolves.toBeUndefined();
  });
});
