// @vitest-environment jsdom

/**
 * 分叉分界线的**位置**(2026-08-26 用户真机指认两次)。
 *
 * 1. 它落在**新会话**里,不是源会话 —— 点完分叉页面就跳到新会话,人此刻站在这里;
 *    那行「从上一个会话继续」也只有站在新会话里回看才说得通。
 *    盖标记的地方在 daemon 的 fork 分支(`routes/project/conversations.ts`)。
 * 2. 它是这一截上下文的**下边界**,所以必须排在这条消息的**最后** —— 回合状态行、
 *    下一步引导都属于上面那一轮,得在线的上面。原来它排在下一步引导之前,
 *    于是那三行落到了线下面,读起来像「新会话开口就给了三条建议」。
 */

import { cleanup, render } from '@testing-library/react';
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

function forkedTurn(): ChatMessage {
  return {
    id: 'seeded-tail',
    role: 'assistant',
    content: '两页都好了。',
    runStatus: 'succeeded',
    startedAt: 1700000000,
    endedAt: 1700000042,
    events: [] as ChatMessage['events'],
    producedFiles: [],
    forkedInto: { title: '商城原型', conversationId: 'src-conv' },
  } as unknown as ChatMessage;
}

describe('分叉分界线的位置', () => {
  // OPEND-2714 之后线上只有一样东西:分支图标配一行文案,住在线中间那一格。
  // 源会话标题不再上屏 —— 契约里的 `forkedInto.title` 没动,只是不渲染了。
  it('分界线里就一行文案,源会话标题不再上屏', () => {
    const { container } = render(
      <AssistantMessage
        message={forkedTurn()}
        streaming={false}
        isLast
        projectId="p1"
        errorCardOwnerId={null}
        onFeedback={vi.fn()}
      />,
    );
    const sep = container.querySelector('[data-testid="assistant-fork-divider"]');
    expect(sep).toBeTruthy();
    expect(sep!.textContent).not.toContain('商城原型');
    const note = container.querySelector('[data-testid="assistant-fork-note"]');
    expect(note).toBeTruthy();
    expect(sep!.contains(note!)).toBe(true);
  });

  it('分界线排在这条消息的**最后** —— 回合状态行在它上面', () => {
    const { container } = render(
      <AssistantMessage
        message={forkedTurn()}
        streaming={false}
        isLast
        projectId="p1"
        errorCardOwnerId={null}
        onFeedback={vi.fn()}
      />,
    );
    const sep = container.querySelector('[data-testid="assistant-fork-divider"]')!;
    const footer = container.querySelector('.assistant-footer');
    expect(footer).toBeTruthy();
    // 4 = DOCUMENT_POSITION_FOLLOWING:分界线排在状态行之后
    expect(footer!.compareDocumentPosition(sep) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('没分叉过就一条线都不出', () => {
    const plain = { ...forkedTurn(), forkedInto: undefined } as ChatMessage;
    const { container } = render(
      <AssistantMessage
        message={plain}
        streaming={false}
        isLast
        projectId="p1"
        errorCardOwnerId={null}
        onFeedback={vi.fn()}
      />,
    );
    expect(container.querySelector('[data-testid="assistant-fork-divider"]')).toBeNull();
  });
});
