// @vitest-environment jsdom

/**
 * The in-chat switch-model CTA. When a run fails with a daemon
 * `user_action: 'switch_model'` classification, the error card must render a
 * concrete "switch to another model" button that opens the model picker
 * (Settings → execution), with Retry demoted to the secondary action.
 *
 * Regression guard for the AMR self-switch case (agentId 'amr', where the AMR
 * promotion card does NOT render): without a dedicated CTA the user would see
 * only Retry, which re-runs the same unavailable model — the exact opposite of
 * the PR's goal. Resolver behaviour itself is covered by amr-guidance.test.ts;
 * here we only assert ChatPane's render wiring.
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

function switchModelFailedMessage(agentId: string): ChatMessage {
  return {
    id: 'msg-switch-model',
    role: 'assistant',
    content: 'The selected model was unavailable.',
    createdAt: 1,
    runId: 'run-switch-model',
    runStatus: 'failed',
    agentId,
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: 'Model unavailable.',
        code: 'MODEL_UNAVAILABLE',
        user_action: 'switch_model',
      },
    ],
  } as unknown as ChatMessage;
}

function renderChat(
  agentId: string,
  handlers: {
    onRetry?: (m: ChatMessage) => void;
    onOpenSettings?: (section?: string) => void;
  } = {},
) {
  return render(
    <ChatPane
      messages={[switchModelFailedMessage(agentId)]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={handlers.onRetry ?? vi.fn()}
      onOpenSettings={handlers.onOpenSettings as never}
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

describe('ChatPane switch-model CTA', () => {
  it('renders a switch-model button that opens the model picker (AMR self-switch)', () => {
    const onOpenSettings = vi.fn();
    renderChat('amr', { onOpenSettings });

    const cta = screen.getByText('chat.runError.switchModelCta');
    expect(cta).toBeTruthy();

    fireEvent.click(cta);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).toHaveBeenCalledWith('execution');
  });

  it('keeps Retry available as the secondary recovery action', () => {
    const onRetry = vi.fn();
    renderChat('amr', { onRetry });

    // Both the primary switch-model CTA and the secondary Retry are present.
    expect(screen.getByText('chat.runError.switchModelCta')).toBeTruthy();
    const retry = screen.getByText('promptTemplates.retry');
    expect(retry).toBeTruthy();

    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]![0]).toMatchObject({ id: 'msg-switch-model' });
  });

  it('renders the switch-model CTA for non-AMR agents too', () => {
    const onOpenSettings = vi.fn();
    renderChat('codex', { onOpenSettings });

    fireEvent.click(screen.getByText('chat.runError.switchModelCta'));
    expect(onOpenSettings).toHaveBeenCalledWith('execution');
  });
});
