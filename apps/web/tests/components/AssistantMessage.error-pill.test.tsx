// @vitest-environment jsdom

/**
 * The per-message gray "error" status pill is suppressed ONLY for the failed
 * run that ChatPane renders its top-level error card for (errorCardOwnerId).
 * Other failed turns — older history, or once a follow-up makes this no longer
 * the last assistant message — must keep their pill so the error detail still
 * survives reload / history review (regression: #3083 review).
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
});

afterEach(cleanup);

function failedMessage(): ChatMessage {
  return {
    id: 'msg-failed',
    role: 'assistant',
    content: '',
    runStatus: 'failed',
    startedAt: 1700000000,
    endedAt: 1700000005,
    events: [
      { kind: 'status', label: 'error', detail: 'boom-401' },
    ] as ChatMessage['events'],
    producedFiles: [],
  } as ChatMessage;
}

describe('AssistantMessage error-pill suppression', () => {
  /*
   * 这一族原来守的是「**只有**拥有报错卡的那条消息才藏 error 行」—— 也就是说
   * 其余任何一条失败消息都还把上游原文戳在对话里。用户 2026-08-27 指认了两次
   * (「为什么还会有这种错误样式?? 你的错误卡片呢??」「设计稿里哪有这种状态行」),
   * 裁决是**一律不出**:当前那一轮由报错卡说,历史轮次由壳头那句「运行失败」说,
   * 上游原文归卡上的「查看详情」。所以三条断言全部翻面。
   */
  it.each([
    ['nobody owns the card', null],
    ['another message owns it', 'some-other-message'],
    ['this message owns it', 'msg-failed'],
  ])('never renders the raw error detail — %s', (_name, owner) => {
    render(
      <AssistantMessage
        message={failedMessage()}
        streaming={false}
        projectId="p1"
        errorCardOwnerId={owner}
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.queryByText('boom-401')).toBeNull();
  });
});
