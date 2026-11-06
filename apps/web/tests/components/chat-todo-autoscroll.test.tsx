// @vitest-environment jsdom

// Polyfill scrollTo for jsdom (not available in jsdom's HTMLElement)
if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = function (
    options?: ScrollToOptions | number,
    _y?: number,
  ) {
    if (typeof options === 'object' && options !== null) {
      if (options.top !== undefined) this.scrollTop = options.top;
      if (options.left !== undefined) this.scrollLeft = options.left;
    }
  };
}

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage } from '../../src/types';

// Per-test geometry for the chat-log scroll container. jsdom has no
// layout engine so we patch the prototype to route reads/writes through
// this object, matching the technique in chat-scroll-preservation.test.tsx.
type Geom = { scrollHeight: number; clientHeight: number; scrollTop: number };
let geom: Geom;
let rafCallbacks: FrameRequestCallback[];
let resizeCallbacks: ResizeObserverCallback[];
let savedDescriptors: Record<
  'scrollTop' | 'scrollHeight' | 'clientHeight',
  PropertyDescriptor | undefined
>;
let originalResizeObserver: typeof ResizeObserver | undefined;

function isChatLog(el: HTMLElement): boolean {
  return typeof el?.classList?.contains === 'function' && el.classList.contains('chat-log');
}

beforeEach(() => {
  geom = { scrollHeight: 1000, clientHeight: 400, scrollTop: 1000 };
  rafCallbacks = [];
  resizeCallbacks = [];

  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length;
  });

  originalResizeObserver = globalThis.ResizeObserver;
  class MockResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      resizeCallbacks.push(callback);
    }
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: MockResizeObserver,
  });

  savedDescriptors = {
    scrollTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop'),
    scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight'),
    clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
  };
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      return isChatLog(this) ? geom.scrollTop : 0;
    },
    set(this: HTMLElement, v: number) {
      if (isChatLog(this)) geom.scrollTop = v;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isChatLog(this) ? geom.scrollHeight : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isChatLog(this) ? geom.clientHeight : 0;
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  rafCallbacks = [];
  resizeCallbacks = [];
  if (originalResizeObserver) {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: originalResizeObserver,
    });
  } else {
    delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
  }
  for (const key of ['scrollTop', 'scrollHeight', 'clientHeight'] as const) {
    const original = savedDescriptors[key];
    if (original) {
      Object.defineProperty(HTMLElement.prototype, key, original);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
    }
  }
});

async function flushFrames() {
  await act(async () => {
    const callbacks = rafCallbacks.splice(0);
    callbacks.forEach((callback) => callback(performance.now()));
    await Promise.resolve();
  });
}

// Build a message set that includes a TodoWrite event so the inline TodoCard renders.
function messagesWithTodo(taskCount: number): ChatMessage[] {
  const todos = Array.from({ length: taskCount }, (_, i) => ({
    content: `Task ${i + 1}`,
    status: 'pending',
  }));
  return [
    { id: 'u1', role: 'user' as const, content: 'build something', createdAt: Date.now() },
    {
      id: 'a1',
      role: 'assistant' as const,
      content: 'on it',
      createdAt: Date.now(),
      events: [
        {
          kind: 'tool_use' as const,
          id: 'tw-1',
          name: 'TodoWrite',
          input: { todos },
        },
      ],
    },
  ];
}

function messagesWithTwoTodoSnapshots(): ChatMessage[] {
  return [
    { id: 'u1', role: 'user' as const, content: 'build something', createdAt: Date.now() },
    {
      id: 'a1',
      role: 'assistant' as const,
      content: 'planning',
      createdAt: Date.now(),
      events: [
        {
          kind: 'tool_use' as const,
          id: 'tw-1',
          name: 'TodoWrite',
          input: {
            todos: [
              { content: 'Task 1', status: 'pending' },
              { content: 'Task 2', status: 'pending' },
            ],
          },
        },
      ],
    },
    {
      id: 'a2',
      role: 'assistant' as const,
      content: 'working',
      createdAt: Date.now(),
      events: [
        {
          kind: 'tool_use' as const,
          id: 'tw-2',
          name: 'TodoWrite',
          input: {
            todos: [
              { content: 'Task 1', status: 'completed' },
              { content: 'Task 2 updated', status: 'in_progress' },
            ],
          },
        },
      ],
    },
  ];
}

function messagesWithTodoThenDone(): ChatMessage[] {
  return [
    { id: 'u1', role: 'user' as const, content: 'build something', createdAt: Date.now() },
    {
      id: 'a1',
      role: 'assistant' as const,
      content: 'planning',
      createdAt: Date.now(),
      events: [
        {
          kind: 'tool_use' as const,
          id: 'tw-1',
          name: 'TodoWrite',
          input: {
            todos: [
              { content: 'Task 1 updated', status: 'in_progress' },
            ],
          },
        },
      ],
    },
    {
      id: 'a2',
      role: 'assistant' as const,
      content: 'done',
      createdAt: Date.now(),
      events: [
        {
          kind: 'tool_use' as const,
          id: 'tw-2',
          name: 'TodoWrite',
          input: {
            todos: [
              { content: 'Task 1 updated', status: 'completed' },
            ],
          },
        },
      ],
    },
  ];
}

function messageWithTodoBetweenProse(): ChatMessage[] {
  return [
    { id: 'u1', role: 'user' as const, content: 'build something', createdAt: Date.now() },
    {
      id: 'a1',
      role: 'assistant' as const,
      content: 'Before todo.\n\nAfter todo.',
      createdAt: Date.now(),
      events: [
        {
          kind: 'text' as const,
          text: 'Before todo.',
        },
        {
          kind: 'tool_use' as const,
          id: 'tw-1',
          name: 'TodoWrite',
          input: {
            todos: [
              { content: 'Task 1', status: 'pending' },
            ],
          },
        },
        {
          kind: 'text' as const,
          text: 'After todo.',
        },
      ],
    },
  ];
}

function longConversationWithEarlyTodo(): ChatMessage[] {
  const messages = messagesWithTodo(2);
  for (let i = 0; i < 90; i += 1) {
    messages.push({
      id: `tail-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `tail message ${i}`,
      createdAt: Date.now() + i + 1,
    });
  }
  return messages;
}

function chatPaneEl(messages: ChatMessage[]) {
  return (
    <ChatPane
      messages={messages}
      streaming={false}
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
    />
  );
}

describe('Todo 清单只出现一次(B17)', () => {
  /*
   * 钉在输入框上方的那张 TodoCard 已经退场:同一份清单不再显示两处,
   * 它现在只在执行记录里以「执行计划 · N 步」+ 分段出现(D29 / 组件 7)。
   *
   * 这一组原来有四条钉卡专属断言,连同被删的组件一起作废。留下的是**仍然成立的那条不变量**:
   * 一份快照在屏幕上只画一次。
   *
   * ⚠️ 随钉卡一起消失的还有「继续未完成任务」那颗按钮 —— 它是已上线能力,
   * 稿子没画它该搬去哪,记为 T33,**未解决前不提测**。这里不为它写测试,
   * 因为「它现在没有入口」不是我们想固化的行为。
   */
  it('输入框上方不再有钉住的清单卡', async () => {
    const { container } = render(chatPaneEl(messagesWithTodo(4)));
    await flushFrames();
    // 同上,按类名查是对的:B17 让钉在输入框上方的清单卡退场,
    // 这一条钉的就是那块 DOM 不许回来。
    expect(container.querySelector('.chat-pinned-todo')).toBeNull();
  });
});
