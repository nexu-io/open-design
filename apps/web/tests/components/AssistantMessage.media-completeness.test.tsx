// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';

afterEach(cleanup);

describe('chat uses the host completion verdict even when the strategy delivered', () => {
  it.each([true, false])('renders host unfinished=%s', (unfinished) => {
    const message: ChatMessage = {
      id: 'media-turn', role: 'assistant', content: 'Landing page and deck are ready.',
      runStatus: 'succeeded', strategyTaskDelivered: true,
      endedWithUnfinishedWork: unfinished,
      startedAt: 1000, endedAt: 2000,
    };
    render(<AssistantMessage message={message} streaming={false} isLast />);
    expect(screen.getByTestId('assistant-footer').getAttribute('data-unfinished')).toBe(String(unfinished));
  });
  it('does not offer to continue stale todos after the host proves completion', () => {
    const onContinueRemaining = () => {};
    render(<AssistantMessage message={{
      id: 'recovered', role: 'assistant', content: 'Ready', runStatus: 'succeeded',
      endedWithUnfinishedWork: false, startedAt: 1, endedAt: 2,
      events: [{ kind: 'tool_use', id: 'todo', name: 'TodoWrite',
        input: { todos: [{ content: 'Generate image', status: 'pending' }] } }],
    }} streaming={false} isLast onContinueRemainingTasks={onContinueRemaining} />);
    expect(screen.getByTestId('assistant-footer').getAttribute('data-unfinished')).toBe('false');
    expect(document.querySelector('.assistant-continue-remaining')).toBeNull();
  });

});
