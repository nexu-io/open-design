// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage } from '../../src/types';

afterEach(() => cleanup());

describe('ChatPane failed user sends', () => {
  it('routes the persistent retry action back to the host with the failed user row', () => {
    const failedUser: ChatMessage = {
      id: 'user-pre-run-failure',
      role: 'user',
      content: 'Build the landing page',
      createdAt: 1,
      sendFailed: true,
    };
    const onResendUserMessage = vi.fn();

    render(
      <ChatPane
        messages={[failedUser]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onResendUserMessage={onResendUserMessage}
        onStop={vi.fn()}
        conversations={[]}
        activeConversationId="conversation-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('user-send-failed'));

    expect(onResendUserMessage).toHaveBeenCalledTimes(1);
    expect(onResendUserMessage).toHaveBeenCalledWith(failedUser);
  });
});
