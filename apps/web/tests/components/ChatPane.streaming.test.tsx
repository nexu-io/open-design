// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage, Conversation, ProjectMetadata } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ streaming, message }: { streaming: boolean; message: ChatMessage }) => (
    <output data-testid={`assistant-streaming-${message.id}`}>{streaming ? 'streaming' : 'idle'}</output>
  ),
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef(({ streaming }: { streaming: boolean }, _ref) => (
    <output data-testid="composer-streaming">{streaming ? 'streaming' : 'idle'}</output>
  )),
}));

afterEach(() => {
  cleanup();
});

describe('ChatPane streaming state', () => {
  it('renders user turns with the chat bubble styling hook', () => {
    const messages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Generate a simple sign-in page',
        createdAt: 1,
      },
    ];

    render(
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
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    const bubble = screen.getByText('Generate a simple sign-in page');
    expect(bubble.classList.contains('user-bubble')).toBe(true);
    expect(bubble.closest('.msg.user')).not.toBeNull();
  });

  it('keeps composer idle while active-run messages still render as streaming', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'still running',
        createdAt: 1,
        runId: 'run-1',
        runStatus: 'running',
      },
    ];

    render(
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
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        projectMetadata={projectMetadata}
      />,
    );

    expect(screen.getByTestId('composer-streaming').textContent).toBe('idle');
    expect(screen.getByTestId('assistant-streaming-assistant-1').textContent).toBe('streaming');
  });
});

const conversations: Conversation[] = [
  {
    id: 'conv-1',
    projectId: 'project-1',
    title: 'Conversation 1',
    createdAt: 1,
    updatedAt: 1,
  },
];

const projectMetadata: ProjectMetadata = {
  kind: 'prototype',
};
