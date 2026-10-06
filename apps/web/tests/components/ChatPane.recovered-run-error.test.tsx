// @vitest-environment jsdom
//
// 红测:AMR 建会话超时(`session/new` 的长尾)不该在界面上留下一张
// 「Task failed + json-rpc 原文」的卡。
//
// 夹具形状**逐字取自真实那条 run**,不是编的:
//   `.od/runs/3199ce9d-ea9c-4f3a-8d49-a3ae9eee9829/events.jsonl`
//     [7]  +0.4s  start          amr
//     [9]  +32.9s error          json-rpc id 2: create opencode session: … context deadline exceeded
//     [10] +35.2s diagnostic     runtime_close · rpc_close_reason=fatal_rpc_error · exit 130
//     [11] +35.3s run_retry_attempted · retry_strategy=same_run_transient
//     [13] +35.7s start          amr(同一个 runId 的第二次尝试)
//     [20] +74.4s thinking_start(这一轮最终**成功**)
//   `.od/app.sqlite` → messages[home-auto-send-284oagizmtpio-assistant]
//     run_status = 'succeeded',events_json 里那条 error 事件**只有 detail**,
//     没有 code / failureCategory / failureDetail。
//   `state.json` → status='succeeded' · exitCode=0 · failureCategory=null。
//
// 也就是说:这一轮**没有失败**,daemon 自己重试了一次就跑通了。可面板级
// 那条 `error` 从来没有被撤回,于是一张报错卡挂在一次成功的运行下面,
// 卡面上摊着本机端口和文件路径。
//
// 三条断言互为对照:
//   1. 恢复了的那一轮**整张卡都不出** —— 修之前红;
//   2. 同一段原文,若这一轮**真的终态失败**了,卡照旧要出,而且是
//      「服务暂时不可用」(设计方案 S10)那一张,不是「Task failed + 原文」——
//      少了这条,第 1 条在整张卡压根没渲染时也会绿;
//   3. 余额不足那一路**不受影响** —— 少了这条,把所有报错糊成一句话也会绿。
import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import { resolveRunFailureUi } from '../../src/runtime/amr-guidance';
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

/** 真实那条 run 的 error 帧原文(只把用户名换成占位,其余逐字)。 */
const RAW_JSON_RPC =
  'json-rpc id 2: create opencode session: Post "http://127.0.0.1:54894/session'
  + '?directory=%2FUsers%2Fexample%2FDocuments%2Fod%2F.od%2Fprojects%2F59f3dc9c": '
  + 'context deadline exceeded';

const ASSISTANT_ID = 'home-auto-send-284oagizmtpio-assistant';
const RUN_ID = '3199ce9d-ea9c-4f3a-8d49-a3ae9eee9829';

/** `messages.events_json` 里那一串,顺序照抄(error 夹在两次 starting 中间)。 */
function recoveredRunEvents(): ChatMessage['events'] {
  return [
    { kind: 'status', label: 'starting', detail: 'amr' },
    { kind: 'status', label: 'error', detail: RAW_JSON_RPC },
    { kind: 'status', label: 'starting', detail: 'amr' },
    { kind: 'status', label: 'model', detail: 'deepseek-v4-flash' },
    { kind: 'status', label: 'thinking' },
    { kind: 'status', label: 'streaming', detail: 'first token in 202.9s' },
  ] as ChatMessage['events'];
}

function recoveredMessage(): ChatMessage {
  return {
    id: ASSISTANT_ID,
    role: 'assistant',
    content: 'Here is the analytics dashboard.',
    createdAt: 1,
    runId: RUN_ID,
    // 真实落库值。daemon 自己重试成功,这一轮是 succeeded。
    runStatus: 'succeeded',
    agentId: 'amr',
    events: recoveredRunEvents(),
  } as ChatMessage;
}

function renderChat(options: {
  message: ChatMessage;
  error?: string | null;
  errorSourceAssistantId?: string | null;
}) {
  return render(
    <ChatPane
      messages={[options.message]}
      streaming={false}
      error={options.error ?? null}
      errorSourceAssistantId={options.errorSourceAssistantId ?? null}
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
      config={{ agentId: 'amr', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

describe('同一轮内自愈的 AMR 建会话超时', () => {
  it('恢复了的那一轮不留报错卡', () => {
    const { container } = renderChat({
      message: recoveredMessage(),
      // 面板级那条 error 就是 onError 塞进去的原文(providers/daemon.ts
      // 在 SSE 断在 error 帧、状态探针没拿到终态时会把它抛出来)。
      error: RAW_JSON_RPC,
      errorSourceAssistantId: ASSISTANT_ID,
    });

    expect(
      container.querySelector('[data-user-action-card="run-recovery"]'),
    ).toBeNull();
    expect(container.querySelector('[data-testid="chat-run-error-card"]')).toBeNull();
  });

  it('本机端口和文件路径一个字都不出现在界面上', () => {
    const { container } = renderChat({
      message: recoveredMessage(),
      error: RAW_JSON_RPC,
      errorSourceAssistantId: ASSISTANT_ID,
    });

    expect(container.textContent).not.toContain('json-rpc id');
    expect(container.textContent).not.toContain('127.0.0.1');
    expect(container.textContent).not.toContain('context deadline exceeded');
    expect(container.textContent).not.toContain('%2FUsers%2F');
  });

  // 刷新之后:面板级那条 `error` 是会话内的临时状态,重开页面就没了,但那条
  // `status:error` 事件是**落库**的(daemon 的 runSseEventToPersistedAgentEvent
  // 把每一帧 error 都写进 messages.events_json,包括这条被自愈掉的)。
  // 这条守住「落库的那份也别冒出来」。
  it('刷新后重放落库的事件,原文同样不出现', () => {
    const { container } = renderChat({ message: recoveredMessage(), error: null });

    expect(container.querySelector('[data-testid="chat-run-error-card"]')).toBeNull();
    expect(container.textContent).not.toContain('json-rpc id');
    expect(container.textContent).not.toContain('context deadline exceeded');
  });
});

// 正向对照:同一段原文,若重试也失败、这一轮真的落了终态失败,卡要出 ——
// 而且是设计方案 S10「服务暂时不可用」那一张(daemon 已经自动重试过一次,
// S10 的时机写的就是「自动重试都失败后」),不是「Task failed + 原文」。
describe('重试也失败:同一段原文该出 S10「服务暂时不可用」', () => {
  function terminallyFailedMessage(): ChatMessage {
    return {
      id: ASSISTANT_ID,
      role: 'assistant',
      content: '',
      createdAt: 1,
      runId: RUN_ID,
      runStatus: 'failed',
      agentId: 'amr',
      events: [
        { kind: 'status', label: 'starting', detail: 'amr' },
        {
          kind: 'status',
          label: 'error',
          detail: RAW_JSON_RPC,
          // daemon 分类器对这条真实输入的判定(classifyRunFailure,
          // 输入 = error 帧 + runtime_close/rpc_close_reason=fatal_rpc_error + exit 130):
          // process_exit / fatal_rpc_error / retryable。
          code: 'AGENT_EXECUTION_FAILED',
          failureCategory: 'process_exit',
          failureDetail: 'fatal_rpc_error',
        },
      ],
    } as ChatMessage;
  }

  it('卡上是「服务暂时不可用」和那句人话,不是原文', () => {
    const { container } = renderChat({ message: terminallyFailedMessage() });

    const card = container.querySelector<HTMLElement>(
      '[data-user-action-card="run-recovery"]',
    );
    expect(card).toBeTruthy();
    expect(card!.textContent).toContain('chat.runError.title.upstreamUnavailable');

    const description = card!.querySelector('[data-testid="chat-run-error-description"]');
    // 身份翻译把 {agent} 的值接在 key 后面,所以比 contain 不比等号。
    expect(description?.textContent).toContain('chat.runError.upstreamUnavailableMessage');
    // 兜底那句被顶掉了才算真的命中 S10 —— 少了这条,兜底也会 contain 不到而已。
    expect(description?.textContent).not.toContain('chat.runError.fallbackMessage');

    expect(card!.textContent).not.toContain('json-rpc id');
    expect(card!.textContent).not.toContain('127.0.0.1');
    expect(card!.textContent).not.toContain('context deadline exceeded');
  });

  it('那一排动作照旧画得出来', () => {
    renderChat({ message: terminallyFailedMessage() });

    expect(screen.getByTestId('chat-error-contact-support')).toBeTruthy();
    expect(screen.getByTestId('chat-error-export-logs')).toBeTruthy();
  });
});

// 反向对照:本来就该说清楚的那一类(余额不足)不受影响 ——
// 少了这条,把所有报错糊成同一句话也会绿。
//
// 断言从「卡面」下移到了**映射**:用户 2026-09-02 裁决之后,余额那一档在流水里
// 交给升级卡(交付稿组件 18),报错卡整张不画(`suppressCard`),所以这里没有
// 卡面文字可读。要守的东西没变 —— 这一路仍然有它自己那份人话,没被 S10
// 「服务暂时不可用」糊掉。
describe('余额不足那一路没有被连带糊掉', () => {
  it('照旧是余额那一份文案,而且整张报错卡让位给升级卡', () => {
    const message = {
      id: 'msg-balance',
      role: 'assistant',
      content: '',
      createdAt: 1,
      runId: 'run-balance',
      runStatus: 'failed',
      agentId: 'amr',
      events: [
        {
          kind: 'status',
          label: 'error',
          detail: 'Insufficient balance',
          code: 'AMR_INSUFFICIENT_BALANCE',
        },
      ],
    } as ChatMessage;

    const ui = resolveRunFailureUi('AMR_INSUFFICIENT_BALANCE', undefined, 'amr');
    expect(ui.titleKey).toBe('chat.runError.title.balance');
    expect(ui.messageKey).toBe('chat.amrError.balanceMessage');
    expect(ui.suppressCard).toBe(true);

    const { container } = renderChat({ message });

    // 白色通用报错卡不在了 —— 钱的事只有升级卡一张。
    expect(container.querySelector('[data-user-action-card="run-recovery"]')).toBeNull();
  });
});
