// @vitest-environment jsdom
/**
 * 已回答陈述里要显示**选项的文案**,不是选项的 value。
 *
 * 稿子第 23 / 24 格:「已确认 · 商品卡 沿用列表页那张,抽成两页共享的组件」——
 * 后面那截是人能读的答案。我们原来把 `answers` 里的原始值直接打了出来,
 * 于是屏幕上出现 `share` / `detail` / `search` 这种内部标识(用户 2026-08-26 指出)。
 *
 * 这条同时守住卡片型问题(`cards`)和自填答案(不在选项表里的值原样显示)。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render as rtlRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import type { QuestionForm } from '../../../src/artifacts/question-form';

afterEach(() => cleanup());
const render = (ui: ReactElement) => rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

const form = {
  id: 'q1',
  title: '还需要确认一件事',
  questions: [{
    id: 'scope',
    label: '设置页要不要沿用列表页的商品卡组件?',
    type: 'radio',
    options: [
      { label: '沿用列表页那张商品卡,抽成两页共享的组件', value: 'share' },
      { label: '设置页单独写一套,不跟列表页绑', value: 'own' },
    ],
  }],
} as QuestionForm;

describe('已回答陈述', () => {
  it('单选:显示选项文案,不显示 value', () => {
    const { container } = render(
      <QuestionFormView form={form} interactive={false} submittedAnswers={{ scope: 'share' }} />,
    );
    const body = container.querySelector('.answered')?.textContent ?? '';
    expect(body).toContain('沿用列表页那张商品卡,抽成两页共享的组件');
    expect(body, 'value 不该出现在界面上').not.toContain('share');
  });

  it('多选:每一条都翻成文案', () => {
    const multi = {
      id: 'q2',
      title: '这几页都要跟着改吗',
      questions: [{
        id: 'extras',
        label: '除了设置页,还有哪几页要一起换成新的商品卡?',
        type: 'checkbox',
        options: [
          { label: '商品详情页', value: 'detail' },
          { label: '搜索结果页', value: 'search' },
        ],
      }],
    } as QuestionForm;
    const { container } = render(
      <QuestionFormView form={multi} interactive={false} submittedAnswers={{ extras: ['detail', 'search'] }} />,
    );
    const body = container.querySelector('.answered')?.textContent ?? '';
    expect(body).toContain('商品详情页');
    expect(body).toContain('搜索结果页');
    expect(body).not.toContain('detail');
    expect(body).not.toContain('search');
  });

  it('自己填的答案不在选项表里,原样显示', () => {
    const { container } = render(
      <QuestionFormView form={form} interactive={false} submittedAnswers={{ scope: '只有价格那一行沿用' }} />,
    );
    expect(container.querySelector('.answered')?.textContent).toContain('只有价格那一行沿用');
  });
});
