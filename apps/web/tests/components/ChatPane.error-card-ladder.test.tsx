// @vitest-environment jsdom
//
// 红测(E2 / E6):报错卡上不许出现上游原始错误串,第 4 档的〔联系支持〕要提为主。
//
// 权威:`specs/current/run-error-catalog.md` §6.Z;
//       `docs/design/run-errors/error-ux-design.md` 原则五「文案说人话」。
//
// 在改之前:
//   - `ChatPane.tsx` 的 `displayError = runFailureUi?.messageKey ? t(...) : rawError`
//     会把一段英文 stderr 直接摊在卡面上 → 第一个用例红;
//   - 〔联系支持〕永远是 `variant="secondary"`,没有「提为主」这条路 → 第二个用例红。
import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import {
  GENERIC_DAEMON_DISCONNECT_CODE,
  GENERIC_DAEMON_DISCONNECT_MESSAGE,
} from '../../src/providers/daemon';
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// 一段真实形状的上游原文:英文、带栈尾。今天它会被原样摊在卡面上。
const RAW_STDERR =
  'Error: spawn ENOENT\n    at ChildProcess._handle.onexit (node:internal/child_process:286:19)';

function failedMessage(
  overrides: Partial<ChatMessage> = {},
  errorEvent: Record<string, unknown> = {},
): ChatMessage {
  return {
    id: 'msg-failed',
    role: 'assistant',
    content: 'Partial work.',
    createdAt: 1,
    runId: 'run-1',
    runStatus: 'failed',
    agentId: 'claude',
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: RAW_STDERR,
        code: 'AGENT_EXECUTION_FAILED',
        ...errorEvent,
      },
    ],
    ...overrides,
  } as ChatMessage;
}

function renderChat(message: ChatMessage) {
  return render(
    <ChatPane
      messages={[message]}
      streaming={false}
      error={null}
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

describe('报错卡兜底文案(E2)', () => {
  it('没命中映射表时卡面给人话,不摊上游原文', () => {
    // `failureDetail` 缺失 → 走最后那条 catch-all,`messageKey` 为 null。
    const { container } = renderChat(failedMessage());

    const card = container.querySelector('[data-user-action-card="run-recovery"]');
    expect(card).toBeTruthy();

    const description = card!.querySelector('[data-testid="chat-run-error-description"]');
    expect(description).toBeTruthy();
    expect(description!.textContent).toBe('chat.runError.fallbackMessage');
    // 卡面上不许出现那段 stderr。
    expect(description!.textContent).not.toContain('spawn ENOENT');
  });

  // 「原文收在折叠里」那条用例已随折叠一起删掉(用户 2026-08-27)。
  // 「卡上没有折叠、也没有原文」现在钉在
  // `ChatPane.error-card-no-details.test.tsx`。

  it('命中了映射表的失败,照旧用它自己的文案(兜底不许盖掉专属文案)', () => {
    const { container } = renderChat(
      failedMessage({}, { failureDetail: 'process_crashed' }),
    );
    const description = container.querySelector(
      '[data-user-action-card="run-recovery"] [data-testid="chat-run-error-description"]',
    );
    expect(description).toBeTruthy();
    // S19 的专属文案,不是兜底那条。
    expect(description!.textContent).toContain('chat.runError.agentCrashedMessage');
    expect(description!.textContent).not.toBe('chat.runError.fallbackMessage');
  });
});

describe('第 4 档:联系支持提为主(E6)', () => {
  it('封号这张卡上的〔联系支持〕是主按钮', () => {
    renderChat(failedMessage({}, { failureDetail: 'account_suspended' }));
    const support = screen.getByTestId('chat-error-contact-support');
    expect(support.dataset.primary).toBe('true');
  });

  it('普通可重试的卡上,〔联系支持〕仍是常驻次级', () => {
    renderChat(failedMessage({}, { failureDetail: 'process_crashed' }));
    const support = screen.getByTestId('chat-error-contact-support');
    expect(support.dataset.primary).toBeUndefined();
  });
});

describe('R9 断线:报错卡让位给流水最后一行的重连行', () => {
  // 传输层重连预算用尽时的顺序是 `emitReconnect('exhausted')` → `onError(...)`
  // (`providers/daemon.ts`),于是这一刻**两块 UI 的数据同时在手**:
  // 流水最后一行的〔重新连接〕,和一张写着「任务执行失败」的通用报错卡。
  // 交付稿第 84 格只画了前者。
  const reconnectExhausted = {
    // 「交回给人」那一档只属于传输层:自动重试烧完预算之后接手的是报错卡,
    // 不是一颗〔重新连接〕。
    reason: 'transport' as const,
    runId: 'run-1',
    conversationId: 'conv-1',
    attempt: 5,
    max: 5,
    exhausted: true,
    // 传输层交回给人的那一行,不是「按下之后的乐观读数」。
    manualRetry: false,
  };

  it('持久化的断线行不出报错卡', () => {
    const { container } = renderChat(
      failedMessage({}, {
        code: GENERIC_DAEMON_DISCONNECT_CODE,
        detail: GENERIC_DAEMON_DISCONNECT_MESSAGE,
      }),
    );
    expect(container.querySelector('[data-user-action-card="run-recovery"]')).toBeNull();
  });

  it('这条码引入之前落库的行(只有 detail、没有 code)同样不出卡', () => {
    const { container } = renderChat(
      failedMessage({}, { code: undefined, detail: GENERIC_DAEMON_DISCONNECT_MESSAGE }),
    );
    expect(container.querySelector('[data-user-action-card="run-recovery"]')).toBeNull();
  });

  it('重连行在场时,屏幕上只有它一块 UI', () => {
    const { container } = render(
      <ChatPane
        messages={[
          failedMessage({}, {
            code: GENERIC_DAEMON_DISCONNECT_CODE,
            detail: GENERIC_DAEMON_DISCONNECT_MESSAGE,
          }),
        ]}
        streaming={false}
        error={GENERIC_DAEMON_DISCONNECT_MESSAGE}
        reconnect={reconnectExhausted}
        onManualReconnect={vi.fn()}
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
    // 重连行在。
    expect(screen.getByTestId('chat-reconnect')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'chat.edge.reconnectCta' })).toBeTruthy();
    // 报错卡不在 —— 这才是「不同时出现」。
    expect(container.querySelector('[data-user-action-card="run-recovery"]')).toBeNull();
  });

  // 反向:上游模型那条连接断了(S11)跟 SSE 重连不是一回事,那张卡要留着。
  it('不误伤 S11:上游连接中断照旧出卡', () => {
    const { container } = renderChat(
      failedMessage({}, { code: 'AGENT_CONNECTION_DROPPED', detail: 'stream closed' }),
    );
    expect(container.querySelector('[data-user-action-card="run-recovery"]')).toBeTruthy();
  });
});
