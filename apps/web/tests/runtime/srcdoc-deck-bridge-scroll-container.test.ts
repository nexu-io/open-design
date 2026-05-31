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
});
