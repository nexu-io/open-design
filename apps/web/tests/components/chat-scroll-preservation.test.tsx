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

// jsdom does not run a layout engine, so scrollHeight/clientHeight/scrollTop
// are all 0. The scroll-preservation effect derives "near bottom" and the
// restore target from those, so we install prototype-level getters/setters
// that route every chat-log read/write through a per-test `geom` object.
//
// The earlier shape installed instance-level Object.defineProperty mocks on
// the *remounted* chat-log only AFTER `await switchTab('Chat')`. Inside that
// act() the component schedules a rAF that writes scrollTop on the new
// element; depending on whether jsdom's rAF polyfill flushed before the await
// resolved, the write either landed on the still-default prototype setter
// (lost) or the not-yet-installed instance setter (also lost). The instance
// mock's closure-captured `remountedTop` then served its initial 0 forever
// and the assertion failed nondeterministically across CI runs without any
// product-code change. Patching at the prototype level eliminates the race
// because any chat-log instance React mounts later automatically reads/writes
// through this single test-controlled geometry.
type Geom = { scrollHeight: number; clientHeight: number; scrollTop: number };
let geom: Geom;
let rafCallbacks: FrameRequestCallback[] = [];
let resizeCallbacks: ResizeObserverCallback[] = [];
let savedDescriptors: Record<
  'scrollTop' | 'scrollHeight' | 'clientHeight',
  PropertyDescriptor | undefined
>;
let originalResizeObserver: typeof ResizeObserver | undefined;

function isChatLog(el: HTMLElement): boolean {
  return typeof el?.classList?.contains === 'function' && el.classList.contains('chat-log');
}

beforeEach(() => {
  geom = { scrollHeight: 0, clientHeight: 0, scrollTop: 0 };
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

function setGeom(partial: Partial<Geom>) {
  geom = { ...geom, ...partial };
}

function setUserScroll(top: number) {
  geom.scrollTop = top;
  const el = document.querySelector('.chat-log');
  if (el) fireEvent.scroll(el);
}

function chatPaneEl(messages: ChatMessage[], activeConversationId: string | null) {
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
      activeConversationId={activeConversationId}
      onSelectConversation={() => {}}
      onDeleteConversation={() => {}}
    />
  );
}

function renderChatPane(messages: ChatMessage[], activeConversationId: string | null = null) {
  return render(chatPaneEl(messages, activeConversationId));
}

const sampleMessages: ChatMessage[] = [
  { id: 'u1', role: 'user', content: 'first request', createdAt: Date.now() },
  { id: 'a1', role: 'assistant', content: 'first reply', createdAt: Date.now() },
  { id: 'u2', role: 'user', content: 'second request', createdAt: Date.now() },
  { id: 'a2', role: 'assistant', content: 'second reply', createdAt: Date.now() },
];

async function flushFrame() {
  await act(async () => {
    const callbacks = rafCallbacks;
    rafCallbacks = [];
    callbacks.forEach((callback) => callback(performance.now()));
    await Promise.resolve();
  });
}

async function triggerResize() {
  await act(async () => {
    const callbacks = [...resizeCallbacks];
    callbacks.forEach((callback) =>
      callback([], {} as ResizeObserver),
    );
    await Promise.resolve();
  });
}

describe('chat scroll behavior', () => {
  it('does not render the removed comments tab beside chat', () => {
    renderChatPane(sampleMessages);

    expect(screen.queryByRole('tab', { name: 'Comments' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Chat' })).toBeNull();
  });

  it('does not auto-scroll a short scrollback (~90px above bottom) when new content streams in', async () => {
    setGeom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 0 });
    const { rerender } = render(chatPaneEl(sampleMessages, null));
    // Drain the initial-bottom-scroll rAF queued during the first render,
    // otherwise it fires after our setUserScroll calls and re-pins the
    // ref to true behind the test's back.
    await flushFrame();

    // User intentionally scrolls 90px up: distance = 1000 - 510 - 400 = 90.
    // That's between the 80px auto-follow cutoff and the 120px jump-button
    // threshold, so the user is deliberately reading slightly earlier
    // output and should not be yanked to the latest message.
    setUserScroll(510);

    // A new assistant message streams in; scrollHeight grows.
    const streamed: ChatMessage[] = [
      ...sampleMessages,
      { id: 'a3', role: 'assistant', content: 'streaming chunk', createdAt: Date.now() },
    ];
    setGeom({ scrollHeight: 1100 });
    await act(async () => {
      rerender(chatPaneEl(streamed, null));
    });
    await flushFrame();

    // Auto-scroll must respect the user's pause: scrollTop stays where
    // they put it instead of snapping to the new scrollHeight.
    expect(geom.scrollTop).toBe(510);
  });

  it('keeps following the latest content when the pinned chat DOM grows after render', async () => {
    setGeom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 0 });
    renderChatPane(sampleMessages);
    await flushFrame();

    expect(geom.scrollTop).toBe(1000);

    // A message body can grow after the messages effect has already run
    // (markdown/tool rows/forms/images/layout). If the user was pinned to
    // the bottom, that DOM resize must still carry them to the latest turn.
    setGeom({ scrollHeight: 1200 });
    await triggerResize();
    await flushFrame();

    expect(geom.scrollTop).toBe(1200);
  });

  it('lands new conversation at its own bottom when switching conversations', async () => {
    const { rerender } = render(chatPaneEl(sampleMessages, 'conv-A'));
    setGeom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 0 });

    // User scrolls up in conversation A.
    setUserScroll(150);

    // The active conversation changes to B. It must land at conversation
    // B's own initial bottom, not at scrollTop: 0 and not at conversation
    // A's saved offset.
    rerender(chatPaneEl(sampleMessages, 'conv-B'));
    await flushFrame();

    // Saved state was cleared by the activeConversationId-reset effect,
    // so the new conversation lands at its own scrollHeight rather than
    // the browser default 0.
    expect(geom.scrollTop).toBe(1000);
  });
});
