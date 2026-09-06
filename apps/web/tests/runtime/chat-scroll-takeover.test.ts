// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearExceptionTrackingContext,
  setExceptionTrackingContext,
} from '../../src/analytics/error-tracking';
import {
  __resetChatScrollFreezeForTest,
  chatScrollFreezeListenerCount,
  installChatScrollFreezeObserver,
} from '../../src/observability/chat-scroll-freeze';
import { FREEZE_WHEEL_COUNT } from '../../src/observability/chat-scroll-freeze-detector';
import {
  CHAT_SCROLL_TAKEOVER_STORAGE_KEY,
  __resetChatScrollTakeoverForTest,
  chatScrollTakeoverEngaged,
  installChatScrollTakeover,
} from '../../src/runtime/chat-scroll-takeover';

/**
 * What these specs encode
 * ----------------------
 * The chat log's compositor-side scroll extent goes stale (see
 * `observability/chat-scroll-freeze.ts` for the measurement). The effect on a
 * real machine, measured with real OS wheel events:
 *
 *   scrollTop = 1700 assigned from JS  → took effect
 *   scrollTop = 99999 assigned from JS → clamped to the real layout maximum
 *   12 wheel notches asking for 1440px → stopped dead at 91
 *
 * So the JS write path is healthy and the wheel path is not. This module takes
 * the wheel over — `preventDefault` plus a programmatic write — but ONLY after
 * the probe has said the surface is frozen, and ONLY when an operator has
 * turned the switch on.
 *
 * The switch is the load-bearing part. The probe has never been validated
 * against real-world false positives (its production event count is zero, and
 * that zero turns out to be a reporting bug rather than evidence of accuracy),
 * so an unproven detector is not allowed to change how scrolling feels for
 * everybody. Three specs below exist purely to pin "off means off".
 *
 * jsdom performs no layout — `scrollHeight` / `clientHeight` are 0 for every
 * element it builds — so geometry is installed by hand, exactly as the freeze
 * probe's own specs do it. What that CANNOT show is the thing only a browser
 * has: how the takeover actually feels under a trackpad flick. That stays in
 * the handoff notes rather than being faked here.
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
  top(): number;
  /** Every write the code under test made to `scrollTop`. */
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
    top: () => top,
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

/** The measured failing surface: 1764px of real travel, wheel stuck at 91. */
const FROZEN = { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 } as const;
const LAYOUT_MAX = FROZEN.scrollHeight - FROZEN.clientHeight;

function scrolled(target: HTMLElement): void {
  target.dispatchEvent(new Event('scroll', { bubbles: false }));
}

/** Dispatch one wheel notch and hand back the event, so the spec can ask whether it was consumed. */
function wheelEvent(
  target: HTMLElement,
  deltaY: number,
  init: { deltaMode?: number; ctrlKey?: boolean } = {},
): WheelEvent {
  const event = new WheelEvent('wheel', {
    deltaY,
    deltaMode: init.deltaMode ?? 0,
    ctrlKey: init.ctrlKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

function turnSwitchOn(): void {
  globalThis.localStorage.setItem(CHAT_SCROLL_TAKEOVER_STORAGE_KEY, '1');
}

/**
 * Drive the probe to a reported freeze on `log`, and stop the instant it calls
 * it.
 *
 * Exactly `FREEZE_WHEEL_COUNT` notches of 120px: four stalled notches asking
 * for 480px clears both bars the detector holds a report behind (four notches,
 * 240px). Stopping there matters — the takeover engages during the last
 * notch's frame, so a fifth would already be taken over and every spec below
 * would be reasoning about a log this module had moved.
 */
function driveToFreeze(log: HTMLElement): void {
  scrolled(log);
  for (let i = 0; i < FREEZE_WHEEL_COUNT; i += 1) {
    advanceClock(16);
    wheelEvent(log, 120);
  }
}

beforeEach(() => {
  clock = 0;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  setExceptionTrackingContext({
    apiKey: 'phc_test',
    host: 'https://us.i.posthog.com',
    distinctId: 'chat-scroll-takeover-test',
  });
  // A synchronous rAF makes both the probe and the takeover deterministic:
  // one wheel in, one applied frame out, nothing to await.
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
  globalThis.localStorage.clear();
  document.body.innerHTML = '';
  __resetChatScrollTakeoverForTest();
  __resetChatScrollFreezeForTest();
});

afterEach(() => {
  __resetChatScrollTakeoverForTest();
  __resetChatScrollFreezeForTest();
  vi.restoreAllMocks();
  clearExceptionTrackingContext();
  globalThis.localStorage.clear();
  globalThis.fetch = ORIGINAL_FETCH;
  globalThis.requestAnimationFrame = ORIGINAL_RAF;
  globalThis.cancelAnimationFrame = ORIGINAL_CAF;
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Off is off
// ---------------------------------------------------------------------------

describe('chat scroll takeover — the switch', () => {
  it('costs no listener, no timer and no frame while the switch is off', () => {
    // The whole justification for shipping this dark: an unproven detector must
    // not be able to change scrolling for a user who never asked for it. "Off"
    // therefore has to mean *nothing runs*, not "runs and decides not to act".
    const log = buildChatLog();
    stubGeometry(log, FROZEN);
    const addOnLog = vi.spyOn(log, 'addEventListener');
    const addOnDocument = vi.spyOn(document, 'addEventListener');
    const addOnWindow = vi.spyOn(window, 'addEventListener');
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const interval = vi.spyOn(globalThis, 'setInterval');
    const framesBefore = rafSpy.mock.calls.length;

    for (let i = 0; i < 20; i += 1) installChatScrollTakeover();

    expect(addOnLog).not.toHaveBeenCalled();
    expect(addOnDocument).not.toHaveBeenCalled();
    expect(addOnWindow).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(rafSpy.mock.calls.length).toBe(framesBefore);
    // …and it did not even subscribe. A subscription costs no listener, no
    // timer and no frame, so none of the spies above can see one — which would
    // leave "off" pinned by its outcome and not by its cost.
    expect(chatScrollFreezeListenerCount()).toBe(0);
  });

  it('does not take the wheel over when the probe calls a freeze and the switch is off', () => {
    // THE guard this change is most likely to need. A false positive from the
    // detector must be inert for everybody who has not opted in.
    const log = buildChatLog();
    const geometry = stubGeometry(log, FROZEN);
    installChatScrollFreezeObserver();
    installChatScrollTakeover();

    driveToFreeze(log);
    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(1);

    const after = wheelEvent(log, 120);
    expect(after.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);
    expect(chatScrollTakeoverEngaged()).toBe(false);
  });

  it('does not take the wheel over before a freeze even when the switch is on', () => {
    // The other half of the same risk: an opted-in user still scrolls
    // natively until the probe has actually called it. If this ever goes red,
    // the takeover is stealing healthy scrolling.
    turnSwitchOn();
    const log = buildChatLog();
    const geometry = stubGeometry(log, { scrollTop: 0, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    installChatScrollTakeover();
    scrolled(log);

    // A healthy scroller: every notch moves it, so no streak can accumulate.
    for (let i = 0; i < 12; i += 1) {
      advanceClock(16);
      geometry.setTop(120 * (i + 1));
      const event = wheelEvent(log, 120);
      expect(event.defaultPrevented).toBe(false);
    }

    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(0);
    expect(geometry.writes).toEqual([]);
    expect(chatScrollTakeoverEngaged()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Engaged behaviour
// ---------------------------------------------------------------------------

describe('chat scroll takeover — once the probe has called it frozen', () => {
  function freezeWithSwitchOn(): { log: HTMLElement; geometry: GeometryHandle } {
    turnSwitchOn();
    const log = buildChatLog();
    const geometry = stubGeometry(log, FROZEN);
    installChatScrollFreezeObserver();
    installChatScrollTakeover();
    driveToFreeze(log);
    return { log, geometry };
  }

  it('consumes the wheel and moves the log by the delta the wheel asked for', () => {
    // The red spec this change exists for: the compositor will not move the
    // log, the JS write path will, so the wheel is answered from JavaScript.
    const { log, geometry } = freezeWithSwitchOn();
    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(1);
    expect(chatScrollTakeoverEngaged()).toBe(true);

    const event = wheelEvent(log, 120);

    expect(event.defaultPrevented).toBe(true);
    expect(geometry.writes).toEqual([FROZEN.scrollTop + 120]);
    expect(geometry.top()).toBe(211);
  });

  it('scrolls back up too, rather than leaving two input paths fighting', () => {
    // Upward wheels still work natively during a freeze, so leaving them alone
    // was an option. It is the wrong one: a single trackpad flick carries both
    // signs, and splitting one gesture across a native path and a programmatic
    // one makes the two disagree about where the log is.
    const { log, geometry } = freezeWithSwitchOn();
    geometry.setTop(800);

    const event = wheelEvent(log, -120);

    expect(event.defaultPrevented).toBe(true);
    expect(geometry.writes).toEqual([680]);
  });

  it('applies a burst of notches once per frame, not once per event', () => {
    // Writing `scrollTop` from the handler would put a forced layout on the
    // input path and make a fast flick judder. One write per frame, carrying
    // the whole burst.
    const { log, geometry } = freezeWithSwitchOn();
    // No frame runs until we say so, so the notches have to accumulate.
    rafSpy.mockImplementation(() => ++rafHandle);
    const callbacks: FrameRequestCallback[] = [];
    rafSpy.mockImplementation((cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return ++rafHandle;
    });

    wheelEvent(log, 40);
    wheelEvent(log, 40);
    wheelEvent(log, 40);
    expect(geometry.writes).toEqual([]);

    // Exactly one frame was asked for, and it carries all three notches.
    const takeoverFrames = callbacks.length;
    expect(takeoverFrames).toBe(1);
    callbacks.forEach((cb) => cb(clock));
    expect(geometry.writes).toEqual([FROZEN.scrollTop + 120]);
  });

  it('normalises line and page wheels the way the detector does', () => {
    // `deltaMode` is 0 / 1 / 2 depending on device and OS. A line wheel that
    // moved 3 raw units must not move the log 3px.
    const { log, geometry } = freezeWithSwitchOn();

    wheelEvent(log, 3, { deltaMode: 1 });
    expect(geometry.writes).toEqual([FROZEN.scrollTop + 48]);

    geometry.setTop(0);
    wheelEvent(log, 1, { deltaMode: 2 });
    expect(geometry.writes[1]).toBe(FROZEN.clientHeight);
  });

  it('clamps to the real layout extent instead of running off either end', () => {
    const { log, geometry } = freezeWithSwitchOn();

    wheelEvent(log, 99_999);
    expect(geometry.writes).toEqual([LAYOUT_MAX]);

    wheelEvent(log, -99_999);
    expect(geometry.writes).toEqual([LAYOUT_MAX, 0]);
  });

  it('leaves a wheel alone when a scrollable box inside the log can still eat it', () => {
    // Every code block and tool-output box in a transcript is a scrollport.
    // `preventDefault` at the log would freeze all of them, which would be a
    // worse bug than the one being worked around.
    const { log, geometry } = freezeWithSwitchOn();
    const inner = document.createElement('pre');
    inner.style.overflowY = 'auto';
    stubGeometry(inner, { scrollTop: 0, scrollHeight: 900, clientHeight: 200 });
    log.appendChild(inner);

    const event = wheelEvent(inner, 120);

    expect(event.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);
  });

  it('leaves a zoom gesture alone', () => {
    // ctrl+wheel is pinch-to-zoom on a trackpad. Consuming it would take page
    // zoom away from the user.
    const { log, geometry } = freezeWithSwitchOn();

    const event = wheelEvent(log, 120, { ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);
  });

  it('lets the wheel chain onward once the log is genuinely at its end', () => {
    // At a real edge the native behaviour is to hand the wheel to whatever is
    // outside. Holding on to it there would trap the gesture inside a log that
    // has nothing left to give.
    const { log, geometry } = freezeWithSwitchOn();
    // Drive to the bottom through the takeover itself, so the edge it sees is
    // one it put the log at rather than one the spec asserted behind its back.
    wheelEvent(log, 99_999);
    expect(geometry.top()).toBe(LAYOUT_MAX);
    geometry.writes.length = 0;

    const event = wheelEvent(log, 120);

    expect(event.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);
  });

  it('does not strand the user at a bottom that has since moved', () => {
    // The edge check runs against a frame-old cache, which is fine for a
    // settled log and a deadlock for a streaming one: parked at what used to
    // be the bottom, every wheel is declined, a declined wheel schedules
    // nothing, and nothing ever re-reads the geometry that would let the next
    // one through — on a surface whose native path is broken. So a declined
    // wheel still asks for a frame, purely to take a fresh reading.
    const { log, geometry } = freezeWithSwitchOn();
    wheelEvent(log, 99_999);
    expect(geometry.top()).toBe(LAYOUT_MAX);
    geometry.writes.length = 0;

    // A turn streams in: the log is now 600px taller than the takeover thinks.
    geometry.setContent(FROZEN.scrollHeight + 600);

    // This one is declined against the stale bottom — and refreshes the cache.
    const stale = wheelEvent(log, 120);
    expect(stale.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);

    // …so the next one reaches the content that arrived.
    const fresh = wheelEvent(log, 120);
    expect(fresh.defaultPrevented).toBe(true);
    expect(geometry.writes).toEqual([LAYOUT_MAX + 120]);
  });
});

// ---------------------------------------------------------------------------
// Coming off
// ---------------------------------------------------------------------------

describe('chat scroll takeover — teardown', () => {
  it('releases the wheel when the chat log is replaced', () => {
    // Leaving and re-entering the chat tab unmounts and rebuilds the log,
    // which is the one thing known to clear the stale ceiling. The replacement
    // must start out scrolling natively — otherwise one freeze would degrade
    // the surface for the rest of the session.
    turnSwitchOn();
    const first = buildChatLog();
    const firstGeometry = stubGeometry(first, FROZEN);
    installChatScrollFreezeObserver();
    installChatScrollTakeover();
    driveToFreeze(first);
    expect(chatScrollTakeoverEngaged()).toBe(true);

    first.remove();
    const second = buildChatLog();
    const secondGeometry = stubGeometry(second, {
      scrollTop: 0,
      scrollHeight: 2347,
      clientHeight: 583,
    });
    advanceClock(500);
    // The probe notices the swap on the next scroll out of the new log.
    scrolled(second);

    expect(chatScrollTakeoverEngaged()).toBe(false);
    const onOld = wheelEvent(first, 120);
    expect(onOld.defaultPrevented).toBe(false);
    expect(firstGeometry.writes).toEqual([]);
    const onNew = wheelEvent(second, 120);
    expect(onNew.defaultPrevented).toBe(false);
    expect(secondGeometry.writes).toEqual([]);
  });

  it('releases the wheel when the installer is torn down', () => {
    turnSwitchOn();
    const log = buildChatLog();
    const geometry = stubGeometry(log, FROZEN);
    installChatScrollFreezeObserver();
    const teardown = installChatScrollTakeover();
    driveToFreeze(log);
    expect(chatScrollTakeoverEngaged()).toBe(true);

    teardown();

    expect(chatScrollTakeoverEngaged()).toBe(false);
    const event = wheelEvent(log, 120);
    expect(event.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);
  });
});
