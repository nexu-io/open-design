// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { AgentEvent, ChatMessage, ProjectFile } from '../../src/types';

function messageWithEvents(events: AgentEvent[]): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    events,
    startedAt: 1_000,
    endedAt: 3_000,
  };
}

function workspaceFile(name: string): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 100,
    mtime: 1700000000,
    kind: name.endsWith('.json') ? 'code' : 'text',
    mime: name.endsWith('.json') ? 'application/json' : 'text/plain',
  };
}

describe('AssistantMessage unfinished todo state', () => {
  afterEach(() => cleanup());

  it('suppresses direction picker forms when a design system is active', () => {
    const directionForm = [
      'Pick one:',
      '<question-form id="direction" title="Pick a visual direction">',
      JSON.stringify({
        questions: [
          {
            id: 'direction',
            label: 'Direction',
            type: 'direction-cards',
            options: ['Modern minimal'],
            cards: [
              {
                id: 'Modern minimal',
                label: 'Modern minimal',
                mood: 'Clean and restrained.',
                references: ['Linear'],
                palette: ['#ffffff', '#111111'],
                displayFont: 'serif',
                bodyFont: 'sans-serif',
              },
            ],
          },
        ],
      }),
      '</question-form>',
    ].join('\n');

    render(
      <AssistantMessage
        message={messageWithEvents([{ kind: 'text', text: directionForm }])}
        streaming={false}
        projectId="project-1"
        isLast
        suppressDirectionForms
      />,
    );

    expect(
      screen.getByText('Active design system selected. Visual direction is already locked.'),
    ).toBeTruthy();
    expect(screen.queryByText('Pick a visual direction')).toBeNull();
    expect(screen.queryByText('Modern minimal')).toBeNull();
  });

  it('shows a soft no-output state instead of Done for empty API responses', () => {
    render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          { kind: 'status', label: 'empty_response', detail: 'deepseek-chat' },
          {
            kind: 'text',
            text: 'The provider ended the request without returning text or an artifact. Try another model or provider, check quota, or retry.',
          },
        ])}
        streaming={false}
        projectId="project-1"
        isLast
      />,
    );

    expect(screen.getByText('No output')).toBeTruthy();
    expect(screen.getByText(/provider ended the request/i)).toBeTruthy();
    // 「Done」现在是执行记录壳头的状态词(D10:壳永远出现),但回合状态行仍然只说「没有输出」
    expect(document.querySelector('[data-testid="assistant-label"]')?.textContent).toBe('No output');
    expect(screen.queryByText('empty_response')).toBeNull();
  });

  it('lets the pinned Todo summary own completion status', () => {
    render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'todo-1',
            name: 'TodoWrite',
            input: { todos: [{ content: 'Ship layout', status: 'completed' }] },
          },
        ])}
        streaming={false}
        projectId="project-1"
        isLast
      />,
    );

    // 完成度由 composer 上方那张固定清单卡拥有,这条消息自己不再摆一个完成状态行
    expect(document.querySelector('[data-testid="assistant-label"]')).toBeNull();
    expect(screen.queryByText('Stopped with unfinished work')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue remaining tasks' })).toBeNull();
  });

  it('hides answer-footer duration, token, and cost statistics', () => {
    render(
      <AssistantMessage
        message={{
          id: 'assistant-usage',
          role: 'assistant',
          content: 'Done',
          startedAt: 1_000,
          runStatus: 'succeeded',
          events: [{ kind: 'usage', outputTokens: 1439, durationMs: 32_000, costUsd: 0.0123 }],
        }}
        streaming={false}
        projectId="project-1"
        isLast
      />,
    );

    expect(screen.queryByText(/32s/)).toBeNull();
    expect(screen.queryByText(/1439 out/)).toBeNull();
    expect(screen.queryByText(/\$0\.0123/)).toBeNull();
  });

  it('says on the turn-status row that this turn still owes work', () => {
    render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'todo-1',
            name: 'TodoWrite',
            input: {
              todos: [
                { content: 'Draft layout', status: 'completed' },
                {
                  content: 'Build components',
                  status: 'in_progress',
                  activeForm: 'Building components',
                },
                { content: 'Run QA', status: 'pending' },
              ],
            },
          },
        ])}
        streaming={false}
        projectId="project-1"
        isLast
      />,
    );

    /*
     * 这一条原来断言三样东西都**不**出现,理由是「归那张常驻的 TodoCard 管」——
     * 那张卡已经不在了(见 `chat-panel-feedback.md` 的 T7),于是「还欠着活」这件事
     * 现在由**轮次状态行**自己说,〔继续未完成任务〕也挂在那一行上。
     *
     * 按钮要有回调才画得出来,所以这里只钉住那句话:出口本身在
     * `tests/components/chat/todo-recall.test.tsx` 里验。
     */
    expect(screen.getByText('Stopped with unfinished work')).toBeTruthy();
  });

  /*
   * ⚠️ 这一条 2026-09-02 换过断言。
   *
   * 原来它要求**旧的**那一轮什么都不说,理由是「完成度归 composer 上方那张常驻
   * TodoCard 管,消息自己再说一遍就是重复」。那张卡已经没了(`chat-panel-feedback.md`
   * 的 T7),`hideRunStatus` 里的 `hasTodoSnapshot` 也跟着摘掉了 —— 于是每一轮都由
   * **自己的**轮次状态行报自己的终态。
   *
   * 那么旧轮次该说什么?只能说实话。它当时确实停在还欠着活的状态上,把这一行
   * 按 `isLast` 关掉,剩下的就只能是那枚绿勾「已完成」——**那是假的**。
   *
   * 所以这条改成钉住真正怕的两件事:
   *   ① 不许**重复** —— 全文档只有一行状态词(原标题的本意);
   *   ② 旧轮次不给**可点的出口** —— 〔继续剩余任务〕和「还剩几条」只属于最后一轮,
   *      翻历史时点它会把早已做完的旧账重新塞回去。
   */
  it('lets an older Todo turn state its own outcome without duplicating or offering a stale exit', () => {
    render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'todo-1',
            name: 'TodoWrite',
            input: { todos: [{ content: 'Run QA', status: 'pending' }] },
          },
        ])}
        streaming={false}
        projectId="project-1"
        isLast={false}
        onContinueRemainingTasks={() => {}}
      />,
    );

    // ① 一行,只有一行
    const labels = document.querySelectorAll('[data-testid="assistant-label"]');
    expect(labels).toHaveLength(1);
    expect(labels[0]?.textContent).toBe('Stopped with unfinished work');
    // 没跑完的那几档用 `<i class="dot">`,跑完才换成画绿勾的 `<svg class="dot">`。
    // 旧轮次不许被这枚绿勾说成「已完成」。
    // (壳头自己那句「Done」是另一回事 —— 它说的是进程跑完了,不是活干完了)
    expect(labels[0]?.querySelector('svg.dot')).toBeNull();

    // ② 出口只属于最后一轮
    expect(screen.queryByText('1 task(s) remain')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue remaining tasks' })).toBeNull();
    expect(document.querySelector('[data-testid="assistant-continue-remaining"]')).toBeNull();
  });

  it('surfaces generated plugin next actions in the latest assistant turn', async () => {
    const onOpen = vi.fn();
    const onPluginFolderAgentAction = vi.fn(async () => {});
    render(
      <AssistantMessage
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'write-manifest',
              name: 'Write',
              input: { path: 'open-design.json' },
            },
            {
              kind: 'tool_result',
              toolUseId: 'write-manifest',
              content: 'ok',
              isError: false,
            },
          ]),
          content: 'The plugin is ready to publish.',
        }}
        streaming={false}
        projectId="project-1"
        projectFiles={[
          workspaceFile('generated-plugin/open-design.json'),
          workspaceFile('generated-plugin/SKILL.md'),
          workspaceFile('generated-plugin/examples/demo.md'),
        ]}
        onRequestOpenFile={onOpen}
        onRequestPluginFolderAgentAction={onPluginFolderAgentAction}
        isLast
      />,
    );

    expect(screen.getByText('Plugin ready')).toBeTruthy();
    expect(screen.getByTestId('assistant-plugin-install-generated-plugin')).toBeTruthy();
    expect(screen.getByTestId('assistant-plugin-publish-generated-plugin')).toBeTruthy();
    expect(screen.getByTestId('assistant-plugin-contribute-generated-plugin')).toBeTruthy();

    fireEvent.click(screen.getByTestId('assistant-plugin-contribute-generated-plugin'));
    expect(onPluginFolderAgentAction).toHaveBeenCalledWith('generated-plugin', 'contribute');
    expect(
      screen.queryByText('Sent to the agent. The CLI run will continue in chat.'),
    ).toBeNull();

    fireEvent.click(screen.getByTestId('assistant-plugin-open-manifest-generated-plugin'));
    expect(onOpen).toHaveBeenCalledWith('generated-plugin/open-design.json');
  });
});
