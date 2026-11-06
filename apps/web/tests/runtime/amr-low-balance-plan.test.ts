// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AmrWalletSnapshot } from '@open-design/contracts';
import { resolveAmrPlan } from '../../src/runtime/amr-low-balance-plan';
import { fetchVelaLoginStatus } from '../../src/providers/daemon';

vi.mock('../../src/providers/daemon', () => ({
  fetchVelaLoginStatus: vi.fn(),
}));

const mockedFetchStatus = vi.mocked(fetchVelaLoginStatus);

function snapshot(plan?: string): AmrWalletSnapshot {
  return {
    status: 'available',
    profile: 'prod',
    user: { id: 'u1', ...(plan ? { plan } : {}) },
    balanceUsd: '1.20',
    updatedAt: null,
    fetchedAt: '2026-07-13T00:00:00.000Z',
    stale: false,
    source: 'vela_api',
  };
}

afterEach(() => {
  mockedFetchStatus.mockReset();
});

/*
 * `isFreeAmrPlan` used to be pinned here. It is gone (T55, 2026-09-06): the
 * balance gate's stand-down no longer asks "is this tier free", it asks whether
 * the tier could be read at all, and that question is `amrPlanTierUnreadable`
 * in `amr-balance-gate.ts`. The behavior those cases defended — an unreadable
 * tier is never hard-blocked by a failed read — is pinned in
 * `amr-balance-gate-personal-tiers.test.ts` instead.
 */

describe('resolveAmrPlan', () => {
  it('prefers the live billing account over a stale snapshot plan', async () => {
    mockedFetchStatus.mockResolvedValue({
      loggedIn: true,
      profile: 'prod',
      user: { id: 'u1', email: 'user@example.com', plan: 'free' },
      account: { plan: 'pro' },
      configPath: '/tmp/vela.json',
    });

    await expect(resolveAmrPlan(snapshot('free'))).resolves.toBe('pro');
  });

  it('falls back to the wallet snapshot when live billing is unavailable', async () => {
    mockedFetchStatus.mockRejectedValue(new Error('status unavailable'));

    await expect(resolveAmrPlan(snapshot('plus'))).resolves.toBe('plus');
  });
});
