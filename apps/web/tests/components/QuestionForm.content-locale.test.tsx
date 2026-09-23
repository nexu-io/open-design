// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuestionForm } from '../../src/artifacts/question-form';
import { QuestionFormView } from '../../src/components/QuestionForm';
import { I18nProvider, type Locale } from '../../src/i18n';

// OPEND-2951 explicitly separates answer-content language from application
// controls. These are existing translations, not proposed product copy.
// The reported screenshot has no raw payload: this specification deliberately
// covers explicit, supported form.lang only, not inferred language without it.
const languageCases = [
  {
    ui: 'en', content: 'zh-CN',
    question: '这份内容主要给谁看？', option: '学生', second: '交付形式',
    own: '自己填', placeholder: '输入你自己的答案…',
    required: 'required', skip: 'Skip', next: 'Next step', back: 'Back',
    submit: 'Next', disabledTitle: 'Fill in the required fields first',
  },
  {
    ui: 'zh-CN', content: 'en',
    question: 'Who is this for?', option: 'Students', second: 'Delivery format',
    own: 'Write your own', placeholder: 'Type your own answer...',
    required: '必填', skip: '跳过', next: '下一步', back: '上一步',
    submit: '下一步', disabledTitle: '请先填写必填项',
  },
] satisfies Array<{
  ui: Locale; content: string;
  question: string; option: string; second: string;
  own: string; placeholder: string;
  required: string; skip: string; next: string; back: string;
  submit: string; disabledTitle: string;
}>;

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('dir');
});

describe('OPEND-2951 explicit question content language and UI controls', () => {
  it.each(languageCases)(
    'keeps $content answer content and $ui controls through real form navigation',
    (c) => {
      const onSubmit = vi.fn();
      const form: QuestionForm = {
        id: `content-locale-${c.ui}`,
        title: c.question,
        lang: c.content,
        questions: [
          {
            id: 'audience', label: c.question, type: 'radio', required: true,
            options: [{ label: c.option, value: 'students' }],
          },
          {
            id: 'format', label: c.second, type: 'text', required: true,
            placeholder: 'fixture-format-input',
          },
        ],
      };
      render(
        <I18nProvider initial={c.ui}>
          <QuestionFormView form={form} interactive onSubmit={onSubmit} />
        </I18nProvider>,
      );

      // Real UI provider and real answer control: no translation or component mock.
      expect(document.documentElement.lang).toBe(c.ui);
      expect(screen.getByRole('radio', { name: c.option })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: c.own }));
      const answer = screen.getByPlaceholderText(c.placeholder);
      expect(answer).toBeEnabled();

      // On main the content translator also translates required/navigation:
      // this is the intended business red, after the content guard succeeded.
      expect(screen.getByText(c.required, { exact: true })).toBeVisible();
      expect(screen.getByRole('button', { name: c.skip })).toBeEnabled();
      const next = screen.getByRole('button', { name: c.next });
      expect(next).toBeDisabled();
      expect(next).toHaveAttribute('title', c.disabledTitle);
      fireEvent.change(answer, { target: { value: 'Teachers / 教师' } });
      expect(next).toBeEnabled();
      fireEvent.click(next);

      expect(screen.getByPlaceholderText('fixture-format-input')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: c.submit })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: c.back }));
      expect(screen.getByPlaceholderText(c.placeholder)).toHaveValue('Teachers / 教师');
      fireEvent.click(screen.getByRole('button', { name: c.next }));
      fireEvent.change(screen.getByPlaceholderText('fixture-format-input'), {
        target: { value: 'Slides / 幻灯片' },
      });
      fireEvent.click(screen.getByRole('button', { name: c.submit }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith(
        expect.stringContaining(`- ${c.question}: Teachers / 教师`),
        { audience: 'Teachers / 教师', format: 'Slides / 幻灯片' },
        'submit',
      );
    },
  );

  it.each(languageCases)(
    'preserves model-provided custom answer copy and submission in $ui UI',
    (c) => {
      const onSubmit = vi.fn();
      // Synthetic model-provided content must be preserved literally; it is
      // not a request to introduce these strings into the application's i18n.
      const customLabel = 'MODEL_LABEL / 原样标签';
      const customPlaceholder = 'MODEL_PLACEHOLDER / 原样提示';
      const form: QuestionForm = {
        id: `custom-content-${c.ui}`,
        title: c.question,
        lang: c.content,
        submitLabel: 'MODEL_SUBMIT',
        questions: [{
          id: 'audience', label: c.question, type: 'radio', required: true,
          options: [{ label: c.option, value: 'students' }],
          customLabel, customPlaceholder,
        }],
      };
      render(
        <I18nProvider initial={c.ui}>
          <QuestionFormView form={form} interactive onSubmit={onSubmit} />
        </I18nProvider>,
      );
      expect(screen.queryByRole('button', { name: c.own })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: customLabel }));
      expect(screen.queryByPlaceholderText(c.placeholder)).toBeNull();
      fireEvent.change(screen.getByPlaceholderText(customPlaceholder), {
        target: { value: 'Literal answer / 原样回答' },
      });
      const submit = screen.getByRole('button', { name: 'MODEL_SUBMIT' });
      expect(submit).toBeEnabled();
      fireEvent.click(submit);
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith(
        expect.stringContaining(`- ${c.question}: Literal answer / 原样回答`),
        { audience: 'Literal answer / 原样回答' },
        'submit',
      );
    },
  );
});
