/**
 * 余额不足时,**按身份 × 订阅**决定怎么呈现(规格
 * `specs/current/run-error-catalog.md` §6.V,2026-08-26 用户裁决)。
 *
 * 这一层是纯判据,不认识钱包,也**不决定拦不拦**。拦不拦在
 * `runtime/amr-balance-gate.ts`,「付费档余额 0 = 不限量,不拦」
 * (`error-ux-design.md` §3 / R-010 / OD #7190)是那一层的口径。
 * 这里只回答一个问题:**判定说该拦的时候,这个人该看到什么。**
 *
 * 卡片(交付稿组件 18 的 #75 / #76)永远保留,四组的差别只在
 * 「同时唤起什么弹窗、点了跳哪」:
 *
 * | 身份 × 订阅      | 卡片 | 弹窗                   | 点击行为                       |
 * |------------------|------|------------------------|--------------------------------|
 * | 非 Max · owner   | 保留 | 会员转化弹窗           | 卡和弹窗都跳 console 套餐页    |
 * | 非 Max · 非 owner| 保留 | 新弹窗:告知所有者充值 | ——                             |
 * | Max   · owner    | 保留 | **同一张**会员转化弹窗 | 卡和弹窗都跳自动充值           |
 * | Max   · 非 owner | 保留 | 同「非 Max · 非 owner」| ——                             |
 *
 * 第三格 2026-09-06 由 **T58** 定终态(规格
 * `specs/current/chat-panel-decisions-sheet.md`),推翻了它原来的「不弹窗」。
 * 依据是产品文档第四节第 3 行:那一格画的就是**和第一格同一张**会员转化弹窗,
 * 文案一字不差。所以两格共用一个 `AmrBalanceBlockedDialogKind`,唯一的差别落在
 * 主按钮的落点上 —— 见 `amrBalanceDialogUpgradeIntent`。
 *
 * 「Max」= **个人 Max 和团队 Max 都算**(用户修正),见 `isMaxPlanTier`。
 */
import type { WorkspaceBillingSummary, WorkspaceCollabContext } from '@open-design/contracts';

import { isMaxPlanTier, resolvePlanTier } from '../collab/team-plan';

/** 谁在看这张卡:能自己付钱的人,还是只能去找付钱的人。 */
export type AmrBalanceAudience = 'owner' | 'member';

/** 订阅档:Max(个人或团队)与其余。 */
export type AmrBalanceTier = 'max' | 'below_max';

export interface AmrBalanceBranch {
  tier: AmrBalanceTier;
  audience: AmrBalanceAudience;
}

/**
 * 拦截档同时唤起哪个弹窗。**两支,没有第三支**:
 *
 *   upgrade    — 会员转化弹窗。owner 那两格共用**同一张**(T58);它们的差别在
 *                主按钮的落点上,不在弹窗本身,见 `amrBalanceDialogUpgradeIntent`。
 *   ask_owner  — 「找所有者充值」。所有没有账单权限的成员。
 *
 * 这里曾经有第三支 `null`(「Max · owner 不弹窗」)。T58 把它去掉了 —— 留着一个
 * 谁都不会返回的 `null`,只会让每个调用点继续背一条 `?? 'upgrade'` 的兜底,
 * 而首页那条兜底正是把 Max 所有者送去套餐页的地方。
 */
export type AmrBalanceBlockedDialogKind = 'upgrade' | 'ask_owner';

/**
 * 卡上那颗 Upgrade 点下去要去哪。
 *
 *   pricing        — 现有的 plans 深链(`workspaceUpgradeUrl`)。
 *   auto_recharge  — vela web 端并唤起「团队自动充值」弹窗。
 *   ask_owner      — 不外跳:成员没有账单权限,给他「告知所有者」那张弹窗。
 *                    这一支同时也是 §6.Y 死胡同的出口 —— 在此之前,没有账单
 *                    权限的成员只拿得到一颗「暂不需要」。
 */
export type AmrBalanceUpgradeIntent = 'pricing' | 'auto_recharge' | 'ask_owner';

/**
 * 这个人能不能自己解决余额问题。
 *
 * 判据是 `permissions.canManageBilling`(契约 `buildWorkspacePermissions`:
 * `readable && role === 'owner'`),也就是 `workspaceUpgradeUrl` 用来决定
 * 「升级入口给不给」的同一个位。两处共用一个位,分支和链接就不会各说各话。
 *
 * 两个刻意的兜底:
 *
 * - **完全没有工作区上下文**(账号级 / 旧客户端)→ 按 owner。没有工作区身份可
 *   授权时,`workspaceUpgradeUrl` 本来就走 profile 兜底给出 plans 链接;这里
 *   跟着它,免得一个正常的个人账号突然被告知「去找你的所有者」。
 * - **个人工作区** → 一律按 owner。个人工作区没有第二个人可以找,把人推去
 *   「联系所有者」只是把一个死胡同换成另一个。
 */
export function resolveAmrBalanceAudience(
  context: WorkspaceCollabContext | null | undefined,
): AmrBalanceAudience {
  if (!context) return 'owner';
  if (context.permissions?.canManageBilling === true) return 'owner';
  if (context.workspaceType !== 'team') return 'owner';
  return 'member';
}

export interface AmrBalanceBranchSources {
  /**
   * 要付这笔钱的那个工作区 —— 项目页用的是 run 的 preflight 上下文(和余额门
   * 查的是同一个工作区),不是环境里恰好选中的那个。
   */
  context?: WorkspaceCollabContext | null;
  /**
   * 已经**按该工作区投影过**的账单摘要(`workspaceBillingSummaryForContext`)。
   * 手边没有就不用传:`context.planId` 报的是同一个原始 plan id,而档次只在
   * owner 这一支上有意义,owner 的 context 一定带着它(B 只对非 owner 省略
   * `planId` / `billingState`,而那一支两行的结论完全相同)。
   */
  billing?: WorkspaceBillingSummary | null;
  /** vela 登录态里的账号级 plan。团队工作区不采信,见下。 */
  accountPlan?: string | null;
}

export function resolveAmrBalanceBranch(
  sources: AmrBalanceBranchSources,
): AmrBalanceBranch {
  const context = sources.context ?? null;
  const tier = resolvePlanTier({
    billing: sources.billing ?? null,
    context,
    // 账号档次回答不了「这个团队工作区订了什么」。把它当权威正是把付费团队成员
    // 当成免费用户的那条老 bug(见 `resolvePlanTier` 的注释),所以团队工作区
    // 一律不采信;个人工作区的账号**就是**作用域,可以采信。
    accountPlan:
      context?.workspaceType === 'team' ? null : sources.accountPlan ?? null,
  });
  return {
    // 读不出档次时按「非 Max」走。那是今天的行为(升级弹窗 + Pricing),
    // 一次读数失败不该把人送进一个他可能根本没有的自动充值面板。
    tier: isMaxPlanTier(tier) ? 'max' : 'below_max',
    audience: resolveAmrBalanceAudience(context),
  };
}

export function amrBalanceBlockedDialog(
  branch: AmrBalanceBranch,
): AmrBalanceBlockedDialogKind {
  // 订阅档在这里**不参与判断**:两个 owner 格看到的是同一张会员转化弹窗(T58),
  // 分档只影响它的主按钮去哪。
  return branch.audience === 'member' ? 'ask_owner' : 'upgrade';
}

export function amrBalanceUpgradeIntent(
  branch: AmrBalanceBranch,
): AmrBalanceUpgradeIntent {
  if (branch.audience === 'member') return 'ask_owner';
  return branch.tier === 'max' ? 'auto_recharge' : 'pricing';
}

/**
 * 会员转化弹窗那颗主按钮的落点。
 *
 * 和卡上那颗共用 `amrBalanceUpgradeIntent` 这一个决策点 —— 产品文档第四节把卡和
 * 弹窗画成同一格的两件东西,两者跳去不同的地方是缺陷而不是特性。
 *
 * 这张弹窗只在 owner 那两格出现(成员走 `AmrOwnerTopUpDialog`),所以 `ask_owner`
 * 在这里**问不到**。真被问到时退回 `pricing`:那是不需要任何账单权限就能打开的
 * 那一个,比把一个没有权限的人送进自动充值面板安全。
 */
export function amrBalanceDialogUpgradeIntent(
  branch: AmrBalanceBranch,
): 'pricing' | 'auto_recharge' {
  return amrBalanceUpgradeIntent(branch) === 'auto_recharge' ? 'auto_recharge' : 'pricing';
}
