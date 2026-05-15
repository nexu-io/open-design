// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    expect(screen.queryByText('Done')).toBeNull();
    expect(screen.queryByText('empty_response')).toBeNull();
  });

  it('keeps Done for a completed latest TodoWrite fixture', () => {
    render(
      <AssistantMessage
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

    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.queryByText('Stopped with unfinished work')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue remaining tasks' })).toBeNull();
  });

  it('uses persisted usage duration for completed messages that do not have endedAt', () => {
    render(
      <AssistantMessage
        message={{
          id: 'assistant-duration',
          role: 'assistant',
          content: 'Done',
          startedAt: 1_000,
          runStatus: 'succeeded',
          events: [{ kind: 'usage', outputTokens: 1439, durationMs: 32_000 }],
        }}
        streaming={false}
        projectId="project-1"
        isLast
      />,
    );

    expect(screen.getByText(/32s/)).toBeTruthy();
    expect(screen.getByText(/1439 out/)).toBeTruthy();
  });

  it('does not synthesize a growing elapsed time for completed messages without endedAt', () => {
    render(
      <AssistantMessage
        message={{
          id: 'assistant-duration-missing',
          role: 'assistant',
          content: 'Done',
          startedAt: 1_000,
          runStatus: 'succeeded',
          events: [{ kind: 'usage', outputTokens: 1439 }],
        }}
        streaming={false}
        projectId="project-1"
        isLast
      />,
    );

    expect(screen.getByText(/1439 out/)).toBeTruthy();
    expect(screen.queryByText(/\d+m \d{2}s/)).toBeNull();
  });

  it('shows unfinished state and passes unfinished todos to the continue callback', () => {
    const onContinue = vi.fn();
    render(
      <AssistantMessage
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
        onContinueRemainingTasks={onContinue}
      />,
    );

    expect(screen.getByText('Stopped with unfinished work')).toBeTruthy();
    expect(screen.getByText('2 task(s) remain')).toBeTruthy();
    const remainingList = screen.getByText('2 task(s) remain').closest('.unfinished-todos');
    expect(remainingList).not.toBeNull();
    expect(within(remainingList as HTMLElement).getByText('Building components')).toBeTruthy();
    expect(within(remainingList as HTMLElement).getByText('Run QA')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue remaining tasks' }));

    expect(onContinue).toHaveBeenCalledWith([
      {
        content: 'Build components',
        status: 'in_progress',
        activeForm: 'Building components',
      },
      { content: 'Run QA', status: 'pending', activeForm: undefined },
    ]);
  });

  it('hides the continue button on older assistant turns', () => {
    render(
      <AssistantMessage
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
        onContinueRemainingTasks={vi.fn()}
      />,
    );

    expect(screen.getByText('Stopped with unfinished work')).toBeTruthy();
    expect(screen.getByText('1 task(s) remain')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue remaining tasks' })).toBeNull();
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
      await screen.findByText('Sent to the agent. The CLI run will continue in chat.'),
    ).toBeTruthy();

    fireEvent.click(screen.getByTestId('assistant-plugin-open-manifest-generated-plugin'));
    expect(onOpen).toHaveBeenCalledWith('generated-plugin/open-design.json');
  });
});
