// The project-raw-text transport is a thin best-effort `fetch` wrapper; mock the
// global `fetch` to pin the ok / non-ok / network-error branches.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchProjectRawText } from '../../../src/providers/project-view/raw-text';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('fetchProjectRawText transport', () => {
  it('returns the response text on a 2xx', async () => {
    const fn = vi.fn(async (_url: string) => ({ ok: true, text: async () => '<html>' }) as unknown as Response);
    globalThis.fetch = fn as unknown as typeof fetch;
    expect(await fetchProjectRawText('p1', 'index.html')).toBe('<html>');
    expect(fn).toHaveBeenCalledOnce();
    // The URL is derived from projectRawUrl(projectId, filePath).
    expect(String(fn.mock.calls[0]?.[0])).toContain('p1');
  });

  it('returns null on a non-ok response', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, text: async () => 'nope' }) as unknown as Response) as unknown as typeof fetch;
    expect(await fetchProjectRawText('p1', 'x.html')).toBeNull();
  });

  it('returns null when the fetch rejects', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await fetchProjectRawText('p1', 'x.html')).toBeNull();
  });
});
