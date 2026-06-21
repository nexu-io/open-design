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

// Regression: switching conversations resets `messages` to [] while the new
// conversation's history is fetched. During that window the active
// conversation must NOT render a phantom "0 msg" — it should fall back to the
// persisted `messageCount` until the live messages array reflects it.
describe('ChatPane conversation message count', () => {
  it('shows the persisted count for the active conversation while its messages are still loading', () => {
    render(
      chatPaneElement({
        // Switch just happened: activeConversationId is conv-2 but the loaded
        // messages still belong to nothing yet (messagesConversationId !== active).
        messages: [],
        conversations: [
          conversation({ id: 'conv-1', title: 'Older chat', messageCount: 4 }),
          conversation({ id: 'conv-2', title: 'Just switched', messageCount: 18 }),
        ],
        activeConversationId: 'conv-2',
        messagesConversationId: null,
      }),
    );

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));

    const activeRow = screen.getByTestId('conversation-item-conv-2');
    // Must reflect the real persisted count, not a phantom 0 from the empty array.
    expect(within(activeRow).getByText(/18 msg/)).toBeTruthy();
    expect(within(activeRow).queryByText(/0 msg/)).toBeNull();
  });

  it('uses the live messages length for the active conversation once it has loaded', () => {
    render(
      chatPaneElement({
        messages: [
          userMessage('m1'),
          userMessage('m2'),
          userMessage('m3'),
        ],
        conversations: [
          conversation({ id: 'conv-2', title: 'Loaded chat', messageCount: 1 }),
        ],
        activeConversationId: 'conv-2',
        // Messages array now reflects the active conversation's loaded history.
        messagesConversationId: 'conv-2',
      }),
    );

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));

    const activeRow = screen.getByTestId('conversation-item-conv-2');
    // Live count (3) wins over the stale persisted count (1) so streaming stays fresh.
    expect(within(activeRow).getByText(/3 msg/)).toBeTruthy();
  });

  it('falls back to the persisted count when the caller does not track messagesConversationId', () => {
    // Secondary mounts (SideChatTab, DesignSystemFlow) whose loaders reset/retag
    // `messages` asynchronously omit the prop on purpose; the active row must use
    // the stable persisted count rather than a phantom live length.
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
        conversations={[conversation({ id: 'conv-1', title: 'Active', messageCount: 12 })]}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));

    const activeRow = screen.getByTestId('conversation-item-conv-1');
    expect(within(activeRow).getByText(/12 msg/)).toBeTruthy();
    expect(within(activeRow).queryByText(/0 msg/)).toBeNull();
  });

  it('shows the persisted count for non-active conversations', () => {
    render(
      chatPaneElement({
        messages: [userMessage('m1')],
        conversations: [
          conversation({ id: 'conv-1', title: 'Active', messageCount: 99 }),
          conversation({ id: 'conv-2', title: 'Background', messageCount: 7 }),
        ],
        activeConversationId: 'conv-1',
        messagesConversationId: 'conv-1',
      }),
    );

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));

    const bgRow = screen.getByTestId('conversation-item-conv-2');
    expect(within(bgRow).getByText(/7 msg/)).toBeTruthy();
  });
});

function chatPaneElement({
  messages,
  conversations,
  activeConversationId,
  messagesConversationId,
}: {
  messages: ChatMessage[];
  conversations: Conversation[];
  activeConversationId: string | null;
  messagesConversationId: string | null;
}) {
  return (
    <ChatPane
      messages={messages}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      conversations={conversations}
      activeConversationId={activeConversationId}
      messagesConversationId={messagesConversationId}
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
    />
  );
}

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

function userMessage(id: string): ChatMessage {
  return { id, role: 'user', content: 'hello', createdAt: 1 };
}
