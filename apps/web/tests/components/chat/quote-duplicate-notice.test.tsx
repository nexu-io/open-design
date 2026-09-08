// @vitest-environment jsdom
/**
 * 重复取词要**说出口**(OPEND-2546)。
 *
 * ## 缺的是什么
 *
 * 在助手正文里选一段话 →「添加到对话」→ 输入框上方多一枚芯片。同一段话再选一次时
 * 判据(`appendQuoteOutcome`)认得出这是重复,原样退回旧列表 —— 然后调用方接着
 * 清掉选区、浮条消失。从用户那头看,这和「点了没反应」一模一样,于是他会再点一次、
 * 再点一次。所以重复的那一下必须给一句轻提示。
 *
 * ## 为什么提示归 `ChatPane` 管
 *
 * 提示不能挂在浮条上:`handleQuote` 的最后一步就是清选区,浮条当场卸载,
 * 挂在它身上的提示会跟着一起消失。所以提示归 quote 列表的**拥有者**。
 *
 * ## 为什么盯着「判定跑了几次」
 *
 * 这一句提示最容易写错的位置是 `setQuotes` 的 updater 里面 —— 那里天然拿得到
 * `prev`,写起来最顺手。但 updater 是**渲染期**跑的纯函数,StrictMode 下会跑两遍,
 * 于是一次点击弹两次提示。这条约束在 DOM 上照不出来(两次弹的最终画面和一次一样),
 * 能照出来的是**判定本身被调了几次**:放在事件处理里是一次,放在 updater 里是两次。
 * 所以这里给 `appendQuoteOutcome` 挂了计数,直接钉「一次点击 = 一次判定」。
 */
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage, Conversation, ProjectMetadata } from '../../../src/types';

const quoteSpy = vi.hoisted(() => ({ appendQuoteOutcome: vi.fn() }));

vi.mock('../../../src/runtime/chat/quote-selection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/runtime/chat/quote-selection')>();
  return {
    ...actual,
    appendQuoteOutcome: (
      ...args: Parameters<typeof actual.appendQuoteOutcome>
    ): ReturnType<typeof actual.appendQuoteOutcome> => {
      quoteSpy.appendQuoteOutcome(...args);
      return actual.appendQuoteOutcome(...args);
    },
  };
});

const translations: Record<string, string> = {
  'chat.quote.duplicate': 'Already added to the chat',
  'common.dismiss': 'Dismiss',
};

function translate(key: string): string {
  return translations[key] ?? key;
}

vi.mock('../../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

vi.mock('../../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <output data-testid={`assistant-${message.id}`}>{message.content}</output>
  ),
}));

vi.mock('../../../src/components/ChatComposer', () => ({
  ChatComposer: () => <output data-testid="composer" />,
}));

// 真实的浮条要一段真实的 DOM Range 才肯出现,jsdom 里造不出可靠的选区矩形。
// 这里替掉的只是**触发方式**:`onQuote(text, messageId)` 的签名和真浮条一致,
// 被测的仍是 `ChatPane` 自己那一段去重 + 提示。
vi.mock('../../../src/components/chat/QuoteBar', () => ({
  QuoteBar: ({ onQuote }: { onQuote: (text: string, messageId: string | null) => void }) => (
    <>
      <button type="button" data-testid="quote-first" onClick={() => onQuote('把首屏文案改短一点', 'assistant-1')}>
        quote first
      </button>
      <button type="button" data-testid="quote-second" onClick={() => onQuote('顺便把价格行调大一档', 'assistant-1')}>
        quote second
      </button>
    </>
  ),
}));

const { ChatPane } = await import('../../../src/components/ChatPane');

const conversations: Conversation[] = [
  { id: 'conv-1', projectId: 'p1', title: 'Conversation', createdAt: 1, updatedAt: 2 },
];

const projectMetadata = { kind: 'prototype' } as ProjectMetadata;

const messages: ChatMessage[] = [
  { id: 'assistant-1', role: 'assistant', content: '把首屏文案改短一点', createdAt: 1 },
];

function renderPane(options: { strict?: boolean } = {}) {
  const tree = (
    <ChatPane
      messages={messages}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      conversations={conversations}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      projectMetadata={projectMetadata}
    />
  );
  return render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
}

const NOTICE = 'Already added to the chat';

class MockResizeObserver {
  observe = () => {};
  unobserve = () => {};
  disconnect = () => {};
}

beforeEach(() => {
  quoteSpy.appendQuoteOutcome.mockClear();
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('重复取词的轻提示', () => {
  it('第一次添加不打扰:没有任何提示', () => {
    renderPane();
    fireEvent.click(screen.getByTestId('quote-first'));
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('同一段话再选一次:弹一句「会话已添加」,而且只有一句', () => {
    renderPane();
    fireEvent.click(screen.getByTestId('quote-first'));
    fireEvent.click(screen.getByTestId('quote-first'));
    expect(screen.getAllByText(NOTICE)).toHaveLength(1);
  });

  it('接着换一段新的话被采纳时,旧提示当场收掉 —— 别留着骗人', () => {
    renderPane();
    fireEvent.click(screen.getByTestId('quote-first'));
    fireEvent.click(screen.getByTestId('quote-first'));
    expect(screen.getAllByText(NOTICE)).toHaveLength(1);
    fireEvent.click(screen.getByTestId('quote-second'));
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('连着重复两次:第二次重新计时,提示不会按第一次的点消失', () => {
    vi.useFakeTimers();
    renderPane();
    fireEvent.click(screen.getByTestId('quote-first'));
    act(() => {
      fireEvent.click(screen.getByTestId('quote-first'));
    });
    expect(screen.getAllByText(NOTICE)).toHaveLength(1);

    // 提示默认活 4s。先走掉 3s,再重复一次 —— 第二次必须让它重新挂载,
    // 否则计时器还是第一次那一条,提示会在用户刚看见它的第 1 秒就没了。
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getAllByText(NOTICE)).toHaveLength(1);
    act(() => {
      fireEvent.click(screen.getByTestId('quote-first'));
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getAllByText(NOTICE)).toHaveLength(1);

    // 从最后一次重复算满 4s 才走。
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('StrictMode 下一次点击只判定一次 —— 提示不许写进 setQuotes 的 updater 里', () => {
    renderPane({ strict: true });
    fireEvent.click(screen.getByTestId('quote-first'));
    expect(quoteSpy.appendQuoteOutcome).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('quote-first'));
    expect(quoteSpy.appendQuoteOutcome).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText(NOTICE)).toHaveLength(1);
  });

  it('判定拿到的是**上一拍刚落下**的列表,不是渲染前的旧值', () => {
    renderPane();
    fireEvent.click(screen.getByTestId('quote-first'));
    fireEvent.click(screen.getByTestId('quote-second'));
    fireEvent.click(screen.getByTestId('quote-second'));
    // 第三下是重复:说明第二下的结果确实进了判定用的那份列表。
    expect(screen.getAllByText(NOTICE)).toHaveLength(1);
    const calls = quoteSpy.appendQuoteOutcome.mock.calls;
    expect(calls[2]?.[0]).toHaveLength(2);
  });
});
