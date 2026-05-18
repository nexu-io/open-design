// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

/**
 * Behavioral coverage for nexu-io/open-design#2133.
 *
 * The deck bridge in `buildSrcdoc({ deck: true })` detects whether a deck
 * is scroll-based or class-toggle/transform-based via `isScrollDeck()`.
 * Transform-based decks (e.g. Atelier Zero) set the deck track to
 * `width: (N * 100)vw` with `overflow: hidden` on the body. Before the
 * fix, `body.scrollWidth > body.clientWidth` caused `isScrollDeck()` to
 * return `true`, so the bridge used `scrollGo()` — which programmatically
 * scrolled the body even though it was overflow-hidden. Combined with the
 * deck's own `translateX(...)` transform, the visual offset doubled each
 * navigation step: slides appeared to skip (1, 3, 5, 7…).
 *
 * The fix adds an `overflow-x` / `overflow` check to `scroller()` and
 * `isScrollDeck()`: elements with `overflow: hidden` are no longer
 * treated as scroll containers. Additionally, `go()` now tries keyboard
 * dispatch before class manipulation so the deck's own nav JS can drive
 * the full visual update (transform, animation) rather than relying on
 * class changes alone.
 */

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match || !match[1]) {
    throw new Error('deck bridge script not found in srcdoc');
  }
  return match[1];
}

function setupDeckBridge(bodyHtml: string, opts: {
  bodyStyle?: string;
  /** Stub body.scrollWidth / clientWidth to simulate layout. */
  stubScrollDimensions?: { scrollWidth: number; clientWidth: number };
  /** Extra script to run inside the iframe BEFORE the bridge. */
  preScript?: string;
} = {}) {
  const { bodyStyle = '', stubScrollDimensions, preScript } = opts;
  const srcdoc = buildSrcdoc(
    `<!doctype html><html><body${bodyStyle ? ` style="${bodyStyle}"` : ''}>${bodyHtml}</body></html>`,
    { deck: true },
  );
  const script = extractDeckBridgeScript(srcdoc);
  const dom = new JSDOM(
    `<!doctype html><html><body${bodyStyle ? ` style="${bodyStyle}"` : ''}>${bodyHtml}</body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true },
  );
  const win = dom.window;
  const parentPostMessage = vi.fn();
  Object.defineProperty(win, 'parent', {
    configurable: true,
    value: { postMessage: parentPostMessage },
  });
  // jsdom does not compute layout, so scrollWidth/clientWidth are 0.
  // Stub them when the test needs scroll detection to trigger.
  if (stubScrollDimensions) {
    Object.defineProperty(win.document.body, 'scrollWidth', {
      configurable: true,
      get: () => stubScrollDimensions.scrollWidth,
    });
    Object.defineProperty(win.document.body, 'clientWidth', {
      configurable: true,
      get: () => stubScrollDimensions.clientWidth,
    });
  }
  // Run any pre-bridge script (e.g. deck's own keyboard handler).
  if (preScript) {
    const preFn = new win.Function(preScript);
    preFn.call(win);
  }
  const evaluate = new win.Function(script);
  evaluate.call(win);
  win.dispatchEvent(new win.Event('load'));
  return { dom, win, parentPostMessage };
}

function lastSlideState(parentPostMessage: ReturnType<typeof vi.fn>) {
  const messages = parentPostMessage.mock.calls
    .map((call) => call[0])
    .filter((m: { type?: string }) => m?.type === 'od:slide-state');
  return messages.at(-1) as { active: number; count: number } | undefined;
}

describe('deck bridge — scroll detection for transform decks (#2133)', () => {
  it('does not classify a transform deck with overflow:hidden as a scroll deck', async () => {
    // Simulate an Atelier Zero-style deck with stubbed layout dimensions
    // so the old code WOULD have entered the scroll path.
    const slides = Array.from({ length: 5 }, (_, i) =>
      `<section class="slide${i === 0 ? ' active' : ''}">Slide ${i + 1}</section>`,
    ).join('');
    const bodyHtml = `<div id="deck" style="width: 500vw; display: flex;">${slides}</div>`;
    const { win, parentPostMessage } = setupDeckBridge(bodyHtml, {
      bodyStyle: 'overflow:hidden',
      stubScrollDimensions: { scrollWidth: 5000, clientWidth: 1000 },
    });

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    const state = lastSlideState(parentPostMessage);
    expect(state).toBeDefined();
    expect(state!.count).toBe(5);
    // The bridge should report active=0 from class detection, NOT from
    // scrollLeft-based calculation. scrollTo should NOT have been called.
    expect(state!.active).toBe(0);
  });

  it('still treats decks with overflow:auto as scroll decks', async () => {
    // A legitimate scroll deck with overflow:auto should still be
    // classified correctly.
    const slides = Array.from({ length: 4 }, (_, i) =>
      `<section class="slide${i === 0 ? ' active' : ''}">S${i + 1}</section>`,
    ).join('');
    const bodyHtml = `<div id="deck">${slides}</div>`;
    const { win, parentPostMessage } = setupDeckBridge(bodyHtml, {
      bodyStyle: 'overflow-x:auto',
      stubScrollDimensions: { scrollWidth: 4000, clientWidth: 1000 },
    });

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    // Send 'next' via message — should use scroll path (scrollGo)
    win.dispatchEvent(
      new win.MessageEvent('message', {
        data: { type: 'od:slide', action: 'next' },
        origin: '*',
      }),
    );
    await new Promise<void>((resolve) => win.setTimeout(resolve, 400));

    // scrollGo was used — active index is scroll-based. Since jsdom
    // can't actually scroll, the index stays at 0. The key assertion
    // is that the bridge didn't crash and still reports state.
    const state = lastSlideState(parentPostMessage);
    expect(state).toBeDefined();
    expect(state!.count).toBe(4);
  });

  it('bridge go("next") advances by exactly 1 for class-toggle decks', async () => {
    // 4 slides, first is active. Simulate the host sending od:slide
    // messages and verify the bridge only advances by 1 each time.
    const slides = Array.from({ length: 4 }, (_, i) =>
      `<section class="slide${i === 0 ? ' active' : ''}">S${i + 1}</section>`,
    ).join('');
    const bodyHtml = `<div id="deck" style="width: 400vw; display: flex;">${slides}</div>`;
    const { win, parentPostMessage } = setupDeckBridge(bodyHtml, {
      bodyStyle: 'overflow:hidden',
      stubScrollDimensions: { scrollWidth: 4000, clientWidth: 1000 },
    });

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    // Send 'next' message
    win.dispatchEvent(
      new win.MessageEvent('message', {
        data: { type: 'od:slide', action: 'next' },
        origin: '*',
      }),
    );
    await new Promise<void>((resolve) => win.setTimeout(resolve, 150));

    const stateAfterNext = lastSlideState(parentPostMessage);
    expect(stateAfterNext).toBeDefined();
    // Must be 1, NOT 2 (the double-advance bug)
    expect(stateAfterNext!.active).toBe(1);

    // Send another 'next'
    win.dispatchEvent(
      new win.MessageEvent('message', {
        data: { type: 'od:slide', action: 'next' },
        origin: '*',
      }),
    );
    await new Promise<void>((resolve) => win.setTimeout(resolve, 150));

    const stateAfterSecond = lastSlideState(parentPostMessage);
    expect(stateAfterSecond).toBeDefined();
    expect(stateAfterSecond!.active).toBe(2);
  });

  it('keyboard-first go() does not double-advance when deck has a message handler with stopImmediatePropagation', async () => {
    // Simulate a deck like compose.ts that handles od:slide messages
    // itself and calls stopImmediatePropagation to prevent the bridge.
    // The bridge's keyboard dispatch + setActive fallback must not add
    // an extra advance on top of the deck's own handler.
    const slides = Array.from({ length: 4 }, (_, i) =>
      `<section class="slide${i === 0 ? ' active' : ''}">S${i + 1}</section>`,
    ).join('');
    const bodyHtml = `<div id="deck" style="width: 400vw; display: flex;">${slides}</div>`;

    // Pre-script: deck's own od:slide message handler that updates
    // classes AND calls stopImmediatePropagation (like compose.ts).
    const deckMessageHandler = `
      (function() {
        var deck = document.getElementById('deck');
        var allSlides = deck.querySelectorAll('.slide');
        var idx = 0;
        function applySlide(n) {
          idx = Math.max(0, Math.min(allSlides.length - 1, n));
          for (var i = 0; i < allSlides.length; i++) {
            allSlides[i].classList.toggle('active', i === idx);
          }
          deck.style.transform = 'translateX(' + (-idx * 100) + 'vw)';
        }
        window.addEventListener('message', function(e) {
          var data = e && e.data;
          if (!data || data.type !== 'od:slide') return;
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
          if (data.action === 'next') applySlide(idx + 1);
          else if (data.action === 'prev') applySlide(idx - 1);
        });
        applySlide(0);
      })();
    `;

    const { win, parentPostMessage } = setupDeckBridge(bodyHtml, {
      bodyStyle: 'overflow:hidden',
      stubScrollDimensions: { scrollWidth: 4000, clientWidth: 1000 },
      preScript: deckMessageHandler,
    });

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    // Send 'next' — the deck's handler should fire first and stop the bridge
    win.dispatchEvent(
      new win.MessageEvent('message', {
        data: { type: 'od:slide', action: 'next' },
        origin: '*',
      }),
    );
    await new Promise<void>((resolve) => win.setTimeout(resolve, 200));

    // Verify the deck's own handler drove the advance (via transform)
    const deckEl = win.document.getElementById('deck')!;
    expect(deckEl.style.transform).toBe('translateX(-100vw)');

    // The active class should be on slide 1, NOT slide 2 (no double-advance)
    const activeSlides = win.document.querySelectorAll('.slide.active');
    expect(activeSlides.length).toBe(1);
    const activeIdx = Array.from(win.document.querySelectorAll('.slide'))
      .findIndex((el) => el.classList.contains('active'));
    expect(activeIdx).toBe(1);
  });

  it('bridge injects hasScrollableOverflow check that rejects hidden/clip', () => {
    const srcdoc = buildSrcdoc(
      '<section class="slide">A</section><section class="slide">B</section>',
      { deck: true },
    );
    expect(srcdoc).toContain('hasScrollableOverflow');
    expect(srcdoc).toContain('overflowX');
    // Must reject hidden and clip
    expect(srcdoc).toContain("ox !== 'hidden'");
    expect(srcdoc).toContain("ox !== 'clip'");
  });

  it('bridge go() tries dispatchKey before setActive', () => {
    const srcdoc = buildSrcdoc(
      '<section class="slide">A</section><section class="slide">B</section>',
      { deck: true },
    );
    // Verify the keyboard-first strategy is present in go()
    const goFn = srcdoc.match(/function go\(action\)\{([\s\S]*?)\n  \}/)?.[1] ?? '';
    // dispatchKey should appear before canSetActive in the go() function
    const dispatchIdx = goFn.indexOf('dispatchKey');
    const canSetActiveIdx = goFn.indexOf('canSetActive');
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(canSetActiveIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeLessThan(canSetActiveIdx);
  });
});
