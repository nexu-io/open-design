// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToolCard } from '../../src/components/ToolCard';
import type { AgentEvent } from '../../src/types';

vi.mock('../../src/i18n', () => ({
  useT: () => (key: string) => key,
}));

afterEach(() => {
  cleanup();
});

describe('ToolCard AskUserQuestion', () => {
  it('submits a custom free-text answer through the live tool-result route', async () => {
    const onAnswerToolUse = vi.fn(async () => true);
    const use: Extract<AgentEvent, { kind: 'tool_use' }> = {
      kind: 'tool_use',
      id: 'ask-1',
      name: 'AskUserQuestion',
      input: {
        questions: [
          {
            question: 'What should we build?',
            options: [
              { label: 'Website' },
              { label: 'Deck' },
            ],
          },
        ],
      },
    };

    render(
      <ToolCard
        use={use}
        runStreaming
        isLast
        onAnswerToolUse={onAnswerToolUse}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('tool.askQuestionCustomPlaceholder'), {
      target: { value: 'A Chinese poster in Xiaohongshu cover size' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'tool.askQuestionSubmit' }));

    await waitFor(() => {
      expect(onAnswerToolUse).toHaveBeenCalledTimes(1);
    });
    expect(onAnswerToolUse).toHaveBeenCalledWith(
      'ask-1',
      'What should we build?\nA Chinese poster in Xiaohongshu cover size',
    );
  });
});
