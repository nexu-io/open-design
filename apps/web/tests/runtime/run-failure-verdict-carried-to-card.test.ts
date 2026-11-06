/**
 * 「后端的裁决要送到报错卡上」—— 最后一米。
 *
 * 上游那一版(commit "give proxy and certificate failures the card the design
 * specifies")在 `amr-guidance.ts` 的兜底里开了一条分支:
 *
 *   后端命名了原因(`failureDetail !== 'unknown'`)且后端说重试没用
 *   (`retryable === false` 或 `failureAction === 'none'`)→ 才降档。
 *
 * 但那两个字段当时到不了前端 —— SSE `end` 帧不带、落库的 error 事件不带 ——
 * 所以那条分支恒不成立。这份规格钉住的是**运输**:
 * 一次失败的 run 的裁决,必须经由 `chat-events.ts` 落到那条 `status:error`
 * 事件上,再由 `daemonFailureVerdictFrom` 读回来喂给 `resolveRunFailureUi`。
 *
 * 三档必须分开钉住,因为把它们混成一档会削掉最该保留重试的那一格:
 *
 *  1. 后端命名 + 不可重试 → 卡片不再把〔重试〕当主按钮
 *  2. 后端命名 + 可重试   → 〔重试〕保留
 *  3. 字段缺席(老 daemon / 历史回放)→ 与今天逐字一致,仍是〔重试〕
 *
 * 第 3 档是硬要求而不是补充:分类器的兜底行是
 * `classification('unknown', 'unknown', 'finalize', retryableHint ?? false, …)`,
 * 真·未知默认就带 `retryable:false`。历史事件读出来是 undefined,必须走
 * 「后端没命名」这条老路,不能被当成「后端说不可重试」。
 */
import { describe, expect, it } from 'vitest';

import { appendErrorStatusEvent, runFailureFieldsFromError } from '../../src/runtime/chat-events';
import { daemonFailureVerdictFrom, resolveRunFailureUi } from '../../src/runtime/amr-guidance';
import type { ChatMessage } from '../../src/types';

const base: ChatMessage = { id: 'm1', role: 'assistant', content: '' };

/**
 * 普查(`specs/current/run-failure-action-mismatch-2026-09-02.md` A 类 47 格)里
 * 的一格真实原因:前端三张表都没有它,所以一定落到兜底那条分支。
 * 后端对它的裁定是 `retryable:false`(「装不上 / 起不来」那 8 格之一)。
 */
const UNMAPPED_FUTILE_DETAIL = 'spawn_enoexec';
/** 同样没有前端行,但后端认为可以重试的一格(上游 5xx)。 */
const UNMAPPED_TRANSIENT_DETAIL = 'upstream_5xx';

/** 把 daemon 送来的错误对象,按产品路径落成那条持久化的 `status:error` 事件。 */
function persistFailure(err: unknown, detail: string): ChatMessage {
  return appendErrorStatusEvent(
    base,
    detail,
    (err as { code?: string }).code,
    runFailureFieldsFromError(err),
  );
}

function errorEventOf(message: ChatMessage): Record<string, unknown> {
  const event = (message.events ?? []).find(
    (e) => e.kind === 'status' && e.label === 'error',
  );
  expect(event, 'message should carry a status:error event').toBeTruthy();
  return event as unknown as Record<string, unknown>;
}

function cardFor(message: ChatMessage) {
  const event = errorEventOf(message);
  return resolveRunFailureUi(
    event.code as string | undefined,
    event.failureDetail as string | undefined,
    'claude',
    event.detail as string | undefined,
    daemonFailureVerdictFrom(event),
  );
}

describe('daemon failure verdict reaches the error card', () => {
  it('档 1 · 后端命名且说重试没用 → 裁决落到事件上,卡片不再把〔重试〕当主按钮', () => {
    const err = Object.assign(new Error('agent exited with code 1'), {
      code: 'AGENT_EXECUTION_FAILED',
      failureCategory: 'process_exit',
      failureDetail: UNMAPPED_FUTILE_DETAIL,
      retryable: false,
      failureAction: 'none',
    });

    const message = persistFailure(err, 'agent exited with code 1');

    // 运输:两个字段都必须原样落在事件上。`retryable: false` 是假值,
    // 任何 `x ? {x} : {}` 形状的守卫都会在这里把它吃掉。
    expect(errorEventOf(message)).toMatchObject({
      failureDetail: UNMAPPED_FUTILE_DETAIL,
      retryable: false,
      failureAction: 'none',
    });

    // 判定:读回来之后,兜底那条分支才成立。
    expect(daemonFailureVerdictFrom(errorEventOf(message))).toEqual({
      retryable: false,
      failureAction: 'none',
    });
    expect(cardFor(message).primaryAction).not.toBe('retry');
  });

  it('档 2 · 后端命名但说可以重试 → 〔重试〕保留', () => {
    const err = Object.assign(new Error('upstream returned 503'), {
      code: 'AGENT_EXECUTION_FAILED',
      failureCategory: 'upstream_unavailable',
      failureDetail: UNMAPPED_TRANSIENT_DETAIL,
      retryable: true,
      failureAction: 'retry',
    });

    const message = persistFailure(err, 'upstream returned 503');

    expect(errorEventOf(message)).toMatchObject({
      failureDetail: UNMAPPED_TRANSIENT_DETAIL,
      retryable: true,
      failureAction: 'retry',
    });
    expect(cardFor(message).primaryAction).toBe('retry');
  });

  it('档 3 · 字段缺席的历史事件 → 行为与今天逐字一致,仍是〔重试〕', () => {
    // 老对话里落库的 error 事件只有 detail + code + 分类,没有裁决。
    const err = Object.assign(new Error('agent exited with code 1'), {
      code: 'AGENT_EXECUTION_FAILED',
      failureCategory: 'process_exit',
      failureDetail: UNMAPPED_FUTILE_DETAIL,
    });

    const message = persistFailure(err, 'agent exited with code 1');

    // 「没带」用精确相等钉住,不用否定式匹配:给函数加可选参数会让
    // `not.toHaveBeenCalledWith(...)` / `not.toMatchObject(...)` 恒真。
    expect(errorEventOf(message)).toEqual({
      kind: 'status',
      label: 'error',
      detail: 'agent exited with code 1',
      code: 'AGENT_EXECUTION_FAILED',
      failureCategory: 'process_exit',
      failureDetail: UNMAPPED_FUTILE_DETAIL,
    });
    expect(daemonFailureVerdictFrom(errorEventOf(message))).toBeUndefined();
    expect(cardFor(message).primaryAction).toBe('retry');
  });

  it('档 3b · 真·未知失败即使带着裁决也保留重试(分类器兜底默认就是 retryable:false)', () => {
    const err = Object.assign(new Error('something went wrong'), {
      code: 'AGENT_EXECUTION_FAILED',
      failureCategory: 'unknown',
      failureDetail: 'unknown',
      retryable: false,
      failureAction: 'none',
    });

    const message = persistFailure(err, 'something went wrong');

    // 裁决照样运输过去 —— 运输层不做产品判断。
    expect(errorEventOf(message)).toMatchObject({ retryable: false, failureAction: 'none' });
    // 但 `daemonNamedTheFailure` 这道前置判断把它挡在降档之外。
    expect(cardFor(message).primaryAction).toBe('retry');
  });
});
