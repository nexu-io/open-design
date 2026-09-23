// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { QuestionForm } from '../../src/artifacts/question-form';
import { QuestionFormView } from '../../src/components/QuestionForm';
import { VISUAL_STYLE_BATCH_SIZE } from '../../src/runtime/visual-style-deck';

afterEach(cleanup);

const form = {
  id: 'visual-direction-loading',
  title: 'Choose a direction',
  questions: [
    {
      id: 'direction',
      label: 'Visual direction',
      type: 'direction-cards',
      required: true,
      cards: [{ id: 'fallback', label: 'Fallback' }],
    },
  ],
} as QuestionForm;

describe('visual-direction preview loading', () => {
  it('eagerly fetches a display-sized first batch instead of six 1600px originals', () => {
    render(
      <QuestionFormView
        form={form}
        interactive
        visualStyleContext="deck"
        onSubmit={vi.fn()}
      />,
    );

    const images = screen.getAllByRole<HTMLImageElement>('img');
    expect(images).toHaveLength(VISUAL_STYLE_BATCH_SIZE);

    for (const image of images) {
      expect(image.getAttribute('src')).toMatch(
        /^https:\/\/repo-assets\.open-design\.ai\/cdn-cgi\/image\/width=640,quality=75,format=auto\/style-catalog\/v1\/deck-.*-v1\.webp$/,
      );
      expect(image.getAttribute('loading')).toBe('eager');
      expect(image.getAttribute('decoding')).toBe('async');
      expect(image.getAttribute('width')).toBe('640');
      expect(image.getAttribute('height')).toBe('480');
    }
  });

  it('keeps historical locked forms lazy so scrolling old turns does not fetch every batch', () => {
    render(
      <QuestionFormView
        form={form}
        interactive={false}
        visualStyleContext="deck"
        onSubmit={vi.fn()}
      />,
    );

    const images = screen.getAllByRole<HTMLImageElement>('img');
    expect(images).toHaveLength(VISUAL_STYLE_BATCH_SIZE);
    expect(images.every((image) => image.getAttribute('loading') === 'lazy')).toBe(true);
  });
});
