// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionFormView } from '../../src/components/QuestionForm';
import type { QuestionForm } from '../../src/artifacts/question-form';

const form: QuestionForm = {
  id: 'discovery',
  title: 'Quick brief',
  questions: [
    {
      id: 'tone',
      label: 'Visual tone (pick up to two)',
      type: 'checkbox',
      options: [
        { label: 'Editorial / magazine', value: 'Editorial / magazine' },
        { label: 'Modern minimal', value: 'Modern minimal' },
        { label: 'Soft gradients', value: 'Soft gradients' },
      ],
      maxSelections: 2,
      required: true,
    },
  ],
};

const richForm = {
  id: 'discovery',
  title: 'Quick brief',
  questions: [
    {
      id: 'platform',
      label: 'Primary surface',
      type: 'radio',
      required: true,
      options: [
        { label: 'Responsive', value: 'Responsive' },
        {
          label: 'Mobile (iOS/Android)',
          description: 'Phone-first app prototype',
          value: 'mobile',
        },
        {
          label: 'Desktop web',
          description: 'Browser-first prototype',
          value: 'Desktop web',
        },
      ],
    },
  ],
} as QuestionForm;

describe('QuestionFormView', () => {
  afterEach(() => cleanup());

  it('updates locked answers when submitted history arrives after the initial render', () => {
    const onSubmit = vi.fn();
    const { container, rerender } = render(
      <QuestionFormView form={form} interactive submittedAnswers={undefined} onSubmit={onSubmit} />,
    );

    expect(container.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(0);

    rerender(
      <QuestionFormView
        form={form}
        interactive={false}
        submittedAnswers={{ tone: ['Editorial / magazine', 'Modern minimal'] }}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('answered')).toBeTruthy();
    expect(container.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(2);
  });

  it('renders object options and submits the readable label', () => {
    const onSubmit = vi.fn();
    render(<QuestionFormView form={richForm} interactive onSubmit={onSubmit} />);

    expect(screen.getByText('Responsive')).toBeTruthy();
    expect(screen.getByText('Mobile (iOS/Android)')).toBeTruthy();
    expect(screen.getByText('Phone-first app prototype')).toBeTruthy();
    expect(screen.getByText('Desktop web')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Desktop web'));
    fireEvent.click(screen.getByRole('button', { name: 'Send answers' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Desktop web');
    expect(onSubmit.mock.calls[0]?.[0]).not.toContain('mobile');
  });
});
