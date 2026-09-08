// @vitest-environment jsdom
//
// 反向锚点:ACP 阶段看门狗杀掉的那一轮,卡面必须是「运行超时」+〔重试〕。
//
// 为什么现在补这条:daemon 侧把阶段超时改成**带名字**地发出去了
// (`agent-protocol/acp/session.ts` 的看门狗 `fail()` 现在带
// `retryable: true` + `details.kind = 'timeout'`),副作用是落盘的
// `status:error` 事件从此多了一颗 `code`(`AGENT_EXECUTION_FAILED`)——
// 之前 `run.errorCode` 是 null,这颗码根本不存在。
//
// `resolveRunFailureUi` 的顺序是「码表 → 具名 detail 表 → agent 分支」,
// 所以新来的这颗码如果哪天被加进 `AGENT_AGNOSTIC_FAILURE_UI`,就会**抢在**
// `AGENT_AGNOSTIC_DETAIL_FAILURE_UI['timeout']` 前面把这张卡改掉,而
// daemon 侧看不到任何红。这条钉的就是那个夹缝:码在与不在,卡面都得是超时。
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

/** 看门狗自己写的那句,逐字 —— 用户真实那一轮是 1800000ms。 */
const RAW_STAGE_TIMEOUT = 'ACP session/prompt timed out after 1800000ms';

function failedMessage(code?: string): ChatMessage {
  return {
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
        detail: RAW_STAGE_TIMEOUT,
        ...(code ? { code } : {}),
        // daemon 分类器实测给出的那一档(见
        // apps/daemon/tests/acp-stage-timeout-wiring.test.ts)。
        failureDetail: 'timeout',
        failureAction: 'retry',
        retryable: true,
      },
    ],
  } as unknown as ChatMessage;
}

function renderChat(message: ChatMessage) {
  return render(
    <ChatPane
      messages={[message]}
      streaming={false}
      error={RAW_STAGE_TIMEOUT}
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
}

const cardOf = (container: HTMLElement) =>
  container.querySelector('[data-user-action-card="run-recovery"]');

const descriptionOf = (container: HTMLElement) =>
  cardOf(container)?.querySelector('[data-testid="chat-run-error-description"]') ?? null;

const titleOf = (container: HTMLElement) => cardOf(container)?.firstElementChild ?? null;

describe('阶段超时的报错卡', () => {
  it.each([
    ['落盘事件不带码(修复前的形状)', undefined],
    ['落盘事件带上 AGENT_EXECUTION_FAILED(修复后的形状)', 'AGENT_EXECUTION_FAILED'],
  ])('%s → 「运行超时」而不是通用「任务执行失败」', (_name, code) => {
    const { container } = renderChat(failedMessage(code as string | undefined));
    expect(titleOf(container)!.textContent).toContain('chat.runError.title.timedOut');
    expect(descriptionOf(container)!.textContent).toContain(
      'chat.runError.timedOutMessage',
    );
  });

  it.each([
    ['不带码', undefined],
    ['带码', 'AGENT_EXECUTION_FAILED'],
  ])('%s → 给得出〔重试〕', (_name, code) => {
    const { container } = renderChat(failedMessage(code as string | undefined));
    expect(
      cardOf(container)!.querySelector('[data-testid="chat-error-retry"]'),
    ).toBeTruthy();
  });
});
