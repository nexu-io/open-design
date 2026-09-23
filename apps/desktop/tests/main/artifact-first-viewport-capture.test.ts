import { runInNewContext } from 'node:vm';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Rect = { x: number; y: number; width: number; height: number };

const harness = vi.hoisted(() => ({
  /** Ordered log of every renderer interaction, so "before/after" is testable. */
  events: [] as string[],
  /** Every source string handed to `executeJavaScript`. */
  scripts: [] as string[],
  /** Every `capturePage` argument, in order. */
  captureRects: [] as (Rect | undefined)[],
  /** Every `setContentSize` argument pair, in order. */
  contentSizes: [] as [number, number][],
  /** Every CDP command, in order. */
  cdp: [] as { command: string; params: unknown }[],
  /** Constructor options of every BrowserWindow the export opened. */
  windowOptions: [] as Record<string, unknown>[],
  /** Options handed to `waitForPrintableContent`. */
  printableWaits: [] as unknown[],
  /** Per-capture alpha byte; 0 means Chromium handed back a transparent frame. */
  captureAlphas: [] as number[],
  /** Answer for the page-height probe used by the full-page export path. */
  scrollHeight: 2_400,
  debuggerAttachThrows: false,
}));

vi.mock('electron', () => {
  function paintedBitmap(alpha: number): Buffer {
    const bitmap = Buffer.alloc(16);
    for (let offset = 3; offset < bitmap.length; offset += 4) bitmap[offset] = alpha;
    return bitmap;
  }

  class BrowserWindow {
    static instances: BrowserWindow[] = [];

    destroyed = false;

    readonly webContents = {
      capturePage: async (rect?: Rect) => {
        harness.events.push('capturePage');
        harness.captureRects.push(rect);
        const alpha = harness.captureAlphas.length > 0 ? harness.captureAlphas.shift()! : 255;
        return {
          getSize: () => ({ height: 900, width: 1440 }),
          toBitmap: () => paintedBitmap(alpha),
          toJPEG: () => Buffer.from('jpeg-bytes'),
          toPNG: () => Buffer.from('png-bytes'),
        };
      },
      debugger: {
        attach: () => {
          if (harness.debuggerAttachThrows) throw new Error('debugger unavailable');
          harness.events.push('debugger.attach');
        },
        detach: () => harness.events.push('debugger.detach'),
        isAttached: () => false,
        sendCommand: async (command: string, params: unknown) => {
          harness.events.push(`cdp:${command}`);
          harness.cdp.push({ command, params });
          return {};
        },
      },
      executeJavaScript: async (source: string): Promise<unknown> => {
        harness.scripts.push(source);
        if (source.includes('scrollHeight')) {
          harness.events.push('measure:scrollHeight');
          return harness.scrollHeight;
        }
        if (source.includes('getAnimations')) {
          harness.events.push('freeze');
          return { finished: 0, paused: 0 };
        }
        harness.events.push('script');
        return true;
      },
      on: () => undefined,
      once: () => undefined,
      setWindowOpenHandler: () => undefined,
      stop: () => undefined,
    };

    constructor(options: Record<string, unknown>) {
      harness.windowOptions.push(options);
      BrowserWindow.instances.push(this);
    }

    destroy() {
      this.destroyed = true;
    }

    getContentSize(): [number, number] {
      return [1440, 900];
    }

    isDestroyed() {
      return this.destroyed;
    }

    async loadURL() {
      harness.events.push('loadURL');
    }

    setContentSize(width: number, height: number) {
      harness.events.push(`setContentSize:${width}x${height}`);
      harness.contentSizes.push([width, height]);
    }

    setOpacity() {}

    showInactive() {}
  }

  return { BrowserWindow, nativeImage: { createFromBuffer: () => ({ toBitmap: () => Buffer.alloc(0) }) } };
});

vi.mock('../../src/main/pdf-export.js', () => ({
  DECK_PAGE_SIZE: { height: 5.625, width: 10 },
  DECK_PRINT_CSS: '',
  inferPageSize: async () => ({ height: 11, width: 8.5 }),
  waitForPrintableContent: async (_window: unknown, options?: unknown) => {
    harness.events.push('waitForPrintableContent');
    harness.printableWaits.push(options);
  },
}));

import { exportArtifact, THUMBNAIL_VIEWPORT } from '../../src/main/artifact-export.js';

const HTML = '<html><body><h1>cover</h1></body></html>';

function thumbnailInput(overrides: Record<string, unknown> = {}) {
  return {
    captureMode: 'first_viewport_thumbnail' as const,
    deck: false,
    format: 'image' as const,
    html: HTML,
    title: 'Cover',
    ...overrides,
  };
}

function freezeScript(): string {
  const script = harness.scripts.find((source) => source.includes('getAnimations'));
  expect(script, 'no static-capture freeze script was injected').toBeTruthy();
  return script!;
}

beforeEach(() => {
  harness.events.length = 0;
  harness.scripts.length = 0;
  harness.captureRects.length = 0;
  harness.contentSizes.length = 0;
  harness.cdp.length = 0;
  harness.windowOptions.length = 0;
  harness.printableWaits.length = 0;
  harness.captureAlphas.length = 0;
  harness.scrollHeight = 2_400;
  harness.debuggerAttachThrows = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('first-viewport thumbnail capture', () => {
  it('[P0] never measures the page height and never grows the window', async () => {
    // This is the whole difference from the long-image export. Measuring
    // scrollHeight and calling setContentSize with it is what makes cost scale
    // with page length; a chat card only ever shows the first screen.
    const result = await exportArtifact(thumbnailInput());

    expect(result.ok).toBe(true);
    expect(harness.scripts.some((source) => source.includes('scrollHeight'))).toBe(false);
    for (const [, height] of harness.contentSizes) {
      expect(height).toBe(THUMBNAIL_VIEWPORT.height);
    }
  });

  it('captures exactly the fixed logical viewport, from the top-left', async () => {
    await exportArtifact(thumbnailInput());

    expect(THUMBNAIL_VIEWPORT).toEqual({ height: 900, width: 1440 });
    expect(harness.captureRects).toEqual([
      { height: 900, width: 1440, x: 0, y: 0 },
    ]);
  });

  it('honours an explicit viewport when the caller asks for one', async () => {
    await exportArtifact(thumbnailInput({ height: 720, width: 1280 }));

    expect(harness.captureRects).toEqual([
      { height: 720, width: 1280, x: 0, y: 0 },
    ]);
  });

  it('freezes motion and pins the page to the top before it shoots', async () => {
    await exportArtifact(thumbnailInput());

    const freezeIndex = harness.events.indexOf('freeze');
    const captureIndex = harness.events.indexOf('capturePage');
    expect(freezeIndex).toBeGreaterThanOrEqual(0);
    expect(captureIndex).toBeGreaterThan(freezeIndex);
  });

  it('finishes the animations it can and pauses the ones it cannot', async () => {
    // An infinite animation throws on finish(); pausing it is the only way to
    // pin a frame. A substring check would not catch a swapped fallback, so run
    // the script the export actually injected, for real, against a stub page.
    await exportArtifact(thumbnailInput());

    const finished: string[] = [];
    const paused: string[] = [];
    const appended: { attributes: Record<string, string>; textContent: string }[] = [];

    const animation = (name: string, infinite: boolean) => ({
      finish: () => {
        if (infinite) throw new Error('Cannot finish an infinite animation');
        finished.push(name);
      },
      pause: () => paused.push(name),
    });

    const style = {
      attributes: {} as Record<string, string>,
      setAttribute(key: string, value: string) {
        this.attributes[key] = value;
      },
      textContent: '',
    };
    let scrolledTo: [number, number] | null = null;
    const documentElement = { scrollTop: 400, style: {} as Record<string, string> };
    const body = { scrollTop: 400, style: {} as Record<string, string> };
    const sandbox = {
      document: {
        body,
        createElement: () => style,
        documentElement,
        getAnimations: () => [animation('fade', false), animation('spinner', true)],
        head: { appendChild: (node: typeof style) => appended.push(node as never) },
      },
      window: {
        scrollTo: (...args: unknown[]) => {
          scrolledTo =
            typeof args[0] === 'object' && args[0] !== null
              ? [
                  (args[0] as { left?: number }).left ?? 0,
                  (args[0] as { top?: number }).top ?? 0,
                ]
              : [args[0] as number, args[1] as number];
        },
      },
    };

    const outcome = runInNewContext(freezeScript(), sandbox) as {
      finished: number;
      paused: number;
    };

    expect(finished).toEqual(['fade']);
    expect(paused).toEqual(['spinner']);
    expect(outcome).toEqual({ finished: 1, paused: 1 });
    expect(scrolledTo).toEqual([0, 0]);
    expect(documentElement.scrollTop).toBe(0);
    expect(body.scrollTop).toBe(0);
    expect(appended).toHaveLength(1);
    expect(appended[0]!.textContent).toContain('animation-duration:0s!important');
    expect(appended[0]!.textContent).toContain('transition-duration:0s!important');
    expect(appended[0]!.textContent).toContain('scroll-behavior:auto!important');
    expect(appended[0]!.textContent).toContain('cursor:none!important');
  });

  it('tells Chromium the viewer prefers reduced motion', async () => {
    // A hand-rolled JS animation reads the media query, not our CSS override.
    // Without the emulation those keep running and the shot is a random frame.
    await exportArtifact(thumbnailInput());

    const emulated = harness.cdp.find(({ command }) => command === 'Emulation.setEmulatedMedia');
    expect(emulated?.params).toMatchObject({
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
  });

  it('still produces a cover when the debugger cannot attach', async () => {
    // Reduced-motion emulation is a bonus, not a precondition: the CSS freeze
    // alone already pins every declarative animation.
    harness.debuggerAttachThrows = true;

    const result = await exportArtifact(thumbnailInput());

    expect(result.ok).toBe(true);
    expect(harness.captureRects).toHaveLength(1);
  });

  it('spends the tight thumbnail budget on first-screen resources only', async () => {
    // Not the 15s an explicit export gets, and not the whole document's
    // resource set: nothing below the fold can change a pixel of the cover.
    await exportArtifact(thumbnailInput());

    expect(harness.printableWaits).toEqual([
      { budgetMs: 5_000, firstViewportOnly: true },
    ]);
  });

  it('retries a transparent frame twice, then reports it honestly', async () => {
    // Never fabricate: the web card needs to know there is no snapshot so it
    // can fall back to a live iframe.
    harness.captureAlphas.push(0, 0, 0);

    const result = await exportArtifact(thumbnailInput());

    expect(harness.captureRects).toHaveLength(3);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('capture_blank');
    expect(result.path).toBeUndefined();
  });

  it('accepts a frame that paints on the retry', async () => {
    harness.captureAlphas.push(0, 255);

    const result = await exportArtifact(thumbnailInput());

    expect(harness.captureRects).toHaveLength(2);
    expect(result.ok).toBe(true);
    expect(result.mime).toBe('image/png');
  });

  it('refuses a thumbnail asked for as a PDF without opening a window', async () => {
    const result = await exportArtifact(thumbnailInput({ format: 'pdf' }));

    expect(result.ok).toBe(false);
    expect(result.code).toBe('unsupported_capture_mode');
    expect(harness.windowOptions).toHaveLength(0);
  });
});

describe('full-page export path stays exactly as it was', () => {
  it('measures the page and grows the window when no capture mode is given', async () => {
    const result = await exportArtifact({
      deck: false,
      format: 'image',
      html: HTML,
      title: 'Long image',
    });

    expect(result.ok).toBe(true);
    expect(harness.events).toContain('measure:scrollHeight');
    expect(harness.contentSizes).toEqual([[1440, 2_400]]);
    // The long-image export takes the whole surface, not a clipped rect.
    expect(harness.captureRects).toEqual([undefined]);
    // And it keeps the generous 15s resource budget.
    expect(harness.printableWaits).toEqual([undefined, undefined]);
  });

  it('does not freeze or emulate anything on the export path', async () => {
    await exportArtifact({ deck: false, format: 'image', html: HTML, title: 'Long image' });

    expect(harness.scripts.some((source) => source.includes('getAnimations'))).toBe(false);
    expect(harness.cdp).toHaveLength(0);
  });
});
