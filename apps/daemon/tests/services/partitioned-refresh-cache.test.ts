import { describe, expect, it, vi } from 'vitest';

import { createPartitionedRefreshCache } from '../../src/services/partitioned-refresh-cache.js';

describe('partitioned refresh cache', () => {
  it('partitions values and in-flight reads by key', async () => {
    const fetchValue = vi.fn(async (key: string) => `${key}-value`);
    const cache = createPartitionedRefreshCache({
      fetch: fetchValue,
      ttlMs: () => 1_000,
    });

    await expect(Promise.all([
      cache.read('account-a'),
      cache.read('account-a'),
      cache.read('account-b'),
    ])).resolves.toEqual(['account-a-value', 'account-a-value', 'account-b-value']);
    expect(fetchValue).toHaveBeenCalledTimes(2);
  });

  it('does not let pre-invalidation work seed the next generation', async () => {
    let release!: (value: string) => void;
    const held = new Promise<string>((resolve) => {
      release = resolve;
    });
    const fetchValue = vi
      .fn<(key: string) => Promise<string>>()
      .mockReturnValueOnce(held)
      .mockResolvedValueOnce('current');
    const cache = createPartitionedRefreshCache({
      fetch: fetchValue,
      ttlMs: () => 1_000,
    });

    const beforeEvent = cache.read('account-a', {
      revalidateOnInvalidation: true,
    });
    cache.invalidate('account-a', 'revision:2');
    cache.invalidate('account-a', 'revision:2');
    const afterEvent = cache.read('account-a', {
      revalidateOnInvalidation: true,
    });
    release('stale');

    await expect(Promise.all([beforeEvent, afterEvent])).resolves.toEqual([
      'current',
      'current',
    ]);
    expect(fetchValue).toHaveBeenCalledTimes(2);
    await expect(cache.read('account-a')).resolves.toBe('current');
  });

  it('does not let an in-flight completion repopulate a cleared cache', async () => {
    let release!: (value: string) => void;
    const held = new Promise<string>((resolve) => {
      release = resolve;
    });
    const fetchValue = vi
      .fn<(key: string) => Promise<string>>()
      .mockReturnValueOnce(held)
      .mockResolvedValueOnce('after-clear');
    const cache = createPartitionedRefreshCache({
      fetch: fetchValue,
      ttlMs: () => 1_000,
    });

    const beforeClear = cache.read('account-a');
    cache.clear();
    release('before-clear');
    await expect(beforeClear).resolves.toBe('before-clear');
    await expect(cache.read('account-a')).resolves.toBe('after-clear');
    expect(fetchValue).toHaveBeenCalledTimes(2);
  });
});
