// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AmrWalletSnapshot } from '@open-design/contracts';
import {
  isFreeAmrPlan,
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
  it('recognizes only the explicit free tier for post-success upgrades', () => {
    expect(isFreeAmrPlan(' free ')).toBe(true);
    expect(isFreeAmrPlan('FREE')).toBe(true);
    expect(isFreeAmrPlan('plus')).toBe(false);
    expect(isFreeAmrPlan(null)).toBe(false);
  });

  /*
   * The fact this file exists to protect, and the reason the question is asked
   * as "is it FREE" rather than "is it PAID": the two are not complements.
   *
   * A plan that cannot be read is neither. `planMayFundRunOutsideWallet` is
   * `!isFreeAmrPlan(...)`, so an unreadable tier answers "something else may be
   * funding this" and the hard block stands down — a subscriber whose tier the
   * client cannot read is never blocked by a failed read (T39). Ask it the
   * other way round and the same account gets hard-blocked instead, which is
   * the paid-team lockout T15 calls a production incident.
   *
   * A `isPaidAmrPlan` counterpart used to live next to this one and is gone on
   * purpose; see the docblock on `isFreeAmrPlan`.
   */
  it('an unreadable tier is not free — and that is what keeps it unblocked', () => {
    expect(isFreeAmrPlan(null)).toBe(false);
    expect(isFreeAmrPlan(undefined)).toBe(false);
    expect(isFreeAmrPlan('')).toBe(false);
    // Tiers outside the known set answer the same way, for the same reason.
    expect(isFreeAmrPlan('enterprise')).toBe(false);
    expect(isFreeAmrPlan('go')).toBe(false);
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
