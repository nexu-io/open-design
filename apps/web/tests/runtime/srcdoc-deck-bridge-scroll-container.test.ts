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

describe('deck bridge - scroll container fallback', () => {
  it('does not mistake a tall responsive class-toggle slide for a scroll deck', () => {
    const bodyHtml = `
      <style>
        html, body { margin: 0; }
        body { overflow: auto; }
        .slide { min-height: 800px; }
        .slide:not(.active) { display: none; }
      </style>
      <main class="deck">
        <section class="slide active">One</section>
        <section class="slide">Two</section>
        <section class="slide">Three</section>
      </main>
      <script>
        function showSlide(index) {
          document.querySelectorAll('.slide').forEach(function (slide, slideIndex) {
            slide.classList.toggle('active', slideIndex === index);
          });
        }
        window.addEventListener('keydown', function (event) {
          if (event.key === 'ArrowRight') showSlide(1);
        });
      </script>
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
    Object.defineProperty(win, 'innerHeight', {
      configurable: true,
      value: 360,
    });
    Object.defineProperty(win.document.body, 'scrollHeight', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(win.document.body, 'clientHeight', {
      configurable: true,
      value: 360,
    });
    Object.defineProperty(win.document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(win.document.documentElement, 'clientHeight', {
      configurable: true,
      value: 360,
    });
    Object.defineProperty(win.document, 'scrollingElement', {
      configurable: true,
      value: win.document.documentElement,
    });
    const windowScrollTo = vi.fn();
    win.scrollTo = windowScrollTo as typeof win.scrollTo;

    const evaluate = new win.Function(script);
    evaluate.call(win);
    const slides = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
    win.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight') return;
      slides.forEach((slide, index) => slide.classList.toggle('active', index === 1));
    });

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'go', index: 1 },
    }));

    expect(slides[0]?.classList.contains('active')).toBe(false);
    expect(slides[1]?.classList.contains('active')).toBe(true);
    expect(windowScrollTo).not.toHaveBeenCalled();
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });
  });

  it('keeps scrolling in-flow slides whose inactive class only changes opacity', async () => {
    const bodyHtml = `
      <style>
        html, body { margin: 0; overflow: hidden; }
        .slides-container { height: 800px; overflow-y: auto; }
        .slide { height: 800px; }
        .slide:not(.active) { opacity: 0; }
      </style>
      <main class="slides-container">
        <section class="slide active">One</section>
        <section class="slide">Two</section>
        <section class="slide">Three</section>
      </main>
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

    const container = win.document.querySelector<HTMLElement>('.slides-container')!;
    const slides = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 800 });
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 2400 });
    let containerScrollTop = 0;
    Object.defineProperty(container, 'scrollTop', {
      configurable: true,
      get: () => containerScrollTop,
      set: (value: number) => { containerScrollTop = value; },
    });
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: ({ top }: { top?: number }) => {
        if (typeof top === 'number') containerScrollTop = top;
      },
    });
    container.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1200,
      bottom: 800,
      width: 1200,
      height: 800,
      toJSON: () => ({}),
    });
    slides.forEach((slide, index) => {
      slide.getBoundingClientRect = () => {
        const top = index * 800 - containerScrollTop;
        return {
          x: 0,
          y: top,
          top,
          left: 0,
          right: 1200,
          bottom: top + 800,
          width: 1200,
          height: 800,
          toJSON: () => ({}),
        };
      };
    });

    const evaluate = new win.Function(script);
    evaluate.call(win);
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'go', index: 1 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 20));

    expect(container.scrollTop).toBe(800);
    expect(slides[0]?.classList.contains('active')).toBe(true);
    expect(slides[1]?.classList.contains('active')).toBe(false);
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });
  });

  it('treats a wide default root scroller as a scroll deck even without explicit overflow-x styling', async () => {
    const bodyHtml = `
      <section class="slide">One</section>
      <section class="slide">Two</section>
      <section class="slide">Three</section>
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
    win.scrollTo = vi.fn() as typeof win.scrollTo;
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
      set: (_value: number) => {
        bodyScrollLeft = 0;
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
      value: () => {},
    });
    Object.defineProperty(win.document.documentElement, 'scrollTo', {
      configurable: true,
      value: ({ left }: { left?: number }) => {
        if (typeof left === 'number') {
          win.document.documentElement.scrollLeft = left;
        }
      },
    });

    const evaluate = new win.Function(script);
    evaluate.call(win);
    win.dispatchEvent(new win.Event('load'));

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 420));

    expect(win.document.body.scrollLeft).toBe(0);
    expect(win.document.documentElement.scrollLeft).toBe(1000);
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });
  });

  it('tracks slide state from documentElement when body scrollLeft stays at zero', async () => {
    const bodyHtml = `
      <style>
        body { overflow-x: auto; }
      </style>
      <section class="slide">One</section>
      <section class="slide">Two</section>
      <section class="slide">Three</section>
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
    win.scrollTo = vi.fn() as typeof win.scrollTo;
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
      set: (_value: number) => {
        bodyScrollLeft = 0;
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
      value: () => {},
    });
    Object.defineProperty(win.document.documentElement, 'scrollTo', {
      configurable: true,
      value: ({ left }: { left?: number }) => {
        if (typeof left === 'number') {
          win.document.documentElement.scrollLeft = left;
        }
      },
    });

    const evaluate = new win.Function(script);
    evaluate.call(win);
    win.dispatchEvent(new win.Event('load'));

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 420));

    expect(win.document.body.scrollLeft).toBe(0);
    expect(win.document.documentElement.scrollLeft).toBe(1000);
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'next' },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 420));

    expect(win.document.documentElement.scrollLeft).toBe(2000);
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 2, count: 3 });
  });

  it('uses vertical slide geometry when a nested scroller also has horizontal overflow', async () => {
    const bodyHtml = `
      <style>
        html, body { overflow: hidden; }
        .slides-container { height: 800px; overflow-y: scroll; }
        .slide { height: 800px; }
      </style>
      <div class="slides-container">
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
    const windowScrollTo = vi.fn();
    win.scrollTo = windowScrollTo as typeof win.scrollTo;
    Object.defineProperty(win, 'scrollY', { configurable: true, value: 37 });
    const parentPostMessage = vi.fn();
    Object.defineProperty(win, 'parent', {
      configurable: true,
      value: { postMessage: parentPostMessage },
    });

    const container = win.document.querySelector<HTMLElement>('.slides-container')!;
    const slides = Array.from(win.document.querySelectorAll<HTMLElement>('.slide'));
    Object.defineProperty(container, 'clientHeight', { configurable: true, value: 800 });
    Object.defineProperty(container, 'scrollHeight', { configurable: true, value: 2400 });
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: 1200 });
    // A classic scrollbar or slightly over-wide child can make overflow-x
    // compute to auto with a small real overflow. Slide geometry, not the
    // first overflowing axis, must still identify this as a vertical deck.
    Object.defineProperty(container, 'scrollWidth', { configurable: true, value: 1210 });
    let containerScrollTop = 0;
    Object.defineProperty(container, 'scrollTop', {
      configurable: true,
      get: () => containerScrollTop,
      set: (value: number) => { containerScrollTop = value; },
    });
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: ({ top }: { top?: number }) => {
        if (typeof top === 'number') containerScrollTop = top;
      },
    });
    container.getBoundingClientRect = () => ({
      x: 0,
      y: 50,
      top: 50,
      left: 0,
      right: 1200,
      bottom: 850,
      width: 1200,
      height: 800,
      toJSON: () => ({}),
    });
    slides.forEach((slide, index) => {
      slide.getBoundingClientRect = () => {
        const top = 50 + index * 800 - containerScrollTop;
        return {
          x: 0,
          y: top,
          top,
          left: 0,
          right: 1200,
          bottom: top + 800,
          width: 1200,
          height: 800,
          toJSON: () => ({}),
        };
      };
    });
    const scrollIntoView = vi.fn();
    Object.defineProperty(slides[1], 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    const evaluate = new win.Function(script);
    evaluate.call(win);
    win.dispatchEvent(new win.Event('load'));

    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'go', index: 1 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 450));

    expect(container.scrollTop).toBe(800);
    expect(win.scrollY).toBe(37);
    expect(windowScrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 1, count: 3 });

    // If the nested scroller ignores a later smooth-scroll request, the bridge
    // falls back to one visible page. That fallback must reset only the nested
    // element; touching window/root scroll would jump the surrounding workspace
    // to the top.
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: () => {},
    });
    win.dispatchEvent(new win.MessageEvent('message', {
      data: { type: 'od:slide', action: 'go', index: 2 },
    }));
    await new Promise<void>((resolve) => win.setTimeout(resolve, 450));

    expect(container.scrollTop).toBe(0);
    expect(win.scrollY).toBe(37);
    expect(windowScrollTo).not.toHaveBeenCalled();
    expect(lastSlideState(parentPostMessage)).toMatchObject({ active: 2, count: 3 });
  });
});
