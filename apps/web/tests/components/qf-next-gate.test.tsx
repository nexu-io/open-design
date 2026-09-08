// @vitest-environment jsdom
/**
 * 「下一步」什么时候才亮 —— 判据全部来自交付稿意图澄清那五格的状态标签:
 *
 *   5-1 单选 · 待选,一个都没选 ——「下一步」置灰
 *   5-2 单选 · 选中一项,「下一步」才亮起
 *   5-3 多选 · 方钮,选完点「下一步」统一提交
 *   5-4 选中「自己填」· 原地长出输入框,**没写字前「下一步」仍置灰**
 *   5-5 多选勾上「自己填」· 是在已勾项之外再加一条
 *
 * 也就是说:**有选项的问题必须先有答案**,不想答走旁边的「跳过」。
 * 我们原来的判据是 `required`,agent 没标 required 的选择题就一路亮着 —— 和稿子对不上。
 *
 * 自由输入(text / textarea)不在这条规则里:稿子没有画过那种卡,
 * 也不该被这条顺手收紧。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { QuestionForm } from '../../src/artifacts/question-form';
import { I18nProvider } from '../../src/i18n';
import { QuestionFormView } from '../../src/components/QuestionForm';

afterEach(() => cleanup());
const render = (ui: ReactElement) => rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

const nextBtn = (): HTMLButtonElement => {
  const hit = [...document.querySelectorAll<HTMLButtonElement>('.question-form-foot button')]
    .find((b) => b.classList.contains('primary'));
  if (!hit) throw new Error('底栏没有主按钮');
  return hit;
};
const chip = (text: string): HTMLElement => {
  const hit = [...document.querySelectorAll<HTMLElement>('.qf-chip')]
    .find((el) => (el.textContent ?? '').includes(text));
  if (!hit) throw new Error(`没有文案含「${text}」的选项`);
  return hit;
};

const single = (extra: Record<string, unknown> = {}): QuestionForm => ({
  id: 'f1',
  title: '还需要确认一件事',
  questions: [{
    id: 'scope',
    label: '设置页要不要沿用列表页的商品卡组件?',
    type: 'radio',
    options: [
      { label: '沿用列表页那张商品卡', value: 'share' },
      { label: '设置页单独写一套', value: 'own' },
    ],
    ...extra,
  }],
} as QuestionForm);

describe('「下一步」按稿子的判据置灰', () => {
  it('单选:一个都没选就置灰(稿子 5-1),选中一项才亮(5-2)', () => {
    render(<QuestionFormView form={single()} interactive onSubmit={vi.fn()} />);
    expect(nextBtn().disabled).toBe(true);
    fireEvent.click(chip('沿用列表页那张商品卡'));
    expect(nextBtn().disabled).toBe(false);
  });

  it('多选:一条没勾也置灰,勾上就亮(稿子 5-3)', () => {
    const form = {
      id: 'f2',
      title: '这几页都要跟着改吗',
      questions: [{
        id: 'extras',
        label: '除了设置页,还有哪几页要一起换?',
        type: 'checkbox',
        options: [
          { label: '商品详情页', value: 'detail' },
          { label: '结算页的商品缩略图', value: 'checkout' },
        ],
      }],
    } as QuestionForm;
    render(<QuestionFormView form={form} interactive onSubmit={vi.fn()} />);
    expect(nextBtn().disabled).toBe(true);
    fireEvent.click(chip('商品详情页'));
    expect(nextBtn().disabled).toBe(false);
  });

  it('「自己填」开着但一个字没写,仍然置灰(稿子 5-4)', () => {
    render(<QuestionFormView form={single({ allowCustom: true })} interactive onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '自己填' }));
    expect(screen.getByTestId('qf-input')).toBeTruthy();
    expect(nextBtn().disabled, '开了输入框但没写字,不算答了').toBe(true);

    fireEvent.change(screen.getByTestId('qf-input'), { target: { value: '只有价格那一行沿用' } });
    expect(nextBtn().disabled).toBe(false);
  });

  it('只有空格也不算写了字', () => {
    render(<QuestionFormView form={single({ allowCustom: true })} interactive onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '自己填' }));
    fireEvent.change(screen.getByTestId('qf-input'), { target: { value: '   ' } });
    expect(nextBtn().disabled).toBe(true);
  });

  it('自由输入题不受这条约束 —— 稿子没画过那种卡,不顺手收紧', () => {
    const form = {
      id: 'f3',
      title: '补充说明',
      questions: [{ id: 'notes', label: '还有什么要说的?', type: 'text' }],
    } as QuestionForm;
    render(<QuestionFormView form={form} interactive onSubmit={vi.fn()} />);
    expect(nextBtn().disabled).toBe(false);
  });
});
