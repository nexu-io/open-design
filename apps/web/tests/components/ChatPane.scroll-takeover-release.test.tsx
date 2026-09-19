// @vitest-environment jsdom
//
// The chat log's DOM node is reused across conversations (it carries no
// conversation key), so nothing at the node level tells the scroll takeover
// that the conversation it was engaged for is gone. `ChatPane` has to say so.
// These specs pin that wiring: a conversation switch releases the takeover;
// an unrelated re-render does not.

import { cleanup, render } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import { releaseChatScrollTakeover } from '../../src/runtime/chat-scroll-takeover';
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
  };
});

vi.mock('../../src/runtime/chat-scroll-takeover', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/chat-scroll-takeover')>();
  return { ...actual, releaseChatScrollTakeover: vi.fn() };
});

const release = vi.mocked(releaseChatScrollTakeover);

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
});

beforeEach(() => {
  release.mockClear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function userMessage(id: string): ChatMessage {
  return { id, role: 'user', content: 'hello', createdAt: 1 } as unknown as ChatMessage;
}

function chatPane(props: { messages: ChatMessage[]; activeConversationId: string }) {
  return (
    <ChatPane
      messages={props.messages}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'One', createdAt: 1, updatedAt: 1 },
        { projectId: 'project-1', id: 'conv-2', title: 'Two', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId={props.activeConversationId}
      messagesConversationId={props.activeConversationId}
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'claude', agentCliEnv: {} } as unknown as AppConfig}
    />
  );
}

describe('ChatPane releases the scroll takeover on a conversation switch', () => {
  it('calls releaseChatScrollTakeover when activeConversationId changes', () => {
    const { rerender } = render(
      chatPane({ messages: [userMessage('m1')], activeConversationId: 'conv-1' }),
    );
    const afterMount = release.mock.calls.length;

    rerender(chatPane({ messages: [userMessage('m2')], activeConversationId: 'conv-2' }));

    // Two: the cleanup for conv-1 and the effect for conv-2. Both are the same
    // idempotent release; the cleanup is what covers an unmount (below).
    expect(release.mock.calls.length).toBe(afterMount + 2);
  });

  it('releases when the panel unmounts', () => {
    // A route change or tab switch removes the chat log with no conversation
    // change; the takeover must not outlive the node it was engaged on.
    const { unmount } = render(
      chatPane({ messages: [userMessage('m1')], activeConversationId: 'conv-1' }),
    );
    const afterMount = release.mock.calls.length;

    unmount();

    expect(release.mock.calls.length).toBe(afterMount + 1);
  });

  it('does not release on a re-render that keeps the conversation', () => {
    const { rerender } = render(
      chatPane({ messages: [userMessage('m1')], activeConversationId: 'conv-1' }),
    );
    const afterMount = release.mock.calls.length;

    rerender(
      chatPane({ messages: [userMessage('m1'), userMessage('m2')], activeConversationId: 'conv-1' }),
    );

    expect(release.mock.calls.length).toBe(afterMount);
  });
});
