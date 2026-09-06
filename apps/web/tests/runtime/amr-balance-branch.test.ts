// 红测:余额不足的**身份 × 订阅**四种分支(规格 §6.V,2026-08-26 用户裁决)。
//
// 卡片永远保留,四组的差别只在「同时唤起什么弹窗、点了跳哪」:
//
//   非 Max · owner    卡 + 现有升级弹窗          卡和弹窗都跳 Pricing
//   非 Max · 非 owner 卡 + 新的「告知所有者」弹窗  不跳
//   Max   · owner     卡,不弹窗                跳 vela web 并唤起团队自动充值
//   Max   · 非 owner  卡 + 新的「告知所有者」弹窗  不跳
//
// 「Max」= 个人 Max 和团队 Max 都算(用户修正)。
//
// 这一层是**纯判据**:它不认识钱包,也不决定拦不拦 —— 拦不拦在
// `runtime/amr-balance-gate.ts`,「付费档余额 0 = 不限量,不拦」(#7190)是那一层
// 的口径,这里只回答「该拦的时候按什么身份呈现」。
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceBillingSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { describe, expect, it } from 'vitest';

import {
  amrBalanceBlockedDialog,
  amrBalanceUpgradeIntent,
  resolveAmrBalanceAudience,
  resolveAmrBalanceBranch,
} from '../../src/runtime/amr-balance-branch';
import { isMaxPlanTier, isTopPlanTier } from '../../src/collab/team-plan';

function context({
  role,
  ...overrides
}: Partial<WorkspaceCollabContext> & Pick<WorkspaceCollabContext, 'role'>): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-1',
    workspaceType: 'team',
    workspaceMemberId: 'member-1',
    role,
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 5, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState: 'active' }),
    ...overrides,
  } as WorkspaceCollabContext;
}

function billing(membershipTier: string): WorkspaceBillingSummary {
  return {
    workspaceId: null,
    membershipTier,
    totalAvailableCredits: 0,
    subscriptionCredits: 0,
    rechargeCredits: 0,
    balanceUsd: '0',
    subscriptionStatus: 'active',
    availableActions: [],
    workspaceBalance: null,
  };
}

describe('「Max」的判据:个人 Max 和团队 Max 都算', () => {
  it('个人 max 与 team_max 都是 Max', () => {
    expect(isMaxPlanTier('max')).toBe(true);
    expect(isMaxPlanTier('team_max')).toBe(true);
    expect(isMaxPlanTier('team_max_yearly')).toBe(true);
    expect(isMaxPlanTier('MAX')).toBe(true);
  });

  it('其它档不是 Max,读不到档次也不是', () => {
    expect(isMaxPlanTier('pro')).toBe(false);
    expect(isMaxPlanTier('team_pro')).toBe(false);
    expect(isMaxPlanTier('team_basic')).toBe(false);
    expect(isMaxPlanTier('free')).toBe(false);
    expect(isMaxPlanTier(null)).toBe(false);
    expect(isMaxPlanTier('')).toBe(false);
  });

  // `isTopPlanTier` 问的是另一个问题(「上面还有没有可升的」),个人 Max 之上还有
  // 整条团队梯子,所以它对个人 max 返回 false。两者不能互相顶替。
  it('和 isTopPlanTier 不是同一个问题', () => {
    expect(isTopPlanTier('max')).toBe(false);
    expect(isMaxPlanTier('max')).toBe(true);
  });
});

describe('身份判据:谁算 owner', () => {
  it('拿得到账单权限的就是 owner', () => {
    expect(resolveAmrBalanceAudience(context({ role: 'owner' }))).toBe('owner');
  });

  it('团队里的 admin / member 都不是 owner', () => {
    expect(resolveAmrBalanceAudience(context({ role: 'admin' }))).toBe('member');
    expect(resolveAmrBalanceAudience(context({ role: 'member' }))).toBe('member');
  });

  // 个人工作区没有「另一个所有者」可以找,把人推去「联系所有者」是新的死胡同。
  it('个人工作区一律按 owner 处理', () => {
    expect(
      resolveAmrBalanceAudience(
        context({ role: 'member', workspaceType: 'personal' }),
      ),
    ).toBe('owner');
  });

  // 没有工作区身份可授权时沿用今天的兜底(和 `workspaceUpgradeUrl` 一致)。
  it('完全没有工作区上下文时按 owner 兜底', () => {
    expect(resolveAmrBalanceAudience(null)).toBe('owner');
    expect(resolveAmrBalanceAudience(undefined)).toBe('owner');
  });
});

describe('四种分支', () => {
  it('非 Max · owner:卡 + 现有升级弹窗,都跳 Pricing', () => {
    const branch = resolveAmrBalanceBranch({
      context: context({ role: 'owner', planId: 'team_pro' }),
    });
    expect(branch).toEqual({ tier: 'below_max', audience: 'owner' });
    expect(amrBalanceBlockedDialog(branch)).toBe('upgrade');
    expect(amrBalanceUpgradeIntent(branch)).toBe('pricing');
  });

  it('非 Max · 非 owner:卡 + 告知所有者弹窗,不跳', () => {
    const branch = resolveAmrBalanceBranch({
      context: context({ role: 'member', planId: 'team_pro' }),
    });
    expect(branch).toEqual({ tier: 'below_max', audience: 'member' });
    expect(amrBalanceBlockedDialog(branch)).toBe('ask_owner');
    expect(amrBalanceUpgradeIntent(branch)).toBe('ask_owner');
  });

  it('Max · owner:只出卡不弹窗,点击跳自动充值', () => {
    const branch = resolveAmrBalanceBranch({
      context: context({ role: 'owner', planId: 'team_max' }),
    });
    expect(branch).toEqual({ tier: 'max', audience: 'owner' });
    expect(amrBalanceBlockedDialog(branch)).toBeNull();
    expect(amrBalanceUpgradeIntent(branch)).toBe('auto_recharge');
  });

  it('个人 Max · owner 与团队 Max 同档', () => {
    const branch = resolveAmrBalanceBranch({
      context: context({ role: 'owner', workspaceType: 'personal', planId: 'max' }),
    });
    expect(branch).toEqual({ tier: 'max', audience: 'owner' });
    expect(amrBalanceUpgradeIntent(branch)).toBe('auto_recharge');
  });

  it('Max · 非 owner:和非 Max 的成员同一条路', () => {
    const branch = resolveAmrBalanceBranch({
      context: context({ role: 'member', planId: 'team_max' }),
    });
    expect(branch).toEqual({ tier: 'max', audience: 'member' });
    expect(amrBalanceBlockedDialog(branch)).toBe('ask_owner');
    expect(amrBalanceUpgradeIntent(branch)).toBe('ask_owner');
  });
});

describe('档次读数的来源优先级', () => {
  it('工作区投影后的账单摘要压过 context 的 planId', () => {
    const branch = resolveAmrBalanceBranch({
      context: context({ role: 'owner', planId: 'team_pro' }),
      billing: billing('team_max'),
    });
    expect(branch.tier).toBe('max');
  });

  // 账号档次回答不了「这个团队工作区订了什么」——那正是把付费团队成员当免费用户
  // 的老毛病。团队工作区一律不采信账号读数。
  it('团队工作区不采信账号级档次', () => {
    const branch = resolveAmrBalanceBranch({
      context: context({ role: 'owner', planId: 'team_pro' }),
      accountPlan: 'max',
    });
    expect(branch.tier).toBe('below_max');
  });

  it('个人工作区可以采信账号级档次', () => {
    const branch = resolveAmrBalanceBranch({
      context: context({ role: 'owner', workspaceType: 'personal', planId: null }),
      accountPlan: 'max',
    });
    expect(branch.tier).toBe('max');
  });

  // 档次读不出来时按「非 Max」走 —— 那是今天的行为(升级弹窗 + Pricing),
  // 不会因为一次读数失败就把人送去一个他可能没有的自动充值面板。
  it('档次读不出来时退回非 Max', () => {
    const branch = resolveAmrBalanceBranch({ context: context({ role: 'owner' }) });
    expect(branch.tier).toBe('below_max');
    expect(amrBalanceBlockedDialog(branch)).toBe('upgrade');
  });
});
