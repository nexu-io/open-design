// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionsPanel } from '../../src/components/QuestionsPanel';
import type { QuestionForm } from '../../src/artifacts/question-form';

// A form with no required fields so `ready` is true immediately and Continue is
// actionable without any input — the minimal fixture that lets us drive the
// submit chokepoint.
const form: QuestionForm = {
  id: 'discovery',
  title: 'A few quick questions',
  questions: [
    { id: 'q1', label: 'What is it about?', type: 'text' },
    { id: 'q2', label: 'Who is the audience?', type: 'text' },
  ],
};

function revealAll() {
  for (let i = 0; i < form.questions.length; i++) {
    act(() => {
      vi.advanceTimersByTime(280);
    });
  }
}

function continueButton(): HTMLButtonElement {
  const btn = document.querySelector<HTMLButtonElement>('.questions-continue');
  if (!btn) throw new Error('expected a Continue button');
  return btn;
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.useRealTimers();
});

describe('QuestionsPanel submit lock', () => {
  // Repro for the "one Continue click queued 76 sends" bug: while the parent's
  // busy/answered signals lag (the form-answer send is only just being
  // dispatched), the Continue button stayed enabled, so a colleague who thought
  // it was stuck could click again and again — each click firing another send
  // that piled up in the queue. The panel must lock itself on the first submit.
  it('fires onSubmit once even when Continue is clicked repeatedly', () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    act(() => {
      render(
        <QuestionsPanel
          form={form}
          formKey="conv-1:msg-a:discovery"
          interactive
          generating={false}
          onSubmit={onSubmit}
        />,
      );
    });
    revealAll();

    const button = continueButton();
    // Three rapid clicks, as an impatient user would while it "looks stuck".
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows a disabled loading state on the Continue button after it is clicked', () => {
    vi.useFakeTimers();
    act(() => {
      render(
        <QuestionsPanel
          form={form}
          formKey="conv-1:msg-b:discovery"
          interactive
          generating={false}
          onSubmit={() => {}}
        />,
      );
    });
    revealAll();

    const button = continueButton();
    expect(button.disabled).toBe(false);

    act(() => {
      fireEvent.click(button);
    });

    // Immediately after the click the button must read as busy and be disabled,
    // so the click can't be repeated while the turn spins up.
    expect(continueButton().disabled).toBe(true);
    expect(continueButton().getAttribute('aria-busy')).toBe('true');
  });

  // Guard against the panel latching locked forever: once the turn actually
  // starts (submitDisabled flips true) the busy-disable takes over and the
  // optimistic lock is released, so a later idle form is still actionable.
  it('hands the lock off to submitDisabled once the turn is busy', () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    const props = {
      form,
      formKey: 'conv-1:msg-c:discovery',
      interactive: true,
      generating: false,
      onSubmit,
    } as const;
    const { rerender } = render(<QuestionsPanel {...props} />);
    revealAll();

    act(() => {
      fireEvent.click(continueButton());
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(continueButton().disabled).toBe(true);

    // The parent turn starts: submitDisabled becomes true. The button stays
    // disabled, now because the turn is busy rather than the optimistic lock.
    act(() => {
      rerender(<QuestionsPanel {...props} submitDisabled />);
    });
    expect(continueButton().disabled).toBe(true);
  });
});
