// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToolCard } from '../../src/components/ToolCard';
import type { AgentEvent } from '../../src/types';

const askUse = {
  kind: 'tool_use',
  id: 'tool-1',
  name: 'AskUserQuestion',
  input: {
    questions: [
      {
        header: 'Next move',
        question: 'Where next?',
        options: [
          { label: 'macOS Settings window', description: 'Desktop variant' },
          { label: 'Leave as-is', description: 'Stop here' },
        ],
      },
    ],
  },
} as Extract<AgentEvent, { kind: 'tool_use' }>;

function result(content: string, isError = false): Extract<AgentEvent, { kind: 'tool_result' }> {
  return {
    kind: 'tool_result',
    toolUseId: 'tool-1',
    content,
    isError,
  } as Extract<AgentEvent, { kind: 'tool_result' }>;
}

describe('AskUserQuestion card status', () => {
  afterEach(() => cleanup());

  it('shows a live waiting state only while the original run can still receive a tool result', () => {
    render(
      <ToolCard
        use={askUse}
        runStreaming
        runSucceeded={false}
        isLast
        onAnswerToolUse={vi.fn()}
      />,
    );

    expect(screen.getByText('Waiting for answer')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Submit/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('marks a terminal unanswered question as no answer received instead of awaiting', () => {
    render(
      <ToolCard
        use={askUse}
        runStreaming={false}
        runSucceeded
        isLast
        onSubmitForm={vi.fn()}
      />,
    );

    expect(screen.getByText('No answer received')).toBeTruthy();
    expect(screen.queryByText('Waiting for answer')).toBeNull();
    expect(screen.queryByRole('button', { name: /Submit/i })).toBeNull();
    expect((screen.getByRole('button', { name: /macOS Settings window/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('marks the question as received after the live tool-result route accepts it', async () => {
    const onAnswerToolUse = vi.fn().mockResolvedValue(true);
    render(
      <ToolCard
        use={askUse}
        runStreaming
        runSucceeded={false}
        isLast
        onAnswerToolUse={onAnswerToolUse}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /macOS Settings window/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

    await waitFor(() => expect(screen.getByText('Answer received')).toBeTruthy());
    expect(onAnswerToolUse).toHaveBeenCalledWith(
      'tool-1',
      'Where next?\nmacOS Settings window',
    );
  });

  it('marks a rejected live tool-result submission as no answer received', async () => {
    const onAnswerToolUse = vi.fn().mockResolvedValue(false);
    render(
      <ToolCard
        use={askUse}
        runStreaming
        runSucceeded={false}
        isLast
        onAnswerToolUse={onAnswerToolUse}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /macOS Settings window/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

    await waitFor(() => expect(screen.getByText('No answer received')).toBeTruthy());
    expect(screen.queryByText('Waiting for answer')).toBeNull();
  });

  it('distinguishes a legacy fallback message from a received tool result', () => {
    const onSubmitForm = vi.fn();
    render(
      <ToolCard
        use={askUse}
        runStreaming
        runSucceeded={false}
        isLast
        onSubmitForm={onSubmitForm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Leave as-is/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

    expect(screen.getByText('Sent as follow-up')).toBeTruthy();
    expect(screen.queryByText('Answer received')).toBeNull();
    expect(onSubmitForm).toHaveBeenCalledWith('Where next?\nLeave as-is');
  });

  it('restores an answered state from a persisted non-error tool result', () => {
    render(
      <ToolCard
        use={askUse}
        result={result('Where next?\nLeave as-is')}
        runStreaming={false}
        runSucceeded
        isLast
      />,
    );

    expect(screen.getByText('Answer received')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Leave as-is/i }).getAttribute('aria-pressed')).toBe('true');
  });
});
