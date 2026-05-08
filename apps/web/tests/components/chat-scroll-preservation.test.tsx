// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage } from '../../src/types';

// jsdom does not run a layout engine, so scrollHeight, clientHeight, and
// scrollTop are zero by default. The scroll-preservation effect derives
// "near bottom" from those, so we drive them explicitly per test.
function mockScrollGeometry(
  el: HTMLElement,
  geom: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => geom.scrollHeight,
  });
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    get: () => geom.clientHeight,
  });
  let scrollTop = geom.scrollTop;
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (v: number) => {
      scrollTop = v;
    },
  });
  return {
    setScrollTop(v: number) {
      scrollTop = v;
      fireEvent.scroll(el);
    },
    setScrollHeight(v: number) {
      Object.defineProperty(el, 'scrollHeight', {
        configurable: true,
        get: () => v,
      });
      geom.scrollHeight = v;
    },
    getScrollTop() {
      return scrollTop;
    },
  };
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

function getChatLog(): HTMLElement {
  const el = document.querySelector('.chat-log');
  if (!el) throw new Error('chat-log not found');
  return el as HTMLElement;
}

function flushFrame() {
  return act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

async function switchTab(name: 'Chat' | 'Comments') {
  const tab = screen.getByRole('tab', { name });
  await act(async () => {
    fireEvent.click(tab);
  });
}

describe('chat scroll preservation across tab switches', () => {
  afterEach(() => {
    cleanup();
  });

  it('restores absolute scrollTop when user was scrolled up', async () => {
    renderChatPane(sampleMessages);
    const log = getChatLog();
    const ctl = mockScrollGeometry(log, {
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 0,
    });

    // User scrolls up to 200 (well above bottom: distance=400).
    ctl.setScrollTop(200);

    await switchTab('Comments');
    await switchTab('Chat');
    await flushFrame();

    const restored = getChatLog();
    expect(restored.scrollTop).toBe(200);
  });

  it('snaps to new scrollHeight when user was pinned to bottom and new content arrived off-tab', async () => {
    renderChatPane(sampleMessages);
    const log = getChatLog();
    const ctl = mockScrollGeometry(log, {
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 600,
    });

    // User is pinned at bottom (distance = 1000 - 600 - 400 = 0 < 50).
    ctl.setScrollTop(600);

    await switchTab('Comments');

    // While off-tab, new messages would normally grow scrollHeight. We
    // simulate that, then re-render so the chat-log remounts at the new
    // size.
    ctl.setScrollHeight(1500);

    await switchTab('Chat');

    // Re-mount picks up a fresh element; carry the new geometry into it.
    const remounted = getChatLog();
    Object.defineProperty(remounted, 'scrollHeight', {
      configurable: true,
      get: () => 1500,
    });
    Object.defineProperty(remounted, 'clientHeight', {
      configurable: true,
      get: () => 400,
    });
    let remountedTop = 0;
    Object.defineProperty(remounted, 'scrollTop', {
      configurable: true,
      get: () => remountedTop,
      set: (v: number) => {
        remountedTop = v;
      },
    });

    await flushFrame();

    // Bottom-pinned user lands at scrollHeight, not at the old offset.
    expect(remountedTop).toBe(1500);
  });

  it('reveals the jump-to-latest button when restored position is no longer near bottom', async () => {
    renderChatPane(sampleMessages);
    const log = getChatLog();
    const ctl = mockScrollGeometry(log, {
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 0,
    });

    // User leaves Chat ~60px from the bottom (distance = 1000 - 540 - 400 = 60).
    ctl.setScrollTop(540);

    await switchTab('Comments');

    // While off-tab, new messages stack underneath. scrollHeight grows
    // dramatically; the saved absolute scrollTop is now hundreds of
    // pixels above the latest turn.
    ctl.setScrollHeight(2000);

    await switchTab('Chat');

    // Carry the new geometry into the remounted element so the
    // distance-from-bottom calc inside the rAF restore can see it.
    const remounted = getChatLog();
    let remountedTop = 0;
    Object.defineProperty(remounted, 'scrollHeight', {
      configurable: true,
      get: () => 2000,
    });
    Object.defineProperty(remounted, 'clientHeight', {
      configurable: true,
      get: () => 400,
    });
    Object.defineProperty(remounted, 'scrollTop', {
      configurable: true,
      get: () => remountedTop,
      set: (v: number) => {
        remountedTop = v;
      },
    });

    await flushFrame();

    // Restored to old offset (540), but distance = 2000 - 540 - 400 = 1060
    // is well past the 120px threshold, so the jump-to-latest button
    // must be visible immediately, not hidden until the user scrolls.
    expect(remountedTop).toBe(540);
    expect(screen.getByRole('button', { name: /jump to latest/i })).toBeTruthy();
  });

  it('lands new conversation at its own bottom when switching conversations off-tab', async () => {
    const { rerender } = render(chatPaneEl(sampleMessages, 'conv-A'));
    const log = getChatLog();
    const ctl = mockScrollGeometry(log, {
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 0,
    });

    // User scrolls up in conversation A and switches to Comments.
    ctl.setScrollTop(150);
    await switchTab('Comments');

    // While off-tab the active conversation changes to B. Returning to
    // Chat must land at conversation B's own initial bottom, not at
    // scrollTop: 0 and not at conversation A's saved offset.
    rerender(chatPaneEl(sampleMessages, 'conv-B'));
    await switchTab('Chat');

    const remounted = getChatLog();
    let remountedTop = 0;
    Object.defineProperty(remounted, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    });
    Object.defineProperty(remounted, 'clientHeight', {
      configurable: true,
      get: () => 400,
    });
    Object.defineProperty(remounted, 'scrollTop', {
      configurable: true,
      get: () => remountedTop,
      set: (v: number) => {
        remountedTop = v;
      },
    });

    await flushFrame();

    // Saved state was cleared and the initial-bottom-scroll effect
    // re-runs with `tab` in its deps, so the new conversation lands at
    // its own scrollHeight rather than the browser default 0.
    expect(remountedTop).toBe(1000);
  });
});
