// Transport adapters for the extraction-history routes are thin `fetch`
// wrappers; these mock the global `fetch` to pin the ok/non-ok branches and the
// `extractions ?? []` fallback.
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchExtractions,
  deleteExtraction,
  clearExtractionHistory,
} from '../../../src/providers/memory/extractions';

const originalFetch = globalThis.fetch;

function mockFetch(impl: (url: string, init?: RequestInit) => { ok: boolean; json?: () => Promise<unknown> }) {
  const fn = vi.fn(async (url: unknown, init?: RequestInit) => impl(String(url), init) as unknown as Response);
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('extractions transport', () => {
  it('returns the extraction list on a 2xx', async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ extractions: [{ id: 'r1' }] }) }));
    expect(await fetchExtractions()).toEqual([{ id: 'r1' }]);
  });

  it('falls back to [] when the response omits extractions', async () => {
    mockFetch(() => ({ ok: true, json: async () => ({}) }));
    expect(await fetchExtractions()).toEqual([]);
  });

  it('rejects rather than fabricating an empty list when the fetch fails', async () => {
    mockFetch(() => ({ ok: false }));
    await expect(fetchExtractions()).rejects.toThrow('Memory extractions request failed');
  });

  it('reports delete success from the response ok flag', async () => {
    mockFetch((url, init) => {
      expect(url).toBe('/api/memory/extractions/a%2Fb');
      expect(init?.method).toBe('DELETE');
      return { ok: true };
    });
    expect(await deleteExtraction('a/b')).toBe(true);
  });

  it('reports delete failure when the response is not ok', async () => {
    mockFetch(() => ({ ok: false }));
    expect(await deleteExtraction('r1')).toBe(false);
  });

  it('clears history via a DELETE and reports ok', async () => {
    const fn = mockFetch((url, init) => {
      expect(url).toBe('/api/memory/extractions');
      expect(init?.method).toBe('DELETE');
      return { ok: true };
    });
    expect(await clearExtractionHistory()).toBe(true);
    expect(fn).toHaveBeenCalledOnce();
  });
});
