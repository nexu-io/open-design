// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SideChatTab } from '../../../src/components/workspace/SideChatTab';
import type { AppConfig, Conversation } from '../../../src/types';

const chatPaneMock = vi.fn((_: unknown) => <div data-testid="chat-pane" />);

vi.mock('../../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

vi.mock('../../../src/components/Icon', () => ({
  Icon: () => <span data-testid="icon" />,
}));

vi.mock('../../../src/components/ChatPane', () => ({
  ChatPane: (props: unknown) => chatPaneMock(props),
}));

vi.mock('../../../src/components/workspace/useConversationChat', () => ({
  useConversationChat: () => ({
    messages: [],
    streaming: false,
    loading: false,
    error: null,
    onSend: vi.fn(),
    onStop: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  chatPaneMock.mockClear();
});

describe('SideChatTab', () => {
  it('passes the live config through to ChatPane', () => {
    const config = {
      mode: 'daemon',
      agentCliEnv: {
        amr: { OPEN_DESIGN_AMR_PROFILE: 'test' },
      },
    } as unknown as AppConfig;
    const conversations = [
      {
        id: 'conv-1',
        title: 'Current',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        projectId: 'project-1',
        messageCount: 0,
        sessionMode: 'design',
      },
    ] as unknown as Conversation[];

    render(
      <SideChatTab
        projectId="project-1"
        conversationId="conv-1"
        config={config}
        agentsById={new Map()}
        locale="en"
        projectFiles={[]}
        conversations={conversations}
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
      />,
    );

    expect(chatPaneMock).toHaveBeenCalled();
    const firstCall = chatPaneMock.mock.calls[0];
    expect(firstCall?.[0]).toEqual(
      expect.objectContaining({
        config,
      }),
    );
  });
});
