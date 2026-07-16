// @vitest-environment jsdom

// jsdom has no IntersectionObserver, so useInView eagerly reports every
// thumbnail visible — the rail mounts all frames here, which is exactly the
// fallback contract. Virtualization itself is exercised through the pure
// nextMountedThumbnails step; the rendered tests pin the lazy-build cache and
// selection wiring.

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DeckThumbnailRail,
  nextMountedThumbnails,
} from '../../src/components/DeckThumbnailRail';
import { parseDeckThumbnails } from '../../src/runtime/deck-thumbnail-parser';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(cleanup);

describe('nextMountedThumbnails', () => {
  it('always mounts the active slide, even before any visibility report', () => {
    expect(nextMountedThumbnails([], new Set(), 4, 10)).toEqual([4]);
  });

  it('keeps previously seen slides and appends the currently relevant ones', () => {
    expect(nextMountedThumbnails([5], new Set([1, 2]), 0, 10)).toEqual([5, 0, 1, 2]);
  });

  it('evicts the least recently seen slides beyond the cap', () => {
    expect(nextMountedThumbnails([0, 1, 2, 3], new Set([4]), 4, 10, 3)).toEqual([2, 3, 4]);
  });

  it('never evicts currently visible slides even above the cap', () => {
    const visible = new Set([0, 1, 2, 3, 4, 5]);
    expect(nextMountedThumbnails([], visible, 0, 10, 3)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('drops indices outside the deck after it shrinks', () => {
    expect(nextMountedThumbnails([1, 4], new Set(), 0, 3)).toEqual([1, 0]);
  });

  it('returns the previous array identity when nothing changed', () => {
    const prev = [0, 1];
    expect(nextMountedThumbnails(prev, new Set([0, 1]), 0, 3)).toBe(prev);
  });
});

describe('DeckThumbnailRail', () => {
  const railProps = (overrides: Partial<Parameters<typeof DeckThumbnailRail>[0]> = {}) => ({
    count: 3,
    activeIndex: 0,
    labelTotal: 3,
    buildThumbSrcDoc: (index: number) => `<html><body>slide ${index}</body></html>`,
    onSelect: () => {},
    ...overrides,
  });

  it('builds each mounted srcdoc exactly once and caches across re-renders', () => {
    const build = vi.fn((index: number) => `<html><body>slide ${index}</body></html>`);
    const { container, rerender } = render(
      <DeckThumbnailRail {...railProps({ buildThumbSrcDoc: build })} />,
    );

    expect(container.querySelectorAll('.deck-thumbnail-frame iframe')).toHaveLength(3);
    expect(build).toHaveBeenCalledTimes(3);

    // Active-slide change re-renders every mounted item; the cache holds.
    rerender(<DeckThumbnailRail {...railProps({ buildThumbSrcDoc: build, activeIndex: 1 })} />);
    expect(build).toHaveBeenCalledTimes(3);

    // New builder identity (deck source changed) invalidates the cache.
    const rebuilt = vi.fn((index: number) => `<html><body>v2 ${index}</body></html>`);
    rerender(<DeckThumbnailRail {...railProps({ buildThumbSrcDoc: rebuilt, activeIndex: 1 })} />);
    expect(rebuilt).toHaveBeenCalledTimes(3);
  });

  it('reports the clicked slide index and marks the active thumbnail', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <DeckThumbnailRail {...railProps({ activeIndex: 1, onSelect })} />,
    );

    const buttons = Array.from(container.querySelectorAll('.deck-thumbnail-button'));
    expect(buttons).toHaveLength(3);
    expect(buttons[1]!.getAttribute('aria-current')).toBe('true');
    fireEvent.click(buttons[2]!);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('renders shadow-root thumbnails (not iframes) when a parsed deck is given', () => {
    const deck = `<!doctype html><html><head><style>
      .deck-stage { width: 1920px; height: 1080px; }
      .slide:not(.active) { display: none !important; }
    </style></head><body><div class="deck-stage" id="deck-stage">
      <section class="slide active" data-screen-label="01">One</section>
      <section class="slide" data-screen-label="02">Two</section>
      <section class="slide" data-screen-label="03">Three</section>
    </div></body></html>`;
    const parsedDeck = parseDeckThumbnails(deck, '/api/projects/p1/raw/');
    expect(parsedDeck.renderable).toBe(true);

    const build = vi.fn((index: number) => `<html><body>slide ${index}</body></html>`);
    const onSelect = vi.fn();
    const { container } = render(
      <DeckThumbnailRail {...railProps({ buildThumbSrcDoc: build, parsedDeck, onSelect })} />,
    );

    // Shadow hosts, not iframes; the iframe srcdoc builder is never touched.
    expect(container.querySelectorAll('.deck-thumbnail-shadow-host')).toHaveLength(3);
    expect(container.querySelectorAll('.deck-thumbnail-frame iframe')).toHaveLength(0);
    expect(build).not.toHaveBeenCalled();

    // Each thumbnail holds exactly its own single slide, no nav chrome.
    const hosts = Array.from(
      container.querySelectorAll<HTMLElement>('.deck-thumbnail-shadow-host'),
    );
    expect(hosts[0]!.shadowRoot!.querySelectorAll('section')).toHaveLength(1);
    expect(hosts[1]!.shadowRoot!.textContent).toContain('Two');
    expect(hosts[0]!.shadowRoot!.querySelector('iframe')).toBeNull();

    // Selection still flows through the button, independent of render mode.
    const buttons = Array.from(container.querySelectorAll('.deck-thumbnail-button'));
    fireEvent.click(buttons[2]!);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('removes the loading cover after a shadow thumbnail is ready', () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(160);
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(90);
    try {
      const deck = `<!doctype html><html><head><style>
        :root { --slide-bg: #fff; }
        .deck-stage { width: 1920px; height: 1080px; }
        .slide { background: var(--slide-bg); }
      </style></head><body><div class="deck-stage" id="deck-stage">
        <section class="slide active" data-screen-label="01">Visible slide</section>
      </div></body></html>`;
      const parsedDeck = parseDeckThumbnails(deck);
      expect(parsedDeck.renderable).toBe(true);

      const { container } = render(
        <DeckThumbnailRail {...railProps({ count: 1, labelTotal: 1, parsedDeck })} />,
      );

      expect(container.querySelector('.deck-thumbnail-shadow-host')).toBeTruthy();
      expect(container.querySelector('.deck-thumbnail-loading')).toBeNull();
    } finally {
      width.mockRestore();
      height.mockRestore();
    }
  });
});
