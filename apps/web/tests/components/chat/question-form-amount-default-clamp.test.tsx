// @vitest-environment jsdom
/**
 * OPEND-2622 —— 数值滑块把 1–5 的题提交成 0。
 *
 * ── 缺陷是什么 ────────────────────────────────────────────────
 * 模型在同一道题上既声明了范围(`min: 1, max: 5`)又给了一个越界的推荐值
 * (`defaultValue: 0`)。协议里这两句话是矛盾的,而我们**照单全收**:
 * 答案落成 `"0"`,`formatFormAnswers` 原样写进 `[form answers — …]`,
 * 后续规划于是收到一个不在声明范围内的参数。
 *
 * ── 为什么是这一层 ────────────────────────────────────────────
 * 拖滑杆(`dragRange`)、敲数字(`typeRange`)两条路**都**过 `clampRangeValue`,
 * 只有「模型默认值进状态」这条路没有。所以人一旦动过控件值就合法,
 * 从头到尾没动过的题反而是越界的 —— 缺陷只在无人触碰的那条路上。
 *
 * 屏幕上因此有**两份真相**:数字框念模型给的 0,滑杆按物理范围停在 1。
 *
 * ── 边界(不许顺手改的)────────────────────────────────────────
 * 「历史里存着的越界标量不改写」是既有的兼容性底线
 * (`question-form-amount-slider.test.tsx`「历史里越界的旧标量照原样念出来」)。
 * 用户自己写下的旧内容 ≠ 模型这一轮的推荐值:前者不动,后者必须服从它自己
 * 声明的 schema。最后一例就是钉这条边界的,防止修过头。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import type { QuestionForm } from '../../../src/artifacts/question-form';

afterEach(cleanup);

/** 复刻工单里那道题:声明 1–5,模型推荐了一个越界的默认值。 */
function polishForm(over: Record<string, unknown> = {}): QuestionForm {
  return {
    id: 'planning',
    title: 'Planning questions',
    questions: [
      {
        id: 'polish',
        label: 'How much detail and polish?',
        type: 'range',
        min: 1,
        max: 5,
        step: 1,
        required: true,
        defaultValue: '0',
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

function mount(form: QuestionForm = polishForm(), over: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  const view = render(
    <QuestionFormView form={form} interactive onSubmit={onSubmit} {...over} />,
  );
  return { ...view, onSubmit };
}

describe('OPEND-2622 · 数值滑块的模型默认值必须服从它自己声明的范围', () => {
  it('低于 min 的默认值收到 min —— 不是原样落成答案', () => {
    const { container } = mount();
    expect(
      numberBox(container).value,
      '数字框念的是模型给的 0,越出了这道题自己声明的 1–5',
    ).toBe('1');
  });

  it('高于 max 的默认值收到 max', () => {
    const { container } = mount(polishForm({ defaultValue: '9' }));
    expect(numberBox(container).value).toBe('5');
  });

  it('数字框和滑杆开局就得是同一个数,不许摆出两份真相', () => {
    const { container } = mount();
    expect(
      numberBox(container).value,
      '数字框念 0、滑杆停在 1 —— 同一道题在屏幕上有两个答案',
    ).toBe(rangeBox(container).value);
  });

  it('从没被碰过就提交,写出去的答案落在声明范围内(工单原状:提交成 0)', () => {
    const { container, onSubmit } = mount();
    // 一次都不动控件,直接提交 —— 工单里是倒计时自动提交,这里是同一份答案状态
    act(() => {
      nextBtn(container).click();
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('- How much detail and polish?: 1'),
      { polish: '1' },
      'submit',
    );
  });

  it('倒计时自动提交走的是同一份答案,同样不许越界', () => {
    vi.useFakeTimers();
    try {
      const { onSubmit } = mount(polishForm(), { autoContinueAfterTimeout: true });
      act(() => {
        vi.advanceTimersByTime(11 * 60 * 1000);
      });
      expect(onSubmit).toHaveBeenCalledWith(
        expect.stringContaining('- How much detail and polish?: 1'),
        { polish: '1' },
        'auto',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('默认值按 step 吸附,和用户敲进去的数走同一套规矩', () => {
    const { container } = mount(
      polishForm({ min: 0, max: 10, step: 5, defaultValue: '7' }),
    );
    expect(numberBox(container).value).toBe('5');
  });

  it('题目是后来才流进来的,同样收进声明范围', () => {
    // 表单是逐题流式到达的:滑杆题在第一帧还不存在,`buildInitialState` 那一趟
    // 照不到它,答案由后面的补种那一步落下。这条路必须和开局那条守同一条规矩。
    const before: QuestionForm = {
      id: 'planning',
      title: 'Planning questions',
      questions: [
        { id: 'audience', label: 'Who is it for?', type: 'text' } as QuestionForm['questions'][number],
      ],
    };
    const after: QuestionForm = {
      ...before,
      questions: [...before.questions, ...polishForm().questions],
    };
    const onSubmit = vi.fn();
    const { container, rerender } = render(
      <QuestionFormView form={before} interactive onSubmit={onSubmit} />,
    );
    rerender(<QuestionFormView form={after} interactive onSubmit={onSubmit} />);
    // 分步态下滑杆题是第二步,先把它翻出来
    const next = nextBtn(container);
    act(() => {
      next.click();
    });
    expect(numberBox(container).value).toBe('1');
  });

  it('边界:用户自己写下的越界旧值仍然照原样念,不被这次修改改写', () => {
    // 兼容性底线 —— 模型这一轮的推荐值要服从 schema,
    // 但历史里已经存下的内容不许为了拿到新样子去动它。
    const onDraftChange = vi.fn();
    const { container } = mount(polishForm(), {
      draftAnswers: { polish: '7' },
      onDraftChange,
    });
    expect(numberBox(container).value, '把兼容性底线一起改掉了').toBe('7');
    expect(rangeBox(container).value).toBe('5');
    expect(onDraftChange).not.toHaveBeenCalled();
  });
});
