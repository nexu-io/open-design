// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import {
  trackRunRecoveryActionClick,
  trackRunRecoveryActionSurfaceView,
} from '../../src/analytics/events';
import type { AppConfig, ChatMessage } from '../../src/types';

// ⚠️ **OPEND-2807 把〔继续运行〕从报错卡上撤掉了。**
//
// 这份文件原本是 resume-on-failure 的红测:一条 `resumable` 的失败(上游瞬断 /
// 空闲超时,daemon 能靠续跑同一个 CLI 会话捞回来)要给一颗〔继续运行〕,
// 走 `onResumeRun`,和从头再跑的〔重试〕区分开。
//
// 工单「[ChatPanel] 错误卡片未还原设计样式,应该只有三个按钮」+ 用户「别分那么
// 多情况了」之后,报错卡只剩 联系我们 / 导出日志 / 第三颗 CTA,〔继续运行〕
// 不在其中。**代价**:BYOK 与 Cloud 两侧都拿不到「保住已经跑出来的半截活」
// 那条路,`onResumeRun` 也随之没有调用点(prop 还在,ProjectView 仍然传)。
// 已写进 PR 描述与决策表交产品定夺。
//
// 留下来的是「它确实不上卡了」这条守卫 —— 三颗按钮之外一颗都不许多。

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

function resumableFailedMessage(agentId = 'amr'): ChatMessage {
  return {
    id: 'msg-upstream',
    role: 'assistant',
    content: 'Partial work before the upstream dropped.',
    createdAt: 1,
    runId: 'run-upstream',
    runStatus: 'failed',
    resumable: true,
    agentId,
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: 'Upstream request failed: stream disconnected before completion.',
        code: 'UPSTREAM_UNAVAILABLE',
      },
    ],
  };
}

function renderChat(opts: {
  onResumeRun?: (m: ChatMessage) => void;
  onRetry: (m: ChatMessage) => void;
  onSend?: (...args: unknown[]) => void;
  activeAgentId?: string;
  failedAgentId?: string;
}) {
  return render(
    <ChatPane
      messages={[resumableFailedMessage(opts.failedAgentId ?? 'amr')]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={opts.onSend ?? vi.fn()}
      onStop={vi.fn()}
      onRetry={opts.onRetry}
      onResumeRun={opts.onResumeRun}
      // Cloud CTA 只在宿主真的接得住时才画(ChatPane 的
      // `cloudSwitchHandoffAvailable`);ProjectView 是接得住的那一种。
      onSwitchToAmrAndRetry={vi.fn()}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: opts.activeAgentId ?? 'amr', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

describe('ChatPane resume-on-failure', () => {
  it('OPEND-2807:Cloud 上可续跑的失败也只给三颗按钮,〔继续运行〕不上卡', () => {
    const onResumeRun = vi.fn();
    const onRetry = vi.fn();
    const { container } = renderChat({ onResumeRun, onRetry, activeAgentId: 'amr' });

    expect(container.querySelector('[data-user-action-card="run-recovery"]')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'chat.resumeRunCta' })).toBeNull();

    const footer = container.querySelector('[data-user-action-footer="true"]');
    expect(footer).toBeTruthy();
    expect(
      Array.from(footer!.querySelectorAll('button')).map((b) => b.getAttribute('data-testid')),
    ).toEqual([
      'chat-error-contact-support',
      'chat-error-export-logs',
      'chat-error-retry',
    ]);

    // 第三颗是从头再跑那一颗,不是续跑 —— 走 onRetry,不碰 onResumeRun。
    fireEvent.click(screen.getByTestId('chat-error-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onResumeRun).not.toHaveBeenCalled();
  });

  it('OPEND-2807:BYOK 上可续跑的失败给的是〔切换到 Cloud〕,同样没有〔继续运行〕', () => {
    const onResumeRun = vi.fn();
    const { container } = renderChat({
      onResumeRun,
      onRetry: vi.fn(),
      activeAgentId: 'claude',
      failedAgentId: 'claude',
    });

    expect(screen.queryByRole('button', { name: 'chat.resumeRunCta' })).toBeNull();
    const footer = container.querySelector('[data-user-action-footer="true"]');
    expect(
      Array.from(footer!.querySelectorAll('button')).map((b) => b.getAttribute('data-testid')),
    ).toEqual([
      'chat-error-contact-support',
      'chat-error-export-logs',
      'chat-error-switch-to-cloud',
    ]);
    expect(onResumeRun).not.toHaveBeenCalled();
  });

  it('曝光埋点只报卡上真有的那一颗', () => {
    renderChat({ onResumeRun: vi.fn(), onRetry: vi.fn(), activeAgentId: 'amr' });

    expect(trackRunRecoveryActionSurfaceView).toHaveBeenCalledTimes(1);
    expect(vi.mocked(trackRunRecoveryActionSurfaceView).mock.calls[0]![1]).toMatchObject({
      element: 'run_recovery_action',
      task_execution_id: 'msg-upstream',
      recovery_action_type: 'manual_retry',
      source_run_id: 'run-upstream',
    });
  });
});
