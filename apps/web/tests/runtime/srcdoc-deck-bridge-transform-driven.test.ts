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
    <style>
      html, body { margin: 0; }
      body { overflow-x: hidden; }
      .deck-shell { width: 100vw; overflow: hidden; }
      .deck-track { display: flex; width: 300vw; }
      .slide { flex: 0 0 100vw; }
    </style>
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
  Object.defineProperty(win, 'innerWidth', {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(win.document.body, 'scrollWidth', {
    configurable: true,
    value: 3000,
  });
  Object.defineProperty(win.document.body, 'clientWidth', {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(win.document.documentElement, 'scrollWidth', {
    configurable: true,
    value: 3000,
  });
  Object.defineProperty(win.document.documentElement, 'clientWidth', {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(win.document, 'scrollingElement', {
    configurable: true,
    value: win.document.documentElement,
  });
  let bodyScrollLeft = 0;
  let documentScrollLeft = 0;
  Object.defineProperty(win.document.body, 'scrollLeft', {
    configurable: true,
    get: () => bodyScrollLeft,
    set: (value: number) => {
      bodyScrollLeft = value;
    },
  });
  Object.defineProperty(win.document.documentElement, 'scrollLeft', {
    configurable: true,
    get: () => documentScrollLeft,
    set: (value: number) => {
      documentScrollLeft = value;
    },
  });
  Object.defineProperty(win.document.body, 'scrollTo', {
    configurable: true,
    value: ({ left }: { left?: number }) => {
      if (typeof left === 'number') {
        bodyScrollLeft = left;
      }
    },
  });
  Object.defineProperty(win.document.documentElement, 'scrollTo', {
    configurable: true,
    value: ({ left }: { left?: number }) => {
      if (typeof left === 'number') {
        documentScrollLeft = left;
      }
    },
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
  return { win, parentPostMessage, track };
}

describe('deck bridge - transform-driven decks', () => {
  it('routes host navigation through the deck runtime even when the transformed track overflows horizontally', async () => {
    const { win, track, parentPostMessage } = setupTransformDeck();

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 360));

    expect(track.style.transform).toBe('translateX(-100vw)');
    expect(win.document.body.scrollLeft).toBe(0);
    expect(win.document.documentElement.scrollLeft).toBe(0);
    const slideStates = parentPostMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message?.type === 'od:slide-state');
    expect(slideStates.at(-1)).toMatchObject({ active: 1, count: 3 });
  });
});
