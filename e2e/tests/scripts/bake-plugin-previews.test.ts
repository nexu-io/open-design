import { afterEach, describe, expect, it, vi } from 'vitest';

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalGetComputedStyle = globalThis.getComputedStyle;

afterEach(() => {
  Object.assign(globalThis, {
    document: originalDocument,
    window: originalWindow,
    getComputedStyle: originalGetComputedStyle,
  });
});

describe('bake-plugin-previews vertical deck driver', () => {
  it('[P1] advances Daisy Days-style slides through their nested scroller', async () => {
    const scriptUrl = new URL('../../../scripts/bake-plugin-previews.mjs', import.meta.url).href;
    const { verticalDeckState } = await import(/* @vite-ignore */ scriptUrl) as {
      verticalDeckState: (
        selector: string,
        action: 'probe' | 'advance',
      ) => { hasStack: boolean; moved: boolean };
    };

    let scrollTop = 0;
    const body = { scrollTop: 0 };
    const html = { scrollTop: 0 };
    const container = {
      parentElement: body,
      clientHeight: 800,
      clientWidth: 1200,
      scrollHeight: 2400,
      scrollWidth: 1200,
      scrollLeft: 0,
      get scrollTop() { return scrollTop; },
      set scrollTop(value: number) { scrollTop = value; },
      contains: (slide: unknown) => (slides as unknown[]).includes(slide),
      getBoundingClientRect: () => ({ top: 40 }),
      scrollTo: ({ top }: { top: number }) => { scrollTop = top; },
    };
    const slides = Array.from({ length: 3 }, (_, index) => ({
      parentElement: container,
      getBoundingClientRect: () => ({
        width: 1200,
        height: 800,
        top: 40 + index * 800 - scrollTop,
      }),
    }));
    const windowScrollTo = vi.fn();
    Object.assign(globalThis, {
      document: {
        body,
        documentElement: html,
        scrollingElement: html,
        querySelectorAll: () => slides,
      },
      window: {
        innerHeight: 800,
        scrollX: 0,
        scrollY: 19,
        pageYOffset: 19,
        scrollTo: windowScrollTo,
        __odBakeVerticalSlideIndex: 0,
      },
      getComputedStyle: (element: unknown) => ({
        display: 'block',
        visibility: 'visible',
        overflowY: element === container ? 'scroll' : 'visible',
      }),
    });

    expect(verticalDeckState('.slide', 'probe')).toEqual({ hasStack: true, moved: false });
    expect(verticalDeckState('.slide', 'advance')).toEqual({ hasStack: true, moved: true });
    expect(scrollTop).toBe(800);
    expect(verticalDeckState('.slide', 'advance')).toEqual({ hasStack: true, moved: true });
    expect(scrollTop).toBe(1600);
    expect(windowScrollTo).not.toHaveBeenCalled();
  });
});
