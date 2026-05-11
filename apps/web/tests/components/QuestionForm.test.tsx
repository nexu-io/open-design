// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionFormView, parseSubmittedAnswers } from '../../src/components/QuestionForm';
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

const checkboxObjectForm = {
  id: 'discovery',
  title: 'Quick brief',
  questions: [
    {
      id: 'tone',
      label: 'Visual tone',
      type: 'checkbox',
      required: true,
      options: [
        { label: 'Editorial / magazine', value: 'editorial' },
        { label: 'Soft gradients', value: 'soft-gradients' },
        { label: 'Modern minimal', value: 'modern-minimal' },
      ],
    },
  ],
} as QuestionForm;

const selectObjectForm = {
  id: 'discovery',
  title: 'Quick brief',
  questions: [
    {
      id: 'platform',
      label: 'Primary surface',
      type: 'select',
      required: true,
      options: [
        { label: 'Mobile (iOS/Android)', value: 'mobile' },
        { label: 'Desktop web', value: 'desktop-web' },
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

  it('parses submitted object-option values from readable answer text', () => {
    expect(
      parseSubmittedAnswers(
        richForm,
        [
          '[form answers - discovery]',
          '- Primary surface: Mobile (iOS/Android) [value: mobile]',
        ].join('\n'),
      ),
    ).toEqual({ platform: 'mobile' });
  });

  it('renders radio object options and submits the readable label with stable value', () => {
    const onSubmit = vi.fn();
    render(<QuestionFormView form={richForm} interactive onSubmit={onSubmit} />);

    expect(screen.getByText('Responsive')).toBeTruthy();
    expect(screen.getByText('Mobile (iOS/Android)')).toBeTruthy();
    expect(screen.getByText('Phone-first app prototype')).toBeTruthy();
    expect(screen.getByText('Desktop web')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Mobile (iOS/Android)'));
    fireEvent.click(screen.getByRole('button', { name: 'Send answers' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toContain(
      '- Primary surface: Mobile (iOS/Android) [value: mobile]',
    );
    expect(onSubmit.mock.calls[0]?.[1]).toEqual({ platform: 'mobile' });
  });

  it('submits required checkbox object options with stable values', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <QuestionFormView form={checkboxObjectForm} interactive onSubmit={onSubmit} />,
    );

    const submit = screen.getByRole('button', { name: 'Send answers' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Editorial / magazine'));
    fireEvent.click(screen.getByLabelText('Soft gradients'));

    expect(container.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(2);
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Editorial / magazine [value: editorial]');
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Soft gradients [value: soft-gradients]');
    expect(onSubmit.mock.calls[0]?.[1]).toEqual({
      tone: ['editorial', 'soft-gradients'],
    });
  });

  it('submits required select object options with stable values', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <QuestionFormView form={selectObjectForm} interactive onSubmit={onSubmit} />,
    );

    const submit = screen.getByRole('button', { name: 'Send answers' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    const select = container.querySelector('select');
    if (!select) throw new Error('expected select control');
    fireEvent.change(select, { target: { value: 'mobile' } });

    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toContain(
      '- Primary surface: Mobile (iOS/Android) [value: mobile]',
    );
    expect(onSubmit.mock.calls[0]?.[1]).toEqual({ platform: 'mobile' });
  });
});
