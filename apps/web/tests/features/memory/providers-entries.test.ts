// Transport adapters for the memory-entry, tree, and index routes. These mock
// the global `fetch` to pin the ok/non-ok branches, the create-vs-update URL/verb
// split, and the `?? []` / `?? null` payload fallbacks.
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchMemoryList,
  fetchMemoryTree,
  fetchMemoryEntry,
  saveMemoryEntry,
  deleteMemoryEntry,
  saveMemoryIndex,
} from '../../../src/providers/memory/entries';

const originalFetch = globalThis.fetch;

function mockFetch(impl: (url: string, init?: RequestInit) => { ok: boolean; status?: number; json?: () => Promise<unknown> }) {
  const fn = vi.fn(async (url: unknown, init?: RequestInit) => impl(String(url), init) as unknown as Response);
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('entries transport', () => {
  it('returns the parsed list on a 2xx', async () => {
    const payload = { enabled: false, entries: [{ id: 'e1' }] };
    mockFetch(() => ({ ok: true, json: async () => payload }));
    expect((await fetchMemoryList()).enabled).toBe(false);
  });

  it('rejects rather than fabricating a list when the list fetch fails', async () => {
    mockFetch(() => ({ ok: false }));
    await expect(fetchMemoryList()).rejects.toThrow('Memory list request failed');
  });

  it('returns the tree, [] when absent, and rejects on failure', async () => {
    mockFetch(() => ({ ok: true, json: async () => ({ tree: [{ id: 't' }] }) }));
    expect(await fetchMemoryTree()).toEqual([{ id: 't' }]);
    mockFetch(() => ({ ok: true, json: async () => ({}) }));
    expect(await fetchMemoryTree()).toEqual([]);
    mockFetch(() => ({ ok: false }));
    await expect(fetchMemoryTree()).rejects.toThrow('Memory tree request failed');
  });

  it('returns the entry, and null only when it genuinely does not exist', async () => {
    mockFetch((url) => {
      expect(url).toBe('/api/memory/user_role');
      return { ok: true, json: async () => ({ entry: { id: 'user_role' } }) };
    });
    expect(await fetchMemoryEntry('user_role')).toEqual({ id: 'user_role' });
    mockFetch(() => ({ ok: true, json: async () => ({}) }));
    expect(await fetchMemoryEntry('x')).toBeNull();
    mockFetch(() => ({ ok: false, status: 404 }));
    expect(await fetchMemoryEntry('x')).toBeNull();
  });

  it('rejects rather than mapping a 5xx entry read to null', async () => {
    mockFetch(() => ({ ok: false, status: 500 }));
    await expect(fetchMemoryEntry('x')).rejects.toThrow('Memory entry request failed (500)');
    mockFetch(() => ({ ok: false, status: 503 }));
    await expect(fetchMemoryEntry('x')).rejects.toThrow('Memory entry request failed (503)');
  });

  it('POSTs to /api/memory when the draft has no id', async () => {
    const fn = mockFetch((url, init) => {
      expect(url).toBe('/api/memory');
      expect(init?.method).toBe('POST');
      return { ok: true, json: async () => ({ entry: { id: 'new' } }) };
    });
    const saved = await saveMemoryEntry({ name: 'n', description: 'd', type: 'user', body: 'b' });
    expect(saved).toEqual({ id: 'new' });
    expect(fn).toHaveBeenCalledOnce();
  });

  it('PUTs to the id URL when the draft has an id, and returns null on failure', async () => {
    mockFetch((url, init) => {
      expect(url).toBe('/api/memory/e1');
      expect(init?.method).toBe('PUT');
      return { ok: false };
    });
    expect(
      await saveMemoryEntry({ id: 'e1', name: 'n', description: 'd', type: 'user', body: 'b' }),
    ).toBeNull();
  });

  it('returns null when the save succeeds but the response omits the entry', async () => {
    mockFetch(() => ({ ok: true, json: async () => ({}) }));
    expect(
      await saveMemoryEntry({ name: 'n', description: 'd', type: 'user', body: 'b' }),
    ).toBeNull();
  });

  it('reports delete + index-save success from the ok flag', async () => {
    mockFetch((url, init) => {
      expect(init?.method).toBe('DELETE');
      expect(url).toBe('/api/memory/e1');
      return { ok: true };
    });
    expect(await deleteMemoryEntry('e1')).toBe(true);

    mockFetch((url, init) => {
      expect(url).toBe('/api/memory/index');
      expect(init?.method).toBe('PUT');
      return { ok: false };
    });
    expect(await saveMemoryIndex('# index')).toBe(false);
  });
});
