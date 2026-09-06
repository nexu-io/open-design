// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearExceptionTrackingContext,
  setExceptionTrackingContext,
} from '../../src/analytics/error-tracking';
import {
  FREEZE_REQUESTED_PX,
  FREEZE_WHEEL_COUNT,
  MIN_UNREACHABLE_PX,
  createScrollFreezeState,
  observeScroll,
  observeWheelBatch,
} from '../../src/observability/chat-scroll-freeze-detector';
import {
  describeSnapBackRoute,
  evaluateReportBlockers,
  summariseBlockers,
} from '../../src/observability/chat-scroll-freeze-blockers';
import {
  SCROLL_WRITE_TRACE_STORAGE_KEY,
  disarmScrollWriteTrace,
} from '../../src/observability/chat-scroll-write-trace';
import {
  type ChatScrollFreezeHandle,
  __resetChatScrollFreezeForTest,
  installChatScrollFreezeObserver,
} from '../../src/observability/chat-scroll-freeze';

/**
 * Why this file exists
 * --------------------
 * A user hit a 1493px freeze on a dogfood build — far past the reporting
 * threshold — and PostHog got nothing. The probe could not be asked why,
 * because it exposed no state at all: not whether it had attached, not what
 * it had accumulated, not which gate it was sitting behind. The only way to
 * get any number out of it was to hand-inject a script into the running
 * renderer, which dies with the window.
 *
 * So these specs pin a read-only runtime handle (`window.__chatScrollFreeze`)
 * whose whole job is to answer "why has this not reported yet", plus an
 * opt-in `scrollTop` write trace for telling "our code put it back" apart
 * from "the compositor will not move".
 *
 * Two invariants matter as much as the data:
 *   - the handle costs NOTHING when nobody calls it — no listener, no timer,
 *     no frame, and no geometry read until the call itself;
 *   - the write trace is OFF by default and restores the exact original
 *     property descriptors when switched off, because it rewrites
 *     `Element.prototype`.
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

interface GeometryHandle {
  setTop(value: number): void;
  setContent(value: number): void;
  setViewport(value: number): void;
  writes: number[];
  reads: () => number;
}

/** Scroll geometry jsdom refuses to compute, installed by hand. */
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
  log.className = 'chat-log is-scrollable';
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

function handle(): ChatScrollFreezeHandle {
  const found = (globalThis as { __chatScrollFreeze?: ChatScrollFreezeHandle })
    .__chatScrollFreeze;
  if (found == null) throw new Error('window.__chatScrollFreeze is not installed');
  return found;
}

beforeEach(() => {
  clock = 0;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  setExceptionTrackingContext({
    apiKey: 'phc_test',
    host: 'https://us.i.posthog.com',
    distinctId: 'chat-scroll-freeze-handle-test',
  });
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
  localStorage.clear();
  __resetChatScrollFreezeForTest();
});

afterEach(() => {
  __resetChatScrollFreezeForTest();
  disarmScrollWriteTrace();
  vi.restoreAllMocks();
  clearExceptionTrackingContext();
  globalThis.fetch = ORIGINAL_FETCH;
  globalThis.requestAnimationFrame = ORIGINAL_RAF;
  globalThis.cancelAnimationFrame = ORIGINAL_CAF;
  document.body.innerHTML = '';
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// The gate audit, as pure arithmetic
// ---------------------------------------------------------------------------

describe('chat-scroll-freeze-blockers — why a report has not happened', () => {
  const READY = {
    installed: true,
    frameSchedulerAvailable: true,
    surface: {
      elementConnected: true,
      reported: false,
      geometry: { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 },
      state: {
        ...createScrollFreezeState(),
        lastScrollTop: 91,
        stallAt: 91,
        stallWheelCount: FREEZE_WHEEL_COUNT,
        stallRequestedPx: FREEZE_REQUESTED_PX,
      },
      innerScrollerSuppressions: 0,
    },
  } as const;

  it('says every gate is satisfied when the next wheel notch would report', () => {
    const blockers = evaluateReportBlockers(READY);
    expect(blockers.every((b) => b.ok)).toBe(true);
    expect(summariseBlockers(blockers)).toBe('ready');
    // The full roster, in the order the probe meets them. Pinned as a list
    // rather than a count so that dropping a gate — the failure mode that
    // would quietly make the audit lie by omission — cannot pass.
    expect(blockers.map((b) => b.id)).toEqual([
      'observer_installed',
      'frame_scheduler',
      'surface_attached',
      'element_connected',
      'surface_unreported',
      'geometry_sampled',
      'unreachable_px',
      'stall_pinned',
      'stall_wheel_count',
      'stall_requested_px',
      'inner_scroller_free',
    ]);
    // Every entry earns its place by carrying both halves of the comparison.
    for (const blocker of blockers) {
      expect(blocker.actual.length).toBeGreaterThan(0);
      expect(blocker.needed.length).toBeGreaterThan(0);
      expect(blocker.note.length).toBeGreaterThan(0);
    }
  });

  it('has no session-level report budget to name', () => {
    // There used to be a `session_report_budget` gate here, backed by a cap of
    // three inside `attach()`. It is gone on purpose: the cap did not throttle
    // events, it switched the OBSERVER off — no ledger, no activity trail, no
    // freeze signal — for the rest of the session, which is indistinguishable
    // from a session that never froze again. The audit must not describe a gate
    // that no longer exists, and no number of prior reports may block a report.
    const blockers = evaluateReportBlockers(READY);
    expect(blockers.some((b) => b.id.includes('budget'))).toBe(false);
    expect(blockers.some((b) => b.id.includes('session'))).toBe(false);
    expect(summariseBlockers(blockers)).toBe('ready');
  });

  it('stops at "nothing attached" instead of inventing surface numbers', () => {
    const blockers = evaluateReportBlockers({ ...READY, surface: null });
    expect(blockers.find((b) => b.id === 'surface_attached')?.ok).toBe(false);
    // The gates below it read the surface, so they must be absent rather than
    // guessed — an audit that fabricates a number is worse than a short one.
    expect(blockers.some((b) => b.id === 'unreachable_px')).toBe(false);
    expect(blockers.some((b) => b.id === 'stall_wheel_count')).toBe(false);
  });

  it('reports the streak gates with the numbers they are actually holding', () => {
    const blockers = evaluateReportBlockers({
      ...READY,
      surface: {
        ...READY.surface,
        state: {
          ...READY.surface.state,
          stallWheelCount: 2,
          stallRequestedPx: 120,
        },
      },
    });
    const count = blockers.find((b) => b.id === 'stall_wheel_count');
    const px = blockers.find((b) => b.id === 'stall_requested_px');
    expect(count?.ok).toBe(false);
    expect(count?.actual).toContain('2');
    expect(count?.needed).toContain(String(FREEZE_WHEEL_COUNT));
    expect(px?.ok).toBe(false);
    expect(px?.actual).toContain('120');
    expect(px?.needed).toContain(String(FREEZE_REQUESTED_PX));
  });

  it('names how much of the log is unreachable, and the bar it has to clear', () => {
    const blockers = evaluateReportBlockers({
      ...READY,
      surface: {
        ...READY.surface,
        // Four pixels short — real, visible, and below the threshold.
        geometry: { scrollTop: 1760, scrollHeight: 2347, clientHeight: 583 },
        state: { ...READY.surface.state, lastScrollTop: 1760, stallAt: 1760 },
      },
    });
    const gate = blockers.find((b) => b.id === 'unreachable_px');
    expect(gate?.ok).toBe(false);
    expect(gate?.actual).toContain('4');
    expect(gate?.needed).toContain(String(MIN_UNREACHABLE_PX));
  });

  it('names the streak coming unpinned — the programmatic-write reset', () => {
    // The streak only survives while `stallAt` equals the current scrollTop.
    // Anything that moves the scroller between two wheel notches — an
    // auto-scroll write, a resize, a jump-to-bottom — makes the next notch
    // read as movement and zeroes the streak. That is invisible from the
    // outside and is exactly the kind of thing this audit has to name.
    const blockers = evaluateReportBlockers({
      ...READY,
      surface: {
        ...READY.surface,
        state: { ...READY.surface.state, stallAt: 400 },
      },
    });
    const gate = blockers.find((b) => b.id === 'stall_pinned');
    expect(gate?.ok).toBe(false);
    expect(gate?.actual).toContain('400');
  });

  it('names the inner-scroller gate, and how many verdicts it has eaten', () => {
    const blockers = evaluateReportBlockers({
      ...READY,
      surface: { ...READY.surface, innerScrollerSuppressions: 6 },
    });
    const gate = blockers.find((b) => b.id === 'inner_scroller_free');
    expect(gate?.ok).toBe(false);
    expect(gate?.actual).toContain('6');
  });

  it('lists every failing gate in the summary, not just the first', () => {
    const blockers = evaluateReportBlockers({
      ...READY,
      installed: false,
      surface: {
        ...READY.surface,
        innerScrollerSuppressions: 2,
        state: { ...READY.surface.state, stallWheelCount: 1, stallRequestedPx: 30 },
      },
    });
    const summary = summariseBlockers(blockers);
    expect(summary).toContain('observer_installed');
    expect(summary).toContain('stall_wheel_count');
    expect(summary).toContain('stall_requested_px');
    expect(summary).toContain('inner_scroller_free');
  });

  it('describes the immediate snap-back route as well as the streak route', () => {
    // The snap-back path reports on ONE notch, so an audit that only
    // described the four-notch streak would say "not close" about a surface
    // that is one gesture away from a report.
    //
    // The baseline is written as a whole — position AND the layout it was
    // read in — because that is the only shape the detector ever produces:
    // all three fields are set from the same geometry, in the same frame.
    const route = describeSnapBackRoute(
      {
        ...createScrollFreezeState(),
        lastScrollTop: 800,
        lastScrollHeight: 2347,
        lastClientHeight: 583,
      },
      { scrollTop: 800, scrollHeight: 2347, clientHeight: 583 },
    );
    expect(route.armed).toBe(true);
    expect(route.layoutStable).toBe(true);
    expect(route.reportsAtOrBelowPx).toBe(792);
  });

  it('says the snap-back route is shut while the layout is still moving', () => {
    // An operator reading this after a chat refused to scroll needs the
    // REASON, not just `armed: false`. A one-notch verdict off a baseline
    // taken in a different layout is the browser's own scroll anchoring as
    // often as it is a stale ceiling, so the route stays shut until one frame
    // is sampled against a settled layout — and it says so.
    const route = describeSnapBackRoute(
      {
        ...createScrollFreezeState(),
        lastScrollTop: 1700,
        lastScrollHeight: 3400,
        lastClientHeight: 600,
      },
      // 1036px of content has left above the viewport since that reading.
      { scrollTop: 664, scrollHeight: 2364, clientHeight: 600 },
    );
    expect(route.layoutStable).toBe(false);
    expect(route.armed).toBe(false);
    expect(route.note).toContain('scroll anchoring');
  });
});

// ---------------------------------------------------------------------------
// The runtime handle
// ---------------------------------------------------------------------------

describe('observability/chat-scroll-freeze — runtime handle', () => {
  it('appears with the observer and leaves with it', () => {
    expect(
      (globalThis as { __chatScrollFreeze?: unknown }).__chatScrollFreeze,
    ).toBeUndefined();
    const teardown = installChatScrollFreezeObserver();
    expect(handle().version).toBe(1);
    teardown();
    expect(
      (globalThis as { __chatScrollFreeze?: unknown }).__chatScrollFreeze,
    ).toBeUndefined();
  });

  it('answers before anything has attached, without pretending it has', () => {
    installChatScrollFreezeObserver();
    const snapshot = handle().snapshot();
    expect(snapshot.installed).toBe(true);
    expect(snapshot.attached).toBe(false);
    expect(snapshot.surface).toBeNull();
    expect(snapshot.verdict).toContain('surface_attached');
  });

  it('names the element it attached to, well enough to pick it out by eye', () => {
    const log = buildChatLog();
    stubGeometry(log, { scrollTop: 0, scrollHeight: 2347, clientHeight: 583 });
    log.appendChild(document.createElement('div'));
    installChatScrollFreezeObserver();
    scrolled(log);

    const surface = handle().snapshot().surface;
    expect(surface).not.toBeNull();
    expect(surface?.element).toContain('chat-log');
    expect(surface?.element).toContain('is-scrollable');
    expect(surface?.element).toContain('chat-log');
    expect(surface?.elementConnected).toBe(true);
    expect(surface?.messageRowCount).toBe(1);
    expect(surface?.ageMs).toBeGreaterThanOrEqual(0);
    expect(typeof surface?.probeId).toBe('string');
  });

  it('reads geometry at the moment it is asked, never ahead of time', () => {
    // The cost contract. Nothing may pre-compute geometry and cache it: a
    // probe that keeps a fresh copy of `scrollHeight` around is a probe that
    // forces layout on somebody else's frame.
    const log = buildChatLog();
    const geometry = stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);

    const readsAfterAttach = geometry.reads();
    advanceClock(10_000);
    expect(geometry.reads()).toBe(readsAfterAttach);

    // Move the real geometry with no frame in between…
    geometry.setTop(500);
    geometry.setContent(4000);
    geometry.setViewport(600);

    const surface = handle().snapshot().surface;
    // …and the snapshot shows the NEW numbers, so it cannot have been cached.
    expect(surface?.geometry.scrollTop).toBe(500);
    expect(surface?.geometry.scrollHeight).toBe(4000);
    expect(surface?.geometry.clientHeight).toBe(600);
    expect(surface?.geometry.layoutMax).toBe(3400);
    expect(surface?.geometry.unreachablePx).toBe(2900);
    // The last frame's copy is kept separately and is still the old reading,
    // which is what tells a reader whether the probe is running behind.
    expect(surface?.geometryAtLastFrame?.scrollTop).toBe(91);
    expect(geometry.reads()).toBeGreaterThan(readsAfterAttach);
  });

  it('costs no listener, no timer and no frame when it is called', () => {
    const log = buildChatLog();
    const geometry = stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);

    const framesBefore = rafSpy.mock.calls.length;
    const addOnLog = vi.spyOn(log, 'addEventListener');
    const addOnDocument = vi.spyOn(document, 'addEventListener');
    const timeout = vi.spyOn(globalThis, 'setTimeout');
    const interval = vi.spyOn(globalThis, 'setInterval');

    for (let i = 0; i < 20; i += 1) handle().snapshot();

    expect(rafSpy.mock.calls.length).toBe(framesBefore);
    expect(addOnLog).not.toHaveBeenCalled();
    expect(addOnDocument).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(geometry.writes).toEqual([]);
    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(0);

    // …and it is read-only in the sense that matters: the detector is exactly
    // where it was, so a freeze that would have been called still is. An
    // observer whose debug handle disturbs the thing it observes is worse
    // than no handle at all.
    for (let i = 0; i < 12; i += 1) {
      advanceClock(16);
      wheel(log, 120);
      handle().snapshot();
    }
    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(1);
  });

  it('shows the wheel it is holding between frames', () => {
    const log = buildChatLog();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    // No frame runs, so a wheel batch stays pending and is visible as such.
    rafSpy.mockImplementation(() => ++rafHandle);
    installChatScrollFreezeObserver();
    scrolled(log);
    const inner = document.createElement('pre');
    log.appendChild(inner);
    wheel(inner, 120);
    wheel(inner, 120);

    const surface = handle().snapshot().surface;
    expect(surface?.pendingWheel.px).toBe(240);
    expect(surface?.pendingWheel.count).toBe(2);
    expect(surface?.pendingWheel.target).toContain('pre');
  });

  it('says which gate the stall is sitting behind, mid-stall', () => {
    const log = buildChatLog();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);
    // Two notches: enough to build a streak, not enough to report.
    for (let i = 0; i < 2; i += 1) {
      advanceClock(16);
      wheel(log, 60);
    }

    const snapshot = handle().snapshot();
    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(0);
    expect(snapshot.verdict).toContain('stall_requested_px');
    expect(snapshot.blockers.find((b) => b.id === 'unreachable_px')?.ok).toBe(true);
    expect(snapshot.blockers.find((b) => b.id === 'stall_requested_px')?.ok).toBe(false);
    expect(handle().why()).toBe(snapshot.verdict);
  });

  it('says "at the bottom" rather than "stalled" when there is nothing to reach', () => {
    const log = buildChatLog();
    stubGeometry(log, { scrollTop: 1764, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);
    for (let i = 0; i < 12; i += 1) {
      advanceClock(16);
      wheel(log, 120);
    }
    const snapshot = handle().snapshot();
    expect(snapshot.blockers.find((b) => b.id === 'unreachable_px')?.ok).toBe(false);
    expect(snapshot.verdict).toContain('unreachable_px');
  });

  it('confesses when the inner-scroller gate is what threw the verdict away', () => {
    // This is the case that cost a day. The probe suppresses a frozen verdict
    // when a scrollable box between the wheel target and the log still had
    // travel — and then says nothing at all, so from the outside the
    // suppression is indistinguishable from "no defect was ever seen".
    const log = buildChatLog();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    const inner = document.createElement('pre');
    // `.markdown-rendered pre { overflow: auto }` — the real scroller this
    // fixture stands for. Said as the LONGHAND because jsdom loads no
    // stylesheets and does not expand the `overflow` shorthand when asked for
    // a computed style: `overflow: auto` still reads back as
    // `overflow-y: visible` there. Every real engine fills the longhand in,
    // which is what production reads.
    inner.style.overflowY = 'auto';
    log.appendChild(inner);
    stubGeometry(inner, { scrollTop: 0, scrollHeight: 900, clientHeight: 200 });

    installChatScrollFreezeObserver();
    scrolled(log);
    for (let i = 0; i < 12; i += 1) {
      advanceClock(16);
      wheel(inner, 120);
    }

    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(0);
    const snapshot = handle().snapshot();
    expect(snapshot.surface?.innerScrollerSuppressions).toBeGreaterThan(0);
    expect(snapshot.blockers.find((b) => b.id === 'inner_scroller_free')?.ok).toBe(false);
    expect(snapshot.verdict).toContain('inner_scroller_free');
  });

  it('lists the boxes inside the log that would suppress a report', () => {
    // Prospective, not historical: "which boxes in this transcript can eat a
    // wheel" is answerable at any moment, and the answer is what turns "it
    // never reported" into a reason. It has to name the same set the gate
    // acts on — a list that includes every clipped box in the transcript
    // hands the operator the wrong conclusion, which is how this defect
    // survived as long as it did.
    const log = buildChatLog();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });

    // A real one: `.markdown-rendered pre { overflow: auto }`.
    const scroller = document.createElement('pre');
    scroller.style.overflowY = 'auto';
    log.appendChild(scroller);
    stubGeometry(scroller, { scrollTop: 0, scrollHeight: 900, clientHeight: 200 });

    // And a decoy with the identical geometry: a collapsed thinking block,
    // 900px of content clipped to 120px, which no wheel can move.
    const clipped = document.createElement('div');
    clipped.className = 'thinking-collapsed';
    clipped.style.overflowY = 'hidden';
    log.appendChild(clipped);
    stubGeometry(clipped, { scrollTop: 0, scrollHeight: 900, clientHeight: 120 });

    installChatScrollFreezeObserver();
    scrolled(log);

    const found = handle().snapshot().surface?.absorbingScrollers;
    expect(found?.count).toBe(1);
    expect(found?.sample.join(' ')).toContain('pre');
    expect(found?.sample.join(' ')).not.toContain('thinking-collapsed');
  });

  it('carries the shortfall ledger and the activity trail it already keeps', () => {
    const log = buildChatLog();
    const geometry = stubGeometry(log, { scrollTop: 0, scrollHeight: 400, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);

    advanceClock(400);
    geometry.setContent(674);
    scrolled(log);
    advanceClock(400);
    geometry.setContent(1000);
    geometry.setTop(300);
    scrolled(log);
    advanceClock(400);
    wheel(log, 120);

    const surface = handle().snapshot().surface;
    expect(surface?.ledger.stepCount).toBeGreaterThan(0);
    expect(surface?.ledger.steps).toContain('c674');
    expect(surface?.ledger.probeCount).toBeGreaterThan(0);
    expect(surface?.ledger.first?.shortfallPx).toBeGreaterThan(0);
    expect(surface?.activity.trail).toContain('scroll_node_born');
    expect(surface?.scrollableOn?.contentPx).toBe(674);
    expect(String(surface?.transitions)).toContain('scrollable_on');
  });

  it('says a report already happened rather than blaming a gate', () => {
    const log = buildChatLog();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
    installChatScrollFreezeObserver();
    scrolled(log);
    for (let i = 0; i < 12; i += 1) {
      advanceClock(16);
      wheel(log, 120);
    }
    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(1);

    const snapshot = handle().snapshot();
    expect(snapshot.reportedThisSession).toBe(1);
    expect(snapshot.blockers.find((b) => b.id === 'surface_unreported')?.ok).toBe(false);
    expect(snapshot.verdict).toContain('surface_unreported');
  });

  it('is still attached and still ready after more reports than the old cap allowed', () => {
    // The handle is how a colleague running the forensic build answers "is this
    // thing even watching". Under the old session cap of three that answer went
    // permanently false partway through a normal day of conversation switches,
    // and read exactly like "nothing froze after lunch".
    installChatScrollFreezeObserver();
    for (let round = 0; round < 5; round += 1) {
      const log = buildChatLog();
      stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });
      advanceClock(500);
      scrolled(log);
      for (let i = 0; i < 12; i += 1) {
        advanceClock(16);
        wheel(log, 120);
      }
      log.remove();
    }

    const sixth = buildChatLog();
    stubGeometry(sixth, { scrollTop: 300, scrollHeight: 2347, clientHeight: 583 });
    advanceClock(500);
    scrolled(sixth);

    const snapshot = handle().snapshot();
    expect(snapshot.reportedThisSession).toBe(5);
    expect(snapshot.attached).toBe(true);
    expect(snapshot.surface?.elementConnected).toBe(true);
    // A geometry frame ran on this surface — it is being measured, not merely
    // held.
    expect(snapshot.surface?.detector.lastScrollTop).toBe(300);
    // Not one gate left standing between this surface and its own report.
    expect(snapshot.verdict).not.toContain('budget');
    expect(snapshot.blockers.every((b) => b.id !== 'surface_attached' || b.ok)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The scrollTop write trace
// ---------------------------------------------------------------------------

/**
 * Rewriting `Element.prototype.scrollTop` is the riskiest thing in this
 * module by a distance: it puts our function in the path of every scroll
 * write the app makes. It earns its place because it is the ONLY way to tell
 * "our own code is putting the scroll position back" apart from "the
 * compositor will not move" — native and compositor scrolling never go
 * through the setter, so every record is a JS write by construction.
 *
 * The price is that it must be off unless somebody asked for it, and must
 * put the prototype back exactly as it found it.
 */
describe('observability/chat-scroll-write-trace — the opt-in write recorder', () => {
  /**
   * jsdom's own `scrollTop` setter discards the value, and the freeze specs
   * shadow it with an own-property stub — neither of which exercises the
   * prototype patch. So the tests install a stand-in "native" accessor that
   * really stores, and assert the wrapper delegates to it and hands it back
   * untouched afterwards.
   */
  function installFakeNative(): { descriptor: PropertyDescriptor; restore: () => void } {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    const store = new WeakMap<Element, number>();
    const descriptor: PropertyDescriptor = {
      configurable: true,
      enumerable: true,
      get(this: Element) {
        return store.get(this) ?? 0;
      },
      set(this: Element, value: number) {
        store.set(this, value);
      },
    };
    Object.defineProperty(Element.prototype, 'scrollTop', descriptor);
    return {
      descriptor,
      restore: () => {
        if (original != null) Object.defineProperty(Element.prototype, 'scrollTop', original);
      },
    };
  }

  it('is off by default — the prototype is untouched by installing the observer', () => {
    const before = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    installChatScrollFreezeObserver();
    const after = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    expect(handle().writes.enabled()).toBe(false);
    expect(after?.set).toBe(before?.set);
    expect(after?.get).toBe(before?.get);
  });

  it('records a scrollTop write to the chat log, with the stack that made it', () => {
    const fake = installFakeNative();
    try {
      const log = buildChatLog();
      installChatScrollFreezeObserver();
      expect(handle().writes.enable()).toBe(true);

      function theCallSiteWeWantNamed(): void {
        log.scrollTop = 640;
      }
      theCallSiteWeWantNamed();

      const records = handle().writes.list();
      expect(records).toHaveLength(1);
      expect(records[0]?.api).toBe('scrollTop');
      expect(records[0]?.value).toBe(640);
      expect(records[0]?.target).toContain('chat-log');
      expect(records[0]?.stack).toContain('theCallSiteWeWantNamed');
      // …and the write still lands: the wrapper delegates, it does not divert.
      expect(log.scrollTop).toBe(640);
    } finally {
      handle().writes.disable();
      fake.restore();
    }
  });

  it('ignores scroll writes that are not the chat log', () => {
    const fake = installFakeNative();
    try {
      buildChatLog();
      const elsewhere = document.createElement('div');
      document.body.appendChild(elsewhere);
      installChatScrollFreezeObserver();
      handle().writes.enable();

      elsewhere.scrollTop = 200;

      expect(handle().writes.list()).toHaveLength(0);
    } finally {
      handle().writes.disable();
      fake.restore();
    }
  });

  it('records scrollTo, scrollBy and scrollIntoView as well as the setter', () => {
    // jsdom ships none of `scrollTo`/`scrollBy` on Element, so they are stood
    // up here — which is also the only honest way to assert the wrapper hands
    // the call through to whatever was there.
    const fake = installFakeNative();
    const calls: string[] = [];
    const added: string[] = [];
    for (const name of ['scrollTo', 'scrollBy'] as const) {
      if (Object.getOwnPropertyDescriptor(Element.prototype, name) == null) added.push(name);
      Object.defineProperty(Element.prototype, name, {
        configurable: true,
        writable: true,
        value: function stand(this: Element, arg: unknown) {
          calls.push(`${name}:${JSON.stringify(arg)}`);
        },
      });
    }
    const originalIntoView = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollIntoView',
    );
    try {
      const log = buildChatLog();
      const row = document.createElement('div');
      row.className = 'msg assistant';
      log.appendChild(row);
      installChatScrollFreezeObserver();
      handle().writes.enable();

      (log as unknown as { scrollTo: (arg: unknown) => void }).scrollTo({ top: 900 });
      (log as unknown as { scrollBy: (arg: unknown) => void }).scrollBy({ top: 120 });
      row.scrollIntoView();

      const apis = handle().writes.list().map((r) => r.api);
      expect(apis).toEqual(['scrollTo', 'scrollBy', 'scrollIntoView']);
      expect(handle().writes.list()[0]?.value).toBe(900);
      // A scrollIntoView on a descendant is a write to the LOG's position, so
      // it is attributed to the descendant but measured on the scroller.
      expect(handle().writes.list()[2]?.target).toContain('msg');
      // Delegation, not diversion.
      expect(calls).toEqual(['scrollTo:{"top":900}', 'scrollBy:{"top":120}']);
    } finally {
      handle().writes.disable();
      for (const name of added) {
        delete (Element.prototype as unknown as Record<string, unknown>)[name];
      }
      if (originalIntoView != null) {
        Object.defineProperty(Element.prototype, 'scrollIntoView', originalIntoView);
      }
      fake.restore();
    }
  });

  it('puts the prototype back exactly as it found it', () => {
    const fake = installFakeNative();
    try {
      installChatScrollFreezeObserver();
      const before = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
      handle().writes.enable();
      const during = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
      expect(during?.set).not.toBe(before?.set);

      handle().writes.disable();

      const after = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
      expect(after?.set).toBe(before?.set);
      expect(after?.get).toBe(before?.get);
      expect(after?.configurable).toBe(before?.configurable);
      expect(after?.enumerable).toBe(before?.enumerable);
      expect(handle().writes.enabled()).toBe(false);
    } finally {
      fake.restore();
    }
  });

  it('takes the patch down when the observer is uninstalled', () => {
    const fake = installFakeNative();
    try {
      const teardown = installChatScrollFreezeObserver();
      const before = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
      handle().writes.enable();
      teardown();
      const after = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
      expect(after?.set).toBe(before?.set);
    } finally {
      fake.restore();
    }
  });

  it('re-arms itself across a reload from its own flag, and only from that', () => {
    const fake = installFakeNative();
    try {
      installChatScrollFreezeObserver();
      expect(handle().writes.enabled()).toBe(false);
      handle().writes.enable();
      expect(localStorage.getItem(SCROLL_WRITE_TRACE_STORAGE_KEY)).toBe('1');

      // A reload: everything comes down, the flag survives, install re-arms.
      __resetChatScrollFreezeForTest();
      localStorage.setItem(SCROLL_WRITE_TRACE_STORAGE_KEY, '1');
      installChatScrollFreezeObserver();
      expect(handle().writes.enabled()).toBe(true);

      handle().writes.disable();
      expect(localStorage.getItem(SCROLL_WRITE_TRACE_STORAGE_KEY)).toBeNull();
      __resetChatScrollFreezeForTest();
      installChatScrollFreezeObserver();
      expect(handle().writes.enabled()).toBe(false);
    } finally {
      handle().writes.disable();
      fake.restore();
    }
  });

  it('shows the trace state in the snapshot without turning it on', () => {
    installChatScrollFreezeObserver();
    const snapshot = handle().snapshot();
    expect(snapshot.writeTrace.armed).toBe(false);
    expect(snapshot.writeTrace.recorded).toBe(0);
    expect(
      Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')?.set?.name,
    ).not.toContain('od');
  });
});

// ---------------------------------------------------------------------------
// The inner-scroller gate — what may and may not eat a wheel
// ---------------------------------------------------------------------------

/**
 * The defect, reproduced
 * ----------------------
 * `countAbsorbingScrollers` decides whether some box between the wheel target
 * and the chat log could legitimately have eaten the gesture. It asks one
 * question — is `scrollHeight - clientHeight` bigger than the tolerance, and
 * is there travel left — and it never looks at `overflow`.
 *
 * A box with `overflow: hidden` and clipped content answers YES to both while
 * being completely unscrollable by a wheel. A chat transcript is full of
 * them, by design and on purpose:
 *
 *   `.msg.user .user-text-txt`      -webkit-line-clamp: 6; overflow: hidden
 *   `.md-code-block[data-collapsed]` max-height: 7em; overflow: hidden
 *   `.accordion-collapsible-inner`   overflow: hidden while collapsed
 *   `.action-card` / `.live-code-box` / `.file-ops` / `.question-form`
 *
 * So a wheel aimed anywhere over a long user message, a collapsed code block
 * or a closed accordion produces a frozen verdict that is silently discarded
 * — AND has its streak cleared, so the four notches have to be earned again
 * somewhere "clean". The one live capture that DID report is the exception
 * that proves it: that transcript had no thinking block, no tool row, no
 * question form, no code block. Nothing to absorb.
 *
 * The fix asks `overflow-y` before counting anything, so suppression is
 * earned by proof that the box is a scrollport rather than inferred from
 * geometry that clipping produces just as readily. The pair below is the
 * whole contract: a clipped box must NOT silence the probe, and a real
 * scroller with travel left still must.
 */
describe('observability/chat-scroll-freeze — clipped boxes must not suppress', () => {
  it('reports a freeze wheeled over an overflow:hidden box, which cannot scroll', () => {
    const log = buildChatLog();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });

    // A collapsed code block: 900px of content clipped to 120px, no scrollbar,
    // no wheel response. Geometry alone cannot tell it from a real scroller.
    const clipped = document.createElement('div');
    clipped.className = 'md-code-body';
    clipped.style.overflow = 'hidden';
    clipped.style.overflowY = 'hidden';
    log.appendChild(clipped);
    stubGeometry(clipped, { scrollTop: 0, scrollHeight: 900, clientHeight: 120 });

    installChatScrollFreezeObserver();
    scrolled(log);
    for (let i = 0; i < 12; i += 1) {
      advanceClock(16);
      wheel(clipped, 120);
    }

    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(1);
  });

  it('still stays silent over a real scroller with travel left', () => {
    // The other half, and the one that keeps the fix honest: loosening the
    // gate until nothing suppresses would turn every code block and every
    // tool-output box in a transcript into a false freeze report. Identical
    // geometry to the case above — 900px of content, wheeled 12 times — and
    // the ONLY difference is that this box has a vertical scrollport.
    const log = buildChatLog();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });

    const scroller = document.createElement('pre');
    scroller.className = 'md-code-body';
    scroller.style.overflowY = 'auto';
    log.appendChild(scroller);
    stubGeometry(scroller, { scrollTop: 0, scrollHeight: 900, clientHeight: 120 });

    installChatScrollFreezeObserver();
    scrolled(log);
    for (let i = 0; i < 12; i += 1) {
      advanceClock(16);
      wheel(scroller, 120);
    }

    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(0);
    // …and it says so, rather than going quiet for an unrecorded reason.
    expect(handle().snapshot().surface?.innerScrollerSuppressions).toBeGreaterThan(0);
  });

  it('does not let a horizontal-only scroller eat a vertical wheel', () => {
    // The awkward cell of the overflow grid: a wide code block that scrolls
    // sideways and is clipped vertically. `overflow-x` says "scroller" and
    // the geometry says "travel left", but a downward wheel over it moves
    // nothing, so it must not stand in for the chat log's stillness.
    const log = buildChatLog();
    stubGeometry(log, { scrollTop: 91, scrollHeight: 2347, clientHeight: 583 });

    const wide = document.createElement('pre');
    wide.className = 'md-code-body';
    wide.style.overflowX = 'auto';
    wide.style.overflowY = 'hidden';
    log.appendChild(wide);
    stubGeometry(wide, { scrollTop: 0, scrollHeight: 900, clientHeight: 120 });

    installChatScrollFreezeObserver();
    scrolled(log);
    for (let i = 0; i < 12; i += 1) {
      advanceClock(16);
      wheel(wide, 120);
    }

    expect(eventsNamed('client_chat_scroll_frozen')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The reporting threshold
// ---------------------------------------------------------------------------

/**
 * `MIN_UNREACHABLE_PX` was 24, and the one live capture the probe ever made
 * showed the deficit opening at 1px and growing 0 → 1 → 5 → 9 → 12 → 27. A
 * 24px bar throws away the first five rounds of every such run and reports
 * nothing at all for a drift that settles at 12px — which is a chat the user
 * cannot scroll to the bottom of by a line and a half.
 *
 * The floor underneath it is rounding, not noise: `scrollHeight` and
 * `clientHeight` are integers while `scrollTop` is fractional, which puts the
 * static error at well under a pixel. Two independent guards already stand in
 * front of this one — four consecutive downward notches
 * (`FREEZE_WHEEL_COUNT`) that together asked for 240px
 * (`FREEZE_REQUESTED_PX`) — so by the time this threshold is consulted, a
 * scroller that will not move at all is already established and the only
 * question left is whether the gap is big enough for a human to see.
 */
describe('chat-scroll-freeze-detector — the unreachable threshold', () => {
  it('reports a moderate drift the old 24px bar would have swallowed', () => {
    // 12px short: the fifth round of the captured sequence, and the value a
    // drift that stops growing sits at forever.
    const drifted = { scrollTop: 1752, scrollHeight: 2347, clientHeight: 583 };
    let state = createScrollFreezeState();
    let verdict;
    for (let i = 0; i < FREEZE_WHEEL_COUNT; i += 1) {
      verdict = observeWheelBatch(state, {
        geometry: drifted,
        requestedPx: 120,
        wheelCount: 1,
      });
      state = verdict.state;
    }
    expect(verdict?.verdict.kind).toBe('frozen');
    if (verdict?.verdict.kind !== 'frozen') return;
    expect(verdict.verdict.evidence.unreachablePx).toBe(12);
  });

  it('still refuses a sub-pixel rounding artefact', () => {
    // One pixel of slack between an integer content height and a fractional
    // scrollTop is arithmetic, not a defect.
    const rounded = { scrollTop: 1763, scrollHeight: 2347, clientHeight: 583 };
    let state = createScrollFreezeState();
    let verdict;
    for (let i = 0; i < 12; i += 1) {
      verdict = observeWheelBatch(state, {
        geometry: rounded,
        requestedPx: 120,
        wheelCount: 1,
      });
      state = verdict.state;
    }
    expect(verdict?.verdict.kind).toBe('at_end');
  });

  it('keeps the snap-back route on its own, unchanged, threshold', () => {
    // `SNAP_BACK_MIN_PX` describes a different thing — how far backwards a
    // downward notch threw the scroller — and nothing in the capture argues
    // for moving it. What must hold is that a snap-back still needs real
    // unreachable distance underneath it.
    let state = createScrollFreezeState();
    state = observeScroll(state, { scrollTop: 800, scrollHeight: 2347, clientHeight: 583 });
    const result = observeWheelBatch(state, {
      geometry: { scrollTop: 780, scrollHeight: 2347, clientHeight: 583 },
      requestedPx: 120,
      wheelCount: 1,
    });
    expect(result.verdict.kind).toBe('frozen');
    if (result.verdict.kind !== 'frozen') return;
    expect(result.verdict.evidence.trigger).toBe('wheel_snap_back');
  });
});
