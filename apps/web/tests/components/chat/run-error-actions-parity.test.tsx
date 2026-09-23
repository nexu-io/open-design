// @vitest-environment jsdom
/**
 * 失败卡那一排三颗按钮**必须同一副壳**。
 *
 * 用户 2026-08-27:「这个按钮圆角明显跟别的不一样呢,你看看设计稿呢?」+「1:1 还原」。
 * 真机量到:
 *   联系支持  radius 999px  padding 4px 11px   ← 共享 `Button size="sm"`
 *   导出日志  radius 999px  padding 4px 11px   ← 共享 `Button size="sm"`
 *   重试      radius  4px   padding 6px 14px   ← 裸 `<button class="chat-error-action">`
 *
 * 稿子对这一排的规定(`chat-panel-next.html:3360-3377`):
 *   `.btn { padding: 6px 14px; border-radius: var(--radius-pill); font-weight: 600 }`
 *   `.btn.mod-sm { padding: 4px 11px; font-size: var(--t-mini) }`
 *   `.btn.mod-primary { background: var(--text-strong); color: var(--bg) }`
 * —— 三颗都是 `.btn`,差别只在 primary / secondary 和有没有 `mod-sm`。
 * 我们那颗重试压根没走这条路,所以圆角、内距、字重全都自成一套。
 *
 * 判据钉在「**用的是不是同一个原语**」上,不钉具体像素:
 * CSS Module 的类名带哈希,jsdom 也不解析 `var()`,量像素只会得到空值。
 * 同一个原语 ⇒ 同一套 radius/padding,这是共享组件的全部意义。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { Button } from '@open-design/components';

import { ChatPane } from '../../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../../src/types';

vi.mock('../../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (key: string) => key }),
  useT: () => (key: string) => key,
}));

vi.mock('../../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => <div>{message.content}</div>,
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
    trackRunFailedToastGoAmrClick: vi.fn(),
    trackRunRecoveryActionClick: vi.fn(),
    trackRunRecoveryActionSurfaceView: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Compare actual rendered Button contracts, not ChatPane variable names or JSX text. */
function buttonFingerprint(variant: 'primary' | 'secondary' = 'primary'): string[] {
  render(<Button data-testid={`probe-${variant}`} variant={variant} size="sm">probe</Button>);
  return Array.from(screen.getByTestId(`probe-${variant}`).classList);
}

function renderFailure(agentId: 'amr' | 'claude') {
  const message: ChatMessage = {
    id: 'failed-parity', role: 'assistant', content: 'Partial work.', createdAt: 1,
    agentId, runId: 'run-parity', runStatus: 'failed',
    events: [{ kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED', detail: 'failed' }],
  };
  const onRetry = vi.fn();
  const onSwitchToAmrAndRetry = vi.fn();
  render(
    <ChatPane
      messages={[message]} streaming={false} error={null}
      projectId="project-1" projectFiles={[]}
      onEnsureProject={async () => 'project-1'} onSend={vi.fn()} onStop={vi.fn()}
      onRetry={onRetry} onSwitchToAmrAndRetry={onSwitchToAmrAndRetry}
      conversations={[{ projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 }]}
      activeConversationId="conv-1" onSelectConversation={vi.fn()} onDeleteConversation={vi.fn()}
      config={{ agentId, agentCliEnv: {} } as AppConfig}
    />,
  );
  return { message, onRetry, onSwitchToAmrAndRetry };
}

function expectSharedSmallButton(element: HTMLElement, fingerprint: string[]): void {
  expect(element.tagName).toBe('BUTTON');
  expect(Array.from(element.classList)).toEqual(expect.arrayContaining(fingerprint));
}

describe('失败卡三颗按钮同壳', () => {
  it('共享 Button 的实际小尺寸类名指纹可用于比较', () => {
    const fp = buttonFingerprint();
    expect(fp.length).toBeGreaterThan(0);
    expect(fp.some((className) => /button/i.test(className))).toBe(true);
  });

  it('Cloud 重试使用共享小尺寸主按钮并调用原失败轮次', () => {
    const fingerprint = buttonFingerprint();
    const { message, onRetry, onSwitchToAmrAndRetry } = renderFailure('amr');
    const retry = screen.getByTestId('chat-error-retry');
    expectSharedSmallButton(retry, fingerprint);
    expect(retry.dataset.runErrorAction).toBe('primary');
    expect(retry.classList.contains('chat-error-action')).toBe(false);
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledExactlyOnceWith(message, 'manual_retry');
    expect(onSwitchToAmrAndRetry).not.toHaveBeenCalled();
  });

  it('CLI 的 Cloud 动作使用同一小尺寸主按钮，不附加旧重试', () => {
    const fingerprint = buttonFingerprint();
    const { message, onRetry, onSwitchToAmrAndRetry } = renderFailure('claude');
    const cloud = screen.getByTestId('chat-error-switch-to-cloud');
    expectSharedSmallButton(cloud, fingerprint);
    expect(cloud.dataset.runErrorAction).toBe('primary');
    expect(screen.queryByTestId('chat-error-retry')).toBeNull();
    fireEvent.click(cloud);
    expect(onSwitchToAmrAndRetry).toHaveBeenCalledExactlyOnceWith(message);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('常驻两颗实际使用共享小尺寸次级按钮', () => {
    const fingerprint = buttonFingerprint('secondary');
    renderFailure('amr');
    for (const testId of ['chat-error-contact-support', 'chat-error-export-logs']) {
      const action = screen.getByTestId(testId);
      expectSharedSmallButton(action, fingerprint);
      expect(action.dataset.runErrorAction).toBe('secondary');
    }
    expect(screen.getByTestId('chat-run-error-card').querySelectorAll('button')).toHaveLength(3);
  });
});
