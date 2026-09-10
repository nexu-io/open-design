// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatPane } from '../../../src/components/chat/upstream/ChatPane';
import type { ChatMessage } from '../../../src/components/chat/upstream/types';
import { I18nProvider } from '../../../src/i18n';

vi.mock('../../../src/components/chat/upstream/ChatComposer', () => ({
  ChatComposer: forwardRef(() => <div />),
}));

afterEach(cleanup);

function chat(messages: ChatMessage[], conversationId = 'one') {
  return <I18nProvider initial="zh-CN"><ChatPane
    messages={messages} streaming={false} error={null}
    projectId="p1" projectFiles={[]} onEnsureProject={async () => 'p1'}
    onSend={vi.fn()} onStop={vi.fn()} activeConversationId={conversationId}
    conversations={[]} onSelectConversation={vi.fn()} onDeleteConversation={vi.fn()}
  /></I18nProvider>;
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
