/**
 * R-003 / R-054 · 机器断网时,模型接口失败到底被归成了什么。
 *
 * 这里的字符串全部是实测抓的,不是照着源码推的。做法:把 claude CLI 的
 * `ANTHROPIC_BASE_URL` 指向一个解析不出来的域名(等价于机器断网后 DNS 先挂),
 * 真跑一轮 `claude -p --input-format stream-json --output-format stream-json`:
 *
 *   EXIT=1  ELAPSED=179s   stderr 全空
 *   stdout 末帧: {"type":"result","subtype":"success","is_error":true,
 *                 "terminal_reason":"api_error",
 *                 "result":"API Error: Can't reach the API server —
 *                           check your internet or DNS (ENOTFOUND)"}
 *
 * 同一轮再经过 daemon(POST /api/chat)跑一遍,SSE 上收到的是:
 *
 *   +184.2s error {"code":"AGENT_EXECUTION_FAILED","retryable":false,
 *                  "message":"API Error: Can't reach the API server — …(ENOTFOUND)"}
 *   +186.2s diagnostic {"type":"runtime_close","rpc_close_reason":"stream_error",…}
 *   +186.2s end   {"failureCategory":"process_exit","failureDetail":"stream_error",
 *                  "failureAction":"none","retryable":false}
 *
 * 对照组是同一台机器、同一个 agent、只把失败形态换成「连上了再断」
 * (假 Anthropic 端点先推两帧 SSE 再 destroy socket):那条走
 * `AGENT_CONNECTION_DROPPED` → `upstream_unavailable` / `stream_disconnected`
 * / `failureAction: 'retry'` / `retryable: true`,有专属卡有重试。
 *
 * 也就是说同一个物理原因(这台机器连不上模型接口),只因为 socket 有没有先建起来,
 * 一边落在「连接中断 + 重试」,另一边落在最后一档兜底 `stream_error`
 * —— 没有卡、没有按钮、正文是一句英文原始报错。
 *
 * `clientEnvironmentFailureDetail` 已经认得 ECONNREFUSED / ENETUNREACH,
 * 缺的就是「域名解析不出来 / 主机路由不到」这一类,而它们恰恰是断网后
 * **最先**出现的形态 —— 连接还没建起来,谈不上 reset。
 *
 * 期望:归到已有的 `network_configuration`(S30 客户端环境卡,cause 名词
 * 「网络连不上」,带〔去设置〕〔重试〕),而不是最后一档 `stream_error`。
 */
import { describe, expect, it } from 'vitest';

import { classifyRunFailure } from '../src/run-failure-classification.js';

/** daemon 侧实测:runtime_close 会把 rpc_close_reason 报成 stream_error。 */
const RUNTIME_CLOSE_STREAM_ERROR = {
  event: 'diagnostic',
  data: {
    type: 'runtime_close',
    rpc_close_reason: 'stream_error',
    status: 'failed',
    exit_code: 1,
  },
};

function classifyUnreachable(errorText: string) {
  return classifyRunFailure({
    result: 'failed',
    status: {
      status: 'failed',
      error: errorText,
      errorCode: 'AGENT_EXECUTION_FAILED',
      exitCode: 1,
      signal: null,
    },
    errorCode: 'AGENT_EXECUTION_FAILED',
    agentId: 'claude',
    events: [RUNTIME_CLOSE_STREAM_ERROR],
  });
}

describe('R-003 · 机器连不上模型接口(连接从未建立)', () => {
  it('把实测那条 DNS 解析失败归成 network_configuration,而不是兜底的 stream_error', () => {
    const failure = classifyUnreachable(
      "API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)",
    );

    expect(failure?.failure_detail).toBe('network_configuration');
  });

  it('覆盖「连接从未建立」的几种系统级形态', () => {
    const shapes = [
      // 现版 claude CLI(2.1.260)实测原文
      "API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)",
      // 旧版 claude CLI 的同一件事,仓库里已有一条测试钉着它此前返回 null
      'API Error: Unable to connect to API (ENOTFOUND)',
      // Node/undici 直出的 DNS 失败,codex / opencode 一类会原样打出来
      'getaddrinfo ENOTFOUND api.anthropic.com',
      // 断网瞬间 DNS 常见的临时性失败
      'getaddrinfo EAI_AGAIN api.anthropic.com',
      // 有 DNS 结果但路由不到(拔网线、切 VPN 的典型形态)
      'connect EHOSTUNREACH 160.79.104.10:443',
    ];

    for (const text of shapes) {
      expect(classifyUnreachable(text)?.failure_detail, text).toBe('network_configuration');
    }
  });

  it('不动「连上了再断」那条:它仍然是可重试的 stream_disconnected', () => {
    const failure = classifyRunFailure({
      result: 'failed',
      status: {
        status: 'failed',
        error:
          'Claude Code lost its connection to the configured custom Anthropic endpoint'
          + ' before the response finished.',
        errorCode: 'AGENT_CONNECTION_DROPPED',
        exitCode: 1,
        signal: null,
      },
      errorCode: 'AGENT_CONNECTION_DROPPED',
      agentId: 'claude',
      events: [RUNTIME_CLOSE_STREAM_ERROR],
    });

    expect(failure?.failure_detail).toBe('stream_disconnected');
    expect(failure?.failure_category).toBe('upstream_unavailable');
    expect(failure?.retryable).toBe(true);
  });
});
