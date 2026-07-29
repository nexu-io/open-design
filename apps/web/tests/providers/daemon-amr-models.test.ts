import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAmrModels } from '../../src/providers/daemon';

describe('fetchAmrModels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns AMR model cache payloads from the daemon', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        source: 'preset',
        models: [{ id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' }],
        refreshing: true,
      }), { status: 200 })),
    );

    await expect(fetchAmrModels()).resolves.toEqual({
      source: 'preset',
      models: [{ id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' }],
      refreshing: true,
    });
    expect(fetch).toHaveBeenCalledWith('/api/amr/models', { cache: 'no-store' });
  });

  it('returns null when the daemon does not return AMR models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );

    await expect(fetchAmrModels()).resolves.toBeNull();
  });
});
