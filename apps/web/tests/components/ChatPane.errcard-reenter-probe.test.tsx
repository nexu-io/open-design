// @vitest-environment jsdom
//
// 调查用探针(invest/errcard-lost-on-reenter):「一轮失败之后,退出 project、
// 再进来,报错卡不见了」。
//
// 「再进来」= ProjectView 整个卸载重挂(App.tsx 的 `else if (activeProject)`
// 分支 + `key=projectViewAuthorizationLifetimeKey`),转录只能从
// `GET /api/projects/:id/conversations/:cid/messages` 重建。所以重挂之后:
//   · 面板级 `error` / `errorSourceAssistantId` 一定是 null(内存态,没有缓存);
//   · 消息上只剩**有数据库列**的字段(db.ts `normalizeMessage`);
//     `resumable` / `strategyTaskBlocked` 没有列 —— 重挂后必然丢失。
//
// 这个文件把几种失败形态各造一条「重挂后的转录」,只问一件事:
// 报错卡(`[data-user-action-card="run-recovery"]`)还在不在。
import { cleanup, render } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const userTurn: ChatMessage = {
  id: 'msg-user',
  role: 'user',
  content: 'Make me a deck.',
  createdAt: 1,
} as ChatMessage;

/** 守护进程自己写的失败帧(`runSseEventToPersistedAgentEvent` 的 `error` 分支)。 */
function daemonErrorEvent(extra: Record<string, unknown> = {}) {
  return {
    kind: 'status',
    label: 'error',
    detail: 'The agent stopped responding.',
    ...extra,
  };
}

/** 重挂之后 ChatPane 拿到的 props:面板级 error 一定是 null。 */
function renderReentered(messages: ChatMessage[]) {
  return render(
    <ChatPane
      messages={messages}
      streaming={false}
      error={null}
      errorSourceAssistantId={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'claude', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

/** 失败那一刻的 props:面板级 error 还装着那一轮的原文。 */
function renderLive(messages: ChatMessage[], assistantId: string) {
  return render(
    <ChatPane
      messages={messages}
      streaming={false}
      error="The agent stopped responding."
      errorSourceAssistantId={assistantId}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'claude', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

function hasErrorCard(container: HTMLElement): boolean {
  return !!container.querySelector('[data-user-action-card="run-recovery"]');
}

describe('error card after leaving and re-entering the project', () => {
  it('A · daemon-written failure with a persisted error frame keeps its card', () => {
    const { container } = renderReentered([
      userTurn,
      {
        id: 'msg-a',
        role: 'assistant',
        content: 'Partial work.',
        createdAt: 2,
        startedAt: 2,
        endedAt: 3,
        runId: 'run-1',
        runStatus: 'failed',
        agentId: 'claude',
        events: [daemonErrorEvent({ failureDetail: 'agent_timeout' })],
      } as ChatMessage,
    ]);
    expect(hasErrorCard(container)).toBe(true);
  });

  it('B · a host-authored card (memory / brand assist) landing after the failed turn keeps its card', () => {
    const { container } = renderReentered([
      userTurn,
      {
        id: 'msg-a',
        role: 'assistant',
        content: 'Partial work.',
        createdAt: 2,
        startedAt: 2,
        endedAt: 3,
        runId: 'run-1',
        runStatus: 'failed',
        agentId: 'claude',
        events: [daemonErrorEvent({ failureDetail: 'agent_timeout' })],
      } as ChatMessage,
      // Persisted host card: no runId / runStatus / startedAt / endedAt.
      {
        id: 'msg-memory',
        role: 'assistant',
        content: 'Wrote 3 memories.\n\n<od-card type="memory-written">{}</od-card>',
        createdAt: 4,
        agentId: 'claude',
        events: [{ kind: 'text', text: 'Wrote 3 memories.' }],
      } as ChatMessage,
    ]);
    expect(hasErrorCard(container)).toBe(true);
  });

  it('C · a failed turn whose ONLY error text was the pane slot loses its card on re-entry', () => {
    // Live: pane error present -> card. Re-entered: pane error gone and the
    // message carries no persisted error frame -> ?
    const message = {
      id: 'msg-a',
      role: 'assistant',
      content: 'Partial work.',
      createdAt: 2,
      startedAt: 2,
      endedAt: 3,
      runId: 'run-1',
      runStatus: 'failed',
      agentId: 'claude',
      events: [{ kind: 'text', text: 'Partial work.' }],
    } as ChatMessage;
    const live = renderLive([userTurn, message], 'msg-a');
    expect(hasErrorCard(live.container)).toBe(true);
    cleanup();
    const reentered = renderReentered([userTurn, message]);
    expect(hasErrorCard(reentered.container)).toBe(true);
  });

  it('D · a delivery failure (run succeeded, resultDeliveryState no_result) keeps its card', () => {
    const { container } = renderReentered([
      userTurn,
      {
        id: 'msg-a',
        role: 'assistant',
        content: 'Here is the plan.',
        createdAt: 2,
        startedAt: 2,
        endedAt: 3,
        runId: 'run-1',
        runStatus: 'succeeded',
        resultDeliveryState: 'no_result',
        agentId: 'claude',
        events: [
          {
            kind: 'status',
            label: 'error',
            detail: 'The design run finished without producing a deliverable project file.',
            code: 'ARTIFACT_NOT_FOUND',
          },
        ],
      } as ChatMessage,
    ]);
    expect(hasErrorCard(container)).toBe(true);
  });

  it('E · a delivery failure whose client-appended error frame did not survive the PUT keeps its card', () => {
    const { container } = renderReentered([
      userTurn,
      {
        id: 'msg-a',
        role: 'assistant',
        content: 'Here is the plan.',
        createdAt: 2,
        startedAt: 2,
        endedAt: 3,
        runId: 'run-1',
        runStatus: 'succeeded',
        resultDeliveryState: 'no_result',
        agentId: 'claude',
        events: [{ kind: 'text', text: 'Here is the plan.' }],
      } as ChatMessage,
    ]);
    expect(hasErrorCard(container)).toBe(true);
  });

  it('F · a user message after the failed turn intentionally retires the card', () => {
    const { container } = renderReentered([
      userTurn,
      {
        id: 'msg-a',
        role: 'assistant',
        content: 'Partial work.',
        createdAt: 2,
        startedAt: 2,
        endedAt: 3,
        runId: 'run-1',
        runStatus: 'failed',
        agentId: 'claude',
        events: [daemonErrorEvent({ failureDetail: 'agent_timeout' })],
      } as ChatMessage,
      { id: 'msg-user-2', role: 'user', content: 'ok', createdAt: 5 } as ChatMessage,
    ]);
    expect(hasErrorCard(container)).toBe(false);
  });
});
