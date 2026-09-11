// @vitest-environment jsdom
//
// jsdom cannot lay out, so this file locks only the DOM shape each surface's
// caret contract requires; the geometric visibility oracle lives in
// e2e/ui/composer-carousel-placeholder-wrap.test.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { PlaceholderCarousel } from '../../../src/components/home-hero/PlaceholderCarousel';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const SCENARIO = {
  id: 'visual-polish',
  text: 'Polish this design until it is ready to ship.',
  chipId: 'design-toolbox',
} as const;

function renderCarousel(caretPlacement?: 'row-end' | 'typing-edge') {
  return render(
    <PlaceholderCarousel
      scenarios={[SCENARIO]}
      active
      {...(caretPlacement === undefined ? {} : { caretPlacement })}
      onScenarioChange={() => {}}
    />,
  );
}

describe('PlaceholderCarousel caret placement', () => {
  // The home hero ellipsizes inside .home-hero__carousel-text; a caret nested
  // there is clipped away with the overflow, so row-end keeps it outside.
  it("default renders the caret as a flex sibling after the clipped text span ('row-end')", () => {
    const { container } = renderCarousel();

    const carousel = container.querySelector('[data-testid="home-hero-carousel"]');
    expect(carousel).not.toBeNull();
    expect(carousel!.getAttribute('aria-hidden')).toBe('true');

    const textSpan = carousel!.querySelector('.home-hero__carousel-text');
    expect(textSpan).not.toBeNull();
    expect(textSpan!.querySelector('.home-hero__carousel-caret')).toBeNull();

    const children = Array.from(carousel!.children);
    expect(children).toHaveLength(2);
    expect(children[0]).toBe(textSpan);
    expect(children[1]!.classList.contains('home-hero__carousel-caret')).toBe(true);
  });

  it("explicit 'row-end' matches the default shape", () => {
    const { container } = renderCarousel('row-end');
    const carousel = container.querySelector('[data-testid="home-hero-carousel"]')!;
    const textSpan = carousel.querySelector('.home-hero__carousel-text')!;
    expect(textSpan.querySelector('.home-hero__carousel-caret')).toBeNull();
    expect(carousel.children[1]!.classList.contains('home-hero__carousel-caret')).toBe(true);
  });

  // The follow-up composer wraps its placeholder across clamped lines, so the
  // caret must be the last inline child of the text span to track the typing edge.
  it("'typing-edge' nests the caret as the last child of the text span", () => {
    const { container } = renderCarousel('typing-edge');

    const carousel = container.querySelector('[data-testid="home-hero-carousel"]');
    expect(carousel).not.toBeNull();
    expect(carousel!.getAttribute('aria-hidden')).toBe('true');

    const textSpan = carousel!.querySelector('.home-hero__carousel-text');
    expect(textSpan).not.toBeNull();
    const caret = textSpan!.querySelector('.home-hero__carousel-caret');
    expect(caret).not.toBeNull();
    expect(caret!.parentElement).toBe(textSpan);
    expect(textSpan!.lastElementChild).toBe(caret);

    const siblingCaret = Array.from(carousel!.children).find(
      (child) => child !== textSpan && child.classList.contains('home-hero__carousel-caret'),
    );
    expect(siblingCaret).toBeUndefined();
  });
});
