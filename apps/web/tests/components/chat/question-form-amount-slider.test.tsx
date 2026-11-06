// @vitest-environment jsdom
/**
 * 数值滑块(PR #7170,`body-components.html` 第 673 行起 + `interactions.js` 324 行起)。
 *
 * ── 稿子怎么说 ────────────────────────────────────────────────
 * 「Amount Slider —— 上方数字**可直接编辑**并与滑杆双向同步,**不展示刻度点**。」
 *   <div class="amount-slider">
 *     <div class="amount-readout"><input class="amount-value-input" type="number" …></div>
 *     <div class="amount-rail"><input class="amount-range" type="range" …></div>
 *     <div class="amount-limits"><span>1 · 疏朗</span><span>5 · 紧凑</span></div>
 *   </div>
 * 上一版稿子的轨道里还铺着一排 `.amount-stop` 光点,这一版**整排删掉了**
 * ——「轨道不再放刻度点;数值位置由滑块本身和进度色共同表达」。
 *
 * ── 我们原来是什么 ────────────────────────────────────────────
 * 一个只读 `<output class="qf-range-value">` 挂在 `<input type="range">` 旁边。
 * 数字念得出来但改不了,键盘用户只能一格一格挪滑杆。
 *
 * ── 产品取舍(改判要先改这段注释)────────────────────────────
 *  · 稿子的「档」字和「1 · 疏朗 / 5 · 紧凑」这两条端点文案,**协议里没有对应字段**
 *    (审计文档 §8 待决项 3 就是这个)。不臆造 schema:单位整个不渲染,端点
 *    只渲染 `min` / `max` 两个数 —— 这两个我们真的有。
 *  · 用 React 受控 state,**不移植稿子的 DOM 监听器**。
 *  · 打字期间**不当场改写文本框**(稿子的 `paint` 会:1–5 的范围里想输「10」
 *    第一下就被吃成 1)。文本原样留着,提交/失焦时才收进合法区间;
 *    但**答案值任何时刻都是合法的** —— 不等失焦也不会提交出界的数。
 *  · 历史里存着的越界标量**不改写**:文本框如实念出存的那个数,滑杆按范围收着显示。
 *    「不为了拿到新样子去动已经写下的旧内容」是兼容性底线。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import type { QuestionForm } from '../../../src/artifacts/question-form';

afterEach(cleanup);

function densityForm(over: Record<string, unknown> = {}): QuestionForm {
  return {
    id: 'density',
    title: 'One more thing',
    questions: [
      {
        id: 'density',
        label: 'Layout density',
        type: 'range',
        min: 1,
        max: 5,
        step: 1,
        defaultValue: '2',
        ...over,
      } as QuestionForm['questions'][number],
    ],
  };
}

const numberBox = (root: HTMLElement) =>
  root.querySelector<HTMLInputElement>('input.qf-amount-value')!;
const rangeBox = (root: HTMLElement) => root.querySelector<HTMLInputElement>('input.qf-range')!;
const nextBtn = (root: HTMLElement) =>
  root.querySelector<HTMLButtonElement>('.qf-primary-action')!;

function mount(form: QuestionForm = densityForm(), over: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  const view = render(
    <QuestionFormView form={form} interactive onSubmit={onSubmit} {...over} />,
  );
  return { ...view, onSubmit };
}

describe('意图澄清卡 · 数值滑块', () => {
  it('上方数字是可编辑的输入框,不是只读 output', () => {
    const { container } = mount();
    const box = numberBox(container);
    expect(box, '找不到 `.qf-amount-value` —— 数字还是只读的').toBeTruthy();
    expect(box.tagName).toBe('INPUT');
    expect(box.type).toBe('number');
    expect(box.readOnly).toBe(false);
    expect(box.value).toBe('2');
    expect(container.querySelector('output.qf-range-value'), '只读 output 还留着').toBeNull();
  });

  it('min / max / step 全部来自协议,两个控件读同一份', () => {
    const { container } = mount(densityForm({ min: 0, max: 10, step: 5 }));
    for (const node of [numberBox(container), rangeBox(container)]) {
      expect(node.min).toBe('0');
      expect(node.max).toBe('10');
      expect(node.step).toBe('5');
    }
    // 端点标注只有我们真有的两个数,不编单位
    const limits = container.querySelector<HTMLElement>('.qf-amount-limits')!;
    expect([...limits.children].map((n) => n.textContent)).toEqual(['0', '10']);
  });

  it('拖滑杆 —— 上方数字跟着走', () => {
    const { container } = mount();
    fireEvent.change(rangeBox(container), { target: { value: '4' } });
    expect(numberBox(container).value).toBe('4');
  });

  it('敲数字 —— 滑杆跟着走', () => {
    const { container } = mount();
    fireEvent.change(numberBox(container), { target: { value: '5' } });
    expect(rangeBox(container).value).toBe('5');
  });

  it('打字期间不吃字,但提交出去的答案已经收进区间', () => {
    const { container, onSubmit } = mount();
    fireEvent.change(numberBox(container), { target: { value: '99' } });

    // 稿子的 DOM 版会当场把「99」改写成「5」;我们让人把话说完
    expect(numberBox(container).value).toBe('99');
    // 但答案不许出界 —— 不等失焦
    fireEvent.click(nextBtn(container));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('- Layout density: 5'),
      { density: '5' },
      'submit',
    );
  });

  it('失焦把出界的数收回区间(上下两头都收)', () => {
    const { container } = mount();

    fireEvent.change(numberBox(container), { target: { value: '99' } });
    fireEvent.blur(numberBox(container));
    expect(numberBox(container).value).toBe('5');

    fireEvent.change(numberBox(container), { target: { value: '-4' } });
    fireEvent.blur(numberBox(container));
    expect(numberBox(container).value).toBe('1');
  });

  it('失焦按 step 吸附到最近的一档', () => {
    const { container } = mount(densityForm({ min: 0, max: 10, step: 5 }));
    fireEvent.change(numberBox(container), { target: { value: '7' } });
    fireEvent.blur(numberBox(container));
    expect(numberBox(container).value).toBe('5');
    expect(rangeBox(container).value).toBe('5');
  });

  it('清空后失焦回到上一个合法值,不留空洞', () => {
    const { container } = mount();
    fireEvent.change(numberBox(container), { target: { value: '' } });
    fireEvent.blur(numberBox(container));
    expect(numberBox(container).value).toBe('2');
  });

  it('协议没给 max 时,数字框和滑杆共用 HTML 那个 100 的默认上界', () => {
    // 滑杆是原生控件,没有 max 就照 HTML 默认停在 100。数字框若按「没有上界」
    // 放行,敲一个 500 进去就会出现「答案 500、滑杆 100」的两份真相。
    const { container, onSubmit } = mount(densityForm({ min: 1, max: undefined }));
    fireEvent.change(numberBox(container), { target: { value: '500' } });
    expect(rangeBox(container).value).toBe('100');
    fireEvent.click(nextBtn(container));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('- Layout density: 100'),
      { density: '100' },
      'submit',
    );
  });

  it('轨道里只有滑杆本身 —— 这一版稿子把刻度点整排删掉了', () => {
    const { container } = mount();
    const rail = container.querySelector<HTMLElement>('.qf-amount-rail');
    expect(rail, '找不到 `.qf-amount-rail`').toBeTruthy();
    expect([...rail!.children].map((n) => n.className)).toEqual(['qf-range']);
  });

  it('历史里越界的旧标量照原样念出来,不被改写', () => {
    const onDraftChange = vi.fn();
    const { container } = mount(densityForm(), {
      draftAnswers: { density: '7' },
      onDraftChange,
    });
    // 存的是 7 就念 7 —— 不为了新样子去动已经写下的旧内容
    expect(numberBox(container).value).toBe('7');
    // 滑杆物理上只到 5,显示收着,但没有人替用户按下提交
    expect(rangeBox(container).value).toBe('5');
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it('已回答收成「标签 + 档位」一条陈述(旧答案照样回放)', () => {
    const { container } = render(
      <QuestionFormView
        form={densityForm()}
        interactive={false}
        submittedAnswers={{ density: '3' }}
        onSubmit={() => undefined}
      />,
    );
    const answered = container.querySelector<HTMLElement>('.answered')!;
    expect(answered.textContent).toContain('Layout density');
    expect(answered.textContent).toContain('3');
  });
});
