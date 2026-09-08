// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionFormView, parseSubmittedAnswers } from '../../src/components/QuestionForm';
import type { QuestionForm } from '../../src/artifacts/question-form';

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

    // OPEND-2641:进度跟着**当前问句**走,不在卡头里。卡头留给卡的名字和整卡状态。
    // 位置本身的完整判据在 `chat/opend-2641-step-progress-follows-question.test.tsx`。
    expect(screen.getByText('1/3').closest('.question-form-head')).toBeNull();
    expect(screen.getByText('1/3').closest('.qf-label')).toBeTruthy();
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
});
