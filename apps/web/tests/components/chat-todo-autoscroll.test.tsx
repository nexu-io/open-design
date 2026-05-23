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

import { act, cleanup, render } from '@testing-library/react';
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
// All elements passed to any ResizeObserver.observe() call — used to
// assert that the pinned-todo div is observed so real-browser resizes fire.
let observedElements: Element[];
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
  observedElements = [];

  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length;
  });

  originalResizeObserver = globalThis.ResizeObserver;
  class MockResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      resizeCallbacks.push(callback);
    }
    observe = vi.fn((el: Element) => {
      observedElements.push(el);
    });
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
  observedElements = [];
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

// Build a message set that includes a TodoWrite event so PinnedTodoSlot renders.
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

describe('chat-log autoscroll when pinned todo card grows', () => {
  it('observes the pinned-todo element so its resize triggers the bottom-pin follow', async () => {
    // The PinnedTodoSlot lives outside the chat-log scroll container.
    // When the todo card grows, the chat-log viewport (clientHeight)
    // shrinks. The ResizeObserver must observe the pinned-todo div so
    // `followLatestIfPinned` fires and corrects the scroll position.
    render(chatPaneEl(messagesWithTodo(3)));
    await flushFrames();

    const pinnedTodoEl = document.querySelector('.chat-pinned-todo');
    expect(pinnedTodoEl, 'PinnedTodoSlot should render with a TodoWrite message').not.toBeNull();

    // The pinned-todo element must be registered with the ResizeObserver
    // so that real-browser growth of the todo card triggers followLatestIfPinned.
    expect(observedElements).toContain(pinnedTodoEl);
  });

  it('re-observes the pinned-todo element when a TodoWrite snapshot first mounts', async () => {
    // Start with no TodoWrite — PinnedTodoSlot should be absent.
    const { rerender } = render(chatPaneEl([]));
    await flushFrames();
    expect(document.querySelector('.chat-pinned-todo')).toBeNull();

    // Add messages with a TodoWrite — PinnedTodoSlot mounts for the first time.
    await act(async () => {
      rerender(chatPaneEl(messagesWithTodo(2)));
      await Promise.resolve();
    });
    await flushFrames();

    const pinnedTodoEl = document.querySelector('.chat-pinned-todo');
    expect(pinnedTodoEl, 'PinnedTodoSlot should render when messages include a TodoWrite').not.toBeNull();

    // The pane-level MutationObserver re-syncs the ResizeObserver when
    // PinnedTodoSlot mounts. The new element must be registered so real-browser
    // growth of the card triggers followLatestIfPinned.
    expect(observedElements).toContain(pinnedTodoEl);
  });

  it('scrolls to the bottom when pinned and the todo card grows', async () => {
    // Start pinned: scrollTop == scrollHeight (user is at the very bottom).
    geom = { scrollHeight: 1000, clientHeight: 400, scrollTop: 1000 };
    render(chatPaneEl(messagesWithTodo(2)));
    await flushFrames();

    // The initial-bottom-scroll effect fires and confirms pinnedToBottomRef = true.
    // Now simulate the todo card growing: the viewport (clientHeight) shrinks,
    // which means the user can no longer see the latest content even though
    // scrollTop is still at its old value. The ResizeObserver callback should
    // fire followLatestIfPinned, which snaps scrollTop back to scrollHeight.
    geom = { ...geom, clientHeight: 300, scrollHeight: 1000, scrollTop: 600 };

    await act(async () => {
      const callbacks = [...resizeCallbacks];
      callbacks.forEach((callback) => callback([], {} as ResizeObserver));
      await Promise.resolve();
    });
    await flushFrames();

    // followLatestIfPinned fires from the shared callback and snaps scrollTop
    // to scrollHeight (1000). The structural guarantee that the pinned-todo
    // element is observed (tested separately above) ensures this path runs in
    // the real browser when the card grows.
    expect(geom.scrollTop).toBe(1000);
  });
});
