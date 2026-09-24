/**
 * Product-approved copy: L7ukd6xcqoWpo2xJzKdcDPctnvh, revision 96 (2026-09-14).
 * Exercise the real failure routing and description resolver, then translate its
 * result. Expected prose is copied from product, never read from the dictionary.
 * Git Bash, the three blank rows, action-blocked presentation, and the separate
 * region-classification candidate are deliberately outside this test's scope.
 */
import { describe, expect, it } from 'vitest';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import type { Dict } from '../../src/i18n/types';
import {
  resolveRunErrorCardDescription,
  resolveRunFailureUi,
  RUN_FAILURE_FALLBACK_MESSAGE_KEY,
} from '../../src/runtime/amr-guidance';

function translate(key: keyof Dict, vars: Record<string, string | number> = {}): string {
  return zhCN[key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    vars[name] === undefined ? placeholder : String(vars[name]),
  );
}

function failureCopy(code: string, detail?: string, agent = 'amr', raw = 'private diagnostic') {
  const ui = resolveRunFailureUi(code, detail, agent, raw);
  const vars = {
    agent: 'Claude',
    ...(ui.messageCauseKey ? { cause: translate(ui.messageCauseKey) } : {}),
    ...ui.messageVars,
  };
  const description = resolveRunErrorCardDescription({
    handedToAnotherSurface: ui.suppressCard === true,
    mappedMessageKey: ui.messageKey,
    paneError: null,
    paneErrorCameFromARun: false,
    failedRunRawDetail: raw,
    turnEndedInTerminalFailure: true,
  });
  return {
    ui,
    title: translate(ui.titleKey, vars),
    body: description.render === 'mapped'
      ? translate(description.messageKey, vars)
      : description.render === 'fallback'
        ? translate(RUN_FAILURE_FALLBACK_MESSAGE_KEY)
        : description.render === 'app-text' ? description.text : null,
  };
}

const GENERIC_TITLE = '任务未能完成';
const GENERIC_BODY = '本次任务运行失败，请重试。如果再次失败，请联系支持。';
const CONTEXT_BODY = '当前上下文已超出模型可处理的长度，请新建对话后再试。';

interface ProductCase {
  scenario: string;
  code: string;
  detail?: string;
  title: string;
  body: string;
}

const cases: ProductCase[] = [
  {
    scenario: '操作陷入循环', code: 'TOOL_LOOP_DETECTED',
    title: '任务无法继续',
    body: 'AI 在处理任务时卡在了同一个步骤，多次尝试后仍无法继续。请重试，或更换模型后再试。',
  },
  {
    scenario: '没有任何输出', code: 'AGENT_EXECUTION_FAILED', detail: 'empty_output',
    title: '未能生成内容', body: 'AI 未能生成内容，请重新发起任务，或更换模型后再试。',
  },
  {
    scenario: '会话已过期', code: 'AGENT_EXECUTION_FAILED', detail: 'session_resume_expired',
    title: '无法继续上一次任务', body: '上一次任务已无法继续运行，请重新发起任务。',
  },
  {
    scenario: '处理器不支持', code: 'AGENT_EXECUTION_FAILED', detail: 'cpu_unsupported',
    title: '当前设备无法运行此程序', body: '这台电脑的处理器不支持程序所需的功能，请使用符合运行要求的设备。',
  },
  {
    scenario: '智能体版本不兼容', code: 'AGENT_CLI_SESSION_REFUSED',
    title: '智能体版本不兼容', body: 'Open Design 暂不支持当前智能体版本，请更换为支持的版本后再试。',
  },
  {
    // The table's old scenario label says busy, but its approved prose and the
    // original decision document describe context length, not a quota window.
    scenario: '上下文超出模型长度', code: 'AGENT_PROMPT_TOO_LARGE',
    title: '对话内容过长', body: CONTEXT_BODY,
  },
  {
    scenario: '公司网络安全证书', code: 'AGENT_EXECUTION_FAILED', detail: 'certificate_failure',
    title: '无法安全连接服务', body: '连接服务时未通过安全验证，请尝试更换网络。',
  },
  {
    scenario: '代理设置错误', code: 'AGENT_EXECUTION_FAILED', detail: 'proxy_configuration',
    title: '无法连接代理', body: '当前设置的代理无法连接，请确认代理已开启、设置正确后再试。',
  },
  {
    scenario: '断网或域名解析失败', code: 'AGENT_EXECUTION_FAILED', detail: 'network_configuration',
    title: '无法连接服务', body: '暂时无法访问服务，请检查网络连接后再试。',
  },
  {
    scenario: 'Windows 安全策略阻止启动', code: 'AGENT_EXECUTION_FAILED', detail: 'host_policy_block',
    title: '程序启动受限', body: 'Windows 阻止了程序启动，请检查系统的安全设置。',
  },
  {
    scenario: '磁盘写入失败', code: 'AGENT_EXECUTION_FAILED', detail: 'local_storage_failure',
    title: '无法保存文件', body: '文件无法写入磁盘。请确认有足够的剩余空间，且有权限保存到当前文件夹。',
  },
  {
    scenario: '未分类任务失败', code: 'AGENT_EXECUTION_FAILED',
    title: GENERIC_TITLE, body: GENERIC_BODY,
  },
  ...[
    'od_next_protocol_runtime_state_missing',
    'od_next_protocol_runtime_state_duplicate',
    'od_next_protocol_runtime_state_invalid_json',
    'od_next_protocol_runtime_state_invalid_schema',
  ].map((code) => ({
    scenario: `回复未记录：${code}`, code, title: GENERIC_TITLE, body: GENERIC_BODY,
  })),
  {
    scenario: '当前套餐不支持', code: 'AMR_TIER_UPGRADE_REQUIRED',
    title: '当前套餐不支持此任务', body: '当前套餐无法继续此任务，请升级套餐后重试。',
  },
];

describe('补充场景使用产品批准的标题和正文', () => {
  it.each(cases)('$scenario', ({ code, detail, title, body }) => {
    const copy = failureCopy(code, detail);
    expect({ title: copy.title, body: copy.body }).toEqual({ title, body });
  });

  it('API 空回复的既有状态标题使用批准标题，不新增报错卡', () => {
    expect(translate('assistant.emptyResponseLabel')).toBe(GENERIC_TITLE);
  });

  it('API 空回复的现有正文使用同一批准文案，不要求新增报错卡', () => {
    expect(translate('assistant.emptyResponseMessage')).toBe(GENERIC_BODY);
  });
});

describe('文案修订不能更改错误成因和恢复能力', () => {
  it('滚动额度窗口仍描述等待重置，不能冒充 context 长度', () => {
    const copy = failureCopy('RATE_LIMITED', 'model_window_limit', 'amr',
      'You have reached the 5-hour usage limit for Kimi K2.6. Try again after 2026-08-12T06:34:47Z. This request was not charged to Wallet Credits.');
    expect(copy.title).toBe('高峰期繁忙');
    expect(copy.body).toBe('高峰期繁忙，请在 2026-08-12T06:34:47Z 后尝试（本次请求未扣费）');
    expect(copy.ui.primaryAction).toBe('retry');
  });

  it('上游过载保持模型服务不可用语义', () => {
    const copy = failureCopy('AGENT_EXECUTION_FAILED', 'provider_high_demand');
    expect(copy.title).toBe('模型服务暂不可用');
    expect(copy.body).toBe('当前模型暂不可用，请稍后再试，或更换模型。');
  });

  it('Antigravity 未登录仍有终端登录入口与 Cloud 入口', () => {
    const ui = resolveRunFailureUi('AGENT_AUTH_REQUIRED', null, 'antigravity');
    expect(ui.primaryAction).toBe('launch-terminal-auth');
    expect(ui.cloudSwitchCta).toBe(true);
  });

  it('Cloud 未登录仍有授权入口', () => {
    expect(resolveRunFailureUi('AMR_AUTH_REQUIRED', null, 'amr').primaryAction).toBe('authorize');
  });

  it('套餐升级保留升级与次级重试，不修改共享余额卡标题', () => {
    const ui = resolveRunFailureUi('AMR_TIER_UPGRADE_REQUIRED', null, 'amr');
    expect(ui.primaryAction).toBe('upgrade');
    expect(ui.secondaryRetry).toBe(true);
    expect(translate('chat.amrBalanceGate.title')).toBe('升级套餐，继续创作');
  });

  it('处理器不支持不会多出无效重试', () => {
    const ui = resolveRunFailureUi('AGENT_EXECUTION_FAILED', 'cpu_unsupported', 'amr');
    expect(ui.primaryAction).toBe('contact-support');
    expect(ui.secondaryRetry).toBe(false);
  });
});
