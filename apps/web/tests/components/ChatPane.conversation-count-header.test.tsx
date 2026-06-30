// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage, Conversation } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) => {
    if (vars && Object.keys(vars).length > 0) {
      return `${key} ${Object.values(vars).join(' ')}`;
    }
    return key;
  },
}));

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`assistant-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/events')>();
  return {
    ...actual,
    trackChatPanelClick: vi.fn(),
    trackRunFailedToastSurfaceView: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Issue #3848: the conversations panel header showed the count as a separate
// element floating between the title and the New button, reading as detached.
// The count should sit next to the title heading as `Conversations (6)`.
describe('ChatPane conversations header count placement', () => {
  function open(conversations: Conversation[]) {
    render(
      <ChatPane
        messages={[]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        conversations={conversations}
        activeConversationId={conversations[0]?.id ?? null}
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        onNewConversation={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
  }

  it('renders the count parenthesized next to the title, not as a bare number', () => {
    open([
      conversation({ id: 'c1', title: 'One' }),
      conversation({ id: 'c2', title: 'Two' }),
      conversation({ id: 'c3', title: 'Three' }),
    ]);
    const count = screen.getByTestId('conversation-history-count');
    expect(count.textContent?.trim()).toBe('(3)');
  });

  it('groups the title and count in a single header cluster', () => {
    open([conversation({ id: 'c1', title: 'One' })]);
    const count = screen.getByTestId('conversation-history-count');
    const group = count.closest('.chat-history-menu-titlegroup');
    expect(group).not.toBeNull();
    // The heading lives in the same cluster so they read as one unit.
    expect(within(group as HTMLElement).getByText('chat.conversationsHeading')).toBeTruthy();
  });
});

function conversation(
  overrides: Partial<Conversation> & { id: string },
): Conversation {
  return {
    projectId: 'project-1',
    title: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}
