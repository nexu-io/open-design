// @vitest-environment jsdom
/**
 * OPEND-2772 · 有〔切换到 Cloud〕时,卡上不再同时给〔重试〕。
 *
 * **用户裁决(2026-09-08,转述同事,逐字)**:
 *   「同事说还有情况会出现**重试**和**切换至 cloud 并重试**,两个 CTA 按钮…
 *    **有切换至 cloud 一律只显示切换至 cloud,没有的情况下再显示那个重试**」
 *
 * 这条推翻的是 `run-error-catalog.md` §6.ZB 末尾「本轮采取的是保守解」——
 * 也就是候选 A(阶梯那颗降为次级、留在卡上)。产品选的是**候选 B**。
 *
 * 所以这份红测钉两侧:
 *   ① 有 Cloud CTA 时,**阶梯算出来的那一颗一个都不许渲染** ——
 *      〔重试〕〔更换模型〕〔去设置〕〔继续运行〕全在内;
 *   ② **没有** Cloud CTA 时(已经跑在 Cloud 上,`withoutCloudSelfPromotion`),
 *      那一颗照旧出现、照旧点得动 —— 这条修前修后都必须绿。
 *
 * 判据一律走稳定 `data-testid` / 可观察行为,不碰 CSS 类名(`chat/AGENTS.md` §5)。
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

/** 真字典 —— CTA 那句话钉在用户看到的文字上,不钉键名 */
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

/** 产品文案逐字 —— `chat.amrCard.switchCta` */
const CLOUD_CTA = '切换到 OpenDesign Cloud 并重试';

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
}): ChatMessage {
  return {
    id: 'msg-failed',
    role: 'assistant',
    content: 'Partial work before the failure.',
    createdAt: 1,
    runId: 'run-failed',
    runStatus: 'failed',
    agentId: opts.agentId,
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
  onRetry?: (m: ChatMessage, reason?: string) => void;
}) {
  const onRetry = opts.onRetry ?? vi.fn();
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
      onSwitchToAmrAndRetry={vi.fn()}
      onSwitchModel={vi.fn()}
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
  return { ...rendered, onRetry };
}

/** 卡上那一排真的画出来的按钮文字 */
function cloudCtaCount(container: HTMLElement): number {
  return Array.from(container.querySelectorAll('button')).filter(
    (b) => (b.textContent ?? '').trim() === CLOUD_CTA,
  ).length;
}

describe('有 Cloud CTA 时,阶梯那一颗不再渲染(用户 2026-09-08 · 候选 B)', () => {
  /*
   * 同事截图里的那一张:Claude 本地 CLI 登录过期,卡上同时挂着〔重试〕和
   * 〔切换到 OpenDesign Cloud 并重试〕—— 正是用户点名要去掉的双 CTA。
   */
  it('S02 BYOK 登录过期:只剩 Cloud CTA,〔重试〕不在了', () => {
    const { container } = renderFailure({ agentId: 'claude', code: 'AGENT_AUTH_REQUIRED' });

    expect(screen.getByTestId('chat-error-switch-to-cloud')).toBeTruthy();
    expect(screen.queryByTestId('chat-error-retry')).toBeNull();
  });

  it.each([
    ['S19 进程崩了', 'AGENT_EXECUTION_FAILED', 'process_crashed'],
    ['S01 没装 CLI', 'AGENT_UNAVAILABLE', undefined],
    ['上游过载', 'UPSTREAM_UNAVAILABLE', undefined],
    ['兜底(终态失败但算不出文案)', 'AGENT_EXECUTION_FAILED', undefined],
  ] as const)('%s:BYOK 上同样只剩 Cloud CTA', (_name, code, failureDetail) => {
    const { container } = renderFailure({
      agentId: 'claude',
      code,
      ...(failureDetail ? { failureDetail } : {}),
    });

    expect(cloudCtaCount(container)).toBe(1);
    expect(screen.queryByTestId('chat-error-retry')).toBeNull();
  });

  it('S13 模型不可用:〔更换模型〕也让位,不和 Cloud CTA 并排', () => {
    renderFailure({ agentId: 'claude', code: 'AMR_MODEL_UNAVAILABLE' });

    expect(screen.getByTestId('chat-error-switch-to-cloud')).toBeTruthy();
    expect(screen.queryByTestId('chat-error-switch-model')).toBeNull();
  });

  it('S30 网络环境不对:〔去设置〕也让位', () => {
    renderFailure({
      agentId: 'claude',
      code: 'AGENT_EXECUTION_FAILED',
      failureDetail: 'certificate_failure',
    });

    expect(screen.getByTestId('chat-error-switch-to-cloud')).toBeTruthy();
    expect(screen.queryByTestId('chat-error-open-settings')).toBeNull();
  });

  /*
   * 候选 B 只收阶梯那一档。产品自己点名过的两颗常驻次级
   * (「好多都应该得有导出日志这个按钮」)不在这次裁决范围内,必须还在。
   */
  it('两颗常驻次级〔联系支持〕〔导出日志〕不受影响', () => {
    renderFailure({ agentId: 'claude', code: 'AGENT_AUTH_REQUIRED' });

    expect(screen.getByTestId('chat-error-contact-support')).toBeTruthy();
    expect(screen.getByTestId('chat-error-export-logs')).toBeTruthy();
  });
});

describe('反向:没有 Cloud CTA 时,那一颗照旧出现且点得动', () => {
  it('已经在 Cloud 上的进程崩了:没有 Cloud CTA,〔重试〕在,而且点得动', () => {
    const onRetry = vi.fn();
    const { container } = renderFailure({
      agentId: 'amr',
      code: 'AGENT_EXECUTION_FAILED',
      failureDetail: 'process_crashed',
      onRetry,
    });

    expect(cloudCtaCount(container)).toBe(0);
    const retry = screen.getByTestId('chat-error-retry');
    expect(retry.hasAttribute('disabled')).toBe(false);
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]![0]).toMatchObject({ id: 'msg-failed' });
  });

  it('兜底卡那一档(算不出文案)在 Cloud 上仍然带得动重试', () => {
    const onRetry = vi.fn();
    const { container } = renderFailure({
      agentId: 'amr',
      code: 'AGENT_EXECUTION_FAILED',
      onRetry,
    });

    // 兜底文案 —— 确认走的确实是「算不出专属文案」那一档
    expect(screen.getByTestId('chat-run-error-description').textContent?.trim()).toBe(
      '这次没能顺利完成。反复出现的话，把日志发给我们。',
    );
    expect(cloudCtaCount(container)).toBe(0);
    fireEvent.click(screen.getByTestId('chat-error-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  /*
   * `withoutCloudSelfPromotion` 的全矩阵反向用例:AMR 自己的失败一颗 Cloud CTA
   * 都不给,所以这一整族的重试**不受这次改动影响**。
   */
  it.each([
    ['S04 Cloud 没登录', 'AMR_AUTH_REQUIRED', undefined],
    ['通用 401', 'UNAUTHORIZED', undefined],
    ['上游过载', 'UPSTREAM_UNAVAILABLE', undefined],
    ['被限速', 'RATE_LIMITED', undefined],
    ['进程崩了', 'AGENT_EXECUTION_FAILED', 'process_crashed'],
    ['供应商额度用完', 'AGENT_EXECUTION_FAILED', 'hard_quota'],
  ] as const)('%s:AMR 自己一颗 Cloud CTA 都不给', (_name, code, failureDetail) => {
    const { container } = renderFailure({
      agentId: 'amr',
      code,
      ...(failureDetail ? { failureDetail } : {}),
    });

    expect(cloudCtaCount(container)).toBe(0);
  });
});
