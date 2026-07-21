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

describe('composer-pinned Todo snapshot', () => {
  it('renders one Todo card above the composer and none in message history', async () => {
    render(chatPaneEl(messagesWithTodo(3)));
    await flushFrames();

    const todoCard = document.querySelector('.chat-pinned-todo .op-card.op-todo');
    expect(todoCard).not.toBeNull();
    expect(document.querySelector('.chat-log .op-card.op-todo')).toBeNull();
    expect(screen.queryAllByText('Task 1').length).toBeGreaterThan(0);
  });

  it('keeps one pinned card and updates it from the latest snapshot', async () => {
    render(chatPaneEl(messagesWithTwoTodoSnapshots()));
    await flushFrames();

    expect(document.querySelectorAll('.chat-pinned-todo .op-card.op-todo')).toHaveLength(1);
    expect(document.querySelector('.chat-log .op-card.op-todo')).toBeNull();
    expect(screen.queryAllByText('Task 2 updated').length).toBeGreaterThan(0);
  });

  it('collapses a completed snapshot to one summary row and remains expandable', async () => {
    render(chatPaneEl(messagesWithTodoThenDone()));
    await flushFrames();

    const toggle = document.querySelector<HTMLButtonElement>('.chat-pinned-todo .op-todo-toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.chat-pinned-todo .op-todo-done')).toBeNull();
    fireEvent.click(toggle!);
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryAllByText('Task 1 updated').length).toBeGreaterThan(0);
  });

  it('keeps the todo card rendered when virtualization omits the original TodoWrite row from the tail window', async () => {
    geom = { scrollHeight: 20000, clientHeight: 400, scrollTop: 20000 };
    render(chatPaneEl(longConversationWithEarlyTodo()));
    await flushFrames();

    expect(document.querySelector('[data-testid="chat-virtual-spacer"]')).not.toBeNull();
    expect(document.querySelectorAll('.chat-pinned-todo .op-card.op-todo')).toHaveLength(1);
    expect(document.querySelector('.chat-log .op-card.op-todo')).toBeNull();
    expect(screen.queryAllByText('Task 1').length).toBeGreaterThan(0);
  });

  it('scrolls to the bottom when pinned and the Todo card grows', async () => {
    // Start pinned: scrollTop == scrollHeight (user is at the very bottom).
    geom = { scrollHeight: 1000, clientHeight: 400, scrollTop: 1000 };
    render(chatPaneEl(messagesWithTodo(2)));
    await flushFrames();

    // The initial-bottom-scroll effect fires and confirms pinnedToBottomRef = true.
    // Now simulate the pinned Todo surface growing.
    // The ResizeObserver callback should fire followLatestIfPinned, which snaps
    // scrollTop back to scrollHeight.
    geom = { ...geom, clientHeight: 300, scrollHeight: 1000, scrollTop: 600 };

    await act(async () => {
      const callbacks = [...resizeCallbacks];
      callbacks.forEach((callback) => callback([], {} as ResizeObserver));
      await Promise.resolve();
    });
    await flushFrames();

    // followLatestIfPinned fires from the shared callback and snaps scrollTop
    // to scrollHeight (1000).
    expect(geom.scrollTop).toBe(1000);
  });
});
