// @vitest-environment jsdom

/**
 * A blocked strategy task leaves its question form answerable.
 *
 * A task blocks only when its Run failed before the round settled. A form
 * the turn had already rendered is still a question the user can answer: the
 * answer is the next user message and opens a new task, so the form must not
 * be disabled and no notice about the task appears under it — the failure is
 * told once, by the failure card.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

const FORM = [
  '<question-form id="clarify" title="Quick brief">',
  JSON.stringify({
    questions: [{ id: 'audience', label: 'Audience', type: 'text' }],
  }),
  '</question-form>',
].join('\n');

function blockedMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: FORM,
    runStatus: 'failed',
    startedAt: 1700000000,
    endedAt: 1700000005,
    events: [{ kind: 'text', text: FORM }],
    strategyTaskExecutionId: 'task-1',
    ...overrides,
  } as ChatMessage;
}

function fillAudience(container: HTMLElement): void {
  const input = container.querySelector('.qf-input');
  if (!(input instanceof HTMLInputElement)) throw new Error('expected audience input');
  fireEvent.change(input, { target: { value: 'Designers' } });
}

// This branch's stepped form labels the final step's confirm button
// `qf.submitDefault` ("Next").
const QUESTION_FORM_SUBMIT_LABEL = 'Next';

describe('AssistantMessage blocked strategy task', () => {
  it.each([
    { name: 'with the verdict text', strategyTaskBlockedText: '这一轮在写完首页前停了。' },
    { name: 'without any verdict text', strategyTaskBlockedText: null },
  ])('keeps the form submittable and draws no notice $name', ({ strategyTaskBlockedText }) => {
    const onSubmitQuestionForm = vi.fn();
    const { container } = render(
      <AssistantMessage
        message={blockedMessage({ strategyTaskBlocked: true, strategyTaskBlockedText })}
        streaming={false}
        projectId="proj-1"
        conversationId="conv-1"
        isLast
        onSubmitQuestionForm={onSubmitQuestionForm}
      />,
    );

    fillAudience(container);
    expect(screen.queryByTestId('question-form-blocked-notice')).toBeNull();
    expect(container.textContent).not.toContain('quality gate');
    const send = screen.getByRole('button', { name: QUESTION_FORM_SUBMIT_LABEL }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(onSubmitQuestionForm).toHaveBeenCalledTimes(1);
  });

  it('keeps a form on a succeeded turn submittable (control)', () => {
    const onSubmitQuestionForm = vi.fn();
    const { container } = render(
      <AssistantMessage
        message={blockedMessage({ runStatus: 'succeeded' })}
        streaming={false}
        projectId="proj-1"
        conversationId="conv-1"
        isLast
        onSubmitQuestionForm={onSubmitQuestionForm}
      />,
    );

    fillAudience(container);
    const send = screen.getByRole('button', { name: QUESTION_FORM_SUBMIT_LABEL }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(onSubmitQuestionForm).toHaveBeenCalledTimes(1);
  });
});
