// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HomeHero } from '../../src/components/HomeHero';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

// Regression coverage for #3203. The example template card on the Home
// page used to render a small icon overlay in the bottom-right grid
// cell. Because the card's text span is `grid-column: 1 / -1`, the
// span's content reflows into the icon's cell whenever the prompt is
// long enough — visually placing the icon on top of the text. The fix
// is to drop the overlay entirely; the card itself is still a `<button>`
// so the affordance is preserved by hover/focus states and the cursor.

afterEach(() => {
  cleanup();
});

const HERO_PROPS = {
  prompt: '',
  onPromptChange: () => undefined,
  onSubmit: () => undefined,
  activePluginTitle: null,
  activeChipId: 'prototype',
  onClearActivePlugin: () => undefined,
  pluginOptions: [],
  pluginsLoading: false,
  pendingPluginId: null,
  pendingChipId: null,
  onPickPlugin: () => undefined,
  onPickChip: () => undefined,
  contextItemCount: 0,
  error: null,
};

describe('HomeHero example card overlay (#3203)', () => {
  it('renders the example cards on the prototype chip', () => {
    render(<HomeHero {...(HERO_PROPS as any)} />);
    const cards = screen.queryAllByTestId('home-hero-prompt-example');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('does not render an overlay icon inside the example card', () => {
    render(<HomeHero {...(HERO_PROPS as any)} />);
    const cards = screen.queryAllByTestId('home-hero-prompt-example');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      // Pre-fix the card contained an `<svg>` icon as a sibling to the
      // text span, positioned in the bottom-right grid cell. The fix
      // removes that overlay so card text never collides with the icon.
      expect(card.querySelector('svg')).toBeNull();
    }
  });
});
