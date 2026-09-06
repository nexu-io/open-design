// 红测:风控封号必须被分类成 `account_suspended`,而不是继续落进
// `fatal_rpc_error` / `execution_failed`。
//
// 依据:`specs/current/run-error-catalog.md` R-064「封号 account_suspended …
// 文案无正则 → 可重试「Task failed」… 卡(联系支持,不给 Retry)」,
// 以及 §6.Z 原则四那一句(「额度用完、账号被封、CPU 不支持这三类拿不到重试」)。
//
// 上游原文取自调研材料 `sources/vela-cli-error-surface.md:56-57`:
//   message: "Account temporarily suspended\nWe detected abnormal payment risk …"
//   data:    {"kind":"account_suspended","retryable":false}
//
// 没有这条分类,客户端的映射表就没有可挂的钩子 —— 报错卡上会挂一颗必然白点的
// 〔重试〕(违反设计原则四)。
import { describe, expect, it, vi } from 'vitest';

// 与 run-failure-classification.test.ts 同一套桩:这两个模块会把文本抢走,
// 桩住它们才能证明「封号是被新分支认出来的」,而不是被别人顺手认领的。
vi.mock('../src/integrations/vela-errors.js', () => ({
  classifyAmrAccountFailure: () => null,
}));

vi.mock('../src/runtimes/auth.js', () => ({
  classifyAgentServiceFailure: () => null,
}));

import {
  classifyRunFailure,
  type RunEventForFailureClassification,
} from '../src/run-failure-classification.js';

const SUSPENDED_MESSAGE =
  'Account temporarily suspended\nWe detected abnormal payment risk on this account and have temporarily suspended account access. If you believe this is a mistake, please contact support@open-design.ai and we will help investigate.';

function errorEvent(
  code: string,
  message: string,
): RunEventForFailureClassification {
  return {
    event: 'error',
    data: { message, error: { code, message } },
  };
}

function classify(code: string, message: string) {
  return classifyRunFailure({
    result: 'failed',
    status: {
      status: 'failed',
      error: message,
      errorCode: code,
      exitCode: 1,
      signal: null,
    },
    errorCode: code,
    agentId: 'amr',
    events: [errorEvent(code, message)],
  });
}

describe('封号(R-064)', () => {
  it('认出 vela 的封号原文,不再落进不透明的进程退出桶', () => {
    const result = classify('AGENT_EXECUTION_FAILED', SUSPENDED_MESSAGE);
    expect(result?.failure_detail).toBe('account_suspended');
    expect(result?.failure_category).toBe('auth');
  });

  it('不给重试,也不给任何「用户去做点什么」的动作', () => {
    const result = classify('AGENT_EXECUTION_FAILED', SUSPENDED_MESSAGE);
    // 重试必然同样结果 —— 原则四。
    expect(result?.retryable).toBe(false);
    expect(result?.user_action).toBe('none');
  });

  // ACP 桥有时只把结构化的 `data.kind` 带出来,句子反而丢了(反之亦然)。
  // 两条线索都要认,否则换一种链路就又静默掉回兜底。
  it('只带结构化 kind、没有那句英文时也认得', () => {
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      'rpc error: {"kind":"account_suspended","retryable":false}',
    );
    expect(result?.failure_detail).toBe('account_suspended');
  });

  // 反向:普通失败不许被这条分支误伤。
  it('不碰跟封号无关的失败', () => {
    const result = classify('AGENT_EXECUTION_FAILED', 'Error: spawn ENOENT');
    expect(result?.failure_detail).not.toBe('account_suspended');
  });
});
