// @vitest-environment jsdom
/**
 * 第 71 格「Plan 卡 · 收起态」—— 钉在输入框上方的那枚「第 N / M 步」药丸。
 *
 * 这一组钉住的是**行为**,不是类名(chat/AGENTS.md §5):出没判据、N/M 口径、
 * 浮层里那份清单的四态记号、以及它和发送队列的上下堆叠关系。
 * 悬停本身(CSS `:hover` 才浮出)在 jsdom 里看不见 —— 那一段靠真实客户端验,
 * 这里只保证浮层的**内容**确实渲染出来了。
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../../src/components/ChatPane';
import type { ChatMessage } from '../../../src/types';

let originalResizeObserver: typeof ResizeObserver | undefined;

beforeEach(() => {
  originalResizeObserver = globalThis.ResizeObserver;
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: MockResizeObserver,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalResizeObserver) {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: originalResizeObserver,
    });
  } else {
    delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
  }
});

type Todo = { content: string; status: string };

function messagesWithTodos(todos: Todo[]): ChatMessage[] {
  return [
    { id: 'u1', role: 'user', content: '把这两页做出来', createdAt: 1 },
    {
      id: 'a1',
      role: 'assistant',
      content: '好的',
      createdAt: 2,
      events: [{ kind: 'tool_use', id: 'tw-1', name: 'TodoWrite', input: { todos } }],
    },
  ];
}

const FOUR: Todo[] = [
  { content: '复刻商品列表页结构与栅格', status: 'completed' },
  { content: '抽出商品卡为共享组件', status: 'completed' },
  { content: '按同一套间距做设置页', status: 'in_progress' },
  { content: '接上两页之间的跳转', status: 'pending' },
];

function pane(
  messages: ChatMessage[],
  extra: { streaming?: boolean; queuedItems?: { id: string; prompt: string }[] } = {},
) {
  return (
    <ChatPane
      messages={messages}
      streaming={extra.streaming ?? true}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={() => {}}
      onStop={() => {}}
      conversations={[]}
      activeConversationId={null}
      onSelectConversation={() => {}}
      onDeleteConversation={() => {}}
      {...(extra.queuedItems ? { queuedItems: extra.queuedItems } : {})}
    />
  );
}

describe('Plan 药丸 · 收起态(第 71 格)', () => {
  it('12 步窄高场景按 viewport 顶部限高,清单可滚且键盘可进入', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('chat-log-viewport')) {
        return { top: 100, bottom: 500, left: 0, right: 320, width: 320, height: 400 } as DOMRect;
      }
      if (this.dataset.testid === 'chat-plan-pill') {
        return { top: 260, bottom: 290, left: 100, right: 220, width: 120, height: 30 } as DOMRect;
      }
      return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 } as DOMRect;
    });
    const twelve = Array.from({ length: 12 }, (_, index) => ({
      content: `第 ${index + 1} 步`,
      status: index < 2 ? 'completed' : index === 2 ? 'in_progress' : 'pending',
    }));

    render(pane(messagesWithTodos(twelve)));

    const steps = screen.getByTestId('chat-plan-pill-steps') as HTMLOListElement;
    expect(within(steps).getAllByRole('listitem')).toHaveLength(12);
    // pill top 260 - viewport top 100 - 8px gap - pop 12px block padding.
    expect(steps.style.maxHeight).toBe('140px');
    expect(steps.tabIndex).toBe(0);
    steps.focus();
    expect(document.activeElement).toBe(steps);
  });

  it('运行中且清单还没干完 —— 钉出「第 N / M 步」', () => {
    render(pane(messagesWithTodos(FOUR)));
    // 无 provider 时 i18n 落回 en(FALLBACK_I18N),所以这里比的是英文那一版;
    // 稿子的中文原话「第 N / M 步」在 zh-CN 语言包里逐字照抄。
    expect(screen.getByTestId('chat-plan-pill')).toHaveTextContent('Step 3 of 4');
  });

  it('run 结束就消失', () => {
    render(pane(messagesWithTodos(FOUR), { streaming: false }));
    expect(screen.queryByTestId('chat-plan-pill')).toBeNull();
  });

  it('清单全部完成 / 作废就消失 —— 哪怕 run 还跑着', () => {
    render(pane(messagesWithTodos(FOUR.map((t) => ({ ...t, status: 'completed' })))));
    expect(screen.queryByTestId('chat-plan-pill')).toBeNull();
  });

  it('没有清单时不出现', () => {
    render(pane([{ id: 'u1', role: 'user', content: '你好', createdAt: 1 }]));
    expect(screen.queryByTestId('chat-plan-pill')).toBeNull();
  });

  it('一条 in_progress 都没有时,第一条未完成的算当前(D36 隐式进行中)', () => {
    render(pane(messagesWithTodos([
      { content: '复刻商品列表页结构与栅格', status: 'completed' },
      { content: '抽出商品卡为共享组件', status: 'pending' },
      { content: '按同一套间距做设置页', status: 'pending' },
    ])));
    expect(screen.getByTestId('chat-plan-pill')).toHaveTextContent('Step 2 of 3');
  });

  it('浮层里是整张清单,四态记号各就各位', () => {
    render(pane(messagesWithTodos([
      { content: '复刻商品列表页结构与栅格', status: 'completed' },
      { content: '抽出商品卡为共享组件', status: 'cancelled' },
      { content: '按同一套间距做设置页', status: 'in_progress' },
      { content: '接上两页之间的跳转', status: 'pending' },
    ])));
    const steps = within(screen.getByTestId('chat-plan-pill-steps')).getAllByRole('listitem');
    expect(steps.map((li) => li.textContent)).toEqual([
      '复刻商品列表页结构与栅格',
      '抽出商品卡为共享组件',
      '按同一套间距做设置页',
      '接上两页之间的跳转',
    ]);
    const markOf = (li: HTMLElement) =>
      within(li).getByRole('img').getAttribute('aria-label');
    expect(markOf(steps[0] as HTMLElement)).toBe('Done');
    expect(markOf(steps[1] as HTMLElement)).toBe('Not started');
    expect(markOf(steps[2] as HTMLElement)).toBe('Working');
    expect(markOf(steps[3] as HTMLElement)).toBe('Not started');
  });

  it('和发送队列同时在场时,药丸浮在队列上方的滚动 viewport 内', () => {
    render(pane(messagesWithTodos(FOUR), {
      queuedItems: [
        { id: 'q1', prompt: '设置页也加上深色模式开关' },
        { id: 'q2', prompt: '商品卡换成两列' },
      ],
    }));
    const pill = screen.getByTestId('chat-plan-pill');
    const strip = screen.getByTestId('chat-queued-send-strip');
    // queue 仍在普通布局中缩短 viewport;Plan 只在 viewport 内浮动,
    // 自己 mount / unmount 不得改变 chat-log 的 clientHeight。
    expect(pill.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const slot = pill.parentElement;
    const viewport = slot?.parentElement;
    const wrap = viewport?.parentElement;
    expect(slot?.getAttribute('data-testid')).toBe('chat-bottom-float-slot');
    expect(viewport?.classList.contains('chat-log-viewport')).toBe(true);
    expect(wrap?.classList.contains('chat-log-wrap')).toBe(true);
    expect(wrap?.parentElement).toBe(strip.parentElement);
  });
});
