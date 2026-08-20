// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TypePillRow } from '../../../src/components/home-hero/TypePillRow';
import {
  HOME_HERO_CHIPS,
  type HomeHeroChip,
} from '../../../src/components/home-hero/chips';

const chips = ['deck', 'prototype', 'wireframe', 'image', 'video'].map((chipId) => {
  const chip = HOME_HERO_CHIPS.find((candidate) => candidate.id === chipId);
  if (!chip) throw new Error(`Missing chip fixture: ${chipId}`);
  return chip;
});

let resizeObserverCallback: ResizeObserverCallback | null = null;
let renderedPillWidth = 40;

class ResizeObserverMock implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  renderedPillWidth = 40;
  resizeObserverCallback = null;
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === 'home-hero-type-pills' ? 260 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('home-hero__type-pills-tail')) return 80;
    if (this.parentElement?.classList.contains('home-hero__type-pills-probe')) {
      return renderedPillWidth;
    }
    return 0;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderPillRow(labelFor: (chipId: string) => string) {
  return render(
    <TypePillRow
      chips={chips as HomeHeroChip[]}
      activeChipId="deck"
      labelFor={labelFor}
      onPick={vi.fn()}
    />,
  );
}

describe('TypePillRow', () => {
  it('keeps a strict ordered prefix inline and moves the remaining suffix into All', () => {
    renderPillRow((chipId) => chipId);

    expect(screen.queryByTestId('home-hero-type-pill-deck')).not.toBeNull();
    expect(screen.queryByTestId('home-hero-type-pill-prototype')).not.toBeNull();
    expect(screen.queryByTestId('home-hero-type-pill-wireframe')).not.toBeNull();
    expect(screen.queryByTestId('home-hero-type-pill-image')).toBeNull();
    expect(screen.queryByTestId('home-hero-type-pill-video')).toBeNull();

    fireEvent.click(screen.getByTestId('home-hero-type-pills-more'));
    expect(screen.queryByTestId('home-hero-type-pill-image-more')).not.toBeNull();
    expect(screen.queryByTestId('home-hero-type-pill-video-more')).not.toBeNull();
  });

  it('recomputes the inline split when rendered labels change without resizing the container', () => {
    const labels = new Map(chips.map((chip) => [chip.id, chip.label]));
    const view = renderPillRow((chipId) => labels.get(chipId) ?? chipId);

    expect(screen.queryByTestId('home-hero-type-pill-wireframe')).not.toBeNull();

    renderedPillWidth = 100;
    labels.set('deck', 'A much longer slide deck label');
    labels.set('prototype', 'A much longer prototype label');
    labels.set('wireframe', 'A much longer wireframe label');
    view.rerender(
      <TypePillRow
        chips={chips as HomeHeroChip[]}
        activeChipId="deck"
        labelFor={(chipId) => labels.get(chipId) ?? chipId}
        onPick={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('home-hero-type-pill-deck')).not.toBeNull();
    expect(screen.queryByTestId('home-hero-type-pill-prototype')).toBeNull();
    expect(screen.queryByTestId('home-hero-type-pill-wireframe')).toBeNull();
  });

  it('recomputes the inline split when observed pill widths settle after render', () => {
    renderPillRow((chipId) => chipId);
    expect(screen.queryByTestId('home-hero-type-pill-wireframe')).not.toBeNull();

    renderedPillWidth = 100;
    act(() => {
      resizeObserverCallback?.([], {} as ResizeObserver);
    });

    expect(screen.queryByTestId('home-hero-type-pill-deck')).not.toBeNull();
    expect(screen.queryByTestId('home-hero-type-pill-prototype')).toBeNull();
    expect(screen.queryByTestId('home-hero-type-pill-wireframe')).toBeNull();
  });
});
