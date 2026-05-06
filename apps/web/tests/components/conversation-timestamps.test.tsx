// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage } from '../../src/types';

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
});
