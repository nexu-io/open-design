// @vitest-environment jsdom
/**
 * **一轮只剩「思考过程」时,底下那行也要有复制按钮。**
 *
 * 用户 2026-08-27 真机指认:「thought 也算能复制的吧? 为啥下面中止时没有复制按钮..」
 * 配图是一轮被手动中止:壳头「进行中 17s」,壳里只有一行「思考过程」,
 * 底下那行是「已手动停止」+ 一枚分叉图标 —— 复制按钮不在。
 *
 * 真因:判据只有一条 `message.content.trim().length > 0`。而推理走的是 `events`,
 * 从来不进 `content`(`ProjectView` 的 `textBuffer`:`kind === 'text'` 才
 * `appendContent`,`kind === 'thinking'` 只落 `events`)。一轮被停在模型还在想的
 * 时候,`content` 就是空的 —— 屏幕上明明摆着推理原文,按钮却整个不出。
 *
 * ⚠️ 负向对照(下面第二条)是这条测试的一半:**真的什么都没有的那一轮仍然没有按钮**。
 * 少了它,「无条件出按钮」也能把第一条蒙绿,而那意味着按下去复制一个空串。
 * 这一档是真实存在的:claude 经 daemon 送出的 thinking **全是空串**
 * (真实录制 1786 帧无一有字),那种轮次壳里只报「在想」、没有任何文字。
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import type { ChatMessage } from '../../../src/types';

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

function stoppedTurn(content: string, events: PersistedAgentEvent[]): ChatMessage {
  return {
    id: 'm-stop',
    role: 'assistant',
    content,
    runStatus: 'canceled',
    startedAt: 1700000000,
    endedAt: 1700000017,
    createdAt: 1700000017,
    events,
    producedFiles: [],
  } as unknown as ChatMessage;
}

function copyButtonOf(message: ChatMessage): Element | null {
  const { container } = render(
    <AssistantMessage
      message={message}
      streaming={false}
      isLast
      projectId="p1"
      errorCardOwnerId={null}
      onFeedback={vi.fn()}
      onForkFromMessage={vi.fn()}
    />,
  );
  return container.querySelector('[data-testid="assistant-copy-markdown"]');
}

describe('中止的一轮 · 只剩思考过程时也能复制', () => {
  it('正文一个字都没有、只有推理:复制按钮出来', () => {
    const el = copyButtonOf(stoppedTurn('', [
      { kind: 'thinking', text: '先把要改的几个文件理一遍,再决定从哪儿下手。' },
    ]));
    expect(el).toBeTruthy();
  });

  /** 负向对照:推理全是空串(claude 的真实形态)—— 屏幕上没有任何文字可复制 */
  it('推理全是空串、正文也空:仍然**没有**复制按钮', () => {
    const el = copyButtonOf(stoppedTurn('', [
      { kind: 'thinking', text: '' },
      { kind: 'thinking', text: '' },
    ]));
    expect(el).toBeNull();
  });

  it('正文有字时按老样子走 —— 复制的仍然是回答,不是推理', () => {
    const el = copyButtonOf(stoppedTurn('列表页复刻到一半。', [
      { kind: 'thinking', text: '推理原文' },
    ]));
    expect(el).toBeTruthy();
  });

  /** 清单开着时推理落在那条 todo 的抽屉里 —— 那也是「屏幕上有东西」 */
  it('推理落在清单抽屉里时照样算数', () => {
    const el = copyButtonOf(stoppedTurn('', [
      {
        kind: 'tool_use',
        id: 'p1',
        name: 'TodoWrite',
        input: { todos: [{ content: '复刻列表页', status: 'in_progress' }] },
      },
      { kind: 'thinking', text: '先量一下卡片间距。' },
    ]));
    expect(el).toBeTruthy();
  });
});
