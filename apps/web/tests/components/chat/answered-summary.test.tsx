// @vitest-environment jsdom
/**
 * 「已回答」态按交付稿收成一条陈述(#23 / #24 / #25),不是把整张表单锁住置灰。
 *
 * 稿子的实体:
 *   <div class="answered">
 *     <div class="k">已确认</div>
 *     <div class="ab"><span class="ak">商品卡</span><b>沿用列表页那张,抽成两页共享的组件</b></div>
 *   </div>
 * 多选走 <ul class="al"><li>…</li></ul>;视觉方向再多一块 57px 的缩略图 <span class="av">。
 *
 * 我原来把这条挂成 T11「待产品拍板:收成陈述 vs 锁住表单」—— 稿子画得清清楚楚就是收成陈述,
 * 是我把一个稿子已经回答的问题当成了「产品没定」,然后按老实现交了。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { I18nProvider } from '../../../src/i18n';
import { QuestionFormView } from '../../../src/components/QuestionForm';

afterEach(() => { cleanup(); });

const form = {
  id: 'q1',
  title: '还需要确认一件事',
  questions: [
    { id: 'card', label: '商品卡', type: 'radio' as const,
      options: [{ value: 'reuse', label: '沿用列表页那张,抽成两页共享的组件' }] },
  ],
};

const multi = {
  id: 'q2',
  title: '这几页都要跟着改吗',
  questions: [
    { id: 'pages', label: '页面', type: 'checkbox' as const,
      options: [
        { value: 'detail', label: '商品详情页' },
        { value: 'search', label: '搜索结果页' },
      ] },
  ],
};

const show = (f: unknown, answers: Record<string, string | string[]>) => render(
  <I18nProvider initial="zh-CN">
    <QuestionFormView form={f as never} submittedAnswers={answers} interactive={false} />
  </I18nProvider>,
);

describe('已回答态', () => {
  it('单选:收成「已确认 + 标签 + 值」,不再渲染选项', () => {
    const { container } = show(form, { card: '沿用列表页那张,抽成两页共享的组件' });
    const answered = container.querySelector('.answered');
    expect(answered, '没有 .answered —— 还在渲染锁住的表单').not.toBeNull();
    expect(answered?.querySelector('.k')?.textContent).toBe('已确认');
    expect(answered?.querySelector('.ab .ak')?.textContent).toBe('商品卡');
    expect(answered?.querySelector('.ab b')?.textContent).toBe('沿用列表页那张,抽成两页共享的组件');
    // 稿子的已回答态里没有选项、没有页脚按钮
    expect(container.querySelector('.qf-chip')).toBeNull();
    expect(container.querySelector('.question-form-foot')).toBeNull();
  });

  it('多选:每勾一条列一行,走 ul.al', () => {
    const { container } = show(multi, { pages: ['商品详情页', '搜索结果页'] });
    const items = [...container.querySelectorAll('.answered .al li')];
    expect(items).toHaveLength(2);
    expect(items[0]?.querySelector('.ak')?.textContent).toBe('页面');
    expect(items.map((li) => li.querySelector('b')?.textContent)).toEqual(['商品详情页', '搜索结果页']);
  });
});
