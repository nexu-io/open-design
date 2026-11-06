import { describe, expect, it } from 'vitest';
import type { AmrWalletSnapshot } from '../src/api/amrWallet';
import { AMR_WALLET_SNAPSHOT_STATUSES } from '../src/api/amrWallet';

describe('AMR wallet snapshot contract', () => {
  it('models unavailable balance without pretending the balance is zero', () => {
    const snapshot = {
      status: 'unavailable',
      profile: 'local',
      user: { id: 'user-1', email: 'dev@example.com' },
      balanceUsd: null,
      updatedAt: null,
      fetchedAt: '2026-06-23T06:05:18.782Z',
      stale: false,
      source: 'unavailable',
      error: {
        code: 'missing_control_key',
        message: 'Sign in again to refresh AMR wallet credentials.',
      },
    } satisfies AmrWalletSnapshot;

    expect(snapshot.balanceUsd).toBeNull();
    expect(snapshot.error?.code).toBe('missing_control_key');
    expect(AMR_WALLET_SNAPSHOT_STATUSES).toEqual([
      'signed_out',
      'available',
      'unavailable',
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('controlKey');
    expect(JSON.stringify(snapshot)).not.toContain('runtimeKey');
  });
});
