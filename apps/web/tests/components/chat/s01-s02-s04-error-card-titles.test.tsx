// @vitest-environment jsdom
/**
 * 报错卡**标题**那一行的三格:S01 / S02 / S04(《Open Design 报错文案｜精简版》)。
 *
 * 第一批文案只落了正文,标题跳过了这三格 —— 因为它们不是纯文案改动:
 *
 *   ① **标题不传插值。** `ChatPane` 渲染标题是裸的 `t(runFailureUi.titleKey)`,
 *      一个变量都不给。正文那侧早就有 `{ agent: failedAgentLabel, ...messageVars }`。
 *      所以 S01 的新标题「未检测到 {智能体}」照抄进字典,用户屏幕上会看到
 *      **字面的 `{agent}`**。
 *
 *   ② **一个键装两句话。** S02(本地 agent 没登录,新稿「{智能体} 尚未登录」)和
 *      S04(Open Design 智能体没授权,新稿「Open Design 尚未登录」)今天共用
 *      `chat.runError.title.signInRequired`,渲染出来一模一样。Antigravity 那条
 *      终端登录的分流也挂在同一个键上,是 S02 那一边的第三个调用点。
 *
 * 判据钉在**用户看到的那行字**上,不钉键名:测试用真字典 + 真插值渲染
 * `<ChatPane>`,读报错卡标题那一行。键怎么拆是实现的事,拆完这几条仍要成立。
 */

import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../../src/types';

/**
 * 真字典 + 真插值。这是本文件的全部要害:**换成回声 mock 就照不出 ①** ——
 * 回声 mock 把 key 原样吐出来,`{agent}` 有没有被填根本看不见。
 * 替换规则逐字抄 `i18n/index.tsx` 的 `t`:没给值的槽**原样留着**大括号。
 */
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

function failedMessage(opts: { agentId: string; code: string }): ChatMessage {
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
      },
    ],
  } as ChatMessage;
}

/** 渲染一轮失败,回读报错卡**标题**那一行的文字 */
function errorCardTitle(opts: { agentId: string; code: string }): string {
  render(
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
  const card = screen.getByTestId('chat-run-error-card');
  // 卡的结构:标题行 → 说明行(`chat-run-error-description`)→ 动作排。
  // 标题是第一个元素子节点,里面还有一枚警告图标,取 textContent 即可。
  const title = card.firstElementChild;
  if (!title) throw new Error('报错卡没有标题行');
  return (title.textContent ?? '').trim();
}

describe('报错卡标题 · S01 / S02 / S04', () => {
  it('S01:标题说出真实 agent 名,而不是字面 {agent}', () => {
    const title = errorCardTitle({ agentId: 'claude', code: 'AGENT_UNAVAILABLE' });

    // ① 插值通道:没有通道时这里是字面的 `{agent}`
    expect(title).not.toMatch(/\{agent\}/);
    // 文案:产品原文「未检测到 {智能体}」
    expect(title).toContain('Claude');
    expect(title).toBe('未检测到 Claude');
  });

  it('S02:本地 agent 没登录 —— 标题点名是**哪个** agent 没登录', () => {
    const title = errorCardTitle({ agentId: 'claude', code: 'AGENT_AUTH_REQUIRED' });

    expect(title).not.toMatch(/\{agent\}/);
    expect(title).toBe('Claude 尚未登录');
  });

  it('S04:Open Design 智能体没授权 —— 标题说的是 Open Design 自己', () => {
    const title = errorCardTitle({ agentId: 'amr', code: 'AMR_AUTH_REQUIRED' });

    expect(title).not.toMatch(/\{agent\}/);
    expect(title).toBe('Open Design 尚未登录');
  });

  it('S02 和 S04 不是同一句话 —— 一个键装不下两格', () => {
    const s02 = errorCardTitle({ agentId: 'claude', code: 'AGENT_AUTH_REQUIRED' });
    cleanup();
    const s04 = errorCardTitle({ agentId: 'amr', code: 'AMR_AUTH_REQUIRED' });

    expect(s02).not.toBe(s04);
    /*
     * 「两句不一样」单独一条**照不出合并回去**:S02 那句带 `{agent}` 插值,
     * AMR 的 agent 名恰好是 `OpenDesign`,所以哪怕两格共用一个键,渲染出来
     * 也是「Claude 尚未登录」对「OpenDesign 尚未登录」—— 仍然不相等。
     * 判据要钉在 S04 说的**是不是产品那句**:`OpenDesign`(无空格)是 agent
     * 标签,`Open Design`(有空格)才是产品名。
     */
    expect(s04).not.toContain('OpenDesign');
  });

  /*
   * Antigravity 的登录只能在终端里做,所以它有自己的分流分支 —— 但它**是**
   * 一个本地 agent 没登录,归 S02 那一边。拆键时最容易漏的就是这一个:
   * 它离另外两个调用点有一百多行,而且 code 和 S02 完全一样。
   */
  it('Antigravity 的终端登录也落在 S02 那一边,点名 Antigravity', () => {
    const title = errorCardTitle({ agentId: 'antigravity', code: 'AGENT_AUTH_REQUIRED' });

    expect(title).not.toMatch(/\{agent\}/);
    expect(title).toBe('Antigravity 尚未登录');
  });

  it('AMR 的通用 401(UNAUTHORIZED)仍然是 S04 那句,不会掉到 S02', () => {
    const title = errorCardTitle({ agentId: 'amr', code: 'UNAUTHORIZED' });

    expect(title).toBe('Open Design 尚未登录');
  });

  it('非 AMR 的通用 401(UNAUTHORIZED)是 S02 那句', () => {
    const title = errorCardTitle({ agentId: 'codex', code: 'UNAUTHORIZED' });

    expect(title).toBe('Codex 尚未登录');
  });
});
