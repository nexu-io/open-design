// @vitest-environment jsdom
//
// 红测:报错卡上那一排动作的**呈现侧**契约 —— OPEND-2821 / 2758。
//
//   ① OPEND-2821 宿主说这一刻动不了,按钮就该是禁用态,并且卡面上说得出原因。
//      今天这颗〔重试〕**永远可点**,而 `ProjectView.handleRetry` 六种条件下
//      静默 `return` —— 用户看到的是「按钮坏了」。
//   ② OPEND-2758 点下重试之后,新 run 得到服务端确认之前,这张卡要留在屏幕上
//      并进「正在重试」的加载态。今天 `handleSend` 一上屏就把队尾换成新的
//      运行中助手消息,`retryableAssistantMessage` 立刻返回 null,卡当场消失。
//
// 宿主侧那一半(谁来算原因、谁来宣告在重试)在
// `ProjectView.retry-gating.test.tsx`;两页靠同一组 prop 名接在一起。

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

/** 一条普通的可重试失败:走 S19「智能体意外退出」,卡上有〔重试〕。 */
const failedMessage: ChatMessage = {
  id: 'msg-failed',
  role: 'assistant',
  content: 'Partial work.',
  createdAt: 2,
  runId: 'run-1',
  runStatus: 'failed',
  agentId: 'claude',
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
  agentId: 'claude',
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
      config={{ agentId: 'claude', agentCliEnv: {} } as unknown as AppConfig}
      {...extraProps}
    />,
  );
  return { ...result, onRetry };
}

describe('OPEND-2821 门控为真时,按钮要长成禁用态并说出原因', () => {
  it('宿主宣告「正忙」:重试禁用,卡面上说得出原因,点下去不触发 onRetry', () => {
    const { onRetry } = renderChat({ recoveryActionsBlockedReason: 'conversation-busy' });

    const retry = screen.getByTestId('chat-error-retry') as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    expect(screen.getByTestId('chat-error-actions-blocked').textContent).toBe(
      'chat.runError.actionBlocked.busy',
    );

    fireEvent.click(retry);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('宿主宣告「只读」:同样禁用,但说的是另一件事', () => {
    renderChat({ recoveryActionsBlockedReason: 'read-only' });

    expect((screen.getByTestId('chat-error-retry') as HTMLButtonElement).disabled).toBe(true);
    // 「正忙」和「不可发送」必须分得开 —— 六个条件的原因本来就不一样。
    expect(screen.getByTestId('chat-error-actions-blocked').textContent).toBe(
      'chat.runError.actionBlocked.readOnly',
    );
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

describe('OPEND-2758 重试在飞时,卡要留下并进加载态', () => {
  it('新一轮已经上屏、但 run 还没确认:卡仍在,按钮进「正在重试」且禁用', () => {
    const { onRetry } = renderChat({
      // 提前上屏之后的真实流水形状:队尾已经是新的运行中助手消息。
      messages: [userMessage, failedMessage, replacementRunningMessage],
      streaming: true,
      retryPendingAssistantId: 'msg-failed',
    });

    // 卡还在,而且说的还是**原来那一轮**为什么失败。
    expect(screen.getByTestId('chat-run-error-card')).toBeTruthy();
    expect(screen.getByTestId('chat-run-error-description').textContent).toContain(
      'chat.runError.agentCrashedMessage',
    );

    const retry = screen.getByTestId('chat-error-retry') as HTMLButtonElement;
    expect(retry.textContent).toContain('chat.edge.retrying');
    // 禁用防重复提交(单里的 ①)。
    expect(retry.disabled).toBe(true);

    fireEvent.click(retry);
    expect(onRetry).not.toHaveBeenCalled();
  });

  /*
   * 反向锚点:宣告撤掉之后卡就该走。没有这一条,「卡永远留着」也能让上面全绿,
   * 而那会让每一轮成功的重试都在屏幕上留一张写着失败的卡。
   */
  it('反向锚点:没有在飞的重试时,新一轮上屏就该把卡收走', () => {
    renderChat({
      messages: [userMessage, failedMessage, replacementRunningMessage],
      streaming: true,
      retryPendingAssistantId: null,
    });

    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
  });
});
