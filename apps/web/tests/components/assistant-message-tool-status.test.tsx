// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
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

    expect(container.querySelector('.op-status-ok')).not.toBeNull();
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

    expect(container.querySelector('.op-status-ok')).not.toBeNull();
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

    expect(container.querySelector('.action-card-toggle.running')).toBeNull();
    expect(container.querySelector('.op-status-ok, .action-card-status.op-status-ok')).not.toBeNull();
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
