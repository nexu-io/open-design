// @vitest-environment jsdom
//
// The caret must be nested inside the text span, not a sibling, so it
// follows the last character when the placeholder wraps in the chat
// composer. Layout measurements live in the Playwright spec at
// `e2e/ui/composer-carousel-placeholder-wrap.test.ts`; jsdom cannot lay
// out, so this file locks the DOM shape only.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { PlaceholderCarousel } from '../../../src/components/home-hero/PlaceholderCarousel';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const LONG_SCENARIO = {
  id: 'visual-polish',
  text: 'Polish this design until it is ready to ship: check hierarchy, typography, spacing, responsive behavior, button states, empty/loading/error states, and accessibility; directly fix the most important issues.',
  chipId: 'design-toolbox',
} as const;

describe('PlaceholderCarousel caret is nested inline in the text span', () => {
  it('renders caret as the last child of .home-hero__carousel-text (not a sibling)', () => {
    const { container } = render(
      <PlaceholderCarousel
        scenarios={[LONG_SCENARIO]}
        active
        onScenarioChange={() => {}}
      />,
    );

    const carousel = container.querySelector('[data-testid="home-hero-carousel"]');
    expect(carousel, 'carousel root missing').not.toBeNull();

    const textSpan = carousel!.querySelector('.home-hero__carousel-text');
    expect(textSpan, 'text span missing').not.toBeNull();

    const caret = textSpan!.querySelector('.home-hero__carousel-caret');
    expect(caret, 'caret must be a descendant of the text span').not.toBeNull();
    expect(caret!.parentElement).toBe(textSpan);
    expect(textSpan!.lastElementChild).toBe(caret);

    const siblingCaret = Array.from(carousel!.children).find(
      (child) => child !== textSpan && child.classList.contains('home-hero__carousel-caret'),
    );
    expect(siblingCaret, 'caret must not appear as a sibling of the text span').toBeUndefined();

    expect(carousel!.getAttribute('aria-hidden')).toBe('true');
  });
});
