// @vitest-environment node

import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

import {
  DECK_PROTOCOL_V1_INLINE_RUNTIME,
  DECK_PROTOCOL_VERSION,
} from '@open-design/contracts/runtime/deck-protocol';

function setupCanonicalProtocolDeck() {
  const dom = new JSDOM(`<!doctype html><html data-od-deck-protocol="1"><body>
    <section class="slide active">One</section>
    <section class="slide">Two</section>
    <section class="slide">Three</section>
    <section class="slide">Four</section>
  </body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const postMessage = vi.fn();
  Object.defineProperty(win, 'parent', {
    configurable: true,
    value: { postMessage },
  });

  const script = `
    var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
    var idx = 0;
    function paint() {
      slides.forEach(function (slide, index) {
        slide.classList.toggle('active', index === idx);
      });
      postDeckState();
    }
    function go(index) {
      idx = Math.max(0, Math.min(slides.length - 1, index));
      paint();
    }
${DECK_PROTOCOL_V1_INLINE_RUNTIME}
    announceDeckProtocol();
    paint();
  `;
  new win.Function(script).call(win);

  return {
    activeIndex: () => Array.from(win.document.querySelectorAll('.slide'))
      .findIndex((slide) => slide.classList.contains('active')),
    postMessage,
    win,
  };
}

describe('OD Deck Protocol v1', () => {
  it('announces absolute navigation and state-event capabilities', () => {
    const { postMessage, win } = setupCanonicalProtocolDeck();

    expect(postMessage).toHaveBeenCalledWith({
      type: 'od:deck-ready',
      protocolVersion: DECK_PROTOCOL_VERSION,
      capabilities: ['absolute-navigation', 'state-events'],
    }, '*');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'od:slide-state',
      protocolVersion: DECK_PROTOCOL_VERSION,
      active: 0,
      count: 4,
    }, '*');
    win.close();
  });

  it('jumps directly to a thumbnail target without intermediate key events', () => {
    const { activeIndex, postMessage, win } = setupCanonicalProtocolDeck();
    const keydown = vi.fn();
    win.addEventListener('keydown', keydown);

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'go', index: 3, protocolVersion: 1 },
    }));

    expect(activeIndex()).toBe(3);
    expect(keydown).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'od:slide-state',
      protocolVersion: DECK_PROTOCOL_VERSION,
      active: 3,
      count: 4,
    }, '*');
    win.close();
  });

  it('keeps unversioned legacy host commands compatible', () => {
    const { activeIndex, win } = setupCanonicalProtocolDeck();

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'last' },
    }));
    expect(activeIndex()).toBe(3);

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'first' },
    }));
    expect(activeIndex()).toBe(0);
    win.close();
  });
});
