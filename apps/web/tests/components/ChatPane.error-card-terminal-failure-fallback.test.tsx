// @vitest-environment jsdom
//
// 红测:**一轮确实是终态失败,报错卡就必须在场** —— 哪怕这一轮的失败原因
// 一个字都算不出来。
//
// 缺陷:整张报错卡只有 `displayError` 一个开关(`ChatPane.tsx` 的
// `{displayError ? <RunErrorCard …/> : null}`),而标题、正文、〔联系支持〕
// 〔导出日志〕〔重试〕〔切换到 Cloud〕全在这个三元里面。
// `resolveRunErrorCardDescription` 的三条文案来源 ——
//   ① 映射表的 `messageKey`(兜底那一档本来就是 null)
//   ② 面板级 `error`(离开项目时 `ProjectView` 卸载,这个 state 归零)
//   ③ 消息上落库的 error 原文(`runs.ts` 的 `fail()` 不走
//      `persistRunEventToAssistantMessage`,所以 `AGENT_UNAVAILABLE` 这一族
//      退出重进就没了;`ProjectView` 自愈幽灵 running 时写的 `runStatus:'failed'`
//      也从来不附 error 帧)
// 三条同时落空时它返回 `{ render: 'none' }`,于是那一轮的失败原因和**所有恢复
// 入口**一起从屏幕上消失,只剩执行壳头一句孤零零的「运行失败」。
//
// 裁决(用户 2026-09-08):这种时候也要画一张**能说话、能操作**的卡。
//
// 这个文件的两半互为对照,缺一半都会让另一半变成空洞断言:
//   · 前半(会红):终态失败 + 三条来源全空 → 卡在场、说得出话、点得动对应运行来源的恢复动作;
//   · 后半(修前修后都必须绿)= 反向锚点,钉住「别修过头」:
//     空回复那一档、交接给别的 UI 那一档、成功的一轮,都仍然不出卡。
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import { RECONNECT_OWNED_FAILURE_CODE } from '../../src/runtime/amr-guidance';
import type { ChatReconnectView } from '../../src/runtime/chat/reconnect-state';
import type { AppConfig, ChatMessage } from '../../src/types';

// 身份翻译:断言直接钉 i18n key,读得出「用的是哪条文案」。
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

function renderChat(
  message: ChatMessage,
  overrides: {
    error?: string | null;
    onRetry?: (() => void) | null;
    reconnect?: ChatReconnectView;
  } = {},
) {
  const onRetry = overrides.onRetry === null ? undefined : (overrides.onRetry ?? vi.fn());
  const onSwitchToAmrAndRetry = vi.fn();
  return {
    onRetry,
    onSwitchToAmrAndRetry,
    ...render(
      <ChatPane
        messages={[message]}
        streaming={false}
        error={overrides.error ?? null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onSwitchToAmrAndRetry={onSwitchToAmrAndRetry}
        {...(onRetry ? { onRetry: onRetry as never } : {})}
        {...(overrides.reconnect ? { reconnect: overrides.reconnect } : {})}
        conversations={[
          { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
        ]}
        activeConversationId="conv-1"
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        config={{ agentId: 'claude', agentCliEnv: {} } as unknown as AppConfig}
      />,
    ),
  };
}

/** 一轮进程级失败,身上**什么都没有** —— 没有 error 事件,也就没有 code / 原文。 */
function failedRunWithNothingToSay(): ChatMessage {
  return {
    id: 'msg-failed',
    role: 'assistant',
    content: '',
    createdAt: 1,
    runId: 'run-1',
    runStatus: 'failed',
    agentId: 'claude',
    events: [],
  } as unknown as ChatMessage;
}

/**
 * 交付失败:agent 进程 `succeeded`,却什么都没交出来。
 * P0-24 起本轮是否失败只看运行记录,产物有没有交出来不改变状态,所以这一轮不再出卡。
 */
function deliveryFailedRun(
  state: 'no_result' | 'delivery_failed',
): ChatMessage {
  return {
    id: 'msg-delivery',
    role: 'assistant',
    content: '',
    createdAt: 1,
    runId: 'run-2',
    runStatus: 'succeeded',
    resultDeliveryState: state,
    agentId: 'claude',
    events: [],
  } as unknown as ChatMessage;
}

describe('终态失败 + 说不出原因:兜底报错卡', () => {
  it('进程级失败、身上没有任何 error 帧时,卡仍然在场并说出兜底那句话', () => {
    renderChat(failedRunWithNothingToSay());

    const card = screen.getByTestId('chat-run-error-card');
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('chat.runError.title.generic');
    expect(screen.getByTestId('chat-run-error-description').textContent).toBe(
      'chat.runError.fallbackMessage',
    );
  });

  it('CLI 失败卡上的 Cloud 动作传回原消息，不重试本地运行', () => {
    const message = failedRunWithNothingToSay();
    const { onRetry, onSwitchToAmrAndRetry } = renderChat(message);

    fireEvent.click(screen.getByTestId('chat-error-switch-to-cloud'));
    expect(onSwitchToAmrAndRetry).toHaveBeenCalledExactlyOnceWith(message);
    expect(screen.queryByTestId('chat-error-retry')).toBeNull();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('〔联系支持〕〔导出日志〕这两条不挑失败类型的出路也在', () => {
    renderChat(failedRunWithNothingToSay());

    expect(screen.getByTestId('chat-error-contact-support')).toBeTruthy();
    expect(screen.getByTestId('chat-error-export-logs')).toBeTruthy();
  });

  it.each(['no_result', 'delivery_failed'] as const)(
    'CLI 交付失败(resultDeliveryState=%s)不出卡:运行正常结束就不是失败(P0-24)',
    (state) => {
      renderChat(deliveryFailedRun(state));

      expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
      expect(screen.queryByTestId('chat-error-switch-to-cloud')).toBeNull();
    },
  );

  /*
   * 面板槽里那个**空串**曾经把消息上的原文一并遮掉 —— 它是更高优先级的来源,
   * 于是「空串赢了、卡不出」。代码注释当年自己写着「这份沉默对不对是另一个问题」。
   */
  it('面板级 error 是空串时,不再遮住这一轮自己的失败', () => {
    const message = {
      ...failedRunWithNothingToSay(),
      events: [
        { kind: 'status', label: 'error', detail: 'spawn ENOENT' },
      ],
    } as unknown as ChatMessage;

    renderChat(message, { error: '' });

    expect(screen.getByTestId('chat-run-error-description').textContent).toBe(
      'chat.runError.fallbackMessage',
    );
  });
});

describe('反向锚点:兜底不许铺到这三档上', () => {
  /*
   * 锚点 ①:API / BYOK 空回复也写 `runStatus:'failed'`,但它的状态词是
   * 「没有输出」,由 `e2e/ui/api-empty-response.test.ts` 那条 P0 钉死。
   * 那一格自己已经在说话,再压一张白卡就是两块 UI 说同一件事。
   */
  // P0-24 Q6:回合末尾整行删除,旧会话里落库为 failed 的空回复也不再出「任务未能完成」;
  // 兜底卡照旧不出(新产生的空回复已按正常结束)。
  it('空回复那一档(旧会话)不出兜底卡,回合末尾也不再出状态词', () => {
    const message = {
      id: 'msg-empty',
      role: 'assistant',
      content: '',
      createdAt: 1,
      runId: 'run-empty',
      runStatus: 'failed',
      agentId: null,
      events: [
        { kind: 'status', label: 'empty_response', detail: 'deepseek-v4-flash' },
        { kind: 'text', text: 'assistant.emptyResponseMessage' },
      ],
    } as unknown as ChatMessage;

    renderChat(message);

    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
    expect(screen.queryByTestId('assistant-label')).toBeNull();
  });

  /*
   * 锚点 ②:断线那一档由会话末尾的重连行负责说,整张卡都不出。
   *
   * 两处刻意:
   *  · **故意不给 detail** —— 三条文案来源同样全空,所以这一条直接证明兜底排在
   *    交接判据**之后**,不是靠「刚好有原文」侥幸绿;
   *  · **接手方真的在场**(传了 `reconnect`,并断言那一行画出来了)。交接只在
   *    接手方在场时才成立 —— 没人接的时候屏幕上一个字都不剩,那正是这次修的病。
   */
  it('已经交接给在场的重连行时仍然不出卡(哪怕它也说不出原因)', () => {
    const message = {
      ...failedRunWithNothingToSay(),
      id: 'msg-disconnected',
      runId: 'run-disconnected',
      events: [{ kind: 'status', label: 'error', code: RECONNECT_OWNED_FAILURE_CODE }],
    } as unknown as ChatMessage;

    renderChat(message, {
      reconnect: {
        reason: 'transport',
        runId: 'run-disconnected',
        conversationId: 'conv-1',
        attempt: 1,
        max: 5,
        exhausted: false,
        manualRetry: false,
      },
    });

    // 接手方在场 —— 这一行就是那句话的主人。
    expect(screen.getByTestId('chat-reconnect')).toBeTruthy();
    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
  });

  it('keeps the aggregated process running while a disconnect awaits the Run record', () => {
    const message: ChatMessage = {
      ...failedRunWithNothingToSay(),
      taskDisplay: { id: 'automatic-task', revision: 2, currentRunId: 'run-1',
        runIds: ['plan-run', 'run-1'], state: 'running',
        elapsedMs: 2_000, observedAt: Date.now(), ticking: true },
      events: [{ kind: 'thinking', text: 'Checking layout' },
        { kind: 'status', label: 'error', code: RECONNECT_OWNED_FAILURE_CODE }],
    };
    const view = renderChat(message);
    const summary = view.container.querySelector('[data-testid="assistant-flow"] > details > summary');
    expect(summary).toHaveTextContent('chat.record.running');
    expect(summary).not.toHaveTextContent('chat.record.failed');
    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
  });

  /** 锚点 ③:跑成了的一轮当然不出卡。 */
  it('成功的一轮不出卡', () => {
    const message = {
      id: 'msg-ok',
      role: 'assistant',
      content: 'Here you go.',
      createdAt: 1,
      runId: 'run-ok',
      runStatus: 'succeeded',
      agentId: 'claude',
      events: [],
    } as unknown as ChatMessage;

    renderChat(message);

    expect(screen.queryByTestId('chat-run-error-card')).toBeNull();
  });
});
