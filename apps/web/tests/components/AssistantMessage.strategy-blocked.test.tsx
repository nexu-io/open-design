// @vitest-environment jsdom

/**
 * Terminal-blocked strategy tasks must terminate question-form interaction.
 *
 * When the daemon's OD Next protocol gate settles a task as `blocked` (a
 * sticky terminal outcome), the clarification form rendered by that turn can
 * never be answered again — the daemon rejects any continuation with
 * 409 STRATEGY_TASK_STATE_MISMATCH. The message-level blocked verdict must
 * therefore (a) disable the inline form's submission and (b) surface the
 * gate's visible text (or a generic localized notice) instead of leaving the
 * form silently submittable.
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

describe('AssistantMessage blocked strategy task', () => {
  it('stops accepting form submissions and shows the gate visible text', () => {
    const onSubmitQuestionForm = vi.fn();
    const { container } = render(
      <AssistantMessage
        message={blockedMessage({
          strategyTaskBlocked: true,
          strategyTaskBlockedText: '澄清轮已被质量门拦下，请重新发起任务。',
        })}
        streaming={false}
        projectId="proj-1"
        conversationId="conv-1"
        isLast
        onSubmitQuestionForm={onSubmitQuestionForm}
      />,
    );

    fillAudience(container);
    const send = screen.getByRole('button', { name: 'Send answers' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(send);
    expect(onSubmitQuestionForm).not.toHaveBeenCalled();
    expect(screen.getByTestId('question-form-blocked-notice').textContent).toBe(
      '澄清轮已被质量门拦下，请重新发起任务。',
    );
  });

  it('falls back to the generic localized notice when the gate left no visible text', () => {
    const { container } = render(
      <AssistantMessage
        message={blockedMessage({
          strategyTaskBlocked: true,
          strategyTaskBlockedText: null,
        })}
        streaming={false}
        projectId="proj-1"
        conversationId="conv-1"
        isLast
        onSubmitQuestionForm={vi.fn()}
      />,
    );

    fillAudience(container);
    expect(
      (screen.getByRole('button', { name: 'Send answers' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByTestId('question-form-blocked-notice').textContent).toBe(
      'This task was stopped by the strategy quality gate, so this form can no longer be submitted. Start a new request to continue.',
    );
  });

  it('keeps an unblocked form submittable (control)', () => {
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
    expect(screen.queryByTestId('question-form-blocked-notice')).toBeNull();
    const send = screen.getByRole('button', { name: 'Send answers' }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(onSubmitQuestionForm).toHaveBeenCalledTimes(1);
  });
});
