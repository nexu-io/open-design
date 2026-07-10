// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

// When the artifact's own keyboard handler drives navigation, the host toolbar
// only learns about it through `od:slide-state`. Class-toggle decks mutate the
// slides and scroll decks fire scroll events, but transform decks translate a
// track element that nothing used to observe, so the host counter and the
// prev/next buttons stayed on the previous slide until a toolbar click.

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match || !match[1]) {
    throw new Error('deck bridge script not found in srcdoc');
  }
  return match[1];
}

const CLASS_TOGGLE_DECK = `
  <div class="deck">
    <section class="slide active">One</section>
    <section class="slide">Two</section>
    <section class="slide">Three</section>
  </div>
`;

const TRANSFORM_DECK = `
  <div class="deck-shell">
    <div class="deck-track" id="deck-track" style="transform: translateX(0%)">
      <section class="slide active">One</section>
      <section class="slide">Two</section>
      <section class="slide">Three</section>
    </div>
  </div>
`;

type DeckWindow = JSDOM['window'];

/** Boots the deck bridge over an artifact that already installed its own keyboard handler. */
function bootDeck(bodyHtml: string, installArtifactKeyHandler: (win: DeckWindow) => void) {
  const srcdoc = buildSrcdoc(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    deck: true,
  });
  const script = extractDeckBridgeScript(srcdoc);
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const parentPostMessage = vi.fn();
  Object.defineProperty(win, 'parent', {
    configurable: true,
    value: { postMessage: parentPostMessage },
  });
  Object.defineProperty(win, 'innerWidth', { configurable: true, value: 1000 });

  installArtifactKeyHandler(win);
  win.eval(script);

  // The bridge posts an initial state ~100ms after boot (restoreInitialSlide).
  // Let it land before assertions, otherwise it masks a missing keyboard report.
  const settleBoot = () => new Promise((resolve) => setTimeout(resolve, 400));

  return { win, parentPostMessage, settleBoot };
}

function lastSlideState(postMessage: ReturnType<typeof vi.fn>) {
  const calls = postMessage.mock.calls.filter(
    (call) => call[0] && call[0].type === 'od:slide-state',
  );
  return calls.at(-1)?.[0] ?? null;
}

function press(win: DeckWindow, key: string) {
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true }));
}

const flushObserver = () => new Promise((resolve) => setTimeout(resolve, 200));

describe('deck bridge keyboard sync', () => {
  it('reports slide state when a transform deck moves its own track', async () => {
    const { win, parentPostMessage, settleBoot } = bootDeck(TRANSFORM_DECK, (w) => {
      w.document.addEventListener('keydown', (event) => {
        const track = w.document.getElementById('deck-track');
        if (!track) return;
        const match = /translateX\(\s*(-?[0-9.]+)%\s*\)/.exec(track.style.transform || '');
        const current = match?.[1] ? Math.abs(parseFloat(match[1])) / 100 : 0;
        if (event.key === 'ArrowRight' && current < 2) {
          track.style.transform = `translateX(${-(current + 1) * 100}%)`;
        } else if (event.key === 'ArrowLeft' && current > 0) {
          track.style.transform = `translateX(${-(current - 1) * 100}%)`;
        }
      });
    });

    await settleBoot();
    parentPostMessage.mockClear();

    press(win, 'ArrowRight');
    await flushObserver();
    expect(lastSlideState(parentPostMessage)).toEqual({
      type: 'od:slide-state',
      active: 1,
      count: 3,
    });

    press(win, 'ArrowLeft');
    await flushObserver();
    expect(lastSlideState(parentPostMessage)).toEqual({
      type: 'od:slide-state',
      active: 0,
      count: 3,
    });
  });

  it('reports slide state when a class-toggle deck moves its own slides', async () => {
    const { win, parentPostMessage, settleBoot } = bootDeck(CLASS_TOGGLE_DECK, (w) => {
      w.document.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowRight') return;
        const slides = [...w.document.querySelectorAll('.slide')];
        const index = slides.findIndex((slide) => slide.classList.contains('active'));
        const current = slides[index];
        const next = slides[index + 1];
        if (!current || !next) return;
        current.classList.remove('active');
        next.classList.add('active');
      });
    });

    await settleBoot();
    parentPostMessage.mockClear();

    press(win, 'ArrowRight');
    await flushObserver();
    expect(lastSlideState(parentPostMessage)).toEqual({
      type: 'od:slide-state',
      active: 1,
      count: 3,
    });
  });
});
