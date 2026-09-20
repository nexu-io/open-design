import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PREVIEW_FIRST_PAINT_MESSAGE_TYPE,
  PREVIEW_FIRST_PAINT_TIMEOUT_MS,
  PREVIEW_OBSERVABILITY_HOST_STATE_MESSAGE_TYPE,
  PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
  buildPreviewObservabilityBridge,
  parsePreviewFirstPaintMessage,
  type PreviewFirstPaintMessage,
} from '@open-design/contracts/runtime/preview-observability';

interface ScheduledTask {
  at: number;
  callback: () => void;
  delay: number;
  id: number;
}

interface PaintEntryInput {
  name: string;
  startTime: number;
}

interface PaintHarness {
  advanceBy: (durationMs: number) => void;
  close: () => void;
  /** Number of animation-frame callbacks the bridge has asked for. */
  frameRequestCount: () => number;
  /** Run every animation-frame callback the bridge is currently waiting on. */
  flushFrames: () => void;
  /** Deliver a paint entry the way a live PerformanceObserver would. */
  emitPaintEntry: (entry: PaintEntryInput) => void;
  /**
   * Timers armed at the paint deadline. A settled probe must hold none; the
   * white-screen and deck probes keep their own, on other delays.
   */
  paintDeadlineTimers: () => number;
  observerCount: () => number;
  paintReports: PreviewFirstPaintMessage[];
  otherMessages: unknown[];
  fireLoad: () => void;
  setHostActive: (active: boolean, token?: string) => void;
  setVisibility: (value: DocumentVisibilityState) => void;
  setViewport: (width: number, height: number) => void;
  window: JSDOM['window'];
}

function bridgeScriptBody(): string {
  return buildPreviewObservabilityBridge()
    .replace(/^<script[^>]*>/, '')
    .replace(/<\/script>$/, '');
}

function createPaintHarness(options: {
  body?: string;
  bufferedPaintEntries?: PaintEntryInput[];
  performanceObserver?: boolean;
  readyState?: DocumentReadyState;
} = {}): PaintHarness {
  const dom = new JSDOM(`<!doctype html><html><body>${options.body ?? ''}</body></html>`, {
    pretendToBeVisual: false,
    runScripts: 'outside-only',
    url: 'http://preview.test/',
  });
  const win = dom.window;
  const paintReports: PreviewFirstPaintMessage[] = [];
  const otherMessages: unknown[] = [];
  const tasks: ScheduledTask[] = [];
  const frames: Array<(time: number) => void> = [];
  const observers: Array<{ callback: (list: { getEntries: () => PaintEntryInput[] }) => void; connected: boolean }> = [];
  const bufferedEntries = [...(options.bufferedPaintEntries ?? [])];
  let frameRequestCount = 0;
  let nextTaskId = 0;
  let now = 0;
  let readyState: DocumentReadyState = options.readyState ?? 'complete';
  let visibility: DocumentVisibilityState = 'visible';
  let viewportWidth = 1280;
  let viewportHeight = 720;

  Object.defineProperties(win.document, {
    readyState: { configurable: true, get: () => readyState },
    visibilityState: { configurable: true, get: () => visibility },
  });
  Object.defineProperties(win, {
    innerHeight: { configurable: true, get: () => viewportHeight },
    innerWidth: { configurable: true, get: () => viewportWidth },
  });
  // JSDOM lays nothing out, so every rect is zero and no element would ever
  // read as painted. Give the document a real box; visibility is then decided
  // by the bridge's own rules (display/opacity/text/background), which is what
  // these tests are about.
  win.Element.prototype.getBoundingClientRect = () => ({
    bottom: 300,
    height: 300,
    left: 0,
    right: 800,
    top: 0,
    width: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect;

  Object.defineProperty(win, 'performance', {
    configurable: true,
    value: {
      getEntriesByType: (type: string) => (type === 'paint' ? bufferedEntries.slice() : []),
      now: () => now,
    },
  });
  if (options.performanceObserver === false) {
    Object.defineProperty(win, 'PerformanceObserver', { configurable: true, value: undefined });
  } else {
    Object.defineProperty(win, 'PerformanceObserver', {
      configurable: true,
      value: class {
        #record: { callback: (list: { getEntries: () => PaintEntryInput[] }) => void; connected: boolean };

        constructor(callback: (list: { getEntries: () => PaintEntryInput[] }) => void) {
          this.#record = { callback, connected: false };
          observers.push(this.#record);
        }

        observe(): void {
          this.#record.connected = true;
        }

        disconnect(): void {
          this.#record.connected = false;
        }
      },
    });
  }

  win.postMessage = ((data: unknown) => {
    const paint = parsePreviewFirstPaintMessage(data);
    if (paint) {
      paintReports.push(paint);
      return;
    }
    if (
      data
      && typeof data === 'object'
      && (data as { type?: unknown }).type === PREVIEW_OBSERVABILITY_MESSAGE_TYPE
    ) {
      otherMessages.push(data);
    }
  }) as typeof win.postMessage;
  win.setTimeout = ((callback: TimerHandler, delay = 0) => {
    nextTaskId += 1;
    tasks.push({
      at: now + Number(delay),
      callback: () => {
        if (typeof callback === 'function') callback();
      },
      delay: Number(delay),
      id: nextTaskId,
    });
    return nextTaskId;
  }) as typeof win.setTimeout;
  win.clearTimeout = ((id: number) => {
    const index = tasks.findIndex((task) => task.id === id);
    if (index >= 0) tasks.splice(index, 1);
  }) as typeof win.clearTimeout;
  win.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    frameRequestCount += 1;
    frames.push(callback);
    return frameRequestCount;
  }) as typeof win.requestAnimationFrame;

  win.eval(bridgeScriptBody());

  const flushFrames = () => {
    for (const frame of frames.splice(0)) frame(now);
  };

  return {
    advanceBy(durationMs) {
      const target = now + durationMs;
      for (;;) {
        tasks.sort((left, right) => left.at - right.at || left.id - right.id);
        const task = tasks[0];
        if (!task || task.at > target) break;
        tasks.shift();
        now = task.at;
        task.callback();
        flushFrames();
      }
      now = target;
      flushFrames();
    },
    close: () => win.close(),
    emitPaintEntry(entry) {
      bufferedEntries.push(entry);
      for (const observer of observers) {
        if (observer.connected) observer.callback({ getEntries: () => [entry] });
      }
    },
    fireLoad() {
      readyState = 'complete';
      win.dispatchEvent(new win.Event('load'));
    },
    flushFrames,
    frameRequestCount: () => frameRequestCount,
    observerCount: () => observers.filter((observer) => observer.connected).length,
    otherMessages,
    paintReports,
    paintDeadlineTimers: () => tasks.filter((task) => task.delay === PREVIEW_FIRST_PAINT_TIMEOUT_MS).length,
    setHostActive(active, token) {
      win.dispatchEvent(new win.MessageEvent('message', {
        data: {
          type: PREVIEW_OBSERVABILITY_HOST_STATE_MESSAGE_TYPE,
          active,
          ...(token === undefined ? {} : { token }),
        },
      }));
      flushFrames();
    },
    setViewport(width, height) {
      viewportWidth = width;
      viewportHeight = height;
      win.dispatchEvent(new win.Event('resize'));
      flushFrames();
    },
    setVisibility(value) {
      visibility = value;
      win.document.dispatchEvent(new win.Event('visibilitychange'));
      flushFrames();
    },
    window: win,
  };
}

const harnesses: PaintHarness[] = [];

afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.close();
});

function harness(options: Parameters<typeof createPaintHarness>[0] = {}): PaintHarness {
  const created = createPaintHarness(options);
  harnesses.push(created);
  return created;
}

describe('preview first-visible-paint bridge report', () => {
  it('stays silent until the host says this frame is the one on screen', () => {
    const probe = harness({ body: '<main>Rendered</main>' });

    probe.advanceBy(60_000);

    expect(probe.paintReports).toEqual([]);
    expect(probe.frameRequestCount()).toBe(0);
  });

  it('reads the paint the browser already recorded instead of probing for it', () => {
    const probe = harness({
      body: '<main>Rendered</main>',
      bufferedPaintEntries: [{ name: 'first-contentful-paint', startTime: 318.6 }],
    });

    probe.setHostActive(true);

    expect(probe.paintReports).toEqual([
      expect.objectContaining({
        detector: 'bridge_report',
        paint_observed: true,
        elapsed_ms: 319,
      }),
    ]);
    expect(probe.paintReports[0]?.visible_element_count).toBeGreaterThan(0);
    // Observation of an already-recorded entry costs nothing: no frame
    // callback, no observer left connected, no timer left armed.
    expect(probe.frameRequestCount()).toBe(0);
    expect(probe.observerCount()).toBe(0);
    expect(probe.paintDeadlineTimers()).toBe(0);
  });

  it('relays a paint entry that lands after the frame went on screen', () => {
    // Still loading, so the load-frame fallback below cannot answer first.
    const probe = harness({ body: '<main>Rendered</main>', readyState: 'loading' });

    probe.setHostActive(true);
    expect(probe.paintReports).toEqual([]);

    probe.emitPaintEntry({ name: 'first-contentful-paint', startTime: 120 });

    expect(probe.paintReports).toEqual([
      expect.objectContaining({ detector: 'bridge_report', elapsed_ms: 120, paint_observed: true }),
    ]);
    expect(probe.observerCount()).toBe(0);
    expect(probe.paintDeadlineTimers()).toBe(0);
  });

  it('falls back to exactly one animation frame where paint timing is unavailable', () => {
    const probe = harness({
      body: '<main>Rendered</main>',
      performanceObserver: false,
      readyState: 'loading',
    });

    probe.setHostActive(true);
    expect(probe.frameRequestCount()).toBe(0);

    probe.fireLoad();
    probe.flushFrames();

    expect(probe.paintReports).toEqual([
      expect.objectContaining({ detector: 'raf_probe', paint_observed: true }),
    ]);
    expect(probe.paintReports[0]?.visible_element_count).toBeGreaterThan(0);
    expect(probe.frameRequestCount()).toBe(1);
    expect(probe.paintDeadlineTimers()).toBe(0);
  });

  it('records a probe that gave up as an absent measurement, before the blank verdict', () => {
    const probe = harness({ body: '', performanceObserver: false, readyState: 'loading' });

    probe.setHostActive(true);
    probe.advanceBy(PREVIEW_FIRST_PAINT_TIMEOUT_MS);

    expect(probe.paintReports).toEqual([
      expect.objectContaining({
        detector: 'timeout',
        paint_observed: false,
        visible_element_count: 0,
      }),
    ]);
    // The document never reached `load`, so the white-screen probe cannot have
    // spoken yet. Dropping this row is exactly how the slowest previews would
    // disappear from a coverage panel and read as though they got faster.
    expect(probe.otherMessages).toEqual([]);
  });

  it('reports once per document and then holds no timer, observer, or frame', () => {
    const probe = harness({
      body: '<main>Rendered</main>',
      bufferedPaintEntries: [{ name: 'first-contentful-paint', startTime: 40 }],
    });

    probe.setHostActive(true);
    probe.setHostActive(false);
    probe.setHostActive(true);
    probe.setVisibility('hidden');
    probe.setVisibility('visible');
    probe.setViewport(800, 600);
    probe.advanceBy(120_000);

    expect(probe.paintReports).toHaveLength(1);
    expect(probe.frameRequestCount()).toBe(0);
    expect(probe.observerCount()).toBe(0);
  });

  it('never reports a timeout for a frame the host took off screen', () => {
    const probe = harness({ body: '', performanceObserver: false, readyState: 'loading' });

    probe.setHostActive(true);
    probe.setHostActive(false);
    probe.advanceBy(120_000);

    expect(probe.paintReports).toEqual([]);

    // Back on screen: the probe re-arms and reaches a verdict from there.
    probe.setHostActive(true);
    probe.advanceBy(PREVIEW_FIRST_PAINT_TIMEOUT_MS);

    expect(probe.paintReports).toEqual([
      expect.objectContaining({ detector: 'timeout', paint_observed: false }),
    ]);
  });

  it('measures a second attach when the host stamps it with a new token', () => {
    const probe = harness({
      body: '<main>Rendered</main>',
      bufferedPaintEntries: [{ name: 'first-contentful-paint', startTime: 40 }],
    });

    probe.setHostActive(true, 'attach-1');
    probe.setHostActive(true, 'attach-1');
    expect(probe.paintReports).toHaveLength(1);
    expect(probe.paintReports[0]?.attach_token).toBe('attach-1');

    // A warm reattach reuses the same document, so nothing navigates and no
    // second bridge is injected. The host's token is what separates the two.
    probe.setHostActive(true, 'attach-2');

    expect(probe.paintReports).toHaveLength(2);
    expect(probe.paintReports[1]?.attach_token).toBe('attach-2');
  });

  it('bounds how many reports one document can ever post', () => {
    const probe = harness({
      body: '<main>Rendered</main>',
      bufferedPaintEntries: [{ name: 'first-contentful-paint', startTime: 40 }],
    });

    for (let attach = 0; attach < 200; attach += 1) {
      probe.setHostActive(true, `attach-${attach}`);
    }

    expect(probe.paintReports.length).toBeGreaterThan(0);
    expect(probe.paintReports.length).toBeLessThanOrEqual(8);
  });

  it('reads the document without writing to it', () => {
    const probe = harness({ body: '<main data-authored="unchanged">Rendered</main>' });
    const before = probe.window.document.body.innerHTML;
    let resizeCount = 0;
    probe.window.addEventListener('resize', () => {
      resizeCount += 1;
    });

    probe.setHostActive(true);
    probe.advanceBy(60_000);

    expect(resizeCount).toBe(0);
    expect(probe.window.document.body.innerHTML).toBe(before);
  });

  it('sends nothing a promotion path could consume', () => {
    const probe = harness({
      body: '<main>Rendered</main>',
      bufferedPaintEntries: [{ name: 'first-contentful-paint', startTime: 40 }],
    });

    probe.setHostActive(true);

    const report = probe.paintReports[0];
    expect(report?.type).toBe(PREVIEW_FIRST_PAINT_MESSAGE_TYPE);
    // The whole wire, pinned. It is a measurement and its context, and nothing
    // else: no document identity the host could match a version against, no
    // acknowledgement, no witness a promotion path could read as permission to
    // show, keep, or discard a document. `ready_state` is the document's own
    // lifecycle at the moment of measurement, not a verdict about it.
    expect(Object.keys(report ?? {}).sort()).toEqual([
      'detector',
      'elapsed_ms',
      'paint_observed',
      'ready_state',
      'type',
      'version',
      'visibility_state',
      'visible_element_count',
    ]);
  });
});
