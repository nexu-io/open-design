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
import {
  FREEZE_WHEEL_COUNT,
  MIN_UNREACHABLE_PX,
} from '../../src/observability/chat-scroll-freeze-detector';
import {
  CHAT_SCROLL_TAKEOVER_STORAGE_KEY,
  KEYBOARD_LINE_PX,
  KEYBOARD_PAGE_FRACTION,
  OBSERVATION_SETTLE_MS,
  __resetChatScrollTakeoverForTest,
  chatScrollTakeoverEngaged,
  chatScrollTakeoverPhase,
  installChatScrollTakeover,
  releaseChatScrollTakeover,
} from '../../src/runtime/chat-scroll-takeover';
import {
  FROZEN,
  LAYOUT_MAX,
  buildChatLog,
  decodeSafetyEvents,
  keyEvent,
  scrolled,
  stubGeometry,
  wheelEvent,
  type GeometryHandle,
} from '../helpers/chat-scroll-fixture';

/**
 * What these specs encode
 * ----------------------
 * Once the probe calls the chat log frozen, three things happen in order:
 *
 *   1. THE KICK — one frame of `will-change: transform` on the log, so Blink
 *      rebuilds the scroller's compositing state from the current layout. No
 *      layout change, no `scrollTop` write, style restored on the next frame.
 *   2. THE OBSERVATION — the next downward wheel is let through natively and
 *      its displacement is compared with what it asked for. Close enough (the
 *      detector's own 8px yardstick) means the kick healed it; stuck, short or
 *      thrown backwards means it did not.
 *   3. THE TAKEOVER — only after a failed observation: wheel AND keyboard are
 *      answered from JavaScript, until the conversation changes or the surface
 *      is released.
 *
 * The takeover is on by default now; `open-design:chat-scroll-takeover = '0'`
 * is the escape hatch.
 *
 * Frames are queued here, not run synchronously: the kick is defined by what
 * happens BETWEEN two frames, and a synchronous rAF stub would collapse that
 * window to nothing.
 */

const fetchMock = vi.fn();
const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_RAF = globalThis.requestAnimationFrame;
const ORIGINAL_CAF = globalThis.cancelAnimationFrame;

let frames: Array<{ handle: number; cb: FrameRequestCallback }> = [];
let rafHandle = 0;
let clock = 0;

function advanceClock(ms: number): void {
  clock += ms;
}

/** Run every frame callback queued so far (and none queued by them). */
function runFrames(): void {
  const batch = frames;
  frames = [];
  for (const frame of batch) frame.cb(clock);
}

function eventsNamed(name: string): Array<Record<string, unknown>> {
  return decodeSafetyEvents(fetchMock)
    .filter((e) => e.event === name)
    .map((e) => e.properties);
}

/**
 * Drive the probe to a reported freeze on `log`, running the probe's frame
 * after each notch, and stop the instant it calls it — with the takeover's
 * kick frame still queued.
 */
function driveToFreeze(log: HTMLElement): void {
  scrolled(log);
  runFrames();
  for (let i = 0; i < FREEZE_WHEEL_COUNT; i += 1) {
    advanceClock(16);
    wheelEvent(log, 120);
    runFrames();
  }
}

function mountFrozen(): { log: HTMLElement; geometry: GeometryHandle } {
  const log = buildChatLog();
  const geometry = stubGeometry(log, FROZEN);
  installChatScrollFreezeObserver();
  installChatScrollTakeover();
  driveToFreeze(log);
  expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(1);
  return { log, geometry };
}

/** Freeze, let the kick frame pass, and leave the module waiting for its notch. */
function mountProbing(): { log: HTMLElement; geometry: GeometryHandle } {
  const mounted = mountFrozen();
  runFrames();
  expect(chatScrollTakeoverPhase()).toBe('probing');
  return mounted;
}

/** Freeze, kick, fail the observation notch, and land in the takeover. */
function mountEngaged(): { log: HTMLElement; geometry: GeometryHandle } {
  const mounted = mountProbing();
  const notch = wheelEvent(mounted.log, 120);
  expect(notch.defaultPrevented).toBe(false);
  vi.advanceTimersByTime(OBSERVATION_SETTLE_MS);
  expect(chatScrollTakeoverEngaged()).toBe(true);
  mounted.geometry.writes.length = 0;
  return mounted;
}

beforeEach(() => {
  clock = 0;
  frames = [];
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  setExceptionTrackingContext({
    apiKey: 'phc_test',
    host: 'https://us.i.posthog.com',
    distinctId: 'chat-scroll-selfheal-test',
    clientType: 'web',
    osName: 'Mac OS X',
  });
  globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
    const handle = ++rafHandle;
    frames.push({ handle, cb });
    return handle;
  }) as unknown as typeof globalThis.requestAnimationFrame;
  globalThis.cancelAnimationFrame = vi.fn((handle: number) => {
    frames = frames.filter((frame) => frame.handle !== handle);
  }) as unknown as typeof globalThis.cancelAnimationFrame;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  globalThis.localStorage.clear();
  document.body.innerHTML = '';
  __resetChatScrollTakeoverForTest();
  __resetChatScrollFreezeForTest();
});

afterEach(() => {
  __resetChatScrollTakeoverForTest();
  __resetChatScrollFreezeForTest();
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearExceptionTrackingContext();
  globalThis.localStorage.clear();
  globalThis.fetch = ORIGINAL_FETCH;
  globalThis.requestAnimationFrame = ORIGINAL_RAF;
  globalThis.cancelAnimationFrame = ORIGINAL_CAF;
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// The switch: on by default, '0' is the escape hatch
// ---------------------------------------------------------------------------

describe('self-heal — the switch', () => {
  it('subscribes to the probe with no storage key set at all', () => {
    // The product decision: every user gets the kick and the takeover. A
    // fresh profile has no key, and that must mean ON.
    installChatScrollTakeover();
    expect(chatScrollFreezeListenerCount()).toBe(1);
  });

  it("costs no listener, no timer and no frame when the key is '0'", () => {
    globalThis.localStorage.setItem(CHAT_SCROLL_TAKEOVER_STORAGE_KEY, '0');
    const log = buildChatLog();
    stubGeometry(log, FROZEN);
    const addOnLog = vi.spyOn(log, 'addEventListener');
    const addOnDocument = vi.spyOn(document, 'addEventListener');
    const addOnWindow = vi.spyOn(window, 'addEventListener');
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const framesBefore = frames.length;

    for (let i = 0; i < 20; i += 1) installChatScrollTakeover();

    expect(addOnLog).not.toHaveBeenCalled();
    expect(addOnDocument).not.toHaveBeenCalled();
    expect(addOnWindow).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
    expect(frames.length).toBe(framesBefore);
    expect(chatScrollFreezeListenerCount()).toBe(0);
  });

  it("leaves the wheel and the style alone after a freeze when the key is '0'", () => {
    globalThis.localStorage.setItem(CHAT_SCROLL_TAKEOVER_STORAGE_KEY, '0');
    const log = buildChatLog();
    const geometry = stubGeometry(log, FROZEN);
    installChatScrollFreezeObserver();
    installChatScrollTakeover();
    driveToFreeze(log);
    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(1);

    expect(log.style.willChange).toBe('');
    runFrames();
    const after = wheelEvent(log, 120);
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS);
    expect(after.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);
    expect(chatScrollTakeoverEngaged()).toBe(false);
    expect(eventsNamed('client_chat_scroll_heal')).toHaveLength(0);
  });

  it("treats the legacy '1' as on, like any value other than '0'", () => {
    globalThis.localStorage.setItem(CHAT_SCROLL_TAKEOVER_STORAGE_KEY, '1');
    installChatScrollTakeover();
    expect(chatScrollFreezeListenerCount()).toBe(1);
  });

  it('stays on when storage cannot be read', () => {
    // An unreadable hatch is a hatch nobody pulled. The old reading — "an
    // unreadable switch is an off switch" — inverted with the default.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    installChatScrollTakeover();
    expect(chatScrollFreezeListenerCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The kick
// ---------------------------------------------------------------------------

describe('self-heal — the kick', () => {
  it('promotes the log for exactly one frame and then restores the style verbatim', () => {
    const { log } = mountFrozen();

    // Applied inside the probe's own frame, the instant the verdict lands.
    expect(log.style.willChange).toBe('transform');
    // …and gone the frame after.
    runFrames();
    expect(log.style.willChange).toBe('');
    expect(log.getAttribute('style')).toBeNull();
  });

  it('hands back whatever inline will-change the element already carried', () => {
    const log = buildChatLog();
    log.style.willChange = 'scroll-position';
    stubGeometry(log, FROZEN);
    installChatScrollFreezeObserver();
    installChatScrollTakeover();
    driveToFreeze(log);

    expect(log.style.willChange).toBe('transform');
    runFrames();
    expect(log.style.willChange).toBe('scroll-position');
  });

  it('writes nothing to scrollTop and changes no geometry', () => {
    const { log, geometry } = mountFrozen();
    runFrames();
    expect(geometry.writes).toEqual([]);
    expect(log.scrollTop).toBe(FROZEN.scrollTop);
    expect(log.scrollHeight).toBe(FROZEN.scrollHeight);
    expect(log.clientHeight).toBe(FROZEN.clientHeight);
  });

  it('does not touch the wheel while the kick frame is still pending', () => {
    // A wheel that lands between the verdict and the restore frame is the
    // user's own, and the kick has not had its frame yet — nothing to judge.
    const { log, geometry } = mountFrozen();
    const early = wheelEvent(log, 120);
    expect(early.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);
    runFrames();
    expect(chatScrollTakeoverPhase()).toBe('probing');
  });

  it('restores the style if the surface is released mid-kick', () => {
    const { log } = mountFrozen();
    expect(log.style.willChange).toBe('transform');
    log.remove();
    const second = buildChatLog();
    stubGeometry(second, { scrollTop: 0, scrollHeight: 2347, clientHeight: 583 });
    scrolled(second); // the probe notices the swap and releases the old surface
    expect(log.style.willChange).toBe('');
    expect(chatScrollTakeoverPhase()).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// The observation notch
// ---------------------------------------------------------------------------

describe('self-heal — the observation notch', () => {
  it('lets the notch through natively and calls it healed when it moved as asked', () => {
    const { log, geometry } = mountProbing();

    const notch = wheelEvent(log, 120);
    expect(notch.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);
    // The browser answers: the log moved by the whole notch.
    geometry.setTop(FROZEN.scrollTop + 120);
    scrolled(log);
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS);

    expect(chatScrollTakeoverEngaged()).toBe(false);
    expect(chatScrollTakeoverPhase()).toBe('idle');
    const heal = eventsNamed('client_chat_scroll_heal');
    expect(heal).toHaveLength(1);
    expect(heal[0]).toMatchObject({ outcome: 'healed', notch_moved_px: 120 });
    // Native from here on.
    const later = wheelEvent(log, 120);
    expect(later.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);
  });

  it('tolerates the detector’s own 8px shortfall as healed', () => {
    const { log, geometry } = mountProbing();
    wheelEvent(log, 120);
    geometry.setTop(FROZEN.scrollTop + 120 - MIN_UNREACHABLE_PX);
    scrolled(log);
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS);
    expect(eventsNamed('client_chat_scroll_heal')[0]).toMatchObject({ outcome: 'healed' });
    expect(chatScrollTakeoverEngaged()).toBe(false);
  });

  it('takes over when the notch moved nothing', () => {
    const { log, geometry } = mountProbing();
    const notch = wheelEvent(log, 120);
    expect(notch.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS);

    expect(chatScrollTakeoverEngaged()).toBe(true);
    const heal = eventsNamed('client_chat_scroll_heal');
    expect(heal).toHaveLength(1);
    expect(heal[0]).toMatchObject({
      outcome: 'takeover',
      notch_requested_px: 120,
      notch_moved_px: 0,
    });
    // The next notch is answered from JavaScript, in the next frame.
    const next = wheelEvent(log, 120);
    expect(next.defaultPrevented).toBe(true);
    runFrames();
    expect(geometry.writes).toEqual([FROZEN.scrollTop + 120]);
  });

  it('takes over when the notch fell short by more than the yardstick', () => {
    const { log, geometry } = mountProbing();
    wheelEvent(log, 120);
    geometry.setTop(FROZEN.scrollTop + 120 - MIN_UNREACHABLE_PX - 1);
    scrolled(log);
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS);
    expect(chatScrollTakeoverEngaged()).toBe(true);
    expect(eventsNamed('client_chat_scroll_heal')[0]).toMatchObject({ outcome: 'takeover' });
  });

  it('takes over when the notch threw the log backwards', () => {
    const { log, geometry } = mountProbing();
    geometry.setTop(800);
    scrolled(log); // a settled position the notch is judged against
    wheelEvent(log, 120);
    geometry.setTop(91);
    scrolled(log);
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS);
    expect(chatScrollTakeoverEngaged()).toBe(true);
    expect(eventsNamed('client_chat_scroll_heal')[0]).toMatchObject({
      outcome: 'takeover',
      notch_scroll_top_before: 800,
      notch_scroll_top_after: 91,
      notch_moved_px: 91 - 800,
    });
  });

  it('waits for the gesture to end before judging a burst', () => {
    // A trackpad flick is many notches over hundreds of milliseconds. The
    // deadline re-arms on each one, and the burst is judged as a whole.
    const { log, geometry } = mountProbing();
    wheelEvent(log, 40);
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS - 50);
    wheelEvent(log, 40);
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS - 50);
    wheelEvent(log, 40);
    expect(chatScrollTakeoverPhase()).toBe('observing');
    geometry.setTop(FROZEN.scrollTop + 120);
    scrolled(log);
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS);
    expect(eventsNamed('client_chat_scroll_heal')[0]).toMatchObject({
      outcome: 'healed',
      notch_wheel_count: 3,
      notch_requested_px: 120,
      notch_moved_px: 120,
    });
  });

  it('judges against the room that was actually left, not the raw request', () => {
    const { log, geometry } = mountProbing();
    geometry.setTop(LAYOUT_MAX - 50);
    scrolled(log);
    wheelEvent(log, 120);
    geometry.setTop(LAYOUT_MAX);
    scrolled(log);
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS);
    expect(eventsNamed('client_chat_scroll_heal')[0]).toMatchObject({
      outcome: 'healed',
      notch_expected_px: 50,
      notch_moved_px: 50,
    });
  });

  it('keeps waiting when a notch lands on a log with no room to show anything', () => {
    // At the bottom a notch proves nothing either way — the detector refuses
    // to convict there too. No verdict, no event, still probing.
    const { log, geometry } = mountProbing();
    geometry.setTop(LAYOUT_MAX);
    scrolled(log);
    wheelEvent(log, 120);
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS);
    expect(chatScrollTakeoverPhase()).toBe('probing');
    expect(eventsNamed('client_chat_scroll_heal')).toHaveLength(0);

    // The user scrolls back up (scrollbar drag) and wheels down: now judged.
    geometry.setTop(500);
    scrolled(log);
    wheelEvent(log, 120);
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS);
    expect(chatScrollTakeoverEngaged()).toBe(true);
  });

  it('ignores an upward notch as the observation and starts over', () => {
    const { log, geometry } = mountProbing();
    geometry.setTop(800);
    scrolled(log);
    const up = wheelEvent(log, -120);
    expect(up.defaultPrevented).toBe(false);
    expect(chatScrollTakeoverPhase()).toBe('probing');
    // An upward notch during the window corrupts the measurement: back to waiting.
    wheelEvent(log, 120);
    expect(chatScrollTakeoverPhase()).toBe('observing');
    wheelEvent(log, -120);
    expect(chatScrollTakeoverPhase()).toBe('probing');
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS);
    expect(eventsNamed('client_chat_scroll_heal')).toHaveLength(0);
  });

  it('does not treat a wheel an inner scroller eats as the observation', () => {
    const { log } = mountProbing();
    const inner = document.createElement('pre');
    inner.style.overflowY = 'auto';
    stubGeometry(inner, { scrollTop: 0, scrollHeight: 900, clientHeight: 200 });
    log.appendChild(inner);
    wheelEvent(inner, 120);
    expect(chatScrollTakeoverPhase()).toBe('probing');
  });

  it('drops the observation without a verdict when the surface is released', () => {
    const { log } = mountProbing();
    wheelEvent(log, 120);
    expect(chatScrollTakeoverPhase()).toBe('observing');
    log.remove();
    const second = buildChatLog();
    stubGeometry(second, { scrollTop: 0, scrollHeight: 2347, clientHeight: 583 });
    scrolled(second);
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS * 2);
    expect(chatScrollTakeoverPhase()).toBe('idle');
    expect(eventsNamed('client_chat_scroll_heal')).toHaveLength(0);
  });

  it('after a heal, lets the probe start over so a recurrence is caught again', () => {
    // A healed surface is a fresh surface: the probe reports once per surface,
    // so without a restart a second freeze on the same log could never signal.
    const { log, geometry } = mountProbing();
    wheelEvent(log, 120);
    geometry.setTop(FROZEN.scrollTop + 120);
    scrolled(log);
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS);
    expect(eventsNamed('client_chat_scroll_heal')).toHaveLength(1);
    const firstProbeId = eventsNamed('client_chat_scroll_frozen')[0]?.probe_id;

    // The drift comes back: four stalled notches on the very same element.
    geometry.setTop(300);
    driveToFreeze(log);
    const frozen = eventsNamed('client_chat_scroll_frozen');
    expect(frozen).toHaveLength(2);
    expect(frozen[1]?.probe_id).not.toBe(firstProbeId);
    expect(log.style.willChange).toBe('transform');
  });
});

// ---------------------------------------------------------------------------
// The heal event
// ---------------------------------------------------------------------------

describe('self-heal — the client_chat_scroll_heal event', () => {
  it('carries the outcome, the kick geometry, the notch arithmetic and the probe id', () => {
    const { log, geometry } = mountProbing();
    advanceClock(250);
    wheelEvent(log, 120);
    geometry.setTop(FROZEN.scrollTop + 120);
    scrolled(log);
    vi.advanceTimersByTime(OBSERVATION_SETTLE_MS);

    const frozen = eventsNamed('client_chat_scroll_frozen')[0];
    const heal = eventsNamed('client_chat_scroll_heal');
    expect(heal).toHaveLength(1);
    expect(heal[0]).toMatchObject({
      outcome: 'healed',
      probe_id: frozen?.probe_id,
      trigger: 'wheel_stall',
      kick_scroll_top_before: FROZEN.scrollTop,
      kick_scroll_height_before: FROZEN.scrollHeight,
      kick_client_height_before: FROZEN.clientHeight,
      kick_scroll_top_after: FROZEN.scrollTop,
      kick_scroll_height_after: FROZEN.scrollHeight,
      kick_client_height_after: FROZEN.clientHeight,
      kick_to_notch_ms: 250,
      notch_wheel_count: 1,
      notch_requested_px: 120,
      notch_expected_px: 120,
      notch_moved_px: 120,
      notch_scroll_top_before: FROZEN.scrollTop,
      notch_scroll_top_after: FROZEN.scrollTop + 120,
      notch_layout_max_after: LAYOUT_MAX,
      notch_scroll_event_count: 1,
      capture_source: 'web/error-tracking',
    });
    expect(typeof heal[0]?.probe_id).toBe('string');
  });

  it('is sent once per surface', () => {
    const { log } = mountEngaged();
    for (let i = 0; i < 5; i += 1) wheelEvent(log, 120);
    expect(eventsNamed('client_chat_scroll_heal')).toHaveLength(1);
  });

  it('does not alter the frozen event it follows', () => {
    // The kick and the takeover run AFTER the report has gone out; the
    // frozen event's shape and count are not this module's to change.
    mountEngaged();
    const frozen = eventsNamed('client_chat_scroll_frozen');
    expect(frozen).toHaveLength(1);
    expect(frozen[0]).toMatchObject({ trigger: 'wheel_stall', wheel_count: FREEZE_WHEEL_COUNT });
  });
});

// ---------------------------------------------------------------------------
// The keyboard, once engaged
// ---------------------------------------------------------------------------

describe('self-heal — the keyboard during a takeover', () => {
  const PAGE = Math.round(FROZEN.clientHeight * KEYBOARD_PAGE_FRACTION);

  function pressOnBody(key: string, init: Parameters<typeof keyEvent>[1] = {}): KeyboardEvent {
    (document.activeElement as HTMLElement | null)?.blur?.();
    return keyEvent(key, { ...init, target: document.body });
  }

  it('drives ArrowDown and ArrowUp by one line each', () => {
    const { geometry } = mountEngaged();
    geometry.setTop(500);
    const down = pressOnBody('ArrowDown');
    runFrames();
    expect(down.defaultPrevented).toBe(true);
    expect(geometry.writes).toEqual([500 + KEYBOARD_LINE_PX]);
    const up = pressOnBody('ArrowUp');
    runFrames();
    expect(up.defaultPrevented).toBe(true);
    expect(geometry.writes).toEqual([500 + KEYBOARD_LINE_PX, 500]);
  });

  it('drives PageDown, PageUp, Space and Shift+Space by most of a viewport', () => {
    const { geometry } = mountEngaged();
    geometry.setTop(500);
    pressOnBody('PageDown');
    runFrames();
    pressOnBody('PageUp');
    runFrames();
    pressOnBody(' ');
    runFrames();
    pressOnBody(' ', { shiftKey: true });
    runFrames();
    expect(geometry.writes).toEqual([500 + PAGE, 500, 500 + PAGE, 500]);
  });

  it('drives End to the layout bottom and Home to the top', () => {
    const { geometry } = mountEngaged();
    geometry.setTop(500);
    pressOnBody('End');
    runFrames();
    pressOnBody('Home');
    runFrames();
    expect(geometry.writes).toEqual([LAYOUT_MAX, 0]);
  });

  it('handles keys whose focus sits inside the log', () => {
    const { log, geometry } = mountEngaged();
    geometry.setTop(500);
    const button = document.createElement('button');
    log.appendChild(button);
    button.focus();
    const down = keyEvent('ArrowDown', { target: button });
    runFrames();
    expect(down.defaultPrevented).toBe(true);
    expect(geometry.writes).toEqual([500 + KEYBOARD_LINE_PX]);
  });

  it('never intercepts typing in an input, a textarea or a contenteditable', () => {
    const { geometry } = mountEngaged();
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.append(input, textarea, editable);
    for (const field of [input, textarea, editable]) {
      field.focus();
      for (const key of ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ']) {
        const event = keyEvent(key, { target: field });
        expect(event.defaultPrevented).toBe(false);
      }
    }
    runFrames();
    expect(geometry.writes).toEqual([]);
  });

  it('lets Space activate a focused button inside the log instead of paging', () => {
    // Space on a focused button is a click, natively; only the arrows and
    // paging keys scroll past a focused control.
    const { log, geometry } = mountEngaged();
    geometry.setTop(500);
    const button = document.createElement('button');
    log.appendChild(button);
    button.focus();
    const space = keyEvent(' ', { target: button });
    expect(space.defaultPrevented).toBe(false);
    const down = keyEvent('PageDown', { target: button });
    expect(down.defaultPrevented).toBe(true);
    runFrames();
    expect(geometry.writes).toEqual([500 + PAGE]);
  });

  it('leaves keys alone when focus is on a control outside the log', () => {
    const { geometry } = mountEngaged();
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    const event = keyEvent('ArrowDown', { target: button });
    runFrames();
    expect(event.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);
  });

  it('follows the last click: body focus after a click elsewhere is not ours', () => {
    // Blink starts keyboard scrolling from the last clicked node when nothing
    // focusable is focused. Same rule here.
    const { log, geometry } = mountEngaged();
    const aside = document.createElement('div');
    document.body.appendChild(aside);
    aside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    const away = pressOnBody('ArrowDown');
    runFrames();
    expect(away.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);

    log.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    const back = pressOnBody('ArrowDown');
    runFrames();
    expect(back.defaultPrevented).toBe(true);
    expect(geometry.writes).toEqual([FROZEN.scrollTop + KEYBOARD_LINE_PX]);
  });

  it('leaves modified keys and unrelated keys alone', () => {
    const { geometry } = mountEngaged();
    expect(pressOnBody('ArrowDown', { metaKey: true }).defaultPrevented).toBe(false);
    expect(pressOnBody('ArrowDown', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(pressOnBody('ArrowDown', { altKey: true }).defaultPrevented).toBe(false);
    expect(pressOnBody('a').defaultPrevented).toBe(false);
    expect(pressOnBody('Enter').defaultPrevented).toBe(false);
    runFrames();
    expect(geometry.writes).toEqual([]);
  });

  it('does not touch the keyboard before the takeover is engaged', () => {
    const { geometry } = mountProbing();
    const event = pressOnBody('ArrowDown');
    runFrames();
    expect(event.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);
  });

  it('lands at the bottom when Home and End arrive in the same frame', () => {
    // Review finding: Home and End used to be ±Infinity folded into the same
    // pixel accumulator as the arrows, so Home-then-End summed to NaN, and a
    // NaN write is read by the browser as 0 — End could not reach the bottom.
    const { geometry } = mountEngaged();
    geometry.setTop(500);
    pressOnBody('Home');
    pressOnBody('End');
    runFrames();
    expect(geometry.writes).toEqual([LAYOUT_MAX]);
    expect(geometry.top()).toBe(LAYOUT_MAX);
  });

  it('lands at the top when End and Home arrive in the same frame', () => {
    const { geometry } = mountEngaged();
    geometry.setTop(500);
    pressOnBody('End');
    pressOnBody('Home');
    runFrames();
    expect(geometry.writes).toEqual([0]);
    expect(geometry.top()).toBe(0);
  });

  it('never writes a non-finite scrollTop, whatever mix of edge jumps and steps arrives', () => {
    const { geometry } = mountEngaged();
    geometry.setTop(500);
    pressOnBody('ArrowDown');
    pressOnBody('Home');
    pressOnBody('End');
    pressOnBody('PageUp');
    pressOnBody('Home');
    pressOnBody('ArrowDown');
    runFrames();
    for (const write of geometry.writes) expect(Number.isFinite(write)).toBe(true);
    expect(Number.isFinite(geometry.top())).toBe(true);
    // An edge jump discards the steps queued before it; steps after it apply
    // on top of the edge: Home then ArrowDown is 0 + 40.
    expect(geometry.writes).toEqual([KEYBOARD_LINE_PX]);
  });

  it('lets go of the keyboard when the chat log is removed while engaged', () => {
    // Review finding: a tab or route unmount that removes the node before the
    // probe has noticed left the takeover engaged with a document-level keydown
    // listener — arrows and paging were still cancelled with no log to scroll.
    const { log, geometry } = mountEngaged();
    log.remove();
    const event = pressOnBody('ArrowDown');
    runFrames();
    expect(event.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);
    expect(chatScrollTakeoverEngaged()).toBe(false);
    expect(chatScrollTakeoverPhase()).toBe('idle');
  });

  it('disengages from the frame path too when the chat log is removed', () => {
    const { log, geometry } = mountEngaged();
    const wheel = wheelEvent(log, 120);
    expect(wheel.defaultPrevented).toBe(true);
    log.remove();
    runFrames();
    expect(geometry.writes).toEqual([]);
    expect(chatScrollTakeoverEngaged()).toBe(false);
  });

  it('lets go of the keyboard when released', () => {
    const { geometry } = mountEngaged();
    releaseChatScrollTakeover();
    const event = pressOnBody('ArrowDown');
    runFrames();
    expect(event.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Release on conversation switch
// ---------------------------------------------------------------------------

describe('self-heal — releaseChatScrollTakeover', () => {
  it('hands the wheel back to the browser and lets the probe start a fresh surface', () => {
    const { log, geometry } = mountEngaged();
    const firstProbeId = eventsNamed('client_chat_scroll_frozen')[0]?.probe_id;

    releaseChatScrollTakeover();

    expect(chatScrollTakeoverEngaged()).toBe(false);
    expect(chatScrollTakeoverPhase()).toBe('idle');
    const native = wheelEvent(log, 120);
    expect(native.defaultPrevented).toBe(false);
    expect(geometry.writes).toEqual([]);

    // The next conversation on the same node gets its own probe, its own
    // report budget and its own kick. The native notch above is the one that
    // re-DISCOVERED the surface, and the probe ingests a discovery wheel twice
    // (window listener, then the element listener it just attached — a
    // pre-existing probe quirk, not this module's), so it already stands as
    // two stalled notches and `FREEZE_WHEEL_COUNT − 2` more bring the verdict.
    runFrames();
    for (let i = 0; i < FREEZE_WHEEL_COUNT - 2; i += 1) {
      advanceClock(16);
      wheelEvent(log, 120);
      runFrames();
    }
    const frozen = eventsNamed('client_chat_scroll_frozen');
    expect(frozen).toHaveLength(2);
    expect(frozen[1]?.probe_id).not.toBe(firstProbeId);
    expect(chatScrollTakeoverPhase()).toBe('kicking');
    expect(log.style.willChange).toBe('transform');
    expect(eventsNamed('client_chat_scroll_heal')).toHaveLength(1);
  });

  it('is safe to call when nothing is engaged or attached', () => {
    expect(() => releaseChatScrollTakeover()).not.toThrow();
    installChatScrollTakeover();
    expect(() => releaseChatScrollTakeover()).not.toThrow();
    expect(chatScrollTakeoverPhase()).toBe('idle');
  });

  it('cancels a pending kick frame and a pending observation', () => {
    const { log } = mountFrozen();
    expect(log.style.willChange).toBe('transform');
    releaseChatScrollTakeover();
    expect(log.style.willChange).toBe('');
    runFrames();
    expect(log.style.willChange).toBe('');
    expect(chatScrollTakeoverPhase()).toBe('idle');
  });
});
