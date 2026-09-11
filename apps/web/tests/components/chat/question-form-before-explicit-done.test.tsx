// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { I18nProvider } from '../../../src/i18n';
import type { ChatMessage } from '../../../src/types';

const KEY = 'a7f3c91ed2b40561';
const BEFORE = 'I need to confirm the audience.';
const AFTER = 'I will use your answer for the next step.';
const LABEL = 'Who is the audience?';
const FORM = `<question-form id="audience-brief">${JSON.stringify({
  submitLabel: 'Send audience answer',
  questions: [{ id: 'audience', type: 'text', label: LABEL }],
})}</question-form>`;
const BEFORE_DONE = `${BEFORE}\n\n${FORM}`;
const DONE_AND_AFTER = `\n<od-done key="${KEY}"/>${AFTER}`;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

// D43: a real question-form is itself an implicit done. A later authenticated
// marker must not move the earlier form back into the execution record when
// adjacent text deltas become one persisted text event.
describe('a real question before the explicit done remains an actionable form', () => {
  it.each(['one text event', 'separate text events'] as const)('%s', async (shape) => {
    const chunks = shape === 'one text event'
      ? [BEFORE_DONE + DONE_AND_AFTER] : [BEFORE_DONE, DONE_AND_AFTER];
    const message: ChatMessage = {
      id: 'assistant-question-before-done', role: 'assistant',
      content: chunks.join(''), createdAt: 1000, startedAt: 1000, endedAt: 2000,
      runId: 'question-before-done-run', runStatus: 'succeeded',
      events: [{ kind: 'done_key', key: KEY }, ...chunks.map((text) => ({ kind: 'text' as const, text }))],
    };
    const onSubmit = vi.fn(async (_text: string) => true);
    const { container } = render(
      <I18nProvider initial="en">
        <AssistantMessage message={message} streaming={false} isLast
          projectId="project-1" conversationId="conversation-1"
          onSubmitQuestionForm={onSubmit} />
      </I18nProvider>,
    );
    // Open the existing execution disclosure too: a raw form hidden inside
    // that shell must not pass merely because only the conclusion is visible.
    const execution = within(container).queryByTestId('assistant-flow');
    for (const details of execution?.querySelectorAll<HTMLDetailsElement>('details') ?? []) {
      details.open = true;
      fireEvent(details, new Event('toggle', { bubbles: false }));
    }
    await waitFor(() => expect(container.textContent).toContain(BEFORE));
    expect(container.textContent).toContain(AFTER);
    const input = within(container).getByRole('textbox');
    expect(within(container).getByText(LABEL)).toBeTruthy();
    for (const raw of ['<question-form', '"questions"', '"submitLabel"', '<od-done']) {
      expect(container.textContent).not.toContain(raw);
    }
    fireEvent.change(input, { target: { value: 'Product designers' } });
    fireEvent.click(within(container).getByRole('button', { name: 'Send audience answer' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toContain(LABEL);
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Product designers');
  });
});
