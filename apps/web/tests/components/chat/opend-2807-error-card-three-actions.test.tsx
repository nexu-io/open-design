// @vitest-environment jsdom
/**
 * OPEND-2807 · 报错卡永远只有三颗按钮,只分两种情况。
 *
 * **工单(权威)**:「[ChatPanel] 错误卡片未还原设计样式,**应该只有三个按钮**」
 *
 *   使用的 OpenDesign Cloud:  联系我们 / 导出日志 / **重试**
 *   使用的 CLI/BYOK:          联系我们 / 导出日志 / **切换到 OpenDesign Cloud**
 *
 * 用户当面补充:「**别分那么多情况了**」「**amr 只有这个 cta**」。
 *
 * 所以第三颗只由一件事决定 —— 这一轮跑在不在 Cloud 上 —— 而**不再看失败类型**。
 * 阶梯算出来的那一整套对症动作(授权并重试 / 去设置 / 去充值 / 升级套餐 /
 * 更换模型 / 在终端登录 / 在终端换模型 / 继续运行)整块从报错卡上撤掉。
 *
 * ⚠️ 这推翻了 `run-error-catalog.md` §6.ZB 末尾的 A / B / C 三候选框架:
 * 那三条都还在讨论「阶梯那颗留不留、留成什么分量」,工单的答案是它压根不上卡。
 *
 * 这份红测钉三侧:
 *   ① Cloud 上:恰好三颗,且是〔联系我们〕〔导出日志〕〔重试〕;
 *   ② CLI/BYOK:恰好三颗,且是〔联系我们〕〔导出日志〕〔切换到 OpenDesign Cloud〕;
 *   ③ **三颗之外一颗都不多** —— 用一张覆盖各档失败类型的矩阵扫,防止某个分支漏关。
 *
 * 判据一律走稳定 `data-testid` / 可见文本 / 可观察行为,不碰 CSS 类名
 * (`apps/web/src/components/chat/AGENTS.md` §5)。
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/analytics/events')>();
  return {
    ...actual,
    trackChatPanelClick: vi.fn(),
    trackRunFailedToastSurfaceView: vi.fn(),
    trackRunFailedToastGoAmrClick: vi.fn(),
    trackRunRecoveryActionClick: vi.fn(),
    trackRunRecoveryActionSurfaceView: vi.fn(),
  };
});

import { ChatPane } from '../../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../../src/types';

/** 真字典 —— 判据钉在用户看到的那几个字上,不钉键名 */
vi.mock('../../../src/i18n', async () => {
  const { zhCN } = await import('../../../src/i18n/locales/zh-CN');
  const dict = zhCN as unknown as Record<string, string>;
  const t = (key: string, vars?: Record<string, string | number>): string => {
    const raw = dict[key] ?? key;
    if (!vars) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, name: string) => {
      const v = vars[name];
      return v == null ? `{${name}}` : String(v);
    });
  };
  return {
    useI18n: () => ({ locale: 'zh-CN', setLocale: () => undefined, t }),
    useT: () => t,
  };
});

vi.mock('../../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`assistant-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock('../../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

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

/** 三颗按钮的稳定钩子。顺序按稿子:次要在左,主动作在最右。 */
const CLOUD_CARD_ACTIONS = [
  'chat-error-contact-support',
  'chat-error-export-logs',
  'chat-error-retry',
];
const BYOK_CARD_ACTIONS = [
  'chat-error-contact-support',
  'chat-error-export-logs',
  'chat-error-switch-to-cloud',
];

/** 工单逐字的三颗标签(改完 i18n 之后的现值) */
const LABEL_CONTACT = '联系我们';
const LABEL_EXPORT = '导出日志';
const LABEL_RETRY = '重试';
const LABEL_SWITCH = '切换到 OpenDesign Cloud';

/**
 * ⚠️ 分类走的是 `failureDetail`,**不是** `detail` —— `ChatPane` 把
 * `failedRunErrorEvent?.failureDetail` 喂给 `resolveRunFailureUi` 的 detail 位,
 * `detail` 只是上游原文。夹具写错这一个字段,整条用例会静静落到兜底档上,
 * 看起来仍然「红得对」,其实照的是另一张卡。
 */
function failedMessage(opts: {
  agentId: string;
  code: string;
  failureDetail?: string;
  resumable?: boolean;
}): ChatMessage {
  return {
    id: 'msg-failed',
    role: 'assistant',
    content: 'Partial work before the failure.',
    createdAt: 1,
    runId: 'run-failed',
    runStatus: 'failed',
    agentId: opts.agentId,
    ...(opts.resumable ? { resumable: true } : {}),
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: 'raw upstream sentence',
        code: opts.code,
        ...(opts.failureDetail ? { failureDetail: opts.failureDetail } : {}),
      },
    ],
  } as ChatMessage;
}

function renderFailure(opts: {
  agentId: string;
  code: string;
  failureDetail?: string;
  resumable?: boolean;
  onRetry?: (m: ChatMessage, reason?: string) => void;
  onResumeRun?: (m: ChatMessage) => void;
  onSwitchToAmrAndRetry?: (m: ChatMessage) => void;
  onLaunchAntigravityOauth?: () => Promise<void>;
  /** 模拟 `SideChatTab` 那种**接不上 Cloud** 的宿主:两个交接口都不传 */
  withoutCloudHandoff?: boolean;
}) {
  const onRetry = opts.onRetry ?? vi.fn();
  const onSwitchToAmrAndRetry = opts.onSwitchToAmrAndRetry ?? vi.fn();
  const rendered = render(
    <ChatPane
      messages={[failedMessage(opts)]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={onRetry}
      onResumeRun={opts.onResumeRun}
      {...(opts.withoutCloudHandoff ? {} : { onSwitchToAmrAndRetry })}
      onSwitchModel={vi.fn()}
      onLaunchAntigravityOauth={opts.onLaunchAntigravityOauth}
      amrBalanceCardUsd={null}
      onOpenSettings={vi.fn() as never}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: opts.agentId, agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
  return { ...rendered, onRetry, onSwitchToAmrAndRetry };
}

/**
 * 卡上动作那一排里**真的画出来**的每一颗。
 *
 * 取的是 `[data-user-action-footer]` 这一层的全部 `button` —— 不是「我关心的那几个
 * testid 在不在」。「三颗之外一颗都不多」只有这样数才照得出:按 testid 逐个问,
 * 漏关的那个分支正好是没人问的那一个。
 */
function cardActions(container: HTMLElement): HTMLElement[] {
  const footer = container.querySelector<HTMLElement>('[data-user-action-footer="true"]');
  expect(footer, '报错卡应该有动作那一排').toBeTruthy();
  return Array.from(footer!.querySelectorAll<HTMLElement>('button'));
}

function actionTestIds(container: HTMLElement): (string | null)[] {
  return cardActions(container).map((b) => b.getAttribute('data-testid'));
}

function actionLabels(container: HTMLElement): string[] {
  return cardActions(container).map((b) => (b.textContent ?? '').trim());
}

/**
 * 一张覆盖各档失败类型的矩阵 —— 这些在 OPEND-2807 之前分别落在阶梯的不同档上
 * (授权 / 换模型 / 去设置 / 充值 / 升级 / 在终端登录 / 联系支持 / 兜底重试),
 * 也就是「分那么多情况」的全部来源。工单之后它们**必须画出同一排按钮**。
 */
const FAILURE_MATRIX = [
  ['S02 本地 agent 没登录', 'AGENT_AUTH_REQUIRED', undefined],
  ['S04 Cloud 没登录', 'AMR_AUTH_REQUIRED', undefined],
  ['通用 401', 'UNAUTHORIZED', undefined],
  ['S13 模型不可用', 'AMR_MODEL_UNAVAILABLE', undefined],
  ['S30 证书 / 代理', 'AGENT_EXECUTION_FAILED', 'certificate_failure'],
  ['S19 进程崩了', 'AGENT_EXECUTION_FAILED', 'process_crashed'],
  ['S08 供应商额度用完', 'AGENT_EXECUTION_FAILED', 'hard_quota'],
  ['S18 账号被封', 'AGENT_EXECUTION_FAILED', 'account_suspended'],
  ['S01 没装 CLI', 'AGENT_UNAVAILABLE', undefined],
  ['S09 被限速', 'RATE_LIMITED', undefined],
  ['S10 上游过载', 'UPSTREAM_UNAVAILABLE', undefined],
  ['ACP 会话被拒', 'AGENT_CLI_SESSION_REFUSED', undefined],
  ['兜底(算不出文案)', 'AGENT_EXECUTION_FAILED', undefined],
] as const;

describe('OPEND-2807 · 跑在 OpenDesign Cloud 上:联系我们 / 导出日志 / 重试', () => {
  it('恰好三颗,而且就是这三颗', () => {
    const { container } = renderFailure({ agentId: 'amr', code: 'AGENT_EXECUTION_FAILED' });

    expect(actionTestIds(container)).toEqual(CLOUD_CARD_ACTIONS);
    expect(actionLabels(container)).toEqual([LABEL_CONTACT, LABEL_EXPORT, LABEL_RETRY]);
  });

  it('第三颗点得动 —— 走的是从头重试那条路', () => {
    const onRetry = vi.fn();
    renderFailure({ agentId: 'amr', code: 'AGENT_EXECUTION_FAILED', onRetry });

    const retry = screen.getByTestId('chat-error-retry');
    expect(retry.hasAttribute('disabled')).toBe(false);
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]![0]).toMatchObject({ id: 'msg-failed' });
  });

  it.each(FAILURE_MATRIX)(
    '%s:失败类型不再改变这一排',
    (_name, code, failureDetail) => {
      const { container } = renderFailure({
        agentId: 'amr',
        code,
        ...(failureDetail ? { failureDetail } : {}),
      });
      expect(actionTestIds(container)).toEqual(CLOUD_CARD_ACTIONS);
    },
  );

  it('可续跑的失败也不再多一颗〔继续运行〕', () => {
    const { container } = renderFailure({
      agentId: 'amr',
      code: 'UPSTREAM_UNAVAILABLE',
      resumable: true,
      onResumeRun: vi.fn(),
    });

    expect(actionTestIds(container)).toEqual(CLOUD_CARD_ACTIONS);
    expect(actionLabels(container)).not.toContain('继续运行');
  });
});

describe('OPEND-2807 · 跑在 CLI / BYOK 上:联系我们 / 导出日志 / 切换到 OpenDesign Cloud', () => {
  it('恰好三颗,而且就是这三颗', () => {
    const { container } = renderFailure({ agentId: 'claude', code: 'AGENT_AUTH_REQUIRED' });

    expect(actionTestIds(container)).toEqual(BYOK_CARD_ACTIONS);
    expect(actionLabels(container)).toEqual([LABEL_CONTACT, LABEL_EXPORT, LABEL_SWITCH]);
  });

  it('第三颗点得动 —— 走的是现成的切换动作', () => {
    const onSwitchToAmrAndRetry = vi.fn();
    renderFailure({
      agentId: 'claude',
      code: 'AGENT_AUTH_REQUIRED',
      onSwitchToAmrAndRetry,
    });

    fireEvent.click(screen.getByTestId('chat-error-switch-to-cloud'));
    expect(onSwitchToAmrAndRetry).toHaveBeenCalledTimes(1);
    expect(onSwitchToAmrAndRetry.mock.calls[0]![0]).toMatchObject({ id: 'msg-failed' });
  });

  it.each(FAILURE_MATRIX)(
    '%s:失败类型不再改变这一排',
    (_name, code, failureDetail) => {
      const { container } = renderFailure({
        agentId: 'claude',
        code,
        ...(failureDetail ? { failureDetail } : {}),
      });
      expect(actionTestIds(container)).toEqual(BYOK_CARD_ACTIONS);
    },
  );

  /*
   * antigravity 的〔在终端换模型〕曾是
   * `POST /api/agents/antigravity/oauth-launch` 在整个 web UI 里的唯一入口。
   * 工单明确不要这类对症按钮,所以它从卡上消失 —— 这条钉的是「确实消失了」,
   * 同时把这条代价留在测试里当凭据(PR 描述里也写了)。
   */
  it('antigravity 限流:〔在终端中切换模型〕不再上卡', () => {
    const onLaunchAntigravityOauth = vi.fn(async () => undefined);
    const { container } = renderFailure({
      agentId: 'antigravity',
      code: 'RATE_LIMITED',
      onLaunchAntigravityOauth,
    });

    expect(actionTestIds(container)).toEqual(BYOK_CARD_ACTIONS);
    expect(actionLabels(container)).not.toContain('在终端中切换模型');
    expect(onLaunchAntigravityOauth).not.toHaveBeenCalled();
  });
});

describe('接手方不在场时不让位(评审 PerishCode · PRRT_kwDOSOgY8s6gG7NN)', () => {
  /*
   * `workspace/SideChatTab.tsx` 只把 `onRetry` 传给 `ChatPane`,既没有
   * `onSwitchToAmrAndRetry` 也没有 `onOpenAmrSettings`。在那种宿主里画出
   * 〔切换到 OpenDesign Cloud〕又压掉〔重试〕,用户拿到的是一颗点了没反应的
   * 按钮 + 一张没有出路的卡。
   *
   * 这和 `balanceCardCannotTakeTheHandoff` 是同一个模式:**交接只在接手方
   * 真的在场时成立**。所以接不上 Cloud 的宿主就走本地那一种情况:第三颗是重试。
   *
   * ⚠️ 三颗按钮、两种情况一个没变 —— 变的只是「哪一种情况」的判据。
   */
  it.each(FAILURE_MATRIX)(
    '%s:宿主没接 Cloud 交接口时,BYOK 的卡给的是〔重试〕而不是点不动的 CTA',
    (_name, code, failureDetail) => {
      const onRetry = vi.fn();
      const { container } = renderFailure({
        agentId: 'claude',
        code,
        ...(failureDetail ? { failureDetail } : {}),
        withoutCloudHandoff: true,
        onRetry,
      });

      expect(actionTestIds(container)).toEqual(CLOUD_CARD_ACTIONS);
      expect(screen.queryByTestId('chat-error-switch-to-cloud')).toBeNull();
      fireEvent.click(screen.getByTestId('chat-error-retry'));
      expect(onRetry).toHaveBeenCalledTimes(1);
    },
  );

  it('宿主接了 Cloud 交接口时,BYOK 照旧给〔切换到 OpenDesign Cloud〕', () => {
    const { container } = renderFailure({
      agentId: 'claude',
      code: 'AGENT_AUTH_REQUIRED',
      onSwitchToAmrAndRetry: vi.fn(),
    });

    expect(actionTestIds(container)).toEqual(BYOK_CARD_ACTIONS);
  });
});

describe('OPEND-2807 · 两侧的反向不变式', () => {
  /*
   * `withoutCloudSelfPromotion` 的全矩阵反向用例:AMR 自己一颗 Cloud CTA 都不给。
   * 「不能对着已经在 Cloud 上的人劝他买 Cloud」这条比这次改动更老,不许被顺手弄丢。
   */
  it.each(FAILURE_MATRIX)('%s:Cloud 上不出〔切换到 Cloud〕', (_name, code, failureDetail) => {
    const { container } = renderFailure({
      agentId: 'amr',
      code,
      ...(failureDetail ? { failureDetail } : {}),
    });

    expect(screen.queryByTestId('chat-error-switch-to-cloud')).toBeNull();
    expect(actionLabels(container)).not.toContain(LABEL_SWITCH);
  });

  it.each(FAILURE_MATRIX)('%s:CLI/BYOK 上不出〔重试〕', (_name, code, failureDetail) => {
    const { container } = renderFailure({
      agentId: 'claude',
      code,
      ...(failureDetail ? { failureDetail } : {}),
    });

    expect(screen.queryByTestId('chat-error-retry')).toBeNull();
    expect(actionLabels(container)).not.toContain(LABEL_RETRY);
  });

  /*
   * ⚠️ 这一条要按**整张矩阵**扫,不能只挑一个失败类型:
   * 「〔联系支持〕在第 4 档升格成主按钮」那条老规则只在
   * `primaryAction === 'contact-support'`(S18 账号被封)上触发,单点用例照不出。
   * 三颗按钮之后每张卡必有第三颗 CTA,死路不可能出现,那一档已经删掉 ——
   * 这条矩阵就是它不会悄悄回来的守卫。
   */
  it.each(FAILURE_MATRIX)('%s:两种环境下都恰好一颗主按钮', (_name, code, failureDetail) => {
    for (const agentId of ['amr', 'claude'] as const) {
      const { container } = renderFailure({
        agentId,
        code,
        ...(failureDetail ? { failureDetail } : {}),
      });
      const primaries = Array.from(
        container.querySelectorAll<HTMLElement>('[data-run-error-action="primary"]'),
      );
      expect(primaries, `${agentId} / ${code}`).toHaveLength(1);
      expect(primaries[0]!.getAttribute('data-testid')).toBe(
        agentId === 'amr' ? 'chat-error-retry' : 'chat-error-switch-to-cloud',
      );
      cleanup();
    }
  });

  it('一张卡只有一颗主按钮,而且是第三颗', () => {
    const byok = renderFailure({ agentId: 'claude', code: 'AGENT_AUTH_REQUIRED' });
    const byokPrimaries = Array.from(
      byok.container.querySelectorAll<HTMLElement>('[data-run-error-action="primary"]'),
    );
    expect(byokPrimaries).toHaveLength(1);
    expect(byokPrimaries[0]!.getAttribute('data-testid')).toBe('chat-error-switch-to-cloud');
    cleanup();

    const cloud = renderFailure({ agentId: 'amr', code: 'AGENT_EXECUTION_FAILED' });
    const cloudPrimaries = Array.from(
      cloud.container.querySelectorAll<HTMLElement>('[data-run-error-action="primary"]'),
    );
    expect(cloudPrimaries).toHaveLength(1);
    expect(cloudPrimaries[0]!.getAttribute('data-testid')).toBe('chat-error-retry');
  });
});
