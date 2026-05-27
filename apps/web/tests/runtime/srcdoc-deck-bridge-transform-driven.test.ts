// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match || !match[1]) {
    throw new Error('deck bridge script not found in srcdoc');
  }
  return match[1];
}

function setupTransformDeck() {
  const bodyHtml = `
    <div class="deck-shell">
      <div class="deck-track" id="deck-track">
        <section class="slide active">One</section>
        <section class="slide">Two</section>
        <section class="slide">Three</section>
      </div>
    </div>
  `;
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

  const slides = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
  const track = win.document.getElementById('deck-track') as HTMLElement;
  let active = 0;
  function apply(index: number) {
    active = Math.max(0, Math.min(slides.length - 1, index));
    slides.forEach((slide, i) => {
      slide.classList.toggle('active', i === active);
    });
    track.style.transform = `translateX(-${active * 100}vw)`;
  }
  win.document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') apply(active + 1);
    else if (event.key === 'ArrowLeft') apply(active - 1);
    else if (event.key === 'Home') apply(0);
    else if (event.key === 'End') apply(slides.length - 1);
  });
  apply(0);

  const evaluate = new win.Function(script);
  evaluate.call(win);
  return { dom, win, parentPostMessage, track };
}

describe('deck bridge — transform-driven decks', () => {
  it('routes host navigation through the deck runtime when active classes alone do not move the stage', async () => {
    const { win, track, parentPostMessage } = setupTransformDeck();

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 360));

    expect(track.style.transform).toBe('translateX(-100vw)');
    const slideStates = parentPostMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message?.type === 'od:slide-state');
    expect(slideStates.at(-1)).toMatchObject({ active: 1, count: 3 });
  });
});
