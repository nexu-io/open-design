// @vitest-environment jsdom
/**
 * 红测:对话里**不出**原始的 error 状态行。
 *
 * 用户 2026-08-27 指认了两次:「为什么还会有这种错误样式?? 你的错误卡片呢??」
 * 「为什么会有这种状态行??设计稿里哪有这种状态行」。
 *
 * 屏幕上那一条是 `.status-pill.is-error`:一个红框,里面写着
 * 「● error The selected model is no longer available.」—— 上游英文原文,
 * 直接戳在回答中间。
 *
 * 它原来只在「这条消息正好拥有报错卡」时才藏(`message.id === errorCardOwnerId`),
 * 所以**任何历史失败轮次**都还照旧戳出来。稿子里根本没有这种行:
 *  · 出事了由**报错卡**说(当前那一轮),
 *  · 历史轮次由壳头那句「运行失败」说,
 *  · 上游原文归卡上的「查看详情」,不该裸奔。
 *
 * `warning` 和 `initializing` 早就按同样的道理去掉了,`error` 是漏网的那一档。
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (k: string) => k }),
  useT: () => ((k: string) => k),
}));

afterEach(() => cleanup());

const failedTurn = (): ChatMessage =>
  ({
    id: 'assistant-old',
    role: 'assistant',
    content: '',
    createdAt: 1,
    endedAt: 2,
    runId: 'run-old',
    runStatus: 'failed',
    agentId: 'amr',
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: 'The selected model is no longer available.',
        code: 'AMR_MODEL_UNAVAILABLE',
      },
    ],
  }) as unknown as ChatMessage;

describe('对话里不出原始 error 状态行', () => {
  it('never renders the raw error pill, even on a historical failed turn', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={failedTurn()}
        streaming={false}
        projectId="project-1"
      />,
    );
    expect(
      container.querySelector('[data-testid="status-pill"][data-status="error"]'),
      '设计稿里没有这种状态行',
    ).toBeNull();
    expect(
      container.textContent,
      '上游英文原文不该裸奔在对话里',
    ).not.toContain('The selected model is no longer available.');
  });
});
