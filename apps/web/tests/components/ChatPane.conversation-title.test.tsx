// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage, Conversation } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) => {
    if (key === 'chat.renameConversationLabel') {
      return `chat.renameConversationLabel ${vars?.title ?? ''}`;
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

describe('ChatPane conversation title', () => {
  it('shows the active conversation title in the chat header', () => {
    renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: 'Contract review draft' })],
      activeConversationId: 'conv-1',
    });

    expect(screen.getByTestId('chat-active-conversation-title').textContent).toBe('Contract review draft');
  });

  it('renames the active conversation from the chat header', () => {
    const onRenameConversation = vi.fn();
    renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: 'Contract review draft' })],
      activeConversationId: 'conv-1',
      onRenameConversation,
    });

    fireEvent.click(screen.getByLabelText('chat.renameConversationLabel Contract review draft'));
    const input = screen.getByTestId('chat-active-conversation-rename-input');
    fireEvent.change(input, { target: { value: '  Contract review v2  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);

    expect(onRenameConversation).toHaveBeenCalledTimes(1);
    expect(onRenameConversation).toHaveBeenCalledWith('conv-1', 'Contract review v2');
  });

  it('cancels the active conversation rename without saving', () => {
    const onRenameConversation = vi.fn();
    renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: 'Contract review draft' })],
      activeConversationId: 'conv-1',
      onRenameConversation,
    });

    fireEvent.click(screen.getByLabelText('chat.renameConversationLabel Contract review draft'));
    const input = screen.getByTestId('chat-active-conversation-rename-input');
    fireEvent.change(input, { target: { value: 'Do not save this' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);

    expect(onRenameConversation).not.toHaveBeenCalled();
    expect(screen.getByTestId('chat-active-conversation-title').textContent).toBe('Contract review draft');
  });

  it('does not save unchanged titles', () => {
    const onRenameConversation = vi.fn();
    renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: 'Contract review draft' })],
      activeConversationId: 'conv-1',
      onRenameConversation,
    });

    fireEvent.click(screen.getByLabelText('chat.renameConversationLabel Contract review draft'));
    const input = screen.getByTestId('chat-active-conversation-rename-input');
    fireEvent.change(input, { target: { value: '  Contract review draft  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRenameConversation).not.toHaveBeenCalled();
  });

  it('submits an empty title when clearing an existing title', () => {
    const onRenameConversation = vi.fn();
    renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: 'Contract review draft' })],
      activeConversationId: 'conv-1',
      onRenameConversation,
    });

    fireEvent.click(screen.getByLabelText('chat.renameConversationLabel Contract review draft'));
    const input = screen.getByTestId('chat-active-conversation-rename-input');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRenameConversation).toHaveBeenCalledTimes(1);
    expect(onRenameConversation).toHaveBeenCalledWith('conv-1', '');
  });

  it('does not submit an empty title when the conversation is already untitled', () => {
    const onRenameConversation = vi.fn();
    renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: null })],
      activeConversationId: 'conv-1',
      onRenameConversation,
    });

    fireEvent.click(screen.getByLabelText('chat.renameConversationLabel chat.untitledConversation'));
    const input = screen.getByTestId('chat-active-conversation-rename-input');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRenameConversation).not.toHaveBeenCalled();
  });

  it('does not show a rename control when there is no active conversation', () => {
    renderChatPane({
      conversations: [],
      activeConversationId: null,
    });

    expect(screen.getByTestId('chat-active-conversation-title').textContent).toBe('chat.conversationsHeading');
    expect(screen.queryByLabelText(/^chat\.renameConversationLabel /)).toBeNull();
  });

  it('does not show a rename control when rename handling is unavailable', () => {
    renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: 'Contract review draft' })],
      activeConversationId: 'conv-1',
      onRenameConversation: undefined,
    });

    expect(screen.getByTestId('chat-active-conversation-title').textContent).toBe('Contract review draft');
    expect(screen.queryByLabelText(/^chat\.renameConversationLabel /)).toBeNull();
  });

  it('trims the conversation history rename flow the same way as the header', () => {
    const onRenameConversation = vi.fn();
    renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: 'Contract review draft' })],
      activeConversationId: 'conv-1',
      onRenameConversation,
    });

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    fireEvent.doubleClick(screen.getByTestId('conversation-select-conv-1'));

    const input = screen.getByDisplayValue('Contract review draft');
    fireEvent.change(input, { target: { value: '  Contract review v2  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRenameConversation).toHaveBeenCalledTimes(1);
    expect(onRenameConversation).toHaveBeenCalledWith('conv-1', 'Contract review v2');
  });

  it('does not save unchanged titles from the conversation history menu', () => {
    const onRenameConversation = vi.fn();
    renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: 'Contract review draft' })],
      activeConversationId: 'conv-1',
      onRenameConversation,
    });

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    fireEvent.doubleClick(screen.getByTestId('conversation-select-conv-1'));

    const input = screen.getByDisplayValue('Contract review draft');
    fireEvent.change(input, { target: { value: '  Contract review draft  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRenameConversation).not.toHaveBeenCalled();
  });

  it('exits title editing when the active conversation changes', () => {
    const onRenameConversation = vi.fn();
    const { rerender } = renderChatPane({
      conversations: [
        conversation({ id: 'conv-1', title: 'First conversation' }),
        conversation({ id: 'conv-2', title: 'Second conversation' }),
      ],
      activeConversationId: 'conv-1',
      onRenameConversation,
    });

    fireEvent.click(screen.getByLabelText('chat.renameConversationLabel First conversation'));
    fireEvent.change(screen.getByTestId('chat-active-conversation-rename-input'), {
      target: { value: 'Unsaved draft' },
    });

    rerender(chatPaneElement({
      conversations: [
        conversation({ id: 'conv-1', title: 'First conversation' }),
        conversation({ id: 'conv-2', title: 'Second conversation' }),
      ],
      activeConversationId: 'conv-2',
      onRenameConversation,
    }));

    expect(screen.queryByTestId('chat-active-conversation-rename-input')).toBeNull();
    expect(screen.getByTestId('chat-active-conversation-title').textContent).toBe('Second conversation');
    expect(onRenameConversation).not.toHaveBeenCalled();
  });

  it('exits title editing when the active conversation record disappears', () => {
    const onRenameConversation = vi.fn();
    const { rerender } = renderChatPane({
      conversations: [conversation({ id: 'conv-1', title: 'First conversation' })],
      activeConversationId: 'conv-1',
      onRenameConversation,
    });

    fireEvent.click(screen.getByLabelText('chat.renameConversationLabel First conversation'));
    fireEvent.change(screen.getByTestId('chat-active-conversation-rename-input'), {
      target: { value: 'Unsaved draft' },
    });

    rerender(chatPaneElement({
      conversations: [],
      activeConversationId: 'conv-1',
      onRenameConversation,
    }));

    expect(screen.queryByTestId('chat-active-conversation-rename-input')).toBeNull();
    expect(screen.getByTestId('chat-active-conversation-title').textContent).toBe('chat.conversationsHeading');
    expect(onRenameConversation).not.toHaveBeenCalled();
  });
});

function renderChatPane({
  conversations,
  activeConversationId,
  onRenameConversation,
}: {
  conversations: Conversation[];
  activeConversationId: string | null;
  onRenameConversation?: (id: string, title: string) => void;
}) {
  return render(chatPaneElement({ conversations, activeConversationId, onRenameConversation }));
}

function chatPaneElement({
  conversations,
  activeConversationId,
  onRenameConversation,
}: {
  conversations: Conversation[];
  activeConversationId: string | null;
  onRenameConversation?: ((id: string, title: string) => void) | undefined;
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
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      onRenameConversation={onRenameConversation}
    />
  );
}

function conversation(input: { id: string; title: string | null }): Conversation {
  return {
    id: input.id,
    projectId: 'project-1',
    title: input.title,
    createdAt: 1,
    updatedAt: 1,
  };
}
