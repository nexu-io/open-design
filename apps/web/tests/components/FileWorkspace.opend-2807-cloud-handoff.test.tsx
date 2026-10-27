// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileWorkspace } from '../../src/components/FileWorkspace';
import type { AppConfig, ChatMessage, Conversation } from '../../src/types';

const chat = vi.hoisted(() => ({ messages: [] as ChatMessage[], onRetry: vi.fn() }));
const translate = (key: string) => key;
vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));
vi.mock('../../src/providers/registry', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/providers/registry')>(),
  fetchProjectFolders: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));
vi.mock('../../src/components/workspace/useConversationChat', () => ({
  useConversationChat: () => ({ ...chat, streaming: false, loading: false, sendDisabled: false,
    error: null, onSend: vi.fn(), onStop: vi.fn() }),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('OPEND-2807 FileWorkspace forwards the real side-chat Cloud action', () => {
  it.each([false, true])('preserves the side conversation and failed message (controlled=%s)', (controlled) => {
    const failed: ChatMessage = {
      id: 'workspace-side-failed', role: 'assistant', content: '', createdAt: 1000, endedAt: 2000,
      agentId: 'claude', runStatus: 'failed', runId: 'workspace-side-run',
      events: [{ kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED',
        failureDetail: 'process_crashed', detail: 'Controlled local failure' }],
    };
    chat.messages = [{ id: 'side-user', role: 'user', content: 'Side prompt', createdAt: 0 }, failed];
    const before = structuredClone(chat.messages);
    const onSwitchConversationToCloud = vi.fn();
    const side: Conversation = { id: 'side-conversation', projectId: 'workspace-project', title: 'Side', createdAt: 0, updatedAt: 2000 };
    const main: Conversation = { ...side, id: 'main-conversation', title: 'Main' };
    const primaryId = controlled ? side.id : main.id;
    render(<FileWorkspace
      projectId="workspace-project" projectKind="prototype" files={[]} liveArtifacts={[]}
      onRefreshFiles={vi.fn()} isDeck={false}
      tabsState={{ tabs: [`chat:${side.id}`], active: `chat:${side.id}` }}
      onTabsStateChange={vi.fn()} conversations={[main, side]} activeConversationId={primaryId}
      chatConfig={{ mode: 'daemon', agentId: 'claude', agentCliEnv: {} } as AppConfig}
      chatAgentsById={new Map()} chatLocale="en"
      activeConversationChat={{
        conversationId: primaryId, messages: controlled ? chat.messages : [], streaming: false,
        error: null, onSend: vi.fn(), onRetry: chat.onRetry, onStop: vi.fn(),
      }}
      {...{ onSwitchConversationToCloud }}
    />);
    const card = within(screen.getByTestId('side-chat-tab')).getByTestId('chat-run-error-card');
    fireEvent.click(within(card).getByRole('button', { name: 'chat.amrCard.switchCta' }));
    expect(onSwitchConversationToCloud).toHaveBeenCalledOnce();
    expect(onSwitchConversationToCloud).toHaveBeenCalledWith(side.id, expect.objectContaining({ id: failed.id }));
    expect(chat.onRetry).not.toHaveBeenCalled();
    expect(chat.messages).toEqual(before);
  });
});
