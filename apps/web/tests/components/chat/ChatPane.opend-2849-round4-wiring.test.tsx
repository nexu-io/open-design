// @vitest-environment jsdom
//
// OPEND-2849 第四轮 · ChatPane 把两条新信息接到卡上(i18n 用键名替身,只验接线)。
//
// - S15:锚在那一轮下面的升级卡,余额归零时按 `amrBalanceAudience` 说话
//   (owner →「额度不足，任务已暂停」那一对键;member →「团队额度不足，任务已暂停」那一对键)。
//   发送前被拦下、没有轮次可锚的那张(流水尾部)照旧说 `chat.upgrade.whyOut`。
// - S09a:重连读数带 `retryCause: 'rate_limit'` 时,尾部那一行用限流那一对键。

import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../../src/components/ChatPane';
import type { ChatReconnectView } from '../../../src/runtime/chat/reconnect-state';
import type { AppConfig, ChatMessage } from '../../../src/types';

const translate = (key: string) => key;

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const finishedTurn: ChatMessage = {
  id: 'msg-turn',
  role: 'assistant',
  content: 'Ran out of allowance mid-run.',
  createdAt: 1,
  runId: 'run-1',
  runStatus: 'failed',
  agentId: 'amr',
  events: [{ kind: 'status', label: 'error', detail: 'balance', code: 'AMR_INSUFFICIENT_BALANCE' }],
} as ChatMessage;

function renderChat(props: Partial<React.ComponentProps<typeof ChatPane>>) {
  return render(
    <ChatPane
      messages={[]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      conversations={[{ projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 }]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'amr', agentCliEnv: {} } as unknown as AppConfig}
      {...props}
    />,
  );
}

describe('S15 · 那一轮的升级卡按谁在看说话', () => {
  it.each([
    ['owner', 'chat.upgrade.pausedTitle', 'chat.upgrade.pausedMessage'],
    ['member', 'chat.upgrade.pausedTeamTitle', 'chat.upgrade.pausedTeamMessage'],
  ] as const)('%s', (audience, titleKey, bodyKey) => {
    renderChat({
      messages: [finishedTurn],
      amrBalanceCardUsd: 0,
      amrBalanceCardAnchorMessageId: 'msg-turn',
      amrBalanceAudience: audience,
    });
    const card = screen.getByTestId('chat-upgrade-card');
    expect(card.textContent).toContain(titleKey);
    expect(card.textContent).toContain(bodyKey);
    expect(card.textContent).not.toContain('chat.upgrade.whyOut');
  });

  it('没有轮次可锚的尾部那张照旧说 whyOut', () => {
    renderChat({ amrBalanceCardUsd: 0, amrBalanceAudience: 'member' });
    expect(screen.getByTestId('chat-upgrade-card').textContent).toContain('chat.upgrade.whyOut');
  });
});

describe('S09a · 限流重试的那一行', () => {
  const view = (retryCause?: 'rate_limit'): ChatReconnectView => ({
    reason: 'agent-retry',
    runId: 'run-1',
    conversationId: 'conv-1',
    attempt: 1,
    max: 1,
    exhausted: false,
    manualRetry: false,
    offline: false,
    ...(retryCause ? { retryCause } : {}),
  });

  it('带 retryCause=rate_limit 时用限流那一对键', () => {
    renderChat({ messages: [finishedTurn], reconnect: view('rate_limit') });
    const row = screen.getByTestId('chat-reconnect');
    expect(row.textContent).toContain('chat.edge.retryingRateLimitedTitle');
    expect(row.textContent).toContain('chat.edge.retryingRateLimitedDescription');
  });

  it('不带原因时仍是 chat.edge.retrying', () => {
    renderChat({ messages: [finishedTurn], reconnect: view() });
    expect(screen.getByTestId('chat-reconnect').textContent).toContain('chat.edge.retrying');
    expect(screen.getByTestId('chat-reconnect').textContent).not.toContain('RateLimited');
  });
});
