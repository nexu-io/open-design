// @vitest-environment jsdom
/**
 * 颜色选择题(PR #7170 新增,`body-components.html` 第 631 行起 + `interactions.js` 262 行起)。
 *
 * ── 稿子怎么说 ────────────────────────────────────────────────
 * 「颜色选择 —— 预设色、系统取色器和 Hex 输入**三条路实时同步**,预览跟着更新。」
 *   · 8 颗预设色块,选中的那颗 `aria-pressed="true"`;
 *   · 一枚原生 `<input type="color">` 打开系统取色器;
 *   · 一个可编辑的 Hex 文本框,`aria-invalid` 标错;
 *   · Hex 非法时「下一步」`disabled`,失焦回滚到当前颜色;
 *   · 已回答收成 `.color-answer`:一枚色块 `<i>` + 规范化后的 Hex `<b>`。
 *
 * ── 我们原来是什么 ────────────────────────────────────────────
 * `QuestionForm.tsx` 里孤零零一个裸 `<input type="color">`。没有预设、没有 Hex 输入、
 * 没有预览、没有非法态,已回答只有一行纯文字。
 *
 * ── 产品取舍(写死在这里,改判要先改这段注释)────────────────
 * 规范形 = `#` + **6 位小写** hex,只此一种:
 *  · **小写**,不是大写 —— 原生 `<input type="color">` 的 value sanitization
 *    会把值小写化,规范形若是大写,受控组件每一帧都在和 DOM 打架
 *    (props 是 `#3B82F6`,读回来是 `#3b82f6`);稿子本身也全篇小写。
 *  · **不收 alpha**(`#rrggbbaa`)、**不收 3 位简写**(`#abc`)—— 稿子的正则就是
 *    `^#[0-9a-f]{6}$`,收下它们等于**悄悄扩大协议**:答案是要发回给模型的文本,
 *    多一种形态就多一种下游要认的东西。两者都判非法,走可见错误 + 置灰。
 *  · 输入时**容忍缺 `#`**(粘贴 `3b82f6`)。这只是输入宽容,**输出仍然只有一种**
 *    形态,不构成协议扩大。
 * 规范化只有一处实现:`artifacts/question-form.ts` 的 `normalizeHexColor`。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import { normalizeHexColor, splitOnQuestionForms } from '../../../src/artifacts/question-form';
import type { QuestionForm } from '../../../src/artifacts/question-form';

afterEach(cleanup);

const colorForm: QuestionForm = {
  id: 'brand',
  title: 'One more thing',
  questions: [
    { id: 'accent', label: 'Workspace accent color', type: 'color', defaultValue: '#3b82f6' },
  ],
};

function mount(overrides: Partial<Parameters<typeof QuestionFormView>[0]> = {}) {
  const onSubmit = vi.fn();
  const view = render(
    <QuestionFormView form={colorForm} interactive onSubmit={onSubmit} {...overrides} />,
  );
  return { ...view, onSubmit };
}

const native = (root: HTMLElement) => root.querySelector<HTMLInputElement>('input.qf-color')!;
const hexBox = (root: HTMLElement) => root.querySelector<HTMLInputElement>('input.qf-color-hex')!;
const swatches = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLButtonElement>('button.qf-color-swatch')];
const nextBtn = (root: HTMLElement) =>
  root.querySelector<HTMLButtonElement>('.qf-primary-action')!;

describe('normalizeHexColor —— 规范化只有这一处实现', () => {
  it('收 6 位 hex,一律吐 `#` + 6 位小写', () => {
    expect(normalizeHexColor('#3B82F6')).toBe('#3b82f6');
    expect(normalizeHexColor('3b82f6')).toBe('#3b82f6');
    expect(normalizeHexColor('  #EF4444  ')).toBe('#ef4444');
  });

  it('不收 alpha、不收 3 位简写、不收颜色名和 rgb()', () => {
    expect(normalizeHexColor('#3b82f688')).toBeNull();
    expect(normalizeHexColor('#abc')).toBeNull();
    expect(normalizeHexColor('rebeccapurple')).toBeNull();
    expect(normalizeHexColor('rgb(1,2,3)')).toBeNull();
    expect(normalizeHexColor('#12345')).toBeNull();
    expect(normalizeHexColor('')).toBeNull();
    expect(normalizeHexColor(undefined)).toBeNull();
  });
});

describe('规范化挂在了「值进来」的每一条路上', () => {
  function parseColorQuestion(defaultValue: string) {
    const input = [
      '<question-form id="brand" title="Brand">',
      '{ "questions": [',
      `  { "id": "accent", "label": "Accent", "type": "color", "defaultValue": "${defaultValue}" }`,
      '] }',
      '</question-form>',
    ].join('\n');
    const segment = splitOnQuestionForms(input).find((s) => s.kind === 'form');
    if (!segment || segment.kind !== 'form') throw new Error('expected parsed form');
    return segment.form.questions[0]!;
  }

  it('模型写的默认值在 parser 里就收成规范形', () => {
    expect(parseColorQuestion('#3B82F6').defaultValue).toBe('#3b82f6');
    expect(parseColorQuestion('3b82f6').defaultValue).toBe('#3b82f6');
  });

  it('规范不了的默认值当没给 —— 不让控件拿着一个渲染不出来的值', () => {
    expect(parseColorQuestion('#abc').defaultValue).toBeUndefined();
    expect(parseColorQuestion('cornflowerblue').defaultValue).toBeUndefined();
  });

  it('存下来的草稿回填时也过一次规范化', () => {
    // 这条走的不是「已确认」陈述那条路(那条是 interactive=false),
    // 而是把上次没提交完的草稿填回一张还能改的表单 —— 两条路各有各的入口
    const { container } = render(
      <QuestionFormView
        form={colorForm}
        interactive
        draftAnswers={{ accent: '#8B5CF6' }}
        onSubmit={() => undefined}
      />,
    );
    expect(hexBox(container).value).toBe('#8b5cf6');
    expect(native(container).value).toBe('#8b5cf6');
    const pressed = swatches(container).filter(
      (node) => node.getAttribute('aria-pressed') === 'true',
    );
    expect(pressed.map((node) => node.dataset.color)).toEqual(['#8b5cf6']);
  });

  it('回填来的草稿一次没动也按规范形提交出去', () => {
    // 这条盯的是**答案值**,不是显示 —— 显示那一路由渲染兜底
    // (`normalizeColorInputValue`)顺手也做对了,所以只看控件长什么样
    // 证明不了答案本身有没有被规范化。
    const onSubmit = vi.fn();
    const { container } = render(
      <QuestionFormView
        form={colorForm}
        interactive
        draftAnswers={{ accent: '#8B5CF6' }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(nextBtn(container));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('- Workspace accent color: #8b5cf6'),
      { accent: '#8b5cf6' },
      'submit',
    );
  });
});

describe('意图澄清卡 · 颜色选择', () => {
  it('三件控件都在:预设色块、系统取色器、可编辑 Hex', () => {
    const { container } = mount();
    expect(swatches(container).length, '没有预设色块').toBeGreaterThan(0);
    expect(native(container).type).toBe('color');
    expect(hexBox(container), '找不到可编辑的 Hex 输入框').toBeTruthy();
    expect(hexBox(container).readOnly).toBe(false);
    expect(hexBox(container).value).toBe('#3b82f6');
  });

  it('点预设色块 —— 取色器、Hex 框、按下态、预览四处同时跟上', () => {
    const { container } = mount();
    const red = swatches(container).find((node) => node.dataset.color === '#ef4444');
    expect(red, '预设里没有 #ef4444 这一颗').toBeTruthy();

    fireEvent.click(red!);

    expect(native(container).value).toBe('#ef4444');
    expect(hexBox(container).value).toBe('#ef4444');
    expect(red!.getAttribute('aria-pressed')).toBe('true');
    for (const other of swatches(container)) {
      if (other !== red) expect(other.getAttribute('aria-pressed')).toBe('false');
    }
    // 预览跟着走 —— 颜色由包装层的自定义属性驱动
    const field = container.querySelector<HTMLElement>('.qf-color-field')!;
    expect(field.style.getPropertyValue('--qf-choice-color')).toBe('#ef4444');
    expect(container.querySelector('.qf-color-preview')).toBeTruthy();
  });

  it('拖系统取色器 —— Hex 框跟着变', () => {
    const { container } = mount();
    fireEvent.input(native(container), { target: { value: '#22c55e' } });
    expect(hexBox(container).value).toBe('#22c55e');
    expect(
      container.querySelector<HTMLElement>('.qf-color-field')!.style.getPropertyValue(
        '--qf-choice-color',
      ),
    ).toBe('#22c55e');
  });

  it('敲合法 Hex —— 取色器跟着变,大小写和缺失的 `#` 都被规范掉', () => {
    const { container, onSubmit } = mount();
    fireEvent.change(hexBox(container), { target: { value: '8B5CF6' } });

    expect(native(container).value).toBe('#8b5cf6');
    expect(hexBox(container).getAttribute('aria-invalid')).toBe('false');
    expect(nextBtn(container).disabled).toBe(false);

    fireEvent.click(nextBtn(container));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('- Workspace accent color: #8b5cf6'),
      { accent: '#8b5cf6' },
      'submit',
    );
  });

  it('Hex 非法 —— 标红、给一句看得见的错、「下一步」置灰', () => {
    const { container } = mount();
    fireEvent.change(hexBox(container), { target: { value: '#zzzzzz' } });

    expect(hexBox(container).getAttribute('aria-invalid')).toBe('true');
    const error = container.querySelector<HTMLElement>('.qf-color-error');
    expect(error, '非法时没有可见的错误提示').toBeTruthy();
    expect(error!.textContent!.trim().length).toBeGreaterThan(0);
    // 错误和输入框要挂上关系,读屏才念得到
    expect(hexBox(container).getAttribute('aria-describedby')).toBe(error!.id);
    expect(nextBtn(container).disabled, '非法 Hex 下「下一步」还能点').toBe(true);
  });

  it('alpha 和 3 位简写都算非法 —— 不悄悄扩大协议', () => {
    const { container } = mount();
    for (const bad of ['#3b82f688', '#abc']) {
      fireEvent.change(hexBox(container), { target: { value: bad } });
      expect(hexBox(container).getAttribute('aria-invalid'), `${bad} 被当成合法值收下了`).toBe(
        'true',
      );
      expect(nextBtn(container).disabled).toBe(true);
    }
  });

  it('非法值失焦回滚到当前颜色,「下一步」重新可点', () => {
    const { container } = mount();
    fireEvent.change(hexBox(container), { target: { value: 'nope' } });
    expect(nextBtn(container).disabled).toBe(true);

    fireEvent.blur(hexBox(container));

    expect(hexBox(container).value).toBe('#3b82f6');
    expect(hexBox(container).getAttribute('aria-invalid')).toBe('false');
    expect(nextBtn(container).disabled).toBe(false);
  });

  it('半截的非法 Hex 摆在框里时,点一颗预设色块就能接管', () => {
    // 不许要求用户先把框里那串东西删干净 —— 点色块本身就是「我改主意了」
    const { container } = mount();
    fireEvent.change(hexBox(container), { target: { value: '#zz' } });
    expect(nextBtn(container).disabled).toBe(true);

    fireEvent.click(swatches(container).find((n) => n.dataset.color === '#22c55e')!);

    expect(hexBox(container).value).toBe('#22c55e');
    expect(hexBox(container).getAttribute('aria-invalid')).toBe('false');
    expect(container.querySelector('.qf-color-error')).toBeNull();
    expect(nextBtn(container).disabled).toBe(false);
  });

  it('模型给的 options 当预设色用,非法项被丢掉', () => {
    const { container } = render(
      <QuestionFormView
        form={{
          ...colorForm,
          questions: [
            {
              ...colorForm.questions[0]!,
              options: [
                { label: 'Ink', value: '#101828' },
                { label: 'Sun', value: '#EAB308' },
                { label: 'Nope', value: 'not-a-color' },
              ],
            },
          ],
        }}
        interactive
        onSubmit={() => undefined}
      />,
    );
    expect(swatches(container).map((node) => node.dataset.color)).toEqual([
      '#101828',
      '#eab308',
    ]);
  });

  it('已回答收成一条陈述:色块 + 规范化后的 Hex', () => {
    const { container } = render(
      <QuestionFormView
        form={colorForm}
        interactive={false}
        submittedAnswers={{ accent: '#8B5CF6' }}
        onSubmit={() => undefined}
      />,
    );
    const answered = container.querySelector<HTMLElement>('.answered')!;
    const row = answered.querySelector<HTMLElement>('.ab.mod-value');
    expect(row, '已回答的颜色没有走 `.ab.mod-value` 这一行').toBeTruthy();
    expect(within(row!).getByText('Workspace accent color')).toBeTruthy();
    const swatch = row!.querySelector<HTMLElement>('.color-answer');
    expect(swatch, '已回答没有保留色块').toBeTruthy();
    expect(swatch!.style.getPropertyValue('--answer-color')).toBe('#8b5cf6');
    expect(swatch!.querySelector('b')!.textContent).toBe('#8b5cf6');
  });

  it('历史里存着的非 hex 文本照原样念出来,不假装成一块颜色', () => {
    const { container } = render(
      <QuestionFormView
        form={colorForm}
        interactive={false}
        submittedAnswers={{ accent: 'whatever the brand book says' }}
        onSubmit={() => undefined}
      />,
    );
    const answered = container.querySelector<HTMLElement>('.answered')!;
    expect(answered.textContent).toContain('whatever the brand book says');
    expect(answered.querySelector('.color-answer'), '给不成颜色的值编了一块色').toBeNull();
  });
});
