// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AmrWalletSnapshot } from '@open-design/contracts';
import {
  isFreeAmrPlan,
  isPaidAmrPlan,
  resolveAmrPlan,
} from '../../src/runtime/amr-low-balance-plan';
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

describe('AMR plan eligibility', () => {
  it('shows the low-balance soft gate only to the three paid tiers', () => {
    expect(isPaidAmrPlan('plus')).toBe(true);
    expect(isPaidAmrPlan(' PRO ')).toBe(true);
    expect(isPaidAmrPlan('Max')).toBe(true);

    expect(isPaidAmrPlan('free')).toBe(false);
    expect(isPaidAmrPlan('enterprise')).toBe(false);
    expect(isPaidAmrPlan(null)).toBe(false);
    expect(isPaidAmrPlan(undefined)).toBe(false);
  });

  it('recognizes only the explicit free tier for post-success upgrades', () => {
    expect(isFreeAmrPlan(' free ')).toBe(true);
    expect(isFreeAmrPlan('FREE')).toBe(true);
    expect(isFreeAmrPlan('plus')).toBe(false);
    expect(isFreeAmrPlan(null)).toBe(false);
  });
});

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
