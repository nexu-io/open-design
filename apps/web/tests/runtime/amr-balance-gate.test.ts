// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AmrWalletSnapshot } from '@open-design/contracts';
import {
  AMR_HARD_BLOCK_BALANCE_USD,
  AMR_LOW_BALANCE_WARN_USD,
  amrWalletBalanceInsufficient,
  amrWalletBalanceUsd,
  checkAmrBalanceGate,
  isAmrLowBalanceWarnOptedOut,
  setAmrLowBalanceWarnOptedOut,
} from '../../src/runtime/amr-balance-gate';
import { fetchAmrWalletSnapshot } from '../../src/providers/daemon';

vi.mock('../../src/providers/daemon', () => ({
  fetchAmrWalletSnapshot: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchAmrWalletSnapshot);

function snapshot(overrides: Partial<AmrWalletSnapshot> = {}): AmrWalletSnapshot {
  return {
    status: 'available',
    profile: 'prod',
    user: { id: 'u1', email: 'user@example.com' },
    balanceUsd: '0',
    updatedAt: '2026-07-02T00:00:00.000Z',
    fetchedAt: '2026-07-02T00:00:00.000Z',
    stale: false,
    source: 'vela_api',
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  mockedFetch.mockReset();
});

describe('amrWalletBalanceUsd', () => {
  it('parses only definitive answers', () => {
    expect(amrWalletBalanceUsd(snapshot({ balanceUsd: '12.3' }))).toBe(12.3);
    expect(amrWalletBalanceUsd(snapshot({ balanceUsd: '-1.25' }))).toBe(-1.25);
    expect(amrWalletBalanceUsd(null)).toBeNull();
    expect(amrWalletBalanceUsd(snapshot({ balanceUsd: null }))).toBeNull();
    expect(amrWalletBalanceUsd(snapshot({ balanceUsd: 'not-a-number' }))).toBeNull();
    // Number(' ') is 0 — whitespace must stay indefinite, not read as $0.
    expect(amrWalletBalanceUsd(snapshot({ balanceUsd: ' ' }))).toBeNull();
    expect(amrWalletBalanceUsd(snapshot({ balanceUsd: '\n\t' }))).toBeNull();
    expect(amrWalletBalanceUsd(snapshot({ status: 'signed_out', balanceUsd: '0' }))).toBeNull();
    expect(amrWalletBalanceUsd(snapshot({ status: 'unavailable', balanceUsd: '0' }))).toBeNull();
  });
});

describe('amrWalletBalanceInsufficient', () => {
  it('is true only for a definitive balance at or below the hard-block line', () => {
    expect(AMR_HARD_BLOCK_BALANCE_USD).toBe(0);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: '0' }))).toBe(true);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: '-1.25' }))).toBe(true);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: '0.01' }))).toBe(false);
    expect(amrWalletBalanceInsufficient(null)).toBe(false);
    expect(amrWalletBalanceInsufficient(snapshot({ balanceUsd: ' ' }))).toBe(false);
  });
});

describe('checkAmrBalanceGate', () => {
  it('allows a healthy balance without a refresh roundtrip', async () => {
    mockedFetch.mockResolvedValueOnce(snapshot({ balanceUsd: '50.00' }));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledWith();
  });

  it('soft-warns between the hard-block and low-balance lines', async () => {
    expect(AMR_LOW_BALANCE_WARN_USD).toBe(2);
    const low = snapshot({ balanceUsd: '1.20' });
    mockedFetch.mockResolvedValueOnce(low);
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'soft', snapshot: low });
    // Soft trusts the cache — no upstream refresh for a dismissible reminder.
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('soft-warns exactly at the low-balance line and allows just above it', async () => {
    const atLine = snapshot({ balanceUsd: '2.00' });
    mockedFetch.mockResolvedValueOnce(atLine);
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'soft', snapshot: atLine });
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValueOnce(snapshot({ balanceUsd: '2.01' }));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
  });

  it('skips the soft warning once the user opted out — but never the hard block', async () => {
    expect(isAmrLowBalanceWarnOptedOut()).toBe(false);
    setAmrLowBalanceWarnOptedOut();
    expect(isAmrLowBalanceWarnOptedOut()).toBe(true);
    mockedFetch.mockResolvedValueOnce(snapshot({ balanceUsd: '1.20' }));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
    mockedFetch.mockReset();
    const empty = snapshot({ balanceUsd: '0' });
    mockedFetch.mockResolvedValueOnce(empty).mockResolvedValueOnce(empty);
    await expect(checkAmrBalanceGate()).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: empty,
    });
  });

  it('confirms a hard-block candidate against the live wallet before blocking', async () => {
    const fresh = snapshot({ balanceUsd: '0' });
    mockedFetch
      .mockResolvedValueOnce(snapshot({ balanceUsd: '0', source: 'daemon_cache' }))
      .mockResolvedValueOnce(fresh);
    await expect(checkAmrBalanceGate()).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: fresh,
    });
    expect(mockedFetch).toHaveBeenNthCalledWith(2, { refresh: true });
  });

  it('hard-blocks a signed-out account after refresh confirmation', async () => {
    const signedOut = snapshot({ status: 'signed_out', balanceUsd: null, user: null });
    mockedFetch.mockResolvedValueOnce(signedOut).mockResolvedValueOnce(signedOut);
    await expect(checkAmrBalanceGate()).resolves.toEqual({
      kind: 'hard',
      reason: 'signed_out',
      snapshot: signedOut,
    });
  });

  it('lets a just-recharged wallet through (stale-empty cache, healthy refresh)', async () => {
    mockedFetch
      .mockResolvedValueOnce(snapshot({ balanceUsd: '0', source: 'daemon_cache' }))
      .mockResolvedValueOnce(snapshot({ balanceUsd: '20.00' }));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
  });

  it('downgrades a stale-empty cache to soft when the refresh lands low', async () => {
    const low = snapshot({ balanceUsd: '2.00' });
    mockedFetch
      .mockResolvedValueOnce(snapshot({ balanceUsd: '0', source: 'daemon_cache' }))
      .mockResolvedValueOnce(low);
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'soft', snapshot: low });
  });

  it('never gates when the wallet endpoint fails', async () => {
    mockedFetch.mockRejectedValue(new Error('network down'));
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
  });

  it('does not hard-block when the refresh only returns a stale cached snapshot', async () => {
    // A failed upstream refresh hands back the previous cached snapshot with
    // stale=true and an error — not a fresh definitive answer. The gate must
    // fail open instead of stranding a user who just topped up while the
    // wallet endpoint hiccuped.
    mockedFetch
      .mockResolvedValueOnce(snapshot({ balanceUsd: '0', source: 'daemon_cache' }))
      .mockResolvedValueOnce(
        snapshot({
          balanceUsd: '0',
          stale: true,
          source: 'daemon_cache',
          error: { code: 'upstream', message: 'wallet fetch failed' },
        }),
      );
    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'allow' });
  });

  it('still hard-blocks a signed-out snapshot despite its explanatory error', async () => {
    // The daemon's signed-out snapshot always carries
    // error={code:'signed_out'} (and no balance). That error explains WHY
    // the balance is unavailable — it is not a failed-refresh echo, and the
    // signed-out determination comes from the local profile read, so it
    // stays definitive. Regression test: a blanket "any error is
    // indefinite" guard silently disabled the signed-out hard block.
    const signedOut = snapshot({
      status: 'signed_out',
      balanceUsd: null,
      user: null,
      source: 'unavailable',
      error: { code: 'signed_out', message: 'Sign in to view wallet balance.' },
    });
    mockedFetch.mockResolvedValueOnce(signedOut).mockResolvedValueOnce(signedOut);
    await expect(checkAmrBalanceGate()).resolves.toEqual({
      kind: 'hard',
      reason: 'signed_out',
      snapshot: signedOut,
    });
  });
});
