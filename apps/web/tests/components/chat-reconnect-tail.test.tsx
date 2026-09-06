// @vitest-environment jsdom
/**
 * 组件 22 · 重连 · S29 的**接线**验收(第 82–84 格)。
 *
 * 产品裁决(`specs/current/run-error-catalog.md` §6):S29 用设计稿现有的设计,
 * 位置在**会话中最后一行**。所以这里验的不是组件长相(那在
 * `chat-reconnect.test.tsx`),是它到底有没有挂进流水尾部、以及三条边界:
 *
 *   · 重连中出现,带「第几次 / 共几次」
 *   · 次数用尽转失败态,并给出一颗把事交回给人的〔重新连接〕
 *   · 恢复后**自动消失**,历史消息里不残留
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { ChatReconnectView } from '../../src/runtime/chat/reconnect-state';
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CONV = 'conv-1';

function history(): ChatMessage[] {
  return [
    { id: 'm1', role: 'user', content: 'make me a deck', createdAt: 1 },
    {
      id: 'm2',
      role: 'assistant',
      content: 'on it',
      createdAt: 2,
      runId: 'run-1',
      runStatus: 'running',
      agentId: 'claude',
    },
  ];
}

interface ChatOpts {
  reconnect?: ChatReconnectView | null;
  onManualReconnect?: () => void;
  messages?: ChatMessage[];
  streaming?: boolean;
}

function pane(opts: ChatOpts) {
  return (
    <ChatPane
      messages={opts.messages ?? history()}
      streaming={opts.streaming ?? true}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      reconnect={opts.reconnect ?? null}
      onManualReconnect={opts.onManualReconnect}
      conversations={[
        { projectId: 'project-1', id: CONV, title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId={CONV}
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'claude', agentCliEnv: {} } as unknown as AppConfig}
    />
  );
}

function renderChat(opts: ChatOpts) {
  const utils = render(pane(opts));
  return { ...utils, show: (next: ChatOpts) => utils.rerender(pane(next)) };
}

const view = (over: Partial<ChatReconnectView> = {}): ChatReconnectView => ({
  // 默认造传输层那一行 —— 这一族测的就是它。自动重试那一读数的覆盖在
  // `tests/runtime/chat/agent-retry-row.test.ts` 与 `chat-agent-retry-row.test.tsx`。
  reason: 'transport',
  runId: 'run-1',
  conversationId: CONV,
  attempt: 2,
  max: 5,
  exhausted: false,
  // 传输层的原话永远不是「按下之后的乐观读数」,见 `ChatReconnectView.manualRetry`。
  manualRetry: false,
  ...over,
});

describe('S29 · 重连行挂在流水尾部', () => {
  it('shows the row with how many attempts in, out of how many', () => {
    const { container } = renderChat({ reconnect: view({ attempt: 2 }) });
    const row = screen.getByTestId('chat-reconnect');
    expect(row.textContent).toContain('2/5');

    // 「会话中最后一行」—— 它必须在流水容器里、并且排在最后一条消息之后。
    const log = container.querySelector('[data-testid="chat-log"]');
    expect(log?.contains(row)).toBe(true);
    const last = screen.getByTestId('assistant-m2');
    expect(last.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('walks the count up to the budget without changing shape', () => {
    const { show, container } = renderChat({ reconnect: view({ attempt: 2 }) });
    const shapeAt2 = container.querySelectorAll('[data-testid="chat-reconnect"] button').length;
    show({ reconnect: view({ attempt: 5 }) });
    // 83 格不是独立形态:5/5 只是数字走到边界,一个像素都不换。
    expect(screen.getByTestId('chat-reconnect').textContent).toContain('5/5');
    expect(container.querySelectorAll('[data-testid="chat-reconnect"] button').length).toBe(shapeAt2);
  });

  it('hands the retry back to the user once the budget is spent', () => {
    const onManualReconnect = vi.fn();
    renderChat({ reconnect: view({ attempt: 5, exhausted: true }), onManualReconnect });
    const row = screen.getByTestId('chat-reconnect');
    expect(row.textContent).toContain('chat.edge.reconnectFailed');
    // 用尽后停止自动重连,换成「重新连接」——不是「重试」(那是新建一轮)。
    const cta = screen.getByRole('button', { name: 'chat.edge.reconnectCta' });
    fireEvent.click(cta);
    expect(onManualReconnect).toHaveBeenCalledTimes(1);
  });

  it('leaves nothing behind once the connection is back', () => {
    // 先真的把它摆出来 —— 否则「消失了」这条断言可以在什么都没接的分支上白拿一个绿。
    const { show } = renderChat({ reconnect: view({ attempt: 3 }) });
    expect(screen.getByTestId('chat-reconnect')).toBeTruthy();

    show({ reconnect: null });
    expect(screen.queryByTestId('chat-reconnect')).toBeNull();
    // 不留「已恢复」:整行没了,不是换一句话。
    expect(document.body.textContent).not.toContain('chat.edge.reconnect');
  });

  it('does not haunt the transcript after the turn closes', () => {
    const { show } = renderChat({ reconnect: view({ attempt: 4, exhausted: true }) });
    expect(screen.getByTestId('chat-reconnect')).toBeTruthy();

    // 这一轮收场、流水滚成历史 —— 不该从消息记录里再翻出一条陈年重连。
    show({
      reconnect: null,
      streaming: false,
      messages: [
        { id: 'm1', role: 'user', content: 'a', createdAt: 1 },
        {
          id: 'm2',
          role: 'assistant',
          content: 'b',
          createdAt: 2,
          runId: 'run-1',
          runStatus: 'failed',
          agentId: 'claude',
        },
      ],
    });
    expect(screen.queryByTestId('chat-reconnect')).toBeNull();
  });
});
