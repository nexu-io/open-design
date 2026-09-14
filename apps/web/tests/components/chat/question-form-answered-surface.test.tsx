// @vitest-environment jsdom
/**
 * 「已确认」陈述块的**底**(PR #7170 `components.css:2107-2113`)。
 *
 * ── 稿子怎么说 ────────────────────────────────────────────────
 *   .answered {
 *     --answered-radius: 16px;
 *     --answered-padding: 12px;
 *     width: fit-content; max-width: 100%; padding: var(--answered-padding);
 *     background: var(--bg-panel); border-radius: var(--answered-radius);
 *     font-size: var(--t-mini); line-height: var(--lh-row);
 *   }
 *   .answered.mod-visual-answer { --answered-radius: var(--radius-lg); }   // 12px
 * 稿子给的理由:「已确认结果统一加浅灰底…16px 圆角只属于答案块…12px 内边距
 * 让文字避开圆角」;带缩略图的视觉方向答案降到内容卡同档的 12px 圆角。
 *
 * ── 我们原来是什么 ────────────────────────────────────────────
 * `padding` / `background` / `border-radius` **三条全缺**,那块是纯白无底 ——
 * 用户在本地 runtime 上指认的就是这个。无头 Chrome 量出来是
 * `bg=rgba(0, 0, 0, 0) pad=0px radius=0px`。
 *
 * ── 顺带核对的一条 ───────────────────────────────────────────
 * 稿子 2116-2121 行专门写了「已确认用绿、**不加勾**」的口径:绿色本身已经说完
 * 「这件事定了」,再挂一枚绿勾会混进旁边执行计划那一列 `.mk.is-ok` 的勾里去。
 * 我们的实现符合 —— 这里把它钉住,免得以后有人顺手补一枚图标。
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import type { QuestionForm } from '../../../src/artifacts/question-form';
import type { VisualStyleContext } from '../../../src/runtime/visual-style-catalog';
import { visualStyleCardsForContext } from '../../../src/runtime/visual-style-catalog';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(
  resolve(HERE, '../../../src/styles/viewer/composio.css'),
  'utf-8',
);

beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  document.head.append(style);
});

afterEach(cleanup);

const form: QuestionForm = {
  id: 'brief',
  title: 'A few quick questions',
  questions: [{ id: 'kind', label: 'What are we making?', type: 'text' }],
};

function answered(
  over: { form?: QuestionForm; answers?: Record<string, string | string[]>;
          visualStyleContext?: VisualStyleContext } = {},
): HTMLElement {
  const { container } = render(
    <QuestionFormView
      form={over.form ?? form}
      interactive={false}
      submittedAnswers={over.answers ?? { kind: 'An editorial page' }}
      onSubmit={() => undefined}
      {...(over.visualStyleContext ? { visualStyleContext: over.visualStyleContext } : {})}
    />,
  );
  const block = container.querySelector<HTMLElement>('.answered');
  if (!block) throw new Error('.answered did not render');
  return block;
}

describe('「已确认」陈述块的底', () => {
  it('有浅灰底、有 16px 圆角', () => {
    const cs = getComputedStyle(answered());
    expect(cs.background || cs.backgroundColor, '那块还是纯白无底').toBe('var(--bg-panel)');
    expect(cs.borderRadius).toBe('var(--answered-radius)');
  });

  /*
   * `padding` 只能看规则原文:jsdom 的 cssstyle 会把简写拆成四条 longhand,
   * 而它不认 `var()` —— `getComputedStyle().padding` 一律读回 `'0'`,
   * 拿它断言等于断言一个常量(先写好断言、再把实现撤掉,读数不动)。
   * 自定义属性本身 jsdom 是认的,所以「那个数是多少」仍旧量得出来。
   */
  it('有 12px 内距,让文字避开圆角', () => {
    expect(
      getComputedStyle(answered()).getPropertyValue('--answered-padding').trim(),
    ).toBe('12px');
    const rule = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('}')
      .find((chunk) => chunk.includes('.answered {'));
    expect(rule, '找不到 `.answered` 那条规则').toBeTruthy();
    expect(rule!, '文字直接贴着圆角 —— padding 那条没落地').toMatch(
      /padding:\s*var\(--answered-padding\)/,
    );
  });

  it('圆角和内距走产品 token,不写裸 16px', () => {
    const block = answered();
    const cs = getComputedStyle(block);
    // 稿子把这两个数存在自定义属性里,我们照做 —— 变体只换属性,不重写整条规则
    expect(cs.getPropertyValue('--answered-radius').trim()).toBe('var(--radius-2xl)');
    expect(cs.getPropertyValue('--answered-padding').trim()).toBe('12px');
    // 裸 16px 会绕开 token 层,主题换圆角档时这块跟不上
    const rule = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('}')
      .find((chunk) => chunk.includes('.answered {'));
    expect(rule, '找不到 `.answered` 那条规则').toBeTruthy();
    expect(rule!, '16px 被写成了字面值').not.toMatch(/--answered-radius:\s*16px/);
  });

  it('带缩略图的视觉方向答案降到 12px 那一档', () => {
    const context: VisualStyleContext = 'deck';
    const card = visualStyleCardsForContext(context).find((c) => c.preview);
    expect(card, '目录里没有带预览图的卡 —— 这条会变成空转').toBeTruthy();
    const block = answered({
      form: {
        ...form,
        questions: [{ id: 'tone', label: 'Visual direction', type: 'radio', options: [] }],
      },
      answers: { tone: card!.value },
      visualStyleContext: context,
    });
    expect(block.querySelector('.av'), '这一格没渲染出缩略图,变体的前提不成立').toBeTruthy();
    expect(
      block.classList.contains('mod-visual-answer'),
      '带缩略图的那档没挂上 `mod-visual-answer`',
    ).toBe(true);
    expect(getComputedStyle(block).getPropertyValue('--answered-radius').trim()).toBe(
      'var(--radius-lg)',
    );
  });

  it('「已确认」是绿字,而且不挂勾', () => {
    const block = answered();
    const k = block.querySelector<HTMLElement>('.k');
    expect(k, '找不到 `.k`').toBeTruthy();
    expect(getComputedStyle(k!).color).toBe('var(--brand-text)');
    // 稿子 2116-2121:绿色已经说完「这件事定了」,再挂一枚勾会混进旁边那一列绿勾
    expect(k!.querySelector('svg'), '「已确认」挂了图标 —— 稿子明确写了不加勾').toBeNull();
    expect(k!.querySelector('img')).toBeNull();
  });
});
