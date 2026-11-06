/**
 * W23 · 权威侧的取证(这一半今天是**绿**的)。
 *
 * 配套的红测在 `apps/web/tests/runtime/run-failure-action-certificate.red.test.ts`。
 * 两边合起来说明的是同一件事:daemon 早就算对了,web 没读。
 *
 * 这里用的字符串是按 vela 的真实拼装方式复原的:
 *   - `apps/cli/internal/agent/opencode_client.go:875`
 *       fmt.Errorf("opencode session error: %s", string(props))
 *     —— 把 opencode `session.error` 的整个 `properties` JSON 原样带上
 *   - `apps/cli/internal/agent/acp_runtime.go:1176-1195`
 *       "opencode event stream: " + sanitized(...)  再包一层,截断到 1024
 * 所以 "certificate" 这个词会原样到达 daemon 的分类器。
 */
import { describe, expect, it } from 'vitest';

import { classifyRunFailure } from '../src/run-failure-classification.js';

/** 同事现场那条 opencode 事件,按 vela 的拼装还原成 daemon 实际看到的串。 */
const VELA_COMPOSED_ERROR_TEXT =
  'json-rpc id 4: opencode event stream: opencode session error: '
  + '{"error":{"name":"UnknownError","data":{"message":"unknown certificate verification error"}},'
  + '"sessionID":"ses_f9fc233a6ffeN3RYnzUhQR5V4E"} (event=session.error, session=ses_f9fc233a6ffeN3RYnzUhQR5V4E)';

describe('W23 · daemon 对证书类失败的权威判定', () => {
  it('把它归成 certificate_failure,并判定不可重试、无动作可给', () => {
    const failure = classifyRunFailure({
      result: 'failed',
      status: {
        status: 'failed',
        error: VELA_COMPOSED_ERROR_TEXT,
        errorCode: 'AGENT_EXECUTION_FAILED',
        exitCode: 1,
        signal: null,
      },
      errorCode: 'AGENT_EXECUTION_FAILED',
      agentId: 'amr',
    });

    expect(failure?.failure_detail).toBe('certificate_failure');
    // 这两条就是 web 没读的那两个信号。
    expect(failure?.retryable).toBe(false);
    expect(failure?.user_action).toBe('none');
  });
});
