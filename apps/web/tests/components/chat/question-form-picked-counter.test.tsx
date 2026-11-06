// @vitest-environment jsdom
/**
 * 多选计数的两段式排版(PR #7170 `components.css`)。
 *
 * ── 稿子怎么说 ────────────────────────────────────────────────
 *   <span class="n selection-count"><span class="count-label">已选</span> <span class="count-value">2</span></span>
 *   .card > .h .selection-count             { color: var(--text-strong) }
 *   .card > .h .selection-count .count-label{ color: var(--text-soft) }
 * 也就是:数字保留原色,「已选」两个字退后一档。要做到这件事,DOM 上必须有
 * **两个独立的元素**;现在整条计数是一整串译文,染不了两档色。
 *
 * ── 为什么不能拿两个 key 前后拼 ──────────────────────────────
 * 语序不是每种语言都一样:`en` 是「2 picked」(数字在前)、`zh-CN` 是「已选 2」
 * (数字在后)、`ko` 是「2개 선택」(数字后面直接接字,**中间没有空格**)。
 * 拼两个片段就得钦定一种顺序和一个分隔符,那三条里至少两条会错。
 *
 * 做法是把**同一条完整译文**按 `{count}` 的落点切成前后两段:切出来的两段
 * 天然就是这门语言自己的语序,数字落在它本来的位置,空格也照译文原样保留。
 * 因此本文件最硬的一条断言是 **`.qf-picked` 的 textContent 与整条译文逐字相等**
 * —— 一旦有人改回拼接,韩语/波兰语立刻照出来。
 */
import { describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach } from 'vitest';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import { tForLanguageTag } from '../../../src/i18n';
import type { QuestionForm } from '../../../src/artifacts/question-form';

afterEach(cleanup);

function multiSelectForm(lang: string): QuestionForm {
  return {
    id: 'pages',
    title: 'Pages to update',
    lang,
    questions: [
      {
        id: 'pages',
        label: 'Which pages change with it?',
        type: 'checkbox',
        options: [
          { label: 'Product detail', value: 'pdp' },
          { label: 'Search results', value: 'search' },
          { label: 'Checkout thumbnail', value: 'checkout' },
        ],
      },
    ],
  };
}

function mountAndPick(lang: string, picks: string[]): HTMLElement {
  const { container } = render(
    <QuestionFormView form={multiSelectForm(lang)} interactive onSubmit={() => undefined} />,
  );
  for (const label of picks) {
    const chip = [...container.querySelectorAll<HTMLElement>('.qf-chip')].find((node) =>
      node.textContent?.includes(label),
    );
    if (!chip) throw new Error(`option chip not found: ${label}`);
    fireEvent.click(chip);
  }
  const picked = container.querySelector<HTMLElement>('.qf-picked');
  if (!picked) throw new Error('.qf-picked did not render');
  return picked;
}

describe('意图澄清卡 · 多选计数拆成「标签」与「数字」两段', () => {
  it('计数由两个独立元素组成,数字单独一段', () => {
    const picked = mountAndPick('zh-CN', ['Product detail', 'Search results']);

    const label = picked.querySelector<HTMLElement>('.qf-picked-label');
    const value = picked.querySelector<HTMLElement>('.qf-picked-value');
    expect(label, '找不到 `.qf-picked-label` —— 计数还是一整串译文').toBeTruthy();
    expect(value, '找不到 `.qf-picked-value` —— 数字没有自己的元素').toBeTruthy();
    expect(value!.textContent).toBe('2');
  });

  it('切出来的两段拼回去与整条译文逐字相等(空格也照原样)', () => {
    for (const lang of ['zh-CN', 'en', 'ko', 'pl', 'ar'] as const) {
      cleanup();
      const picked = mountAndPick(lang, ['Product detail', 'Search results']);
      const t = tForLanguageTag(lang)!;
      expect(picked.textContent, `${lang} 的计数与译文对不上`).toBe(
        t('qf.picked', { count: 2 }),
      );
      // 数字必须**只**出现在 `.qf-picked-value` 里 —— 否则说明标签段把数字也吞了
      expect(picked.querySelector('.qf-picked-value')!.textContent).toBe('2');
      expect(picked.querySelector('.qf-picked-label')!.textContent).not.toMatch(/2/);
    }
  });

  it('DOM 顺序跟着译文的语序走,不是钦定的固定顺序', () => {
    const zh = mountAndPick('zh-CN', ['Product detail']);
    // 「已选 2」—— 标签在前
    expect(zh.firstElementChild!.className).toContain('qf-picked-label');

    cleanup();
    const en = mountAndPick('en', ['Product detail']);
    // 「1 picked」—— 数字在前
    expect(en.firstElementChild!.className).toContain('qf-picked-value');
  });
});
