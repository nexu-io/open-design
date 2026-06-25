import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAmrModels, fetchAmrWalletSnapshot } from '../../src/providers/daemon';

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

describe('fetchAmrWalletSnapshot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns the AMR wallet snapshot from the daemon and supports refresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        status: 'available',
        profile: 'local',
        user: { id: 'user-1', email: 'amr@example.com' },
        balanceUsd: '0.1000',
        updatedAt: '2026-06-23T06:05:18.782Z',
        fetchedAt: '2026-06-23T06:05:19.000Z',
        stale: false,
        source: 'vela_api',
      }), { status: 200 })),
    );

    await expect(fetchAmrWalletSnapshot({ refresh: true })).resolves.toEqual({
      status: 'available',
      profile: 'local',
      user: { id: 'user-1', email: 'amr@example.com' },
      balanceUsd: '0.1000',
      updatedAt: '2026-06-23T06:05:18.782Z',
      fetchedAt: '2026-06-23T06:05:19.000Z',
      stale: false,
      source: 'vela_api',
    });
    expect(fetch).toHaveBeenCalledWith('/api/integrations/vela/wallet?refresh=1', {
      cache: 'no-store',
    });
  });

  it('returns null when the daemon cannot return a wallet snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );

    await expect(fetchAmrWalletSnapshot()).resolves.toBeNull();
  });
});
