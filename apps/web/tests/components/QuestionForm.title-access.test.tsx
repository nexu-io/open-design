// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionFormView } from '../../src/components/QuestionForm';
import { splitOnQuestionForms } from '../../src/artifacts/question-form';
import { I18nProvider } from '../../src/i18n';

// CSS contract for the real 299px ProjectView header captured by root:
// selection metadata stays on one line; the title takes the flexible space.
// jsdom has no geometry, so browser before/after height remains a separate gate.
const headerCss = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../src/styles/viewer/composio.css'), 'utf8',
);

afterEach(() => { cleanup(); vi.useRealTimers(); });

function questionForm(title: string) {
  const body = { questions: [{ id: 'scope', label: '需要哪些内容？', type: 'checkbox', options: ['内容结构', '视觉表现'] }] };
  const segment = splitOnQuestionForms(`<question-form id="title-access" title="${title}">${JSON.stringify(body)}</question-form>`)
    .find(segment => segment.kind === 'form');
  if (!segment || segment.kind !== 'form') throw new Error('Expected a parsed question form');
  return segment.form;
}

describe('QuestionForm full title access', () => {
  it.each(['B2B 销售提案关键决策与素材对齐', 'B2B Sales Proposal 关键决策与素材对齐'])(
    'keeps the complete title recoverable while countdown and selection change: %s', title => {
      vi.useFakeTimers();
      const { container } = render(<><style>{headerCss}</style><I18nProvider initial="zh-CN"><QuestionFormView
        form={questionForm(title)} interactive autoContinueAfterTimeout onSubmit={vi.fn()}
      /></I18nProvider></>);
      const heading = screen.getByTitle(title);
      expect(heading).toHaveTextContent(title);
      expect(container.querySelector('time')).toHaveTextContent('10:00');
      act(() => { vi.advanceTimersByTime(1000); });
      expect(container.querySelector('time')).toHaveTextContent('9:59');
      fireEvent.click(screen.getByText('内容结构', { exact: true }));
      const picked = container.querySelector<HTMLElement>('.qf-picked')!;
      expect(picked).toHaveTextContent('已选 1');
      expect(getComputedStyle(picked).flexShrink).toBe('0');
      expect(getComputedStyle(picked).whiteSpace).toBe('nowrap');
      expect(screen.getByTitle(title)).toBe(heading);
      fireEvent.click(screen.getByText('内容结构', { exact: true }));
      expect(container.querySelector('.qf-picked')).toBeNull();
      expect(screen.getByTitle(title)).toBe(heading);
    },
  );
});
