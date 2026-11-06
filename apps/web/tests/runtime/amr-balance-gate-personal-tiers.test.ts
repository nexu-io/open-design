// @vitest-environment jsdom
// Coding Plan and wallet funding are resolved by Link for every tier.
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

function snapshot(overrides: Partial<AmrWalletSnapshot> = {}): AmrWalletSnapshot {
  return {
    status: 'available',
    profile: 'prod',
    user: { id: 'u1', email: 'user@example.com' },
    balanceUsd: '0',
    updatedAt: '2026-09-06T00:00:00.000Z',
    fetchedAt: '2026-09-06T00:00:00.000Z',
    stale: false,
    source: 'vela_api',
    ...overrides,
  };
}

function authoritativeWorkspaceBillingResponse(
  workspaceId: string,
  workspaceMemberId: string,
  balanceUsd: string,
) {
  const observedAt = '2026-09-06T00:00:00.000Z';
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
      softExpiresAt: '2099-09-06T00:00:30.000Z',
      hardExpiresAt: '2099-09-06T00:02:00.000Z',
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

function workspaceBillingStub(
  workspaceId: string,
  workspaceMemberId: string,
  balanceUsd: string,
) {
  return vi.fn(async () => new Response(
    JSON.stringify(authoritativeWorkspaceBillingResponse(
      workspaceId,
      workspaceMemberId,
      balanceUsd,
    )),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ));
}

function personalScope(id: string) {
  return {
    workspaceType: 'personal' as const,
    workspaceId: `ws-${id}`,
    workspaceMemberId: `wm-${id}`,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  // 默认读不到登录态,套餐只能从钱包快照里读 —— 每条用例自己决定放不放。
  mockedFetchStatus.mockRejectedValue(new Error('status unavailable'));
});

afterEach(() => {
  mockedFetch.mockReset();
  mockedFetchStatus.mockReset();
  vi.unstubAllGlobals();
});

describe('personal and team subscriptions defer zero-wallet funding to Link', () => {
  it.each(['free', 'basic', 'go', 'plus', 'pro', 'max', 'team_plus', 'team_pro', 'team_max'])(
    '%s is never a wallet-only rejection', async (plan) => {
      mockedFetch.mockResolvedValue(snapshot({ user: { id: 'u1', email: 'u@example.com', plan } }));
      for (const workspaceType of ['personal', 'team'] as const) {
        vi.stubGlobal('fetch', workspaceBillingStub('ws', 'member', '0'));
        await expect(checkAmrBalanceGate({ workspaceType, workspaceId: 'ws', workspaceMemberId: 'member' }, 'model')).resolves.toEqual({ kind: 'allow' });
      }
      expect(mockedFetchStatus).not.toHaveBeenCalled();
    },
  );
});
