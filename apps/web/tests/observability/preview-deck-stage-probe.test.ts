// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PREVIEW_OBSERVABILITY_HOST_STATE_MESSAGE_TYPE,
  PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
  buildPreviewObservabilityBridge,
} from '@open-design/contracts/runtime/preview-observability';

/**
 * Behavioural cover for the OPEND-2147 deck-stage probe.
 *
 * Asserting that the bridge *source* contains a string proves nothing about
 * whether the probe can run, and neither does a fixture built in a shape no
 * deck actually ships. This product authors the scaled canvas three different
 * ways — `<deck-stage>` hides its canvas in shadow DOM, the canonical agent
 * skeleton uses `#deck-stage` / `.deck-stage` at a fixed size scaled inline,
 * and some design templates use a plain `.stage` with `--canvas-w` — so each
 * gets a case here, collapsed and healthy.
 *
 * Sizes are set as inline styles rather than by stubbing `getComputedStyle`,
 * so the probe reads the same property in the test that it reads in a browser.
 */

const DECK_TIMEOUT_MS = 60_000;

// The bridge registers window/document listeners and offers no teardown, so a
// bridge installed by an earlier case would still be listening when the next
// case activates the host — and would report against the next case's DOM. Record
// what it registers and unregister it between tests.
type Registration = [EventTarget, string, EventListenerOrEventListenerObject, unknown];
let registrations: Registration[] = [];

function installBridge(): void {
  const targets: EventTarget[] = [window, document];
  const originals = targets.map((t) => t.addEventListener);
  targets.forEach((target, i) => {
    target.addEventListener = function patched(type: string, listener: never, options: never) {
      registrations.push([target, type, listener, options]);
      return (originals[i] as never as typeof target.addEventListener).call(target, type, listener, options);
    } as typeof target.addEventListener;
  });
  try {
    const bridge = buildPreviewObservabilityBridge();
    const body = bridge.replace(/^<script[^>]*>/, '').replace(/<\/script>\s*$/, '');
    new Function(body)();
  } finally {
    targets.forEach((target, i) => { target.addEventListener = originals[i] as never; });
  }
}

function uninstallBridges(): void {
  for (const [target, type, listener, options] of registrations) {
    target.removeEventListener(type, listener, options as never);
  }
  registrations = [];
}

function activateHost(): void {
  window.dispatchEvent(new MessageEvent('message', {
    data: { type: PREVIEW_OBSERVABILITY_HOST_STATE_MESSAGE_TYPE, active: true },
  }));
}

function deckMessages(post: ReturnType<typeof vi.fn>): Record<string, unknown>[] {
  return post.mock.calls
    .map((call) => call[0] as Record<string, unknown>)
    .filter((data) => data
      && data.type === PREVIEW_OBSERVABILITY_MESSAGE_TYPE
      && data.event === 'deck_stage_unscaled');
}

/** The canonical skeleton: a fixed canvas the artifact scales inline. */
function mountDeckStage(transform: string, size = '1920px'): void {
  document.body.innerHTML =
    `<div class="deck-shell"><div class="deck-stage" style="width:${size};height:1080px;transform:${transform}"></div></div>`;
}

/** The custom element: the canvas lives in shadow DOM, invisible to querySelector. */
function mountShadowDeckStage(transform: string): void {
  document.body.innerHTML = '<deck-stage></deck-stage>';
  const host = document.querySelector('deck-stage')!;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    `<div class="stage"><div class="canvas" style="width:1920px;height:1080px;transform:${transform}"></div></div>`;
}

function run(post: ReturnType<typeof vi.fn>): void {
  installBridge();
  activateHost();
  vi.advanceTimersByTime(DECK_TIMEOUT_MS);
}

let post: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  post = vi.fn();
  // jsdom makes `window.parent` the window itself, which is what the bridge
  // posts to.
  vi.stubGlobal('postMessage', post);
  Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
  delete (window as unknown as Record<string, unknown>).__odPreviewObservability;
});

afterEach(() => {
  uninstallBridges();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('deck stage probe (OPEND-2147)', () => {
  it('reports a collapsed canonical .deck-stage', () => {
    mountDeckStage('matrix(0, 0, 0, 0, 0, 0)');
    run(post);

    const [measurement, ...rest] = deckMessages(post);
    expect(rest).toHaveLength(0);
    expect(measurement).toMatchObject({
      event: 'deck_stage_unscaled',
      stage_kind: 'deck-stage',
      stage_transform: 'matrix',
      stage_scale_permille: 0,
      canvas_width: 1920,
      canvas_height: 1080,
      ready_state: 'complete',
      visibility_state: 'visible',
    });
  });

  it('reports a collapsed canvas hidden inside a deck-stage shadow root', () => {
    mountShadowDeckStage('matrix(0, 0, 0, 0, 0, 0)');
    run(post);

    expect(deckMessages(post)[0]).toMatchObject({
      stage_kind: 'shadow-canvas',
      stage_scale_permille: 0,
      canvas_width: 1920,
    });
  });

  it('reports a template .stage that declares its canvas in custom properties', () => {
    document.body.innerHTML =
      '<div class="stage" style="--canvas-w:1920px;--canvas-h:1080px;transform:matrix(0, 0, 0, 0, 0, 0)"></div>';
    run(post);

    expect(deckMessages(post)[0]).toMatchObject({
      stage_kind: 'stage',
      stage_scale_permille: 0,
      canvas_width: 1920,
    });
  });

  it('separates a stage that was never fitted from one fitted to nothing', () => {
    mountDeckStage('none');
    run(post);

    expect(deckMessages(post)[0]).toMatchObject({
      stage_kind: 'deck-stage',
      stage_transform: 'none',
      stage_scale_permille: 0,
    });
  });

  it('reports an unfitted deck whose width happens to match the frame', () => {
    // The viewport exemption exists for wrappers that track the viewport, and a
    // wrapper tracks it in BOTH dimensions. A 1920x1080 canvas in a 1920x530
    // frame still has to scale (height constrains it to about 0.46), so
    // `transform: none` there is the failure, not an exemption.
    const originalW = window.innerWidth;
    const originalH = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 530, configurable: true });
    try {
      mountDeckStage('none');
      run(post);

      expect(deckMessages(post)[0]).toMatchObject({
        stage_kind: 'deck-stage',
        stage_transform: 'none',
        canvas_width: 1920,
        canvas_height: 1080,
        viewport_width: 1920,
        viewport_height: 530,
      });
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: originalW, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: originalH, configurable: true });
    }
  });

  it('stays quiet for a deck that fitted correctly', () => {
    mountDeckStage('matrix(0.4907, 0, 0, 0.4907, 0, 0)');
    run(post);

    expect(deckMessages(post)).toHaveLength(0);
  });

  it('stays quiet for a non-deck page that happens to use .stage', () => {
    // `.stage` is not a deck marker. design-templates/social-carousel is a plain
    // page whose `.stage { max-width: 1280px; margin: 0 auto }` carries no fit
    // transform and no authored canvas — reading its computed width as a canvas
    // would file every healthy render of it as a collapsed deck and poison both
    // the frequency signal and the exported log.
    document.body.innerHTML =
      '<div class="stage" style="width:1280px;padding:60px 32px 80px"></div>';
    run(post);

    expect(deckMessages(post)).toHaveLength(0);
  });

  it('stays quiet for a .stage wrapper that just tracks the viewport', () => {
    // Some templates ship a 100vw/100vh `.stage` with no fit transform at all.
    // It carries no fixed canvas, so there is no fit contract to violate and
    // reporting it would bury the real signal.
    document.body.innerHTML =
      `<div class="stage" style="width:${window.innerWidth}px;height:${window.innerHeight}px"></div>`;
    run(post);

    expect(deckMessages(post)).toHaveLength(0);
  });

  it('still reports a stage that collapses after a healthy first sample', () => {
    // OPEND-2147 is a race, so "fitted correctly at the first eligible check"
    // is not a verdict for the life of the document. White-screen makes the
    // same distinction: it returns on a healthy sample without latching, and
    // only latches once it has actually reported.
    mountDeckStage('matrix(0.4907, 0, 0, 0.4907, 0, 0)');
    run(post);
    expect(deckMessages(post)).toHaveLength(0);

    const stage = document.querySelector('.deck-stage') as HTMLElement;
    stage.style.transform = 'matrix(0, 0, 0, 0, 0, 0)';
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(DECK_TIMEOUT_MS);

    expect(deckMessages(post)).toHaveLength(1);
    expect(deckMessages(post)[0]).toMatchObject({
      stage_kind: 'deck-stage',
      stage_scale_permille: 0,
    });
  });

  it('stays quiet until the host reports an active preview', () => {
    mountDeckStage('matrix(0, 0, 0, 0, 0, 0)');
    installBridge();
    // A probe that fired here would also fire for every backgrounded frame.
    vi.advanceTimersByTime(DECK_TIMEOUT_MS);
    expect(deckMessages(post)).toHaveLength(0);

    activateHost();
    vi.advanceTimersByTime(DECK_TIMEOUT_MS);
    expect(deckMessages(post)).toHaveLength(1);
  });
});
