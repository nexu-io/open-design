// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../src/types';

// Red spec for the resume-on-failure affordance: a failed assistant message
// flagged `resumable` (a transient upstream drop / inactivity timeout the
// daemon can recover by resuming the agent's CLI session) must offer a
// "Continue the run" action that calls `onResumeRun` with that message —
// distinct from the from-scratch Retry. On origin/main there is no `resumable`
// field, no `onResumeRun` prop, and no such button, so this goes red there.

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

function resumableFailedMessage(): ChatMessage {
  return {
    id: 'msg-upstream',
    role: 'assistant',
    content: 'Partial work before the upstream dropped.',
    createdAt: 1,
    runId: 'run-upstream',
    runStatus: 'failed',
    resumable: true,
    agentId: 'claude',
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: 'Upstream request failed: stream disconnected before completion.',
        code: 'UPSTREAM_UNAVAILABLE',
      },
    ],
  };
}

function renderChat(opts: {
  onResumeRun?: (m: ChatMessage) => void;
  onRetry: (m: ChatMessage) => void;
  onSend?: (...args: unknown[]) => void;
  activeAgentId?: string;
}) {
  return render(
    <ChatPane
      messages={[resumableFailedMessage()]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={opts.onSend ?? vi.fn()}
      onStop={vi.fn()}
      onRetry={opts.onRetry}
      onResumeRun={opts.onResumeRun}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: opts.activeAgentId ?? 'claude', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

describe('ChatPane resume-on-failure', () => {
  it('offers Continue (not from-scratch Retry) on a resumable failed run', () => {
    const onResumeRun = vi.fn();
    const onRetry = vi.fn();
    const { container } = renderChat({ onResumeRun, onRetry, activeAgentId: 'claude' });

    expect(container.querySelector('[data-user-action-card="run-recovery"]')).toBeTruthy();
    const continueBtn = screen.getByRole('button', { name: 'chat.resumeRunCta' });
    expect(continueBtn).toBeTruthy();
    expect(continueBtn.textContent).toBe('chat.resumeRunCta');
    expect(continueBtn.classList.contains('chat-error-action')).toBe(true);
    // The from-scratch Retry must not be the offered action for a resumable run.
    expect(screen.queryByRole('button', { name: 'promptTemplates.retry' })).toBeNull();

    const footer = container.querySelector(
      '[data-user-action-card="run-recovery"] [data-user-action-footer="true"]',
    );
    expect(footer?.contains(continueBtn)).toBe(true);

    const detailsToggle = screen.getByRole('button', { name: 'brand.viewDetails' });
    const disclosure = container.querySelector('[data-user-action-card="run-recovery"] .accordion-collapsible');
    expect(detailsToggle.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure?.classList.contains('open')).toBe(false);
    fireEvent.click(detailsToggle);
    expect(disclosure?.classList.contains('open')).toBe(true);

    fireEvent.click(continueBtn);
    expect(onResumeRun).toHaveBeenCalledTimes(1);
    expect(onResumeRun.mock.calls[0]![0]).toMatchObject({ id: 'msg-upstream' });
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('offers Continue via plain send on surfaces without a resume handler (not Retry)', () => {
    // SideChatTab / design-system chat mount ChatPane without onResumeRun. The
    // daemon has persisted the resumable session, so the re-sending Retry path
    // would silently resume + repeat the work. Continue must still show and
    // resume via a plain send of the continue prompt (no original re-send).
    const onRetry = vi.fn();
    const onSend = vi.fn();
    renderChat({ onRetry, onSend, activeAgentId: 'claude' });

    const continueBtn = screen.getByRole('button', { name: 'chat.resumeRunCta' });
    expect(continueBtn).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'promptTemplates.retry' })).toBeNull();

    fireEvent.click(continueBtn);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(String(onSend.mock.calls[0]![0])).toContain('interrupted by a transient failure');
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('falls back to Retry when the active agent no longer matches the failed run', () => {
    // The failed message is from claude, but the user has since switched the
    // active agent to opencode — the resumable session is keyed to claude, so
    // Continue must NOT show (it would silently start fresh on the wrong agent).
    const onResumeRun = vi.fn();
    const onRetry = vi.fn();
    renderChat({ onResumeRun, onRetry, activeAgentId: 'opencode' });

    expect(screen.queryByRole('button', { name: 'chat.resumeRunCta' })).toBeNull();
    const retryButton = screen.getByRole('button', { name: 'promptTemplates.retry' });
    expect(retryButton).toBeTruthy();
    expect(retryButton.classList.contains('chat-error-action')).toBe(true);
  });
});
