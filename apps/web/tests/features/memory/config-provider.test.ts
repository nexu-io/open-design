import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  patchMemoryConfig,
  patchMemoryExtractionConfig,
} from '../../../src/providers/memory/config';

// The transport home for `/api/memory/config`. These pin the request shape and
// the success/failure contract the slice (and MemoryModelInline) rely on.
const originalFetch = globalThis.fetch;

function stubFetch(response: Partial<Response> & { ok: boolean }): typeof fetch {
  const fn = vi.fn(async () => response as Response) as unknown as typeof fetch;
  globalThis.fetch = fn;
  return fn;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('patchMemoryConfig', () => {
  it('PATCHes /api/memory/config with the JSON patch body', async () => {
    const fetchMock = stubFetch({ ok: true });
    const ok = await patchMemoryConfig({ enabled: false });

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/memory/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
  });

  it('returns false when the daemon rejects the patch', async () => {
    stubFetch({ ok: false });
    expect(await patchMemoryConfig({ profileEnabled: true })).toBe(false);
  });
});

describe('patchMemoryExtractionConfig', () => {
  it('returns the daemon masked extraction echo on success', async () => {
    const masked = { provider: 'anthropic', apiKeyConfigured: true } as const;
    const fetchMock = stubFetch({
      ok: true,
      json: async () => ({ enabled: true, extraction: masked }),
    } as Partial<Response> & { ok: boolean });

    const result = await patchMemoryExtractionConfig(null);

    expect(result).toEqual(masked);
    expect(fetchMock).toHaveBeenCalledWith('/api/memory/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extraction: null }),
    });
  });

  it('returns undefined (keep prior state) when the request fails', async () => {
    stubFetch({ ok: false });
    expect(await patchMemoryExtractionConfig(null)).toBeUndefined();
  });

  it('throws when a successful response omits the extraction field', async () => {
    stubFetch({
      ok: true,
      json: async () => ({ enabled: true }),
    } as Partial<Response> & { ok: boolean });
    await expect(patchMemoryExtractionConfig({} as never)).rejects.toThrow(
      'Memory config PATCH succeeded without an extraction field',
    );
  });

  it('returns null when the daemon explicitly echoes a cleared extraction', async () => {
    stubFetch({
      ok: true,
      json: async () => ({ enabled: true, extraction: null }),
    } as Partial<Response> & { ok: boolean });
    expect(await patchMemoryExtractionConfig(null)).toBeNull();
  });
});
