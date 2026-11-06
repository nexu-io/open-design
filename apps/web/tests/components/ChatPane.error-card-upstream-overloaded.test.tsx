// @vitest-environment jsdom
//
// 红测:上游过载(`[code=upstream_error]` / 「Our servers are currently
// overloaded」)这一族在报错卡上**没有自己的文案**。
//
// 链路(逐层核过,非推测):
//  1. vela 把 opencode 的 `session.error` 事件整段拼成一句诊断
//     (`apps/cli/internal/agent/acp_runtime.go` 的
//     `openCodeEventStreamSanitizedDiagnosticMessage`),形如
//     `opencode event stream: {…} (event=session.error, session=ses_…)`;
//  2. daemon 的 ACP 层再前缀一段 `json-rpc id N: `
//     (`agent-protocol/acp/rpc.ts` 的 `rpcErrorMessage`),然后 `fail()`
//     把它原样当 `message` 发出去,`error.code` 写死 `AGENT_EXECUTION_FAILED`
//     (`agent-protocol/acp/session.ts` 的 `fail`)—— ACP 这条路**不走**
//     `classifyAgentServiceFailure`,所以永远拿不到 `UPSTREAM_UNAVAILABLE`
//     那颗 web 认得的码;
//  3. daemon 的失败分类器**认得**这段文本:`failure_detail = upstream_5xx`、
//     `retryable: true`、`user_action: 'retry'`(实测,非推测);
//  4. web 的 `AGENT_AGNOSTIC_DETAIL_FAILURE_UI` **没有 `upstream_5xx` 这一行**
//     —— `amr-guidance.ts` 里 `daemonNamedTheFailure` 的注释自己点了名:
//     「there are both futile ones (`spawn_enoexec`, `cli_version_incompatible`)
//     and genuinely transient ones (`upstream_5xx`, `provider_high_demand`)」。
//     于是整轮落到最后那张通用卡:`messageKey: null` → 标题「任务执行失败」。
//
// 目标文案不是新写的:`specs/current/run-error-catalog.md` R-051 把
// 「上游 5xx / 过载 529 / 网关 502 upstream_error」明确挂在
// `upstream_5xx` / `provider_high_demand`,目标场景是
// `docs/design/run-errors/error-ux-design.md` 的 S10「模型服务商报错 / 过载」;
// 而 S10 在本仓的落点已经存在 —— 同一张表里的 `fatal_rpc_error` 就指着
// `chat.runError.title.upstreamUnavailable` /
// `chat.runError.upstreamUnavailableMessage`。
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
 * 用户 2026-09-07 在打包版 `0.21.2-beta.1`(AMR profile = test)截图里那张卡上的
 * 原文,逐字。**不是造的形状** —— 尾巴上那句 `(event=session.error, session=…)`
 * 是 vela 自己拼的(`openCodeEventStreamPromptErrorMessage` 的 details 串),
 * 前缀 `json-rpc id 4: ` 是 daemon 的 `rpcErrorMessage` 加的。
 */
const RAW_UPSTREAM_OVERLOADED =
  'json-rpc id 4: opencode event stream: {"id":"evt_079e7523a001q84xvEDieo4RPa",'
  + '"properties":{"error":{"data":{"message":"\\"[code=upstream_error] Our servers are '
  + 'currently overloaded. Please try again later.\\""},"name":"UnknownError"},'
  + '"sessionID":"ses_f86193cfdffevgdF9Hpf8QQcGF"},"type":"session.error"}'
  + ' (event=session.error, session=ses_f86193cfdffevgdF9Hpf8QQcGF)';

/** 用户绝不该在卡面上读到的碎片。 */
const LEAKED_FRAGMENTS = ['json-rpc', '{"id":"evt_', 'sessionID', 'properties'];

function failedMessage(failureDetail: string): ChatMessage {
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
        detail: RAW_UPSTREAM_OVERLOADED,
        // ACP 这条路 `fail()` 写死的那颗码 —— 不是 `UPSTREAM_UNAVAILABLE`。
        code: 'AGENT_EXECUTION_FAILED',
        // daemon 分类器实测给出的那一档。
        failureDetail,
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
      // 真实链路里 `ProjectView` 会把同一段原文塞进面板级 error 槽
      // (`setRunError(err.message, assistantId)`),这里照搬。
      error={RAW_UPSTREAM_OVERLOADED}
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

const titleOf = (container: HTMLElement) =>
  cardOf(container)?.firstElementChild ?? null;

describe('上游过载(R-051 / S10)在报错卡上有自己的文案', () => {
  // 先证明「不含这些碎片」这条量法**看得见缺陷** —— 夹具里这四段确实都在。
  it('夹具就是真实那条原文,四段碎片一个不少', () => {
    for (const fragment of LEAKED_FRAGMENTS) {
      expect(RAW_UPSTREAM_OVERLOADED).toContain(fragment);
    }
  });

  it.each([
    ['upstream_5xx'],
    ['provider_high_demand'],
  ])('%s → 服务暂时不可用,不是通用「任务执行失败」', (failureDetail) => {
    const { container } = renderChat(failedMessage(failureDetail));
    const description = descriptionOf(container);
    expect(description).toBeTruthy();
    expect(titleOf(container)!.textContent).toContain(
      'chat.runError.title.upstreamUnavailable',
    );
    expect(description!.textContent).toContain(
      'chat.runError.upstreamUnavailableMessage',
    );
  });

  it.each([
    ['upstream_5xx'],
    ['provider_high_demand'],
  ])('%s → JSON-RPC 信封 / 事件 id / sessionID 一个字都不上卡面', (failureDetail) => {
    const { container } = renderChat(failedMessage(failureDetail));
    const text = descriptionOf(container)!.textContent ?? '';
    for (const fragment of LEAKED_FRAGMENTS) {
      expect(text).not.toContain(fragment);
    }
    expect(text).not.toContain('Our servers are currently overloaded');
  });

  // R-051 的目标行为里带着 Retry(「可重试、可 Continue」),S10 的按钮是
  // 〔重试 | 更换模型〕。这里只钉「重试还在」——「更换模型」是另一颗,产品要单独拍。
  it.each([
    ['upstream_5xx'],
    ['provider_high_demand'],
  ])('%s → 仍然给得出〔重试〕', (failureDetail) => {
    const { container } = renderChat(failedMessage(failureDetail));
    expect(
      cardOf(container)!.querySelector('[data-testid="chat-error-retry"]'),
    ).toBeTruthy();
  });
});
