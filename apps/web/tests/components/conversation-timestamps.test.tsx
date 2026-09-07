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

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPane, conversationMetaLabel, isAssistantMessageStreaming } from '../../src/components/ChatPane';
import type { ChatMessage, Conversation } from '../../src/types';

function renderChatPane(messages: ChatMessage[]) {
  return render(
    <ChatPane
      projectKindForTracking="prototype"
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
    />,
  );
}

describe('conversation timestamps', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('does not render inline relative message times in the message list', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T14:00:00Z'));

    const { container } = renderChatPane([
      {
        id: 'user-1',
        role: 'user',
        content: 'Create a landing page',
        createdAt: Date.parse('2025-01-15T12:00:00Z'),
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Done',
        createdAt: Date.parse('2025-01-15T12:01:00Z'),
      },
    ]);

    expect(screen.queryByText('2h ago')).toBeNull();
    expect(screen.queryByText('1h ago')).toBeNull();
    // The relative "just now" message-time element (MessageTimestamp) is gone.
    // 这两条**故意**按类名查:钉的是「那段 DOM 已经删掉了」——
    // `.msg-time` 和 `.chat-day-separator` 在源码里已经没有对应元素了,
    // 被删的东西不会有 testid,类名就是被钉的东西本身。
    expect(container.querySelector('.msg-time')).toBeNull();
  });

  it('does not render the user-message "You" header, and keeps the time inside the hover-revealed footer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T14:00:00Z'));

    const { container } = renderChatPane([
      {
        id: 'user-1',
        role: 'user',
        content: 'Create a landing page',
        createdAt: Date.parse('2025-01-15T12:00:00Z'),
      },
    ]);

    const userMessage = container.querySelector('[data-testid="user-message"]');
    expect(userMessage).not.toBeNull();
    // The "You" role header stays gone (#4515).
    expect(userMessage?.querySelector('.role')).toBeNull();
    // The time stamp came back with the ChatPanel 1:1 redesign (grids #50 / #51),
    // but NOT as resting chrome: it lives inside `.user-actions`, the footer that
    // is `opacity: 0` until the bubble is hovered or focused. #4515 removed it as
    // "redundant metadata above/around each user message" — that objection was about
    // metadata that costs space at rest, which this treatment no longer does.
    // ⚠️ Still a reversal of a shipped decision — flagged for product sign-off.
    const time = container.querySelector('.user-actions-time');
    expect(time).not.toBeNull();
    expect(time?.closest('.user-actions')).not.toBeNull();
    expect(time?.textContent).toMatch(/^\d{2}:\d{2}$/);
  });

  it('keeps a screen-reader-only sender label on user messages', () => {
    const { container } = renderChatPane([
      {
        id: 'user-1',
        role: 'user',
        content: 'Create a landing page',
        createdAt: Date.parse('2025-01-15T12:00:00Z'),
      },
    ]);

    const userMessage = container.querySelector('[data-testid="user-message"]');
    expect(userMessage).not.toBeNull();
    // The visible "You" header is gone, but assistive tech still needs to
    // know the message is from the user — a visually-hidden sender label
    // preserves that without re-adding visual noise.
    const senderLabel = userMessage?.querySelector('.sr-only');
    expect(senderLabel).not.toBeNull();
    expect(senderLabel?.textContent).toBe('You');
  });

  it('does not add day separators when a conversation crosses days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-16T14:00:00Z'));

    const { container } = renderChatPane([
      {
        id: 'user-1',
        role: 'user',
        content: 'First request',
        createdAt: Date.parse('2025-01-15T12:00:00Z'),
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'Follow-up',
        createdAt: Date.parse('2025-01-16T12:00:00Z'),
      },
    ]);

    expect(screen.queryAllByRole('separator')).toHaveLength(0);
    expect(container.querySelector('.chat-day-separator')).toBeNull();
  });

  it('does not treat a completed last assistant message as streaming just because another conversation is running', () => {
    const message: ChatMessage = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Done',
      createdAt: 100,
      startedAt: 100,
      runStatus: 'succeeded',
    };

    expect(isAssistantMessageStreaming(message, true, 'assistant-1')).toBe(false);
    expect(
      isAssistantMessageStreaming(
        { ...message, runStatus: 'canceled' },
        true,
        'assistant-1',
        new Set(['assistant-1']),
      ),
    ).toBe(false);
    expect(
      isAssistantMessageStreaming(
        { ...message, id: 'assistant-2', runStatus: 'running' },
        false,
        'assistant-1',
      ),
    ).toBe(true);
  });

  it('shows fixed latest run duration in the conversation menu instead of live relative age', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T14:00:00Z'));
    const t = (key: string, vars?: Record<string, string | number>) =>
      key === 'common.minutesShort' ? `${vars?.n}m` : key;
    const conversation: Conversation = {
      id: 'conv-1',
      projectId: 'project-1',
      title: 'Done run',
      createdAt: Date.parse('2025-01-15T12:00:00Z'),
      updatedAt: Date.parse('2025-01-15T12:01:00Z'),
      latestRun: {
        status: 'succeeded',
        startedAt: 1_000,
        endedAt: 16_000,
        durationMs: 15_000,
      },
    };

    expect(conversationMetaLabel(conversation, t as never)).toBe('15s');
  });

  it('prefers cumulative conversation duration over the latest run duration', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T14:00:00Z'));
    const t = (key: string, vars?: Record<string, string | number>) =>
      key === 'common.minutesShort' ? `${vars?.n}m` : key;
    const conversation = {
      id: 'conv-1',
      projectId: 'project-1',
      title: 'Multi-run session',
      createdAt: Date.parse('2025-01-15T12:00:00Z'),
      updatedAt: Date.parse('2025-01-15T12:03:00Z'),
      totalDurationMs: 85_000,
      latestRun: {
        status: 'succeeded',
        startedAt: 120_000,
        endedAt: 130_000,
        durationMs: 10_000,
      },
    } satisfies Conversation & { totalDurationMs: number };

    expect(conversationMetaLabel(conversation, t as never)).toBe('1m 25s');
  });
});
