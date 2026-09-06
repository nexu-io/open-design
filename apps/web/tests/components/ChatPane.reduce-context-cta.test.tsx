// @vitest-environment jsdom

/**
 * The in-chat reduce-context CTA (issue #4782). When a run fails with a daemon
 * `user_action: 'reduce_context'` classification (prompt_too_large), the error
 * card must render a concrete "New conversation" button — retrying re-sends the
 * same oversized context and fails identically, so the recovery path is to
 * start fresh. Retry is demoted to the secondary action.
 *
 * Before the fix the card fell through to a bare Retry, offering no affordance
 * toward the actual fix. Resolver behaviour itself is covered by
 * amr-guidance.test.ts; here we only assert ChatPane's render wiring.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
  useI18n: () => ({ t: (key: string, vars?: Record<string, unknown>) => key, locale: 'en' }),
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
  vi.clearAllMocks();
});

function reduceContextFailedMessage(agentId: string): ChatMessage {
  return {
    id: 'msg-reduce-context',
    role: 'assistant',
    content: 'The prompt was too large.',
    createdAt: 1,
    runId: 'run-reduce-context',
    runStatus: 'failed',
    agentId,
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: 'Prompt too large.',
        code: 'PROMPT_TOO_LARGE',
        user_action: 'reduce_context',
      },
    ],
  } as unknown as ChatMessage;
}

function renderChat(
  agentId: string,
  handlers: {
    onRetry?: (m: ChatMessage) => void;
    onNewConversation?: () => void;
    newConversationDisabled?: boolean;
  } = {},
) {
  return render(
    <ChatPane
      messages={[reduceContextFailedMessage(agentId)]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={handlers.onRetry ?? vi.fn()}
      onNewConversation={handlers.onNewConversation ?? vi.fn()}
      newConversationDisabled={handlers.newConversationDisabled ?? false}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{
        agentId,
        agentCliEnv: {},
        installationId: 'install-123',
        telemetry: { metrics: true },
      } as unknown as AppConfig}
    />,
  );
}

describe('ChatPane reduce-context CTA', () => {
  it('renders a New conversation button that starts a fresh conversation', () => {
    const onNewConversation = vi.fn();
    renderChat('amr', { onNewConversation });

    const cta = screen.getByText('chat.runError.reduceContextCta');
    expect(cta).toBeTruthy();

    fireEvent.click(cta);
    expect(onNewConversation).toHaveBeenCalledTimes(1);
  });

  it('keeps Retry available as the secondary recovery action', () => {
    const onRetry = vi.fn();
    renderChat('amr', { onRetry });

    expect(screen.getByText('chat.runError.reduceContextCta')).toBeTruthy();
    const retry = screen.getByText('promptTemplates.retry');
    expect(retry).toBeTruthy();

    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]![0]).toMatchObject({ id: 'msg-reduce-context' });
  });

  it('disables the New conversation CTA when new conversations are disabled', () => {
    const onNewConversation = vi.fn();
    renderChat('codex', { onNewConversation, newConversationDisabled: true });

    const cta = screen.getByText('chat.runError.reduceContextCta') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);

    fireEvent.click(cta);
    expect(onNewConversation).not.toHaveBeenCalled();
  });
});
