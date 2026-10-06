// @vitest-environment jsdom
/**
 * 用户消息导轨(`ChatMessageRail`)的出场与退场,按 Demo(#8113)钉住:
 *
 *  · 第一条用户消息一到就现身,而不是等到第二条;
 *  · 点短横跳转只收起预览卡,短横本身立刻可以再次悬停 / 聚焦 —— 没有「退避态」;
 *  · 切到一个没有用户消息的会话,导轨整个卸载。
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { ChatPane } from '../../../src/components/ChatPane';
import { I18nProvider } from '../../../src/i18n';
import type { AppConfig, ChatMessage } from '../../../src/types';

vi.mock('../../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef(() => <div />),
}));

afterEach(cleanup);

function chat(messages: ChatMessage[], conversationId = 'one') {
  return (
    <I18nProvider initial="zh-CN">
      <ChatPane
        messages={messages}
        streaming={false}
        error={null}
        projectId="p1"
        projectFiles={[]}
        onEnsureProject={async () => 'p1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onRetry={vi.fn()}
        activeConversationId={conversationId}
        conversations={[]}
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        config={{ agentId: 'amr', agentCliEnv: {} } as unknown as AppConfig}
      />
    </I18nProvider>
  );
}

const firstMessage: ChatMessage = { id: 'u1', role: 'user', content: '第一条消息', createdAt: 1 };

it('shows message navigation as soon as the first user message is added', () => {
  const { rerender } = render(chat([]));
  expect(screen.queryByRole('navigation', { name: '用户消息导航' })).toBeNull();
  rerender(chat([firstMessage]));
  const navigation = screen.getByRole('navigation', { name: '用户消息导航' });
  expect(within(navigation).getAllByRole('button')).toHaveLength(1);
});

it('dismisses the preview on navigation but keeps the markers usable immediately', () => {
  render(chat([firstMessage]));
  const marker = screen.getByRole('button', { name: '跳转到第 1 条用户消息' });
  fireEvent.mouseEnter(marker);
  expect(screen.getByRole('tooltip').textContent).toBe(firstMessage.content);
  fireEvent.click(marker);
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(screen.getByRole('navigation', { name: '用户消息导航' }).contains(marker)).toBe(true);
  fireEvent.focus(marker);
  expect(screen.getByRole('tooltip').textContent).toBe(firstMessage.content);
});

it('clears the navigation when switching to a conversation without a user message', () => {
  const { rerender } = render(chat([firstMessage]));
  expect(screen.getByRole('navigation', { name: '用户消息导航' })).toBeTruthy();
  rerender(chat([], 'two'));
  expect(screen.queryByRole('navigation', { name: '用户消息导航' })).toBeNull();
});
