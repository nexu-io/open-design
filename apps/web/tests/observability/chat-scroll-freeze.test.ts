// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearExceptionTrackingContext,
  setExceptionTrackingContext,
} from '../../src/analytics/error-tracking';
import {
  ACTIVITY_CAPACITY,
  ACTIVITY_COALESCE_MS,
  ACTIVITY_NEAR_WINDOW_MS,
  ACTIVITY_PRE_FREEZE_MS,
  CONTENT_STEP_PX,
  FREEZE_WHEEL_COUNT,
  classifyActivityRole,
  classifyLayerTriggers,
  countActivity,
  createActivityLog,
  createScrollFreezeState,
  createShortfallLedger,
  diffScrollShape,
  listActivity,
  observeScroll,
  observeWheelBatch,
  pushActivity,
  recordCeilingProbe,
  recordContentStep,
  serialiseActivity,
  serialiseCeilingProbes,
  serialiseContentSteps,
  sliceActivityBefore,
  sliceActivityWindow,
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
  /** How many times the code under test asked for layout. */
  reads: () => number;
}

function stubGeometry(
  el: HTMLElement,
  initial: { scrollTop: number; scrollHeight: number; clientHeight: number },
): GeometryHandle {
  let top = initial.scrollTop;
  let content = initial.scrollHeight;
  let viewport = initial.clientHeight;
  let reads = 0;
  const writes: number[] = [];
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => {
      reads += 1;
      return top;
    },
    set: (value: number) => {
      writes.push(value);
      top = value;
    },
  });
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => {
      reads += 1;
      return content;
    },
  });
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    get: () => {
      reads += 1;
      return viewport;
    },
  });
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
    reads: () => reads,
  };
}

function buildChatLog(): HTMLElement {
  const log = document.createElement('div');
  log.className = 'chat-log';
  log.setAttribute('data-testid', 'chat-log');
  document.body.appendChild(log);
  return log;
}

/**
 * The real chat surface, as `ChatPane` builds it on this branch:
 *
 *   .chat-log-wrap                     ← an ancestor, class/style churn here
 *     .chat-log-viewport               ← THE SHELL; siblings mount/unmount here
 *       .chat-log [data-testid]        ← the scroller
 *       .chat-bottom-float-slot        ← sibling; holds exactly one pill
 *         button.chat-jump-btn         ← ".od-glass-refract" — the prime suspect
 *
 * The float slot swaps the jump button for `PlanPill`, so the button both
 * toggles `chat-jump-btn-active` in place AND mounts/unmounts. Both have to
 * be visible in the trail.
 */
interface ChatSurface {
  wrap: HTMLElement;
  shell: HTMLElement;
  log: HTMLElement;
  floatSlot: HTMLElement;
  jump: HTMLElement;
}

function buildChatSurface(): ChatSurface {
  const wrap = document.createElement('div');
  wrap.className = 'chat-log-wrap';
  const shell = document.createElement('div');
  shell.className = 'chat-log-viewport';
  const log = document.createElement('div');
  log.className = 'chat-log';
  log.setAttribute('data-testid', 'chat-log');
  const floatSlot = document.createElement('div');
  floatSlot.className = 'chat-bottom-float-slot';
  floatSlot.setAttribute('data-testid', 'chat-bottom-float-slot');
  const jump = document.createElement('button');
  jump.className = 'chat-jump-btn od-glass-refract';
  jump.setAttribute('data-testid', 'chat-jump-btn');

  floatSlot.appendChild(jump);
  shell.appendChild(log);
  shell.appendChild(floatSlot);
  wrap.appendChild(shell);
  document.body.appendChild(wrap);
  return { wrap, shell, log, floatSlot, jump };
}

/**
 * `MutationObserver` delivers in a microtask, so every structural assertion
 * has to let the queue drain first.
 */
async function flushMutations(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Drive the surface to a reported freeze and hand back the event props. */
function freeze(log: HTMLElement): Record<string, unknown> {
  for (let i = 0; i < 12; i += 1) {
    advanceClock(16);
    wheel(log, 120);
  }
  return eventsNamed('client_chat_scroll_frozen')[0] ?? {};
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

// ---------------------------------------------------------------------------
// The parallel-activity ring buffer
// ---------------------------------------------------------------------------

/**
 * Why this exists
 * ---------------
 * The geometry half of the report says the compositor's ceiling froze at a
 * content height of 674px. It cannot say what ELSE the page was doing at
 * that instant — and after 225 synthetic reproduction attempts, "what else
 * was going on" is the only lead left. So the probe keeps a small ring
 * buffer of parallel activity and ships two slices of it: the ±500ms around
 * the birth of the scroll node, and the 2s before the freeze verdict.
 *
 * These are pure so they can be driven without a browser. The DOM wiring is
 * exercised separately below; what NEITHER can confirm is whether any of
 * these entries actually correlates with the compositor bug, because jsdom
 * has no compositor. That is real-machine work and is listed as such.
 */
describe('chat-scroll-freeze-detector — activity ring buffer', () => {
  it('keeps only the newest entries and says how many it threw away', () => {
    const log = createActivityLog(4);
    for (let i = 0; i < 10; i += 1) {
      // Distinct kinds, spaced past the coalescing window, so nothing merges.
      pushActivity(log, i % 2 === 0 ? 'log_class' : 'log_style', 'log', i * 100);
    }
    const entries = listActivity(log);
    expect(entries).toHaveLength(4);
    // Oldest first, and the oldest surviving entry is the 7th push.
    expect(entries.map((e) => e.at)).toEqual([600, 700, 800, 900]);
    expect(log.dropped).toBe(6);
  });

  it('collapses a burst of identical entries into one with a count', () => {
    // A single class flip transitions several properties at once, so
    // `transitionstart` arrives two or three times within a frame. Three ring
    // slots spent on one visual event would evict the entries that matter.
    const log = createActivityLog(ACTIVITY_CAPACITY);
    pushActivity(log, 'trans_start', 'jump', 1000);
    pushActivity(log, 'trans_start', 'jump', 1000 + ACTIVITY_COALESCE_MS);
    pushActivity(log, 'trans_start', 'jump', 1000 + ACTIVITY_COALESCE_MS);
    // Past the window — a separate event.
    pushActivity(log, 'trans_start', 'jump', 1000 + ACTIVITY_COALESCE_MS * 4);

    const entries = listActivity(log);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.count).toBe(3);
    // The timestamp stays at the FIRST occurrence: the burst started there.
    expect(entries[0]?.at).toBe(1000);
    expect(entries[1]?.count).toBe(1);
  });

  it('does not merge two different things that happened at the same instant', () => {
    const log = createActivityLog(ACTIVITY_CAPACITY);
    pushActivity(log, 'trans_start', 'jump', 1000);
    pushActivity(log, 'trans_start', 'log', 1000);
    pushActivity(log, 'anim_start', 'jump', 1000);
    expect(listActivity(log)).toHaveLength(3);
  });

  it('slices the window around the birth of the scroll node', () => {
    // The prime suspect is the jump button lighting up next to a scroll node
    // that has just been created. To see that you need both sides of the
    // moment, not just what came after.
    const log = createActivityLog(ACTIVITY_CAPACITY);
    pushActivity(log, 'log_class', 'log', 1000);
    pushActivity(log, 'anim_start', 'other', 4400);
    pushActivity(log, 'jump_shown', 'jump', 5100);
    pushActivity(log, 'trans_start', 'jump', 5400);
    pushActivity(log, 'log_resize', 'log', 6200);

    const near = sliceActivityWindow(listActivity(log), 5000, ACTIVITY_NEAR_WINDOW_MS);
    // 4400 is 600ms early and 6200 is 1200ms late; both fall outside.
    expect(near.map((e) => e.at)).toEqual([5100, 5400]);
    expect(near.map((e) => e.kind)).toEqual(['jump_shown', 'trans_start']);
  });

  it('slices the two seconds before the freeze was called', () => {
    const log = createActivityLog(ACTIVITY_CAPACITY);
    pushActivity(log, 'streaming_on', 'other', 1000);
    pushActivity(log, 'jump_shown', 'jump', 8100);
    pushActivity(log, 'log_class', 'log', 9500);

    const pre = sliceActivityBefore(listActivity(log), 10_000, ACTIVITY_PRE_FREEZE_MS);
    expect(pre.map((e) => e.kind)).toEqual(['jump_shown', 'log_class']);
  });

  it('serialises oldest-first, relative to an origin, naming the role', () => {
    // A flat string on purpose: this trail is read by a human staring at one
    // bad event in PostHog's property inspector, never aggregated.
    const log = createActivityLog(ACTIVITY_CAPACITY);
    pushActivity(log, 'scroll_node_born', 'log', 1200);
    pushActivity(log, 'jump_shown', 'jump', 1204);
    pushActivity(log, 'trans_start', 'jump', 1220);
    pushActivity(log, 'trans_start', 'jump', 1230);
    pushActivity(log, 'doc_hidden', 'other', 3000);

    expect(serialiseActivity(listActivity(log), 1000)).toBe(
      'scroll_node_born:log@200,jump_shown:jump@204,trans_start:jump@220x2,doc_hidden@2000',
    );
  });

  it('totals the buffer by kind so one glance says what dominated', () => {
    const log = createActivityLog(ACTIVITY_CAPACITY);
    pushActivity(log, 'log_class', 'log', 100);
    pushActivity(log, 'log_class', 'log', 300);
    pushActivity(log, 'jump_shown', 'jump', 500);
    expect(countActivity(listActivity(log))).toBe('jump_shown=1,log_class=2');
  });

  it('names the roles a chat surface can produce, and nothing else', () => {
    // Roles are an enum, and only the enum is ever reported. Class names are
    // read to derive it and then dropped on the floor — the privacy line in
    // this module is identifiers and enums only.
    expect(classifyActivityRole('chat-jump-btn od-glass-refract', 'chat-jump-btn')).toBe(
      'jump',
    );
    expect(classifyActivityRole('chat-bottom-float-slot has-plan-pill', null)).toBe('float');
    expect(classifyActivityRole('', 'chat-plan-pill')).toBe('plan_pill');
    // The skeleton carries BOTH classes; the more specific one has to win.
    expect(
      classifyActivityRole('question-form question-form-loading', 'question-form-loading'),
    ).toBe('skeleton');
    expect(classifyActivityRole('question-form', null)).toBe('question_form');
    expect(classifyActivityRole('chat-log is-scrollable', 'chat-log')).toBe('log');
    expect(classifyActivityRole('chat-log-viewport', null)).toBe('shell');
    // The two message kinds are kept apart because the one real capture had
    // a 1188px-tall ASSISTANT message doing all the growing; "a message got
    // taller" would have thrown that away.
    expect(classifyActivityRole('msg assistant', null)).toBe('assistant_msg');
    expect(classifyActivityRole('msg user', null)).toBe('user_msg');
    expect(classifyActivityRole('msg', null)).toBe('message');
    expect(classifyActivityRole('chat-log-tail-spacer', null)).toBe('tail_spacer');
    expect(classifyActivityRole('some-unrelated-thing', null)).toBe('other');
    // A substring must not pass for a token: `chat-jump-btn-active` alone is
    // still the jump button, but `not-chat-logger` is not the chat log.
    expect(classifyActivityRole('not-chat-logger', null)).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// The probe: what else was happening
// ---------------------------------------------------------------------------

describe('observability/chat-scroll-freeze — parallel activity', () => {
  it('dates the jump button lighting up against the birth of the scroll node', async () => {
    // THE headline question. `.chat-jump-btn` carries `od-glass-refract` —
    // a backdrop-filter/SDF layer — and it can only appear AFTER the log
    // became scrollable, which is exactly when the scroll node is created.
    // If the two land in the same handful of milliseconds on real reports,
    // that is the lead.
    const { log, jump } = buildChatSurface();
    const geometry = stubGeometry(log, { scrollTop: 0, scrollHeight: 400, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);
    await flushMutations();

    // The log crosses into scrollable: the scroll node is born here.
    advanceClock(1000);
    geometry.setContent(674);
    scrolled(log);

    // …and 40ms later the button lights up.
    advanceClock(40);
    jump.className = 'chat-jump-btn od-glass-refract chat-jump-btn-active';
    await flushMutations();

    advanceClock(1000);
    geometry.setContent(2347);
    geometry.setTop(91);
    scrolled(log);

    const report = freeze(log);
    expect(report.jump_active_at_attach).toBe(false);
    expect(report.jump_first_active_ms).toBe(1040);
    // Positive = the button lit up AFTER the scroll node existed.
    expect(report.jump_active_vs_scroll_node_ms).toBe(40);
    expect(String(report.activity_trail)).toContain('jump_shown:jump');
  });

  it('records the jump button unmounting and remounting beside the log', async () => {
    // On this branch the float slot holds exactly one pill: `PlanPill` and
    // the jump button swap places rather than stacking. A swap is a mount and
    // an unmount right next to the scroller, which is a layout event the
    // geometry half of the report cannot see.
    const { log, floatSlot, jump } = buildChatSurface();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);
    await flushMutations();

    advanceClock(100);
    jump.remove();
    const pill = document.createElement('div');
    pill.setAttribute('data-testid', 'chat-plan-pill');
    floatSlot.appendChild(pill);
    await flushMutations();

    advanceClock(100);
    pill.remove();
    floatSlot.appendChild(jump);
    await flushMutations();

    const trail = String(freeze(log).activity_trail);
    expect(trail).toContain('float_child_removed:jump');
    expect(trail).toContain('float_child_added:plan_pill');
    expect(trail).toContain('float_child_added:jump');
  });

  it('records siblings mounting and unmounting in the chat shell', async () => {
    // The shell is where anything that changes the chat log's HEIGHT without
    // changing its content lives — the float slot, the message rail, and (on
    // origin/main) the pinned todo slot.
    const { shell, log } = buildChatSurface();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);
    await flushMutations();

    advanceClock(100);
    const tray = document.createElement('div');
    tray.className = 'chat-log-tray';
    shell.appendChild(tray);
    await flushMutations();

    advanceClock(100);
    tray.remove();
    await flushMutations();

    const trail = String(freeze(log).activity_trail);
    expect(trail).toContain('shell_child_added');
    expect(trail).toContain('shell_child_removed');
  });

  it('records class and style churn on the chat log and on its ancestors', async () => {
    const { wrap, log } = buildChatSurface();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);
    await flushMutations();

    advanceClock(50);
    log.className = 'chat-log is-scrollable';
    advanceClock(50);
    log.setAttribute('style', 'overflow-anchor: none');
    advanceClock(50);
    wrap.className = 'chat-log-wrap has-chat-log-tray';
    advanceClock(50);
    wrap.setAttribute('style', 'contain: layout');
    // An attribute nobody asked for must NOT produce an entry: the filter is
    // class and style, not "everything".
    advanceClock(50);
    log.setAttribute('aria-busy', 'true');
    await flushMutations();

    const trail = String(freeze(log).activity_trail);
    expect(trail).toContain('log_class');
    expect(trail).toContain('log_style');
    expect(trail).toContain('ancestor_class');
    expect(trail).toContain('ancestor_style');
    expect(trail).not.toContain('aria');
    expect(String(freeze(log).activity_counts)).toContain('log_class=1');
  });

  it('records transition and animation events with the role that produced them', async () => {
    // The jump button's glass layer animates in. A transition on it, at the
    // moment the scroll node is created, is the shape of the suspicion.
    const { log, jump, shell } = buildChatSurface();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);
    await flushMutations();

    advanceClock(20);
    jump.dispatchEvent(new Event('transitionstart', { bubbles: true }));
    advanceClock(200);
    jump.dispatchEvent(new Event('transitionend', { bubbles: true }));

    const skeleton = document.createElement('div');
    skeleton.className = 'question-form question-form-loading';
    log.appendChild(skeleton);
    advanceClock(20);
    skeleton.dispatchEvent(new Event('animationstart', { bubbles: true }));
    advanceClock(200);
    skeleton.dispatchEvent(new Event('animationend', { bubbles: true }));

    // Something that happened outside the shell entirely must not be counted.
    advanceClock(20);
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    outside.dispatchEvent(new Event('transitionstart', { bubbles: true }));

    const report = freeze(log);
    const trail = String(report.activity_trail);
    expect(trail).toContain('trans_start:jump');
    expect(trail).toContain('trans_end:jump');
    expect(trail).toContain('anim_start:skeleton');
    expect(trail).toContain('anim_end:skeleton');
    // The listener is on the shell, so the one dispatched on `document.body`
    // outside it is not counted — one `trans_start`, not two.
    expect(String(report.activity_counts)).toContain('trans_start=1');
    expect(shell.contains(outside)).toBe(false);
  });

  it('records the streaming flag flipping on and off', async () => {
    const { log } = buildChatSurface();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    const message = document.createElement('div');
    message.className = 'msg assistant';
    message.setAttribute('data-streaming', 'false');
    log.appendChild(message);

    installChatScrollFreezeObserver();
    scrolled(log);
    await flushMutations();

    advanceClock(100);
    message.setAttribute('data-streaming', 'true');
    await flushMutations();
    advanceClock(500);
    message.setAttribute('data-streaming', 'false');
    await flushMutations();

    const trail = String(freeze(log).activity_trail);
    expect(trail).toContain('streaming_on');
    expect(trail).toContain('streaming_off');
  });

  it('records the tab going hidden and coming back', async () => {
    const { log } = buildChatSurface();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);
    await flushMutations();

    let visibility = 'visible';
    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    try {
      advanceClock(100);
      visibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
      advanceClock(100);
      visibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));

      const trail = String(freeze(log).activity_trail);
      expect(trail).toContain('doc_hidden');
      expect(trail).toContain('doc_visible');
    } finally {
      delete (document as unknown as Record<string, unknown>).visibilityState;
      if (original) Object.defineProperty(Document.prototype, 'visibilityState', original);
    }
  });

  it('carries the window around the scroll node and the run-up to the freeze', async () => {
    // The two slices that answer the user's actual question — "what were the
    // other moving parts doing" — without making a human read 64 entries.
    const { log, jump, wrap } = buildChatSurface();
    const geometry = stubGeometry(log, { scrollTop: 0, scrollHeight: 400, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);
    await flushMutations();

    // Far in the past: inside the buffer, outside both slices.
    advanceClock(1000);
    wrap.className = 'chat-log-wrap mod-early';
    await flushMutations();

    // The scroll node is born.
    advanceClock(9000);
    geometry.setContent(674);
    scrolled(log);

    // …and the jump button lights up 40ms later — inside the ±500ms window.
    advanceClock(40);
    jump.className = 'chat-jump-btn od-glass-refract chat-jump-btn-active';
    await flushMutations();

    // A long quiet stretch, then churn right before the freeze.
    advanceClock(20_000);
    geometry.setContent(2347);
    geometry.setTop(91);
    scrolled(log);
    advanceClock(100);
    log.className = 'chat-log is-scrolling';
    await flushMutations();

    const report = freeze(log);
    const near = String(report.activity_near_scroll_node);
    expect(near).toContain('jump_shown:jump');
    expect(near).not.toContain('ancestor_class');
    expect(near).not.toContain('log_class');

    const pre = String(report.activity_pre_freeze);
    expect(pre).toContain('log_class');
    expect(pre).not.toContain('jump_shown');

    expect(typeof report.activity_dropped).toBe('number');
  });

  it('takes its MutationObserver down with it — no records after detach', async () => {
    // The hard one, and the reason it is asserted on the OBSERVER rather
    // than on the report: a MutationObserver that outlives its surface goes
    // on running inside somebody else's work for the rest of the session,
    // and nothing a user or a dashboard can see would ever reveal it. So the
    // constructor is wrapped and every callback the probe's observer takes is
    // counted. After teardown the count must not move again.
    const RealMutationObserver = globalThis.MutationObserver;
    let callbacks = 0;
    class CountingMutationObserver extends RealMutationObserver {
      constructor(callback: MutationCallback) {
        super((records, observer) => {
          callbacks += 1;
          callback(records, observer);
        });
      }
    }
    globalThis.MutationObserver =
      CountingMutationObserver as unknown as typeof MutationObserver;

    try {
      const { log, jump, wrap, shell } = buildChatSurface();
      stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
      const teardown = installChatScrollFreezeObserver();
      scrolled(log);
      await flushMutations();

      // First prove the observer is live, or "no callbacks after teardown"
      // would be satisfied by never having wired anything up at all.
      advanceClock(100);
      jump.className = 'chat-jump-btn od-glass-refract chat-jump-btn-active';
      await flushMutations();
      expect(callbacks).toBeGreaterThan(0);

      teardown();
      const callbacksAtTeardown = callbacks;

      // Every observed target, churned hard.
      advanceClock(100);
      jump.className = 'chat-jump-btn od-glass-refract';
      log.className = 'chat-log is-scrolling';
      log.setAttribute('style', 'overflow: hidden');
      wrap.className = 'chat-log-wrap mod-after';
      wrap.setAttribute('style', 'contain: layout');
      shell.appendChild(document.createElement('div'));
      jump.remove();
      const message = document.createElement('div');
      message.setAttribute('data-streaming', 'true');
      log.appendChild(message);
      await flushMutations();

      expect(callbacks).toBe(callbacksAtTeardown);
    } finally {
      globalThis.MutationObserver = RealMutationObserver;
    }
  });

  it('takes its animation listeners off the old shell when the log is replaced', async () => {
    // The other half of teardown, and the reason it is witnessed ACROSS two
    // surfaces: `addEventListener` de-duplicates an identical registration,
    // so re-installing on the same shell would look clean whether or not the
    // first listener was ever removed. Attaching to a DIFFERENT shell removes
    // that cover — a listener left on the old one writes into the new
    // surface's buffer, because the handler reads the module's current
    // surface.
    const first = buildChatSurface();
    stubGeometry(first.log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    const removeSpy = vi.spyOn(first.shell, 'removeEventListener');
    const teardown = installChatScrollFreezeObserver();
    scrolled(first.log);
    await flushMutations();
    teardown();

    // The `currentTarget` guard in the handler makes a leaked listener
    // inert, which is deliberate but also means the behavioural half below
    // cannot see the leak on its own. So the removal itself is pinned here.
    for (const type of ['animationstart', 'animationend', 'transitionstart', 'transitionend']) {
      expect(removeSpy).toHaveBeenCalledWith(
        type,
        expect.any(Function),
        expect.objectContaining({ capture: true }),
      );
    }

    first.wrap.remove();
    const second = buildChatSurface();
    stubGeometry(second.log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    advanceClock(100);
    scrolled(second.log);
    await flushMutations();

    // Fire on the ABANDONED shell. Nothing may reach the live surface.
    advanceClock(50);
    first.jump.dispatchEvent(new Event('transitionstart', { bubbles: true }));
    first.jump.dispatchEvent(new Event('animationstart', { bubbles: true }));
    await flushMutations();

    const report = freeze(second.log);
    expect(String(report.activity_trail)).not.toContain('trans_start');
    expect(String(report.activity_trail)).not.toContain('anim_start');
  });

  it('unhooks visibilitychange when it detaches', async () => {
    // Asserted structurally rather than behaviourally on purpose: an
    // identical `addEventListener` registration is de-duplicated by the
    // browser, and after `detach()` the handler bails on a null surface, so a
    // leaked document listener has no observable symptom to test for. What
    // CAN be pinned is that teardown actually asks for it to be removed.
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { log } = buildChatSurface();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    const teardown = installChatScrollFreezeObserver();
    scrolled(log);
    await flushMutations();

    teardown();

    expect(removeSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
      expect.objectContaining({ capture: true }),
    );
  });

  it('records parallel activity without scheduling a frame or reading layout', async () => {
    // The whole reason this module is allowed to exist. Recording what else
    // is happening must not itself cost a layout — reading `scrollHeight`
    // from a mutation callback would force the synchronous reflow that IS
    // the jank we are hunting.
    const { log, jump, wrap, shell } = buildChatSurface();
    const geometry = stubGeometry(log, {
      scrollTop: 91,
      scrollHeight: 2347,
      clientHeight: 583,
    });
    installChatScrollFreezeObserver();
    scrolled(log);
    await flushMutations();

    const framesBefore = rafSpy.mock.calls.length;
    const readsBefore = geometry.reads();

    for (let i = 0; i < 50; i += 1) {
      advanceClock(16);
      jump.className = i % 2 === 0 ? 'chat-jump-btn chat-jump-btn-active' : 'chat-jump-btn';
      log.className = `chat-log is-scrolling-${i}`;
      wrap.setAttribute('style', `--x:${i}`);
      const child = document.createElement('div');
      shell.appendChild(child);
      child.dispatchEvent(new Event('transitionstart', { bubbles: true }));
      child.remove();
      await flushMutations();
    }

    expect(rafSpy.mock.calls.length).toBe(framesBefore);
    expect(geometry.reads()).toBe(readsBefore);
    expect(geometry.writes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The shortfall ledger
// ---------------------------------------------------------------------------

/**
 * What one real capture changed
 * -----------------------------
 * A probe on a user's machine caught a live freeze, and it does not match
 * "the ceiling froze at birth". It drifts:
 *
 *   round 78  reached 851  layoutMax 851  short 0
 *   round 79  reached 850  layoutMax 851  short 1
 *   round 80  reached 846  layoutMax 851  short 5
 *   round 81  reached 842  layoutMax 851  short 9
 *   round 82  reached 839  layoutMax 851  short 12
 *   round 83  reached 824  layoutMax 851  short 27   ← reported
 *
 * The compositor's copy of "how far this scrolls" falls a little further
 * behind on each content change, and the deficit accumulates. The 91 /
 * 1673px case seen earlier is presumably the same mechanism run to the
 * floor, not a second defect.
 *
 * The same capture also rules out the decorations: no thinking block, no
 * tool row, no question form, no error card, no iframe, no inner scroller.
 * One user message and one 1188px-tall assistant message, and that is all.
 *
 * So the question the report has to answer stops being "what was on screen"
 * and becomes "which content change did the compositor first fail to keep
 * up with, and by how much each time".
 */
describe('chat-scroll-freeze-detector — shortfall ledger', () => {
  it('pairs each content change with how far the wheel could actually reach', () => {
    const ledger = createShortfallLedger(8);
    recordContentStep(ledger, {
      at: 1000,
      contentPx: 1434,
      viewportPx: 583,
      layoutMax: 851,
      growthRole: 'assistant_msg',
      growthPx: 534,
    });
    recordCeilingProbe(ledger, { at: 1100, reachedPx: 851, layoutMax: 851, contentPx: 1434 });
    recordCeilingProbe(ledger, { at: 1400, reachedPx: 850, layoutMax: 851, contentPx: 1434 });

    expect(serialiseContentSteps(ledger.steps, 1000)).toBe(
      '0:c1434/v583/m851+assistant_msg:534',
    );
    expect(serialiseCeilingProbes(ledger.probes, 1000)).toBe(
      '100:r851/m851/s0,400:r850/m851/s1',
    );
    expect(ledger.stepCount).toBe(1);
    expect(ledger.probeCount).toBe(2);
  });

  it('names the content change the compositor first failed to keep up with', () => {
    // The headline field. Everything after the first millimetre of drift is
    // detail; WHERE it started is the lead.
    const ledger = createShortfallLedger(8);
    recordContentStep(ledger, {
      at: 900,
      contentPx: 900,
      viewportPx: 583,
      layoutMax: 317,
      growthRole: 'user_msg',
      growthPx: 185,
    });
    recordCeilingProbe(ledger, { at: 950, reachedPx: 317, layoutMax: 317, contentPx: 900 });
    recordContentStep(ledger, {
      at: 1000,
      contentPx: 1434,
      viewportPx: 583,
      layoutMax: 851,
      growthRole: 'assistant_msg',
      growthPx: 534,
    });
    recordCeilingProbe(ledger, { at: 1400, reachedPx: 850, layoutMax: 851, contentPx: 1434 });
    // …and a much bigger one later, which must NOT overwrite the first.
    recordCeilingProbe(ledger, { at: 2400, reachedPx: 824, layoutMax: 851, contentPx: 1434 });

    expect(ledger.first).not.toBeNull();
    expect(ledger.first?.at).toBe(1400);
    expect(ledger.first?.shortfallPx).toBe(1);
    expect(ledger.first?.contentPx).toBe(1434);
    // The content change it belongs to, and what grew to cause it.
    expect(ledger.first?.growthRole).toBe('assistant_msg');
    expect(ledger.first?.growthPx).toBe(534);
  });

  it('does not call a clean bottom the start of the drift', () => {
    // Round 78 reached exactly its layout maximum. A ledger that recorded
    // that as "the first shortfall" would point at the wrong content change
    // in every single report.
    const ledger = createShortfallLedger(8);
    recordCeilingProbe(ledger, { at: 100, reachedPx: 851, layoutMax: 851, contentPx: 1434 });
    // Sub-pixel slack is not drift either.
    recordCeilingProbe(ledger, { at: 200, reachedPx: 850.6, layoutMax: 851, contentPx: 1434 });
    expect(ledger.first).toBeNull();

    recordCeilingProbe(ledger, { at: 300, reachedPx: 850, layoutMax: 851, contentPx: 1434 });
    expect(ledger.first?.at).toBe(300);
  });

  it('forgets old rounds but never the first shortfall', () => {
    // A streaming turn produces content changes for as long as it runs, so
    // the rings have to evict. The moment the deficit opened is the one
    // thing that must survive an hour of scrollback.
    const ledger = createShortfallLedger(2);
    recordCeilingProbe(ledger, { at: 100, reachedPx: 850, layoutMax: 851, contentPx: 1434 });
    for (let i = 0; i < 10; i += 1) {
      recordContentStep(ledger, {
        at: 1000 + i * 100,
        contentPx: 1434 + i,
        viewportPx: 583,
        layoutMax: 851 + i,
      });
      recordCeilingProbe(ledger, {
        at: 1050 + i * 100,
        reachedPx: 800 - i,
        layoutMax: 851 + i,
        contentPx: 1434 + i,
      });
    }
    expect(ledger.steps).toHaveLength(2);
    expect(ledger.probes).toHaveLength(2);
    expect(ledger.first?.at).toBe(100);
    expect(ledger.first?.shortfallPx).toBe(1);
    expect(ledger.stepCount).toBe(10);
    expect(ledger.probeCount).toBe(11);
  });

  it('collapses a run of identical rounds at the same ceiling', () => {
    // The user wheels at the dead bottom for a while before giving up. Ten
    // ring slots spent saying "851/851/0" ten times would evict the drift.
    const ledger = createShortfallLedger(8);
    for (let i = 0; i < 5; i += 1) {
      recordCeilingProbe(ledger, {
        at: 100 + i * 50,
        reachedPx: 851,
        layoutMax: 851,
        contentPx: 1434,
      });
    }
    recordCeilingProbe(ledger, { at: 600, reachedPx: 846, layoutMax: 851, contentPx: 1434 });
    expect(ledger.probes).toHaveLength(2);
    expect(serialiseCeilingProbes(ledger.probes, 0)).toBe(
      '100:r851/m851/s0x5,600:r846/m851/s5',
    );
  });
});

describe('observability/chat-scroll-freeze — shortfall wiring', () => {
  /** jsdom computes no layout, so child heights are installed by hand too. */
  function stubHeight(el: HTMLElement, initial: number): {
    set(value: number): void;
    reads(): number;
  } {
    let height = initial;
    let reads = 0;
    Object.defineProperty(el, 'offsetHeight', {
      configurable: true,
      get: () => {
        reads += 1;
        return height;
      },
    });
    return {
      set: (value) => {
        height = value;
      },
      reads: () => reads,
    };
  }

  it('replays the captured drift: every round, its ceiling, and where it began', () => {
    // The real capture, number for number. `layoutMax` never moves; what
    // moves is how far the wheel can actually get.
    const { log } = buildChatSurface();
    const geometry = stubGeometry(log, { scrollTop: 0, scrollHeight: 900, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);

    advanceClock(1000);
    geometry.setContent(1434);
    geometry.setTop(851);
    scrolled(log);

    for (const reached of [851, 850, 846, 842, 839, 824]) {
      advanceClock(300);
      geometry.setTop(reached);
      wheel(log, 120);
    }

    const report = eventsNamed('client_chat_scroll_frozen')[0] ?? {};
    expect(report.trigger).toBe('wheel_snap_back');
    expect(report.unreachable_px).toBe(27);

    const probes = String(report.ceiling_probes);
    expect(probes).toContain('r851/m851/s0');
    expect(probes).toContain('r850/m851/s1');
    expect(probes).toContain('r846/m851/s5');
    expect(probes).toContain('r842/m851/s9');
    expect(probes).toContain('r839/m851/s12');
    expect(probes).toContain('r824/m851/s27');
    expect(report.ceiling_probe_count).toBe(6);

    // The drift opened on the 850 round, against 1434px of content.
    expect(report.shortfall_first_px).toBe(1);
    expect(report.shortfall_first_content_px).toBe(1434);
    expect(report.shortfall_first_reached_px).toBe(850);
    expect(report.shortfall_first_layout_max_px).toBe(851);
    expect(report.shortfall_first_ms).toBe(1600);
  });

  it('records every content-height change, not only the 200px steps', () => {
    // `transitions` deliberately only records 200px steps so a token stream
    // cannot flood it. The ledger cannot afford that filter: the capture
    // shows the deficit growing a handful of pixels at a time.
    const { log } = buildChatSurface();
    const geometry = stubGeometry(log, { scrollTop: 0, scrollHeight: 900, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);

    for (const content of [910, 918, 931, 940]) {
      advanceClock(300);
      geometry.setContent(content);
      scrolled(log);
    }
    geometry.setTop(91);
    geometry.setContent(2347);
    advanceClock(300);
    scrolled(log);

    const report = freeze(log);
    const steps = String(report.content_steps);
    expect(steps).toContain('c910/v583/m327');
    expect(steps).toContain('c918/v583/m335');
    expect(steps).toContain('c931/v583/m348');
    expect(steps).toContain('c940/v583/m357');
    // The 200px-step trail must be unchanged — it has a different job.
    expect(String(report.transitions)).not.toContain('c910');
  });

  it('attributes the growth to the child that got taller', () => {
    // The capture had ONE assistant message doing all the growing. Knowing
    // that it grows in 500px jumps rather than a token at a time is the
    // difference between a reproduction and another 225 failed attempts.
    const { log } = buildChatSurface();
    const geometry = stubGeometry(log, { scrollTop: 0, scrollHeight: 900, clientHeight: 583 });
    const user = document.createElement('div');
    user.className = 'msg user';
    const assistant = document.createElement('div');
    assistant.className = 'msg assistant';
    const spacer = document.createElement('div');
    spacer.className = 'chat-log-tail-spacer';
    log.append(user, assistant, spacer);
    stubHeight(user, 185);
    const assistantHeight = stubHeight(assistant, 654);
    stubHeight(spacer, 0);

    installChatScrollFreezeObserver();
    scrolled(log);

    advanceClock(500);
    assistantHeight.set(1188);
    geometry.setContent(1434);
    geometry.setTop(851);
    scrolled(log);

    advanceClock(300);
    geometry.setTop(824);
    wheel(log, 120);

    const report = eventsNamed('client_chat_scroll_frozen')[0] ?? {};
    expect(String(report.content_steps)).toContain('+assistant_msg:534');
    expect(report.shortfall_first_growth).toBe('assistant_msg:534');
    // The spacer was 0 throughout — recorded, because "it never had height"
    // is itself a fact about whether it participates.
    expect(report.tail_spacer_px).toBe(0);
  });

  it('measures children only when the content height moved', () => {
    // The one genuinely new cost in this change: reading `offsetHeight` off
    // the log's children. It is bounded to the tail of the list AND gated on
    // the content height having changed, so a user scrolling a settled
    // transcript pays nothing for it.
    const { log } = buildChatSurface();
    const geometry = stubGeometry(log, {
      scrollTop: 91,
      scrollHeight: 2347,
      clientHeight: 583,
    });
    const assistant = document.createElement('div');
    assistant.className = 'msg assistant';
    log.append(assistant);
    const height = stubHeight(assistant, 1188);

    installChatScrollFreezeObserver();
    scrolled(log);
    const readsAfterAttach = height.reads();

    // Fifty frames on a transcript whose height never moves.
    for (let i = 0; i < 50; i += 1) {
      advanceClock(300);
      scrolled(log);
    }
    expect(height.reads()).toBe(readsAfterAttach);

    // …and one frame where it does.
    advanceClock(300);
    geometry.setContent(2547);
    scrolled(log);
    expect(height.reads()).toBeGreaterThan(readsAfterAttach);
  });

  it('does not let the ledger outlive its surface', async () => {
    const { log } = buildChatSurface();
    const geometry = stubGeometry(log, { scrollTop: 0, scrollHeight: 900, clientHeight: 583 });
    const teardown = installChatScrollFreezeObserver();
    scrolled(log);
    advanceClock(300);
    geometry.setContent(1434);
    scrolled(log);
    teardown();

    // A fresh surface must start from an empty ledger, not inherit one.
    __resetChatScrollFreezeForTest();
    document.body.innerHTML = '';
    const second = buildChatSurface();
    stubGeometry(second.log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    advanceClock(300);
    scrolled(second.log);
    await flushMutations();

    const report = freeze(second.log);
    expect(report.content_steps).toBe('');
    expect(report.content_step_count).toBe(0);
    // The second surface produces a shortfall of its own — what it must not
    // do is describe the FIRST surface's content while doing so.
    expect(report.shortfall_first_content_px).toBe(2347);
  });
});
