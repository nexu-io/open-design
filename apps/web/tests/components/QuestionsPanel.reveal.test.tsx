// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionsPanel } from '../../src/components/QuestionsPanel';
import type { QuestionForm } from '../../src/artifacts/question-form';

const form: QuestionForm = {
  id: 'discovery',
  title: 'A few quick questions',
  questions: [
    { id: 'q1', label: 'What is it about?', type: 'text' },
    { id: 'q2', label: 'Who is the audience?', type: 'text' },
    { id: 'q3', label: 'How long?', type: 'text' },
    { id: 'q4', label: 'What style?', type: 'text' },
  ],
};

function fieldCount() {
  return document.querySelectorAll('.qf-field').length;
}

function textInputAt(index: number): HTMLInputElement {
  const input = document.querySelectorAll<HTMLInputElement>('.qf-input')[index];
  if (!input) throw new Error(`expected text input at index ${index}`);
  return input;
}

// Each reveal schedules the next only after its effect re-runs, so the clock
// must be stepped one interval per question rather than all at once.
function revealAll() {
  for (let i = 0; i < form.questions.length; i++) {
    act(() => {
      vi.advanceTimersByTime(280);
    });
  }
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.useRealTimers();
});

describe('QuestionsPanel staggered reveal', () => {
  it('reveals questions one-by-one even when the complete form arrives at once', () => {
    vi.useFakeTimers();
    act(() => {
      render(
        <QuestionsPanel
          form={form}
          interactive
          generating={false}
          onSubmit={() => {}}
        />,
      );
    });

    // Frame first: the title is present but no questions yet.
    expect(document.querySelector('.question-form-title')?.textContent).toBe(
      'A few quick questions',
    );
    expect(fieldCount()).toBe(0);

    // Each interval surfaces exactly one more question.
    act(() => {
      vi.advanceTimersByTime(280);
    });
    expect(fieldCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(280);
    });
    expect(fieldCount()).toBe(2);

    // One interval at a time — each reveal schedules the next after its effect
    // re-runs, so we step the clock once per question.
    act(() => {
      vi.advanceTimersByTime(280);
    });
    expect(fieldCount()).toBe(3);

    act(() => {
      vi.advanceTimersByTime(280);
    });
    expect(fieldCount()).toBe(4);

    // Stays capped at the total — no overshoot.
    act(() => {
      vi.advanceTimersByTime(280 * 3);
    });
    expect(fieldCount()).toBe(4);
  });

  it('does not replay the reveal when the same occurrence remounts', () => {
    vi.useFakeTimers();
    const props = {
      form,
      formKey: 'remount-test:discovery',
      interactive: true,
      generating: false,
      onSubmit: () => {},
    } as const;

    const { unmount } = render(<QuestionsPanel {...props} />);
    revealAll();
    expect(fieldCount()).toBe(4);

    // The streaming→persisted swap unmounts the panel and re-focuses the tab,
    // remounting it. The same occurrence must come back fully revealed.
    unmount();
    act(() => {
      render(<QuestionsPanel {...props} />);
    });
    expect(fieldCount()).toBe(4);
  });

  it('still animates a different occurrence after one has completed', () => {
    vi.useFakeTimers();
    const base = {
      form,
      interactive: true,
      generating: false,
      onSubmit: () => {},
    } as const;

    const first = render(<QuestionsPanel {...base} formKey="distinct-a:discovery" />);
    revealAll();
    expect(fieldCount()).toBe(4);
    first.unmount();

    // A brand-new form in another conversation has its own key, so the reveal
    // plays again from the frame.
    act(() => {
      render(<QuestionsPanel {...base} formKey="distinct-b:discovery" />);
    });
    expect(fieldCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(280);
    });
    expect(fieldCount()).toBe(1);
  });

  it('animates a second same-template form in the same conversation', () => {
    vi.useFakeTimers();
    const base = {
      form,
      interactive: true,
      generating: false,
      onSubmit: () => {},
    } as const;

    // First discovery form: conversation `conv-1`, assistant message `msg-a`.
    // Both forms share the `discovery` template id, so the key must fold in the
    // hosting message id to stay distinct across occurrences.
    const first = render(<QuestionsPanel {...base} formKey="conv-1:msg-a:discovery" />);
    revealAll();
    expect(fieldCount()).toBe(4);
    first.unmount();

    // A second discovery form later in the SAME conversation lives in a new
    // assistant message (`msg-b`), so it gets a distinct key and must animate
    // again from the frame rather than mounting fully-revealed.
    act(() => {
      render(<QuestionsPanel {...base} formKey="conv-1:msg-b:discovery" />);
    });
    expect(fieldCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(280);
    });
    expect(fieldCount()).toBe(1);
  });

  it('shows an already-answered form in full immediately (no re-animation)', () => {
    vi.useFakeTimers();
    act(() => {
      render(
        <QuestionsPanel
          form={form}
          interactive={false}
          generating={false}
          submittedAnswers={{ q1: 'x', q2: 'y', q3: 'z', q4: 'w' }}
          onSubmit={() => {}}
        />,
      );
    });
    expect(fieldCount()).toBe(4);
  });

  it('restores in-progress answers when the same form occurrence remounts', () => {
    vi.useFakeTimers();
    const props = {
      form,
      formKey: 'conv-1:assistant-1',
      interactive: true,
      generating: false,
      onSubmit: vi.fn(),
    } as const;

    const first = render(<QuestionsPanel {...props} />);
    revealAll();
    fireEvent.change(textInputAt(0), {
      target: { value: 'open design' },
    });
    first.unmount();

    render(<QuestionsPanel {...props} />);

    expect(textInputAt(0).value).toBe('open design');
  });

  it('clears restored draft answers after submitting the form', () => {
    vi.useFakeTimers();
    const onSubmit = vi.fn();
    const props = {
      form,
      formKey: 'conv-1:assistant-2',
      interactive: true,
      generating: false,
      onSubmit,
    } as const;

    const first = render(<QuestionsPanel {...props} />);
    revealAll();
    fireEvent.change(textInputAt(0), {
      target: { value: 'open design' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<QuestionsPanel {...props} />);

    expect(textInputAt(0).value).toBe('');
  });
});
