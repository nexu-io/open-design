// @vitest-environment jsdom

/**
 * 点一条「下一步引导」只会把建议填入 Composer。
 *
 * 结构化 `next_steps` 在刚结束的 live 回合和历史 replay 中共用同一条线:
 * `next_steps` 事件 → `AssistantMessage` → `NextStepActions`
 * → `ChatPane.handleNextStepSuggestion` → `composerRef.setDraft`。
 *
 * 点击本身不得调用 `onSend`;否则会在用户尚未确认时持久化消息、
 * 创建 run 并可能产生费用。
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../src/types';

type OnSend = Parameters<typeof ChatPane>[0]['onSend'];

const translate = (key: string, vars?: Record<string, string | number>) =>
  vars && Object.keys(vars).length > 0 ? `${key} ${Object.values(vars).join(' ')}` : key;

vi.mock('../../src/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/i18n')>();
  return {
    ...actual,
    useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
    useT: () => translate,
  };
});

/**
 * 每次 `setDraft` 带的第二个参数。
 *
 * 「点了只填草稿」这条产品裁决在实现上就是 `setDraft(prompt, …)`,而不是
 * `onSend(…)`;`entryFrom: 'next_step'` 是这条路径的归因标记 —— 丢了它,
 * 埋点看不出「这一条是从下一步引导起草的」,而且下一个人很容易顺手把它改回
 * 直接发送(那一步同样只改这一行)。所以这里把参数一起钉住。
 */
const setDraftCalls: Array<{ text: string; options?: unknown }> = [];

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, ref) => {
    const [draft, setDraft] = useState('');
    useImperativeHandle(ref, () => ({
      setDraft: (text: string, options?: unknown) => {
        setDraftCalls.push({ text, options });
        setDraft(text);
      },
      restoreDraft: ({ text }: { text: string }) => setDraft(text),
      focus: () => undefined,
      applyDesignToolboxAction: () => undefined,
      applyDesignToolboxSkill: () => undefined,
      openDesignToolbox: () => undefined,
      openPluginsPanel: () => undefined,
      scheduleComposerPanelClose: () => undefined,
      openPlusMenu: () => undefined,
    }));
    return <div data-testid="composer-draft">{draft}</div>;
  }),
}));

afterEach(() => {
  cleanup();
  setDraftCalls.length = 0;
  vi.clearAllMocks();
});

const SUGGESTIONS = ['再加一页订单列表', '把商品卡换成两列布局', '补一套深色模式'];

function deliveredMessage(withSuggestions = true): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Done.',
    createdAt: 1,
    runId: 'run-1',
    runStatus: 'succeeded',
    startedAt: 1700000000,
    endedAt: 1700000005,
    producedFiles: [
      {
        name: 'landing.html',
        path: 'landing.html',
        size: 100,
        mtime: 1700000005,
        kind: 'html',
        mime: 'text/html',
      },
    ],
    events: [
      { kind: 'text', text: 'Done.' },
      ...(withSuggestions ? [{ kind: 'next_steps' as const, suggestions: SUGGESTIONS }] : []),
    ],
  } as ChatMessage;
}

function replayedMessage(): ChatMessage {
  // A history response crosses a JSON persistence boundary before ChatPane
  // receives the same ChatMessage shape as a just-completed live turn.
  return JSON.parse(JSON.stringify({
    ...deliveredMessage(),
    id: 'persisted-msg-1',
  })) as ChatMessage;
}

function renderChat(
  onSend: OnSend,
  withSuggestions = true,
  message: ChatMessage = deliveredMessage(withSuggestions),
) {
  return render(
    <ChatPane
      messages={[message]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={onSend}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'claude', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

describe('ChatPane · 下一步引导', () => {
  it.each([
    ['刚结束的 live 回合', deliveredMessage()],
    ['历史 replay', replayedMessage()],
  ])('%s:点击只填入草稿,不新增消息或 run', (_label, message) => {
    const onSend = vi.fn<OnSend>(() => undefined);
    renderChat(onSend, true, message);

    const row = screen.getByTestId('next-step-suggestion-1');
    expect(row.textContent).toContain('把商品卡换成两列布局');
    const assistantCountBefore = screen.getAllByTestId('assistant-flow').length;
    const userCountBefore = screen.queryAllByTestId('user-message').length;

    fireEvent.click(row);

    expect(screen.getByTestId('composer-draft').textContent).toBe('把商品卡换成两列布局');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('assistant-flow')).toHaveLength(assistantCountBefore);
    expect(screen.queryAllByTestId('user-message')).toHaveLength(userCountBefore);
    // 起草路径本身,连同它的归因,一起钉住(OPEND-2497 产品裁决)
    expect(setDraftCalls).toEqual([
      { text: '把商品卡换成两列布局', options: { entryFrom: 'next_step' } },
    ]);
  });

  it('旧会话(没有 next_steps 事件)不出这一行', () => {
    const onSend = vi.fn<OnSend>(() => undefined);
    renderChat(onSend, false);
    expect(screen.queryByTestId('next-step-suggestions')).toBeNull();
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
    expect(onSend).not.toHaveBeenCalled();
  });
});
