/**
 * S30 · 证书类失败(以及整个 client-environment 家族)的按钮归属。
 *
 * 这份规格原来是红的(`run-failure-action-certificate.red.test.ts`,7/7 失败),
 * 只钉住「不能是〔重试〕」而不指定该给哪颗 —— 那颗按钮当时还没拍板。现在拍了
 * (`docs/design/run-errors/error-ux-design.md` S30),所以断言补全:主按钮是
 * 〔去设置〕、次按钮才是重试、文案是 S30 那一句。
 *
 * 事实链(每一步都在代码里可查):
 *
 *  1. vela 把 opencode 的 `session.error` 整个 `properties` JSON 塞进错误串
 *     (vela `apps/cli/internal/agent/opencode_client.go:875`),再包一层
 *     (`acp_runtime.go:1176-1195`),所以 "certificate" 这个词原样到达 daemon。
 *  2. daemon 认得它:`run-failure-classification.ts`
 *     `clientEnvironmentFailureDetail()` 命中 `/\b(certificate|...)\b/i`
 *     → `failure_detail = 'certificate_failure'`,并判定
 *     `retryable: false` / `user_action: 'none'`。
 *  3. web 曾经一个都不读,三张表里没有任何一行 client-environment detail,
 *     于是落到兜底 `failureCard({ transient: true }, ...)` → 主按钮 =〔重试〕。
 *  4. 而〔重试〕是整轮新 run(`ChatPane.tsx` onRetry 'manual_retry',
 *     catalogue 的 F3),企业代理拆包换证书这类确定性失败重跑多少次都一样。
 *
 * 产品侧的裁决:`specs/current/run-error-catalog.md` R-054 / R-097 / F8 行,
 * 用户动作是「打开设置(代理 / 证书)」;落点是设置 → 本地 CLI →
 * 「高级:代理与自定义路径」(`apps/daemon/src/runtimes/env.ts` 的 `configuredEnv`)。
 *
 * 注意〔重试〕**没有消失,只是降为次按钮** —— 上游那句
 * "unknown certificate verification error" 同时盖住了「中间人拆包」(必然失败)
 * 和「握手被丢包掐断」(抖动)两件事,设计因此故意保留重试。
 */
import { describe, expect, it } from 'vitest';

import { resolveRunFailureUi } from '../../src/runtime/amr-guidance';
import { en } from '../../src/i18n/locales/en';
import { zhCN } from '../../src/i18n/locales/zh-CN';

/**
 * daemon `clientEnvironmentFailureDetail()` 能产出的全部 detail
 * (`apps/daemon/src/run-failure-classification.ts`)。
 * 五个全部是 `retryable:false` + `user_action:'none'`。
 */
const CLIENT_ENVIRONMENT_DETAILS = [
  'host_policy_block',
  'local_storage_failure',
  'certificate_failure',
  'proxy_configuration',
  'network_configuration',
] as const;

/** 每一格自己的 `{cause}`,S30 那对括号里的内容。 */
const CAUSE_KEY_BY_DETAIL: Record<
  (typeof CLIENT_ENVIRONMENT_DETAILS)[number],
  string
> = {
  certificate_failure: 'chat.runError.clientEnvironmentCause.certificate',
  proxy_configuration: 'chat.runError.clientEnvironmentCause.proxy',
  network_configuration: 'chat.runError.clientEnvironmentCause.network',
  host_policy_block: 'chat.runError.clientEnvironmentCause.hostPolicy',
  local_storage_failure: 'chat.runError.clientEnvironmentCause.localStorage',
};

describe('S30 · daemon 判定不可重试的环境失败,卡片不能给〔重试〕主按钮', () => {
  it('certificate_failure(同事撞上的那一格)不该给〔重试〕', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'certificate_failure', 'amr');

    expect(ui.primaryAction).not.toBe('retry');
  });

  it('certificate_failure 该有自己的文案,而不是落兜底通用卡', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'certificate_failure', 'amr');

    expect(ui.titleKey).not.toBe('chat.runError.title.generic');
    expect(ui.messageKey).not.toBeNull();
  });

  it.each(CLIENT_ENVIRONMENT_DETAILS)(
    'client-environment detail %s 不该给〔重试〕',
    (detail) => {
      const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', detail, 'amr');

      expect(ui.primaryAction).not.toBe('retry');
    },
  );

  it.each(CLIENT_ENVIRONMENT_DETAILS)(
    '%s 的主按钮是〔去设置〕,次按钮才是重试',
    (detail) => {
      const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', detail, 'amr');

      expect(ui.primaryAction).toBe('open-settings');
      // 设计是故意保留重试的:上游同一句话里混着一类真·网络抖动。
      expect(ui.secondaryRetry).toBe(true);
      // 这一档不推 Cloud —— 用户的公司网络在 Cloud 那条路上一样在。
      expect(ui.showSwitchCard).toBe(false);
    },
  );

  it.each(CLIENT_ENVIRONMENT_DETAILS)('%s 用 S30 的标题与正文', (detail) => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', detail, 'amr');

    expect(ui.titleKey).toBe('chat.runError.title.clientEnvironment');
    expect(ui.messageKey).toBe('chat.runError.clientEnvironmentMessage');
    expect(ui.messageCauseKey).toBe(CAUSE_KEY_BY_DETAIL[detail]);
  });

  it('这张卡跟 agent 无关 —— 公司网络不挑智能体', () => {
    for (const agentId of ['amr', 'claude', 'codex', 'antigravity', null]) {
      const ui = resolveRunFailureUi(
        'AGENT_EXECUTION_FAILED',
        'certificate_failure',
        agentId,
      );
      expect(ui.primaryAction).toBe('open-settings');
    }
  });

  it('S30 的中文正文逐字照设计稿,并且不承诺「配好证书就能用」', () => {
    expect(zhCN['chat.runError.title.clientEnvironment']).toBe('网络环境不对');
    expect(zhCN['chat.runError.clientEnvironmentMessage']).toBe(
      '看起来走了代理或公司网络，{agent} 拒绝了请求（{cause}）。换一个网络出口，或在设置里调整代理。',
    );
    expect(zhCN['chat.runError.clientEnvironmentCause.certificate']).toBe('证书校验失败');
    expect(zhCN['chat.runError.openSettingsCta']).toBe('去设置');
    // 上游实测某些版本配了证书也没用,所以文案里不能出现这种承诺。
    for (const dict of [en, zhCN]) {
      const body = dict['chat.runError.clientEnvironmentMessage'];
      expect(body).not.toMatch(/安装证书|导入证书|install (?:the )?certificate/i);
    }
  });

  it('五格的 {cause} 各不相同,卡上不会五格一个说法', () => {
    const rendered = new Set(
      CLIENT_ENVIRONMENT_DETAILS.map(
        (detail) => zhCN[CAUSE_KEY_BY_DETAIL[detail] as keyof typeof zhCN],
      ),
    );
    expect(rendered.size).toBe(CLIENT_ENVIRONMENT_DETAILS.length);
  });
});

describe('兜底:后端命名过的失败,不再冒充「什么都不知道」', () => {
  it('后端也不知道是什么 —— 保持今天的行为,仍然给重试', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'unknown', 'claude');

    expect(ui.primaryAction).toBe('retry');
  });

  it('detail 缺席(老 daemon 什么都没分类)也仍然给重试', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', null, 'claude');

    expect(ui.primaryAction).toBe('retry');
  });

  it('后端命名了原因、且判了不可重试 —— 兜底不再给〔重试〕主按钮', () => {
    const ui = resolveRunFailureUi(
      'AGENT_EXECUTION_FAILED',
      'spawn_enoexec',
      'claude',
      null,
      { retryable: false, failureAction: 'none' },
    );

    expect(ui.primaryAction).not.toBe('retry');
  });

  it('failureAction 单独说 none 也算数(两个字段是分别写的)', () => {
    const ui = resolveRunFailureUi(
      'AGENT_EXECUTION_FAILED',
      'spawn_enoexec',
      'claude',
      null,
      { failureAction: 'none' },
    );

    expect(ui.primaryAction).not.toBe('retry');
  });

  it('后端命名了原因、但说还能重试 —— 重试留着', () => {
    const ui = resolveRunFailureUi(
      'AGENT_EXECUTION_FAILED',
      'upstream_5xx',
      'claude',
      null,
      { retryable: true, failureAction: 'retry' },
    );

    expect(ui.primaryAction).toBe('retry');
  });

  it('「真·未知」即便带着分类器的默认 retryable:false 也保留重试', () => {
    // 分类器最后那一行是 `classification('unknown','unknown','finalize',
    // retryableHint ?? false, retryableHint ? 'retry' : 'none')` —— 也就是说
    // 真·未知默认就带 retryable:false。若不先问「后端到底有没有命名」,
    // 读裁决反而会把这一格的重试削掉,正好削错人。
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'unknown', 'claude', null, {
      retryable: false,
      failureAction: 'none',
    });

    expect(ui.primaryAction).toBe('retry');
  });
});
