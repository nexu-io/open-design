// @vitest-environment jsdom
// Positive balances must never introduce a subscription lookup or warning.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AmrWalletSnapshot } from '@open-design/contracts';
import { checkAmrBalanceGate } from '../../src/runtime/amr-balance-gate';
import {
  fetchAmrWalletSnapshot,
  fetchVelaLoginStatus,
} from '../../src/providers/daemon';

vi.mock('../../src/providers/daemon', () => ({
  fetchAmrWalletSnapshot: vi.fn(),
  fetchVelaLoginStatus: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchAmrWalletSnapshot);
const mockedFetchStatus = vi.mocked(fetchVelaLoginStatus);

/** QA 报的余额,原样使用。 */
const REPORTED_BALANCE = '1.79';
/** 发送时选中的模型 —— 早退的 `modelId?.trim()` 这一半在真实发送里几乎恒真。 */
const MODEL_ID = 'glm-5.2';

function snapshot(overrides: Partial<AmrWalletSnapshot> = {}): AmrWalletSnapshot {
  return {
    status: 'available',
    profile: 'prod',
    user: { id: 'u1', email: 'user@example.com' },
    balanceUsd: '0',
    updatedAt: '2026-09-03T00:00:00.000Z',
    fetchedAt: '2026-09-03T00:00:00.000Z',
    stale: false,
    source: 'vela_api',
    ...overrides,
  };
}

function walletWithPlan(balanceUsd: string, plan: string | null): AmrWalletSnapshot {
  return snapshot({
    balanceUsd,
    user: plan == null
      ? { id: 'u1', email: 'user@example.com' }
      : { id: 'u1', email: 'user@example.com', plan },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  // 登录态读不出来 → `resolveAmrPlan` 退回钱包快照上的套餐字段。
  mockedFetchStatus.mockRejectedValue(new Error('status unavailable'));
});

afterEach(() => {
  mockedFetch.mockReset();
  mockedFetchStatus.mockReset();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('positive wallet fast path', () => {
  it.each(['free', 'go', 'plus', 'pro', 'max'])(
    '%s at $1.79 proceeds without refreshing tier or wallet', async (plan) => {
      mockedFetch.mockResolvedValue(walletWithPlan(REPORTED_BALANCE, plan));
      await expect(checkAmrBalanceGate(undefined, MODEL_ID)).resolves.toEqual({ kind: 'allow' });
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      expect(mockedFetchStatus).not.toHaveBeenCalled();
    },
  );
});
