// @vitest-environment node

// Regression: reveal-animation decks (the frontend-slides family — Creative
// Voltage, Electric Studio, …) gate their staggered entrances on a SEPARATE
// `.visible` class (`.slide.visible .reveal { opacity: 1 }`) that the deck's own
// show() adds alongside `.active`. The host deck bridge drives navigation by
// class mutation (setActive); before the fix it flipped only `.active`, so the
// target slide showed its chrome but every .reveal child stayed at opacity:0 —
// the body rendered blank. setActive must mirror `.visible` in lock-step with
// the active slide so the entrance animations fire on bridge-driven page turns.

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

function setupVisibleRevealDeck() {
  // Inactive slides are hidden inline so the bridge takes its class-mutation
  // (setActive) path deterministically under JSDOM; the active slide carries the
  // `.active visible` pairing the real templates ship with.
  const bodyHtml = `
    <section class="slide active visible" style="display:flex"><p class="reveal">One</p></section>
    <section class="slide" style="display:none"><p class="reveal">Two</p></section>
    <section class="slide" style="display:none"><p class="reveal">Three</p></section>
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
  const evaluate = new win.Function(script);
  evaluate.call(win);
  const slides = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
  return { win, slides };
}

describe('deck bridge - visible-gated reveal decks', () => {
  it('mirrors the `visible` class onto the target slide when navigating by class mutation', () => {
    const { win, slides } = setupVisibleRevealDeck();

    win.dispatchEvent(
      new win.MessageEvent('message', { data: { type: 'od:slide', action: 'next' } }),
    );

    const [first, second] = slides;
    if (!first || !second) throw new Error('expected at least two slides');

    // Target slide is now both active and visible (so its .reveal children fire);
    // the previously-active slide drops `visible` so it does not bleed through.
    expect(second.classList.contains('active')).toBe(true);
    expect(second.classList.contains('visible')).toBe(true);
    expect(first.classList.contains('visible')).toBe(false);
  });
});
