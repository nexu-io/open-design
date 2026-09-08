// @vitest-environment jsdom
/**
 * 报错卡上那颗〔切换到 Cloud〕**只在接手方在场时**才画。
 *
 * 这颗 CTA 自己不做事,它把这一轮交给宿主:`onSwitchToAmrAndRetry`,接不住时
 * 回落 `onOpenAmrSettings`。两个都没接的宿主,onClick 走完两个分支什么都不会
 * 发生 —— 而 `ChatPane` 里凡是读 `showCloudSwitchCta` 的地方都当它已经把主位
 * 接走了:`errorActionVariant` 把真能用的〔重试〕挤到次级,
 * `contactSupportIsPrimary` 也不再升格。
 *
 * 三个宿主正好有这一种:
 *   · `ProjectView`              —— `onSwitchToAmrAndRetry` + `onOpenAmrSettings` 都接
 *   · `workspace/SideChatTab`    —— 只接 `onRetry`,两个 AMR 口子一个都没接
 *   · `DesignSystemFlow`         —— 三个都没接
 *
 * 所以侧边聊天里,一轮失败之后屏幕上唯一显眼的那颗按钮是**假的**,同时真能用的
 * 那颗被降级;第 4 档(没有任何恢复动作)的卡更是连一颗主按钮都不剩。
 *
 * 不变量和 `balanceCardCannotTakeTheHandoff` / `reconnectRowCannotTakeTheHandoff`
 * 是同一条:**让位只在接手方真的在场时成立**。
 *
 * ⚠️ 这里**不**碰「卡上该有几颗按钮」。铺不铺这颗 CTA 由
 * `runFailureUi.cloudSwitchCta`(OPEND-2772「铺到所有报错」)说了算;这份文件只问
 * 「这个宿主接不接得住」。反向锚点那一条钉的就是:接得住的宿主,一格都不许变。
 *
 * 判据一律走渲染文本 / `data-testid` / 点击行为,不碰 CSS 类名
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

function failedMessage(code: string, detail?: string): ChatMessage {
  return {
    id: 'msg-failed',
    role: 'assistant',
    content: 'Partial work before the failure.',
    createdAt: 1,
    runId: 'run-failed',
    runStatus: 'failed',
    agentId: 'claude',
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: detail ?? 'raw upstream sentence',
        code,
      },
    ],
  } as ChatMessage;
}

interface HostWiring {
  onSwitchToAmrAndRetry?: (message: ChatMessage) => void;
  onOpenAmrSettings?: () => void;
}

function renderFailure(opts: { code: string; detail?: string; host: HostWiring }) {
  const onRetry = vi.fn();
  const rendered = render(
    <ChatPane
      messages={[failedMessage(opts.code, opts.detail)]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={onRetry}
      amrBalanceCardUsd={null}
      onOpenSettings={vi.fn() as never}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'claude', agentCliEnv: {} } as unknown as AppConfig}
      {...opts.host}
    />,
  );
  return { ...rendered, onRetry };
}

/** 卡上那一排里的主按钮(`RunErrorCardAction` 给每颗都盖了 `data-run-error-action`) */
function primaryActions(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-run-error-action="primary"]'),
  );
}

/** `workspace/SideChatTab` 的接线:能重试,但两个 AMR 口子都没接 */
const SIDE_CHAT_TAB: HostWiring = {};

/** `ProjectView` 的接线:两个都接 */
function projectViewWiring(): Required<HostWiring> & { onSwitchToAmrAndRetry: ReturnType<typeof vi.fn> } {
  return {
    onSwitchToAmrAndRetry: vi.fn(),
    onOpenAmrSettings: vi.fn(),
  } as never;
}

describe('接手方不在场时,报错卡不许让位', () => {
  /*
   * S19 进程崩了(每月 20,868 次,第二大桶):阶梯第 2 档,答案是〔重试〕。
   * 侧边聊天接了 `onRetry`,所以这颗按钮是**真的能用**的。
   */
  it('侧边聊天:不画那颗点了没反应的 Cloud 按钮', () => {
    const { container } = renderFailure({
      code: 'AGENT_EXECUTION_FAILED',
      detail: 'process_crashed',
      host: SIDE_CHAT_TAB,
    });

    expect(screen.queryByTestId('chat-error-switch-to-cloud')).toBeNull();
    expect(
      Array.from(container.querySelectorAll('button')).filter((b) =>
        (b.textContent ?? '').includes('切换到 Cloud'),
      ),
    ).toHaveLength(0);
  });

  it('侧边聊天:〔重试〕还在,而且拿回主位', () => {
    const { container } = renderFailure({
      code: 'AGENT_EXECUTION_FAILED',
      detail: 'process_crashed',
      host: SIDE_CHAT_TAB,
    });

    const retry = screen.getByTestId('chat-error-retry');
    expect(retry.getAttribute('data-run-error-action')).toBe('primary');
    const primaries = primaryActions(container);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toBe(retry);
  });

  it('侧边聊天:那颗〔重试〕点下去真的走宿主的重试', () => {
    const { onRetry } = renderFailure({
      code: 'AGENT_EXECUTION_FAILED',
      detail: 'process_crashed',
      host: SIDE_CHAT_TAB,
    });

    fireEvent.click(screen.getByTestId('chat-error-retry'));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]![0]).toMatchObject({ id: 'msg-failed' });
  });

  /*
   * 阶梯第 4 档(`AGENT_RUNTIME_DEF_INVALID`):卡上本来就没有恢复动作,唯一的
   * 主按钮来自「常驻次级〔联系支持〕升格」。那颗假 CTA 一出场,升格被压掉 ——
   * 于是整张卡真的一颗主按钮都不剩,正是第 4 档存在的理由要防的那件事。
   */
  it('侧边聊天 · 第 4 档:卡不许变成「零个主按钮 + 一颗假按钮」', () => {
    const { container } = renderFailure({
      code: 'AGENT_RUNTIME_DEF_INVALID',
      host: SIDE_CHAT_TAB,
    });

    expect(screen.queryByTestId('chat-error-switch-to-cloud')).toBeNull();
    const primaries = primaryActions(container);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]!.getAttribute('data-testid')).toBe('chat-error-contact-support');
  });

  it('两个口子只要接了一个(回落到打开 Cloud 设置),CTA 照旧在', () => {
    const onOpenAmrSettings = vi.fn();
    renderFailure({
      code: 'AGENT_EXECUTION_FAILED',
      detail: 'process_crashed',
      host: { onOpenAmrSettings },
    });

    fireEvent.click(screen.getByTestId('chat-error-switch-to-cloud'));

    expect(onOpenAmrSettings).toHaveBeenCalledTimes(1);
  });
});

/*
 * 反向锚点。`ProjectView` 那种两个 handler 都接的宿主,这次改动**一格都不许变** ——
 * OPEND-2772 的主位归属、〔重试〕让位到次级,全部照旧。
 */
describe('反向锚点 · 接手方在场的宿主行为不变', () => {
  it('ProjectView:主位仍是那颗〔切换到 Cloud〕', () => {
    const { container } = renderFailure({
      code: 'AGENT_EXECUTION_FAILED',
      detail: 'process_crashed',
      host: projectViewWiring(),
    });

    const cta = screen.getByTestId('chat-error-switch-to-cloud');
    const primaries = primaryActions(container);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toBe(cta);
  });

  it('ProjectView:〔重试〕仍在,仍是次级', () => {
    renderFailure({
      code: 'AGENT_EXECUTION_FAILED',
      detail: 'process_crashed',
      host: projectViewWiring(),
    });

    expect(screen.getByTestId('chat-error-retry').getAttribute('data-run-error-action')).toBe(
      'secondary',
    );
  });

  it('ProjectView:点它走的仍是 onSwitchToAmrAndRetry', () => {
    const host = projectViewWiring();
    renderFailure({
      code: 'AGENT_EXECUTION_FAILED',
      detail: 'process_crashed',
      host,
    });

    fireEvent.click(screen.getByTestId('chat-error-switch-to-cloud'));

    expect(host.onSwitchToAmrAndRetry).toHaveBeenCalledTimes(1);
    expect(host.onOpenAmrSettings).not.toHaveBeenCalled();
  });

  it('ProjectView · 第 4 档:主位仍是那颗 CTA,〔联系支持〕不升格', () => {
    const { container } = renderFailure({
      code: 'AGENT_RUNTIME_DEF_INVALID',
      host: projectViewWiring(),
    });

    const primaries = primaryActions(container);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]!.getAttribute('data-testid')).toBe('chat-error-switch-to-cloud');
  });
});
