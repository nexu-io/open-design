// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { QuestionFormView } from '../../src/components/QuestionForm';
import type { QuestionForm } from '../../src/artifacts/question-form';

afterEach(() => {
  cleanup();
});

// OPEND-2707. A clarification card question is its title, its required badge,
// and the control the user answers with. The model-authored subtitle (`help`)
// sat between the title and the control and read as chrome, so the card must
// not render it — and must not leave the band of whitespace it occupied.
const brandForm: QuestionForm = {
  id: 'brand-detail',
  title: '再确认几件事',
  questions: [
    {
      id: 'brand_name',
      label: '品牌名称与标识',
      type: 'text',
      required: true,
      help: '用于导航、页脚和浏览器标题；也可给一个单字形符号如 Ø / ▲ / ★',
      placeholder: '例如 Northwind',
    },
  ],
};

// `help` reaches every question type through one shared render path, so the
// card-level rule has to hold for a finite-choice question too — otherwise
// "the card does not show this subtitle" would depend on which control the
// model happened to pick. This one mirrors the daemon-authored ElevenLabs
// voice form, the only `help` string the repo itself ships.
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
      help: 'Select a voice description; the answer submits the matching Voice ID.',
      options: [
        { label: 'Rachel — american · female', value: '21m00Tcm4TlvDq8ikWAM' },
        { label: 'Adam — american · male', value: 'pNInz6obpgDQGcFmaJgB' },
      ],
    },
  ],
};

describe('question form question subtitle', () => {
  it('does not render the per-question subtitle on a text question', () => {
    const { container } = render(
      <QuestionFormView form={brandForm} interactive onSubmit={() => {}} />,
    );

    expect(container.querySelector('.qf-help')).toBeNull();
    expect(
      screen.queryByText('用于导航、页脚和浏览器标题；也可给一个单字形符号如 Ø / ▲ / ★'),
    ).toBeNull();
  });

  it('keeps the question title, the required badge and the control', () => {
    const { container } = render(
      <QuestionFormView form={brandForm} interactive onSubmit={() => {}} />,
    );

    const label = container.querySelector('.qf-label');
    expect(label?.textContent).toContain('品牌名称与标识');
    expect(label?.querySelector('.qf-required')).not.toBeNull();
    expect(container.querySelector('input.qf-input')).not.toBeNull();
  });

  // The subtitle was a block-level sibling in the card body's flex column, so a
  // rendered-but-empty node would still cost its own line box. Asserting on the
  // body's direct children is the jsdom-safe way to say "the whitespace went
  // with it": jsdom resolves no `var()` and lays nothing out, so reading a
  // height or a computed spacing here would be a fake green.
  it('leaves no node between the question title and its control', () => {
    const { container } = render(
      <QuestionFormView form={brandForm} interactive onSubmit={() => {}} />,
    );

    const label = container.querySelector('.qf-label');
    expect(label?.nextElementSibling?.className).toBe('qf-input');

    const body = container.querySelector('.question-form-body');
    const children = Array.from(body?.children ?? []).map((el) => el.className);
    expect(children).toEqual(['qf-label', 'qf-input', 'question-form-foot']);
  });

  it('does not render the subtitle on a finite-choice question either', () => {
    const { container } = render(
      <QuestionFormView form={voiceForm} interactive onSubmit={() => {}} />,
    );

    expect(container.querySelector('.qf-help')).toBeNull();
    expect(
      screen.queryByText('Select a voice description; the answer submits the matching Voice ID.'),
    ).toBeNull();
  });
});
