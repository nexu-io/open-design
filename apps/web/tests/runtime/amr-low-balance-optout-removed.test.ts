// @vitest-environment jsdom
// Legacy warning preferences never alter funding or authentication.
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

/**
 * 已经在真实用户机器上落盘的那条位。删读取方之后它只应该是一条死数据。
 * 这里写死字面量而不是 import 常量:常量本身也要被删。
 */
const LEGACY_OPTOUT_KEY = 'open-design:amr-low-balance-warn-optout:v1';

/** 那颗 opt-out 当年作用的那一段:高于硬拦线的一个小余额。 */
const LOW_BALANCE = '1.20';
/** 一个宽裕的余额,用来证明结论不是只在小数字上成立。 */
const HEALTHY_BALANCE = '42.00';

function seedLegacyOptOut(): void {
  window.localStorage.setItem(LEGACY_OPTOUT_KEY, '1');
}

function snapshot(overrides: Partial<AmrWalletSnapshot> = {}): AmrWalletSnapshot {
  return {
    status: 'available',
    profile: 'prod',
    user: { id: 'u1', email: 'user@example.com' },
    balanceUsd: '10.00',
    updatedAt: '2026-09-04T00:00:00.000Z',
    fetchedAt: '2026-09-04T00:00:00.000Z',
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

function authoritativeWorkspaceBillingResponse(
  workspaceId: string,
  workspaceMemberId: string,
  balanceUsd: string,
) {
  const observedAt = '2026-09-04T00:00:00.000Z';
  return {
    summary: null,
    workspaceBalance: {
      billingScopeVersion: 2,
      workspaceId,
      workspaceMemberId,
      balanceUsd,
      expiresAt: null,
      updatedAt: observedAt,
    },
    workspaceRuntime: {
      workspaceId,
      workspaceMemberId,
      status: 'fresh',
      revision: '4',
      observedAt,
      softExpiresAt: '2099-09-04T00:00:30.000Z',
      hardExpiresAt: '2099-09-04T00:02:00.000Z',
      retryAt: null,
      errorCode: null,
      reason: 'authoritative-action-read',
      sourceGapDetected: false,
    },
    authoritativeWorkspaceRead: {
      workspaceId,
      workspaceMemberId,
      observedAt,
    },
  };
}

function stubWorkspaceBilling(
  workspaceId: string,
  workspaceMemberId: string,
  balanceUsd: string,
) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify(
      authoritativeWorkspaceBillingResponse(workspaceId, workspaceMemberId, balanceUsd),
    ),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )));
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

describe('legacy opt-out remains dead data', () => {
  it.each([true, false])('does not change zero-wallet admission (opt-out %s)', async (optOut) => {
    if (optOut) seedLegacyOptOut();
    mockedFetch.mockResolvedValue(snapshot({ balanceUsd: '0' }));
    await expect(checkAmrBalanceGate(undefined, 'model')).resolves.toEqual({ kind: 'allow' });
  });
  it('cannot bypass sign-out', async () => {
    seedLegacyOptOut();
    mockedFetch.mockResolvedValue(snapshot({ status: 'signed_out' }));
    await expect(checkAmrBalanceGate()).resolves.toMatchObject({ kind: 'hard', reason: 'signed_out' });
  });
});
