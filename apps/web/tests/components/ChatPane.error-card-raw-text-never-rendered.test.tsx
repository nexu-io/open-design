// @vitest-environment jsdom
//
// 红测:报错卡的描述位**按分支落点**决定要不要摊原文,而不是按「这段字是谁写的」。
// 于是每多一条没被映射表认领的失败,就多一次把 daemon 传上来的原始报错摊给用户的
// 机会 —— 补映射表救不了,因为漏的是**那条回落本身**。
//
// `ChatPane` 今天那条链(`displayError`)的最后一段是 `: rawError`,前面拦着它的
// 条件是「`runFailureUi` 在场」且「面板槽里那段字是这一轮自己填的」。两个条件里
// **任何一个不成立**,原文就直接上卡面:
//
//  · `runFailureUi` 为 null ⟺ `retryAssistant` 为 null(`resolveRunFailureUi`
//    永远返回对象,不返回 null —— 见 `amr-guidance.ts` 末尾那张通用卡)。而
//    `retryableAssistantMessage` 要求**转录的最后一条**是终态失败的助手消息。
//    宿主自己会在一轮之后补发助手消息(`ProjectView` 的 brand-browser-assist 卡,
//    `appendConversationMessage(...role: 'assistant'...)`,没有 `runStatus`),
//    补上之后「最后一条」就不是那条失败了 → `runFailureUi` 为 null → 摊原文。
//
//  · 面板槽里那段字来自**别的**助手(`setRunError(msg, 那条消息的 id)`,
//    ProjectView 三处)。判据写的是「等于这一轮的 id」,不等就当成「跟这一轮无关的
//    人话」原样放行 —— 可它的出处一样是 `err.message`,一样是原文。
//
// ⚠️ 要藏的是**传输信封**(事件 id、sessionID、properties、本机端口与路径),
// **不是失败本身**:卡照出、按钮照给、原文照留在诊断面(〔导出日志〕→
// `/api/diagnostics/export`,以及消息上持久化的那条 error 事件)。
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
 * 真实形状之一:用户 2026-09-07 在打包版 `0.21.2-beta.1` 截图里那张卡上的原文,
 * **逐字**(与 `ChatPane.error-card-upstream-overloaded.test.tsx` 同一份)。
 * 尾巴 `(event=session.error, session=…)` 是 vela 拼的,前缀 `json-rpc id 4: `
 * 是 daemon 的 `rpcErrorMessage` 加的。
 */
const RAW_JSON_RPC_ENVELOPE =
  'json-rpc id 4: opencode event stream: {"id":"evt_079e7523a001q84xvEDieo4RPa",'
  + '"properties":{"error":{"data":{"message":"\\"[code=upstream_error] Our servers are '
  + 'currently overloaded. Please try again later.\\""},"name":"UnknownError"},'
  + '"sessionID":"ses_f86193cfdffevgdF9Hpf8QQcGF"},"type":"session.error"}'
  + ' (event=session.error, session=ses_f86193cfdffevgdF9Hpf8QQcGF)';

/**
 * 真实形状之二:2026-08-27 那次,真机 `.od/runs/0e40b819-…/events.jsonl` 第 10 条
 * error 帧,逐字(与 `ChatPane.error-card-raw-leak.test.tsx` 同一份)。
 * 这一条摊的是**本机端口和项目路径**。
 */
const RAW_RPC_LOCAL_ENDPOINT =
  'json-rpc id 2: create opencode session: Post "http://127.0.0.1:58525/session?directory=%2FUsers%2F…": context deadline exceeded';

/** 真实形状之三:子进程起不来时 daemon 原样上抛的 Node 栈。 */
const RAW_NODE_STDERR =
  'Error: spawn ENOENT\n    at ChildProcess._handle.onexit (node:internal/child_process:286:19)';

/**
 * 用户绝不该在卡面上读到的碎片(题面点名的六个,加上本机端口/路径)。
 */
const LEAKED_FRAGMENTS = [
  'json-rpc',
  '{"',
  'sessionID',
  'evt_',
  'properties',
  'ses_',
];

const LOCAL_ENDPOINT_FRAGMENTS = ['json-rpc', '127.0.0.1', '%2FUsers'];

/** 没人认领的码 —— 走 `resolveRunFailureUi` 末尾那张通用卡,`messageKey` 为 null。 */
const UNMAPPED_CODE = 'AGENT_EXIT_130';

function failedAssistant(detail: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-failed',
    role: 'assistant',
    content: '',
    createdAt: 1,
    runId: 'run-1',
    runStatus: 'failed',
    agentId: 'amr',
    events: [
      { kind: 'status', label: 'error', detail, code: UNMAPPED_CODE },
    ],
    ...overrides,
  } as unknown as ChatMessage;
}

/**
 * 宿主在失败之后自己补发的那条助手消息 —— `ProjectView` 的 brand-browser-assist
 * 卡(`appendConversationMessage`,role assistant,**没有** `runStatus`)。
 * 它一落地,「最后一条是终态失败的助手消息」就不成立了。
 */
const HOST_APPENDED_CARD: ChatMessage = {
  id: 'msg-host-card',
  role: 'assistant',
  content: 'chat.brandBrowserAssistMessage\n\n<od-card type="brand-browser-assist">{}</od-card>',
  createdAt: 2,
  agentId: 'amr',
  events: [{ kind: 'text', text: 'chat.brandBrowserAssistMessage' }],
} as unknown as ChatMessage;

function renderChat(props: {
  messages: ChatMessage[];
  error: string | null;
  errorSourceAssistantId?: string | null;
}) {
  return render(
    <ChatPane
      messages={props.messages}
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

describe('量法自检:碎片确实在夹具里', () => {
  it('三份夹具都是真形状,不是被删干净的假样本', () => {
    for (const fragment of LEAKED_FRAGMENTS) {
      expect(RAW_JSON_RPC_ENVELOPE).toContain(fragment);
    }
    for (const fragment of LOCAL_ENDPOINT_FRAGMENTS) {
      expect(RAW_RPC_LOCAL_ENDPOINT).toContain(fragment);
    }
    expect(RAW_NODE_STDERR).toContain('spawn ENOENT');
  });
});

describe('宿主补发助手消息之后,失败轮的原文仍然不许上卡面', () => {
  // `retryAssistant` 为 null → `runFailureUi` 为 null → 今天直接走最后那条 `: rawError`。
  it('JSON-RPC 信封不上卡面', () => {
    const { container } = renderChat({
      messages: [failedAssistant(RAW_JSON_RPC_ENVELOPE), HOST_APPENDED_CARD],
      error: RAW_JSON_RPC_ENVELOPE,
      errorSourceAssistantId: 'msg-failed',
    });
    const text = descriptionOf(container)?.textContent ?? '';
    expect(text).toBeTruthy();
    for (const fragment of LEAKED_FRAGMENTS) {
      expect(text).not.toContain(fragment);
    }
    expect(text).toBe('chat.runError.fallbackMessage');
  });

  it('本机端口与项目路径也不上卡面', () => {
    const { container } = renderChat({
      messages: [failedAssistant(RAW_RPC_LOCAL_ENDPOINT), HOST_APPENDED_CARD],
      error: RAW_RPC_LOCAL_ENDPOINT,
      errorSourceAssistantId: 'msg-failed',
    });
    const text = descriptionOf(container)?.textContent ?? '';
    for (const fragment of LOCAL_ENDPOINT_FRAGMENTS) {
      expect(text).not.toContain(fragment);
    }
    expect(text).toBe('chat.runError.fallbackMessage');
  });

  it('Node 栈也不上卡面', () => {
    const { container } = renderChat({
      messages: [failedAssistant(RAW_NODE_STDERR), HOST_APPENDED_CARD],
      error: RAW_NODE_STDERR,
      errorSourceAssistantId: 'msg-failed',
    });
    expect(descriptionOf(container)!.textContent).toBe('chat.runError.fallbackMessage');
  });
});

describe('面板槽里装着别的助手留下的原文时,也不许上卡面', () => {
  // `runFailureUi` 在场但 `messageKey` 为 null,而面板那段字的来源不是这一轮 ——
  // 今天判据是「等不等于这一轮的 id」,不等就原样放行。可它的出处一样是
  // `setRunError(err.message, …)`,一样是原文。
  it('JSON-RPC 信封不上卡面', () => {
    const { container } = renderChat({
      messages: [failedAssistant(RAW_JSON_RPC_ENVELOPE)],
      error: RAW_JSON_RPC_ENVELOPE,
      errorSourceAssistantId: 'msg-some-earlier-assistant',
    });
    const text = descriptionOf(container)?.textContent ?? '';
    for (const fragment of LEAKED_FRAGMENTS) {
      expect(text).not.toContain(fragment);
    }
    expect(text).toBe('chat.runError.fallbackMessage');
  });
});

describe('反向:已经对的行为一条都不许弄坏', () => {
  it('面板级的自家文案(没有来源助手)照旧逐字显示', () => {
    const { container } = renderChat({
      messages: [failedAssistant(RAW_JSON_RPC_ENVELOPE), HOST_APPENDED_CARD],
      error: 'Could not load this conversation.',
      errorSourceAssistantId: null,
    });
    expect(descriptionOf(container)!.textContent).toBe('Could not load this conversation.');
  });

  it('命中映射表的失败仍然用它自己的文案', () => {
    const mapped = failedAssistant(RAW_JSON_RPC_ENVELOPE, {
      events: [
        {
          kind: 'status',
          label: 'error',
          detail: RAW_JSON_RPC_ENVELOPE,
          code: 'AGENT_EXECUTION_FAILED',
          failureDetail: 'process_crashed',
        },
      ],
    } as unknown as Partial<ChatMessage>);
    const { container } = renderChat({
      messages: [mapped],
      error: RAW_JSON_RPC_ENVELOPE,
      errorSourceAssistantId: 'msg-failed',
    });
    expect(descriptionOf(container)!.textContent).toContain(
      'chat.runError.agentCrashedMessage',
    );
  });

  it('〔重试〕的出现条件不变:失败轮在场时仍然给', () => {
    const { container } = renderChat({
      messages: [failedAssistant(RAW_JSON_RPC_ENVELOPE)],
      error: RAW_JSON_RPC_ENVELOPE,
      errorSourceAssistantId: 'msg-failed',
    });
    expect(container.querySelector('[data-testid="chat-error-retry"]')).toBeTruthy();
  });

  it('〔重试〕的出现条件不变:失败轮不在最后时本来就没有,改完仍然没有', () => {
    const { container } = renderChat({
      messages: [failedAssistant(RAW_JSON_RPC_ENVELOPE), HOST_APPENDED_CARD],
      error: RAW_JSON_RPC_ENVELOPE,
      errorSourceAssistantId: 'msg-failed',
    });
    expect(container.querySelector('[data-testid="chat-error-retry"]')).toBeNull();
  });

  it('原文的出口还在:每张卡都带着〔联系支持〕〔导出日志〕', () => {
    const { container } = renderChat({
      messages: [failedAssistant(RAW_JSON_RPC_ENVELOPE), HOST_APPENDED_CARD],
      error: RAW_JSON_RPC_ENVELOPE,
      errorSourceAssistantId: 'msg-failed',
    });
    expect(container.querySelector('[data-testid="chat-error-export-logs"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="chat-error-contact-support"]')).toBeTruthy();
  });
});
