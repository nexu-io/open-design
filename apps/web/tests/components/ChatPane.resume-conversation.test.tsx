// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { Conversation, ProjectMetadata } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    setLocale: () => undefined,
    t: (key: string) => key,
  }),
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
  it('renders the resume button inside the header actions, next to new-conversation', () => {
    // The control must sit in the same action cluster as "New conversation"
    // so users discover it where they already manage conversations.
    renderChatPane({ onResumeConversation: vi.fn() });

    const resume = screen.getByTestId('resume-conversation');
    const newConv = screen.getByTestId('new-conversation');
    expect(resume.closest('.chat-header-actions')).not.toBeNull();
    expect(newConv.closest('.chat-header-actions')).toBe(
      resume.closest('.chat-header-actions'),
    );
  });

  it('omits the resume button when no handler is wired', () => {
    // Without an onResumeConversation handler the feature is unavailable;
    // a dead button would read as broken.
    renderChatPane({ onResumeConversation: undefined });
    expect(screen.queryByTestId('resume-conversation')).toBeNull();
  });

  it('invokes onResumeConversation when clicked', () => {
    const onResumeConversation = vi.fn();
    renderChatPane({ onResumeConversation });

    screen.getByTestId('resume-conversation').click();
    expect(onResumeConversation).toHaveBeenCalledTimes(1);
  });

  it('disables the button — and ignores clicks — while resumeConversationDisabled is set', () => {
    // Disabled covers mid-stream / empty-transcript: a click then must be
    // a no-op, not a stray handoff request.
    const onResumeConversation = vi.fn();
    renderChatPane({ onResumeConversation, resumeConversationDisabled: true });

    const resume = screen.getByTestId('resume-conversation') as HTMLButtonElement;
    expect(resume.disabled).toBe(true);
    resume.click();
    expect(onResumeConversation).not.toHaveBeenCalled();
  });
});
