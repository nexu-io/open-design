import { afterEach, describe, expect, it, vi } from 'vitest';

import { AmrModelLoadingCache } from '../../src/runtimes/amr-model-cache.js';

const preset = [{ id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' }];

describe('AmrModelLoadingCache.getAuthoritative', () => {
  afterEach(() => { vi.useRealTimers(); });

  // One run asks twice (the resume probe and the run itself). A remote catalog
  // that never answers must cost that run at most one wait, not one per call.
  it('bounds the wait per remote refresh, not per call', async () => {
    vi.useFakeTimers();
    const cache = new AmrModelLoadingCache();
    const fetchers = {
      fetchPreset: async () => preset,
      fetchRemote: () => new Promise<never>(() => {}),
    };
    const startedAt = Date.now();
    const first = cache.getAuthoritative('k', fetchers, 1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(first).resolves.toMatchObject({ source: 'preset' });
    const second = cache.getAuthoritative('k', fetchers, 1_000);
    let settled = false;
    void second.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    expect(Date.now() - startedAt).toBe(1_000);
  });

  // When the caller's catalog just failed, waiting again only delays the run.
  it('does not wait after the last remote refresh failed', async () => {
    vi.useFakeTimers();
    const cache = new AmrModelLoadingCache();
    let calls = 0;
    const fetchers = {
      fetchPreset: async () => preset,
      fetchRemote: () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('list Link models: 401')) : new Promise<never>(() => {});
      },
    };
    await expect(cache.getAuthoritative('k', fetchers, 1_000)).resolves.toMatchObject({ source: 'preset' });
    const again = cache.getAuthoritative('k', fetchers, 1_000);
    let settled = false;
    void again.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    await expect(again).resolves.toMatchObject({ source: 'preset', remoteError: expect.stringContaining('401') });
  });

  it('still returns the caller catalog when it arrives within the wait', async () => {
    vi.useFakeTimers();
    const cache = new AmrModelLoadingCache();
    const remote = [{ id: 'kimi-k2', label: 'Kimi K2' }];
    const fetchers = {
      fetchPreset: async () => preset,
      fetchRemote: () => new Promise<typeof remote>((resolve) => setTimeout(() => resolve(remote), 300)),
    };
    const pending = cache.getAuthoritative('k', fetchers, 1_000);
    await vi.advanceTimersByTimeAsync(300);
    await expect(pending).resolves.toMatchObject({ source: 'remote', models: remote });
  });
});
