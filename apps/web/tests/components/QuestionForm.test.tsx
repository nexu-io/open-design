// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionFormView, parseSubmittedAnswers } from '../../src/components/QuestionForm';
import type { QuestionForm } from '../../src/artifacts/question-form';
import { visualStyleCardsForContext } from '../../src/runtime/visual-style-catalog';
import { VISUAL_STYLE_BATCH_SIZE } from '../../src/runtime/visual-style-deck';

const form: QuestionForm = {
  id: 'discovery',
  title: 'Quick brief',
  questions: [
    {
      id: 'tone',
      label: 'Visual tone (pick up to two)',
      type: 'checkbox',
      options: [
        { label: 'Editorial / magazine', value: 'Editorial / magazine' },
        { label: 'Modern minimal', value: 'Modern minimal' },
        { label: 'Soft gradients', value: 'Soft gradients' },
      ],
      maxSelections: 2,
      required: true,
    },
  ],
};

const voiceForm: QuestionForm = {
  id: 'elevenlabs-voice',
  title: 'Choose an ElevenLabs voice',
  questions: [
    {
      id: 'voice',
      label: 'Voice',
      type: 'select',
      required: true,
      allowCustom: false,
      placeholder: 'Choose a voice',
      help: 'Select a voice description; the answer submits the matching Voice ID.',
      options: [
        { label: 'Rachel — american · female', value: '21m00Tcm4TlvDq8ikWAM' },
        { label: 'Adam — american · male', value: 'pNInz6obpgDQGcFmaJgB' },
      ],
    },
  ],
  submitLabel: 'Use voice',
};

const richForm = {
  id: 'discovery',
  title: 'Quick brief',
  questions: [
    {
      id: 'platform',
      label: 'Primary surface',
      type: 'radio',
      required: true,
      options: [
        { label: 'Responsive', value: 'Responsive' },
        {
          label: 'Mobile (iOS/Android)',
          description: 'Phone-first app prototype',
          value: 'mobile',
        },
        {
          label: 'Desktop web',
          description: 'Browser-first prototype',
          value: 'Desktop web',
        },
      ],
    },
  ],
} as QuestionForm;

const checkboxObjectForm = {
  id: 'discovery',
  title: 'Quick brief',
  questions: [
    {
      id: 'tone',
      label: 'Visual tone',
      type: 'checkbox',
      required: true,
      options: [
        { label: 'Editorial / magazine', value: 'editorial' },
        { label: 'Soft gradients', value: 'soft-gradients' },
        { label: 'Modern minimal', value: 'modern-minimal' },
      ],
    },
  ],
} as QuestionForm;

const selectObjectForm = {
  id: 'discovery',
  title: 'Quick brief',
  questions: [
    {
      id: 'platform',
      label: 'Primary surface',
      type: 'select',
      required: true,
      options: [
        { label: 'Mobile (iOS/Android)', value: 'mobile' },
        { label: 'Desktop web', value: 'desktop-web' },
      ],
    },
  ],
} as QuestionForm;

const steppedForm = {
  id: 'deck-brief',
  title: 'Confirm the deck brief',
  questions: [
    {
      id: 'audience',
      label: 'Who will see this deck?',
      type: 'text',
      required: true,
    },
    {
      id: 'length',
      label: 'How detailed should it be?',
      type: 'radio',
      required: true,
      options: [
        { label: 'Concise · 8 slides', value: '8' },
        { label: 'Standard · 12 slides', value: '12' },
      ],
    },
    {
      id: 'constraints',
      label: 'Anything else to preserve?',
      type: 'textarea',
    },
  ],
} as QuestionForm;

const steppedFileForm = {
  id: 'deck-references',
  title: 'Add deck references',
  questions: [
    {
      id: 'assets',
      label: 'Reference assets',
      type: 'file',
      required: true,
    },
    {
      id: 'notes',
      label: 'Anything else to preserve?',
      type: 'textarea',
    },
  ],
} as QuestionForm;

const optionalFinalFileForm = {
  id: 'deck-reference-upload',
  title: 'Add an optional reference',
  questions: [
    {
      id: 'goal',
      label: 'What should the deck explain?',
      type: 'text',
      required: true,
    },
    {
      id: 'reference',
      label: 'Optional reference asset',
      type: 'file',
    },
  ],
} as QuestionForm;

/**
 * 按文案取一颗选项。
 *
 * 选项已按交付稿改成 `<button class="opt">`(原来是 `<label>` 套一枚真 `<input aria-label>`),
 * `getByLabelText` 于是取不到了 —— 但这些用例要守的行为(点它就选中、选中态可读)一个字没变,
 * 只是入口换成「按文案找那颗按钮」。
 */
/**
 * 按标题取一张视觉方向卡。
 * 卡片也按稿子改成了 `<button class="vopt">`(D52 同一条),`getByLabelText` 取不到了;
 * 要守的行为(点它就选中、选中态与禁用态可读)一个字没变。
 */
function card(title: string): HTMLElement {
  const hit = [...document.querySelectorAll<HTMLElement>('.qf-visual-card')]
    .find((el) => el.getAttribute('title') === title || (el.textContent ?? '').includes(title));
  if (!hit) throw new Error(`没有标题是「${title}」的视觉卡`);
  return hit;
}

function chip(text: string): HTMLElement {
  const hit = [...document.querySelectorAll<HTMLElement>('.qf-chip')]
    .find((el) => (el.textContent ?? '').includes(text));
  if (!hit) throw new Error(`没有文案含「${text}」的选项`);
  return hit;
}

/**
 * 选中的选项。原来数 `input:checked`,现在选中态写在 `aria-checked` 上。
 * 别退回去数 `input` —— 那种查询现在**永远是 0 条**,断言会变成永真(白守)。
 */
const chosen = (root: ParentNode): NodeListOf<Element> =>
  root.querySelectorAll('.qf-chip[aria-checked="true"]');

/**
 * 卡头右上角那条多选计数。
 *
 * 交付稿 PR #7170 把它拆成了 `.count-label` + `.count-value` 两段(「已选」弱、
 * 数字强),所以整条文案**不再落在一个节点上** —— `getByText('2 picked')` 会
 * 直接找不到。这里读整块的 `textContent`:段怎么切是排版的事,断言仍旧盯着
 * 「这条计数念出来是什么」。计数为 0 时整块不渲染,返回 `null`。
 */
const pickedText = (): string | null =>
  document.querySelector('.qf-picked')?.textContent ?? null;

describe('QuestionFormView', () => {
  afterEach(() => cleanup());

  it('updates locked answers when submitted history arrives after the initial render', () => {
    const onSubmit = vi.fn();
    const { container, rerender } = render(
      <QuestionFormView form={form} interactive submittedAnswers={undefined} onSubmit={onSubmit} />,
    );

    expect(chosen(container)).toHaveLength(0);

    rerender(
      <QuestionFormView
        form={form}
        interactive={false}
        submittedAnswers={{ tone: ['Editorial / magazine', 'Modern minimal'] }}
        onSubmit={onSubmit}
      />,
    );

    // 交付稿 #23–#25:回答完收成一条「已确认」陈述,不再把表单锁住置灰。
    // 原意(提交历史到达后要被反映出来)不变,换成在陈述里找那两条答案。
    const answered = container.querySelector('.answered');
    expect(answered, '已回答态应当收成 .answered 陈述').not.toBeNull();
    expect(answered?.textContent).toContain('Editorial / magazine');
    expect(answered?.textContent).toContain('Modern minimal');
    expect(container.querySelector('.qf-chip')).toBeNull();
  });

  it('renders select options as single-choice rows and submits the selected voice id', () => {
    const onSubmit = vi.fn();
    const { container, rerender } = render(
      <QuestionFormView form={voiceForm} interactive submittedAnswers={undefined} onSubmit={onSubmit} />,
    );

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Rachel — american · female' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Adam — american · male' })).toBeTruthy();
    expect(screen.queryByTestId('qf-input')).toBeNull();

    fireEvent.click(chip('Rachel — american · female'));
    fireEvent.click(screen.getByRole('button', { name: 'Use voice' }));

    expect(onSubmit).toHaveBeenCalledWith(
      '[form answers — elevenlabs-voice]\n- Voice: Rachel — american · female [value: 21m00Tcm4TlvDq8ikWAM]',
      { voice: '21m00Tcm4TlvDq8ikWAM' },
      'submit',
    );

    rerender(
      <QuestionFormView
        form={voiceForm}
        interactive={false}
        submittedAnswers={{ voice: 'Rachel — american · female' }}
        onSubmit={onSubmit}
      />,
    );

    // 同上:已回答态不再渲染下拉,收成陈述 —— 断言选中的那个人声出现在陈述里
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(document.querySelector('.answered')?.textContent).toContain(
      'Rachel — american · female',
    );
  });

  it('parses submitted object-option values from readable answer text', () => {
    expect(
      parseSubmittedAnswers(
        richForm,
        [
          '[form answers - discovery]',
          '- Primary surface: Mobile (iOS/Android) [value: mobile]',
        ].join('\n'),
      ),
    ).toEqual({ platform: 'mobile' });
  });

  it('restores direction values while ignoring Host foundation metadata', () => {
    const directionForm: QuestionForm = {
      id: 'direction',
      title: 'Choose direction',
      questions: [{
        id: 'direction',
        label: 'Visual direction',
        type: 'direction-cards',
      }],
    };
    expect(parseSubmittedAnswers(
      directionForm,
      '[form answers — direction]\n- Visual direction: Quiet SaaS [foundation: modern-minimal; guidance: Calm hierarchy.] [value: prototype-quiet-saas]',
    )).toEqual({ direction: 'prototype-quiet-saas' });
    expect(parseSubmittedAnswers(
      directionForm,
      '[form answers — direction]\n- Visual direction: Quiet SaaS [value: prototype-quiet-saas; foundation: modern-minimal; guidance: Calm hierarchy.]',
    )).toEqual({ direction: 'prototype-quiet-saas' });
  });

  it('renders radio object options and submits the readable label with stable value', () => {
    const onSubmit = vi.fn();
    render(<QuestionFormView form={richForm} interactive onSubmit={onSubmit} />);

    expect(screen.getByText('Responsive')).toBeTruthy();
    expect(screen.getByText('Mobile (iOS/Android)')).toBeTruthy();
    expect(screen.getByText('Phone-first app prototype')).toBeTruthy();
    expect(screen.getByText('Desktop web')).toBeTruthy();

    fireEvent.click(chip('Mobile (iOS/Android)'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toContain(
      '- Primary surface: Mobile (iOS/Android) [value: mobile]',
    );
    expect(onSubmit.mock.calls[0]?.[1]).toEqual({ platform: 'mobile' });
  });

  it('lets users override generated radio options with a custom answer', () => {
    const onSubmit = vi.fn();
    render(<QuestionFormView form={richForm} interactive onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Write your own' }));
    fireEvent.change(screen.getByTestId('qf-input'), {
      target: { value: 'Wearable kiosk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('- Primary surface: Wearable kiosk'),
      { platform: 'Wearable kiosk' },
      'submit',
    );
  });

  it('exposes the Other escape hatch as a focusable button for keyboard users', () => {
    // Second-round reviewer finding (#5603): the chip used to be a
    // display:none checkbox inside a label — unreachable by Tab, making the
    // custom-answer field mouse-only. A real button restores keyboard access.
    const { container } = render(
      <QuestionFormView form={richForm} interactive onSubmit={vi.fn()} />,
    );

    const own = screen.getByRole('button', { name: 'Write your own' });
    expect(own.tagName).toBe('BUTTON');
    expect(own.getAttribute('aria-pressed')).toBe('false');
    own.focus();
    expect(document.activeElement).toBe(own);

    fireEvent.click(own);
    // 展开后这一项按稿子换成了 `<div class="opt mod-own is-open">`,原来那颗按钮已脱离文档,
    // 必须重新取 —— 拿旧引用问 aria-pressed 会永远读到 false(白守)。
    expect(screen.getByLabelText('Write your own').getAttribute('aria-pressed')).toBe('true');
    // 交付稿 `.opt.mod-own`:输入框**内嵌在这一项里**,不再是下面单独一块折叠容器
    expect(container.querySelector('.qf-custom-collapsible')).toBeNull();
    expect(container.querySelector('.qf-chip-other textarea')).not.toBeNull();
  });

  it('keeps the custom input collapsed behind the Other chip until clicked', () => {
    const { container } = render(
      <QuestionFormView form={richForm} interactive onSubmit={vi.fn()} />,
    );

    // 原意不变:点开之前不给填。稿子把它做成「选中这一项才出现输入框」,
    // 而不是「一直在那儿但禁用」—— 所以判据从 disabled 换成在不在。
    expect(screen.queryByTestId('qf-input')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Write your own' }));

    const input = screen.getByTestId('qf-input') as HTMLTextAreaElement;
    expect(input.disabled).toBe(false);
    expect(container.querySelector('.qf-chip-other')?.contains(input)).toBe(true);
  });

  it('deselects fixed options when Other opens and collapses when one is picked', () => {
    const { container } = render(
      <QuestionFormView form={richForm} interactive onSubmit={vi.fn()} />,
    );

    fireEvent.click(chip('Mobile (iOS/Android)'));
    fireEvent.click(screen.getByRole('button', { name: 'Write your own' }));
    // Opening "Other" on a single-choice question means "none of these".
    expect(chosen(container)).toHaveLength(0);

    fireEvent.click(chip('Desktop web'));
    // 原意不变:选回固定项,还空着的自填框收起来 —— 现在的形态是「输入框消失」
    expect(screen.queryByTestId('qf-input')).toBeNull();
  });

  it('shows the custom input expanded for a submitted custom answer', () => {
    const { container } = render(
      <QuestionFormView
        form={richForm}
        interactive={false}
        submittedAnswers={{ platform: 'Wearable kiosk' }}
        onSubmit={vi.fn()}
      />,
    );

    // 已回答态收成陈述:自己填的那句话要照样看得见,只是不再是一个可编辑的输入框
    expect(container.querySelector('.qf-custom-collapsible')).toBeNull();
    expect(screen.queryByTestId('qf-input')).toBeNull();
    expect(container.querySelector('.answered')?.textContent).toContain('Wearable kiosk');
  });

  it('reveals the custom input from the select own-choice row', () => {
    const { container } = render(
      <QuestionFormView form={selectObjectForm} interactive onSubmit={vi.fn()} />,
    );

    expect(container.querySelector('select')).toBeNull();
    expect(
      screen.queryByTestId('qf-input'),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Write your own' }));

    expect(screen.getByTestId('qf-input')).toBeTruthy();
  });

  it('restores legacy select drafts that stored an option label', () => {
    const { container } = render(
      <QuestionFormView
        form={selectObjectForm}
        interactive
        draftAnswers={{ platform: 'Mobile (iOS/Android)' }}
        onSubmit={vi.fn()}
      />,
    );

    expect(container.querySelector('select')).toBeNull();
    expect(chip('Mobile (iOS/Android)').getAttribute('aria-checked')).toBe('true');
    expect(chosen(container)).toHaveLength(1);
  });

  it('restores legacy select drafts with a custom value in the own-choice row', () => {
    const { container } = render(
      <QuestionFormView
        form={selectObjectForm}
        interactive
        draftAnswers={{ platform: 'Wearable kiosk' }}
        onSubmit={vi.fn()}
      />,
    );

    expect(container.querySelector('select')).toBeNull();
    expect((screen.getByTestId('qf-input') as HTMLTextAreaElement).value).toBe(
      'Wearable kiosk',
    );
    expect(container.querySelector('.qf-chip-other.qf-chip-on')).not.toBeNull();
  });

  it('combines checkbox presets with custom user entries', () => {
    const onSubmit = vi.fn();
    render(<QuestionFormView form={checkboxObjectForm} interactive onSubmit={onSubmit} />);

    fireEvent.click(chip('Editorial / magazine'));
    fireEvent.click(screen.getByRole('button', { name: 'Write your own' }));
    fireEvent.change(screen.getByTestId('qf-input'), {
      target: { value: 'Neo-museum, Field notebook' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(onSubmit.mock.calls[0]?.[0]).toContain('Editorial / magazine [value: editorial]');
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Neo-museum');
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Field notebook');
    expect(onSubmit.mock.calls[0]?.[1]).toEqual({
      tone: ['editorial', 'Neo-museum', 'Field notebook'],
    });
  });

  it('counts the visible own-answer row once while it opens, clears, and closes', () => {
    render(
      <QuestionFormView form={checkboxObjectForm} interactive onSubmit={vi.fn()} />,
    );

    expect(pickedText()).toBeNull();

    fireEvent.click(chip('Editorial / magazine'));
    expect(pickedText()).toBe('1 picked');

    fireEvent.click(screen.getByRole('button', { name: 'Write your own' }));
    expect(pickedText()).toBe('2 picked');

    fireEvent.change(screen.getByTestId('qf-input'), {
      target: { value: 'Neo-museum, Field notebook' },
    });
    expect(pickedText()).toBe('2 picked');

    fireEvent.change(screen.getByTestId('qf-input'), { target: { value: '' } });
    expect(pickedText()).toBe('2 picked');

    fireEvent.click(screen.getByLabelText('Write your own'));
    expect(screen.queryByTestId('qf-input')).toBeNull();
    expect(pickedText()).toBe('1 picked');
  });

  it('restores one picked own-answer row from a checkbox draft', () => {
    render(
      <QuestionFormView
        form={checkboxObjectForm}
        interactive
        draftAnswers={{ tone: ['editorial', 'Neo-museum', 'Field notebook'] }}
        onSubmit={vi.fn()}
      />,
    );

    expect(pickedText()).toBe('2 picked');
    expect((screen.getByTestId('qf-input') as HTMLTextAreaElement).value).toBe(
      'Neo-museum, Field notebook',
    );
  });

  it('replays one picked own-answer row from submitted checkbox history', () => {
    render(
      <QuestionFormView
        form={checkboxObjectForm}
        interactive
        submittedAnswers={{ tone: ['editorial', 'Neo-museum', 'Field notebook'] }}
        onSubmit={vi.fn()}
      />,
    );

    expect(pickedText()).toBe('2 picked');
    expect((screen.getByTestId('qf-input') as HTMLTextAreaElement).value).toBe(
      'Neo-museum, Field notebook',
    );
  });

  it('can hide custom choice input for exact machine-id pickers', () => {
    const exactForm = {
      ...selectObjectForm,
      questions: [{ ...selectObjectForm.questions[0], allowCustom: false }],
    } as QuestionForm;

    render(<QuestionFormView form={exactForm} interactive onSubmit={vi.fn()} />);

    expect(screen.queryByTestId('qf-input')).toBeNull();
    expect(screen.queryByLabelText('Write your own')).toBeNull();
  });

  it('submits required checkbox object options with stable values', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <QuestionFormView form={checkboxObjectForm} interactive onSubmit={onSubmit} />,
    );

    const submit = screen.getByRole('button', { name: 'Next' });
    // Required field unanswered → submit stays disabled (regression guard:
    // the Questions-tab refactor must not make required fields optional on the
    // standard submit path).
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(chip('Editorial / magazine'));
    fireEvent.click(chip('Soft gradients'));

    expect(chosen(container)).toHaveLength(2);
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Editorial / magazine [value: editorial]');
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Soft gradients [value: soft-gradients]');
    expect(onSubmit.mock.calls[0]?.[1]).toEqual({
      tone: ['editorial', 'soft-gradients'],
    });
  });

  it('uses a readable required marker instead of a red asterisk', () => {
    const mixedForm = {
      id: 'discovery',
      title: 'Quick brief',
      questions: [
        { id: 'taskType', label: 'Task type', type: 'text', required: true },
        { id: 'notes', label: 'Notes', type: 'text' },
      ],
    } as QuestionForm;

    const onSubmit = vi.fn();
    const { container } = render(
      <QuestionFormView form={mixedForm} interactive hideInternalSubmit onSubmit={onSubmit} />,
    );

    // 稿子的问题行没有外层包裹(`.cbody > .q` 直接就是问题),`.qf-field` 已经拿掉;
    // 这条用例要守的是「必填角标是看得懂的词、不是红星号」,改按标签行取。
    const labels = container.querySelectorAll('.qf-label');
    expect(labels[0]?.querySelector('.qf-required')?.textContent).toBe('required');
    expect(labels[1]?.querySelector('.qf-required')).toBeNull();
  });

  it('submits required select object options with stable values', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <QuestionFormView form={selectObjectForm} interactive onSubmit={onSubmit} />,
    );

    const submit = screen.getByRole('button', { name: 'Next' });
    // Required select unanswered → submit stays disabled (regression guard).
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    expect(container.querySelector('select')).toBeNull();
    fireEvent.click(chip('Mobile (iOS/Android)'));

    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toContain(
      '- Primary surface: Mobile (iOS/Android) [value: mobile]',
    );
    expect(onSubmit.mock.calls[0]?.[1]).toEqual({ platform: 'mobile' });
  });

  it('adopts a default that streams in after the question was revealed', () => {
    // Red spec for the streamed-prefill race: the partial-JSON parser reveals
    // a question as soon as its label lands, but models are free to emit the
    // `default` key AFTER `options` (observed in production run
    // fca86faa-86ce-4dc1-9ff5-047c2dd15b96) — so the question first mounts
    // with no defaultValue and the recommendation only appears on a later
    // parse pass. The late default must still prefill untouched questions.
    const partial = {
      id: 'discovery',
      title: '快速需求确认',
      questions: [
        {
          id: 'purpose',
          label: '海报用途是什么？',
          type: 'radio',
          required: true,
          options: [
            { label: '诊所门口/室内展示', value: 'display' },
            { label: '线上社交媒体推广', value: 'social' },
          ],
        },
        {
          id: 'content',
          label: '海报需要包含哪些信息？',
          type: 'checkbox',
          options: [
            { label: '诊所名称和Logo', value: 'branding' },
            { label: '服务项目', value: 'services' },
            { label: '联系方式和地址', value: 'contact' },
          ],
        },
      ],
    } as QuestionForm;
    const complete = {
      ...partial,
      questions: [
        { ...partial.questions[0], defaultValue: 'display' },
        { ...partial.questions[1], defaultValue: ['branding', 'contact'] },
      ],
    } as QuestionForm;

    const { container, rerender } = render(
      <QuestionFormView form={partial} interactive onSubmit={vi.fn()} />,
    );
    expect(chosen(container)).toHaveLength(0);

    rerender(<QuestionFormView form={complete} interactive onSubmit={vi.fn()} />);

    // 选项已经是稿子的 `<button class="opt">`,不再带 value 属性;按文案取那一项。
    expect(chip('诊所门口/室内展示').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(chosen(container)).toHaveLength(2);
  });

  it('never lets a late default clobber an answer the user touched', () => {
    // Companion guard for the streamed-prefill fix: "untouched" must mean the
    // user never interacted, not "currently empty". Checking a box and then
    // unchecking it leaves the empty value by intent — a default arriving
    // after that must not resurrect the recommendation.
    const partial = {
      id: 'discovery',
      title: 'Quick brief',
      questions: [
        {
          id: 'tone',
          label: 'Visual tone',
          type: 'checkbox',
          options: [
            { label: 'Editorial', value: 'editorial' },
            { label: 'Minimal', value: 'minimal' },
          ],
        },
      ],
    } as QuestionForm;
    const complete = {
      ...partial,
      questions: [{ ...partial.questions[0], defaultValue: ['minimal'] }],
    } as QuestionForm;

    const { container, rerender } = render(
      <QuestionFormView form={partial} interactive onSubmit={vi.fn()} />,
    );
    fireEvent.click(chip('Editorial'));
    fireEvent.click(chip('Editorial'));
    expect(chosen(container)).toHaveLength(0);

    rerender(<QuestionFormView form={complete} interactive onSubmit={vi.fn()} />);

    expect(chosen(container)).toHaveLength(0);
  });

  it('renders host strings in the form language, not the UI locale', () => {
    // A Chinese form in an English UI must not mix scripts: the model
    // declares `lang` alongside its localized labels, and the host's own
    // in-card strings (the Other chip, custom-answer copy) follow it.
    const zhForm = {
      ...richForm,
      lang: 'zh-CN',
    } as QuestionForm;

    render(<QuestionFormView form={zhForm} interactive onSubmit={vi.fn()} />);

    // 原意不变:卡内的宿主文案跟着表单声明的语言走,不跟 UI locale。
    // 文案本身按交付稿从「其他」改成了「自己填」。
    const own = screen.getByRole('button', { name: '自己填' });
    expect(own).toBeTruthy();
    expect(own.getAttribute('data-chat-scroll-anchor')).toBe('question-own:platform');
    expect(own.getAttribute('data-chat-preserve-scroll-anchor')).toBe(
      'question-own:platform',
    );
    expect(screen.queryByRole('button', { name: 'Write your own' })).toBeNull();
  });

  it('submits native defaults for required color and defaultless range controls', () => {
    const nativeDefaultsForm = {
      id: 'native-defaults',
      title: 'Native defaults',
      questions: [
        { id: 'accent', label: 'Accent color', type: 'color', required: true },
        { id: 'weight', label: 'Weight', type: 'range', required: true, max: 10 },
      ],
    } as QuestionForm;
    const onSubmit = vi.fn();
    render(<QuestionFormView form={nativeDefaultsForm} interactive onSubmit={onSubmit} />);

    const next = screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    fireEvent.click(next);

    const submit = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith(
      [
        '[form answers — native-defaults]',
        '- Accent color: #000000',
        '- Weight: 0',
      ].join('\n'),
      { accent: '#000000', weight: '0' },
      'submit',
    );
  });

  it('offers Skip — you decide when a single-question form contains required questions', () => {
    const onSubmit = vi.fn();
    render(<QuestionFormView form={richForm} interactive onSubmit={onSubmit} />);

    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip — you decide' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('- Primary surface: (skipped)'),
      {},
      'skip',
    );
  });

  it('keeps Skip — you decide for a form containing only optional questions', () => {
    const onSubmit = vi.fn();
    const optionalForm = {
      id: 'optional',
      title: 'Optional context',
      questions: [{ id: 'notes', label: 'Anything else?', type: 'text' }],
    } as QuestionForm;
    render(<QuestionFormView form={optionalForm} interactive onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Skip — you decide' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('[form answers — optional]'),
      {},
      'skip',
    );
  });

  it('submits selected file objects without persisting file names as drafts', () => {
    const fileForm = {
      id: 'references',
      title: 'References',
      questions: [
        {
          id: 'assets',
          label: 'Reference assets',
          type: 'file',
          multiple: true,
          accept: 'image/*,.pdf',
          required: true,
        },
      ],
    } as QuestionForm;
    const onSubmit = vi.fn();
    const onDraftChange = vi.fn();
    const { container } = render(
      <QuestionFormView
        form={fileForm}
        interactive
        onSubmit={onSubmit}
        onDraftChange={onDraftChange}
      />,
    );

    const submit = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!input) throw new Error('expected file input');
    const first = new File(['a'], 'mood.png', { type: 'image/png' });
    const second = new File(['b'], 'brief.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [first, second] } });

    expect(onDraftChange).toHaveBeenLastCalledWith({});
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith(
      '[form answers — references]\n- Reference assets: mood.png, brief.pdf',
      { assets: ['mood.png', 'brief.pdf'] },
      'submit',
      [{ questionId: 'assets', questionLabel: 'Reference assets', files: [first, second] }],
    );
  });

  it('auto-continues unanswered required questions as skipped', () => {
    vi.useFakeTimers();
    try {
      const optionalSubmit = vi.fn();
      const optionalForm = {
        id: 'optional-auto-continue',
        title: 'Optional context',
        questions: [{ id: 'notes', label: 'Anything else?', type: 'text' }],
      } as QuestionForm;
      const { unmount } = render(
        <QuestionFormView
          form={optionalForm}
          interactive
          autoContinueAfterTimeout
          onSubmit={optionalSubmit}
        />,
      );

      expect(screen.getByLabelText(/Auto-continues when the timer ends 10:00/)).toBeTruthy();
      act(() => vi.advanceTimersByTime(10 * 60 * 1000));
      expect(optionalSubmit).toHaveBeenCalledWith(
        expect.stringContaining('[form answers — optional-auto-continue]'),
        { notes: '' },
        'auto',
      );
      unmount();

      const requiredSubmit = vi.fn();
      render(
        <QuestionFormView
          form={richForm}
          interactive
          autoContinueAfterTimeout
          onSubmit={requiredSubmit}
        />,
      );
      expect(screen.getByLabelText(/Auto-continues when the timer ends 10:00/)).toBeTruthy();
      act(() => vi.advanceTimersByTime(10 * 60 * 1000));
      expect(requiredSubmit).toHaveBeenCalledWith(
        expect.stringContaining('- Primary surface: (skipped)'),
        { platform: '' },
        'auto',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows multi-question forms one step at a time and preserves answers', () => {
    const onSubmit = vi.fn();
    const onInteraction = vi.fn();
    render(
      <QuestionFormView
        form={steppedForm}
        interactive
        autoContinueAfterTimeout
        onInteraction={onInteraction}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('1/3').closest('.question-form-head')).toBeTruthy();
    expect(screen.getByLabelText(/Auto-continues when the timer ends 10:00/)).toBeTruthy();
    expect(screen.getByText('Who will see this deck?')).toBeTruthy();
    expect(screen.queryByText('How detailed should it be?')).toBeNull();
    const nextStep = screen.getByRole('button', { name: 'Next step' }) as HTMLButtonElement;
    expect(nextStep.disabled).toBe(true);
    expect(nextStep.title).toBe('Fill in the required fields first');
    expect(nextStep.dataset.chatPreserveScrollAnchor).toBe('question-footer');
    expect(
      nextStep.closest('.question-form-foot')?.getAttribute('data-chat-scroll-anchor'),
    ).toBe('question-footer');
    // The delivered first-step footer is Skip | spacer | Next. A disabled
    // Back action here both invents a fourth state and looks actionable once
    // the footer's ghost-button styling removes disabled chrome.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(
      Array.from(document.querySelectorAll('.question-form-foot button')).map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(['Skip', 'Next step']);
    expect(screen.getByText('required')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Leadership and product team' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));

    expect(screen.getByText('2/3')).toBeTruthy();
    expect(screen.queryByText('Who will see this deck?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Back' }).getAttribute(
        'data-chat-preserve-scroll-anchor',
      ),
    ).toBe('question-footer');
    expect(
      Array.from(document.querySelectorAll('.question-form-foot button')).map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(['Skip', 'Back', 'Next step']);
    fireEvent.click(chip('Standard · 12 slides'));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onInteraction).toHaveBeenCalledWith({
      element: 'step_back',
      questionId: 'length',
      stepIndex: 2,
      stepCount: 3,
    });

    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe(
      'Leadership and product team',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(chip('Standard · 12 slides').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));

    expect(screen.getByText('3/3')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Include speaker notes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('- Who will see this deck?: Leadership and product team'),
      {
        audience: 'Leadership and product team',
        length: '12',
        constraints: 'Include speaker notes',
      },
      'submit',
    );
  });

  it('offers Skip on every step and completes after skipping a required answer', () => {
    const onSubmit = vi.fn();
    const onInteraction = vi.fn();
    render(
      <QuestionFormView
        form={steppedForm}
        interactive
        onInteraction={onInteraction}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onInteraction).toHaveBeenCalledWith({
      element: 'step_skip',
      questionId: 'audience',
      stepIndex: 1,
      stepCount: 3,
    });

    expect(screen.getByText('2/3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
    fireEvent.click(chip('Concise · 8 slides'));
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));

    expect(screen.getByText('3/3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('- Who will see this deck?: (skipped)'),
      {
        audience: '',
        length: '8',
        constraints: '',
      },
      'submit',
    );
  });

  it('preserves earlier file answers when skipping the final optional step', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <QuestionFormView form={steppedFileForm} interactive onSubmit={onSubmit} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!input) throw new Error('expected file input');
    const reference = new File(['image'], 'mood.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [reference] } });
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(onSubmit).toHaveBeenCalledWith(
      [
        '[form answers — deck-references]',
        '- Reference assets: mood.png',
        '- Anything else to preserve?: (skipped)',
      ].join('\n'),
      { assets: 'mood.png', notes: '' },
      'skip',
      [{ questionId: 'assets', questionLabel: 'Reference assets', files: [reference] }],
    );
  });

  it('does not submit files selected on a skipped final optional step', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <QuestionFormView form={optionalFinalFileForm} interactive onSubmit={onSubmit} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Product launch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!input) throw new Error('expected file input');
    fireEvent.change(input, {
      target: { files: [new File(['image'], 'draft.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(onSubmit).toHaveBeenCalledWith(
      [
        '[form answers — deck-reference-upload]',
        '- What should the deck explain?: Product launch',
        '- Optional reference asset: (skipped)',
      ].join('\n'),
      { goal: 'Product launch', reference: '' },
      'skip',
    );
  });

  it('renders artifact-aware visual tone cards and honors checkbox selection limits', () => {
    const onSubmit = vi.fn();
    render(
      <QuestionFormView
        form={{
          ...checkboxObjectForm,
          questions: [{ ...checkboxObjectForm.questions[0]!, maxSelections: 2 }],
        }}
        interactive
        visualStyleContext="deck"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('Editorial narrative')).toBeTruthy();
    expect(screen.getByText('Product keynote')).toBeTruthy();
    expect(screen.getByText('Bold storytelling')).toBeTruthy();
    expect(
      (screen.getByAltText(
        'Editorial narrative deck style preview.',
      ) as HTMLImageElement).getAttribute('src'),
    ).toBe(
      visualStyleCardsForContext('deck').find(
        (style) => style.value === 'deck-editorial-narrative',
      )?.preview.thumbnailSrc,
    );
    expect(
      (screen.getByAltText(
        'Product keynote deck style preview.',
      ) as HTMLImageElement).getAttribute('src'),
    ).toBe(
      visualStyleCardsForContext('deck').find(
        (style) => style.value === 'deck-product-keynote',
      )?.preview.thumbnailSrc,
    );
    expect(document.querySelector('[data-artifact-type="deck"]')).toBeTruthy();

    fireEvent.click(card('Editorial narrative'));
    fireEvent.click(card('Bold storytelling'));
    expect(pickedText()).toBe('2 picked');
    expect((card('Product keynote') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(onSubmit.mock.calls[0]?.[1]).toEqual({
      tone: ['deck-editorial-narrative', 'deck-bold-storytelling'],
    });
    expect(onSubmit.mock.calls[0]?.[0]).toContain(
      'Editorial narrative [value: deck-editorial-narrative]',
    );
  });

  it('normalizes legacy visual tone defaults to the submitted card IDs', () => {
    const onSubmit = vi.fn();
    render(
      <QuestionFormView
        form={{
          ...checkboxObjectForm,
          questions: [
            {
              ...checkboxObjectForm.questions[0]!,
              defaultValue: ['editorial', 'luxury'],
            },
          ],
        }}
        interactive
        visualStyleContext="deck"
        onSubmit={onSubmit}
      />,
    );

    expect(card('Editorial narrative').getAttribute('aria-checked')).toBe('true');
    expect(card('Premium pitch').getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining(
        'Editorial narrative [value: deck-editorial-narrative], Premium pitch [value: deck-premium-pitch]',
      ),
      { tone: ['deck-editorial-narrative', 'deck-premium-pitch'] },
      'submit',
    );
  });

  it('renders restored legacy visual tone answers on their matching cards', () => {
    render(
      <QuestionFormView
        form={checkboxObjectForm}
        interactive
        submittedAnswers={{ tone: ['editorial', 'luxury'] }}
        visualStyleContext="deck"
      />,
    );

    expect(card('Editorial narrative').getAttribute('aria-checked')).toBe('true');
    expect(card('Premium pitch').getAttribute('aria-checked')).toBe('true');
    expect(pickedText()).toBe('2 picked');
  });

  it('replays visual catalog and custom history as two picked rows', () => {
    render(
      <QuestionFormView
        form={checkboxObjectForm}
        interactive
        submittedAnswers={{
          tone: ['deck-editorial-narrative', 'Warm Japanese editorial', 'Cinematic grain'],
        }}
        visualStyleContext="deck"
      />,
    );

    expect(card('Editorial narrative').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Warm Japanese editorial')).toBeTruthy();
    expect(pickedText()).toBe('2 picked');
  });

  it('summarizes a submitted catalog-backed direction card with its title and preview', () => {
    const form = {
      id: 'direction',
      title: 'Choose a visual direction',
      questions: [
        {
          id: 'direction',
          label: 'Visual direction',
          type: 'direction-cards',
          required: true,
          options: [{ label: 'Model-authored placeholder', value: 'placeholder' }],
          cards: [{ id: 'placeholder', label: 'Model-authored placeholder' }],
        },
      ],
    } as QuestionForm;

    render(
      <QuestionFormView
        form={form}
        interactive={false}
        submittedAnswers={{ direction: 'prototype-expressive-consumer' }}
        visualStyleContext="prototype"
      />,
    );

    expect(screen.getByText('Expressive consumer')).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Visual direction: Expressive consumer' }),
    ).toHaveAttribute(
      'src',
      'https://repo-assets.open-design.ai/style-catalog/v1/prototype-expressive-consumer-v1.webp',
    );
    expect(screen.queryByText('prototype-expressive-consumer')).toBeNull();
  });

  it('keeps the visual picker compact, shuffles unselected styles, and expands on demand', () => {
    const galleryForm = {
      id: 'discovery',
      title: 'Choose a visual direction',
      questions: [
        {
          id: 'tone',
          label: 'Visual direction',
          type: 'radio',
          required: true,
          allowCustom: true,
          options: [
            { label: 'Editorial / magazine', value: 'editorial' },
            { label: 'Modern minimal', value: 'minimal' },
            { label: 'Playful / illustrative', value: 'playful' },
            { label: 'Tech / utility', value: 'utility' },
            { label: 'Luxury / refined', value: 'luxury' },
            { label: 'Human / approachable', value: 'human' },
          ],
        },
      ],
    } as QuestionForm;
    const onInteraction = vi.fn();
    const onSubmit = vi.fn();
    const { container } = render(
      <QuestionFormView
        form={galleryForm}
        interactive
        visualStyleContext="deck"
        onInteraction={onInteraction}
        onSubmit={onSubmit}
      />,
    );

    // 卡片按稿子改成了 `<button class="vopt">`(D52),标题在 `title` 上,不再有隐藏 input
    const visibleLabels = () =>
      Array.from(container.querySelectorAll<HTMLElement>('.qf-visual-card')).map(
        (el) => el.getAttribute('title'),
      );
    /*
     * 一沓装的是【这一批的 6 张】(2026-08-27 产品口径:「换一批时,顺序从 22 个里
     * 每次挑 6 个出来」)。这一条**推翻**了 2026-08-26 那次「整份目录进一沓」的裁决 ——
     * 推翻的理由是取消不了选择:整份目录进一沓时,「换一批」把整个数组转过去,
     * 选中的那张会转到看不见的位置,而叠放态只有最前面那张能点。
     * 逐条见 `tests/components/QuestionForm.deck-batch.test.tsx`。
     *
     * 「+21」那颗按钮仍然不在:它是**分页时代**的溢出面,和这里的一批 6 张无关 ——
     * 稿子里根本没有这颗按钮,是我们照搬「一页 4 张」才逼出来的。
     */
    const total = visualStyleCardsForContext('deck').length;
    expect(total).toBeGreaterThan(VISUAL_STYLE_BATCH_SIZE);
    const firstPage = visibleLabels();
    expect(firstPage).toHaveLength(VISUAL_STYLE_BATCH_SIZE);
    expect(screen.queryByTestId('qf-input')).toBeNull();
    expect(screen.queryByText('+21')).toBeNull();
    /* 稿子 `729fa43ce7` 把底栏最左那颗从「换一批」换成了「跳过」,「换一批」挪到了
       预览区顶栏(`.qf-visual-bar`,排在网格切换左边)—— 见 W75。 */
    expect(
      Array.from(container.querySelectorAll('.qf-visual-foot button')).map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(['Skip', 'Random', 'Next']);
    expect(
      Array.from(container.querySelectorAll('.qf-visual-bar button')).map((button) =>
        button.getAttribute('data-action'),
      ),
    ).toEqual(['reshuffle', 'toggle-view']);

    // 「换一批」现在是预览区顶栏里排在网格切换左边的那颗(稿子 `.visual-refresh`)。
    fireEvent.click(container.querySelector('[data-action="reshuffle"]')!);
    expect(onInteraction).toHaveBeenCalledWith({
      element: 'visual_style_refresh',
      questionId: 'tone',
      styleContext: 'deck',
    });
    // 「换一批」换的是这 6 张:张数不变,人全换了
    expect(visibleLabels()).toHaveLength(VISUAL_STYLE_BATCH_SIZE);
    expect(visibleLabels()).not.toEqual(firstPage);

    /*
     * 「View all」那颗按钮已随分页一起退场;右上角那枚网格切换
     * (交付稿 #21 / #22 的 `.vbar > .vswitch`,`aria-label="铺成网格"`)负责铺开。
     * 它铺的是【这次的 6 个】,不是整份目录 —— 2026-08-27 产品口径:
     * 「点击右上角展开成列表按钮时,只展开这次的 6 个」。
     * 要看目录里别的,就再点一次「换一批」。
     * B53 收敛在这里:稿子里根本没有画廊弹窗,所以那一段整个退场,见下面那条 `[B53]`。
     */
    const inFan = visibleLabels();
    fireEvent.click(container.querySelector('[data-action="toggle-view"]')!);
    expect(container.querySelector('.qf-visual-picker')?.getAttribute('data-view')).toBe('grid');
    expect(container.querySelectorAll('.qf-visual-stack .qf-visual-card'))
      .toHaveLength(VISUAL_STYLE_BATCH_SIZE);
    // 「6 张」不够 —— 必须是【这次的】那 6 张,顺序也一致
    expect(visibleLabels()).toEqual(inFan);
    // 每一张都是目录里真实的一张,且都带真预览图
    const catalogTitles = visualStyleCardsForContext('deck').map((c) => c.title);
    expect(visibleLabels().every((label) => catalogTitles.includes(label!))).toBe(true);
    expect(container.querySelectorAll('img.qf-visual-preview-image'))
      .toHaveLength(VISUAL_STYLE_BATCH_SIZE);
    fireEvent.click(container.querySelector('[data-action="toggle-view"]')!);

  });

  /*
   * B53 —— 原来停用的那条钉的是「画廊弹窗:自定义输入、分类页签、从弹窗里选一张」。
   * 重新开启时改成钉**收敛后的形态**,理由逐条列在这里,免得下一个人以为覆盖被偷走了:
   *
   * 逐格核对交付稿 `docs/design/chat-matrix/matrix-82.html` 的 #21 / #22(组件 5-6 / 5-7)：
   *  · 底栏只有三个动作 —— `换一批` / `随机` / `下一步`(#21 里「下一步」是 `disabled`)。
   *    既没有「查看全部」,也没有「+N」,更没有第四颗按钮。
   *  · 我记成的那个「撑开」不在底栏,是选项区右上角 `.vbar > .vswitch`
   *    (`aria-label="铺成网格"`),它把 `.opts.mod-visual` 的 `data-view` 在
   *    `fan` / `grid` 之间切 —— **内联**,不是弹窗。产品里就是 `[data-action="toggle-view"]`。
   *  · 全稿 84 格里唯一的 `role="dialog"` 是「联系支持」;视觉方向这两格没有弹窗,
   *    整份稿子也搜不到分类页签(商务 / 编辑 / 创意 / 极简)这四个词。
   *
   * 也就是说,那个弹窗是**分页时代的溢出面**:老实现的入口是卡片条末尾的
   * `+N`(`.qf-visual-more`,`aria-label` 走 `recentProjects.viewAll` → 「View all」),
   * 2026-08-26「整份目录进一沓」的裁决把分页撤掉,`+N` 跟着退场,溢出面也就没有存在理由了。
   * 「看全部」这件事(`chat-panel-feedback.md` §C:「不能因为稿子是 4 张就不做看全部」)
   * 现在由右上角那枚网格切换承担 —— 一次铺开整份目录,比弹窗里再分五个页签更直接。
   *
   * 所以这条测试钉三件事:自定义答案仍看得见但**不再是一扇门**、点它**不弹窗也不出页签**、
   * 「看全部」在内联网格里真的能挑到并提交。
   */
  it('[B53] retires the gallery dialog: the catalog is picked inline and nothing opens a modal', () => {
    const onInteraction = vi.fn();
    const onSubmit = vi.fn();
    const { container } = render(
      <QuestionFormView
        form={{
          id: 'discovery',
          title: 'Choose a visual direction',
          questions: [{
            id: 'tone', label: 'Visual direction', type: 'radio', required: true, allowCustom: true,
            /* 目录里没有这个值 —— `canonicalizeQuestionValue` 原样留着,于是它成为
               `customValue`。这是产品里自定义答案**唯一还够得着的来路**:模型给的
               `defaultValue`,或上一轮存下来的草稿。 */
            defaultValue: 'Warm Japanese editorial',
            options: [{ label: 'Editorial / magazine', value: 'editorial' }],
          }],
        } as QuestionForm}
        interactive
        visualStyleContext="deck"
        onInteraction={onInteraction}
        onSubmit={onSubmit}
      />,
    );

    // 自定义答案照样看得见 —— 但它只是一句**陈述**,不再是可点的门。
    const summary = container.querySelector<HTMLElement>('.qf-visual-custom-summary');
    expect(summary?.textContent).toContain('Warm Japanese editorial');
    expect(screen.queryByRole('button', { name: /Warm Japanese editorial/ })).toBeNull();

    fireEvent.click(summary!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);

    /* 铺开 = 右上角那枚网格切换,**内联**,不弹窗 —— 这才是 B53 要守的东西。
       铺开的是这次的一批(2026-09-04 产品口径改成 4 张,原为 6),不是整份目录:
       目录里别的通过「换一批」够得着,见 `QuestionForm.deck-batch.test.tsx`。 */
    fireEvent.click(container.querySelector('[data-action="toggle-view"]')!);
    expect(visualStyleCardsForContext('deck').length).toBeGreaterThan(VISUAL_STYLE_BATCH_SIZE);
    expect(container.querySelectorAll('.qf-visual-stack .qf-visual-card'))
      .toHaveLength(VISUAL_STYLE_BATCH_SIZE);

    /* 「Data briefing」是目录第 4 张 —— 一批从 6 缩到 4 之后,原来用的
       「Premium pitch」(第 5 张)落到了批外,`card()` 就找不到它了。
       挑批内最后一张,既仍然验到"铺开的是这一批"、又不依赖批量具体是几。 */
    fireEvent.click(card('Data briefing'));
    /* 精确对象,不是 objectContaining —— `source` 的 `'gallery'` 那一档随弹窗一起退场,
       多出一个键这里就会红。 */
    expect(onInteraction).toHaveBeenCalledWith({
      element: 'visual_style_card',
      questionId: 'tone',
      styleId: 'deck-data-briefing',
      styleContext: 'deck',
      source: 'inline',
    });
    // 选中目录里的一张之后,自定义那句就该收走
    expect(container.querySelector('.qf-visual-custom-summary')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onSubmit.mock.calls[0]?.[1]).toEqual({ tone: 'deck-data-briefing' });
    expect(onSubmit.mock.calls[0]?.[0]).toContain(
      'Data briefing [value: deck-data-briefing]',
    );
  });

  // 视觉方向卡的新版式(交付稿第 21 / 22 格):默认叠成一沓、左右箭头翻页、
  // 右上角切成网格、页脚多出「换一批」「随机」两个出口。
  // 注:切换/箭头/随机的按钮文案走新增的 qf.visual* i18n key,合并前 t() 会
  // 回落成 key 本身,所以这里按 data-action / data-nav 定位,不按文案。
  describe('visual direction stack', () => {
    const stackForm = {
      id: 'discovery',
      title: 'Choose a visual direction',
      questions: [
        {
          id: 'tone',
          label: 'Visual direction',
          type: 'radio',
          required: true,
          allowCustom: false,
          options: [
            { label: 'Editorial / magazine', value: 'editorial' },
            { label: 'Modern minimal', value: 'minimal' },
          ],
        },
      ],
    } as QuestionForm;

    const topCardTitle = (root: HTMLElement) =>
      root.querySelector('.qf-visual-stack .qf-visual-card')?.getAttribute('title');

    /*
     * 一沓里装的是【这一批的 6 张】(2026-08-27 产品口径:「换一批时,顺序从 22 个里
     * 每次挑 6 个出来」),不是稿子那四张,也不是 2026-08-26 那版的整份目录 ——
     * 整份目录进一沓时「换一批」会把选中的那张转到看不见的位置,而叠放态只有
     * 最前面那张能点,于是那道题再也取消不了选择。逐条见
     * `tests/components/QuestionForm.deck-batch.test.tsx`。
     * 稿子只画 4 张是**模拟数据**,不是规格;「+22」是分页时代的产物,一并不在。
     */
    it('stacks the current batch and rotates it with the arrows', () => {
      const { container } = render(
        <QuestionFormView
          form={stackForm}
          interactive
          visualStyleContext="deck"
          onSubmit={vi.fn()}
        />,
      );

      const picker = container.querySelector<HTMLElement>('.qf-visual-picker')!;
      expect(picker.getAttribute('data-view')).toBe('fan');
      expect(visualStyleCardsForContext('deck').length).toBeGreaterThan(VISUAL_STYLE_BATCH_SIZE);
      expect(container.querySelectorAll('.qf-visual-stack .qf-visual-card'))
        .toHaveLength(VISUAL_STYLE_BATCH_SIZE);

      // 压在下面那几张不参与 Tab 序 —— 它们在视觉上还没露出来。
      // 卡片按稿子改成了 `<button class="vopt">`(D52),tabIndex 现在挂在卡片自己身上。
      const stack = Array.from(
        container.querySelectorAll<HTMLElement>('.qf-visual-stack .qf-visual-card'),
      );
      expect(stack[0]!.getAttribute('tabindex')).toBeNull();
      expect(stack.slice(1).every((el) => el.getAttribute('tabindex') === '-1')).toBe(true);

      const first = topCardTitle(container);
      fireEvent.click(container.querySelector('[data-nav="next"]')!);
      const second = topCardTitle(container);
      expect(second).not.toBe(first);

      // 上一张 = 把队尾那张提回最前面,两条路必须走回同一个结果
      fireEvent.click(container.querySelector('[data-nav="prev"]')!);
      expect(topCardTitle(container)).toBe(first);
    });

    it('switches between the stack and the grid, and drops the arrows in the grid', () => {
      const { container } = render(
        <QuestionFormView
          form={stackForm}
          interactive
          visualStyleContext="deck"
          onSubmit={vi.fn()}
        />,
      );

      const picker = container.querySelector<HTMLElement>('.qf-visual-picker')!;
      expect(container.querySelector('.qf-visual-nav')).toBeTruthy();

      fireEvent.click(container.querySelector('[data-action="toggle-view"]')!);
      expect(picker.getAttribute('data-view')).toBe('grid');
      expect(container.querySelector('.qf-visual-nav')).toBeNull();
      expect(
        Array.from(
          container.querySelectorAll<HTMLInputElement>('.qf-visual-stack .qf-visual-card input'),
        ).every((input) => input.getAttribute('tabindex') === null),
      ).toBe(true);

      fireEvent.click(container.querySelector('[data-action="toggle-view"]')!);
      expect(picker.getAttribute('data-view')).toBe('fan');
    });

    it('picks a style for the user from the footer "random" action', () => {
      const onInteraction = vi.fn();
      const onSubmit = vi.fn();
      const { container } = render(
        <QuestionFormView
          form={stackForm}
          interactive
          visualStyleContext="deck"
          onInteraction={onInteraction}
          onSubmit={onSubmit}
        />,
      );

      fireEvent.click(container.querySelector('[data-action="random"]')!);

      const picked = onInteraction.mock.calls.find(
        (call) => call[0]?.element === 'visual_style_card',
      )?.[0];
      expect(picked?.source).toBe('inline');
      expect(picked?.styleContext).toBe('deck');
      // 随机选中的那张被翻到最前面,不然选完还压在底下看不见
      expect(container.querySelector('.qf-visual-stack .qf-visual-card')).toHaveClass(
        'qf-visual-card-on',
      );

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(onSubmit.mock.calls[0]?.[1]).toEqual({ tone: picked!.styleId });
    });

    // agent 自己在表单里开的 direction-cards 走同一套外壳，只是预览面是占位块、
    // 页脚只给「随机」（卡就这么几张，没有下一批可换）。
    const agentCardsForm = {
      id: 'q5',
      title: '视觉方向',
      questions: [
        {
          id: 'style',
          label: '挑一个看着最像的',
          type: 'direction-cards',
          required: true,
          allowCustom: false,
          options: [
            { label: '克制的编辑感', value: 'editorial' },
            { label: '干净的产品感', value: 'product' },
          ],
          cards: [
            {
              id: 'editorial',
              label: '克制的编辑感',
              mood: '大留白、衬线标题。',
              references: ['Monocle'],
              palette: ['#1a1a1a'],
              displayFont: 'Georgia, serif',
              bodyFont: 'system-ui, sans-serif',
            },
            {
              id: 'product',
              label: '干净的产品感',
              mood: '高对比、方正网格。',
              references: ['Linear'],
              palette: ['#0b0b0b'],
              displayFont: 'system-ui, sans-serif',
              bodyFont: 'system-ui, sans-serif',
            },
          ],
        },
      ],
    } as QuestionForm;

    it('renders agent-authored direction cards through the same stack, on placeholders', () => {
      const onSubmit = vi.fn();
      const { container } = render(
        <QuestionFormView form={agentCardsForm} interactive onSubmit={onSubmit} />,
      );

      expect(container.querySelector('.qf-visual-picker')?.getAttribute('data-view')).toBe('fan');
      const cards = container.querySelectorAll('.qf-visual-stack .qf-visual-card');
      expect(cards).toHaveLength(2);
      // 预览面是占位块，不接真实图片链路
      expect(container.querySelectorAll('.qf-visual-preview-blank')).toHaveLength(2);
      expect(container.querySelector('.qf-visual-preview-image')).toBeNull();
      // 「换一批」在这条路上不出现 —— 卡就这么几张
      expect(container.querySelector('[data-action="reshuffle"]')).toBeNull();

      fireEvent.click(card('干净的产品感'));
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(onSubmit.mock.calls[0]?.[1]).toEqual({ style: 'product' });
    });

    it('surfaces the randomly picked direction card to the front of the stack', () => {
      const onSubmit = vi.fn();
      const { container } = render(
        <QuestionFormView form={agentCardsForm} interactive onSubmit={onSubmit} />,
      );

      fireEvent.click(container.querySelector('[data-action="random"]')!);

      // 替人挑完还压在底下等于没挑：选中的那张必须就是最前面那张
      const front = container.querySelector('.qf-visual-stack .qf-visual-card');
      expect(front?.classList.contains('qf-visual-card-on')).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(onSubmit.mock.calls[0]?.[1]).toEqual({ style: front?.getAttribute('title') === '克制的编辑感' ? 'editorial' : 'product' });
    });

    it('selects the front card with Enter', () => {
      const { container } = render(
        <QuestionFormView
          form={stackForm}
          interactive
          visualStyleContext="deck"
          onSubmit={vi.fn()}
        />,
      );

      /*
       * 卡片按稿子改成了 `<button class="vopt">`(D52),里面不再有隐藏的 input。
       * 要守的行为没变 —— 「回车能选中最前面那张」;但**实现它的东西变了**:
       * 原来靠组件自己挂 `onKeyDown`(因为原生 radio 只认空格),现在是按钮的原生行为
       * (回车 / 空格都会触发 click)。jsdom 不会替 keyDown 合成 click,所以这里
       * 守两件事:它确实是个 `<button>`(原生键盘可达),以及激活之后确实选中了。
       */
      const front = container.querySelector<HTMLElement>('.qf-visual-stack .qf-visual-card')!;
      expect(front.tagName).toBe('BUTTON');
      expect(front.getAttribute('aria-checked')).toBe('false');
      fireEvent.click(front);
      expect(
        container
          .querySelector('.qf-visual-stack .qf-visual-card')
          ?.classList.contains('qf-visual-card-on'),
      ).toBe(true);
    });
  });

  it('exposes all uploaded style previews for every supported artifact type', () => {
    const deckCards = visualStyleCardsForContext('deck');
    const prototypeCards = visualStyleCardsForContext('prototype');
    const documentCards = visualStyleCardsForContext('document');
    const imageCards = visualStyleCardsForContext('image');
    const videoCards = visualStyleCardsForContext('video');

    expect(deckCards).toHaveLength(25);
    expect(prototypeCards).toHaveLength(26);
    expect(documentCards).toHaveLength(11);
    expect(imageCards).toHaveLength(22);
    expect(videoCards).toHaveLength(12);
    expect(deckCards.find((card) => card.value === 'deck-academic-research')?.preview.src).toBe(
      'https://repo-assets.open-design.ai/style-catalog/v1/deck-academic-research-v1.webp',
    );
    expect(
      prototypeCards.find((card) => card.value === 'prototype-y2k-chrome')?.preview.src,
    ).toBe('https://repo-assets.open-design.ai/style-catalog/v1/prototype-y2k-chrome-v1.webp');
    expect(
      documentCards.find((card) => card.value === 'document-academic-paper')?.preview.src,
    ).toBe('https://repo-assets.open-design.ai/style-catalog/v1/document-academic-paper-v1.webp');
    expect(
      imageCards.find((card) => card.value === 'image-chrome-3d')?.preview.src,
    ).toBe('https://repo-assets.open-design.ai/style-catalog/v1/image-chrome-3d-v1.webp');
    expect(
      videoCards.find((card) => card.value === 'video-kinetic-type')?.preview.src,
    ).toBe('https://repo-assets.open-design.ai/style-catalog/v1/video-kinetic-type-v1.webp');
  });
});
