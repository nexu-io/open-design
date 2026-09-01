import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceBillingSummary } from '@open-design/contracts';

import { createAccountBillingSummaryCache } from '../../src/collab/account-billing-summary-cache.js';

function summary(balanceUsd: string): WorkspaceBillingSummary {
  return {
    workspaceId: null,
    membershipTier: 'free',
    totalAvailableCredits: Number(balanceUsd),
    subscriptionCredits: 0,
    rechargeCredits: Number(balanceUsd),
    balanceUsd,
    subscriptionStatus: 'inactive',
    availableActions: [],
    workspaceBalance: null,
  };
}

describe('account billing summary cache', () => {
  it('single-flights concurrent reads and reuses the settled value within the ttl', async () => {
    let now = 0;
    let release!: (value: WorkspaceBillingSummary | null) => void;
    const blocked = new Promise<WorkspaceBillingSummary | null>((resolve) => {
      release = resolve;
    });
    const fetchSummary = vi.fn(() => blocked);
    const cache = createAccountBillingSummaryCache({
      identity: () => 'account-a',
      fetch: fetchSummary,
      ttlMs: 60_000,
      now: () => now,
    });

    const first = cache.read();
    const second = cache.read();
    expect(fetchSummary).toHaveBeenCalledTimes(1);
    release(summary('1.25'));
    await expect(Promise.all([first, second])).resolves.toEqual([
      summary('1.25'),
      summary('1.25'),
    ]);

    now = 59_999;
    await expect(cache.read()).resolves.toEqual(summary('1.25'));
    expect(fetchSummary).toHaveBeenCalledTimes(1);
  });

  it('partitions values by credential identity', async () => {
    let identity = 'account-a';
    const fetchSummary = vi
      .fn<() => Promise<WorkspaceBillingSummary | null>>()
      .mockResolvedValueOnce(summary('1.25'))
      .mockResolvedValueOnce(summary('9.50'));
    const cache = createAccountBillingSummaryCache({
      identity: () => identity,
      fetch: fetchSummary,
    });

    await expect(cache.read()).resolves.toEqual(summary('1.25'));
    identity = 'account-b';
    await expect(cache.read()).resolves.toEqual(summary('9.50'));
    identity = 'account-a';
    await expect(cache.read()).resolves.toEqual(summary('1.25'));
    expect(fetchSummary).toHaveBeenCalledTimes(2);
  });

  it('joins an invalidated in-flight fetch and performs one trailing refresh', async () => {
    let releaseFirst!: (value: WorkspaceBillingSummary | null) => void;
    const firstBlocked = new Promise<WorkspaceBillingSummary | null>((resolve) => {
      releaseFirst = resolve;
    });
    const fetchSummary = vi
      .fn<() => Promise<WorkspaceBillingSummary | null>>()
      .mockReturnValueOnce(firstBlocked)
      .mockResolvedValueOnce(summary('2.50'));
    const cache = createAccountBillingSummaryCache({
      identity: () => 'account-a',
      fetch: fetchSummary,
    });

    const beforeEvent = cache.read();
    cache.invalidate('revision:2');
    cache.invalidate('revision:2');
    const afterEvent = cache.read();
    expect(fetchSummary).toHaveBeenCalledTimes(1);

    releaseFirst(summary('1.25'));
    await expect(Promise.all([beforeEvent, afterEvent])).resolves.toEqual([
      summary('2.50'),
      summary('2.50'),
    ]);
    expect(fetchSummary).toHaveBeenCalledTimes(2);
    await expect(cache.read()).resolves.toEqual(summary('2.50'));
  });
});
