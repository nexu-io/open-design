// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuestionForm } from '../../src/artifacts/question-form';
import { QuestionFormView } from '../../src/components/QuestionForm';
import { I18nProvider, type Locale } from '../../src/i18n';

const cases = [
  {
    ui: 'en', content: 'zh-CN',
    question: '选择交付形式', head: '常用形式', rest: '其他形式',
    option: '幻灯片', last: '文档', own: '自己填',
    more: 'More options', autoHint: 'Auto-continues when the timer ends',
    locked: 'This form is from a previous turn.',
  },
  {
    ui: 'zh-CN', content: 'en',
    question: 'Choose a delivery format', head: 'Common formats', rest: 'Other formats',
    option: 'Slides', last: 'Document', own: 'Write your own',
    more: '更多选项', autoHint: '倒计时结束后将自动继续',
    locked: '该表单来自此前的对话。',
  },
] satisfies Array<{
  ui: Locale; content: string; question: string; head: string; rest: string;
  option: string; last: string; own: string; more: string; autoHint: string;
  locked: string;
}>;

function basicForm(c: (typeof cases)[number]): QuestionForm {
  return {
    id: `host-locale-${c.ui}`,
    title: c.question,
    lang: c.content,
    questions: [{
      id: 'format', label: c.question, type: 'radio',
      options: [{ label: c.option, value: 'slides' }],
    }],
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('dir');
});

// These are the three additional host controls reached by the production
// FormBlock -> QuestionFormView call. submittedAnswers-only compatibility
// branches have no current production caller and are not fabricated here.
describe('OPEND-2951 reachable host controls keep the application locale', () => {
  it.each(cases)(
    'uses $ui for More options while preserving $content model groups and choices',
    (c) => {
      const onSubmit = vi.fn();
      const form: QuestionForm = {
        ...basicForm(c),
        questions: [{
          id: 'format', label: c.question, type: 'select',
          options: [
            { label: c.option, value: 'slides', group: c.head },
            { label: c.last, value: 'document', group: c.rest },
          ],
        }],
      };
      render(
        <I18nProvider initial={c.ui}>
          <QuestionFormView form={form} interactive onSubmit={onSubmit} />
        </I18nProvider>,
      );
      expect(screen.getByText(c.head)).toBeVisible();
      expect(screen.getByRole('option', { name: c.option })).toBeVisible();
      expect(screen.getByRole('button', { name: c.own })).toBeEnabled();
      const more = screen.getByRole('button', { name: c.more });
      expect(more).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(more);
      expect(screen.getByText(c.rest)).toBeVisible();
      const last = screen.getByRole('option', { name: c.last });
      fireEvent.click(last);
      expect(last).toHaveAttribute('aria-selected', 'true');
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it.each(cases)(
    'uses $ui for the active countdown tooltip and accessible hint',
    (c) => {
      vi.useFakeTimers();
      const onSubmit = vi.fn();
      render(
        <I18nProvider initial={c.ui}>
          <QuestionFormView
            form={basicForm(c)}
            interactive
            autoContinueAfterTimeout
            onSubmit={onSubmit}
          />
        </I18nProvider>,
      );
      expect(screen.getByRole('button', { name: c.own })).toBeEnabled();
      const countdown = screen.getByTitle(c.autoHint, { exact: true });
      expect(countdown).toHaveTextContent('10:00');
      expect(countdown).toHaveAttribute('dateTime', 'PT600S');
      expect(countdown).toHaveAttribute('title', c.autoHint);
      expect(countdown).toHaveAttribute('aria-label', `${c.autoHint} 10:00`);
      act(() => vi.advanceTimersByTime(1000));
      expect(countdown).toHaveTextContent('9:59');
      expect(countdown).toHaveAttribute('aria-label', `${c.autoHint} 9:59`);
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it.each(cases)(
    'uses $ui for an unanswered previous form without claiming it was answered',
    (c) => {
      const onSubmit = vi.fn();
      render(
        <I18nProvider initial={c.ui}>
          <QuestionFormView form={basicForm(c)} interactive={false} onSubmit={onSubmit} />
        </I18nProvider>,
      );
      const option = screen.getByRole('radio', { name: c.option });
      expect(option).toBeDisabled();
      expect(option).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByRole('button', { name: c.own })).toBeDisabled();
      // Neither locale may claim this unanswered form was answered/confirmed.
      for (const claim of ['answered', '已回答', 'Confirmed', '已确认']) {
        expect(screen.queryByText(claim, { exact: true })).not.toBeInTheDocument();
      }
      expect(screen.getByText(c.locked, { exact: true })).toBeVisible();
      fireEvent.click(option);
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );
});
