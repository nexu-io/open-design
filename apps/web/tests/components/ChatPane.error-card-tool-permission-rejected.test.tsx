// @vitest-environment jsdom
//
// OPEND-3836 QA (2026-11-02, Apple Silicon Mac / Intel Mac / Windows): a real
// local OpenCode `read` outside the project was auto-denied and the run ended
// without output. The daemon persisted `failureDetail=tool_permission_rejected`
// and named the path in its error sentence, but the card fell back to the
// generic 「任务未能完成 / 本次任务运行失败，请重试」: web had no row for the
// detail, so the user never saw which path was blocked.
import { toolPermissionRejectionMessage } from '@open-design/contracts';
import { cleanup, render } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../src/types';

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

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const BLOCKED_PATH = 'C:\\Users\\QA User\\Documents\\launch brief.md';

function failedMessage(detail: string): ChatMessage {
  return {
    id: 'msg-failed',
    role: 'assistant',
    content: '',
    createdAt: 1,
    runId: 'run-1',
    runStatus: 'failed',
    agentId: 'opencode',
    events: [
      {
        kind: 'status',
        label: 'error',
        detail,
        code: 'AGENT_EXECUTION_FAILED',
        failureDetail: 'tool_permission_rejected',
        failureAction: 'none',
        retryable: false,
      },
    ],
  } as unknown as ChatMessage;
}

function renderChat(message: ChatMessage, error: string) {
  return render(
    <ChatPane
      messages={[message]}
      streaming={false}
      error={error}
      errorSourceAssistantId="msg-failed"
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'opencode', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

const cardOf = (container: HTMLElement) =>
  container.querySelector('[data-user-action-card="run-recovery"]');

const descriptionOf = (container: HTMLElement) =>
  cardOf(container)?.querySelector('[data-testid="chat-run-error-description"]') ?? null;

const titleOf = (container: HTMLElement) =>
  cardOf(container)?.firstElementChild ?? null;

describe('auto-denied tool call (tool_permission_rejected) on the failure card', () => {
  it('names the blocked tool and the full path instead of the generic retry copy', () => {
    const sentence = toolPermissionRejectionMessage({ tool: 'read', target: BLOCKED_PATH });
    const { container } = renderChat(failedMessage(sentence), sentence);

    expect(titleOf(container)!.textContent).toContain(
      'chat.runError.title.toolPermissionRejected',
    );
    const text = descriptionOf(container)!.textContent ?? '';
    expect(text).toContain('chat.runError.toolPermissionRejectedMessage');
    expect(text).toContain('read');
    expect(text).toContain(BLOCKED_PATH);
    expect(text).not.toContain('chat.runError.fallbackMessage');
  });

  it('still names the tool when the denied call carried no target', () => {
    const sentence = toolPermissionRejectionMessage({ tool: 'bash', target: null });
    const { container } = renderChat(failedMessage(sentence), sentence);

    const text = descriptionOf(container)!.textContent ?? '';
    expect(text).toContain('chat.runError.toolPermissionRejectedMessageNoTarget');
    expect(text).toContain('bash');
  });
});
