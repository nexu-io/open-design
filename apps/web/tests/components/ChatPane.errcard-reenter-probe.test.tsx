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
//
// ## 三个 ref 上跑同一份用例的结果(2026-09-08)
//
// 21 格全部是**实跑出来的**(7 用例 × 3 ref,`vitest run --reporter=verbose`),
// 没有一格是推出来的。跑法:在本 worktree 内 `git checkout <ref>`,把这个文件
// 拷进去跑,再 checkout 回来。
//
// | 用例                                   | 9180cfdb3e | 1bdc052283 | d82385309f |
// |                                        | (#7518 前) | (#7518 后, | (main,     |
// |                                        |            |  #7863 前) |  #7863 后) |
// |----------------------------------------|-----------|-----------|-----------|
// | A 守护进程写的失败 + 落库 error 帧      |    绿     |    绿     |    绿     |
// | B 宿主卡(记忆卡)顶在队尾              |    红     |    红     |  绿(修好)|
// | C 失败轮没有落库的 error 帧             |    红     |    红     |    红     |
// | D 交付失败 + error 帧                   |    绿     |    绿     |    绿     |
// | E 交付失败、error 帧没落库              |    红     |    红     |    红     |
// | G 断流失败(DAEMON_STREAM_DISCONNECTED) |  **绿**   |  **红**   |  **红**   |
// | F 失败轮后面有用户消息(按设计收卡)     |    绿     |    绿     |    绿     |
//
// 读法:
//  · #7863(`4c5873c7cc`)**不是**病因 —— 它只把 B 从红修成绿,C/E/G 三格前后一模一样。
//  · G 是 **#7518(`ad09d38839`,2026-09-07)引入的回归**:那一版给
//    `DAEMON_STREAM_DISCONNECTED` 加了 `suppressCard: true`,把这条失败交给
//    「重新连接」那一行去说;而那一行是 `ProjectView` 的 `reconnectView`
//    useState(ProjectView.tsx:3284)—— 退出 project 就没了。交接对象不在场,
//    卡也不画,那一轮失败在屏幕上一个字都不剩。
//    ⚠️ 对比:紧挨着的余额那一档**检查了**接手方在不在
//    (`balanceCardCannotTakeTheHandoff`,ChatPane.tsx:2257),断流这一档没有。
//  · C / E 是老问题,#7518 前后同形:整张卡唯一的开关是 `displayError`
//    (ChatPane.tsx:4213),而它在「映射表没有文案 + 面板 error 为空 +
//    消息上没有 error 帧」三者同时成立时会变 null。
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

  it('G · a stream-disconnect failure keeps something on screen after re-entry', () => {
    // Live, the reconnect row owns this failure and the card is deliberately
    // suppressed (R9). After re-entry the `reconnect` prop is gone.
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
        events: [daemonErrorEvent({ code: 'DAEMON_STREAM_DISCONNECTED' })],
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
