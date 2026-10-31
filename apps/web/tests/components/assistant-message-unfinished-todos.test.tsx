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

  it('no longer shows a turn-end status word for empty API responses (P0-24)', () => {
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

    expect(screen.queryByText('The task could not be completed')).toBeNull();
    expect(screen.getByText(/provider ended the request/i)).toBeTruthy();
    // P0-24 Q6:「任务未能完成」也随回合末尾状态行一起去掉,状态只在壳头说
    expect(document.querySelector('[data-testid="assistant-label"]')).toBeNull();
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
    expect(screen.queryByText('Task not finished yet')).toBeNull();
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

  it('no longer says at the turn end that this turn still owes work (P0-24)', () => {
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

    // P0-24 Q6:回合末尾的状态行已去掉,状态只在壳头说。
    expect(screen.queryByText('Task not finished yet')).toBeNull();
    expect(document.querySelector('[data-testid="assistant-label"]')).toBeNull();
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
  // P0-24 Q6:回合末尾不再有状态词,① 收紧为「一行都没有」。
  it('an older Todo turn shows no turn-end status word and offers no stale exit (P0-24)', () => {
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

    // ① 页脚不再出状态词
    expect(document.querySelectorAll('[data-testid="assistant-label"]')).toHaveLength(0);

    // ② 出口只属于最后一轮
    expect(screen.queryByText('1 task(s) remain')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue remaining tasks' })).toBeNull();
    expect(document.querySelector('[data-testid="assistant-continue-remaining"]')).toBeNull();
  });

  it('does not surface retired plugin actions in the latest assistant turn', () => {
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

    expect(screen.queryByText('Plugin ready')).toBeNull();
    for (const action of ['install', 'publish', 'contribute', 'open-manifest']) {
      expect(screen.queryByTestId(`assistant-plugin-${action}-generated-plugin`)).toBeNull();
    }
    expect(onPluginFolderAgentAction).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();

  });
});
