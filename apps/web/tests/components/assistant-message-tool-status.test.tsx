// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { AgentEvent, ChatMessage } from '../../src/types';

function messageWithEvents(events: AgentEvent[]): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    events,
    startedAt: 1_000,
    endedAt: 3_000,
    runStatus: 'succeeded',
  };
}

describe('AssistantMessage tool status', () => {
  afterEach(() => cleanup());

  it('shows Done for a completed run tool use that has no tool result', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'tool-1',
            name: 'Bash',
            input: { command: 'pnpm guard', description: 'Run guard' },
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    const activity = screen.getByTestId('task-activity-toggle');
    expect(activity.textContent).toContain('Done');
    expect(activity.getAttribute('data-run-state')).toBe('completed');
    expect(activity.querySelector('.task-activity-complete-icon')).toBeNull();
    expect(container.querySelector('[data-tool-category="run"]')).not.toBeNull();
    expect(container.querySelector('.op-status-error')).toBeNull();
    expect(container.querySelector('.op-status-done')).toBeNull();
  });

  it('keeps legacy completed messages without runStatus as Done', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pnpm guard', description: 'Execute guard' },
            },
          ]),
          runStatus: undefined,
        }}
        streaming={false}
        projectId="project-1"
      />,
    );

    expect(screen.getByTestId('task-activity-toggle').textContent).toContain('Done');
    expect(container.querySelector('[data-tool-category="run"]')).not.toBeNull();
    expect(container.querySelector('.op-status-error')).toBeNull();
  });

  it('shows Done in a grouped completed run when tool results are missing', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'tool-1',
            name: 'Bash',
            input: { command: 'pnpm guard', description: 'Execute guard' },
          },
          {
            kind: 'tool_use',
            id: 'tool-2',
            name: 'Bash',
            input: { command: 'pnpm typecheck', description: 'Execute typecheck' },
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    expect(container.querySelector('.action-card-toggle.running')).toBeNull();
    expect(screen.getByTestId('task-activity-toggle').textContent).toContain('Done');
    expect(container.querySelectorAll('[data-tool-category="run"]')).toHaveLength(2);
  });

  it('does not group duplicate tool_use records with the same id', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'tool-1',
            name: 'Write',
            input: { file_path: '/repo/index.html', content: '<main />' },
          },
          {
            kind: 'tool_use',
            id: 'tool-1',
            name: 'Write',
            input: { file_path: '/repo/index.html', content: '<main />' },
          },
          {
            kind: 'tool_result',
            toolUseId: 'tool-1',
            content: 'ok',
            isError: false,
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    const activity = screen.getByTestId('task-activity-toggle');
    expect(activity).toBeTruthy();
    expect(activity.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(activity);
    expect(activity.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelectorAll('.op-card.op-file')).toHaveLength(1);
    expect(screen.getByTestId('file-ops-row-index.html')).toBeTruthy();
    expect(container.querySelector('[data-testid="file-ops-toggle"]')).toBeNull();
    expect(container.textContent).not.toContain('×2');
  });

  it('keeps read-only files in execution history instead of labeling them as output', () => {
    render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          { kind: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/repo/source.ts' } },
          { kind: 'tool_result', toolUseId: 'tool-1', content: 'source', isError: false },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    expect(screen.getByTestId('task-activity-toggle')).toBeTruthy();
    expect(screen.queryByTestId('file-ops-summary')).toBeNull();
  });

  it('collapses mixed tool families into one execution record', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          { kind: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/repo/source.ts' } },
          { kind: 'tool_result', toolUseId: 'tool-1', content: 'source', isError: false },
          { kind: 'tool_use', id: 'tool-2', name: 'Write', input: { file_path: '/repo/result.ts', content: 'export {}' } },
          { kind: 'tool_result', toolUseId: 'tool-2', content: 'ok', isError: false },
          { kind: 'tool_use', id: 'tool-3', name: 'Bash', input: { command: 'pnpm typecheck' } },
          { kind: 'tool_result', toolUseId: 'tool-3', content: 'ok', isError: false },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    const activity = screen.getByTestId('task-activity-toggle');
    expect(activity).toBeTruthy();
    expect(activity.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(activity);
    expect(activity.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelectorAll('.op-card')).toHaveLength(3);
    expect(container.querySelector('[data-tool-category="read"]')).not.toBeNull();
    expect(container.querySelector('[data-tool-category="write"]')).not.toBeNull();
    expect(container.querySelector('[data-tool-category="run"]')).not.toBeNull();
  });

  it('does not show Done when a failed run is missing a tool result', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pnpm guard', description: 'Execute guard' },
            },
          ]),
          runStatus: 'failed',
        }}
        streaming={false}
        projectId="project-1"
      />,
    );

    const activity = screen.getByTestId('task-activity-toggle');
    expect(activity.textContent).toContain('Run failed');
    expect(activity.getAttribute('data-run-state')).toBe('error');
    expect(activity.querySelector('.task-activity-status')).toBeNull();
    expect(container.querySelector('[data-tool-category="run"][data-tool-state="error"]')).not.toBeNull();
    expect(container.querySelector('.op-status-done')).toBeNull();
  });

  it('does not show Done when a canceled run is missing a tool result', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pnpm guard', description: 'Execute guard' },
            },
          ]),
          runStatus: 'canceled',
        }}
        streaming={false}
        projectId="project-1"
      />,
    );

    expect(screen.getByTestId('task-activity-toggle').textContent).toContain('Run failed');
    expect(container.querySelector('[data-tool-category="run"][data-tool-state="error"]')).not.toBeNull();
    expect(container.querySelector('.op-status-done')).toBeNull();
  });

  it('keeps Running for a streaming tool use that has no tool result', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pnpm guard', description: 'Run guard' },
            },
          ]),
          endedAt: undefined,
          runStatus: 'running',
        }}
        streaming
        projectId="project-1"
      />,
    );

    const activity = screen.getByTestId('task-activity-current');
    expect(activity.textContent).toContain('Bash');
    expect(activity.textContent).toContain('Run guard');
    expect(activity.getAttribute('data-run-state')).toBe('running');
    expect(screen.queryByTestId('task-activity-toggle')).toBeNull();
    expect(activity.querySelector('.task-activity-complete-icon')).toBeNull();
    expect(container.querySelector('[data-tool-category="run"][data-tool-state="running"]')).not.toBeNull();
    expect(container.querySelector('.op-status-done')).toBeNull();
  });

  it('keeps a streaming task disclosure open for live code and collapses it when settled', () => {
    const streamingEvents = [
      {
        kind: 'tool_use' as const,
        id: 'tool-1',
        name: 'Write',
        input: { file_path: '/repo/result.ts', content: 'export const value = 1;' },
      },
      { kind: 'text' as const, text: 'Writing the result now.' },
    ];
    const { container, rerender } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents(streamingEvents),
          endedAt: undefined,
          runStatus: 'running',
        }}
        streaming
        liveToolInput={{
          'live-write': {
            name: 'Write',
            text: '{"file_path":"/repo/result.ts","content":"export const value = 1;"}',
          },
        }}
        projectId="project-1"
      />,
    );

    const liveActivity = screen.getByTestId('task-activity-toggle');
    expect(liveActivity.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.live-code-box')?.textContent).toContain('export const value = 1;');

    rerender(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            ...streamingEvents,
            { kind: 'tool_result', toolUseId: 'tool-1', content: 'ok', isError: false },
          ]),
          runStatus: 'succeeded',
        }}
        streaming={false}
        projectId="project-1"
      />,
    );

    expect(screen.getByTestId('task-activity-toggle').getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the stream cursor on prose after task activity is split out', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Bash',
              input: { command: 'pnpm guard', description: 'Run guard' },
            },
            { kind: 'text', text: 'The answer is still streaming.' },
          ]),
          endedAt: undefined,
          runStatus: 'running',
        }}
        streaming
        projectId="project-1"
      />,
    );

    const prose = container.querySelector('.prose-block[data-stream-cursor="true"]');
    expect(prose?.textContent).toContain('The answer is still streaming.');
  });

  it('replaces the single live progress row and expands the history when prose starts', () => {
    const renderMessage = (
      events: AgentEvent[],
      options: { streaming: boolean; runStatus: ChatMessage['runStatus']; endedAt?: number },
    ) => (
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents(events),
          endedAt: options.endedAt,
          runStatus: options.runStatus,
        }}
        streaming={options.streaming}
        projectId="project-1"
      />
    );
    const thinking = { kind: 'thinking', text: 'Reviewing the request.' } satisfies AgentEvent;
    const read = {
      kind: 'tool_use',
      id: 'tool-1',
      name: 'Read',
      input: { file_path: '/repo/source.ts' },
    } satisfies AgentEvent;

    const { rerender } = render(renderMessage(
      [thinking],
      { streaming: true, runStatus: 'running' },
    ));
    expect(screen.getByTestId('task-activity-current').textContent).toContain('Thinking');
    expect(screen.queryByTestId('task-activity-toggle')).toBeNull();

    rerender(renderMessage(
      [thinking, read],
      { streaming: true, runStatus: 'running' },
    ));
    const currentRead = screen.getByTestId('task-activity-current');
    expect(currentRead.textContent).toContain('Read');
    expect(currentRead.textContent).toContain('source.ts');
    expect(currentRead.textContent).not.toContain('Thinking');

    rerender(renderMessage(
      [thinking, read, { kind: 'text', text: 'Here is the conclusion.' }],
      { streaming: true, runStatus: 'running' },
    ));
    expect(screen.queryByTestId('task-activity-current')).toBeNull();
    const concludingActivity = screen.getByTestId('task-activity-toggle');
    expect(concludingActivity.getAttribute('aria-expanded')).toBe('true');
    expect(concludingActivity.textContent).toContain('Working');

    rerender(renderMessage(
      [
        thinking,
        read,
        { kind: 'tool_result', toolUseId: 'tool-1', content: 'source', isError: false },
        { kind: 'text', text: 'Here is the conclusion.' },
      ],
      { streaming: false, runStatus: 'succeeded', endedAt: 3_000 },
    ));
    const completedActivity = screen.getByTestId('task-activity-toggle');
    expect(completedActivity.getAttribute('aria-expanded')).toBe('false');
    expect(completedActivity.textContent).toContain('Done');
    expect(completedActivity.querySelector('.task-activity-complete-icon')).toBeNull();
  });

  it('keeps the run state above the answer and groups thinking into the timeline', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          { kind: 'thinking', text: 'Reviewing the request.' },
          { kind: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/repo/source.ts' } },
          { kind: 'tool_result', toolUseId: 'tool-1', content: 'source', isError: false },
          { kind: 'text', text: 'Here is the finished answer.' },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    const flow = container.querySelector('.assistant-flow');
    const activity = screen.getByTestId('task-activity-toggle');
    expect(flow?.firstElementChild?.classList.contains('task-activity')).toBe(true);
    expect(activity.textContent).toContain('Done');
    expect(flow?.textContent).toContain('Here is the finished answer.');

    fireEvent.click(activity);
    const activityCard = activity.closest('.task-activity');
    expect(activityCard?.querySelector('.thinking-block')).not.toBeNull();
    expect(activityCard?.querySelector('[data-tool-category="read"]')).not.toBeNull();
    expect(screen.queryByTestId('task-activity-terminal')).toBeNull();
  });

  it('renders URLs in JSON-like status details without trailing structural characters', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'status',
            label: 'publish repo',
            detail: '{"url":"https://github.com/nexu-io/example-plugin","nameWithOwner":"nexu-io/example-plugin"}',
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    const link = container.querySelector('.status-detail a.md-link');
    expect(link?.getAttribute('href')).toBe('https://github.com/nexu-io/example-plugin');
    expect(link?.textContent).toBe('https://github.com/nexu-io/example-plugin');
    expect(container.querySelector('.status-detail')?.textContent).toContain('"}');
  });
});
