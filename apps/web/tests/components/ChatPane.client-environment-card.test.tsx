// @vitest-environment jsdom
/** Environment error copy remains classified separately from regional S30.
 * G16 fixes error-card actions by the failed run's Cloud/local identity;
 * certificate diagnostics no longer add Settings or local Retry controls.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import { zhCN } from '../../src/i18n/locales/zh-CN';
import type { ChatMessage } from '../../src/types';

// `Dict` 是逐条列举的字面量键,没有索引签名 —— 断言成 `Record<string, …>`
// 会被 tsc 当成不相干的两个类型拦下(TS2352)。按 `keyof` 取才是它自己的读法,
// 顺带保住「拼错的 key 在编译期就该被看见」这件事;运行时取不到再退回 key。
const translate = (key: string, vars?: Record<string, string | number>) => {
  const raw = zhCN[key as keyof typeof zhCN] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] === undefined ? `{${name}}` : String(vars[name]),
  );
};
vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'zh-CN', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

afterEach(() => cleanup());

/** 同事真机上撞到的那一格:opencode 的证书报错原样传到 daemon 并被命名。 */
function certificateFailureTurn(agentId = 'amr'): ChatMessage[] {
  return [
    { id: 'user-1', role: 'user', content: 'Build it', createdAt: 0 },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      createdAt: 1,
      endedAt: 2,
      runId: 'run-1',
      runStatus: 'failed',
      agentId,
      events: [
        {
          kind: 'status',
          label: 'error',
          detail: 'unknown certificate verification error',
          code: 'AGENT_EXECUTION_FAILED',
          failureDetail: 'certificate_failure',
        },
      ],
    } as unknown as ChatMessage,
  ];
}

function renderPane(extra: Record<string, unknown>) {
  return render(
    <ChatPane
      projectKindForTracking="prototype"
      messages={certificateFailureTurn()}
      streaming={false}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      conversations={[{ id: 'conv-1', title: 'c', createdAt: 0, updatedAt: 0 }] as never}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      projectMetadata={{} as never}
      error={null}
      {...extra}
    />,
  );
}

describe('G16 · 环境类报错卡的固定按钮', () => {
  it('Cloud 证书失败只通过固定重试处理原失败轮', () => {
    const onOpenSettings = vi.fn();
    const onRetry = vi.fn();
    renderPane({ onOpenSettings, onRetry });
    const card = screen.getByTestId('chat-run-error-card');
    expect(within(card).getAllByRole('button').map((button) => button.textContent?.trim()))
      .toEqual(['联系我们', '导出日志', '重试']);
    fireEvent.click(within(card).getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'assistant-1' }), 'manual_retry');
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it('本地 CLI 证书失败只交给 Cloud，不调用本地重试或设置', () => {
    const onRetry = vi.fn();
    const onOpenSettings = vi.fn();
    const onSwitchToAmrAndRetry = vi.fn();
    renderPane({ messages: certificateFailureTurn('opencode'), onRetry, onOpenSettings, onSwitchToAmrAndRetry });
    const card = screen.getByTestId('chat-run-error-card');
    expect(within(card).getAllByRole('button').map((button) => button.textContent?.trim()))
      .toEqual(['联系我们', '导出日志', '切换到 OpenDesign Cloud']);
    fireEvent.click(within(card).getByRole('button', { name: '切换到 OpenDesign Cloud' }));
    expect(onSwitchToAmrAndRetry).toHaveBeenCalledWith(expect.objectContaining({ id: 'assistant-1', agentId: 'opencode' }));
    expect(onRetry).not.toHaveBeenCalled();
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it('固定动作不额外生成另一张 Cloud 指导卡', () => {
    const { container } = renderPane({ onOpenSettings: vi.fn(), onRetry: vi.fn() });
    expect(container.querySelector('.amr-guidance')).toBeNull();
  });
});

describe('S30 · 环境类报错卡的文案', () => {
  /**
   * ⚠️ 这张卡**没有**用产品文档 S30 的润色列。S30 那张润色表只写了一行,
   * 「场景内的情况」写死是「地区不支持」;而这张卡服务的五个 detail 里没有一个
   * 是地区拦截(真正的地区信号 `Country, region, or territory not supported`
   * 落在 `upstream_client_error`)。判据全文在 `amr-guidance.ts` 的
   * `clientEnvironmentCard` 文档注释里。此处改用补充文档 revision 96 为证书专门批准的文案。
   */
  it('卡面逐字使用产品补充文档的证书标题和正文', () => {
    renderPane({ onOpenSettings: vi.fn(), onRetry: vi.fn() });

    expect(screen.getByText('无法安全连接服务')).toBeTruthy();
    // 括号里是这一格自己的成因,不是五格一个说法。
    const body = screen.getByTestId('chat-run-error-description').textContent ?? '';
    expect(body).toBe('连接服务时未通过安全验证，请尝试更换网络。');
  });

  it('卡上不再出现「任务未能完成」这句什么都没说的兜底', () => {
    renderPane({ onOpenSettings: vi.fn(), onRetry: vi.fn() });
    expect(screen.queryByText('任务未能完成')).toBeNull();
  });

  it('也不再把上游那串英文原文摊在卡面上', () => {
    const { container } = renderPane({ onOpenSettings: vi.fn(), onRetry: vi.fn() });
    expect(container.textContent).not.toContain('unknown certificate verification error');
  });
});
