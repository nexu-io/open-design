// @vitest-environment jsdom

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
let savedDescriptors: Record<
  'scrollTop' | 'scrollHeight' | 'clientHeight',
  PropertyDescriptor | undefined
>;

function isChatLog(el: HTMLElement): boolean {
  return typeof el?.classList?.contains === 'function' && el.classList.contains('chat-log');
}

beforeEach(() => {
  geom = { scrollHeight: 0, clientHeight: 0, scrollTop: 0 };
  rafCallbacks = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length;
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

async function switchTab(name: 'Chat' | 'Comments') {
  const tab = screen.getByRole('tab', { name });
  await act(async () => {
    fireEvent.click(tab);
  });
}

describe('chat scroll preservation across tab switches', () => {
  it('restores absolute scrollTop when user was scrolled up', async () => {
    renderChatPane(sampleMessages);
    setGeom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 0 });

    // User scrolls up to 200 (well above bottom: distance=400).
    setUserScroll(200);

    await switchTab('Comments');
    await switchTab('Chat');
    await flushFrame();

    expect(geom.scrollTop).toBe(200);
  });

  it('snaps to new scrollHeight when user was pinned to bottom and new content arrived off-tab', async () => {
    renderChatPane(sampleMessages);
    setGeom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 0 });

    // User is pinned at bottom (distance = 1000 - 600 - 400 = 0 < 50).
    setUserScroll(600);

    await switchTab('Comments');
    // While off-tab, new messages would normally grow scrollHeight.
    setGeom({ scrollHeight: 1500 });
    await switchTab('Chat');
    await flushFrame();

    // Bottom-pinned user lands at scrollHeight, not at the old offset.
    expect(geom.scrollTop).toBe(1500);
  });

  it('reveals the jump-to-latest button when restored position is no longer near bottom', async () => {
    renderChatPane(sampleMessages);
    setGeom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 0 });

    // User leaves Chat ~60px from the bottom (distance = 1000 - 540 - 400 = 60).
    setUserScroll(540);
    await switchTab('Comments');
    // While off-tab, new messages stack underneath. scrollHeight grows
    // dramatically; the saved absolute scrollTop is now hundreds of
    // pixels above the latest turn.
    setGeom({ scrollHeight: 2000 });
    await switchTab('Chat');
    await flushFrame();

    // Restored to old offset (540), but distance = 2000 - 540 - 400 = 1060
    // is well past the 120px threshold, so the jump-to-latest button
    // must be visible immediately, not hidden until the user scrolls.
    expect(geom.scrollTop).toBe(540);
    expect(screen.getByRole('button', { name: /jump to latest/i })).toBeTruthy();
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

  it('lands new conversation at its own bottom when switching conversations off-tab', async () => {
    const { rerender } = render(chatPaneEl(sampleMessages, 'conv-A'));
    setGeom({ scrollHeight: 1000, clientHeight: 400, scrollTop: 0 });

    // User scrolls up in conversation A and switches to Comments.
    setUserScroll(150);
    await switchTab('Comments');

    // While off-tab the active conversation changes to B. Returning to
    // Chat must land at conversation B's own initial bottom, not at
    // scrollTop: 0 and not at conversation A's saved offset.
    rerender(chatPaneEl(sampleMessages, 'conv-B'));
    await switchTab('Chat');
    await flushFrame();

    // Saved state was cleared by the activeConversationId-reset effect,
    // and the initial-bottom-scroll effect re-runs with `tab` in its
    // deps, so the new conversation lands at its own scrollHeight rather
    // than the browser default 0.
    expect(geom.scrollTop).toBe(1000);
  });
});
