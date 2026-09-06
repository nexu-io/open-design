// @vitest-environment jsdom
//
// 红测:面板错误槽里装着**这一轮自己的**原始报错时,卡面仍然会摊出上游原文。
//
// `ChatPane` 里那条链的最后一段是 `: rawError`,而它前面的守卫是
// `!currentGlobalError` —— 偏偏 `currentGlobalError` 就是被这一轮的失败
// (`setRunError(err.message, assistantId)`)填进原始串的那个。于是:
//
//   没命中映射表 + 面板错误是这一轮自己填的 → 兜底句被跳过 → 原文上卡面
//
// 这正是用户看到 JSON-RPC 技术串的那条路。已经修掉的 `AGENT_EXECUTION_FAILED`
// 那一族走的是「面板错误为空、只有消息上的持久化事件」那条线,所以
// `ChatPane.error-card-ladder.test.tsx` 的第一条用例绿着,漏的是另一半。
//
// 判据不能是「面板里有没有错误」,只能是「这条面板错误是谁填的」:
//   · `setRunError(message, assistantId)` —— 三处调用点,全是运行失败,带来源
//   · `setError(...)` —— 其余全部,`sourceAssistantId` 一律置 null
// 所以 `errorSourceAssistantId` 就是那条判据,而且它早就接到 `ChatPane` 上了。
import { cleanup, render } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    trackRunRecoveryActionClick: vi.fn(),
    trackRunRecoveryActionSurfaceView: vi.fn(),
  };
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

/**
 * 用户 2026-08-27 截图里那张卡上的原文,逐字。这不是造的形状 —— 真机
 * `.od/runs/0e40b819-…/events.jsonl` 第 10 条 error 帧就是这一句。
 */
const RAW_RPC =
  'json-rpc id 2: create opencode session: Post "http://127.0.0.1:58525/session?directory=%2FUsers%2F…": context deadline exceeded';

const FAILED: ChatMessage = {
  id: 'msg-failed',
  role: 'assistant',
  content: '',
  createdAt: 1,
  runId: 'run-1',
  runStatus: 'failed',
  agentId: 'amr',
  events: [
    {
      kind: 'status',
      label: 'error',
      detail: RAW_RPC,
      // 没人认领的码 —— 走最后那条 catch-all,`messageKey` 为 null。
      code: 'AGENT_EXIT_130',
    },
  ],
} as unknown as ChatMessage;

function renderChat(props: { error: string | null; errorSourceAssistantId?: string | null }) {
  return render(
    <ChatPane
      messages={[FAILED]}
      streaming={false}
      error={props.error}
      errorSourceAssistantId={props.errorSourceAssistantId ?? null}
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

const descriptionOf = (container: HTMLElement) =>
  container.querySelector(
    '[data-user-action-card="run-recovery"] [data-testid="chat-run-error-description"]',
  );

describe('面板错误来自这一轮时,卡面仍然给人话', () => {
  it('原始 JSON-RPC 串不上卡面', () => {
    const { container } = renderChat({
      error: RAW_RPC,
      errorSourceAssistantId: 'msg-failed',
    });
    const description = descriptionOf(container);
    expect(description).toBeTruthy();
    // 逐字浮现会拆文本节点,读 textContent。
    expect(description!.textContent).toBe('chat.runError.fallbackMessage');
    expect(description!.textContent).not.toContain('json-rpc');
    expect(description!.textContent).not.toContain('context deadline exceeded');
  });

  it('英文 stderr 也一样不上卡面', () => {
    const { container } = renderChat({
      error: 'Error: spawn ENOENT\n    at ChildProcess._handle.onexit',
      errorSourceAssistantId: 'msg-failed',
    });
    expect(descriptionOf(container)!.textContent).toBe('chat.runError.fallbackMessage');
  });
});

describe('不误伤:跟这一轮无关的面板错误照旧自己说话', () => {
  // 这条是那个 `!currentGlobalError` 守卫当初要保护的东西:面板级错误
  // (会话加载失败之类)本来就是我们自己写的人话,而且优先级更高。它没有来源
  // 助手,所以新判据认得出来。
  it('没有来源助手的面板错误不会被兜底句顶掉', () => {
    const { container } = renderChat({
      error: 'Could not load this conversation.',
      errorSourceAssistantId: null,
    });
    expect(descriptionOf(container)!.textContent).toBe('Could not load this conversation.');
  });

  // 另一轮失败留下的面板错误也不算这一轮的 —— 判据是「同一条助手消息」,
  // 不是「有没有来源」。
  it('别的助手留下的运行错误也不会被当成这一轮的', () => {
    const { container } = renderChat({
      error: 'Some other run blew up.',
      errorSourceAssistantId: 'msg-someone-else',
    });
    expect(descriptionOf(container)!.textContent).toBe('Some other run blew up.');
  });
});

describe('命中映射表的失败仍然用它自己的文案', () => {
  it('专属文案赢过兜底,也赢过面板里的原文', () => {
    const mapped = {
      ...FAILED,
      events: [
        {
          kind: 'status',
          label: 'error',
          detail: RAW_RPC,
          code: 'AGENT_EXECUTION_FAILED',
          failureDetail: 'process_crashed',
        },
      ],
    } as unknown as ChatMessage;
    const { container } = render(
      <ChatPane
        messages={[mapped]}
        streaming={false}
        error={RAW_RPC}
        errorSourceAssistantId="msg-failed"
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
    expect(descriptionOf(container)!.textContent).toContain(
      'chat.runError.agentCrashedMessage',
    );
  });
});
