import { runInNewContext } from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

import {
  intersectsFirstViewport,
  waitForPrintableContent,
} from '../../src/main/pdf-export.js';

const VIEWPORT_HEIGHT = 900;

type FakeRect = { bottom: number; top: number };

/**
 * Runs the real in-page script against a stub document and reports which
 * resources it actually decided to wait on.
 *
 * Asserting on the emitted source would not catch a gate that is present but
 * never applied — so this executes it.
 */
async function resourcesWaitedFor(
  script: string,
  page: {
    backgrounds: { rect: FakeRect; url: string }[];
    images: { name: string; rect: FakeRect }[];
  },
): Promise<{ backgroundUrls: string[]; imageNames: string[] }> {
  const imageNames: string[] = [];
  const backgroundUrls: string[] = [];

  const rectOf = (rect: FakeRect) => () => ({ ...rect, height: rect.bottom - rect.top, left: 0, right: 0, width: 0, x: 0, y: rect.top });

  const images = page.images.map(({ name, rect }) => ({
    addEventListener: () => {},
    get complete() {
      imageNames.push(name);
      return true;
    },
    getBoundingClientRect: rectOf(rect),
  }));
  const backgroundNodes = page.backgrounds.map(({ rect, url }) => ({
    getBoundingClientRect: rectOf(rect),
    __backgroundImage: `url("${url}")`,
  }));

  const sandbox = {
    Image: class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        backgroundUrls.push(value);
        setTimeout(() => this.onload?.(), 0);
      }
    },
    Promise,
    Set,
    document: {
      fonts: { ready: Promise.resolve() },
      images,
      querySelectorAll: () => backgroundNodes,
    },
    requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
    setTimeout,
    window: {
      getComputedStyle: (el: { __backgroundImage?: string }) => ({
        backgroundImage: el.__backgroundImage ?? 'none',
        borderImageSource: 'none',
        listStyleImage: 'none',
      }),
      innerHeight: VIEWPORT_HEIGHT,
    },
  };

  await (runInNewContext(script, sandbox) as Promise<unknown>);
  return { backgroundUrls, imageNames };
}

/**
 * Records the in-page script `waitForPrintableContent` injects, so the
 * first-viewport gate can be inspected without booting Chromium.
 */
function recordingWindow() {
  const scripts: string[] = [];
  return {
    scripts,
    window: {
      webContents: {
        executeJavaScript: async (source: string) => {
          scripts.push(source);
          return { stalled: false };
        },
        stop: vi.fn(),
      },
    },
  };
}

describe('intersectsFirstViewport', () => {
  it('keeps anything that starts above the fold', () => {
    expect(intersectsFirstViewport({ bottom: 200, top: 0 }, 900)).toBe(true);
    expect(intersectsFirstViewport({ bottom: 1_400, top: 880 }, 900)).toBe(true);
  });

  it('drops what is entirely below the fold', () => {
    // This is the cost that a cover must not pay: a long page's 200th image is
    // not in the shot, so waiting on it only spends the thumbnail's budget.
    expect(intersectsFirstViewport({ bottom: 1_200, top: 900 }, 900)).toBe(false);
    expect(intersectsFirstViewport({ bottom: 4_000, top: 3_800 }, 900)).toBe(false);
  });

  it('keeps an element scrolled partly above the origin', () => {
    expect(intersectsFirstViewport({ bottom: 40, top: -120 }, 900)).toBe(true);
  });

  it('drops one entirely above the origin', () => {
    expect(intersectsFirstViewport({ bottom: -10, top: -300 }, 900)).toBe(false);
  });

  it('treats a zero-height placeholder at the top as visible', () => {
    // An <img> that has not loaded yet often lays out with no height. It is
    // still the thing the cover is waiting for.
    expect(intersectsFirstViewport({ bottom: 0, top: 0 }, 900)).toBe(true);
  });
});

const PAGE = {
  backgrounds: [
    { rect: { bottom: 300, top: 0 }, url: 'hero-bg.png' },
    { rect: { bottom: 4_200, top: 3_900 }, url: 'footer-bg.png' },
  ],
  images: [
    { name: 'above-the-fold', rect: { bottom: 400, top: 40 } },
    { name: 'straddling-the-fold', rect: { bottom: 1_100, top: 860 } },
    { name: 'below-the-fold', rect: { bottom: 2_000, top: 1_800 } },
    { name: 'far-below', rect: { bottom: 9_000, top: 8_800 } },
  ],
};

describe('waitForPrintableContent scope', () => {
  it('waits only on first-screen resources when asked to', async () => {
    const recorder = recordingWindow();

    await waitForPrintableContent(recorder.window as never, {
      budgetMs: 5_000,
      firstViewportOnly: true,
    });

    const waited = await resourcesWaitedFor(recorder.scripts[0]!, PAGE);

    expect(waited.imageNames).toEqual(['above-the-fold', 'straddling-the-fold']);
    expect(waited.backgroundUrls).toEqual(['hero-bg.png']);
  });

  it('leaves the export path waiting for the whole document', async () => {
    // The long-image export renders every pixel of the page, so it has to keep
    // waiting for every resource — this is the regression this mode must not
    // cause.
    const recorder = recordingWindow();

    await waitForPrintableContent(recorder.window as never);

    const waited = await resourcesWaitedFor(recorder.scripts[0]!, PAGE);

    expect(waited.imageNames).toEqual([
      'above-the-fold',
      'straddling-the-fold',
      'below-the-fold',
      'far-below',
    ]);
    expect(waited.backgroundUrls).toEqual(['hero-bg.png', 'footer-bg.png']);
  });

  it('uses the shared predicate rather than a second hand-rolled copy', () => {
    const recorder = recordingWindow();
    void waitForPrintableContent(recorder.window as never, { firstViewportOnly: true });

    expect(recorder.scripts[0]).toContain(intersectsFirstViewport.name);
  });
});
