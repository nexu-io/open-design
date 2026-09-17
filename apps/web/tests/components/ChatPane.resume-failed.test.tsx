// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import {
  trackRunRecoveryActionClick,
  trackRunRecoveryActionSurfaceView,
} from '../../src/analytics/events';
import type { AppConfig, ChatMessage } from '../../src/types';

// G16 removes Continue from error cards, even when the stored CLI session is
// resumable. Keep source identity, history, and recovery analytics assertions.

const translate = (key: string, vars?: Record<string, string | number>) => {
  if (vars && Object.keys(vars).length > 0) {
    return `${key} ${Object.values(vars).join(' ')}`;
  }
  return key;
};

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
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
    trackRunRecoveryActionClick: vi.fn(),
    trackRunRecoveryActionSurfaceView: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function resumableFailedMessage(agentId = 'claude'): ChatMessage {
  return {
    id: 'msg-upstream',
    role: 'assistant',
    content: 'Partial work before the upstream dropped.',
    createdAt: 1,
    runId: 'run-upstream',
    runStatus: 'failed',
    resumable: true,
    agentId,
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
  failedAgentId?: string;
  onSwitchToAmrAndRetry?: (m: ChatMessage) => void;
}) {
  return render(
    <ChatPane
      messages={[resumableFailedMessage(opts.failedAgentId)]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={opts.onSend ?? vi.fn()}
      onStop={vi.fn()}
      onRetry={opts.onRetry}
      onResumeRun={opts.onResumeRun}
      onSwitchToAmrAndRetry={opts.onSwitchToAmrAndRetry}
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

describe('ChatPane fixed actions for resumable failures', () => {
  it('uses Cloud handoff and its telemetry instead of Continue for a resumable CLI run', () => {
    const onResumeRun = vi.fn();
    const onRetry = vi.fn();
    const onSwitchToAmrAndRetry = vi.fn();
    const { container } = renderChat({ onResumeRun, onRetry, onSwitchToAmrAndRetry, activeAgentId: 'claude' });
    const card = screen.getByTestId('chat-run-error-card');
    expect(within(card).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
      'chat.runError.contactSupportCta', 'chat.runError.exportLogsCta', 'chat.amrCard.switchCta',
    ]);
    const cloud = within(card).getByRole('button', { name: 'chat.amrCard.switchCta' });
    expect(screen.queryByRole('button', { name: 'chat.resumeRunCta' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'promptTemplates.retry' })).toBeNull();
    expect(container.querySelector('[data-user-action-footer="true"]')?.contains(cloud)).toBe(true);
    expect(trackRunRecoveryActionSurfaceView).toHaveBeenCalledTimes(1);
    expect(vi.mocked(trackRunRecoveryActionSurfaceView).mock.calls[0]![1]).toMatchObject({
      element: 'run_recovery_action', task_execution_id: 'msg-upstream',
      recovery_action_instance_id: 'recovery:msg-upstream:switch_runtime_retry',
      recovery_action_type: 'switch_runtime_retry', source_run_id: 'run-upstream',
      source_agent_provider_id: 'claude_code',
    });
    fireEvent.click(cloud);
    expect(trackRunRecoveryActionClick).toHaveBeenCalledTimes(1);
    expect(vi.mocked(trackRunRecoveryActionClick).mock.calls[0]![1]).toMatchObject({
      task_execution_id: 'msg-upstream',
      recovery_action_instance_id: 'recovery:msg-upstream:switch_runtime_retry',
      recovery_action_type: 'switch_runtime_retry',
    });
    expect(onSwitchToAmrAndRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-upstream', resumable: true }));
    expect(onResumeRun).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('does not silently send a Continue prompt when the host lacks a resume handler', () => {
    const onRetry = vi.fn();
    const onSend = vi.fn();
    const onSwitchToAmrAndRetry = vi.fn();
    renderChat({ onRetry, onSend, onSwitchToAmrAndRetry, activeAgentId: 'claude' });
    fireEvent.click(screen.getByRole('button', { name: 'chat.amrCard.switchCta' }));
    expect(onSwitchToAmrAndRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-upstream' }));
    expect(screen.queryByRole('button', { name: 'chat.resumeRunCta' })).toBeNull();
    expect(onSend).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it.each([
    ['claude', 'opencode', 'chat.amrCard.switchCta'],
    ['amr', 'claude', 'promptTemplates.retry'],
  ])('retains the failed %s identity after the current agent changes to %s', (failedAgentId, activeAgentId, label) => {
    const onResumeRun = vi.fn();
    const onRetry = vi.fn();
    const onSwitchToAmrAndRetry = vi.fn();
    renderChat({ onResumeRun, onRetry, onSwitchToAmrAndRetry, activeAgentId, failedAgentId });
    expect(screen.queryByRole('button', { name: 'chat.resumeRunCta' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: label }));
    if (failedAgentId === 'amr') {
      expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-upstream', agentId: failedAgentId }), 'manual_retry');
      expect(onSwitchToAmrAndRetry).not.toHaveBeenCalled();
    } else {
      expect(onSwitchToAmrAndRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-upstream', agentId: failedAgentId }));
      expect(onRetry).not.toHaveBeenCalled();
    }
    expect(onResumeRun).not.toHaveBeenCalled();
  });
});
