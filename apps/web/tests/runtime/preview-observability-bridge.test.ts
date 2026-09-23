import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PREVIEW_OBSERVABILITY_HOST_STATE_MESSAGE_TYPE,
  PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
  buildPreviewObservabilityBridge,
  type PreviewObservabilityMessage,
} from '@open-design/contracts/runtime/preview-observability';

interface ScheduledTask {
  at: number;
  callback: () => void;
  id: number;
}

interface BridgeHarness {
  advanceBy: (durationMs: number) => void;
  close: () => void;
  events: PreviewObservabilityMessage[];
  setHostActive: (active: boolean) => void;
  setViewport: (width: number, height: number) => void;
  setVisibility: (value: DocumentVisibilityState) => void;
  window: JSDOM['window'];
}

function bridgeScriptBody(): string {
  return buildPreviewObservabilityBridge()
    .replace(/^<script[^>]*>/, '')
    .replace(/<\/script>$/, '');
}

function createBridgeHarness(body = '', hostActive = true): BridgeHarness {
  const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, {
    pretendToBeVisual: true,
    runScripts: 'outside-only',
    url: 'http://preview.test/',
  });
  const events: PreviewObservabilityMessage[] = [];
  const tasks: ScheduledTask[] = [];
  let nextTaskId = 0;
  let now = 0;
  let visibility: DocumentVisibilityState = 'visible';
  let viewportWidth = 1280;
  let viewportHeight = 720;
  const win = dom.window;

  Object.defineProperties(win.document, {
    readyState: { configurable: true, get: () => 'complete' },
    visibilityState: { configurable: true, get: () => visibility },
  });
  Object.defineProperties(win, {
    innerHeight: { configurable: true, get: () => viewportHeight },
    innerWidth: { configurable: true, get: () => viewportWidth },
  });
  win.postMessage = ((data: unknown) => {
    if (
      data
      && typeof data === 'object'
      && (data as { type?: unknown }).type === PREVIEW_OBSERVABILITY_MESSAGE_TYPE
    ) {
      events.push(data as PreviewObservabilityMessage);
    }
  }) as typeof win.postMessage;
  win.setTimeout = ((callback: TimerHandler, delay = 0) => {
    nextTaskId += 1;
    tasks.push({
      at: now + Number(delay),
      callback: () => {
        if (typeof callback === 'function') callback();
      },
      id: nextTaskId,
    });
    return nextTaskId;
  }) as typeof win.setTimeout;
  win.clearTimeout = ((id: number) => {
    const index = tasks.findIndex((task) => task.id === id);
    if (index >= 0) tasks.splice(index, 1);
  }) as typeof win.clearTimeout;

  win.eval(bridgeScriptBody());

  const setHostActive = (active: boolean) => {
    win.dispatchEvent(new win.MessageEvent('message', {
      data: {
        type: PREVIEW_OBSERVABILITY_HOST_STATE_MESSAGE_TYPE,
        active,
      },
    }));
  };
  if (hostActive) setHostActive(true);

  return {
    advanceBy(durationMs) {
      const target = now + durationMs;
      while (true) {
        tasks.sort((left, right) => left.at - right.at || left.id - right.id);
        const task = tasks[0];
        if (!task || task.at > target) break;
        tasks.shift();
        now = task.at;
        task.callback();
      }
      now = target;
    },
    close: () => dom.window.close(),
    events,
    setHostActive,
    setViewport(width, height) {
      viewportWidth = width;
      viewportHeight = height;
      win.dispatchEvent(new win.Event('resize'));
    },
    setVisibility(value) {
      visibility = value;
      win.document.dispatchEvent(new win.Event('visibilitychange'));
    },
    window: win,
  };
}

const harnesses: BridgeHarness[] = [];

afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.close();
});

describe('preview observability white-screen bridge', () => {
  it('starts the white-screen window only after a retained preview becomes active', () => {
    const harness = createBridgeHarness('', false);
    harnesses.push(harness);

    harness.advanceBy(20_000);
    expect(harness.events).toEqual([]);

    harness.setHostActive(true);
    harness.advanceBy(6_500);
    expect(harness.events).toEqual([
      expect.objectContaining({
        event: 'white_screen',
        blank_observation_count: 2,
      }),
    ]);
  });

  it('does not report while the host tab is hidden, then samples after it becomes visible', () => {
    const harness = createBridgeHarness();
    harnesses.push(harness);
    harness.setVisibility('hidden');

    harness.advanceBy(20_000);
    expect(harness.events).toEqual([]);

    harness.setVisibility('visible');
    harness.advanceBy(6_500);
    expect(harness.events).toEqual([
      expect.objectContaining({
        event: 'white_screen',
        visibility_state: 'visible',
      }),
    ]);
  });

  it('does not report a zero-sized preview and retries after the viewport becomes measurable', () => {
    const harness = createBridgeHarness();
    harnesses.push(harness);
    harness.setViewport(0, 0);

    harness.advanceBy(20_000);
    expect(harness.events).toEqual([]);

    harness.setViewport(1280, 720);
    harness.advanceBy(6_500);
    expect(harness.events).toEqual([
      expect.objectContaining({
        event: 'white_screen',
        viewport_width: 1280,
        viewport_height: 720,
      }),
    ]);
  });

  it('nudges layout once and suppresses the report when visible paint recovers', () => {
    const harness = createBridgeHarness('<main>Rendered after resize</main>');
    harnesses.push(harness);
    let layoutNudged = false;
    const main = harness.window.document.querySelector('main');
    if (!main) throw new Error('missing preview fixture');
    main.getBoundingClientRect = () => ({
      bottom: layoutNudged ? 100 : 0,
      height: layoutNudged ? 100 : 0,
      left: 0,
      right: layoutNudged ? 100 : 0,
      top: 0,
      width: layoutNudged ? 100 : 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    harness.window.addEventListener('resize', () => {
      layoutNudged = true;
    });

    harness.advanceBy(20_000);

    expect(layoutNudged).toBe(true);
    expect(harness.events).toEqual([]);
  });

  it('reports only after two blank observations and includes confirmation metadata', () => {
    const harness = createBridgeHarness();
    harnesses.push(harness);

    harness.advanceBy(5_000);
    expect(harness.events).toEqual([]);

    harness.advanceBy(1_500);
    expect(harness.events).toEqual([
      expect.objectContaining({
        event: 'white_screen',
        blank_observation_count: 2,
        sample_interval_ms: 1_500,
      }),
    ]);
  });
});
