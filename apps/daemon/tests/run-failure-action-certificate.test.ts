/**
 * W23 · 权威侧的取证。
 *
 * 这里用的字符串是按 vela 的真实拼装方式复原的:
 *   - `apps/cli/internal/agent/opencode_client.go:875`
 *       fmt.Errorf("opencode session error: %s", string(props))
 *     —— 把 opencode `session.error` 的整个 `properties` JSON 原样带上
 *   - `apps/cli/internal/agent/acp_runtime.go:1176-1195`
 *       "opencode event stream: " + sanitized(...)  再包一层,截断到 1024
 * 所以 opencode 的报错原文会到达 daemon 的分类器。
 *
 * 其中 "unknown certificate verification error" 不是证书问题:Bun 1.3 在 TLS
 * 握手途中被对端关掉连接(代理、防火墙、杀软掐断)时,拿到的是非证书错误号,
 * 落进 X509 码表的兜底分支才得到这句话(bun-v1.3.14
 * `src/boringssl_sys/boringssl.zig` getCertErrorFromNo)。同一种掐断如果是
 * RST,报的是 ECONNRESET。它和真正的证书拒绝(自签名、中间人换证书)要分开。
 */
import { describe, expect, it } from 'vitest';

import { classifyRunFailure } from '../src/run-failure-classification.js';

/** 按 vela 的拼装把 opencode `session.error` 还原成 daemon 实际看到的串。 */
function velaComposedError(message: string): string {
  return 'json-rpc id 4: opencode event stream: opencode session error: '
    + `{"error":{"name":"UnknownError","data":{"message":"${message}"}},`
    + '"sessionID":"ses_f9fc233a6ffeN3RYnzUhQR5V4E"} (event=session.error, session=ses_f9fc233a6ffeN3RYnzUhQR5V4E)';
}

/** BYOK / 本机 OpenCode 直接把 opencode 的 error 事件原样交给 daemon。 */
function openCodeRunError(message: string): string {
  return `${message}\n`
    + `{"type":"error","timestamp":1790689646587,"sessionID":"ses_f1297691effer2Qa7Nr9QT9gEw",`
    + `"error":{"name":"UnknownError","data":{"message":"${message}"}}}`;
}

function classify(error: string, agentId: string) {
  return classifyRunFailure({
    result: 'failed',
    status: {
      status: 'failed',
      error,
      errorCode: 'AGENT_EXECUTION_FAILED',
      exitCode: 1,
      signal: null,
    },
    errorCode: 'AGENT_EXECUTION_FAILED',
    agentId,
  });
}

describe('W23 · daemon 对证书类失败的权威判定', () => {
  it('把真正被拒绝的证书归成 certificate_failure,并判定不可重试、无动作可给', () => {
    const failure = classify(velaComposedError('self signed certificate'), 'amr');

    expect(failure?.failure_detail).toBe('certificate_failure');
    expect(failure?.retryable).toBe(false);
    expect(failure?.user_action).toBe('none');
  });

  it.each([
    ['AMR (vela)', 'amr', velaComposedError('unknown certificate verification error')],
    ['BYOK OpenCode', 'byok-opencode', openCodeRunError('unknown certificate verification error')],
    ['local OpenCode', 'opencode', openCodeRunError('unknown certificate verification error')],
    ['AMR after the OpenCode retry fix', 'amr', velaComposedError('TLS handshake interrupted')],
  ])('把 Bun 的握手被掐断(%s)归成可重试的连接中断', (_label, agentId, error) => {
    expect(classify(error, agentId)).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'stream_disconnected',
      retryable: true,
      user_action: 'retry',
    });
  });
});
