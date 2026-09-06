// @vitest-environment jsdom
//
// 红测(OPEND-2597):**跑到一半余额不足只该有升级卡,不该出第二张白色通用报错卡。**
//
// 用户 2026-09-02 裁决:「额度不足和额度耗尽,升级卡各只有一张,不存在第二张
// 白色通用报错卡」。
//
// 在此之前只有「发送前」那一个口出升级卡(`ProjectView` 的余额闸门 → `amrBalanceCardUsd`);
// 「跑到一半」那条走的是 daemon 的 `AMR_INSUFFICIENT_BALANCE` → `amr-guidance` 的
// 通用 `failureCard` → 白色 `RunErrorCard` + 四颗按钮。同一件事两张卡、两种说法,
// 正是设计稿要避免的。
//
// 这一页断言的是**渲染出来的东西**,不是映射表的字段:从真实的 `<ChatPane>` 出发,
// 给它产品真实会给的 props,然后数 DOM 里有几张卡。
//
// 反向对照同样是这一页的一部分:别的失败(客户端环境类 · S30、超时)**仍然**
// 画白色报错卡。少了这一条,「把整条报错路都改掉」会一路绿着推上去。

import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../../src/types';

const translate = (key: string, vars?: Record<string, string | number>) => {
  if (vars && Object.keys(vars).length > 0) {
    return `${key} ${Object.values(vars).join(' ')}`;
  }
  return key;
};

vi.mock('../../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

vi.mock('../../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`assistant-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock('../../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../../src/components/AmrGuidance', () => ({
  AmrGuidance: () => <div data-testid="amr-guidance" />,
}));

vi.mock('../../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/analytics/events')>();
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

/** 一轮已经开始、跑到一半才死掉的 AMR 回合。 */
function failedMidRun(
  event: { code?: string; failureDetail?: string; detail?: string },
): ChatMessage {
  return {
    id: 'msg-failed',
    role: 'assistant',
    content: 'Partial work before the failure.',
    createdAt: 1,
    runId: 'run-failed',
    runStatus: 'failed',
    agentId: 'amr',
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: event.detail ?? 'Something went wrong.',
        ...(event.code ? { code: event.code } : {}),
        ...(event.failureDetail ? { failureDetail: event.failureDetail } : {}),
      },
    ],
  } as ChatMessage;
}

function renderChat(opts: {
  messages?: ChatMessage[];
  amrBalanceCardUsd?: number | null;
  amrBalanceCardUnavailable?: boolean;
} = {}) {
  return render(
    <ChatPane
      messages={opts.messages ?? []}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      amrBalanceCardUsd={opts.amrBalanceCardUsd ?? null}
      amrBalanceCardUnavailable={opts.amrBalanceCardUnavailable ?? false}
      onOpenSettings={vi.fn() as never}
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

/**
 * 「白色通用报错卡在不在」。用精确查询 + `toBeNull()`,不用否定式匹配 ——
 * 后者在选择器写错时会永远为真。
 */
function genericErrorCard(container: HTMLElement): Element | null {
  return container.querySelector('[data-user-action-card="run-recovery"]');
}

describe('跑到一半余额不足:只有升级卡', () => {
  it('AMR_INSUFFICIENT_BALANCE 出升级卡,不出白色通用报错卡', () => {
    const { container } = renderChat({
      messages: [failedMidRun({ code: 'AMR_INSUFFICIENT_BALANCE' })],
      // 余额已经查过了(见 ProjectView 那一页的接线断言),$0 = 耗尽档。
      amrBalanceCardUsd: 0,
    });

    // 升级卡在场,而且是「额度耗尽」那一档(红数字)。
    const upgrade = screen.getByTestId('chat-upgrade-card');
    expect(upgrade.getAttribute('data-out')).toBe('true');

    // 第二张卡不存在 —— 连同它那四颗按钮。
    expect(genericErrorCard(container)).toBeNull();
    expect(screen.queryByTestId('chat-error-contact-support')).toBeNull();
    expect(screen.queryByTestId('chat-error-export-logs')).toBeNull();
  });

  /*
   * 交接不是删除:`suppressCard` 说的是「别人已经在说这件事了」,而这里的
   * 「别人」是升级卡 —— 它只在钱包读数**读得出确定数字**时才画得出来
   * (`ProjectView` 在失败之后补查一次)。读不出来的时候没有任何人在说话,
   * 这时还按下白卡,用户在一轮「钱不够」的失败之后**屏幕上什么都不剩**:
   * 没有充值入口,也没有重试。那是这条 P0 路上唯一的自救口
   * (`e2e/ui/amr-run-failure-recovery.test.ts:118`)。
   *
   * 所以交接只在接手方真的在场时成立;接不住就把白卡还回来。
   */
  it('钱包读不出数字时把白卡还回来:充值入口和重试都必须还在', () => {
    const { container } = renderChat({
      messages: [failedMidRun({ code: 'AMR_INSUFFICIENT_BALANCE' })],
      // 补查落空:没有数字,所以升级卡画不出来。
      amrBalanceCardUsd: null,
      amrBalanceCardUnavailable: true,
    });

    expect(screen.queryByTestId('chat-upgrade-card')).toBeNull();
    expect(genericErrorCard(container)).toBeTruthy();
    // 主按钮是〔充值〕,次按钮是〔重试〕—— 充值落在带外,所以重试是手动的。
    expect(screen.getByText('chat.amrError.rechargeCta')).toBeTruthy();
    expect(screen.getByTestId('chat-error-retry')).toBeTruthy();
  });

  /*
   * 反向:补查还没回来的那一格**不出白卡**。否则每次余额不足都要先闪一下
   * 白卡再换成升级卡 —— 用户 2026-09-02 裁决的「一张卡」会被闪成两张。
   */
  it('补查还没落地时,一张卡都不画(不闪白卡)', () => {
    const { container } = renderChat({
      messages: [failedMidRun({ code: 'AMR_INSUFFICIENT_BALANCE' })],
      amrBalanceCardUsd: null,
      amrBalanceCardUnavailable: false,
    });

    expect(screen.queryByTestId('chat-upgrade-card')).toBeNull();
    expect(genericErrorCard(container)).toBeNull();
  });

  it('余额 > 0 的那一档同样只有一张卡(告警档)', () => {
    const { container } = renderChat({
      messages: [failedMidRun({ code: 'AMR_INSUFFICIENT_BALANCE' })],
      amrBalanceCardUsd: 1.2,
    });

    const upgrade = screen.getByTestId('chat-upgrade-card');
    expect(upgrade.getAttribute('data-out')).toBe('false');
    expect(genericErrorCard(container)).toBeNull();
  });
});

describe('反向对照:别的失败照旧画通用报错卡', () => {
  it('客户端环境类失败(证书 · S30)仍然是白色报错卡,且没有升级卡', () => {
    const { container } = renderChat({
      messages: [failedMidRun({ failureDetail: 'certificate_failure' })],
    });

    expect(genericErrorCard(container)).toBeTruthy();
    expect(screen.getByTestId('chat-error-contact-support')).toBeTruthy();
    expect(screen.getByTestId('chat-error-export-logs')).toBeTruthy();
    expect(screen.queryByTestId('chat-upgrade-card')).toBeNull();
  });

  it('超时仍然是白色报错卡', () => {
    const { container } = renderChat({
      messages: [failedMidRun({ failureDetail: 'timeout' })],
    });

    expect(genericErrorCard(container)).toBeTruthy();
    expect(screen.queryByTestId('chat-upgrade-card')).toBeNull();
  });

  it('AMR 的登录失效仍然是白色报错卡 —— 那一档说的不是钱', () => {
    const { container } = renderChat({
      messages: [failedMidRun({ code: 'AMR_AUTH_REQUIRED' })],
    });

    expect(genericErrorCard(container)).toBeTruthy();
    expect(screen.queryByTestId('chat-upgrade-card')).toBeNull();
  });
});
