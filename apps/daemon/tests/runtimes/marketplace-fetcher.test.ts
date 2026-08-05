import { describe, expect, it, vi } from 'vitest';
import { createMarketplaceFetcher } from '../../src/runtimes/marketplace-fetcher.js';

describe('marketplace fetcher', () => {
  it('serves a matching bundled registry seed without network access', async () => {
    const fetchImpl = vi.fn();
    const readSeedManifest = vi.fn(async (id: string) => `seed:${id}`);
    const fetcher = createMarketplaceFetcher('official', {
      registryIdFromUrl: () => 'official',
      readSeedManifest,
      fetchImpl,
    });

    const response = await fetcher('https://open-design.test/official.json');

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('seed:official');
    expect(readSeedManifest).toHaveBeenCalledWith('official');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falls back to the network when the seed is unavailable or does not match', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => 'unavailable',
    }));
    const readSeedManifest = vi.fn(async () => null);
    const fetcher = createMarketplaceFetcher('official', {
      registryIdFromUrl: (url) => url.includes('official') ? 'official' : 'community',
      readSeedManifest,
      fetchImpl,
    });

    const unavailable = await fetcher('https://example.test/official.json');
    const other = await fetcher('https://example.test/community.json');

    expect(unavailable.ok).toBe(false);
    expect(other.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledWith('https://example.test/official.json', { redirect: 'follow' });
    expect(readSeedManifest).toHaveBeenCalledTimes(1);
  });
});
