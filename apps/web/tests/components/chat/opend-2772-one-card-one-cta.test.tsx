// @vitest-environment jsdom
/**
 * OPEND-2772 · 一次失败只出一张卡,主按钮一律是〔切换到 Cloud〕。
 *
 * **工单看到的**(截图,Claude 本地 CLI 登录过期):红框圈住的是**上下两张卡
 * 同时出现** —— 上面 `RunErrorCard`(「需要登录 / Claude 尚未登录…」,三颗动作),
 * 下面另起一张 `AmrGuidance`(「模型调用失败,当前任务已暂停」+〔切换到
 * OpenDesign Cloud 并重试〕)。产品原话:「**不能新旧一起出现吧??**」
 *
 * **产品裁决(2026-09-07,逐字)**:
 *   「2772 的「统一」是「铺到所有报错」,主 cta 都是切换至 cloud,具体样式按设计稿」
 *   「应该是所有 cta 按钮都是切换到 cloud?……我们应该直接干掉旧的报错卡片」
 *   「8-26 推翻掉吧」—— 即 `run-error-catalog.md` §6.Z 那条「不是一律劝切 Cloud、
 *   第 1 档永远优先」。
 *
 * 所以这份红测钉三件事,一件都不许回退:
 *   ① **只有一张卡**(第二张切换卡整块不存在);
 *   ② **主按钮是切换到 Cloud**,而且铺到 BYOK / 本地 CLI 的**所有**失败类,
 *      不只今天出切换卡的那 6 类;
 *   ③ **AMR 自己不出这颗 CTA** —— 不能对着已经在 Cloud 上的人劝他买 Cloud
 *      (`withoutCloudSelfPromotion` 的反向用例)。
 *
 * ⚠️ 这颗 CTA 复用切换卡上那一句 `chat.amrCard.switchCta`,**键没换**;它的值
 * 2026-09-08 按交付稿第 79 格对齐成「切换到 Cloud」(产品原话「切换到 cloud 就行
 * 了」),报错卡自己的标题 / 正文按同一次裁决**不对齐**。
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
import {
  trackRunFailedToastGoAmrClick,
  trackRunRecoveryActionClick,
} from '../../../src/analytics/events';
import type { AppConfig, ChatMessage } from '../../../src/types';

/** 真字典 —— 判据钉在用户看到的那行字上,不钉键名 */
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

// ⚠️ 故意**不 mock** `AmrGuidance`:这份文件的第一条判据就是「那张卡还在不在」,
// 把它 stub 掉等于把要照的东西糊住。

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
const CLOUD_CTA = '切换到 Cloud';

function failedMessage(opts: { agentId: string; code: string; detail?: string }): ChatMessage {
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
        detail: opts.detail ?? 'raw upstream sentence',
        code: opts.code,
      },
    ],
  } as ChatMessage;
}

function renderFailure(opts: {
  agentId: string;
  code: string;
  detail?: string;
  onSwitchToAmrAndRetry?: (m: ChatMessage) => void;
}) {
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
      onRetry={vi.fn()}
      onSwitchToAmrAndRetry={onSwitchToAmrAndRetry}
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
  return { ...rendered, onSwitchToAmrAndRetry };
}

/** 卡上那一排里的主按钮(`RunErrorCardAction` 给每颗都盖了 `data-run-error-action`) */
function primaryActions(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-run-error-action="primary"]'),
  );
}

describe('OPEND-2772 · 一次失败只出一张卡', () => {
  it('BYOK 登录过期:第二张切换卡整块不在了', () => {
    const { container } = renderFailure({ agentId: 'claude', code: 'AGENT_AUTH_REQUIRED' });

    expect(screen.getAllByTestId('chat-run-error-card')).toHaveLength(1);
    expect(screen.queryByTestId('amr-guidance')).toBeNull();
    expect(
      container.querySelector('[data-user-action-card="hosted-agent-suggestion"]'),
    ).toBeNull();
  });

  it('那句 CTA 只出现一次 —— 不许卡上一颗、卡下再一张', () => {
    const { container } = renderFailure({ agentId: 'claude', code: 'AGENT_AUTH_REQUIRED' });

    const hits = Array.from(container.querySelectorAll('button')).filter(
      (b) => (b.textContent ?? '').trim() === CLOUD_CTA,
    );
    expect(hits).toHaveLength(1);
  });

  it('报错卡自己的文案原封不动 —— 合并没有改写标题/正文', () => {
    renderFailure({ agentId: 'claude', code: 'AGENT_AUTH_REQUIRED' });

    const card = screen.getByTestId('chat-run-error-card');
    expect((card.firstElementChild?.textContent ?? '').trim()).toBe('Claude 尚未登录');
    expect(screen.getByTestId('chat-run-error-description').textContent?.trim()).toBe(
      '请先完成 Claude 的登录，再重新尝试。',
    );
  });
});

describe('OPEND-2772 · 主按钮一律是切换到 Cloud', () => {
  /*
   * 交付稿第 79 格(`docs/design/chat-panel-next.html` 特殊错误 · CLI / BYOK)
   * 那颗主按钮逐字写的是「切换到 Cloud」,不是「切换到 OpenDesign Cloud 并重试」。
   *
   * 产品 2026-09-08 当面裁决:「切换到 cloud 就行了,你怎么写那么长的文案『切换到
   * Cloud 并重试』」「具体的报错文案不一定跟设计稿对齐,**按钮文案对齐先**」——
   * 所以对齐的只有按钮这一颗;标题 / 正文各按各自的产品文案走,不动。
   *
   * 判据钉在用户读到的那行字上(经稳定的 `data-testid` 取元素),不钉键名、不钉样式。
   */
  it('按钮读到的就是交付稿那句「切换到 Cloud」', () => {
    renderFailure({ agentId: 'claude', code: 'AGENT_AUTH_REQUIRED' });

    const cta = screen.getByTestId('chat-error-switch-to-cloud');
    expect((cta.textContent ?? '').trim()).toBe('切换到 Cloud');
  });

  it('主按钮就是那颗 CTA,而且整张卡只有一颗主按钮', () => {
    const { container } = renderFailure({ agentId: 'claude', code: 'AGENT_AUTH_REQUIRED' });

    const primaries = primaryActions(container);
    expect(primaries).toHaveLength(1);
    expect((primaries[0]!.textContent ?? '').trim()).toBe(CLOUD_CTA);
  });

  it('〔重试〕没有被删,只是让出了主位', () => {
    const { container } = renderFailure({ agentId: 'claude', code: 'AGENT_AUTH_REQUIRED' });

    const retry = screen.getByTestId('chat-error-retry');
    expect(retry.getAttribute('data-run-error-action')).toBe('secondary');
    // 常驻两颗照旧在
    expect(container.querySelector('[data-testid="chat-error-contact-support"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="chat-error-export-logs"]')).toBeTruthy();
  });

  /*
   * 铺开的证据。这四条今天**一条都不出切换卡**:
   *   · S19 进程崩了(每月 20,868 次,第二大桶)—— 落兜底,只有一颗〔重试〕
   *   · S01 没装 CLI
   *   · S13 模型不可用 —— 主按钮是〔更换模型〕(旧 §6.Z 的第 1 档优先)
   *   · S30 网络环境不对 —— 主按钮是〔去设置〕
   * 产品 2026-09-07 把 8-26 那条「第 1 档永远优先」推翻掉了。
   */
  it.each([
    ['S19 进程崩了', 'AGENT_EXECUTION_FAILED', 'process_crashed'],
    ['S01 没装 CLI', 'AGENT_UNAVAILABLE', undefined],
    ['S13 模型不可用', 'AMR_MODEL_UNAVAILABLE', undefined],
    ['S30 网络环境不对', 'AGENT_EXECUTION_FAILED', 'certificate_failure'],
  ] as const)('%s:BYOK 上也有这颗主 CTA', (_name, code, detail) => {
    const { container } = renderFailure({
      agentId: 'claude',
      code,
      ...(detail ? { detail } : {}),
    });

    const primaries = primaryActions(container);
    expect(primaries).toHaveLength(1);
    expect((primaries[0]!.textContent ?? '').trim()).toBe(CLOUD_CTA);
  });

  /*
   * `UPSTREAM_UNAVAILABLE` 在映射表里一直写着要出切换卡,却被 `ChatPane` 单独
   * 否掉,**没有任何注释说明理由**。合并之后这条无理由的否决一并消失。
   */
  it('上游过载(此前被无理由否掉的那一类)也有这颗 CTA', () => {
    const { container } = renderFailure({ agentId: 'claude', code: 'UPSTREAM_UNAVAILABLE' });

    const primaries = primaryActions(container);
    expect(primaries).toHaveLength(1);
    expect((primaries[0]!.textContent ?? '').trim()).toBe(CLOUD_CTA);
  });

  it('点它走的是现成的切换动作,并且埋点没丢', () => {
    const onSwitchToAmrAndRetry = vi.fn();
    const { container } = renderFailure({
      agentId: 'claude',
      code: 'AGENT_AUTH_REQUIRED',
      onSwitchToAmrAndRetry,
    });

    fireEvent.click(primaryActions(container)[0]!);

    expect(onSwitchToAmrAndRetry).toHaveBeenCalledTimes(1);
    expect(onSwitchToAmrAndRetry.mock.calls[0]![0]).toMatchObject({ id: 'msg-failed' });
    // 切换卡挂载/点击时发的那两个事件必须跟着 CTA 一起搬过来
    expect(trackRunFailedToastGoAmrClick).toHaveBeenCalledTimes(1);
    expect(vi.mocked(trackRunFailedToastGoAmrClick).mock.calls[0]![1]).toMatchObject({
      page_name: 'chat_panel',
      area: 'chat_panel',
      element: 'go_amr',
    });
    expect(
      vi
        .mocked(trackRunRecoveryActionClick)
        .mock.calls.some(
          (call) => call[1]?.recovery_action_type === 'switch_runtime_retry',
        ),
    ).toBe(true);
  });
});

describe('OPEND-2772 · AMR 自己不许被劝去买 AMR', () => {
  it.each([
    ['S04 Cloud 没登录', 'AMR_AUTH_REQUIRED', undefined],
    ['通用 401', 'UNAUTHORIZED', undefined],
    ['上游过载', 'UPSTREAM_UNAVAILABLE', undefined],
    ['被限速', 'RATE_LIMITED', undefined],
    ['进程崩了', 'AGENT_EXECUTION_FAILED', 'process_crashed'],
    ['供应商额度用完', 'AGENT_EXECUTION_FAILED', 'hard_quota'],
  ] as const)('%s:已经在 Cloud 上,卡上不出这颗 CTA', (_name, code, detail) => {
    const { container } = renderFailure({
      agentId: 'amr',
      code,
      ...(detail ? { detail } : {}),
    });

    const hits = Array.from(container.querySelectorAll('button')).filter(
      (b) => (b.textContent ?? '').trim() === CLOUD_CTA,
    );
    expect(hits).toHaveLength(0);
    expect(screen.queryByTestId('amr-guidance')).toBeNull();
  });
});
