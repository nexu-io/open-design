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

describe('Task tool rendering + sidechain hiding', () => {
  afterEach(() => cleanup());

  it('renders a Task tool_use as a TaskCard with its description', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'toolu_task_1',
            name: 'Task',
            input: {
              description: '리서치 서브에이전트',
              prompt: 'Read research-subagent.md and …',
              subagent_type: 'general-purpose',
            },
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    const card = container.querySelector('.op-task');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('리서치 서브에이전트');
    // The raw prompt JSON must NOT leak into the card head (GenericCard did).
    expect(card!.querySelector('.op-card-head')!.textContent).not.toContain('general-purpose');
  });

  it('renders an Agent tool_use (claude CLI 2.1+ renamed Task→Agent) as a TaskCard with its description', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'toolu_agent_1',
            name: 'Agent',
            input: {
              description: '리서치 서브에이전트',
              prompt: 'Read research-subagent.md and …',
              subagent_type: 'general-purpose',
            },
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    const card = container.querySelector('.op-task');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('리서치 서브에이전트');
    // The raw prompt JSON must NOT leak into the card head (GenericCard did).
    expect(card!.querySelector('.op-card-head')!.textContent).not.toContain('general-purpose');
  });

  it('hides sidechain tool_use events from the main transcript', () => {
    const { container } = render(
      <AssistantMessage
        projectKind="prototype"
        conversationId="conv-1"
        message={messageWithEvents([
          {
            kind: 'tool_use',
            id: 'toolu_task_1',
            name: 'Task',
            input: { description: '리서치 서브에이전트', prompt: 'p', subagent_type: 'general-purpose' },
          },
          {
            kind: 'tool_use',
            id: 'toolu_side_ws',
            name: 'WebSearch',
            input: { query: '실비 청구' },
            parentToolUseId: 'toolu_task_1',
          },
        ])}
        streaming={false}
        projectId="project-1"
      />,
    );

    // The sidechain WebSearch must not render its own card.
    expect(container.querySelector('.op-web')).toBeNull();
    expect(container.querySelector('.op-task')).not.toBeNull();
  });
});
