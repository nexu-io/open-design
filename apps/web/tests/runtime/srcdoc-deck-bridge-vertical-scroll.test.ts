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

function lastSlideState(parentPostMessage: ReturnType<typeof vi.fn>) {
  const messages = parentPostMessage.mock.calls
    .map((call) => call[0])
    .filter((m) => m?.type === 'od:slide-state');
  return messages.at(-1);
}

const VIEWPORT = 1000;
const SCENES = 3;

// Builds a vertical / long-form deck: three full-viewport scenes stacked in a
// single scrollable document (no horizontal overflow, no transform track, no
// active-class state, no hidden siblings). Navigation happens purely by
// scrolling the page down. This is the shape from the "Cinematic Landing Page"
// repro in issue #4218.
function mountVerticalDeck() {
  const bodyHtml = `
    <section class="slide">SCENE 01 / 03</section>
    <section class="slide">SCENE 02 / 03</section>
    <section class="slide">SCENE 03 / 03</section>
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
  Object.defineProperty(win, 'innerHeight', { configurable: true, value: VIEWPORT });
  Object.defineProperty(win, 'innerWidth', { configurable: true, value: VIEWPORT });

  // Vertical scroll room on the root scroller; no horizontal overflow.
  for (const el of [win.document.body, win.document.documentElement]) {
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: VIEWPORT * SCENES });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: VIEWPORT });
  }
  Object.defineProperty(win.document, 'scrollingElement', {
    configurable: true,
    value: win.document.documentElement,
  });

  // Only the root scrolling element actually scrolls; body stays pinned at 0,
  // matching how browsers expose one real scroller (see the horizontal
  // scroll-container test). This keeps the bridge from double-counting siblings.
  let scrollTop = 0;
  const applyScrollTop = (value: number) => {
    scrollTop = Math.max(0, Math.min(VIEWPORT * (SCENES - 1), value));
  };
  Object.defineProperty(win.document.documentElement, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: applyScrollTop,
  });
  Object.defineProperty(win.document.documentElement, 'scrollTo', {
    configurable: true,
    value: (opts: { top?: number }) => {
      if (opts && typeof opts.top === 'number') applyScrollTop(opts.top);
    },
  });
  Object.defineProperty(win.document.body, 'scrollTop', {
    configurable: true,
    get: () => 0,
    set: () => {},
  });
  Object.defineProperty(win.document.body, 'scrollTo', {
    configurable: true,
    value: () => {},
  });

  // Each scene is one viewport tall, stacked vertically. Its viewport-relative
  // top shifts up as the page scrolls down.
  const scenes = Array.from(win.document.querySelectorAll('.slide')) as HTMLElement[];
  scenes.forEach((scene, index) => {
    scene.getBoundingClientRect = () => {
      const top = index * VIEWPORT - scrollTop;
      return {
        top,
        bottom: top + VIEWPORT,
        left: 0,
        right: VIEWPORT,
        width: VIEWPORT,
        height: VIEWPORT,
        x: 0,
        y: top,
        toJSON() {},
      } as DOMRect;
    };
  });

  const evaluate = new win.Function(script);
  evaluate.call(win);
  win.dispatchEvent(new win.Event('load'));

  return { win, parentPostMessage, getScrollTop: () => scrollTop };
}

describe('deck bridge - vertical scroll deck (#4218)', () => {
  it('tracks the active scene from vertical scroll position', async () => {
    const { win, parentPostMessage } = mountVerticalDeck();
    await new Promise<void>((resolve) => win.setTimeout(resolve, 250));

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 0, count: 3 });

    win.document.documentElement.scrollTop = VIEWPORT * 2;
    win.document.dispatchEvent(new win.Event('scroll'));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 200));

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 2, count: 3 });

    win.document.documentElement.scrollTop = VIEWPORT;
    win.document.dispatchEvent(new win.Event('scroll'));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 200));

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });
  });

  it('navigates a vertical scroll deck by scrolling to the requested scene', async () => {
    const { win, parentPostMessage, getScrollTop } = mountVerticalDeck();

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 420));

    expect(getScrollTop()).toBe(VIEWPORT);
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'last' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 420));

    expect(getScrollTop()).toBe(VIEWPORT * 2);
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 2, count: 3 });
  });
});
