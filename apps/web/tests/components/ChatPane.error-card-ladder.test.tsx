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
import type { ComponentProps } from 'react';
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

function renderChat(
  message: ChatMessage,
  extraProps: Partial<ComponentProps<typeof ChatPane>> = {},
) {
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
      /*
       * 这份文件里凡是提到〔切换到 Cloud〕的判据,说的都是 `ProjectView` 那个宿主 ——
       * 也只有它接了这颗 CTA 的动作。夹具原来一个都没接,于是它模拟的其实是
       * `workspace/SideChatTab`(两个 AMR 口子都不接),而那儿这颗按钮点了没反应,
       * 现在也不再画。补上这一条,夹具才和它想照的那个宿主对得上;
       * 全文件 11 条断言的期望值一条都没动。
       */
      onSwitchToAmrAndRetry={vi.fn()}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'claude', agentCliEnv: {} } as unknown as AppConfig}
      {...extraProps}
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
  /*
   * ⚠️ OPEND-2772(T68)缩小了这一档的适用面,没有删掉它。
   *
   * 第 4 档的意思一直是「这张卡不能是死路」——上面三档都没答案时,把常驻次级的
   * 〔联系支持〕提上来。产品 2026-09-07 推翻 §6.Z 的阶梯之后,**非 Cloud 的卡主位
   * 归那颗〔切换到 Cloud〕**,那本身就是一条活路,所以这一档不再
   * 需要在 BYOK 上提〔联系支持〕。
   *
   * 提为主的场景**仍然存在**,而且正是最该有的那个:已经跑在 Cloud 上的 run
   * (它拿不到 Cloud CTA)。所以这一节改成两侧都钉,而不是把它删掉。
   */
  it('BYOK 封号:主位归 Cloud CTA,〔联系支持〕退回常驻次级', () => {
    renderChat(failedMessage({}, { failureDetail: 'account_suspended' }));
    const support = screen.getByTestId('chat-error-contact-support');
    expect(support.dataset.primary).toBeUndefined();
    expect(
      screen.getByTestId('chat-error-switch-to-cloud').dataset.runErrorAction,
    ).toBe('primary');
  });

  it('已经在 Cloud 上的封号:没有 Cloud CTA,〔联系支持〕仍然提为主', () => {
    renderChat(
      failedMessage({ agentId: 'amr' }, { failureDetail: 'account_suspended' }),
    );
    expect(screen.queryByTestId('chat-error-switch-to-cloud')).toBeNull();
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

  /*
   * ⚠️ 这两条原来是**不带 `reconnect`** 渲染的,断言仍然是「不出卡」——
   * 那钉住的是 bug,不是不变量:接手方不在场时让位,等于两边都不说话。
   * 现在两条都把接手方摆在场,钉的才是它们本来要钉的那件事:**认出**这条失败的
   * 两条线索(结构化 code / 老行只有 detail)各自都能触发交接。
   * 「接手方不在场」那一侧由下面两条负责。
   */
  it('持久化的断线行,重连行在场时不出报错卡', () => {
    const { container } = renderChat(
      failedMessage({}, {
        code: GENERIC_DAEMON_DISCONNECT_CODE,
        detail: GENERIC_DAEMON_DISCONNECT_MESSAGE,
      }),
      { reconnect: reconnectExhausted, onManualReconnect: vi.fn() },
    );
    expect(screen.getByTestId('chat-reconnect')).toBeTruthy();
    expect(container.querySelector('[data-user-action-card="run-recovery"]')).toBeNull();
  });

  it('这条码引入之前落库的行(只有 detail、没有 code)同样交给在场的重连行', () => {
    const { container } = renderChat(
      failedMessage({}, { code: undefined, detail: GENERIC_DAEMON_DISCONNECT_MESSAGE }),
      { reconnect: reconnectExhausted, onManualReconnect: vi.fn() },
    );
    expect(screen.getByTestId('chat-reconnect')).toBeTruthy();
    expect(container.querySelector('[data-user-action-card="run-recovery"]')).toBeNull();
  });

  /*
   * 交接只在接手方真的在场时成立 —— 这是余额那一档
   * (`balanceCardCannotTakeTheHandoff`)早就写死的同一条不变量,断线这一档漏了半边。
   *
   * 现场:一轮因断流失败,用户退出项目再进来。`ProjectView` 有一条专门的卸载
   * effect 把 `reconnectView` 清空(「换项目 / 离开这一屏,本地就不再跟着那条流了」),
   * 于是重连行不在场;而报错卡这边仍然无条件让位。两边都不说话,那一轮在屏幕上
   * 一个字都没有 —— 既没有失败的说明,也没有任何恢复入口。
   */
  it('重连行不在场时(退出项目再进来),断线那一轮必须由报错卡接住', () => {
    const { container } = renderChat(
      failedMessage({}, {
        code: GENERIC_DAEMON_DISCONNECT_CODE,
        detail: GENERIC_DAEMON_DISCONNECT_MESSAGE,
      }),
      { reconnect: null },
    );
    // 接手方不在场。
    expect(screen.queryByTestId('chat-reconnect')).toBeNull();
    // 所以这张卡不能再让位。
    const card = container.querySelector('[data-user-action-card="run-recovery"]');
    expect(card).toBeTruthy();
    // 说的是断线这件事本身,不是兜底那句。
    const description = card!.querySelector(
      '[data-testid="chat-run-error-description"]',
    )!.textContent;
    expect(description).toContain('chat.connectionDropped');
    expect(description).not.toContain('chat.runError.fallbackMessage');
    // 而且带得出恢复动作 —— 屏幕上什么都不剩才是这条 bug 的形状。
    expect(screen.getByTestId('chat-error-retry')).toBeTruthy();
  });

  it('重连行不在场时,老行(只有 detail、没有 code)同样由报错卡接住', () => {
    const { container } = renderChat(
      failedMessage({}, { code: undefined, detail: GENERIC_DAEMON_DISCONNECT_MESSAGE }),
      { reconnect: null },
    );
    expect(screen.queryByTestId('chat-reconnect')).toBeNull();
    expect(container.querySelector('[data-user-action-card="run-recovery"]')).toBeTruthy();
    expect(screen.getByTestId('chat-error-retry')).toBeTruthy();
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
