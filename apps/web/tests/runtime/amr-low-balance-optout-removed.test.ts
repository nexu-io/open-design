// @vitest-environment jsdom
//
// 红测 · 拆掉低余额「不再提醒」这颗 opt-out(产品 2026-09-04 拍板,原话「拆掉吧」)
//
// 缺陷:首页那张软提醒弹窗底部的「不再提醒」勾选框写的是
// `open-design:amr-low-balance-warn-optout:v1`,而**项目页发送前**那道余额闸门的
// soft 档读的是同一个位。于是在首页勾过一次的人,项目页的升级卡被永久静音 ——
// 而他勾的时候以为自己关的只是首页那个弹窗。这与 T51「升级卡不该有关闭态,余额
// 条件成立就一直在」直接冲突。
//
// 那张弹窗(`AmrLowBalanceDialog`)本身已于 2026-09-06 整个删除(规格 T53),
// **这个文件仍然有效且必须留着**:它测的从来就不是弹窗,而是闸门 ——
// soft 这一档现在归项目页流水里的升级卡,遗留在用户机器上的那条裸数据不许
// 静音它。真实用户机器上的位不会因为弹窗被删而消失。
//
// 这里**故意直接往 localStorage 写那个键**,不走 `setAmrLowBalanceWarnOptedOut()`:
// 一是那个 setter 就是要被删掉的东西,二是真实用户机器上留下的正是这条裸数据。
// 删掉读取方之后它必须变成一条死数据 —— 存在但不再改变任何行为。
//
// ⚠️ 反向对照是这组测试的命门。「删掉一个开关」的红测如果只断言「勾了之后卡还在」,
// 那么把整个 soft 档一起删掉它同样会绿。所以下面每一条正向断言都配了对照:
//   · 没有遗留位时余额低于门槛 → 仍然点亮 soft(证明 soft 档活着)
//   · 余额健康 → allow(证明闸门不是恒 soft)
//   · 硬拦档不受影响(它本来就不读这个位)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AmrWalletSnapshot } from '@open-design/contracts';
import {
  AMR_LOW_BALANCE_WARN_USD,
  checkAmrBalanceGate,
} from '../../src/runtime/amr-balance-gate';
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

/** 低于告警线,但高于硬拦线 —— 正好落在 soft 那一档。 */
const LOW_BALANCE = '1.20';
/** 明显高于告警线,用来证明闸门不是恒 soft。 */
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

describe('拆掉 opt-out · 遗留的静音位不再压掉 soft 档', () => {
  it('项目页发送前(workspace scope):留着遗留位 + $1.20 → 照样点亮升级卡', async () => {
    seedLegacyOptOut();
    mockedFetch.mockResolvedValue(walletWithPlan(LOW_BALANCE, 'pro'));
    stubWorkspaceBilling('ws-legacy-optout', 'wm-legacy-optout', LOW_BALANCE);

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-legacy-optout',
        workspaceMemberId: 'wm-legacy-optout',
      },
      'glm-5.2',
    )).resolves.toEqual({
      kind: 'soft',
      snapshot: expect.objectContaining({ balanceUsd: LOW_BALANCE }),
    });
  });

  it('团队工作区同样不受遗留位影响', async () => {
    seedLegacyOptOut();
    mockedFetch.mockResolvedValue(walletWithPlan(LOW_BALANCE, 'pro'));
    stubWorkspaceBilling('ws-team-legacy', 'wm-team-legacy', LOW_BALANCE);

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'team',
        workspaceId: 'ws-team-legacy',
        workspaceMemberId: 'wm-team-legacy',
      },
      'glm-5.2',
    )).resolves.toEqual({
      kind: 'soft',
      snapshot: expect.objectContaining({ balanceUsd: LOW_BALANCE }),
    });
  });

  it('无 scope 的缓存快路径:留着遗留位 + $1.20 → 仍是 soft(不多打一次网络往返)', async () => {
    seedLegacyOptOut();
    const low = snapshot({ balanceUsd: LOW_BALANCE });
    mockedFetch.mockResolvedValueOnce(low);

    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'soft', snapshot: low });
    // soft 档是延迟红线:确认它没有因为这次改动多打一次 refresh。
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('无 scope 的 refresh 复核路径:缓存 $0、实拉 $1.20 → 仍是 soft', async () => {
    seedLegacyOptOut();
    const fresh = snapshot({ balanceUsd: LOW_BALANCE });
    mockedFetch
      // 缓存看着像硬拦候选,于是走实拉复核。
      .mockResolvedValueOnce(snapshot({ balanceUsd: '0', source: 'daemon_cache' }))
      // 实拉回来发现刚充过值,但仍在告警线以下。
      .mockResolvedValueOnce(fresh);

    await expect(checkAmrBalanceGate()).resolves.toEqual({ kind: 'soft', snapshot: fresh });
    expect(mockedFetch).toHaveBeenNthCalledWith(2, { refresh: true });
  });
});

// ⚠️ 没有这一组,上面全部会在「把整个 soft 档删掉」时假绿。
describe('反向对照 · soft 档本身还活着', () => {
  it('没有遗留位 + $1.20 → soft(workspace scope)', async () => {
    expect(window.localStorage.getItem(LEGACY_OPTOUT_KEY)).toBeNull();
    mockedFetch.mockResolvedValue(walletWithPlan(LOW_BALANCE, 'pro'));
    stubWorkspaceBilling('ws-clean', 'wm-clean', LOW_BALANCE);

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-clean',
        workspaceMemberId: 'wm-clean',
      },
      'glm-5.2',
    )).resolves.toEqual({
      kind: 'soft',
      snapshot: expect.objectContaining({ balanceUsd: LOW_BALANCE }),
    });
  });

  it('余额健康 → allow(闸门不是恒 soft)', async () => {
    expect(Number(HEALTHY_BALANCE)).toBeGreaterThan(AMR_LOW_BALANCE_WARN_USD);
    mockedFetch.mockResolvedValue(walletWithPlan(HEALTHY_BALANCE, 'pro'));
    stubWorkspaceBilling('ws-healthy', 'wm-healthy', HEALTHY_BALANCE);

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-healthy',
        workspaceMemberId: 'wm-healthy',
      },
      'glm-5.2',
    )).resolves.toEqual({ kind: 'allow' });
  });

  it('留着遗留位、余额健康 → 依然 allow(遗留位不会反过来制造提醒)', async () => {
    seedLegacyOptOut();
    mockedFetch.mockResolvedValue(walletWithPlan(HEALTHY_BALANCE, 'pro'));
    stubWorkspaceBilling('ws-healthy-legacy', 'wm-healthy-legacy', HEALTHY_BALANCE);

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-healthy-legacy',
        workspaceMemberId: 'wm-healthy-legacy',
      },
      'glm-5.2',
    )).resolves.toEqual({ kind: 'allow' });
  });
});

describe('反向对照 · 硬拦档不在这次拆除范围内', () => {
  it('免费档 + 零余额 + 留着遗留位 → 照拦', async () => {
    seedLegacyOptOut();
    mockedFetch.mockResolvedValue(walletWithPlan('0', 'free'));
    stubWorkspaceBilling('ws-hard-legacy', 'wm-hard-legacy', '0');

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-hard-legacy',
        workspaceMemberId: 'wm-hard-legacy',
      },
      'glm-5.2',
    )).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: expect.objectContaining({ balanceUsd: '0' }),
    });
  });
});
