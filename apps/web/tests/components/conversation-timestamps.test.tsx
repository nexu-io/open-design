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

  it('shows inline relative message times with exact hover text', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T14:00:00Z'));

    renderChatPane([
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

    const firstTime = screen.getByText('2h ago');
    expect(firstTime.tagName).toBe('TIME');
    expect(firstTime.getAttribute('title')).toContain('2025');
    expect(screen.getByText('1h ago').tagName).toBe('TIME');
  });

  it('adds day separators when a conversation crosses days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-16T14:00:00Z'));

    renderChatPane([
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

    expect(screen.getAllByRole('separator')).toHaveLength(2);
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
});
