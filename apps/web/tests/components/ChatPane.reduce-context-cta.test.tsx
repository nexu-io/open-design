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
import { appendErrorStatusEvent, runFailureFieldsFromError } from '../../src/runtime/chat-events';
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
    omitRetryHandler?: boolean;
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
      onRetry={handlers.omitRetryHandler ? undefined : (handlers.onRetry ?? vi.fn())}
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

  it('renders New conversation CTA when onRetry is absent (e.g. DesignSystemFlow mount)', () => {
    const onNewConversation = vi.fn();
    renderChat('codex', { onNewConversation, omitRetryHandler: true });

    const cta = screen.getByText('chat.runError.reduceContextCta');
    expect(cta).toBeTruthy();

    fireEvent.click(cta);
    expect(onNewConversation).toHaveBeenCalledTimes(1);

    // Retry button is omitted when onRetry is not provided
    expect(screen.queryByText('promptTemplates.retry')).toBeNull();
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

  it('renders clickable recovery CTA when error is ingested via live appendErrorStatusEvent and mounted without onRetry', () => {
    const rawError = Object.assign(new Error('Prompt exceeds token limit.'), {
      code: 'PROMPT_TOO_LARGE',
      failureCategory: 'prompt_too_large',
      userAction: 'reduce_context',
    });
    const baseMessage: ChatMessage = {
      id: 'msg-live-err',
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      runId: 'run-live',
      runStatus: 'running',
      agentId: 'claude',
      events: [],
    };
    const failure = runFailureFieldsFromError(rawError);
    const failedMessage = {
      ...appendErrorStatusEvent(baseMessage, rawError.message, rawError.code, failure),
      runStatus: 'failed' as const,
      endedAt: Date.now(),
    };

    const onNewConversation = vi.fn();
    render(
      <ChatPane
        messages={[failedMessage]}
        streaming={false}
        error={rawError.message}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onNewConversation={onNewConversation}
        conversations={[
          { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
        ]}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        config={{
          agentId: 'claude',
          agentCliEnv: {},
          installationId: 'install-123',
          telemetry: { metrics: true },
        } as unknown as AppConfig}
      />,
    );

    const cta = screen.getByText('chat.runError.reduceContextCta');
    expect(cta).toBeTruthy();

    fireEvent.click(cta);
    expect(onNewConversation).toHaveBeenCalledTimes(1);
  });

  it('renders clickable switch-model recovery CTA when live error is ingested and mounted with onOpenSettings without onRetry', () => {
    const rawError = Object.assign(new Error('Model unavailable on provider.'), {
      code: 'UPSTREAM_UNAVAILABLE',
      failureCategory: 'model_unavailable',
      userAction: 'switch_model',
    });
    const baseMessage: ChatMessage = {
      id: 'msg-live-switch-model',
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      runId: 'run-live-model',
      runStatus: 'running',
      agentId: 'claude',
      events: [],
    };
    const failure = runFailureFieldsFromError(rawError);
    const failedMessage = {
      ...appendErrorStatusEvent(baseMessage, rawError.message, rawError.code, failure),
      runStatus: 'failed' as const,
      endedAt: Date.now(),
    };

    const onOpenSettings = vi.fn();
    render(
      <ChatPane
        messages={[failedMessage]}
        streaming={false}
        error={rawError.message}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onOpenSettings={onOpenSettings}
        conversations={[
          { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
        ]}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        config={{
          agentId: 'claude',
          agentCliEnv: {},
          installationId: 'install-123',
          telemetry: { metrics: true },
        } as unknown as AppConfig}
      />,
    );

    const cta = screen.getByText('chat.runError.switchModelCta');
    expect(cta).toBeTruthy();

    fireEvent.click(cta);
    expect(onOpenSettings).toHaveBeenCalledWith('execution');
  });
});
