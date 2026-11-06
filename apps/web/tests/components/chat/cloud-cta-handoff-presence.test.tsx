// @vitest-environment jsdom
/**
 * CTA 只在真实回调存在时渲染；G16 不允许缺 Cloud 接线的裸组件退回旧 CLI 重试。
 * 未接回调的夹具只是组件边界，不代表真实 SideChat。真实侧聊→FileWorkspace→
 * ProjectView→认证回程的来源与执行归属由独立宿主测试覆盖。
 * 已接回调的 CLI/BYOK 卡固定三颗，Cloud 设置是既有兼容回调，不造空按钮。
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

/** 故意缺少 Cloud 回调的裸 ChatPane，不能冒充当前真实侧聊。 */
const UNWIRED_COMPONENT: HostWiring = {};

/** `ProjectView` 的接线:两个都接 */
function projectViewWiring(): Required<HostWiring> & { onSwitchToAmrAndRetry: ReturnType<typeof vi.fn> } {
  return {
    onSwitchToAmrAndRetry: vi.fn(),
    onOpenAmrSettings: vi.fn(),
  } as never;
}

describe('裸组件缺 Cloud 接线时不伪造恢复入口', () => {
  it('不画点了没反应的 Cloud 按钮', () => {
    const { container } = renderFailure({
      code: 'AGENT_EXECUTION_FAILED', detail: 'process_crashed', host: UNWIRED_COMPONENT,
    });

    expect(screen.queryByTestId('chat-error-switch-to-cloud')).toBeNull();
    expect(Array.from(container.querySelectorAll('button')).filter((button) =>
      (button.textContent ?? '').includes('切换到 OpenDesign Cloud'),
    )).toHaveLength(0);
  });

  it('不回退旧 CLI 重试，常驻动作保持次级', () => {
    const { container } = renderFailure({
      code: 'AGENT_EXECUTION_FAILED', detail: 'process_crashed', host: UNWIRED_COMPONENT,
    });

    expect(screen.queryByTestId('chat-error-retry')).toBeNull();
    expect(primaryActions(container)).toHaveLength(0);
    expect(screen.getByTestId('chat-error-contact-support').dataset.runErrorAction).toBe('secondary');
    expect(screen.getByTestId('chat-error-export-logs').dataset.runErrorAction).toBe('secondary');
  });

  it('缺 Cloud 回调不会借常驻按钮调用本地重试', () => {
    const { onRetry } = renderFailure({
      code: 'AGENT_EXECUTION_FAILED', detail: 'process_crashed', host: UNWIRED_COMPONENT,
    });

    fireEvent.click(screen.getByTestId('chat-error-contact-support'));
    expect(screen.getByTestId('chat-support-dialog')).toBeTruthy();
    expect(onRetry).not.toHaveBeenCalled();
    expect(screen.queryByTestId('chat-error-retry')).toBeNull();
  });

  it('旧第 4 档也不造 Cloud 按钮或将联系支持升格', () => {
    const { container } = renderFailure({ code: 'AGENT_RUNTIME_DEF_INVALID', host: UNWIRED_COMPONENT });

    expect(screen.getByTestId('chat-run-error-card')).toBeTruthy();
    expect(screen.queryByTestId('chat-error-switch-to-cloud')).toBeNull();
    expect(primaryActions(container)).toHaveLength(0);
    expect(screen.getByTestId('chat-error-contact-support').dataset.runErrorAction).toBe('secondary');
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

// 接线完整时固定三颗，真实回调优先于设置兼容回调。
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

  it('ProjectView:CLI 只保留固定三颗，不再另加本地重试', () => {
    renderFailure({
      code: 'AGENT_EXECUTION_FAILED',
      detail: 'process_crashed',
      host: projectViewWiring(),
    });

    expect(screen.queryByTestId('chat-error-retry')).toBeNull();
    expect(Array.from(screen.getByTestId('chat-run-error-card').querySelectorAll('button'),
      (button) => button.dataset.testid)).toEqual([
      'chat-error-contact-support', 'chat-error-export-logs', 'chat-error-switch-to-cloud',
    ]);
  });

  it('ProjectView:点它走的仍是 onSwitchToAmrAndRetry', () => {
    const host = projectViewWiring();
    renderFailure({
      code: 'AGENT_EXECUTION_FAILED',
      detail: 'process_crashed',
      host,
    });

    fireEvent.click(screen.getByTestId('chat-error-switch-to-cloud'));

    expect(host.onSwitchToAmrAndRetry).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 'msg-failed', agentId: 'claude' }),
    );
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
