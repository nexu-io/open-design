// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DeckSlideThumbnail } from '../../src/components/DeckSlideThumbnail';
import { parseDeckThumbnails } from '../../src/runtime/deck-thumbnail-parser';

beforeAll(() => {
  // jsdom has no ResizeObserver; the component guards it, but stub a no-op so
  // the scale path is exercised without throwing.
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(cleanup);

const DECK = `<!doctype html><html><head><style>
  :root { --bg: #fff; }
  .deck-stage { width: 1920px; height: 1080px; }
  .slide:not(.active) { display: none !important; }
</style></head><body>
  <div class="deck-shell"><div class="deck-stage" id="deck-stage">
    <section class="slide active" data-screen-label="01"><h1>Alpha</h1></section>
    <section class="slide" data-screen-label="02"><h1>Bravo</h1></section>
  </div></div>
  <nav class="deck-counter"><button id="deck-prev">‹</button></nav>
  <script>/* nav runtime — must never reach the shadow */</script>
</body></html>`;

function parsed() {
  const p = parseDeckThumbnails(DECK, '/api/projects/p1/raw/');
  expect(p.renderable).toBe(true);
  return p;
}

describe('DeckSlideThumbnail', () => {
  it('renders exactly one slide into a shadow root, with no iframe/script/chrome', () => {
    const { container } = render(<DeckSlideThumbnail parsed={parsed()} index={0} />);
    const host = container.querySelector('.deck-thumbnail-shadow-host') as HTMLElement;
    expect(host).toBeTruthy();
    const root = host.shadowRoot!;
    expect(root).toBeTruthy();

    const sections = root.querySelectorAll('section');
    expect(sections).toHaveLength(1);
    expect(sections[0]!.textContent).toContain('Alpha');
    expect(sections[0]!.classList.contains('active')).toBe(true);
    expect(sections[0]!.hasAttribute('data-od-thumb-slide')).toBe(true);
    expect(sections[0]!.hasAttribute('data-od-deck-active')).toBe(true);

    // No iframe, no executable script, and the deck's own nav chrome (which
    // lives outside the slide) is never cloned in.
    expect(root.querySelector('iframe')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('.deck-counter')).toBeNull();
  });

  it('reconstructs the wrapper chain with data-od-thumb-wrap markers', () => {
    const { container } = render(<DeckSlideThumbnail parsed={parsed()} index={0} />);
    const root = (container.querySelector('.deck-thumbnail-shadow-host') as HTMLElement).shadowRoot!;
    const wraps = root.querySelectorAll('[data-od-thumb-wrap]');
    expect(wraps).toHaveLength(2);
    expect(root.querySelector('.deck-shell[data-od-thumb-wrap]')).toBeTruthy();
    expect(root.querySelector('.deck-stage[data-od-thumb-wrap]')).toBeTruthy();
    expect(root.querySelector('.od-thumb-canvas')).toBeTruthy();
  });

  it('swaps to the requested slide without accumulating stale content', () => {
    const p = parsed();
    const { container, rerender } = render(<DeckSlideThumbnail parsed={p} index={0} />);
    const host = container.querySelector('.deck-thumbnail-shadow-host') as HTMLElement;
    expect(host.shadowRoot!.textContent).toContain('Alpha');

    rerender(<DeckSlideThumbnail parsed={p} index={1} />);
    const sections = host.shadowRoot!.querySelectorAll('section');
    expect(sections).toHaveLength(1);
    expect(sections[0]!.textContent).toContain('Bravo');
    expect(host.shadowRoot!.textContent).not.toContain('Alpha');
  });
});
