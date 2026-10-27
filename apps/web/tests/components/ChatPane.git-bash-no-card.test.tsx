// @vitest-environment jsdom
/**
 * Product decision, 2026-09-14: missing Git Bash must not render an error card.
 * This overrides that row's card copy in L7ukd6xcqoWpo2xJzKdcDPctnvh.
 * Preserve the real failed turn and its structured diagnosis; do not introduce
 * a replacement installer, card, or guidance sentence. Other missing CLIs keep
 * their existing recovery card. ChatPane and AssistantMessage are both real.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import type { ChatMessage } from '../../src/types';

const translate = (key: string, vars?: Record<string, string | number>) => {
  const raw = zhCN[key as keyof typeof zhCN] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars?.[name] === undefined ? `{${name}}` : String(vars[name]),
  );
};

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'zh-CN', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

// Composer behavior is outside this render decision. No message/record/card
// component is mocked, so removing the failed turn cannot satisfy this suite.
vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const GIT_BASH_DIAGNOSTIC =
  'Claude Code on Windows requires git-bash (https://git-scm.com/download/win). If installed but not in PATH, set CLAUDE_CODE_GIT_BASH_PATH.';

function failedTurn(
  failureDetail: 'git_bash_missing' | 'cli_not_installed',
  detail = GIT_BASH_DIAGNOSTIC,
): ChatMessage {
  // Persisted history may omit the optional failureAction. The current daemon
  // emits install_cli, which the existing RunFailureAction DTO does not admit;
  // that separate contract mismatch must not be hidden with a type assertion.
  // This fixture covers the supported action-absent shape, not current wire I/O.
  return {
    id: 'failed-assistant',
    role: 'assistant',
    content: '',
    createdAt: 1_000,
    endedAt: 2_000,
    runId: 'failed-run',
    runStatus: 'failed',
    agentId: 'claude',
    events: [{
      kind: 'status',
      label: 'error',
      code: 'AGENT_EXECUTION_FAILED',
      detail,
      failureCategory: 'process_exit',
      failureDetail,
      retryable: false,
    }],
  };
}

function renderPane(message: ChatMessage, error: string | null = null) {
  const onRetry = vi.fn();
  const onSwitchToAmrAndRetry = vi.fn();
  return {
    onRetry,
    onSwitchToAmrAndRetry,
    ...render(
      <ChatPane
        messages={[
          { id: 'user-1', role: 'user', content: 'Create a landing page', createdAt: 0 },
          message,
        ]}
        streaming={false}
        error={error}
        errorSourceAssistantId={error ? message.id : null}
        projectId="git-bash-test-project"
        projectFiles={[]}
        onEnsureProject={async () => 'git-bash-test-project'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onRetry={onRetry}
        onSwitchToAmrAndRetry={onSwitchToAmrAndRetry}
        onOpenSettings={vi.fn()}
        conversations={[
          { projectId: 'git-bash-test-project', id: 'conversation-1', title: 'Current', createdAt: 0, updatedAt: 0 },
        ]}
        activeConversationId="conversation-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    ),
  };
}

function expectFailedTurnStillVisible() {
  expect(screen.getByText('Create a landing page')).toBeTruthy();
  expect(screen.getByTestId('assistant-role')).toBeTruthy();
  expect(screen.getByText('运行失败')).toBeTruthy();
  expect(screen.queryByText('已完成')).toBeNull();
}

function expectNoGitBashCard() {
  expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
  expect(screen.queryByText('缺少 Git Bash')).toBeNull();
  expect(screen.queryByText(GIT_BASH_DIAGNOSTIC)).toBeNull();
  expect(screen.queryByTestId('chat-error-retry')).toBeNull();
}

describe('Git Bash dependency failure keeps its run diagnosis without a recovery card', () => {
  it('does not render a card for the current failure, including its pane-owned error', () => {
    const message = failedTurn('git_bash_missing');
    const original = structuredClone(message);
    renderPane(message, GIT_BASH_DIAGNOSTIC);

    expectFailedTurnStillVisible();
    expectNoGitBashCard();
    expect(message).toEqual(original);
  });

  it('does not revive the card after remounting persisted history without a pane error', () => {
    const message = failedTurn('git_bash_missing');
    const persisted = JSON.parse(JSON.stringify(message)) as ChatMessage;
    const first = renderPane(message, GIT_BASH_DIAGNOSTIC);
    first.unmount();
    renderPane(persisted);

    expectFailedTurnStillVisible();
    expectNoGitBashCard();
    expect(persisted).toEqual(message);
  });

  it('retains the failed status and original diagnostic instead of turning the run into success', () => {
    const message = failedTurn('git_bash_missing');
    const original = structuredClone(message);
    renderPane(message);

    expectFailedTurnStillVisible();
    expect(message).toEqual(original);
    expect(message.events).toEqual([expect.objectContaining({
      code: 'AGENT_EXECUTION_FAILED',
      detail: GIT_BASH_DIAGNOSTIC,
      failureDetail: 'git_bash_missing',
      retryable: false,
    })]);
  });

  it('keeps the ordinary missing-CLI card and hands its failed turn to Cloud', () => {
    const message = failedTurn('cli_not_installed', 'command not found: claude');
    const original = structuredClone(message);
    const { onRetry, onSwitchToAmrAndRetry } = renderPane(message);

    expectFailedTurnStillVisible();
    expect(screen.getByTestId('chat-run-error-card')).toBeTruthy();
    expect(screen.getByTestId('chat-run-error-description').textContent).toContain('请确认这台电脑已安装');
    expect(screen.getByTestId('chat-run-error-description').textContent).toContain('安装完成后再试。');
    const card = screen.getByTestId('chat-run-error-card');
    expect(within(card).getAllByRole('button').map((button) => button.textContent?.trim()))
      .toEqual(['联系我们', '导出日志', '切换到 OpenDesign Cloud']);
    fireEvent.click(within(card).getByRole('button', { name: '切换到 OpenDesign Cloud' }));
    expect(onSwitchToAmrAndRetry).toHaveBeenCalledOnce();
    expect(onSwitchToAmrAndRetry).toHaveBeenCalledWith(expect.objectContaining({
      id: message.id, agentId: 'claude', runId: 'failed-run',
    }));
    expect(onRetry).not.toHaveBeenCalled();
    expect(message).toEqual(original);
  });
});
