// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage, Conversation, ProjectMetadata } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props: Record<string, unknown>, _ref) => (
    <output data-testid="composer" />
  )),
}));

afterEach(() => {
  cleanup();
});

const conversations: Conversation[] = [
  { id: 'conv-1', projectId: 'project-1', title: 'C1', createdAt: 1, updatedAt: 1 },
];
const projectMetadata: ProjectMetadata = { kind: 'prototype' };
const transcriptMessages: ChatMessage[] = [
  { id: 'msg-1', role: 'user', content: 'Make a poster' },
];

function renderChatPane(
  props: Partial<Parameters<typeof ChatPane>[0]> = {},
) {
  return render(
    <ChatPane
      messages={[]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onNewConversation={vi.fn()}
      conversations={conversations}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      projectMetadata={projectMetadata}
      {...props}
    />,
  );
}

describe('ChatPane resume-conversation control', () => {
  it('does not render the resume control in the chat header', () => {
    // The old header control reused the reload icon, which reads as a broken
    // chat refresh button. Keep the header action cluster free of that affordance.
    renderChatPane({ messages: transcriptMessages, onResumeConversation: vi.fn() });

    const newConv = screen.getByTestId('new-conversation');
    expect(newConv.closest('.chat-header-actions')).not.toBeNull();
    expect(screen.queryByTestId('resume-conversation')).toBeNull();
  });

  it('omits the resume button when no handler is wired', () => {
    // Without an onResumeConversation handler the feature is unavailable;
    // a dead button would read as broken.
    renderChatPane({ messages: transcriptMessages, onResumeConversation: undefined });
    expect(screen.queryByTestId('resume-conversation')).toBeNull();
  });

  it('omits the resume button when the current conversation has no transcript', () => {
    // Empty conversations cannot be handed off; hiding the action avoids a
    // permanently disabled refresh-looking control in the header.
    renderChatPane({ messages: [], onResumeConversation: vi.fn() });
    expect(screen.queryByTestId('resume-conversation')).toBeNull();
  });

  it('keeps the header clean while resumeConversationDisabled is set', () => {
    const onResumeConversation = vi.fn();
    renderChatPane({
      messages: transcriptMessages,
      onResumeConversation,
      resumeConversationDisabled: true,
    });

    expect(screen.queryByTestId('resume-conversation')).toBeNull();
    expect(onResumeConversation).not.toHaveBeenCalled();
  });
});
