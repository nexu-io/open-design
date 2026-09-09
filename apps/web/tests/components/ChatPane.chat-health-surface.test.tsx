// @vitest-environment jsdom
//
// `chat-health.ts` has answered four questions since #7518 — how long until
// the user can read the conversation, is the DOM growing without bound, who is
// about to OOM, how janky is the UI while a run streams — and has never been
// called by anything but its own unit spec. All four tiles were empty in
// production.
//
// These specs pin the WIRING, from the outside: the chat log gets a monitor
// when the panel mounts, a fresh one when the user switches conversation, and
// none at all once the panel goes away. Every assertion reads the beacons the
// module actually sends, never a spy on the module — a spy would go green on a
// call that emitted nothing.

import { cleanup, render } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import {
  clearExceptionTrackingContext,
  setExceptionTrackingContext,
} from '../../src/analytics/error-tracking';
import {
  __resetChatHealthForTest,
  chatSurfaceSample,
} from '../../src/observability/chat-health';
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
    distinctId: 'chat-health-surface-test',
  });
  __resetChatHealthForTest();
});

afterEach(() => {
  cleanup();
  __resetChatHealthForTest();
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

function userMessage(id: string, events?: unknown[]): ChatMessage {
  return {
    id,
    role: 'user',
    content: 'hello',
    createdAt: 1,
    ...(events ? { events } : {}),
  } as unknown as ChatMessage;
}

function assistantMessage(id: string, eventCount: number): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: 'sure',
    createdAt: 2,
    events: Array.from({ length: eventCount }, (_, i) => ({
      kind: 'tool',
      label: `tool-${i}`,
    })),
  } as unknown as ChatMessage;
}

function chatPane(props: {
  messages: ChatMessage[];
  activeConversationId: string;
}) {
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

describe('ChatPane — chat-health surface lifecycle', () => {
  it('starts monitoring the chat log as soon as the panel is on screen', () => {
    render(chatPane({ messages: [userMessage('m1')], activeConversationId: 'conv-1' }));

    // The opening baseline. Without it the DOM/heap curve's first point waits
    // 60s, and "already huge on open" is indistinguishable from "grew while
    // open".
    const samples = safetyEvents('client_chat_dom_growth');
    expect(samples).toHaveLength(1);
    expect(samples[0]?.sample_reason).toBe('conversation_open');
    // Correlation is set by ChatPane itself, so it is already on the very
    // first beacon the surface sends — whichever of the three hosts mounted
    // the panel. An event ordering that stamped it later would leave this one
    // anonymous.
    expect(samples[0]?.project_id).toBe('project-1');
    expect(samples[0]?.conversation_id).toBe('conv-1');
  });

  it('measures first paint against the transcript it actually rendered', () => {
    render(
      chatPane({
        messages: [userMessage('m1'), assistantMessage('m2', 7)],
        activeConversationId: 'conv-1',
      }),
    );

    const paints = safetyEvents('client_chat_first_paint');
    expect(paints).toHaveLength(1);
    expect(paints[0]?.message_count).toBe(2);
    // Ships with markFirstPaint or the duration is a number nobody can
    // attribute: a slow open is either "many messages" or "one message with
    // hundreds of tool events behind it", and only this separates them.
    expect(paints[0]?.stream_event_count).toBe(7);
    expect(paints[0]?.virtualized).toBe(false);
    expect(typeof paints[0]?.duration_ms).toBe('number');
  });

  it('reports the same virtualization verdict the renderer used', () => {
    // Reverse anchor for the case above. The threshold lives in one predicate
    // now; if telemetry ever grew its own copy this pair would stay green
    // while the two drifted, so both sides of the threshold are pinned.
    const many = Array.from({ length: 90 }, (_, i) => userMessage(`m${i}`));
    render(chatPane({ messages: many, activeConversationId: 'conv-1' }));

    const paints = safetyEvents('client_chat_first_paint');
    expect(paints).toHaveLength(1);
    expect(paints[0]?.virtualized).toBe(true);
    expect(paints[0]?.message_count).toBe(90);
  });

  it('re-opens on a conversation switch even though React keeps the same node', () => {
    // The chat log carries no conversation key, so React reuses the very same
    // element across a switch. There is therefore NO node-level signal that
    // the surface should be replaced — only the conversation id, which is why
    // it has to be an effect dependency. This spec is the witness: it asserts
    // node identity is unchanged AND that a second surface opened anyway.
    const { container, rerender } = render(
      chatPane({ messages: [userMessage('m1')], activeConversationId: 'conv-1' }),
    );
    const first = container.querySelector('[data-testid="chat-log"]');
    expect(first).toBeTruthy();

    rerender(chatPane({ messages: [userMessage('m9')], activeConversationId: 'conv-2' }));
    const second = container.querySelector('[data-testid="chat-log"]');

    expect(second).toBe(first);
    const samples = safetyEvents('client_chat_dom_growth');
    expect(samples.map((s) => s.sample_reason)).toEqual([
      'conversation_open',
      'conversation_open',
    ]);
    // …and the second one names the conversation the user switched TO, not
    // the one they left.
    expect(samples[1]?.conversation_id).toBe('conv-2');
  });

  it('lets go of the surface when the panel unmounts', () => {
    // The leak this guards: observers and a 60s interval outliving the log
    // they were watching. `chatSurfaceSample` is the module's own "is anything
    // attached?" seam — after teardown it must have nothing to talk to.
    const { unmount } = render(
      chatPane({ messages: [userMessage('m1')], activeConversationId: 'conv-1' }),
    );
    expect(safetyEvents('client_chat_dom_growth')).toHaveLength(1);

    unmount();
    chatSurfaceSample('interval');

    expect(safetyEvents('client_chat_dom_growth')).toHaveLength(1);
  });

  it('keeps exactly one surface attached across a re-open', () => {
    // Reverse anchor for the teardown above: a detach that also cleared a
    // LIVE surface (or a re-open that left the old one running) would show up
    // here as zero or two samples from one call.
    const { rerender } = render(
      chatPane({ messages: [userMessage('m1')], activeConversationId: 'conv-1' }),
    );
    rerender(chatPane({ messages: [userMessage('m1')], activeConversationId: 'conv-2' }));

    fetchMock.mockClear();
    chatSurfaceSample('interval');

    const samples = safetyEvents('client_chat_dom_growth');
    expect(samples).toHaveLength(1);
    expect(samples[0]?.sample_reason).toBe('interval');
  });
});
