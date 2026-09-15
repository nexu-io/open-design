// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { splitOnQuestionForms } from '../../src/artifacts/question-form';
import { QuestionFormView } from '../../src/components/QuestionForm';
import { I18nProvider } from '../../src/i18n';

// Geometry is deliberately NOT mocked here. OPEND-2876's necessary red/green
// witness is real Chrome with native wheel + clipping/hit testing. These cases
// protect selection and disclosure semantics while that layout repair changes.
function parsedForm(defaultValue?: string) {
  const segments = splitOnQuestionForms(`<question-form id="more-options" title="Delivery format">${JSON.stringify({
    lang: 'en',
    questions: [{
      id: 'format', type: 'select', label: 'Choose format', required: true,
      allowCustom: false,
      ...(defaultValue ? { default: defaultValue } : {}),
      options: [
        { label: 'Web', value: 'web', group: 'Common' },
        { label: 'Slides', value: 'slides', group: 'Documents' },
        { label: 'PDF', value: 'pdf', group: 'Documents' },
        { label: 'Video', value: 'video', group: 'Media' },
      ],
    }],
  })}</question-form>`);
  const parsed = segments.find((segment) => segment.kind === 'form');
  if (!parsed || parsed.kind !== 'form') throw new Error('Canonical fixture must parse');
  return parsed.form;
}

afterEach(cleanup);

describe('OPEND-2876 inline More options selection guards', () => {
  it('keeps independent groups and the exact selected value through expand and collapse', () => {
    const onSubmit = vi.fn();
    render(<I18nProvider initial="en"><div className="chat-log">
      <QuestionFormView form={parsedForm()} interactive onSubmit={onSubmit} />
    </div></I18nProvider>);
    const toggles = screen.getAllByRole('button', { name: 'More options' });
    expect(toggles).toHaveLength(2);
    fireEvent.click(toggles[0]!);
    const pdf = screen.getByRole('option', { name: 'PDF' });
    fireEvent.click(pdf);
    expect(pdf).toHaveAttribute('data-value', 'pdf');
    expect(pdf).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(toggles[1]!);
    expect(screen.getByRole('option', { name: 'Video' })).toBeVisible();
    expect(pdf).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(toggles[0]!);
    expect(screen.queryByRole('option', { name: 'PDF' })).toBeNull();
    expect(toggles[1]).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggles[0]!);
    expect(screen.getByRole('option', { name: 'PDF' })).toHaveAttribute('aria-selected', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(expect.any(String), { format: 'pdf' }, 'submit');
  });

  it('preserves the initially selected group without requiring a new expansion', () => {
    const onSubmit = vi.fn();
    render(<I18nProvider initial="en">
      <QuestionFormView form={parsedForm('video')} interactive onSubmit={onSubmit} />
    </I18nProvider>);
    const toggles = screen.getAllByRole('button', { name: 'More options' });
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'false');
    expect(toggles[1]).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: 'Video' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(toggles[1]!);
    fireEvent.click(toggles[1]!);
    expect(screen.getByRole('option', { name: 'Video' })).toHaveAttribute('aria-selected', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps an expanded previous-turn group readable but unanswerable', () => {
    const onSubmit = vi.fn();
    render(<I18nProvider initial="en"><div className="chat-log">
      <QuestionFormView form={parsedForm()} interactive={false} onSubmit={onSubmit} />
    </div></I18nProvider>);
    fireEvent.click(screen.getAllByRole('button', { name: 'More options' })[0]!);
    const group = screen.getByRole('group', { name: 'Documents' });
    const pdf = within(group).getByRole('option', { name: 'PDF' });
    expect(pdf).toBeDisabled();
    fireEvent.click(pdf);
    expect(pdf).toHaveAttribute('aria-selected', 'false');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
