// @vitest-environment jsdom
//
// 红测 · OPEND-2600「【Beta】专业版余额低于 $2 时发送新任务未触发低余额提醒」
//
// QA 场景:个人工作区 + 专业版(pro) + 钱包 $1.79 + 发新任务 → 一个提示都没有。
//
// 成因在 `checkWorkspaceBalanceGate` 的那道早退:它排在 hard / soft 两个分支
// **之前**,条件是「余额 <= $2 且个人工作区且选了模型且套餐不是 free」,命中就
// 整个 `return { kind: 'allow' }`。付费档在 $0 < 余额 <= $2 这一段被整段吃掉,
// soft 根本没机会算出来。
//
// 产品裁决(2026-09-03):
//   1. 提醒对**所有档位**可见(免费档也要有)。
//   2. 余额 0 或不足时,**即使有套餐也要提醒**。
//   3. 但提醒 ≠ 拦截 —— 让位判据保留,但**只管硬拦那一档**:它只能让判定跳过
//      hard 分支,不能顺手把 soft 也吞掉。
//      ⚠️ 这一条的后半在 2026-09-06 被推翻(T55):当时的让位判据是「有套餐 ⇒
//      不拦」(T15),现在改成「**档次读不出来** ⇒ 不拦」。本文件里 $0 那几组
//      因此从 soft 改成 hard,$1.79 那几组(这个红测真正要防的缺陷)一字未动。
//   4. 软提醒不许拖慢运行(红线):软提醒这一档**不许多打一次网络往返**。
//      这一条在下面用「$1.79 这条路上 `fetchVelaLoginStatus` 一次都没被调用」
//      来量 —— 套餐读数只有硬拦那一档才需要。
//
// 反向对照(团队工作区 / 免费档 $0 / 遗留静音位)一并钉住,保证这次只放开该放开的。
//
// 补记(2026-09-04):「不再提醒」那颗 opt-out 已整颗拆除,原来那三条 opt-out
// 对照改成钉住「遗留的静音位不再改变任何判定」。

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

function authoritativeWorkspaceBillingResponse(
  workspaceId: string,
  workspaceMemberId: string,
  balanceUsd: string,
) {
  const observedAt = '2026-09-03T00:00:00.000Z';
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
      softExpiresAt: '2099-09-03T00:00:30.000Z',
      hardExpiresAt: '2099-09-03T00:02:00.000Z',
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

/**
 * 真实用户机器上留下的那条裸数据。读取方已删,它必须是一条死数据 —— 故意直接写
 * localStorage 而不是走已删掉的 setter。
 */
function seedRetiredOptOut() {
  window.localStorage.setItem('open-design:amr-low-balance-warn-optout:v1', '1');
}

function stubWorkspaceBilling(
  workspaceId: string,
  workspaceMemberId: string,
  balanceUsd: string,
) {
  const stub = vi.fn(async () => new Response(
    JSON.stringify(
      authoritativeWorkspaceBillingResponse(workspaceId, workspaceMemberId, balanceUsd),
    ),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ));
  vi.stubGlobal('fetch', stub);
  return stub;
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

describe('OPEND-2600 · 个人工作区低余额提醒', () => {
  it('专业版 + $1.79 发新任务 → 判定为告警档(报的就是这一条)', async () => {
    mockedFetch.mockResolvedValue(walletWithPlan(REPORTED_BALANCE, 'pro'));
    stubWorkspaceBilling('ws-personal-pro', 'wm-personal-pro', REPORTED_BALANCE);

    const result = await checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-personal-pro',
        workspaceMemberId: 'wm-personal-pro',
      },
      MODEL_ID,
    );

    expect(result).toEqual({
      kind: 'soft',
      snapshot: expect.objectContaining({ balanceUsd: REPORTED_BALANCE }),
    });
  });

  it.each(['plus', 'pro', 'max', 'go'])(
    '%s 档 + $1.79 一样出告警(提醒对所有档位可见)',
    async (plan) => {
      mockedFetch.mockResolvedValue(walletWithPlan(REPORTED_BALANCE, plan));
      stubWorkspaceBilling(`ws-${plan}`, `wm-${plan}`, REPORTED_BALANCE);

      const result = await checkAmrBalanceGate(
        {
          workspaceType: 'personal',
          workspaceId: `ws-${plan}`,
          workspaceMemberId: `wm-${plan}`,
        },
        MODEL_ID,
      );

      expect(result).toEqual({
        kind: 'soft',
        snapshot: expect.objectContaining({ balanceUsd: REPORTED_BALANCE }),
      });
    },
  );

  it('免费档 + $1.79 照旧告警(反向对照:这一档本来就是活的)', async () => {
    mockedFetch.mockResolvedValue(walletWithPlan(REPORTED_BALANCE, 'free'));
    stubWorkspaceBilling('ws-free', 'wm-free', REPORTED_BALANCE);

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-free',
        workspaceMemberId: 'wm-free',
      },
      MODEL_ID,
    )).resolves.toEqual({
      kind: 'soft',
      snapshot: expect.objectContaining({ balanceUsd: REPORTED_BALANCE }),
    });
  });

  it('套餐读不出来(null 档)+ $1.79 也要提醒 —— 这一档不能掉进缝里', async () => {
    // 读不出来的档位既不是「免费」也不是「付费」——两个判据不互补,这一档要自己钉。
    mockedFetch.mockResolvedValue(walletWithPlan(REPORTED_BALANCE, null));
    stubWorkspaceBilling('ws-unknown', 'wm-unknown', REPORTED_BALANCE);

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-unknown',
        workspaceMemberId: 'wm-unknown',
      },
      MODEL_ID,
    )).resolves.toEqual({
      kind: 'soft',
      snapshot: expect.objectContaining({ balanceUsd: REPORTED_BALANCE }),
    });
  });
});

/**
 * ⚠️ 这一组在 2026-09-06 被**推翻了一半**(T55)。
 *
 * 原口径(T15 / OPEND-2600):个人工作区 + 付费档 + $0 → 只提醒,不拦。
 * 现口径:**读得出档次就拦**(免费档和付费档一样),四格矩阵管个人工作区。
 * 唯一还失败开放的是「档次读不出来」那一格,它原样留在下面。
 *
 * 这个文件本来要防的那条缺陷(付费档在 $0 < 余额 <= $2 这一段一个提示都没有)
 * 与这次改动无关,上面 `$1.79` 那一组一个字没动,仍然全绿。
 */
describe('T55 · 余额 $0 的套餐用户:读得出档次就拦', () => {
  it.each(['plus', 'pro', 'max', 'go'])(
    '%s 档 + 零余额 → 拦截档(原为告警档,产品 2026-09-06 推翻)',
    async (plan) => {
      mockedFetch.mockResolvedValue(walletWithPlan('0', plan));
      stubWorkspaceBilling(`ws-zero-${plan}`, `wm-zero-${plan}`, '0');

      const result = await checkAmrBalanceGate(
        {
          workspaceType: 'personal',
          workspaceId: `ws-zero-${plan}`,
          workspaceMemberId: `wm-zero-${plan}`,
        },
        MODEL_ID,
      );

      expect(result).toEqual({
        kind: 'hard',
        reason: 'insufficient',
        snapshot: expect.objectContaining({ balanceUsd: '0' }),
      });
    },
  );

  it('套餐读不出来(null 档)+ 零余额 → 仍然失败开放(不拦),但要提醒', async () => {
    mockedFetch.mockResolvedValue(walletWithPlan('0', null));
    stubWorkspaceBilling('ws-zero-unknown', 'wm-zero-unknown', '0');

    const result = await checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-zero-unknown',
        workspaceMemberId: 'wm-zero-unknown',
      },
      MODEL_ID,
    );

    expect(result.kind).not.toBe('hard');
    expect(result).toEqual({
      kind: 'soft',
      snapshot: expect.objectContaining({ balanceUsd: '0' }),
    });
  });

  it('免费档 + 零余额 照旧硬拦(反向对照:没套餐就只有钱包)', async () => {
    mockedFetch.mockResolvedValue(walletWithPlan('0', 'free'));
    stubWorkspaceBilling('ws-zero-free', 'wm-zero-free', '0');

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-zero-free',
        workspaceMemberId: 'wm-zero-free',
      },
      MODEL_ID,
    )).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: expect.objectContaining({ balanceUsd: '0' }),
    });
  });

  it('没选模型时 + 零余额 照旧硬拦,连套餐档也不例外(既有行为,别顺手简化掉)', async () => {
    // 「让开」的另一半判据是 `modelId?.trim()`。没有模型就没有「Vela 会用别的
    // 途径结账」这回事,钱包读数是唯一的事实,所以照拦。
    mockedFetch.mockResolvedValue(walletWithPlan('0', 'pro'));
    stubWorkspaceBilling('ws-zero-nomodel', 'wm-zero-nomodel', '0');

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-zero-nomodel',
        workspaceMemberId: 'wm-zero-nomodel',
      },
      '   ',
    )).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: expect.objectContaining({ balanceUsd: '0' }),
    });
  });
});

describe('OPEND-2600 · 红线:软提醒不许多打一次网络往返', () => {
  it('$1.79 这条路上一次套餐读数都不发 —— 套餐只有硬拦那一档才需要', async () => {
    mockedFetch.mockResolvedValue(walletWithPlan(REPORTED_BALANCE, 'pro'));
    stubWorkspaceBilling('ws-latency', 'wm-latency', REPORTED_BALANCE);

    const result = await checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-latency',
        workspaceMemberId: 'wm-latency',
      },
      MODEL_ID,
    );

    expect(result.kind).toBe('soft');
    // `resolveAmrPlan` 唯一的网络动作。软提醒这一档不该碰它。
    expect(mockedFetchStatus).not.toHaveBeenCalled();
  });

  it('零余额那一档照样可以读套餐 —— 硬拦本来就必须阻塞', async () => {
    mockedFetch.mockResolvedValue(walletWithPlan('0', 'free'));
    stubWorkspaceBilling('ws-latency-zero', 'wm-latency-zero', '0');

    await checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-latency-zero',
        workspaceMemberId: 'wm-latency-zero',
      },
      MODEL_ID,
    );

    expect(mockedFetchStatus).toHaveBeenCalled();
  });
});

describe('OPEND-2600 · 反向对照:团队工作区行为不变', () => {
  it('团队 + 专业版 + $1.79 仍是告警档', async () => {
    mockedFetch.mockResolvedValue(walletWithPlan(REPORTED_BALANCE, 'pro'));
    stubWorkspaceBilling('ws-team-low', 'wm-team-low', REPORTED_BALANCE);

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'team',
        workspaceId: 'ws-team-low',
        workspaceMemberId: 'wm-team-low',
      },
      MODEL_ID,
    )).resolves.toEqual({
      kind: 'soft',
      snapshot: expect.objectContaining({ balanceUsd: REPORTED_BALANCE }),
    });
  });

  it('团队 + 专业版 + 零余额 仍是拦截档', async () => {
    mockedFetch.mockResolvedValue(walletWithPlan('0', 'pro'));
    stubWorkspaceBilling('ws-team-zero', 'wm-team-zero', '0');

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'team',
        workspaceId: 'ws-team-zero',
        workspaceMemberId: 'wm-team-zero',
      },
      MODEL_ID,
    )).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: expect.objectContaining({ balanceUsd: '0' }),
    });
  });
});

describe('OPEND-2600 · 反向对照:遗留的静音位和健康余额', () => {
  it('留着遗留静音位的人 + $1.79 → 照样提醒', async () => {
    seedRetiredOptOut();
    mockedFetch.mockResolvedValue(walletWithPlan(REPORTED_BALANCE, 'pro'));
    stubWorkspaceBilling('ws-optout', 'wm-optout', REPORTED_BALANCE);

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-optout',
        workspaceMemberId: 'wm-optout',
      },
      MODEL_ID,
    )).resolves.toEqual({
      kind: 'soft',
      snapshot: expect.objectContaining({ balanceUsd: REPORTED_BALANCE }),
    });
  });

  // 这条对照钉的是「遗留静音位不改变任何判定」,判定本身按 T55 从 soft 变 hard。
  it('留着遗留静音位的套餐用户 + 零余额:静音位改不了拦截(T55)', async () => {
    seedRetiredOptOut();
    mockedFetch.mockResolvedValue(walletWithPlan('0', 'pro'));
    stubWorkspaceBilling('ws-optout-zero', 'wm-optout-zero', '0');

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-optout-zero',
        workspaceMemberId: 'wm-optout-zero',
      },
      MODEL_ID,
    )).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: expect.objectContaining({ balanceUsd: '0' }),
    });
  });

  it('遗留静音位永远压不掉硬拦:免费档 + 零余额 照拦', async () => {
    seedRetiredOptOut();
    mockedFetch.mockResolvedValue(walletWithPlan('0', 'free'));
    stubWorkspaceBilling('ws-optout-free', 'wm-optout-free', '0');

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-optout-free',
        workspaceMemberId: 'wm-optout-free',
      },
      MODEL_ID,
    )).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: expect.objectContaining({ balanceUsd: '0' }),
    });
  });

  it('余额健康时什么都不出', async () => {
    mockedFetch.mockResolvedValue(walletWithPlan('50.00', 'pro'));
    stubWorkspaceBilling('ws-healthy', 'wm-healthy', '50.00');

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'personal',
        workspaceId: 'ws-healthy',
        workspaceMemberId: 'wm-healthy',
      },
      MODEL_ID,
    )).resolves.toEqual({ kind: 'allow' });
  });

  it('团队工作区余额健康时同样什么都不出', async () => {
    mockedFetch.mockResolvedValue(walletWithPlan('50.00', 'pro'));
    stubWorkspaceBilling('ws-team-healthy', 'wm-team-healthy', '50.00');

    await expect(checkAmrBalanceGate(
      {
        workspaceType: 'team',
        workspaceId: 'ws-team-healthy',
        workspaceMemberId: 'wm-team-healthy',
      },
      MODEL_ID,
    )).resolves.toEqual({ kind: 'allow' });
  });
});

describe('OPEND-2600 · 无 scope 的旧账号路径同样口径', () => {
  it('专业版 + $1.79(缓存命中)→ 告警档', async () => {
    mockedFetch.mockResolvedValueOnce(walletWithPlan(REPORTED_BALANCE, 'pro'));

    await expect(checkAmrBalanceGate(undefined, MODEL_ID)).resolves.toEqual({
      kind: 'soft',
      snapshot: expect.objectContaining({ balanceUsd: REPORTED_BALANCE }),
    });
  });

  // 无 scope 的旧账号路径和个人工作区共用同一个让位谓词,所以 T55 一起改口径:
  // 同一个人、同样的 $0,不该因为项目绑没绑工作区就一个拦一个放。
  it('专业版 + 零余额(刷新确认后)→ 拦截档(T55 改口径)', async () => {
    const empty = walletWithPlan('0', 'pro');
    mockedFetch
      .mockResolvedValueOnce({ ...empty, source: 'daemon_cache' })
      .mockResolvedValueOnce(empty);

    await expect(checkAmrBalanceGate(undefined, MODEL_ID)).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: expect.objectContaining({ balanceUsd: '0' }),
    });
  });

  it('免费档 + 零余额 照旧硬拦(反向对照)', async () => {
    const empty = walletWithPlan('0', 'free');
    mockedFetch
      .mockResolvedValueOnce({ ...empty, source: 'daemon_cache' })
      .mockResolvedValueOnce(empty);

    await expect(checkAmrBalanceGate(undefined, MODEL_ID)).resolves.toEqual({
      kind: 'hard',
      reason: 'insufficient',
      snapshot: expect.objectContaining({ balanceUsd: '0' }),
    });
  });

  it('$1.79 这条路上同样一次套餐读数都不发', async () => {
    mockedFetch.mockResolvedValueOnce(walletWithPlan(REPORTED_BALANCE, 'pro'));

    await checkAmrBalanceGate(undefined, MODEL_ID);

    expect(mockedFetchStatus).not.toHaveBeenCalled();
  });
});
