// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import { ToolCard } from '../../src/components/ToolCard';
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

    expect(container.querySelector('.op-status-ok')).toBeNull();
    expect(container.querySelector('.op-status-running')).toBeNull();
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

    expect(container.querySelector('.op-status-ok')).toBeNull();
    expect(container.querySelector('.op-status-running')).toBeNull();
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

    const group = container.querySelector('.chat-surface.action-card');
    expect(group?.classList.contains('is-done')).toBe(true);
    expect(group?.classList.contains('is-running')).toBe(false);
    expect(group?.querySelector('.chat-surface-title')?.textContent).toBe('Running ×2');
    expect(group?.querySelector('.chat-surface-title')?.textContent).not.toMatch(/done/i);
    expect(group?.querySelector('.chat-surface-status')).toBeNull();
    expect(screen.getByRole('button', { name: /^Running ×2$/i })).toBeTruthy();
  });

  it('marks grouped rows as running only while at least one command is unfinished', () => {
    const { container, rerender } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={{
          ...messageWithEvents([
            {
              kind: 'tool_use',
              id: 'tool-1',
              name: 'Read',
              input: { file_path: 'one.ts' },
            },
            {
              kind: 'tool_use',
              id: 'tool-2',
              name: 'Read',
              input: { file_path: 'two.ts' },
            },
          ]),
          endedAt: undefined,
          runStatus: 'running',
        }}
        streaming
        projectId="project-1"
      />,
    );

    const runningGroup = container.querySelector('.chat-surface.action-card');
    expect(runningGroup?.classList.contains('is-running')).toBe(true);
    expect(runningGroup?.classList.contains('is-done')).toBe(false);
    expect(runningGroup?.querySelector('.chat-surface-title')?.textContent).toBe('Reading ×2');

    rerender(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'tool-1',
            name: 'Read',
            input: { file_path: 'one.ts' },
          },
          {
            kind: 'tool_result',
            toolUseId: 'tool-1',
            content: 'one',
            isError: false,
          },
          {
            kind: 'tool_use',
            id: 'tool-2',
            name: 'Read',
            input: { file_path: 'two.ts' },
          },
          {
            kind: 'tool_result',
            toolUseId: 'tool-2',
            content: 'two',
            isError: false,
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    const doneGroup = container.querySelector('.chat-surface.action-card');
    expect(doneGroup?.classList.contains('is-running')).toBe(false);
    expect(doneGroup?.classList.contains('is-done')).toBe(true);
    expect(doneGroup?.querySelector('.chat-surface-title')?.textContent).toBe('Reading ×2');
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

    expect(container.querySelector('.op-status-error')).not.toBeNull();
    expect(container.querySelector('.op-status-ok')).toBeNull();
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

    expect(container.querySelector('.op-status-error')).not.toBeNull();
    expect(container.querySelector('.op-status-ok')).toBeNull();
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

    expect(container.querySelector('.op-status-running')).not.toBeNull();
    expect(container.querySelector('.op-status-ok')).toBeNull();
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

describe('ToolCard file opening affordances', () => {
  afterEach(() => cleanup());

  it('opens a written project file from the path label without a trailing open button', () => {
    const onRequestOpenFile = vi.fn();
    const { container } = render(
      <ToolCard
        use={{
          kind: 'tool_use',
          id: 'tool-1',
          name: 'Write',
          input: {
            file_path: '/Users/lucifer/Library/Application Support/Open Design/namespaces/release-stable/projects/proj-1/index.html',
            content: '<html></html>',
          },
        }}
        runStreaming={false}
        runSucceeded
        projectFileNames={new Set(['index.html'])}
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    expect(container.querySelector('.op-open')).toBeNull();
    const pathButton = container.querySelector<HTMLButtonElement>('button.op-path-button');
    expect(pathButton?.textContent).toContain('/Users/lucifer/Library/Application Support/Open Design');

    fireEvent.click(pathButton!);
    expect(onRequestOpenFile).toHaveBeenCalledWith('index.html');
  });

  it('leaves file paths inert when the target is not in the project file set', () => {
    const onRequestOpenFile = vi.fn();
    const { container } = render(
      <ToolCard
        use={{
          kind: 'tool_use',
          id: 'tool-1',
          name: 'Read',
          input: { file_path: '/tmp/outside.log' },
        }}
        runStreaming={false}
        runSucceeded
        projectFileNames={new Set(['index.html'])}
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    expect(container.querySelector('button.op-path-button')).toBeNull();
    expect(container.querySelector('code.op-path')?.textContent).toBe('/tmp/outside.log');
    expect(container.querySelector('.op-open')).toBeNull();
  });
});
