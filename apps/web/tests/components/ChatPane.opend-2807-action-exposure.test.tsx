// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { forwardRef, type ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import { trackRunRecoveryActionSurfaceView } from '../../src/analytics/events';
import type { AppConfig, ChatMessage } from '../../src/types';

const translate = (key: string) => key;
vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));
vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));
vi.mock('../../src/analytics/events', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/analytics/events')>(),
  trackRunRecoveryActionSurfaceView: vi.fn(),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function renderFailure(agentId: string, event: NonNullable<ChatMessage['events']>[number], extra: Partial<ComponentProps<typeof ChatPane>> = {}) {
  const failed: ChatMessage = {
    id: 'exposure-failed', role: 'assistant', content: '', agentId,
    runId: 'exposure-run', runStatus: 'failed', createdAt: 1000, endedAt: 2000, events: [event],
  };
  render(<ChatPane
    messages={[{ id: 'user', role: 'user', content: 'Create a page', createdAt: 0 }, failed]}
    streaming={false} error={null} projectId="exposure-project" projectFiles={[]}
    config={{ mode: 'daemon', agentId, agentCliEnv: {} } as AppConfig}
    onEnsureProject={async () => 'exposure-project'} onSend={vi.fn()} onStop={vi.fn()}
    onRetry={vi.fn()} onSwitchToAmrAndRetry={vi.fn()}
    conversations={[{ id: 'exposure-conversation', projectId: 'exposure-project', title: 'Current', createdAt: 0, updatedAt: 0 }]}
    activeConversationId="exposure-conversation" onSelectConversation={vi.fn()} onDeleteConversation={vi.fn()}
    {...extra}
  />);
}

describe('OPEND-2807 recovery exposure matches actual card actions', () => {
  it('does not report a recovery surface for the hidden Git Bash error card', () => {
    renderFailure('claude', { kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED',
      failureDetail: 'git_bash_missing', detail: 'Claude Code on Windows requires git-bash.' });
    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
    expect(trackRunRecoveryActionSurfaceView).not.toHaveBeenCalled();
  });

  it('does not report Retry when the real zero-balance card takes over', () => {
    renderFailure('amr', { kind: 'status', label: 'error', code: 'AMR_INSUFFICIENT_BALANCE',
      detail: 'Insufficient balance' }, { amrBalanceCardUsd: 0, amrBalanceCardUnavailable: false });
    expect(screen.getByTestId('chat-upgrade-card')).toBeTruthy();
    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
    expect(trackRunRecoveryActionSurfaceView).not.toHaveBeenCalled();
  });

  it.each([
    ['amr', 'manual_retry', 'promptTemplates.retry'],
    ['claude', 'switch_runtime_retry', 'chat.amrCard.switchCta'],
  ])('reports only the displayed %s recovery action', (agentId, action, label) => {
    renderFailure(agentId, { kind: 'status', label: 'error', code: 'AMR_TIER_UPGRADE_REQUIRED', detail: 'Plan unavailable' });
    expect(within(screen.getByTestId('chat-run-error-card')).getByRole('button', { name: label })).toBeTruthy();
    const surfaces = vi.mocked(trackRunRecoveryActionSurfaceView).mock.calls.map((call) => call[1]);
    expect(surfaces.map((surface) => surface.recovery_action_type)).toEqual([action]);
    expect(surfaces[0]).toEqual(expect.objectContaining({ element: 'run_recovery_action', source_run_id: 'exposure-run' }));
  });
});
