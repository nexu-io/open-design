// @vitest-environment jsdom
//
// 回归:run 的手动终止已经由 AssistantMessage footer 报「已手动停止」。ChatPane
// 不能再把同一份 `canceled/user_stop` 映射成流水尾部的 PauseLine。live 状态更新和
// 历史回放最终都进入 `displayMessages`,两条路径都在这里钉住。

import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../../src/types';

const translate = (key: string, vars?: Record<string, string | number>) => {
  if (vars && Object.keys(vars).length > 0) {
    return `${key} ${Object.values(vars).join(' ')}`;
  }
  return key;
};

vi.mock('../../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

vi.mock('../../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`assistant-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock('../../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/analytics/events')>();
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

/** 一份 TodoWrite 快照,3 步里剩 2 步没跑完 —— 「还有剩余」的那一边。 */
const TODO_EVENTS = [
  {
    kind: 'tool_use' as const,
    id: 'todo-1',
    name: 'TodoWrite',
    input: {
      todos: [
        { content: '梳理页面结构', status: 'completed' },
        { content: '铺商品卡', status: 'in_progress' },
        { content: '接筛选', status: 'pending' },
      ],
    },
  },
];

function stoppedMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-stopped',
    role: 'assistant',
    content: '铺到一半。',
    createdAt: 1,
    runId: 'run-stopped',
    runStatus: 'canceled',
    agentId: 'amr',
    cancelOrigin: 'user_stop',
    events: TODO_EVENTS,
    ...overrides,
  } as ChatMessage;
}

function pane(opts: { messages: ChatMessage[]; streaming?: boolean }) {
  return (
    <ChatPane
      messages={opts.messages}
      streaming={opts.streaming ?? false}
      error={null}
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
      config={{ agentId: 'amr', agentCliEnv: {} } as unknown as AppConfig}
    />
  );
}

function renderChat(opts: { messages: ChatMessage[]; streaming?: boolean }) {
  const view = render(pane(opts));
  return {
    ...view,
    show: (next: { messages: ChatMessage[]; streaming?: boolean }) => view.rerender(pane(next)),
  };
}

describe('ChatPane — run 手动终止不冒充 paused task', () => {
  it('live run 从 running 落到 canceled 时不追加独立暂停行', () => {
    const live = stoppedMessage({ runStatus: 'running', cancelOrigin: undefined });
    const { show } = renderChat({ messages: [live], streaming: true });

    show({ messages: [stoppedMessage()], streaming: false });

    expect(screen.getByTestId('assistant-msg-stopped')).toBeTruthy();
    expect(screen.queryByTestId('chat-pause-line')).toBeNull();
  });

  it('历史回放中的 canceled/user_stop 也只交给回合 footer,不追加独立暂停行', () => {
    const persisted = JSON.parse(JSON.stringify(stoppedMessage())) as ChatMessage;
    renderChat({ messages: [persisted], streaming: false });

    expect(screen.getByTestId('assistant-msg-stopped')).toBeTruthy();
    expect(screen.queryByTestId('chat-pause-line')).toBeNull();
  });
});
