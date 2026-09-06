import { describe, expect, it } from 'vitest';
import {
  daemonFailureVerdictFrom,
  resolveRunFailureUi,
} from '../../src/runtime/amr-guidance';

/*
 * 用户实测(打包版 0.21.1-beta.7,2026-09-06 20:41,run 4c91590e):
 * 跑 Codex,壳头「运行失败 13s」,底下一张写着「任务执行失败 / 这次没能顺利完成」
 * 的泛化卡,只有〔联系支持〕〔导出日志〕两个动作。
 *
 * 但 daemon 那一侧**早就把病因说清楚了**。同一条 run 的 `end` 帧:
 *
 *   failureCategory: 'model_unavailable'
 *   failureDetail:   'cli_version_incompatible'
 *   failureAction:   'switch_model'
 *   retryable:       false
 *   error.code:      'AGENT_EXECUTION_FAILED'
 *   error.message:   "The 'gpt-6-astra' model requires a newer version of Codex…"
 *
 * 也就是说:病因(模型这个 CLI 版本带不动)和处方(换个模型)daemon 都算出来了,
 * 分类器 `run-failure-classification.ts` 的 `modelUnavailableDetail()` 就是靠
 * 「requires a newer version of codex」这条正则命中的。
 *
 * 界面上这两样一样都没到。原因是 `amr-guidance.ts` 的三张查找表里,
 * `model_unavailable` 这一族的 failure_detail 一行都没有 ——
 * `cli_version_incompatible` / `model_not_found` / `model_not_supported` /
 * `model_disabled` / `local_model_not_loaded` 全都查不到。
 * 唯一那张「模型不可用」卡挂在**错误码** `AMR_MODEL_UNAVAILABLE` 上,
 * 而 BYOK agent(codex/claude/opencode…)的模型问题是以泛化的
 * `AGENT_EXECUTION_FAILED` + 细分 detail 的形状进来的,永远够不着那一行。
 *
 * 于是它一路掉到梯子第 4 档(daemon 命名了 + daemon 说重试没用 → 泛化卡 +
 * 联系支持),正好就是用户截图里那张。
 *
 * 注意:**没有重试按钮是对的**,不要顺手加回来。daemon 判的
 * `retryable: false` 是准的 —— 同一个 CLI 配同一个模型,重试必然同样失败。
 * 缺的是「说清楚是什么事」和「给出 daemon 已经开好的那副药」。
 *
 * 卡片文案和 `switch-model` 那颗按钮**都是现成的**:
 * `chat.runError.title.modelUnavailable` / `chat.runError.modelUnavailableMessage`
 * 19 个 locale 齐全,`switchModelWithGuidance()` 和 ChatPane 的
 * `chat-error-switch-model` 也都在。缺的只是三张表里的那几行。
 *
 * 这跟 b143b167a5 修的**不是**同一族:那一条的根因在 ProjectView 的
 * 服务端/本地消息对齐,把本地判决整个抹掉导致 `runFailureUi` 变成 null(一颗按钮
 * 都画不出来)。这里 `runFailureUi` 非 null —— 用户看得见〔联系支持〕〔导出日志〕,
 * 说明动作组正常渲染了,只是查表查空掉进了兜底。两处不同层、不同机制。
 */

/** 用户那条 run 的原始上游句子(只取错误文本,不含用户项目内容)。 */
const CODEX_CLI_TOO_OLD_MESSAGE =
  "The 'gpt-6-astra' model requires a newer version of Codex. "
  + 'Please upgrade to the latest app or CLI and try again.';

/**
 * daemon 实际写进 `end` 帧的裁决。
 *
 * ⚠️ `failureAction: 'switch_model'` 目前**不在** `RunFailureAction` 这个联合类型里
 * (`packages/contracts/src/api/chat.ts:50` 只有
 * relogin | recharge | upgrade | retry | none),但 daemon 确实是这么发的
 * (`run-failure-classification.ts` 的 user_action)。这里刻意走
 * `daemonFailureVerdictFrom()` 这条结构化读取路径 —— ChatPane 用的就是它 ——
 * 既复现真实数据,也把这个契约缺口钉在测试里。
 */
const CODEX_CLI_TOO_OLD_VERDICT = daemonFailureVerdictFrom({
  retryable: false,
  failureAction: 'switch_model',
});

describe('模型不可用:daemon 已经命名的病因,不该在界面上退回泛化卡', () => {
  it('复现 run 4c91590e:codex + cli_version_incompatible 应该出「模型不可用」而不是「任务执行失败」', () => {
    const ui = resolveRunFailureUi(
      'AGENT_EXECUTION_FAILED',
      'cli_version_incompatible',
      'codex',
      CODEX_CLI_TOO_OLD_MESSAGE,
      CODEX_CLI_TOO_OLD_VERDICT,
    );

    // 病因要说出来。掉进兜底的标志就是这个 generic 标题 + messageKey 为 null
    // (渲染时替换成 RUN_FAILURE_FALLBACK_MESSAGE_KEY 那句「这次没能顺利完成」)。
    expect(ui.titleKey).not.toBe('chat.runError.title.generic');
    expect(ui.titleKey).toBe('chat.runError.title.modelUnavailable');
    expect(ui.messageKey).toBe('chat.runError.modelUnavailableMessage');

    // 处方要给出来:daemon 说的是 switch_model,不是 contact-support。
    expect(ui.primaryAction).toBe('switch-model');

    // 重试确实不该有 —— daemon 判了 retryable:false,这一条不是回归项。
    expect(ui.primaryAction).not.toBe('retry');
    expect(ui.secondaryRetry).toBe(false);
  });

  /*
   * 同一族的其余 detail 走的是同一条路(`modelUnavailableDetail()` 的四个返回值
   * 加上 AMR 那条),一起钉住,免得只补了用户撞到的那一行、剩下的继续掉兜底。
   */
  it.each([
    'cli_version_incompatible',
    'model_not_found',
    'model_not_supported',
    'model_disabled',
    'local_model_not_loaded',
  ])('model_unavailable 一族的 detail「%s」都要命中同一张卡', (detail) => {
    for (const agent of ['codex', 'claude', 'byok-opencode', 'antigravity', null]) {
      const ui = resolveRunFailureUi(
        'AGENT_EXECUTION_FAILED',
        detail,
        agent,
        null,
        CODEX_CLI_TOO_OLD_VERDICT,
      );
      expect(ui.titleKey, `agent=${agent} detail=${detail}`).toBe(
        'chat.runError.title.modelUnavailable',
      );
      expect(ui.primaryAction, `agent=${agent} detail=${detail}`).toBe('switch-model');
    }
  });

  /*
   * 反向对照:daemon 什么都没认出来的时候,兜底那档必须原样保留(还带 retry)。
   * 上面那几行不能顺手把整个兜底改掉。
   */
  it('daemon 没命名的失败仍然走兜底 + 保留重试', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'unknown', 'codex');
    expect(ui.titleKey).toBe('chat.runError.title.generic');
    expect(ui.primaryAction).toBe('retry');
  });

  /*
   * 约束一:这一族**一颗重试按钮都不许有**,而且这个判断不许挂在 daemon 的裁决上。
   *
   * 为什么刻意不传 verdict:`retryable` / `failureAction` 这两个字段**今天还没上线**
   * (`RunFailureDaemonVerdict` 的注释写了:SSE `end` 帧 / `PersistedAgentEvent` /
   * `markErrorRunFailure` / `appendErrorStatusEvent` 四处都还没带),所以真实链路上
   * 这一族大多数时候是**裸着**到这儿的。裸着的时候旧代码走的是最后那行
   * `failureCard({ transient: true }, generic, null)` —— 也就是**发一颗重试**,
   * 正是设计原则四禁止的那颗。查表这一档必须自己就说得清,不能等 daemon 补契约。
   *
   * 这条同时钉住反向的风险:把行写成 `retryWithGuidance()` 而不是
   * `switchModelWithGuidance()` 也会当场变红 —— 标题一样,但按钮变成 retry。
   */
  it.each([
    'cli_version_incompatible',
    'model_not_found',
    'model_not_supported',
    'model_disabled',
    'local_model_not_loaded',
  ])('「%s」即使 daemon 没带裁决字段,也不许出现重试按钮', (detail) => {
    for (const agent of ['codex', 'claude', 'byok-opencode', 'antigravity', null]) {
      // 注意:第五个参数(verdict)故意不传,模拟今天真实的线上形状。
      const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', detail, agent);

      expect(ui.titleKey, `agent=${agent} detail=${detail}`).toBe(
        'chat.runError.title.modelUnavailable',
      );
      // 主按钮是〔更换模型〕,不是〔重试〕。
      expect(ui.primaryAction, `agent=${agent} detail=${detail}`).toBe('switch-model');
      expect(ui.primaryAction, `agent=${agent} detail=${detail}`).not.toBe('retry');
      // 也不许从副位偷偷塞回来。
      expect(ui.secondaryRetry, `agent=${agent} detail=${detail}`).toBe(false);
    }
  });

  /*
   * 约束二:AMR 那条**已有的**路径必须原样不动。
   *
   * 它走的是错误码 `AMR_MODEL_UNAVAILABLE`,在 `AGENT_AGNOSTIC_FAILURE_UI` 里,
   * 解析顺序上排在 `AGENT_AGNOSTIC_DETAIL_FAILURE_UI` **之前**;上面新加的那几行
   * 是 detail 键,够不着它。
   *
   * 特意带一条 `detail: null`:daemon 给 `AMR_MODEL_UNAVAILABLE` 配的 detail 是
   * `model_not_found`(分类器 1059 行),而 `model_not_found` 现在也在 detail 表里了 ——
   * 于是「AMR 还好使」这件事可能只是因为两张表碰巧给同一张卡,而不是因为 code 那行还在。
   * detail 为空这一条把这层侥幸拆掉:它只可能由 code 那行答出来。撤掉
   * `AGENT_AGNOSTIC_FAILURE_UI` 的 `AMR_MODEL_UNAVAILABLE` 行,这一条当场红。
   */
  it('AMR 的 AMR_MODEL_UNAVAILABLE 仍由错误码那行答出,不依赖 detail', () => {
    for (const detail of [null, 'model_not_found']) {
      const ui = resolveRunFailureUi('AMR_MODEL_UNAVAILABLE', detail, 'amr');
      expect(ui.titleKey, `detail=${detail}`).toBe('chat.runError.title.modelUnavailable');
      expect(ui.messageKey, `detail=${detail}`).toBe(
        'chat.runError.modelUnavailableMessage',
      );
      expect(ui.primaryAction, `detail=${detail}`).toBe('switch-model');
      expect(ui.secondaryRetry, `detail=${detail}`).toBe(false);
      // 跑在 AMR 上的 run 不该被推销 AMR(`withoutCloudSelfPromotion` 的不变式)。
      expect(ui.showSwitchCard, `detail=${detail}`).toBe(false);
    }
  });
});
