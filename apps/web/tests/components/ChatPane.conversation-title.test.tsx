// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

afterEach(() => {
  cleanup();
});

// Session rename was removed by design — chats are not renamed. These tests
// cover what the session switcher does keep: the icon-only history trigger
// opens a menu listing conversations, and selecting / deleting one calls back.
describe('ChatPane session switcher', () => {
  it('opens the conversation history menu from the icon trigger', () => {
    renderChatPane({
      conversations: [
        conversation({ id: 'conv-1', title: 'Contract review draft' }),
        conversation({ id: 'conv-2', title: 'Pricing page copy' }),
      ],
      activeConversationId: 'conv-1',
    });

    expect(screen.queryByTestId('conversation-history-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('conversation-history-trigger'));

    expect(screen.getByTestId('conversation-history-menu')).toBeTruthy();
    expect(screen.getByTestId('conversation-select-conv-1').textContent).toBe('Contract review draft');
    expect(screen.getByTestId('conversation-select-conv-2').textContent).toBe('Pricing page copy');
  });

  it('selects a conversation from the history menu', () => {
    const onSelectConversation = vi.fn();
    renderChatPane({
      conversations: [
        conversation({ id: 'conv-1', title: 'Contract review draft' }),
        conversation({ id: 'conv-2', title: 'Pricing page copy' }),
      ],
      activeConversationId: 'conv-1',
      onSelectConversation,
    });

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    fireEvent.click(screen.getByTestId('conversation-select-conv-2'));

    expect(onSelectConversation).toHaveBeenCalledTimes(1);
    expect(onSelectConversation).toHaveBeenCalledWith('conv-2');
  });

  it('shows an untitled label for conversations without a title', () => {
    renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: null })],
      activeConversationId: 'conv-1',
    });

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    expect(screen.getByTestId('conversation-select-conv-1').textContent).toBe('chat.untitledConversation');
  });

  it('does not expose any inline rename affordance', () => {
    renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: 'Contract review draft' })],
      activeConversationId: 'conv-1',
    });

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    // The select button is a plain selector now — no rename input is rendered.
    expect(screen.queryByTestId('chat-active-conversation-rename-input')).toBeNull();
    expect(screen.queryByDisplayValue('Contract review draft')).toBeNull();
  });
});

function renderChatPane(props: {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation?: (id: string) => void;
}) {
  return render(chatPaneElement(props));
}

function chatPaneElement({
  conversations,
  activeConversationId,
  onSelectConversation,
}: {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation?: (id: string) => void;
}) {
  return (
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
      activeConversationId={activeConversationId}
      onSelectConversation={onSelectConversation ?? vi.fn()}
      onDeleteConversation={vi.fn()}
    />
  );
}

function conversation(overrides: Partial<Conversation> & { id: string }): Conversation {
  return {
    projectId: 'project-1',
    title: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}
