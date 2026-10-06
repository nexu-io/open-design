// @vitest-environment jsdom
// 2026-09-14 用户纠偏：有效重试接管后撤下旧报错卡，保留历史消息。
// 运行中仍必须禁用恢复动作；未批准的 busy/billing 文案不能作为提示输出。
// 真实宿主预检与卡片交接由 ProjectView.retry-gating.test.tsx 覆盖。

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import type { ComponentProps } from 'react';
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
  useI18n: () => ({ locale: 'zh-CN', setLocale: () => undefined, t: translate }),
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

const userMessage: ChatMessage = {
  id: 'msg-user',
  role: 'user',
  content: 'build me a landing page',
  createdAt: 1,
};

/** G16:Cloud 的 S19 失败保留卡内 Retry，CLI/BYOK 使用独立 Cloud 切换动作。 */
const failedMessage: ChatMessage = {
  id: 'msg-failed',
  role: 'assistant',
  content: 'Partial work.',
  createdAt: 2,
  runId: 'run-1',
  runStatus: 'failed',
  agentId: 'amr',
  events: [
    {
      kind: 'status',
      label: 'error',
      detail: 'process crashed',
      code: 'AGENT_EXECUTION_FAILED',
      failureDetail: 'process_crashed',
    },
  ],
} as ChatMessage;

/**
 * 重试上屏之后队尾那条 —— `handleSend` 在**服务端确认新 run 之前**就把它画出去了
 * (OPEND-2614 的提前上屏)。它一进流水,`retryableAssistantMessage` 就不再认
 * `msg-failed`,报错卡当场消失。
 */
const replacementRunningMessage: ChatMessage = {
  id: 'msg-replacement',
  role: 'assistant',
  content: '',
  createdAt: 3,
  runStatus: 'running',
  agentId: 'amr',
} as ChatMessage;

function renderChat(extraProps: Partial<ComponentProps<typeof ChatPane>> = {}) {
  const onRetry = vi.fn();
  const result = render(
    <ChatPane
      messages={[userMessage, failedMessage]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={onRetry}
      onSwitchToAmrAndRetry={vi.fn()}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'amr', agentCliEnv: {} } as unknown as AppConfig}
      {...extraProps}
    />,
  );
  return { ...result, onRetry };
}

describe('OPEND-2821 门控禁用动作，说明只使用已批准文案', () => {
  it('宿主宣告正忙：重试禁用，不输出未批准说明，也不触发 onRetry', () => {
    const { onRetry } = renderChat({ recoveryActionsBlockedReason: 'conversation-busy' });

    const retry = screen.getByTestId('chat-error-retry') as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    expect(screen.queryByTestId('chat-error-actions-blocked')).toBeNull();

    fireEvent.click(retry);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('宿主确认只读：用批准标题正文说明，重试仍禁用且不触发回调', () => {
    const { onRetry } = renderChat({
      recoveryActionsBlockedReason: 'read-only',
      accessError: 'read-only',
    });

    const retry = screen.getByTestId('chat-error-retry') as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    const card = screen.getByTestId('chat-run-error-card');
    expect(card.contains(screen.getByText('chat.runError.title.readOnlyAccess'))).toBe(true);
    expect(screen.getByTestId('chat-run-error-description').textContent).toBe(
      'chat.runError.actionBlocked.readOnly',
    );
    expect(screen.queryByTestId('chat-error-actions-blocked')).toBeNull();
    fireEvent.click(retry);
    expect(onRetry).not.toHaveBeenCalled();
  });

  /*
   * 反向锚点。少了这一条,「按钮永远禁用」也能让上面两条全绿 —— 那是把守卫
   * 换成了死按钮,不是把状态说清楚。
   */
  it('反向锚点:没有阻断时按钮可点,点下去照常触发 onRetry,也不出那句说明', () => {
    const { onRetry } = renderChat({ recoveryActionsBlockedReason: null });

    const retry = screen.getByTestId('chat-error-retry') as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
    expect(screen.queryByTestId('chat-error-actions-blocked')).toBeNull();

    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('2026-09-14 有效重试接管旧错误卡', () => {
  it('重试已上屏但尚无 runId：旧卡撤下，失败历史仍在', () => {
    renderChat({
      messages: [userMessage, failedMessage, replacementRunningMessage],
      streaming: true,
      retryPendingAssistantId: 'msg-failed',
    });

    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
    expect(screen.queryByTestId('chat-error-retry')).toBeNull();
    expect(screen.getByTestId('assistant-msg-failed').textContent).toBe('Partial work.');
  });

  it('正常新一轮运行同样不保留旧卡', () => {
    renderChat({
      messages: [userMessage, failedMessage, replacementRunningMessage],
      streaming: true,
      retryPendingAssistantId: null,
    });

    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
  });
});
