// @vitest-environment jsdom
//
// 红测:**产品的渲染路径**有没有真的把这几张卡渲染出来。
//
// 这次审计暴露的 bug 形态是「画了没接」——`UpgradeCard` / `SupportDialog` 抽成组件、
// 陈列页 `import` 进来渲染、截图全绿,而产品(`ChatPane`)一行都没引用它们。
// 陈列页那一页**结构上照不出这件事**:它自己 import,自己渲染。
//
// 所以这里的每一条断言都从 `<ChatPane>` 出发 —— 只给产品真实会给的 props,
// 断言 DOM 里出现了那张卡。组件本身能不能渲染不是这里要证的东西。
//
// 覆盖:
//   1. 报错卡三颗动作齐(〔联系支持〕〔导出日志〕+ 主动作),且前两颗**常驻** ——
//      连 `cpu_unsupported` 这种今天一颗按钮都没有的失败也要有。
//   2. 点〔联系支持〕开 `SupportDialog`(组件 19 · 第 80 格)。
//   3. `AMR_MODEL_UNAVAILABLE` 给的是「换个模型」而**不是**重试(设计原则四)。
//   4. 升级卡在**流水里**(最后一轮之后、输入框之前),两档由余额决定,且**不挡发送**。

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

function failedMessage(
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
  error?: string | null;
  onRetry?: (m: ChatMessage) => void;
  onOpenSettings?: (section?: string) => void;
  amrBalanceCardUsd?: number | null;
  onSend?: (...args: unknown[]) => void;
} = {}) {
  return render(
    <ChatPane
      messages={opts.messages ?? []}
      streaming={false}
      error={opts.error ?? null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={opts.onSend ?? vi.fn()}
      onStop={vi.fn()}
      onRetry={opts.onRetry ?? vi.fn()}
      amrBalanceCardUsd={opts.amrBalanceCardUsd ?? null}
      onOpenSettings={opts.onOpenSettings as never}
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

describe('ChatPane — 报错卡的常驻动作', () => {
  function expectSecondaryActionsShareOneShell(): void {
    const support = screen.getByTestId('chat-error-contact-support');
    const exportLogs = screen.getByTestId('chat-error-export-logs');

    expect(support.getAttribute('data-run-error-action')).toBe('secondary');
    expect(exportLogs.getAttribute('data-run-error-action')).toBe('secondary');
    /* 比的是**壳**:同一个 `RunErrorCardAction` ⇒ 同一套 radius/padding/字重。
       `od-tooltip` 不是壳的一部分,它只是 `TooltipLayer` 的挂钩 —— 稿子
       `729fa43ce7 · src/body-scene.html:302` 只给〔联系支持〕挂 `data-tip`,
       〔导出日志〕(`src/body-components.html:1453`)一个都没有,所以这一枚
       标记本来就该只出现在其中一颗身上。把它摘掉再比,判据不变。 */
    expect(shellClasses(support)).toEqual(shellClasses(exportLogs));
  }

  /** 壳的类名 = 去掉行为标记之后剩下的那些 */
  function shellClasses(el: Element): string[] {
    return String(el.className).trim().split(/\s+/).filter((c) => c && c !== 'od-tooltip');
  }

  it('每一张报错卡都带〔联系支持〕和〔导出日志〕两颗次级', () => {
    const { container } = renderChat({
      messages: [failedMessage({ code: 'AGENT_EXECUTION_FAILED' })],
    });

    expect(container.querySelector('[data-user-action-card="run-recovery"]')).toBeTruthy();
    expect(screen.getByTestId('chat-error-contact-support')).toBeTruthy();
    expect(screen.getByTestId('chat-error-export-logs')).toBeTruthy();
    expectSecondaryActionsShareOneShell();

    const retry = screen.getByTestId('chat-error-retry');
    expect(retry.getAttribute('data-run-error-action')).toBe('primary');
  });

  // 产品裁决:「好多都应该得有导出日志这个按钮」→ 不挑场景。
  // `cpu_unsupported` 是今天**一颗按钮都没有**的那一档(R-023「无任何按钮」),
  // 恰好是这条裁决最想覆盖的场景。
  it('连一个恢复动作都没有的失败(cpu_unsupported)也照样给这两颗', () => {
    renderChat({
      messages: [
        failedMessage({
          code: 'AGENT_EXECUTION_FAILED',
          failureDetail: 'cpu_unsupported',
        }),
      ],
    });

    expect(screen.getByTestId('chat-error-contact-support')).toBeTruthy();
    expect(screen.getByTestId('chat-error-export-logs')).toBeTruthy();
    /*
     * ⚠️ 原来这里钉的是「这一档不该有重试 —— 重试必然同样结果」(设计原则四)。
     * OPEND-2807 之后卡上不再按失败类型分档,Cloud 上的第三颗恒为〔重试〕,
     * 所以这一条不再成立。**原则四与工单的冲突已列进 PR 描述交产品定夺**;
     * 这里钉现状,并守住「一颗都不多」。
     */
    expect(screen.getByTestId('chat-error-retry')).toBeTruthy();
  });

  it('只有面板级错误、没有可重试轮次时，两颗常驻动作仍共用描边次级壳', () => {
    renderChat({ error: 'conversations 404' });

    expectSecondaryActionsShareOneShell();
    expect(screen.queryByTestId('chat-error-retry')).toBeNull();
  });

  // 稿子第 78 格:〔联系支持〕〔导出日志〕〔从失败处重试〕—— 前两颗次级、第三颗主。
  it('三颗动作按稿子的顺序排(次级在左,主动作在最右)', () => {
    const { container } = renderChat({
      messages: [failedMessage({ code: 'AGENT_EXECUTION_FAILED' })],
    });

    const footer = container.querySelector('[data-user-action-footer="true"]');
    expect(footer).toBeTruthy();
    const labels = Array.from(footer!.querySelectorAll('button')).map((b) =>
      b.getAttribute('data-testid') ?? b.textContent?.trim() ?? '',
    );
    expect(labels[0]).toBe('chat-error-contact-support');
    expect(labels[1]).toBe('chat-error-export-logs');
    /* 重试原来是裸 `<button>`、没有 testid,所以这里回落到读它的文本
       (`promptTemplates.retry`)。2026-08-27 它改成和旁边两颗同一个共享
       `Button` 原语(用户:「这个按钮圆角明显跟别的不一样」——它自带 4px 圆角,
       两颗次级是 999px),顺手补了 testid。**三颗现在都按 testid 认**,
       比原来混着文本认更稳:换文案不会再牵动这条顺序断言。 */
    expect(labels[labels.length - 1]).toBe('chat-error-retry');
  });

  it('点〔联系支持〕开出联系支持弹窗,里面是飞书社群 + Discord 两行', () => {
    renderChat({ messages: [failedMessage({ code: 'AGENT_EXECUTION_FAILED' })] });

    expect(screen.queryByTestId('chat-support-dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('chat-error-contact-support'));

    const dialog = screen.getByTestId('chat-support-dialog');
    expect(dialog).toBeTruthy();
    const hrefs = Array.from(dialog.querySelectorAll('[data-support-channel]')).map((n) =>
      n.getAttribute('data-support-channel'),
    );
    expect(hrefs).toEqual(['feishu', 'discord']);
  });
});

describe('ChatPane — 模型不可用给「换个模型」而不是重试', () => {
  /*
   * ⚠️ 这两条钉的是〔更换模型〕:模型下线时不给重试、给一颗直接开模型选择器的按钮。
   * OPEND-2807 把对症动作整块撤出报错卡,〔更换模型〕也在其中,所以这两条的
   * 被测对象已经不存在。**代价**:模型下线这一档从此只剩「重试」,而重试必然
   * 同样结果 —— 与设计原则四直接冲突,已列进 PR 描述交产品定夺。
   *
   * 这里改成钉「它确实不上卡了」+「卡上仍是那三颗」,把冲突留在测试里当凭据。
   */
  it('OPEND-2807:模型不可用也只给三颗按钮,〔更换模型〕不再上卡', () => {
    const onOpenSettings = vi.fn();
    const { container } = renderChat({
      messages: [failedMessage({ code: 'AMR_MODEL_UNAVAILABLE' })],
      onOpenSettings,
    });

    expect(screen.queryByTestId('chat-error-switch-model')).toBeNull();
    const footer = container.querySelector('[data-user-action-footer="true"]');
    expect(
      Array.from(footer!.querySelectorAll('button')).map((b) => b.getAttribute('data-testid')),
    ).toEqual([
      'chat-error-contact-support',
      'chat-error-export-logs',
      'chat-error-retry',
    ]);
    expect(onOpenSettings).not.toHaveBeenCalled();
  });
});

describe('ChatPane — 升级卡接在流水里', () => {
  it('余额 > 0 但撑不住下一轮:暖橙档,卡出现在流水里', () => {
    const { container } = renderChat({ amrBalanceCardUsd: 1.2 });

    const card = screen.getByTestId('chat-upgrade-card');
    expect(card).toBeTruthy();
    expect(card.getAttribute('data-out')).toBe('false');
    expect(card.textContent).toContain('$1.20');
    // 流水里(chat-log 内),不是钉在输入框上方的那一类。
    expect(container.querySelector('.chat-log')?.contains(card)).toBe(true);
  });

  it('余额 = 0:红档,文案换成「现在无法开始新任务」', () => {
    renderChat({ amrBalanceCardUsd: 0 });

    const card = screen.getByTestId('chat-upgrade-card');
    expect(card.getAttribute('data-out')).toBe('true');
    expect(card.textContent).toContain('chat.upgrade.whyOut');
  });

  it('没有余额提示时不渲染这张卡', () => {
    renderChat({ amrBalanceCardUsd: null });
    expect(screen.queryByTestId('chat-upgrade-card')).toBeNull();
  });

  // D4「不阻塞」:卡在流水里,发送不受影响。
  it('卡出现时发送依然可用(D4 不阻塞)', () => {
    renderChat({ amrBalanceCardUsd: 0 });
    expect(screen.getByTestId('chat-upgrade-card')).toBeTruthy();
    // 卡本身不是遮罩/弹窗,也不带任何 aria-modal。
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
  });
});
