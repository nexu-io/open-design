// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  description:
    'Pick a voice by description. The selected answer will be the exact voice_id passed to the renderer.',
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

describe('QuestionFormView', () => {
  afterEach(() => cleanup());

  it('updates locked answers when submitted history arrives after the initial render', () => {
    const onSubmit = vi.fn();
    const { container, rerender } = render(
      <QuestionFormView form={form} interactive submittedAnswers={undefined} onSubmit={onSubmit} />,
    );

    expect(container.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(0);

    rerender(
      <QuestionFormView
        form={form}
        interactive={false}
        submittedAnswers={{ tone: ['Editorial / magazine', 'Modern minimal'] }}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('answered')).toBeTruthy();
    expect(container.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(2);
  });

  it('renders select options with labels and submits the selected voice id', () => {
    const onSubmit = vi.fn();
    const { container, rerender } = render(
      <QuestionFormView form={voiceForm} interactive submittedAnswers={undefined} onSubmit={onSubmit} />,
    );

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(container.querySelector('option[value="21m00Tcm4TlvDq8ikWAM"]')?.textContent).toBe(
      'Rachel — american · female',
    );
    expect(screen.queryByLabelText('Custom answer')).toBeNull();

    fireEvent.change(select, { target: { value: '21m00Tcm4TlvDq8ikWAM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use voice' }));

    expect(onSubmit).toHaveBeenCalledWith(
      '[form answers — elevenlabs-voice]\n- Voice: Rachel — american · female [value: 21m00Tcm4TlvDq8ikWAM]',
      { voice: '21m00Tcm4TlvDq8ikWAM' },
    );

    rerender(
      <QuestionFormView
        form={voiceForm}
        interactive={false}
        submittedAnswers={{ voice: 'Rachel — american · female' }}
        onSubmit={onSubmit}
      />,
    );

    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe(
      '21m00Tcm4TlvDq8ikWAM',
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

    fireEvent.click(screen.getByLabelText('Mobile (iOS/Android)'));
    fireEvent.click(screen.getByRole('button', { name: 'Send answers' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toContain(
      '- Primary surface: Mobile (iOS/Android) [value: mobile]',
    );
    expect(onSubmit.mock.calls[0]?.[1]).toEqual({ platform: 'mobile' });
  });

  it('lets users override generated radio options with a custom answer', () => {
    const onSubmit = vi.fn();
    render(<QuestionFormView form={richForm} interactive onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    fireEvent.change(screen.getByLabelText('Custom answer'), {
      target: { value: 'Wearable kiosk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send answers' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('- Primary surface: Wearable kiosk'),
      { platform: 'Wearable kiosk' },
    );
  });

  it('exposes the Other escape hatch as a focusable button for keyboard users', () => {
    // Second-round reviewer finding (#5603): the chip used to be a
    // display:none checkbox inside a label — unreachable by Tab, making the
    // custom-answer field mouse-only. A real button restores keyboard access.
    const { container } = render(
      <QuestionFormView form={richForm} interactive onSubmit={vi.fn()} />,
    );

    const chip = screen.getByRole('button', { name: 'Other' });
    expect(chip.tagName).toBe('BUTTON');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    chip.focus();
    expect(document.activeElement).toBe(chip);

    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    const collapsible = container.querySelector('.qf-custom-collapsible');
    expect(collapsible?.classList.contains('open')).toBe(true);
  });

  it('keeps the custom input collapsed behind the Other chip until clicked', () => {
    const { container } = render(
      <QuestionFormView form={richForm} interactive onSubmit={vi.fn()} />,
    );

    const collapsible = container.querySelector('.qf-custom-collapsible');
    if (!collapsible) throw new Error('expected collapsible custom field');
    expect(collapsible.classList.contains('open')).toBe(false);
    expect((screen.getByLabelText('Custom answer') as HTMLInputElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Other' }));

    expect(collapsible.classList.contains('open')).toBe(true);
    expect((screen.getByLabelText('Custom answer') as HTMLInputElement).disabled).toBe(false);
  });

  it('deselects fixed options when Other opens and collapses when one is picked', () => {
    const { container } = render(
      <QuestionFormView form={richForm} interactive onSubmit={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText('Mobile (iOS/Android)'));
    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    // Opening "Other" on a single-choice question means "none of these".
    expect(container.querySelectorAll('input[type="radio"]:checked')).toHaveLength(0);

    fireEvent.click(screen.getByLabelText('Desktop web'));
    // Picking a fixed option collapses the still-empty custom field.
    expect(
      container.querySelector('.qf-custom-collapsible')?.classList.contains('open'),
    ).toBe(false);
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

    expect(
      container.querySelector('.qf-custom-collapsible')?.classList.contains('open'),
    ).toBe(true);
    expect((screen.getByLabelText('Custom answer') as HTMLInputElement).value).toBe(
      'Wearable kiosk',
    );
  });

  it('reveals the custom input from the select Other… entry', () => {
    const { container } = render(
      <QuestionFormView form={selectObjectForm} interactive onSubmit={vi.fn()} />,
    );

    const select = container.querySelector('select');
    if (!select) throw new Error('expected select control');
    expect(
      container.querySelector('.qf-custom-collapsible')?.classList.contains('open'),
    ).toBe(false);

    fireEvent.change(select, { target: { value: '__od-other__' } });

    expect(
      container.querySelector('.qf-custom-collapsible')?.classList.contains('open'),
    ).toBe(true);
    expect(select.value).toBe('__od-other__');
  });

  it('combines checkbox presets with custom user entries', () => {
    const onSubmit = vi.fn();
    render(<QuestionFormView form={checkboxObjectForm} interactive onSubmit={onSubmit} />);

    fireEvent.click(screen.getByLabelText('Editorial / magazine'));
    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    fireEvent.change(screen.getByLabelText('Custom answer'), {
      target: { value: 'Neo-museum, Field notebook' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send answers' }));

    expect(onSubmit.mock.calls[0]?.[0]).toContain('Editorial / magazine [value: editorial]');
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Neo-museum');
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Field notebook');
    expect(onSubmit.mock.calls[0]?.[1]).toEqual({
      tone: ['editorial', 'Neo-museum', 'Field notebook'],
    });
  });

  it('can hide custom choice input for exact machine-id pickers', () => {
    const exactForm = {
      ...selectObjectForm,
      questions: [{ ...selectObjectForm.questions[0], allowCustom: false }],
    } as QuestionForm;

    render(<QuestionFormView form={exactForm} interactive onSubmit={vi.fn()} />);

    expect(screen.queryByLabelText('Custom answer')).toBeNull();
    expect(screen.queryByLabelText('Other')).toBeNull();
  });

  it('submits required checkbox object options with stable values', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <QuestionFormView form={checkboxObjectForm} interactive onSubmit={onSubmit} />,
    );

    const submit = screen.getByRole('button', { name: 'Send answers' });
    // Required field unanswered → submit stays disabled (regression guard:
    // the Questions-tab refactor must not make required fields optional on the
    // standard submit path).
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Editorial / magazine'));
    fireEvent.click(screen.getByLabelText('Soft gradients'));

    expect(container.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(2);
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Editorial / magazine [value: editorial]');
    expect(onSubmit.mock.calls[0]?.[0]).toContain('Soft gradients [value: soft-gradients]');
    expect(onSubmit.mock.calls[0]?.[1]).toEqual({
      tone: ['editorial', 'soft-gradients'],
    });
  });

  it('marks required fields with the inline indicator even when the footer is hidden', () => {
    // Panel path (Questions tab): hideInternalSubmit hides the form footer, so
    // the inline "*" next to a required label is the only per-field cue that a
    // field is mandatory. A mixed required/optional form must still advertise
    // which fields block the disabled Continue button.
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

    const fields = container.querySelectorAll('.qf-field');
    const requiredField = fields[0]!;
    const optionalField = fields[1]!;
    expect(requiredField.querySelector('.qf-required')?.textContent).toBe('*');
    expect(optionalField.querySelector('.qf-required')).toBeNull();
  });

  it('submits required select object options with stable values', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <QuestionFormView form={selectObjectForm} interactive onSubmit={onSubmit} />,
    );

    const submit = screen.getByRole('button', { name: 'Send answers' });
    // Required select unanswered → submit stays disabled (regression guard).
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    const select = container.querySelector('select');
    if (!select) throw new Error('expected select control');
    fireEvent.change(select, { target: { value: 'mobile' } });

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
    expect(container.querySelectorAll('input:checked')).toHaveLength(0);

    rerender(<QuestionFormView form={complete} interactive onSubmit={vi.fn()} />);

    expect(
      (container.querySelector('input[type="radio"][value="display"]') as HTMLInputElement)
        ?.checked,
    ).toBe(true);
    expect(container.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(2);
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
    fireEvent.click(screen.getByLabelText('Editorial'));
    fireEvent.click(screen.getByLabelText('Editorial'));
    expect(container.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(0);

    rerender(<QuestionFormView form={complete} interactive onSubmit={vi.fn()} />);

    expect(container.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(0);
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

    expect(screen.getByRole('button', { name: '其他' })).toBeTruthy();
    expect(screen.queryByLabelText('Other')).toBeNull();
    expect(screen.getByLabelText('自定义填写')).toBeTruthy();
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

    const submit = screen.getByRole('button', { name: 'Send answers' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith(
      [
        '[form answers — native-defaults]',
        '- Accent color: #000000',
        '- Weight: 0',
      ].join('\n'),
      { accent: '#000000', weight: '0' },
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

    const submit = screen.getByRole('button', { name: 'Send answers' }) as HTMLButtonElement;
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
      [{ questionId: 'assets', questionLabel: 'Reference assets', files: [first, second] }],
    );
  });
});
