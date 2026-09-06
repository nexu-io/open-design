// @vitest-environment jsdom
/**
 * T55(产品口述 2026-09-06):**四格矩阵管个人工作区**,所以个人版付费档余额
 * $0 也要硬拦。
 *
 * 缺陷的形状:硬拦的让位判据问的是「套餐**不是** free 吗」
 * (`planMayFundRunOutsideWallet = !isFreeAmrPlan(...)`),而 `isFreeAmrPlan`
 * 只精确匹配 `'free'` —— 连 `'basic'` 都算「非 free」。于是个人版
 * Basic / Plus / Pro / Max 在 $0 时全部落到 soft 档:四格弹窗一张都不出,
 * 屏幕上只剩那张升级卡。
 *
 * ⚠️ 这条修改**保住**了 `cf00c80bd1` 的另一半:「**套餐读不出来时放行,由远程
 * 兜底**」。两件事此前被同一个谓词管着,这里把它们拆开 ——
 *
 *   读不出来 → 放行(保留)
 *   读出来是付费档 → 放行(**这一半被推翻**)
 */
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

describe('个人工作区 · 余额 $0 · 按档位', () => {
  // 免费档:今天就拦,这一条是控制组,证明量法看得见「硬拦」这个读数。
  it('free 档硬拦', async () => {
    mockedFetch.mockResolvedValue(snapshot({
      user: { id: 'u1', email: 'user@example.com', plan: 'free' },
    }));
    vi.stubGlobal('fetch', workspaceBillingStub('ws-free', 'wm-free', '0'));

    await expect(checkAmrBalanceGate(personalScope('free'), 'glm-5.2')).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: expect.objectContaining({ balanceUsd: '0' }),
    });
  });

  // 这四档今天全部漏拦 —— basic 尤其刺眼:它连「非 free」这个判据的本意都不符合。
  it.each(['basic', 'plus', 'pro', 'max'])('%s 档也要硬拦', async (plan) => {
    mockedFetch.mockResolvedValue(snapshot({
      user: { id: 'u1', email: 'user@example.com', plan },
    }));
    vi.stubGlobal('fetch', workspaceBillingStub(`ws-${plan}`, `wm-${plan}`, '0'));

    await expect(checkAmrBalanceGate(personalScope(plan), 'glm-5.2')).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: expect.objectContaining({ balanceUsd: '0' }),
    });
  });

  it('登录态里报出来的付费档同样硬拦(钱包快照没带 plan)', async () => {
    mockedFetch.mockResolvedValue(snapshot());
    mockedFetchStatus.mockResolvedValue({
      loggedIn: true,
      profile: 'prod',
      user: null,
      account: { plan: 'pro', balanceUsd: '0' },
      configPath: '/tmp/vela.json',
    });
    vi.stubGlobal('fetch', workspaceBillingStub('ws-status', 'wm-status', '0'));

    await expect(
      checkAmrBalanceGate(personalScope('status'), 'glm-5.2'),
    ).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: expect.objectContaining({ balanceUsd: '0' }),
    });
  });

  /**
   * `cf00c80bd1` 那一半必须原样活着:**套餐读不出来就放行,由远程兜底**
   * (用户 2026-09-06 原话「放,具体由远程兜底」)。一次读数失败不许变成一次硬拦。
   */
  it('套餐读不出来时放行,由远程兜底', async () => {
    mockedFetch.mockResolvedValue(snapshot({ user: { id: 'u1', email: 'user@example.com' } }));
    vi.stubGlobal('fetch', workspaceBillingStub('ws-unknown', 'wm-unknown', '0'));

    const result = await checkAmrBalanceGate(personalScope('unknown'), 'glm-5.2');
    expect(result.kind).not.toBe('hard');
    expect(result).toEqual({
      kind: 'soft',
      snapshot: expect.objectContaining({ balanceUsd: '0' }),
    });
  });
});

describe('个人工作区 · 余额不为 0 · 不受这次改动影响', () => {
  it.each(['free', 'basic', 'max'])('%s 档低余额仍然只是软提醒', async (plan) => {
    mockedFetch.mockResolvedValue(snapshot({
      balanceUsd: '1.20',
      user: { id: 'u1', email: 'user@example.com', plan },
    }));
    vi.stubGlobal('fetch', workspaceBillingStub(`ws-low-${plan}`, `wm-low-${plan}`, '1.20'));

    await expect(
      checkAmrBalanceGate(personalScope(`low-${plan}`), 'glm-5.2'),
    ).resolves.toEqual({
      kind: 'soft',
      snapshot: expect.objectContaining({ balanceUsd: '1.20' }),
    });
  });

  it('余额健康时什么都不做', async () => {
    mockedFetch.mockResolvedValue(snapshot({
      balanceUsd: '50.00',
      user: { id: 'u1', email: 'user@example.com', plan: 'max' },
    }));
    vi.stubGlobal('fetch', workspaceBillingStub('ws-rich', 'wm-rich', '50.00'));

    await expect(
      checkAmrBalanceGate(personalScope('rich'), 'glm-5.2'),
    ).resolves.toEqual({ kind: 'allow' });
  });
});

// 团队那一路本来就从不让位(成员的个人套餐不给团队的运行买单),这次一个字不动。
describe('团队工作区 · 各档 · 不受这次改动影响', () => {
  it.each(['free', 'basic', 'pro', 'max'])('%s 档 $0 仍然硬拦', async (plan) => {
    mockedFetch.mockResolvedValue(snapshot({
      user: { id: 'u1', email: 'user@example.com', plan },
    }));
    vi.stubGlobal('fetch', workspaceBillingStub(`ws-team-${plan}`, `wm-team-${plan}`, '0'));

    await expect(
      checkAmrBalanceGate({
        workspaceType: 'team',
        workspaceId: `ws-team-${plan}`,
        workspaceMemberId: `wm-team-${plan}`,
      }, 'glm-5.2'),
    ).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: expect.objectContaining({ balanceUsd: '0' }),
    });
  });

  it('团队工作区读不出套餐时也照拦(它本来就不看账号档次)', async () => {
    mockedFetch.mockResolvedValue(snapshot({ user: { id: 'u1', email: 'user@example.com' } }));
    vi.stubGlobal('fetch', workspaceBillingStub('ws-team-unknown', 'wm-team-unknown', '0'));

    await expect(
      checkAmrBalanceGate({
        workspaceType: 'team',
        workspaceId: 'ws-team-unknown',
        workspaceMemberId: 'wm-team-unknown',
      }, 'glm-5.2'),
    ).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: expect.objectContaining({ balanceUsd: '0' }),
    });
  });
});
