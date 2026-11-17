// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';

function reply(withTodos: boolean, withFile: boolean): ChatMessage {
  return {
    id: 'partial-delivery', role: 'assistant',
    content: withFile ? 'Created index.html. Animation and mobile layout remain.' : 'Hello!',
    runStatus: 'succeeded', startedAt: 1000, endedAt: 2000,
    strategyTaskDelivered: withFile,
    events: withTodos ? [{
      kind: 'tool_use', id: 'todo-1', name: 'TodoWrite',
      input: { todos: [
        { content: 'Write the page', status: 'completed' },
        { content: 'Add animation', status: 'pending' },
        { content: 'Adapt for mobile', status: 'pending' },
      ] },
    }] : [],
  };
}

describe('partial file delivery does not finish declared work', () => {
  afterEach(cleanup);

  // P0-24 Q6: the turn end no longer offers a continue button; nothing auto-continues.
  it('no longer offers a continue button at the turn end and never continues on its own (P0-24)', () => {
    const onContinue = vi.fn();
    render(<AssistantMessage message={reply(true, true)} streaming={false}
      projectId="project-1" conversationId="conv-1" isLast
      onContinueRemainingTasks={onContinue} />);
    expect(screen.queryByTestId('assistant-continue-remaining')).toBeNull();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it.each([false, true])('does not invent remaining work when no todo exists (file: %s)', (withFile) => {
    const onContinue = vi.fn();
    render(<AssistantMessage message={reply(false, withFile)} streaming={false}
      projectId="project-1" conversationId="conv-1" isLast
      onContinueRemainingTasks={onContinue} />);
    expect(screen.queryByTestId('assistant-continue-remaining')).toBeNull();
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.queryByText('Stopped with unfinished work')).toBeNull();
  });
});
