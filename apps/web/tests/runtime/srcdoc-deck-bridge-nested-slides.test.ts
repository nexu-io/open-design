// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

// Behavioral coverage for nexu-io/open-design#1530. The deck bridge in
// `buildSrcdoc({ deck: true })` counts slides via a DOM selector to drive
// the host preview toolbar's `slideState.count`. Generated HTML decks
// commonly nest `.slide` elements under an extra wrapper rather than
// placing them as direct children of the structured containers the bridge
// recognised (`.deck`, `.deck-stage`, `.deck-shell`, `body`). When that
// happened the bridge reported `count: 0` and the toolbar showed `1 / 0`
// even though the deck visibly contained slides and its own keyboard
// handler navigated them — the host counter did not match what the user
// saw. The fix keeps the structured selector first (so decorative
// `.slide` markup in non-deck pages is not accidentally counted) and
// falls back to all `.slide` only when the structured count is zero.

function extractDeckBridgeScript(srcdoc: string): string {
  const match = srcdoc.match(/<script data-od-deck-bridge>([\s\S]*?)<\/script>/);
  if (!match || !match[1]) {
    throw new Error('deck bridge script not found in srcdoc');
  }
  return match[1];
}

function setupDeckBridge(bodyHtml: string) {
  const srcdoc = buildSrcdoc(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    deck: true,
  });
  const script = extractDeckBridgeScript(srcdoc);
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  win.scrollTo = vi.fn() as typeof win.scrollTo;
  const parentPostMessage = vi.fn();
  // jsdom defaults `window.parent` to `window` itself for top-level
  // documents; replace it with a stub that has a spied postMessage so
  // we can observe what the bridge would send to the embedding host.
  Object.defineProperty(win, 'parent', {
    configurable: true,
    value: { postMessage: parentPostMessage },
  });
  const evaluate = new win.Function(script);
  evaluate.call(win);
  // jsdom fires `load` during construction, before the bridge IIFE
  // installs its listener. Replay it here so the test exercises the
  // same first-paint `report()` path the real preview iframe takes —
  // without this the only postMessage we'd capture would come from the
  // MutationObserver path inside `observeSlides`, which never fires
  // when the structured selector is empty (the pre-fix bug condition).
  win.dispatchEvent(new win.Event('load'));
  return { dom, win, parentPostMessage };
}

function lastSlideState(parentPostMessage: ReturnType<typeof vi.fn>) {
  const messages = parentPostMessage.mock.calls
    .map((call) => call[0])
    .filter((m) => m?.type === 'od:slide-state');
  return messages.at(-1);
}

function postSlide(win: ReturnType<typeof setupDeckBridge>['win'], action: 'next' | 'prev') {
  win.dispatchEvent(new win.window.MessageEvent('message', {
    data: { type: 'od:slide', action },
  }));
}

describe('deck bridge — nested slide markup (#1530)', () => {
  it('does not claim ordinary prototype annotations as deck navigation state', async () => {
    const { win, parentPostMessage } = setupDeckBridge(
      '<main><h1 data-screen-label="Hero title">Prototype headline</h1>' +
      '<button data-screen-label="CTA">Buy now</button></main>',
    );

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 0, count: 0 });
  });

  it('does not combine numbered screen sections from different parents', async () => {
    const { win, parentPostMessage } = setupDeckBridge(
      '<main><section data-screen-label="01 Cover">One</section>' +
      '<div><section data-screen-label="02 Agenda">Two</section></div></main>',
    );

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 0, count: 0 });
  });

  it('keeps containerless multi-screen legacy decks navigable', async () => {
    const { win, parentPostMessage } = setupDeckBridge(
      '<main><section data-screen-label="01 Cover">One</section>' +
      '<section data-screen-label="02 Agenda">Two</section></main>',
    );

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 0, count: 2 });
  });

  it('counts persisted deck pages that use data-screen-label instead of .slide', async () => {
    // Runtime-managed decks persist this marker even when their generated
    // page classes do not include `.slide`. The thumbnail parser already
    // recognises it; the iframe bridge must use the same contract or Remix
    // opens with an empty left preview rail.
    const { win, parentPostMessage } = setupDeckBridge(`
      <main class="deck-stage">
        <section data-screen-label="Intro">One</section>
        <section data-screen-label="Plan">Two</section>
      </main>
    `);

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 0, count: 2 });
  });

  it('counts fixed-canvas slide-frame pages once a remixed project is declared as a deck', async () => {
    const { win, parentPostMessage } = setupDeckBridge(`
      <main>
        <section class="slide-frame">One</section>
        <section class="slide-frame">Two</section>
      </main>
    `);

    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 0, count: 2 });
  });

  it('counts nested .slide elements through a fallback when no structured container matches', async () => {
    // 8 slides nested two levels deep — none of `.deck > .slide`,
    // `.deck-stage > .slide`, `.deck-shell > .slide`, or `body > .slide`
    // matches them. The bridge must still count 8 so the host renders
    // `1 / 8` instead of the user-reported `1 / 0`.
    const slides = Array.from({ length: 8 }, (_, i) =>
      `<section class="slide">Slide ${i + 1}</section>`,
    ).join('');
    const { win, parentPostMessage } = setupDeckBridge(
      `<div class="deck-wrap"><div class="deck-inner">${slides}</div></div>`,
    );
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    const state = lastSlideState(parentPostMessage);
    expect(state).toBeDefined();
    expect(state.count).toBe(8);
  });

  it('still counts slides under the documented containers as direct children and ignores decorative .slide markup outside them', async () => {
    // Pin the structured-first contract: direct children of `.deck` /
    // `.deck-stage` / `.deck-shell` / `body` keep working as before AND
    // decorative `.slide` markup placed outside any structured container
    // (e.g. a utility class on a banner graphic) is not pulled in just
    // because it shares the class name. Without the structured-first
    // pass a broad `.slide` selector would count 4 here, so this fixture
    // pins the precedence directly rather than only by docstring.
    const slides = Array.from({ length: 3 }, (_, i) =>
      `<section class="slide">${i}</section>`,
    ).join('');
    const { win, parentPostMessage } = setupDeckBridge(
      `<header><span class="slide" aria-hidden="true">decoy</span></header><div class="deck">${slides}</div>`,
    );
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));
    const state = lastSlideState(parentPostMessage);
    expect(state).toBeDefined();
    expect(state.count).toBe(3);
  });

  it('advances transform-track decks that do not expose active classes or scroll state', async () => {
    const { win, parentPostMessage } = setupDeckBridge(`
      <style>
        html, body { margin: 0; overflow: hidden; }
        #deck { display: flex; width: 300vw; transform: translateX(0); }
        .slide { flex: 0 0 100vw; width: 100vw; height: 100vh; }
      </style>
      <div id="deck">
        <section class="slide">One</section>
        <section class="slide">Two</section>
        <section class="slide">Three</section>
      </div>
    `);
    const deck = win.document.getElementById('deck') as HTMLElement;

    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    expect(deck.style.transform).toBe('translateX(-100vw)');
    const state = lastSlideState(parentPostMessage);
    expect(state).toMatchObject({ active: 1, count: 3 });
  });

  it('does not double-advance decks that listen for keyboard navigation on both window and document', async () => {
    const { win, parentPostMessage } = setupDeckBridge(`
      <section class="slide active">One</section>
      <section class="slide">Two</section>
      <section class="slide">Three</section>
      <section class="slide">Four</section>
    `);
    const slides = Array.from(win.document.querySelectorAll('.slide'));
    let active = 0;
    function paint() {
      slides.forEach((slide, index) => {
        slide.classList.toggle('active', index === active);
      });
    }
    function go(index: number) {
      active = Math.max(0, Math.min(slides.length - 1, index));
      paint();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') go(active + 1);
      else if (event.key === 'ArrowLeft') go(active - 1);
    }
    win.addEventListener('keydown', onKey, true);
    win.document.addEventListener('keydown', onKey, true);
    paint();

    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 350));

    const activeSlide = Array.from(win.document.querySelectorAll('.slide'))
      .findIndex((slide) => slide.classList.contains('active'));
    expect(activeSlide).toBe(1);
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 4 });
  });

  it('prevents framework decks from handling one keyboard event on both window and document', async () => {
    const bodyHtml = `
      <div class="deck-stage" id="deck-stage">
        <section class="slide">One</section>
        <section class="slide">Two</section>
        <section class="slide">Three</section>
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
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: vi.fn() },
    });

    const slides = Array.from(win.document.querySelectorAll('.slide'));
    let active = 0;
    function paint() {
      slides.forEach((slide, index) => {
        slide.toggleAttribute('hidden', index !== active);
      });
    }
    function go(index: number) {
      active = Math.max(0, Math.min(slides.length - 1, index));
      paint();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'ArrowRight') return;
      event.preventDefault();
      go(active + 1);
    }
    win.addEventListener('keydown', onKey, true);
    win.document.addEventListener('keydown', onKey, true);
    paint();

    const evaluate = new win.Function(script);
    evaluate.call(win);
    win.document.body.dispatchEvent(new win.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowRight',
    }));

    expect(active).toBe(1);
  });

  it('scrolls documentElement when body looks horizontally scrollable in a sandboxed Simple Deck', async () => {
    const { win, parentPostMessage } = setupDeckBridge(`
      <style>
        html, body { margin: 0; height: 100%; }
        body { display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; }
        .slide { flex: 0 0 100vw; width: 100vw; height: 100vh; scroll-snap-align: start; }
      </style>
      <section class="slide">One</section>
      <section class="slide">Two</section>
      <section class="slide">Three</section>
    `);
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperties(win.document.body, {
      scrollWidth: { configurable: true, value: 3000 },
      clientWidth: { configurable: true, value: 1000 },
    });
    Object.defineProperties(win.document.documentElement, {
      scrollWidth: { configurable: true, value: 3000 },
      clientWidth: { configurable: true, value: 1000 },
    });
    const bodyScrollTo = vi.fn();
    const htmlScrollTo = vi.fn((options?: ScrollToOptions | number) => {
      const left = typeof options === 'number' ? options : Number(options?.left || 0);
      win.document.documentElement.scrollLeft = left;
    });
    win.document.body.scrollTo = bodyScrollTo;
    win.document.documentElement.scrollTo = htmlScrollTo;

    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 450));

    expect(bodyScrollTo).toHaveBeenCalledWith({ left: 1000, behavior: 'smooth' });
    expect(htmlScrollTo).toHaveBeenCalledWith({ left: 1000, behavior: 'smooth' });
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });
  });

  it('navigates vertically stacked deck pages through the thumbnail bridge', async () => {
    const { win, parentPostMessage } = setupDeckBridge(`
      <style>
        html, body { margin: 0; width: 100%; }
        body { overflow-x: hidden; overflow-y: auto; scroll-snap-type: y mandatory; }
        .slide { width: 100vw; height: 100vh; scroll-snap-align: start; }
      </style>
      <section class="slide">One</section>
      <section class="slide">Two</section>
      <section class="slide">Three</section>
    `);
    Object.defineProperty(win, 'innerHeight', { configurable: true, value: 700 });
    Object.defineProperties(win.document.body, {
      scrollHeight: { configurable: true, value: 2100 },
      clientHeight: { configurable: true, value: 700 },
    });
    Object.defineProperties(win.document.documentElement, {
      scrollHeight: { configurable: true, value: 2100 },
      clientHeight: { configurable: true, value: 700 },
    });
    const bodyScrollTo = vi.fn();
    const htmlScrollTo = vi.fn((options?: ScrollToOptions | number) => {
      const top = typeof options === 'number' ? 0 : Number(options?.top || 0);
      win.document.documentElement.scrollTop = top;
    });
    win.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
      const top = typeof options === 'number' ? 0 : Number(options?.top || 0);
      win.document.documentElement.scrollTop = top;
    }) as typeof win.scrollTo;
    win.document.body.scrollTo = bodyScrollTo;
    win.document.documentElement.scrollTo = htmlScrollTo;

    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 450));

    expect(win.scrollTo).toHaveBeenCalledWith({ top: 700, behavior: 'smooth' });
    expect(htmlScrollTo).toHaveBeenCalledWith({ top: 700, behavior: 'smooth' });
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });
  });

  it('falls back to one visible page when a sandbox ignores root scrolling APIs', async () => {
    const { win, parentPostMessage } = setupDeckBridge(`
      <style>
        body { display: flex; overflow-x: auto; overflow-y: hidden; }
        .slide { flex: 0 0 100vw; width: 100vw; height: 100vh; }
      </style>
      <section class="slide">One</section>
      <section class="slide">Two</section>
      <section class="slide">Three</section>
      <div id="counter">1 / 3</div>
    `);
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperties(win.document.body, {
      scrollWidth: { configurable: true, value: 3000 },
      clientWidth: { configurable: true, value: 1000 },
    });
    Object.defineProperties(win.document.documentElement, {
      scrollWidth: { configurable: true, value: 3000 },
      clientWidth: { configurable: true, value: 1000 },
    });
    win.scrollTo = vi.fn() as typeof win.scrollTo;
    win.document.body.scrollTo = vi.fn();
    win.document.documentElement.scrollTo = vi.fn();

    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 500));

    const slides = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
    expect(slides[0]!.style.display).toBe('none');
    expect(slides[1]!.style.display).toBe('');
    expect(win.document.getElementById('counter')?.textContent).toBe('2 / 3');
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });
  });

  it('updates Simple Deck direct progress fill when host navigation drives the slide', async () => {
    const { win } = setupDeckBridge(`
      <style>
        html, body { margin: 0; height: 100%; }
        body { display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; }
        .slide { flex: 0 0 100vw; width: 100vw; height: 100vh; scroll-snap-align: start; }
        .deck-progress { position: fixed; top: 0; left: 0; height: 3px; width: 0; }
      </style>
      <section class="slide">One</section>
      <section class="slide">Two</section>
      <section class="slide">Three</section>
      <div class="deck-progress" id="deck-progress" aria-hidden></div>
    `);
    Object.defineProperty(win, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperties(win.document.body, {
      scrollWidth: { configurable: true, value: 3000 },
      clientWidth: { configurable: true, value: 1000 },
    });
    Object.defineProperties(win.document.documentElement, {
      scrollWidth: { configurable: true, value: 3000 },
      clientWidth: { configurable: true, value: 1000 },
    });
    win.document.body.scrollTo = vi.fn();
    win.document.documentElement.scrollTo = vi.fn((options?: ScrollToOptions | number) => {
      const left = typeof options === 'number' ? options : Number(options?.left || 0);
      win.document.documentElement.scrollLeft = left;
    });

    postSlide(win, 'next');
    await new Promise<void>((resolve) => win.setTimeout(resolve, 450));

    expect((win.document.getElementById('deck-progress') as HTMLElement).style.width).toBe('66.66666666666666%');
  });
});
