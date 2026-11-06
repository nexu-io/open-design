// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { I18nProvider } from '../../../src/i18n';
import type { ChatMessage } from '../../../src/types';

const KEY = 'a7f3c91ed2b40561';
const BEFORE = 'Ordinary prose before both questions.';
const AFTER = 'Ordinary prose after both questions.';
const SECOND_LABEL = 'Second audience question';

type FormTag = 'question-form' | 'ask-question';

function form(id: string, label: string, tag: FormTag = 'question-form'): string {
  return `<${tag} id="${id}">${JSON.stringify({
    submitLabel: id === 'second' ? 'Send second answers' : 'Send first answers',
    questions: [{ id: 'answer', type: 'text', label }],
  })}</${tag}>`;
}

function renderHistory(text: string) {
  const onSubmit = vi.fn(async (_text: string) => true);
  const content = `Working.\n<od-done key="${KEY}"/>${text}`;
  const message: ChatMessage = {
    id: 'assistant-sibling-form-ownership', role: 'assistant', content,
    createdAt: 1000, startedAt: 1000, endedAt: 2000,
    runId: 'sibling-form-ownership-run', runStatus: 'succeeded',
    events: [{ kind: 'done_key', key: KEY }, { kind: 'text', text: content }],
  };
  const view = render(
    <I18nProvider initial="en">
      <AssistantMessage message={message} streaming={false} isLast
        projectId="project-1" conversationId="conversation-1"
        onSubmitQuestionForm={onSubmit} />
    </I18nProvider>,
  );
  return { ...view, onSubmit };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('a valid question payload cannot claim its sibling form', () => {
  it.each([
    { tag: 'question-form' as const, literal: '<od-card>' },
    { tag: 'question-form' as const, literal: "<od-card type='rule-proposal'>" },
    // The existing alias accepts the same canonical JSON body. Both physical
    // forms are complete; the tag-like text belongs only to the first label.
    { tag: 'ask-question' as const, literal: '<od-card>' },
  ])('retains an actionable second $tag after a label containing $literal', async ({ tag, literal }) => {
    const firstLabel = `Do you want an ${literal} block?`;
    const { container, onSubmit } = renderHistory(
      `${BEFORE}\n\n${form('first', firstLabel, tag)}\n\n${form('second', SECOND_LABEL, tag)}\n\n${AFTER}`,
    );
    // Establish that the first real form was consumed normally before checking
    // its sibling; this red must not come from rendering/setup failure.
    await waitFor(() => expect(within(container).getByText(firstLabel)).toBeTruthy());
    expect(within(container).getAllByRole('textbox')).toHaveLength(2);
    expect(within(container).getByText(SECOND_LABEL)).toBeTruthy();
    expect(container.textContent).toContain(BEFORE);
    expect(container.textContent).toContain(AFTER);
    for (const raw of ['"questions"', '"submitLabel"', '"type":"text"', '<question-form', '<ask-question']) {
      expect(container.textContent).not.toContain(raw);
    }
    const second = container.querySelector<HTMLElement>('[data-form-id="second"]');
    expect(second).not.toBeNull();
    if (!second) throw new Error('The second real form must remain independently actionable');
    const input = within(second).getByRole('textbox');
    expect(input.hasAttribute('disabled')).toBe(false);
    fireEvent.change(input, { target: { value: 'Product designers' } });
    fireEvent.click(within(second).getByRole('button', { name: 'Send second answers' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toContain(SECOND_LABEL);
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Product designers');
  });

  it('still consumes a real outer hidden card and keeps a following form usable', async () => {
    // Keep this baseline guard independent of the already-covered nested-form
    // repair: it must pass on both 3e8af708 and the parser candidate.
    const hidden = `<od-card type="rule-proposal">${JSON.stringify({
      kind: 'rule-proposal', name: 'HIDDEN OUTER RULE',
      assertion: 'HIDDEN OUTER ASSERTION', check: 'HIDDEN OUTER CHECK',
    })}</od-card>`;
    const { container, onSubmit } = renderHistory(
      `${BEFORE}\n\n${hidden}\n\n${form('second', SECOND_LABEL)}\n\n${AFTER}`,
    );
    const input = await waitFor(() => within(container).getByRole('textbox'));
    expect(container.textContent).toContain(BEFORE);
    expect(container.textContent).toContain(AFTER);
    for (const raw of ['HIDDEN OUTER', '<od-card', '"assertion"', '"questions"']) {
      expect(container.textContent).not.toContain(raw);
    }
    expect(within(container).queryByRole('button', { name: 'Keep' })).toBeNull();
    fireEvent.change(input, { target: { value: 'Existing audience' } });
    fireEvent.click(within(container).getByRole('button', { name: 'Send second answers' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Existing audience');
  });
});
