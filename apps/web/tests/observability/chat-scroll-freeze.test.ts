// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearExceptionTrackingContext,
  setExceptionTrackingContext,
} from '../../src/analytics/error-tracking';
import {
  CONTENT_STEP_PX,
  FREEZE_WHEEL_COUNT,
  classifyLayerTriggers,
  createScrollFreezeState,
  diffScrollShape,
  observeScroll,
  observeWheelBatch,
} from '../../src/observability/chat-scroll-freeze-detector';
import {
  __resetChatScrollFreezeForTest,
  installChatScrollFreezeObserver,
} from '../../src/observability/chat-scroll-freeze';

/**
 * The defect these specs encode
 * -----------------------------
 * Measured on a real machine (Chromium 146 / Electron 41), with real OS
 * wheel events, on a chat log whose layout was entirely healthy:
 *
 *   .chat-log   scrollHeight 2347   clientHeight 583   → 1764px scrollable
 *   scrollTop = 1700 assigned from JS                  → took effect
 *   scrollTop = 99999 assigned from JS                 → clamped to 1764
 *   12 wheel notches asking for 1440px                 → stopped at 91
 *   scrollTop = 800 then one wheel notch               → snapped back to 91
 *
 * 91 is not noise: 583 + 91 = 674, the correct scroll ceiling for a
 * 674px-tall content box. The compositor's copy of "how far this thing
 * scrolls" froze at the instant the content was 674px tall and never
 * refreshed, while layout and the JS-visible geometry moved on.
 *
 * JS cannot read the compositor's copy. It CAN read the symptom, and
 * that is the whole design: a downward wheel, room left according to
 * layout, and a scrollTop that does not move.
 *
 * jsdom does no layout — `scrollHeight` / `clientHeight` are 0 for every
 * element it builds. So the decision logic lives in a pure module that
 * takes geometry as plain numbers, and these specs drive it directly.
 * The DOM-facing probe is exercised separately with the geometry stubbed,
 * which pins the wiring but NOT the browser behaviour. What only a real
 * browser can confirm is listed in the handoff notes, not faked here.
 */

const fetchMock = vi.fn();
const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_RAF = globalThis.requestAnimationFrame;
const ORIGINAL_CAF = globalThis.cancelAnimationFrame;

let rafSpy = vi.fn();
let cafSpy = vi.fn();
let rafHandle = 0;
let clock = 0;
function advanceClock(ms: number): void {
  clock += ms;
}

function sentEvents(): Array<{ event: string; properties: Record<string, unknown> }> {
  return fetchMock.mock.calls.map((call) => {
    const init = call[1] as RequestInit;
    return JSON.parse(init.body as string) as {
      event: string;
      properties: Record<string, unknown>;
    };
  });
}

function eventsNamed(name: string): Array<Record<string, unknown>> {
  return sentEvents()
    .filter((e) => e.event === name)
    .map((e) => e.properties);
}

/** Scroll geometry jsdom refuses to compute, installed by hand. */
interface GeometryHandle {
  setTop(value: number): void;
  setContent(value: number): void;
  setViewport(value: number): void;
  /** Every write the code under test made to `scrollTop`. Must stay empty. */
  writes: number[];
}

function stubGeometry(
  el: HTMLElement,
  initial: { scrollTop: number; scrollHeight: number; clientHeight: number },
): GeometryHandle {
  let top = initial.scrollTop;
  let content = initial.scrollHeight;
  let viewport = initial.clientHeight;
  const writes: number[] = [];
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      writes.push(value);
      top = value;
    },
  });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => content });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => viewport });
  return {
    setTop: (value) => {
      top = value;
    },
    setContent: (value) => {
      content = value;
    },
    setViewport: (value) => {
      viewport = value;
    },
    writes,
  };
}

function buildChatLog(): HTMLElement {
  const log = document.createElement('div');
  log.className = 'chat-log';
  log.setAttribute('data-testid', 'chat-log');
  document.body.appendChild(log);
  return log;
}

function wheel(target: HTMLElement, deltaY: number): void {
  target.dispatchEvent(
    new WheelEvent('wheel', { deltaY, deltaMode: 0, bubbles: true, cancelable: true }),
  );
}

function scrolled(target: HTMLElement): void {
  target.dispatchEvent(new Event('scroll', { bubbles: false }));
}

beforeEach(() => {
  clock = 0;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  setExceptionTrackingContext({
    apiKey: 'phc_test',
    host: 'https://us.i.posthog.com',
    distinctId: 'chat-scroll-freeze-test',
  });
  // A synchronous rAF makes the probe deterministic: one wheel event in,
  // one geometry sample out, no frame scheduling to await. It is a spy as
  // well as a stub, because "scheduled nothing" is an assertion the guard
  // specs below make directly.
  rafSpy = vi.fn((cb: FrameRequestCallback) => {
    cb(clock);
    return ++rafHandle;
  });
  cafSpy = vi.fn();
  globalThis.requestAnimationFrame =
    rafSpy as unknown as typeof globalThis.requestAnimationFrame;
  globalThis.cancelAnimationFrame =
    cafSpy as unknown as typeof globalThis.cancelAnimationFrame;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  document.body.innerHTML = '';
  __resetChatScrollFreezeForTest();
});

afterEach(() => {
  __resetChatScrollFreezeForTest();
  vi.restoreAllMocks();
  clearExceptionTrackingContext();
  globalThis.fetch = ORIGINAL_FETCH;
  globalThis.requestAnimationFrame = ORIGINAL_RAF;
  globalThis.cancelAnimationFrame = ORIGINAL_CAF;
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// The decision, as pure arithmetic
// ---------------------------------------------------------------------------

describe('chat-scroll-freeze-detector — freeze decision', () => {
  /** The measured failing surface, one wheel notch at a time. */
  const FROZEN = { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 };

  it('says nothing while the wheel is actually scrolling the log', () => {
    // The very first notch has no previous position to compare against, so
    // it is unclassifiable and lands in `stalling` with a streak of one.
    // What must hold is that a healthy scroller never accumulates a streak:
    // every notch after the first reads as movement, and `frozen` is never
    // reached no matter how long the user scrolls.
    let state = createScrollFreezeState();
    let top = 0;
    // Ten notches of 120px stay well inside the 1764px of real travel, so
    // nothing here can be confused with reaching the end.
    for (let i = 0; i < 10; i += 1) {
      top += 120;
      const result = observeWheelBatch(state, {
        geometry: { scrollTop: top, scrollHeight: 2347, clientHeight: 583 },
        requestedPx: 120,
        wheelCount: 1,
      });
      state = result.state;
      expect(result.verdict.kind).toBe(i === 0 ? 'stalling' : 'moving');
    }
  });

  it('says nothing when the wheel is dead because the log is genuinely at its end', () => {
    // This is the overwhelmingly common "wheel does nothing" case in a
    // chat panel — the user is pinned to the newest message. Reporting it
    // would drown the real signal on day one.
    let state = createScrollFreezeState();
    for (let i = 0; i < 20; i += 1) {
      const result = observeWheelBatch(state, {
        geometry: { scrollTop: 1764, scrollHeight: 2347, clientHeight: 583 },
        requestedPx: 120,
        wheelCount: 1,
      });
      state = result.state;
      expect(result.verdict.kind).toBe('at_end');
    }
  });

  it('calls it frozen once the wheel has asked for real distance and moved nothing', () => {
    let state = createScrollFreezeState();
    let verdict = observeWheelBatch(state, {
      geometry: FROZEN,
      requestedPx: 120,
      wheelCount: 1,
    });
    state = verdict.state;
    expect(verdict.verdict.kind).toBe('stalling');

    for (let i = 0; i < FREEZE_WHEEL_COUNT - 1; i += 1) {
      verdict = observeWheelBatch(state, {
        geometry: FROZEN,
        requestedPx: 120,
        wheelCount: 1,
      });
      state = verdict.state;
    }

    expect(verdict.verdict.kind).toBe('frozen');
    if (verdict.verdict.kind !== 'frozen') return;
    const evidence = verdict.verdict.evidence;
    expect(evidence.trigger).toBe('wheel_stall');
    // The ceiling the wheel refuses to pass.
    expect(evidence.ceilingScrollTop).toBe(91);
    // …and therefore the content height the compositor still believes in.
    // This is the number that says WHEN it froze: 674px of content.
    expect(evidence.compositorContentPx).toBe(674);
    expect(evidence.layoutContentPx).toBe(2347);
    expect(evidence.layoutMaxScrollTop).toBe(1764);
    expect(evidence.unreachablePx).toBe(1673);
    expect(evidence.wheelCount).toBe(FREEZE_WHEEL_COUNT);
    expect(evidence.requestedPx).toBe(120 * FREEZE_WHEEL_COUNT);
  });

  it('will not call four twitchy trackpad pixels a freeze', () => {
    // A stalled streak also needs to have asked for real distance.
    // Sub-pixel trackpad jitter against a paused scroller is not a defect.
    let state = createScrollFreezeState();
    let verdict;
    for (let i = 0; i < FREEZE_WHEEL_COUNT; i += 1) {
      verdict = observeWheelBatch(state, {
        geometry: FROZEN,
        requestedPx: 10,
        wheelCount: 1,
      });
      state = verdict.state;
    }
    expect(verdict?.verdict.kind).toBe('stalling');
  });

  it('restarts the streak the moment the log moves again', () => {
    // 3 stalled + 2 stalled must not add up to a freeze just because the
    // total crosses the threshold; only CONSECUTIVE stalls count.
    let state = createScrollFreezeState();
    for (let i = 0; i < 3; i += 1) {
      state = observeWheelBatch(state, {
        geometry: FROZEN,
        requestedPx: 120,
        wheelCount: 1,
      }).state;
    }
    state = observeWheelBatch(state, {
      geometry: { scrollTop: 300, scrollHeight: 2347, clientHeight: 583 },
      requestedPx: 120,
      wheelCount: 1,
    }).state;
    let verdict;
    for (let i = 0; i < 2; i += 1) {
      verdict = observeWheelBatch(state, {
        geometry: { scrollTop: 300, scrollHeight: 2347, clientHeight: 583 },
        requestedPx: 120,
        wheelCount: 1,
      });
      state = verdict.state;
    }
    expect(verdict?.verdict.kind).toBe('stalling');
  });

  it('calls the snap-back frozen immediately — one notch is proof enough', () => {
    // The strongest signature we measured: JS puts the log at 800, one
    // downward notch throws it back to 91. Nothing but a stale ceiling in
    // the compositor does that, so it does not need four repetitions.
    let state = createScrollFreezeState();
    state = observeScroll(state, { scrollTop: 800, scrollHeight: 2347, clientHeight: 583 });
    const result = observeWheelBatch(state, {
      geometry: FROZEN,
      requestedPx: 120,
      wheelCount: 1,
    });
    expect(result.verdict.kind).toBe('frozen');
    if (result.verdict.kind !== 'frozen') return;
    expect(result.verdict.evidence.trigger).toBe('wheel_snap_back');
    expect(result.verdict.evidence.ceilingScrollTop).toBe(91);
    expect(result.verdict.evidence.compositorContentPx).toBe(674);
    // The programmatic write reached 800 — proof the JS-visible scroller
    // was never the thing that was stuck.
    expect(result.verdict.evidence.maxScrollTopSeen).toBe(800);
  });

  it('goes quiet for good once it has reported', () => {
    let state = createScrollFreezeState();
    let frozen = 0;
    for (let i = 0; i < 40; i += 1) {
      const result = observeWheelBatch(state, {
        geometry: FROZEN,
        requestedPx: 120,
        wheelCount: 1,
      });
      state = result.state;
      if (result.verdict.kind === 'frozen') frozen += 1;
    }
    expect(frozen).toBe(1);
  });

  it('ignores upward wheels — they are not the symptom', () => {
    let state = createScrollFreezeState();
    let verdict;
    for (let i = 0; i < 20; i += 1) {
      verdict = observeWheelBatch(state, {
        geometry: FROZEN,
        requestedPx: -120,
        wheelCount: 1,
      });
      state = verdict.state;
    }
    expect(verdict?.verdict.kind).toBe('ignored');
  });
});

// ---------------------------------------------------------------------------
// The run-up
// ---------------------------------------------------------------------------

describe('chat-scroll-freeze-detector — shape transitions', () => {
  it('records the first moment the log became scrollable, and only that moment', () => {
    // Prime suspect: this is when the compositor has to create the scroll
    // node whose ceiling later goes stale.
    const first = diffScrollShape(null, { scrollTop: 0, scrollHeight: 400, clientHeight: 583 });
    expect(first.transitions).toEqual([]);

    const crossed = diffScrollShape(first.memo, {
      scrollTop: 0,
      scrollHeight: 674,
      clientHeight: 583,
    });
    expect(crossed.transitions).toContain('scrollable_on');

    const later = diffScrollShape(crossed.memo, {
      scrollTop: 0,
      scrollHeight: 700,
      clientHeight: 583,
    });
    expect(later.transitions).not.toContain('scrollable_on');
  });

  it('records content growth only in meaningful steps, measured from the last record', () => {
    // A token-by-token stream must not produce a transition per frame, but
    // slow growth must still accumulate into one.
    let memo = diffScrollShape(null, { scrollTop: 0, scrollHeight: 700, clientHeight: 583 }).memo;
    for (let i = 1; i < CONTENT_STEP_PX / 10; i += 1) {
      const step = diffScrollShape(memo, {
        scrollTop: 0,
        scrollHeight: 700 + i * 10,
        clientHeight: 583,
      });
      memo = step.memo;
      expect(step.transitions).not.toContain('content_grew');
    }
    const crossed = diffScrollShape(memo, {
      scrollTop: 0,
      scrollHeight: 700 + CONTENT_STEP_PX,
      clientHeight: 583,
    });
    expect(crossed.transitions).toContain('content_grew');
  });

  it('records a viewport resize — the other input to the ceiling', () => {
    const first = diffScrollShape(null, { scrollTop: 0, scrollHeight: 900, clientHeight: 583 });
    const resized = diffScrollShape(first.memo, {
      scrollTop: 0,
      scrollHeight: 900,
      clientHeight: 420,
    });
    expect(resized.transitions).toContain('viewport_resized');
  });
});

describe('chat-scroll-freeze-detector — layer triggers', () => {
  it('names nothing for a plain element', () => {
    expect(
      classifyLayerTriggers({
        willChange: 'auto',
        transform: 'none',
        filter: 'none',
        backdropFilter: 'none',
        contain: 'none',
        perspective: 'none',
      }),
    ).toEqual([]);
  });

  it('names every compositing trigger it can see', () => {
    const kinds = classifyLayerTriggers({
      willChange: 'transform',
      transform: 'matrix(1, 0, 0, 1, 0, 0)',
      filter: 'blur(2px)',
      backdropFilter: 'blur(8px)',
      contain: 'layout paint',
      perspective: 'none',
    });
    expect(kinds).toEqual([
      'will_change',
      'transform',
      'filter',
      'backdrop_filter',
      'contain',
    ]);
  });
});

// ---------------------------------------------------------------------------
// The probe: wiring, reporting, and the promise not to heal
// ---------------------------------------------------------------------------

describe('observability/chat-scroll-freeze — probe', () => {
  it('reports the frozen ceiling once, with the geometry needed to date it', () => {
    const log = buildChatLog();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);

    for (let i = 0; i < 12; i += 1) {
      advanceClock(16);
      wheel(log, 120);
    }

    const reports = eventsNamed('client_chat_scroll_frozen');
    expect(reports).toHaveLength(1);
    const report = reports[0] ?? {};
    expect(report.trigger).toBe('wheel_stall');
    expect(report.scroll_top).toBe(91);
    expect(report.scroll_height).toBe(2347);
    expect(report.client_height).toBe(583);
    expect(report.ceiling_scroll_top).toBe(91);
    expect(report.compositor_content_px).toBe(674);
    expect(report.layout_content_px).toBe(2347);
    expect(report.layout_max_scroll_top).toBe(1764);
    expect(report.unreachable_px).toBe(1673);
    expect(typeof report.probe_id).toBe('string');
    expect(typeof report.transitions).toBe('string');
  });

  it('stays silent for a log that is simply at the bottom', () => {
    const log = buildChatLog();
    stubGeometry(log, { scrollTop: 1764, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);
    for (let i = 0; i < 20; i += 1) {
      advanceClock(16);
      wheel(log, 120);
    }
    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(0);
  });

  it('stays silent when an inner scroller could have eaten the wheel', () => {
    // The user ruled this out by hand on the real failure. The probe has
    // to rule it out by itself, or every code block and every tool-output
    // box in the transcript becomes a false report.
    const log = buildChatLog();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    const inner = document.createElement('pre');
    log.appendChild(inner);
    stubGeometry(inner, { scrollTop: 0, scrollHeight: 900, clientHeight: 200 });

    installChatScrollFreezeObserver();
    scrolled(log);
    for (let i = 0; i < 12; i += 1) {
      advanceClock(16);
      wheel(inner, 120);
    }
    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(0);
  });

  it('never writes to the DOM — observation only, no self-heal', () => {
    // `display:none` → `flex` is the one thing known to fix this, and it
    // is deliberately NOT done here: healing hides the trigger we are
    // trying to find, and costs the user a flash plus their scroll
    // position. If that ever becomes the product decision it will be a
    // separate, explicit change.
    const log = buildChatLog();
    const geometry = stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    const inlineStyleBefore = log.getAttribute('style');
    const classBefore = log.className;

    installChatScrollFreezeObserver();
    scrolled(log);
    for (let i = 0; i < 12; i += 1) {
      advanceClock(16);
      wheel(log, 120);
    }

    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(1);
    expect(geometry.writes).toEqual([]);
    expect(log.getAttribute('style')).toBe(inlineStyleBefore);
    expect(log.className).toBe(classBefore);
  });

  it('follows the chat log across a conversation switch', () => {
    // The log node is replaced when the user switches conversation. A probe
    // still holding the old node would look installed and be deaf for the
    // rest of the session — the worst failure mode an observer has, because
    // silence reads as "no defect".
    const first = buildChatLog();
    stubGeometry(first, { scrollTop: 1764, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(first);
    first.remove();

    const second = buildChatLog();
    stubGeometry(second, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    advanceClock(500);
    scrolled(second);
    for (let i = 0; i < 12; i += 1) {
      advanceClock(16);
      wheel(second, 120);
    }

    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(1);
  });

  it('schedules nothing for scroll and wheel outside the chat log', () => {
    // The invariant that keeps this observer from being a tax on the whole
    // app: an event that did not come from the chat log must not cost a
    // frame, an idle callback, or a layout read. Being *fast* is not the
    // bar — the work must not be entered at all.
    const log = buildChatLog();
    stubGeometry(log, { scrollTop: 0, scrollHeight: 2347, clientHeight: 583 });
    const elsewhere = document.createElement('div');
    elsewhere.setAttribute('data-testid', 'not-the-chat-log');
    document.body.appendChild(elsewhere);
    const elsewhereGeometry = stubGeometry(elsewhere, {
      scrollTop: 0,
      scrollHeight: 5000,
      clientHeight: 400,
    });

    installChatScrollFreezeObserver();
    scrolled(log); // attach

    const framesAfterAttach = rafSpy.mock.calls.length;
    for (let i = 0; i < 50; i += 1) {
      advanceClock(16);
      scrolled(elsewhere);
      wheel(elsewhere, 120);
    }

    expect(rafSpy.mock.calls.length).toBe(framesAfterAttach);
    expect(elsewhereGeometry.writes).toEqual([]);
    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(0);
  });

  it('does not walk the subtree at attach when the browser cannot say it is idle', () => {
    // The attach-time layer census calls getComputedStyle on hundreds of
    // elements. It is reached from a scroll handler, so without
    // requestIdleCallback it must be SKIPPED, not run inline — running it
    // inline is exactly the jank this module claims not to cause. jsdom
    // ships no requestIdleCallback, so this is the real path here.
    expect(
      (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback,
    ).toBeUndefined();

    const log = buildChatLog();
    stubGeometry(log, { scrollTop: 0, scrollHeight: 2347, clientHeight: 583 });
    for (let i = 0; i < 40; i += 1) log.appendChild(document.createElement('div'));
    const computedStyleSpy = vi.spyOn(globalThis, 'getComputedStyle');

    installChatScrollFreezeObserver();
    scrolled(log);

    expect(computedStyleSpy).not.toHaveBeenCalled();
  });

  it('cancels in-flight work and lets go of the element when uninstalled', () => {
    // A probe that leaves a frame in flight, or a wheel listener on a node
    // nobody owns any more, runs inside somebody else's work later.
    const log = buildChatLog();
    const geometry = stubGeometry(log, {
      scrollTop: 91,
      scrollHeight: 2347,
      clientHeight: 583,
    });
    // Queue a frame rather than running it, so there is something real to
    // cancel at teardown.
    rafSpy.mockImplementation(() => ++rafHandle);

    const teardown = installChatScrollFreezeObserver();
    scrolled(log);
    expect(rafSpy).toHaveBeenCalled();

    teardown();

    expect(cafSpy).toHaveBeenCalled();
    // And the element is genuinely released: further input does nothing.
    const framesAfterTeardown = rafSpy.mock.calls.length;
    for (let i = 0; i < 12; i += 1) {
      advanceClock(16);
      wheel(log, 120);
      scrolled(log);
    }
    expect(rafSpy.mock.calls.length).toBe(framesAfterTeardown);
    expect(geometry.writes).toEqual([]);
    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(0);
  });

  it('carries the run-up: the scrollable transition and its content height', () => {
    // Without this the report says "it is frozen at 674" and nothing
    // about whether 674 is where the scroll node was born.
    const log = buildChatLog();
    const geometry = stubGeometry(log, { scrollTop: 0, scrollHeight: 400, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);

    advanceClock(1000);
    geometry.setContent(674);
    scrolled(log);

    advanceClock(1000);
    geometry.setContent(2347);
    geometry.setTop(91);
    scrolled(log);

    for (let i = 0; i < 12; i += 1) {
      advanceClock(16);
      wheel(log, 120);
    }

    const report = eventsNamed('client_chat_scroll_frozen')[0] ?? {};
    expect(report.content_px_at_scrollable_on).toBe(674);
    expect(report.scrollable_since_ms).toBeGreaterThan(0);
    expect(String(report.transitions)).toContain('scrollable_on');
  });
});
