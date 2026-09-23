// @vitest-environment jsdom
//
// `ChatPane` has three hosts — `ProjectView`, `DesignSystemFlow` and this one,
// `workspace/SideChatTab`. They all render the same panel, feed the same
// observability modules, and land on the same dashboard.
//
// The first cut of this wiring set `conversation_id` / `project_id` inside
// ProjectView, after its transcript request resolved. Every `client_chat_*`
// event from the other two hosts therefore went out naming no project and no
// conversation — an orphan row on the same tile, indistinguishable from a
// genuinely un-correlated one. Both hosts were already passing the two ids in
// as props; the component boundary is where they belong.
//
// This spec renders the REAL ChatPane inside a non-ProjectView host and reads
// the beacon, not the module state: an event that goes out anonymous is the
// failure, so the assertion has to be on the event.

import { cleanup, render } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SideChatTab } from '../../../src/components/workspace/SideChatTab';
import {
  clearExceptionTrackingContext,
  setExceptionTrackingContext,
} from '../../../src/analytics/error-tracking';
import { __resetChatContextForTest } from '../../../src/observability/chat-context';
import { __resetChatHealthForTest } from '../../../src/observability/chat-health';
import type { AppConfig, ChatMessage, Conversation } from '../../../src/types';

const translate = (key: string) => key;

vi.mock('../../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

vi.mock('../../../src/components/Icon', () => ({
  Icon: () => <span data-testid="icon" />,
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
  };
});

vi.mock('../../../src/components/workspace/useConversationChat', () => ({
  useConversationChat: () => ({
    messages: [
      { id: 'm1', role: 'user', content: 'hello', createdAt: 1 },
    ] as ChatMessage[],
    streaming: false,
    loading: false,
    sendDisabled: true,
    error: null,
    onSend: vi.fn(),
    onStop: vi.fn(),
  }),
}));

const fetchMock = vi.fn();
const ORIGINAL_FETCH = globalThis.fetch;

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
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  setExceptionTrackingContext({
    apiKey: 'phc_test',
    host: 'https://us.i.posthog.com',
    distinctId: 'side-chat-correlation-test',
    clientType: 'web',
    osName: 'Mac OS X',
  });
  __resetChatHealthForTest();
  __resetChatContextForTest();
});

afterEach(() => {
  cleanup();
  __resetChatHealthForTest();
  __resetChatContextForTest();
  clearExceptionTrackingContext();
  globalThis.fetch = ORIGINAL_FETCH;
  vi.clearAllMocks();
});

function safetyEvents(name: string): Array<Record<string, unknown>> {
  const decoded: Array<{ event?: string; properties?: Record<string, unknown> }> = [];
  for (const call of fetchMock.mock.calls) {
    const init = call[1] as RequestInit | undefined;
    if (typeof init?.body !== 'string') continue;
    try {
      decoded.push(JSON.parse(init.body) as { event?: string; properties?: Record<string, unknown> });
    } catch {
      // not a telemetry beacon
    }
  }
  return decoded.filter((e) => e.event === name).map((e) => e.properties ?? {});
}

const conversations = [
  {
    id: 'conv-side',
    title: 'Side chat',
    createdAt: 1,
    updatedAt: 1,
    projectId: 'project-side',
    messageCount: 1,
    sessionMode: 'design',
  },
] as unknown as Conversation[];

function renderSideChat() {
  return render(
    <SideChatTab
      projectId="project-side"
      conversationId="conv-side"
      config={{ mode: 'daemon', agentCliEnv: {} } as unknown as AppConfig}
      agentsById={new Map()}
      locale="en"
      projectFiles={[]}
      conversations={conversations}
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
    />,
  );
}

describe('SideChatTab — chat telemetry knows which conversation it is in', () => {
  it('stamps the project and conversation on the events it emits', () => {
    renderSideChat();

    const samples = safetyEvents('client_chat_dom_growth');
    expect(samples).toHaveLength(1);
    expect(samples[0]?.project_id).toBe('project-side');
    expect(samples[0]?.conversation_id).toBe('conv-side');
  });

  it('carries the same identity on first paint', () => {
    // First paint is the event a triager reaches for when someone says the
    // panel was slow to open; without these two it names no subject at all.
    renderSideChat();

    const paints = safetyEvents('client_chat_first_paint');
    expect(paints).toHaveLength(1);
    expect(paints[0]?.project_id).toBe('project-side');
    expect(paints[0]?.conversation_id).toBe('conv-side');
  });
});
