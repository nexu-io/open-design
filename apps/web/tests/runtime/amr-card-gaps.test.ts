// 红测:AMR(默认托管 agent)不许被自己的分支吞掉后续的卡片映射。
//
// 现状(修之前全红):`resolveRunFailureUi` 的 `if (agentId === 'amr') { … }` 以
// `return failureCard({ transient: true }, 'chat.runError.title.generic', null)`
// 结尾。那一行是**整段 AMR 的 catch-all**,于是排在它后面的三层映射 ——
// `DETAIL_FAILURE_UI`、S11/S02/S17a/S09/S10 的 code 分流、以及兜底的 switch 卡
// —— 对 `agentId === 'amr'` 全部是死代码。
//
// 后果:8 条对别的 agent 都能出卡的失败,在**最常用的那个 agent 上**只能出
// 「任务执行失败」。逐条(设计稿 `docs/design/run-errors/error-ux-design.md`):
//
//   S11  AGENT_CONNECTION_DROPPED      连接断了
//   S02  AGENT_AUTH_REQUIRED           需要登录
//   S17a UNAUTHORIZED                  需要登录(授权失效)
//   S09  RATE_LIMITED                  频率限制
//   S10  UPSTREAM_UNAVAILABLE          服务暂时不可用
//   S08  detail hard_quota                     额度用完
//   S08  detail workspace_credits_exhausted    工作区额度用完
//   S01  detail cli_not_installed              命令行没装
//
// 反向对照同样是红测的一部分:AMR 自己那三张专属卡(需要登录 / 余额不足 /
// 升级套餐)必须**原样保留**。把分支删掉能让上面 8 条变绿,但会让这三条变红
// —— 两组断言合起来才钉得住「不再吞,但也没拆坏」。
//
// 第三组是结构不变式:`switch-to-cloud` / `showSwitchCard` 的语义是「推荐
// Open Design 智能体(= AMR)」。阶梯注释里已经写了「a run that is ALREADY on
// Cloud never trips rung 3」,但在 AMR 早退的年代那句话没有执行点。一旦让 AMR
// 往下走,它就必须真的成立,否则我们会当着 AMR 用户的面劝他切到 AMR。
import { describe, expect, it } from 'vitest';

import {
  resolveRunFailureUi,
  type RunFailureUi,
} from '../../src/runtime/amr-guidance';

/** 兜底那张卡的指纹:没有专属标题,也没有专属文案。 */
function isGenericFallback(ui: RunFailureUi): boolean {
  return ui.titleKey === 'chat.runError.title.generic' && ui.messageKey === null;
}

describe('AMR 分支不再吞掉后续映射', () => {
  // 每一行都钉到**具体的文案键**,不是「有卡就行」。只断言「不是兜底」的话,
  // 8 条失败糊成同一张错卡也能绿。
  const CASES: ReadonlyArray<{
    readonly scenario: string;
    readonly code: string;
    readonly detail: string | null;
    readonly titleKey: string;
    readonly messageKey: string;
    readonly primaryAction: string;
  }> = [
    {
      // S11:和模型服务的连接中途断开。断的是用户自己的网络路径,和 agent 是谁
      // 无关 —— 映射本身已经写着 "Agent-neutral",只是 AMR 走不到。
      scenario: 'S11 连接断了',
      code: 'AGENT_CONNECTION_DROPPED',
      detail: null,
      titleKey: 'chat.runError.title.connectionDropped',
      messageKey: 'chat.connectionDropped',
      primaryAction: 'retry',
    },
    {
      // S02:daemon 的分类器把 AMR_AUTH_REQUIRED / AGENT_AUTH_REQUIRED /
      // UNAUTHORIZED 归成同一类(`run-failure-classification.ts:765-777`,
      // category `auth`、user_action `login`)。web 这边只认前者,后两个落兜底。
      //
      // 落到 AMR 上时,正确的卡是 AMR 自己那张 —— AMR 的登录在应用内,一键就能
      // 做完(档 1 `authorize`)。**不是**非 AMR 那张「去终端跑登录命令」。
      scenario: 'S02 需要登录(AGENT_AUTH_REQUIRED)',
      code: 'AGENT_AUTH_REQUIRED',
      detail: null,
      titleKey: 'chat.runError.title.signInRequired',
      messageKey: 'chat.runError.signInMessage.amr',
      primaryAction: 'authorize',
    },
    {
      scenario: 'S17a 授权失效(UNAUTHORIZED)',
      code: 'UNAUTHORIZED',
      detail: null,
      titleKey: 'chat.runError.title.signInRequired',
      messageKey: 'chat.runError.signInMessage.amr',
      primaryAction: 'authorize',
    },
    {
      // S09:请求太频繁。文案对 AMR 一样成立(限的是上游供应商),只是不该顺手
      // 再劝一次 AMR —— 见下面的不变式那一组。
      scenario: 'S09 频率限制',
      code: 'RATE_LIMITED',
      detail: null,
      titleKey: 'chat.runError.title.rateLimited',
      messageKey: 'chat.runError.rateLimitedMessage',
      primaryAction: 'retry',
    },
    {
      // S10:服务暂时不可用。同一张卡今天已经能对 AMR 出 —— 但只在
      // `fatal_rpc_error` 那一条 detail 上(它排在 AMR 分支**之前**)。走 code
      // 这条线的 UPSTREAM_UNAVAILABLE 仍然被吞。
      scenario: 'S10 服务暂时不可用',
      code: 'UPSTREAM_UNAVAILABLE',
      detail: null,
      titleKey: 'chat.runError.title.upstreamUnavailable',
      messageKey: 'chat.runError.upstreamUnavailableMessage',
      primaryAction: 'retry',
    },
    {
      // S08:供应商额度用完。重试必然白点,所以档 2 不适用;而 AMR 已经在
      // Cloud 上,档 3(切到 Cloud)也不适用 —— 阶梯自己降到档 4。
      scenario: 'S08 额度用完(hard_quota)',
      code: 'AGENT_EXECUTION_FAILED',
      detail: 'hard_quota',
      titleKey: 'chat.runError.title.quotaExhausted',
      messageKey: 'chat.runError.quotaExhaustedMessage',
      primaryAction: 'contact-support',
    },
    {
      // S08 变体:工作区额度用完。daemon 自己给的 user_action 就是 `recharge`
      // (`run-failure-classification.ts:957`),而「充值」在 AMR 上是应用内一键
      // 能做完的动作 —— 档 1。非 AMR 那边它是档 3(去 Cloud),两边不一样。
      scenario: 'S08 工作区额度用完(workspace_credits_exhausted)',
      code: 'AGENT_EXECUTION_FAILED',
      detail: 'workspace_credits_exhausted',
      titleKey: 'chat.runError.title.quotaExhausted',
      messageKey: 'chat.runError.workspaceCreditsMessage',
      primaryAction: 'recharge',
    },
    {
      // S01:命令行没装,只能从文字里认出来(它是以 AGENT_EXECUTION_FAILED 进来
      // 的,不是 AGENT_UNAVAILABLE)。
      scenario: 'S01 命令行没装(cli_not_installed)',
      code: 'AGENT_EXECUTION_FAILED',
      detail: 'cli_not_installed',
      titleKey: 'chat.runError.title.cliMissing',
      messageKey: 'chat.runError.cliMissingMessage',
      primaryAction: 'retry',
    },
  ];

  it.each(CASES)(
    'AMR 也能拿到「$scenario」这张卡',
    ({ code, detail, titleKey, messageKey, primaryAction }) => {
      const ui = resolveRunFailureUi(code, detail, 'amr');
      expect(isGenericFallback(ui)).toBe(false);
      expect(ui.titleKey).toBe(titleKey);
      expect(ui.messageKey).toBe(messageKey);
      expect(ui.primaryAction).toBe(primaryAction);
    },
  );

  // 同一组失败在别的 agent 上的行为**一个字都不许变**。这一条是防「为了让 AMR
  // 变绿,顺手把共用的映射改了」——那会静默改掉所有 agent 的文案。
  it.each(CASES)(
    '别的 agent 在「$scenario」上的卡不受影响',
    ({ code, detail }) => {
      const ui = resolveRunFailureUi(code, detail, 'claude');
      expect(isGenericFallback(ui)).toBe(false);
    },
  );

  it('非 AMR 的「需要登录」仍然是「去终端登录」那张,并且仍然推荐 AMR', () => {
    const ui = resolveRunFailureUi('AGENT_AUTH_REQUIRED', null, 'claude');
    expect(ui.messageKey).toBe('chat.runError.signInMessage.other');
    expect(ui.showSwitchCard).toBe(true);
  });

  it('非 AMR 的额度用完仍然是档 3(切到 Cloud)', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'hard_quota', 'claude');
    expect(ui.primaryAction).toBe('switch-to-cloud');
    expect(ui.showSwitchCard).toBe(true);
  });

  it('非 AMR 的工作区额度用完仍然是档 3', () => {
    const ui = resolveRunFailureUi(
      'AGENT_EXECUTION_FAILED',
      'workspace_credits_exhausted',
      'claude',
    );
    expect(ui.primaryAction).toBe('switch-to-cloud');
  });

  // 充值是走应用外的(开控制台付款),回来时任务已经断了 —— 所以重试必须留在
  // 次级位上,和 AMR_INSUFFICIENT_BALANCE 那张卡一个道理。
  it('AMR 的工作区额度用完把重试留在次级位', () => {
    const ui = resolveRunFailureUi(
      'AGENT_EXECUTION_FAILED',
      'workspace_credits_exhausted',
      'amr',
    );
    expect(ui.secondaryRetry).toBe(true);
  });
});

describe('AMR 自己的三张专属卡没被拆坏', () => {
  it('AMR_AUTH_REQUIRED:应用内授权并自动重试', () => {
    const ui = resolveRunFailureUi('AMR_AUTH_REQUIRED', null, 'amr');
    expect(ui.primaryAction).toBe('authorize');
    expect(ui.titleKey).toBe('chat.runError.title.signInRequired');
    expect(ui.messageKey).toBe('chat.runError.signInMessage.amr');
  });

  it('AMR_INSUFFICIENT_BALANCE:去充值 + 次级重试', () => {
    const ui = resolveRunFailureUi('AMR_INSUFFICIENT_BALANCE', null, 'amr');
    expect(ui.primaryAction).toBe('recharge');
    expect(ui.titleKey).toBe('chat.runError.title.balance');
    expect(ui.messageKey).toBe('chat.amrError.balanceMessage');
    expect(ui.secondaryRetry).toBe(true);
  });

  it('AMR_TIER_UPGRADE_REQUIRED:升级套餐 + 次级重试', () => {
    const ui = resolveRunFailureUi('AMR_TIER_UPGRADE_REQUIRED', null, 'amr');
    expect(ui.primaryAction).toBe('upgrade');
    expect(ui.titleKey).toBe('chat.amrBalanceGate.title');
    expect(ui.messageKey).toBe(null);
    expect(ui.secondaryRetry).toBe(true);
  });

  // AMR 分支不再早退之后,「没人认领的失败」必须仍然落到同一张兜底卡上 ——
  // 不能因为往下走了就顺手捡走某个不该它捡的分流。
  it('没人认领的失败在 AMR 上仍然是兜底卡(档 2 重试)', () => {
    const ui = resolveRunFailureUi('SOME_UNCLASSIFIED_CODE', null, 'amr');
    expect(isGenericFallback(ui)).toBe(true);
    expect(ui.primaryAction).toBe('retry');
  });
});

describe('不变式:已经在 Cloud 上的 run 不许再被劝去 Cloud', () => {
  // 阶梯注释原文:「a run that is ALREADY on Cloud never trips rung 3, so it
  // degrades to the Cloud answer on its own — no second table」。在 AMR 早退的
  // 年代这句话没有执行点(AMR 根本走不到档 3);让它往下走之后,这句话要么真的
  // 成立,要么就会当着 AMR 用户的面推荐 AMR。
  //
  // 覆盖面故意开得比上面那 8 条宽:任何 code × 任何 detail,只要 agent 是 AMR,
  // 两件事都不许发生。糊一张错卡也逃不掉这一条。
  const CODES = [
    'AGENT_CONNECTION_DROPPED',
    'AGENT_AUTH_REQUIRED',
    'UNAUTHORIZED',
    'RATE_LIMITED',
    'UPSTREAM_UNAVAILABLE',
    'AGENT_EXECUTION_FAILED',
    'AMR_AUTH_REQUIRED',
    'AMR_INSUFFICIENT_BALANCE',
    'AMR_TIER_UPGRADE_REQUIRED',
    'SOME_UNCLASSIFIED_CODE',
  ] as const;
  const DETAILS = [
    null,
    'hard_quota',
    'workspace_credits_exhausted',
    'cli_not_installed',
    'fatal_rpc_error',
    'account_suspended',
    'process_crashed',
  ] as const;

  it('AMR 上的任何失败都不会推荐切到 Open Design 智能体', () => {
    const offenders: string[] = [];
    for (const code of CODES) {
      for (const detail of DETAILS) {
        const ui = resolveRunFailureUi(code, detail, 'amr');
        if (ui.showSwitchCard || ui.primaryAction === 'switch-to-cloud') {
          offenders.push(
            `${code} / ${detail ?? 'null'} → primary=${ui.primaryAction} switchCard=${ui.showSwitchCard}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // 反向:这条不变式只对 AMR 生效。别的 agent 的推荐卡是产品要的,不许被顺手
  // 关掉 —— 否则「不变式」会变成一次静默的全局降级。
  it('别的 agent 该推荐时照旧推荐', () => {
    expect(resolveRunFailureUi('RATE_LIMITED', null, 'claude').showSwitchCard).toBe(true);
    expect(resolveRunFailureUi('UPSTREAM_UNAVAILABLE', null, 'claude').showSwitchCard).toBe(
      true,
    );
    expect(
      resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'hard_quota', 'claude').showSwitchCard,
    ).toBe(true);
  });
});
