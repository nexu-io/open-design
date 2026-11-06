// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SideChatTab } from '../../../src/components/workspace/SideChatTab';
import { zhCN } from '../../../src/i18n/locales/zh-CN';
import type { AppConfig, ChatMessage, Conversation } from '../../../src/types';

const chat = vi.hoisted(() => ({
  messages: [] as ChatMessage[],
  onRetry: vi.fn(),
  onSend: vi.fn(),
  onStop: vi.fn(),
}));

const translate = (key: string, vars?: Record<string, string | number>) => {
  const value = zhCN[key as keyof typeof zhCN] ?? key;
  return value.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars?.[name] === undefined ? `{${name}}` : String(vars[name]));
};
vi.mock('../../../src/i18n', () => ({
  useI18n: () => ({ locale: 'zh-CN', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));
vi.mock('../../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));
vi.mock('../../../src/components/workspace/useConversationChat', () => ({
  useConversationChat: () => ({ ...chat, streaming: false, loading: false, sendDisabled: false, error: null }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('OPEND-2807 actions in the real side-chat host', () => {
  it.each(['amr', 'claude'])('provides the fixed actions for a failed %s run', (agentId) => {
    const failed: ChatMessage = {
      id: 'side-failed', role: 'assistant', content: '', agentId,
      createdAt: 1000, endedAt: 2000, runId: 'side-failed-run', runStatus: 'failed',
      events: [{ kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED',
        failureDetail: 'process_crashed', detail: 'Controlled side-chat failure' }],
    };
    chat.messages = [
      { id: 'side-user', role: 'user', content: 'Update this page', createdAt: 0 },
      failed,
    ];
    const before = structuredClone(chat.messages);
    const conversation: Conversation = {
      id: 'side-conversation', projectId: 'side-project', title: 'Side conversation',
      createdAt: 0, updatedAt: 2000, sessionMode: 'chat',
    };
    const onSwitchConversationToCloud = vi.fn();
    render(<SideChatTab
      projectId="side-project" conversationId={conversation.id}
      config={{ mode: 'daemon', agentId, agentCliEnv: {} } as AppConfig}
      agentsById={new Map()} locale="zh-CN" projectFiles={[]}
      conversations={[conversation]} onSelectConversation={vi.fn()} onDeleteConversation={vi.fn()}
      {...{ onSwitchConversationToCloud }}
    />);

    // ChatPane and RunErrorCard are real: this catches missing callbacks in
    // SideChatTab that a ChatPane-only fixture supplying every callback hides.
    const card = screen.getByTestId('chat-run-error-card');
    const primaryLabel = agentId === 'amr' ? '重试' : '切换到 OpenDesign Cloud';
    expect(within(card).getAllByRole('button').map((button) => button.textContent?.trim()))
      .toEqual(['联系我们', '导出日志', primaryLabel]);
    const primary = within(card).getByRole('button', { name: primaryLabel }) as HTMLButtonElement;
    expect(primary.disabled).toBe(false);
    if (agentId === 'amr') {
      fireEvent.click(primary);
      expect(chat.onRetry).toHaveBeenCalledOnce();
      expect(chat.onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: failed.id }), 'manual_retry');
      expect(onSwitchConversationToCloud).not.toHaveBeenCalled();
    } else {
      fireEvent.click(primary);
      expect(onSwitchConversationToCloud).toHaveBeenCalledOnce();
      expect(onSwitchConversationToCloud).toHaveBeenCalledWith(conversation.id, expect.objectContaining({ id: failed.id }));
      expect(chat.onRetry).not.toHaveBeenCalled();
    }
    expect(chat.messages).toEqual(before);
  });
});
