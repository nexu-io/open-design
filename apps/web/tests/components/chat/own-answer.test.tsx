// @vitest-environment jsdom
/**
 * 「自己填」是选项列表里的**最后一项**,不是列表之后另起的一枚按钮(交付稿 #16 / #18)。
 *
 * 稿子的实体:
 *   <div class="opt mod-own is-on is-open">
 *     <span class="box">✓</span>
 *     <span class="own">
 *       <span class="own-l">自己填</span>
 *       <textarea class="own-ta" rows="1" placeholder="用你自己的说法写 —— …"></textarea>
 *     </span>
 *   </div>
 *
 * 我们原来的做法有三处不对,产品在对照页上一眼看出来了:
 *  ① 文案叫「其他」—— 稿子全文 0 次出现这两个字,叫「自己填」
 *  ② 它排在列表**外面**,而且是 <button>(其余是 <label>),所以在 flex 列里跑到了居中
 *  ③ 输入框是下面单独一块折叠,不是内嵌在这一项里
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { I18nProvider } from '../../../src/i18n';
import { QuestionFormView } from '../../../src/components/QuestionForm';

afterEach(() => { cleanup(); });

const form = {
  id: 'q1',
  title: '还需要确认一件事',
  questions: [
    {
      id: 'card',
      label: '设置页要不要沿用列表页的商品卡组件?',
      type: 'radio' as const,
      options: [
        { value: 'reuse', label: '沿用列表页那张商品卡,抽成两页共享的组件' },
        { value: 'solo', label: '设置页单独写一套,不跟列表页绑' },
      ],
      allowCustom: true,
    },
  ],
};

const show = () => render(
  <I18nProvider initial="zh-CN">
    <QuestionFormView form={form as never} interactive onSubmit={() => {}} />
  </I18nProvider>,
);

describe('自己填', () => {
  it('文案是「自己填」,不是「其他」', () => {
    const { container } = show();
    expect(container.textContent).toContain('自己填');
    expect(container.textContent).not.toContain('其他');
  });

  it('它是选项列表的最后一项,和其余选项同一个父节点', () => {
    const { container } = show();
    const own = container.querySelector('.qf-chip-other');
    expect(own, '找不到「自己填」那一项').not.toBeNull();
    const list = container.querySelector('.qf-options');
    expect(own?.parentElement, '「自己填」跑到选项列表外面去了').toBe(list);
    expect(list?.lastElementChild).toBe(own);
  });

  it('选中之后输入框内嵌在这一项里,不是下面单独一块', () => {
    const { container } = show();
    const own = container.querySelector('.qf-chip-other');
    // 未选中时不出输入框 —— 稿子那一格是 `is-on is-open` 才有 textarea
    expect(own?.querySelector('textarea')).toBeNull();

    // 收起态整项就是稿子的 `<button class="opt mod-own">`,点它本身;
    // 展开之后才换成 `<div>` + 里面那颗小方框按钮。
    fireEvent.click(own!);

    const after = container.querySelector('.qf-chip-other');
    expect(after?.querySelector('textarea'), '输入框没有内嵌在「自己填」里').not.toBeNull();
    // 而且不能再有那块独立的折叠容器
    expect(container.querySelector('.qf-custom-collapsible')).toBeNull();
  });
});
