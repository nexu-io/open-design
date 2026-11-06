// Self-heal for a chat log the compositor has stopped scrolling.
//
// The defect
// ----------
// Chromium keeps its own copy of "how far this scroller scrolls" so a wheel can
// move the page without waiting on the main thread. On the chat log that copy
// stops tracking layout. Measured on a real machine (Chromium 146 / Electron
// 41) with real OS wheel events, on a log with 1764px of genuine travel:
//
//   scrollTop = 1700 assigned from JS   → took effect
//   scrollTop = 99999 assigned from JS  → clamped to 1764, i.e. correct
//   12 wheel notches asking for 1440px  → stopped dead at 91
//   scrollTop = 800, then one notch     → thrown backwards to 91
//
// Two facts sit side by side there: the programmatic write path is completely
// healthy, and the wheel path is not. Everything in this module is built on
// that pair.
//
// What happens after the probe's verdict, in order
// ------------------------------------------------
// The freeze probe (`observability/chat-scroll-freeze.ts`) observes and
// reports; it never writes. This module subscribes to its `frozen` verdict —
// delivered after the analytics event has already gone out — and does three
// things, each gated on the one before it:
//
//   1. THE KICK. One frame of `will-change: transform` on the chat log, taken
//      off again on the next frame. A change to a compositing-relevant
//      property makes Blink rebuild that element's paint property nodes —
//      the scroll node included — from the CURRENT layout box, which is the
//      cheapest way to ask the compositor to re-read the scroll bounds it
//      has drifted away from. It changes no layout, writes no `scrollTop`,
//      and restores whatever inline `will-change` the element carried. It is
//      the lightweight version of the repair that was rejected earlier
//      (`display: none` → `flex`), which also cleared the stale ceiling but
//      cost a flash, the scroll position and the evidence.
//
//   2. THE OBSERVATION. Whether the kick worked cannot be read from JS —
//      nothing exposes the compositor's copy — so the next downward wheel is
//      let through NATIVELY and measured. Its request is normalised exactly
//      as the detector does it (`wheelDeltaToPx`), clamped to the travel
//      layout actually had left, and compared with where the log ended up
//      once the gesture settled. Within the detector's own 8px yardstick
//      (`MIN_UNREACHABLE_PX`) means healed: nothing is registered, the probe
//      is asked to start a fresh surface so a recurrence can be caught, and
//      the user keeps native scrolling. Stuck, short by more than that, or
//      thrown backwards means the compositor is still wrong.
//
//   3. THE TAKEOVER. Only then: the wheel is cancelled and answered by
//      `scrollTop` assignment, one write per frame carrying the whole burst;
//      and the keyboard keys that scroll — arrows, PageUp/Down, Home/End,
//      Space — are answered the same way, because on this surface keyboard
//      scrolling shares the broken path. Nothing here touches layout,
//      styles or the element's identity; the frozen box stays exactly as it
//      was, still reporting to the probe, and only the input path is routed
//      around.
//
// One `client_chat_scroll_heal` event records which of 2 and 3 it was, with
// the geometry around the kick and the arithmetic of the observation, joined
// to the freeze by `probe_id`. It is the only telemetry this module sends and
// it changes nothing about `client_chat_scroll_frozen`.
//
// Why it is on for everyone
// -------------------------
// It shipped behind a `localStorage` switch, off by default, because the
// detector had never been checked against the real world: its production
// event count was zero, and that zero turned out to be a reporting bug. That
// argument is gone. `client_chat_scroll_frozen` now arrives from roughly
// 1000–1500 users a day — around 12% of client daily actives — including web
// Chrome 152/153, and #8228 traced one real cause (a rounded clip above the
// log forcing every wheel notch through a main-thread hit test that a
// streaming run keeps busy) and removed it. What is left is the compositor's
// stale ceiling, which no local session has reproduced as a persistent state
// and for which the only recovery ever observed is a rebuilt scroll node. So
// the decision (product, 2026-09-17) is: kick, observe, and take over — on
// by default, with `open-design:chat-scroll-takeover = '0'` as the escape
// hatch. A false positive from the detector now costs one invisible frame
// and one natively-scrolled notch before anything changes, and the `healed`
// outcome of the heal event is the measurement of that rate.
//
// The observation is also why there is no periodic "has native scrolling
// recovered?" probe once engaged. Letting a notch through on a surface that is
// still frozen does not merely fail — it throws the log BACKWARDS onto the
// stale ceiling, which is a visible jump. One such notch, deliberately, right
// after the kick, is the price of finding out; paying it every few seconds is
// not.
//
// How it comes off
// ----------------
// Two ways. The probe releasing the surface — remount, teardown, or the host
// calling `releaseChatScrollFreezeSurface()` — and `releaseChatScrollTakeover()`,
// which `ChatPane` calls when `activeConversationId` changes. The chat log's
// node is reused across conversations, so without that call a takeover engaged
// for one conversation would keep answering the wheel for the next, healthy
// one; and because the probe reports once per surface, the release also asks
// the probe to start over, so the next conversation can be judged on its own.
//
// Sharing the scroller with the panel's own writers
// -------------------------------------------------
// `ChatPane` already writes `scrollTop`: `syncFollowState` pins the log to the
// newest output while the user is following, and the virtual-scroll anchor
// repositions it on a list reset. This module is a third writer, and the
// reason that is safe is that it does not look like a writer to the machinery
// that matters.
//
// `stick-to-bottom` decides "is the user still following" from scroll EVENTS —
// direction plus "`scrollHeight` did not change" — and it re-baselines on every
// one of them. A `scrollTop` assignment fires the same scroll event a native
// wheel would, carrying the same delta, so the intent machine reads a taken-over
// wheel exactly as it reads a real one. That is the correct reading: the write
// IS the user's wheel, just delivered by a different route.
//
// The panel's own `wheel` listener still runs as well — this module cancels the
// default but never stops propagation — so an upward notch still releases the
// follow lock immediately, which is what keeps `syncFollowState` from yanking
// the user back to the bottom mid-gesture. Its `keydown` listener runs too, and
// resets the wheel witness the way any keyboard input does.
//
// The one writer that could fight is that bottom-pin, and it cannot be live
// here by construction: pinning uses the JS write path, which is healthy during
// this defect, so a following log is a log sitting at its bottom — and a log at
// its bottom has no unreachable content, which is a precondition of the freeze
// verdict this module waits for.

import type { ChatScrollHealProps } from '@open-design/contracts/analytics';

import { reportSafetyEvent } from '../analytics/error-tracking';
import { chatCorrelation } from '../observability/chat-context';
import {
  type ChatScrollFreezeSignal,
  absorbsWheelInDirection,
  releaseChatScrollFreezeSurface,
  subscribeChatScrollFreeze,
} from '../observability/chat-scroll-freeze';
import {
  MIN_UNREACHABLE_PX,
  type ScrollFreezeTrigger,
  type ScrollGeometry,
  wheelDeltaToPx,
} from '../observability/chat-scroll-freeze-detector';

/**
 * The escape hatch. `'0'` keeps every wheel and key with the browser for the
 * whole session; anything else, including absence, arms the self-heal.
 *
 * Read once, at install, exactly like `SCROLL_WRITE_TRACE_STORAGE_KEY`:
 * flipping it takes effect on reload, which is the right granularity for
 * something that changes input handling for a whole session. To turn it off:
 *
 *   localStorage.setItem('open-design:chat-scroll-takeover', '0')  // then reload
 */
export const CHAT_SCROLL_TAKEOVER_STORAGE_KEY = 'open-design:chat-scroll-takeover';

/**
 * How long after the LAST downward wheel of the observation the verdict is
 * taken. Mouse wheels in Chromium scroll with a ~200ms animation, and a
 * trackpad flick is many notches over hundreds of milliseconds; judging the
 * burst before it has landed would read a healthy scroller as short. The
 * deadline re-arms on every notch, so it is a quiet period, not a cap.
 */
export const OBSERVATION_SETTLE_MS = 300;

/** Blink's line step for keyboard scrolling. */
export const KEYBOARD_LINE_PX = 40;
/** Blink's minimum fraction of the viewport a page step moves. */
export const KEYBOARD_PAGE_FRACTION = 0.875;

/**
 * Capture, so a handler inside the transcript cannot stop the event before we
 * see it; NOT passive, because cancelling the default is the entire mechanism.
 * This is the only non-passive listener in the chat scroll path, and it exists
 * only while a surface is taken over.
 */
const WHEEL_LISTEN_OPTIONS = { capture: true, passive: false } as const;
const PASSIVE_CAPTURE = { capture: true, passive: true } as const;
const CAPTURE = { capture: true } as const;

/** Viewport height assumed for a page-mode wheel before the first frame lands. */
const FALLBACK_VIEWPORT_PX = 800;

/** Where Home / End send the log. Kept apart from pixel steps — see `Surface.pendingEdge`. */
type PendingEdge = 'top' | 'bottom';

export type ChatScrollTakeoverPhase =
  /** No surface. */
  | 'idle'
  /** `will-change` is on the element; the restore frame has not run yet. */
  | 'kicking'
  /** Kicked; waiting for a downward wheel to judge. */
  | 'probing'
  /** A downward wheel is in flight natively; waiting for it to settle. */
  | 'observing'
  /** JavaScript answers the wheel and the keyboard. */
  | 'engaged';

interface Observation {
  startedAt: number;
  /** `scrollTop` the log was settled at before the first notch. */
  topBefore: number;
  requestedPx: number;
  wheelCount: number;
  scrollEvents: number;
  timer: ReturnType<typeof setTimeout> | null;
}

interface Surface {
  readonly element: HTMLElement;
  readonly probeId: string;
  readonly trigger: ScrollFreezeTrigger;
  readonly frozenAt: number;
  phase: ChatScrollTakeoverPhase;

  // -- the kick -------------------------------------------------------------
  readonly kickBefore: ScrollGeometry;
  kickAfter: ScrollGeometry | null;
  /** Inline `will-change` as it was, restored verbatim. */
  readonly previousWillChange: string;
  kickFrameHandle: number | null;

  // -- the observation ------------------------------------------------------
  /**
   * The last `scrollTop` a scroll event reported while nothing was in flight.
   * The notch's baseline. Read from scroll events rather than in the wheel
   * handler because a passive wheel is dispatched AFTER the compositor has
   * already scrolled for it — a handler-time read can already be the answer.
   */
  settledTop: number;
  observation: Observation | null;
  inconclusiveNotches: number;

  // -- the takeover ---------------------------------------------------------
  /**
   * Wheel and key pixels accumulated since the last applied frame, measured
   * from `pendingEdge` when one is set and from the current position otherwise.
   */
  pendingPx: number;
  /**
   * An edge jump (Home / End) queued for the next frame.
   *
   * Kept out of `pendingPx` on purpose. Edges used to be ±Infinity folded into
   * the same accumulator as the arrows, and two edge keys in one frame — Home
   * then End, or key repeat — summed to NaN; a NaN `scrollTop` write is read by
   * the browser as 0, so End could not reach the bottom. The last edge pressed
   * wins, and pressing one discards the steps queued before it: the user asked
   * for the edge, not the edge plus wherever the earlier steps would have gone.
   * Steps pressed AFTER the edge apply on top of it.
   */
  pendingEdge: PendingEdge | null;
  framePending: boolean;
  /** In-flight `requestAnimationFrame` handle, so disengaging can cancel it. */
  frameHandle: number | null;
  /**
   * Geometry as of the last frame, plus whatever this module has written
   * since.
   *
   * The wheel handler reasons from this and never from the element. Reading
   * `scrollHeight` inside a wheel handler forces a synchronous layout on the
   * input path — the exact jank the user is already suffering — and one frame
   * of staleness cannot change any decision it is used for: whether there is
   * travel left, and how tall a page-mode notch is.
   */
  geometry: ScrollGeometry;
  /**
   * Blink starts keyboard scrolling from the focused element, or, when nothing
   * focusable is focused, from the last mouse press. This is the second half
   * of that rule: true when the last press landed inside the log. Starts true
   * because the freeze verdict itself came from wheeling over the log.
   */
  keyboardOwner: boolean;
}

let surface: Surface | null = null;
let unsubscribe: (() => void) | null = null;
let installed = false;

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/**
 * Subscribe to the freeze probe — or, when the escape hatch is pulled, do
 * nothing at all and say so by returning a no-op.
 *
 * "Nothing at all" is load-bearing and is pinned by a spec: no listener, no
 * timer, no frame, no subscription. A user who set `'0'` must not be able to
 * tell this module exists.
 */
export function installChatScrollTakeover(): () => void {
  if (installed) return () => undefined;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }
  if (chatScrollTakeoverSwitchedOff()) return () => undefined;
  // Without a frame scheduler the takeover could cancel a wheel and then have
  // no moment in which to answer it, which is strictly worse than not
  // engaging. Where the browser has none, this module stays out of the way.
  if (typeof requestAnimationFrame !== 'function') return () => undefined;

  installed = true;
  unsubscribe = subscribeChatScrollFreeze(onFreezeSignal);

  return () => {
    installed = false;
    unsubscribe?.();
    unsubscribe = null;
    disengage();
  };
}

function onFreezeSignal(signal: ChatScrollFreezeSignal): void {
  if (signal.kind === 'frozen') {
    kick(signal.element, signal.probeId, signal.trigger, signal.geometry);
    return;
  }
  // The probe let go of this element — remount, conversation switch, its own
  // teardown. Whatever we hung on it comes off with it.
  if (surface?.element === signal.element) disengage();
}

/**
 * Hand everything back to the browser and let the probe start a fresh surface.
 *
 * `ChatPane` calls this when `activeConversationId` changes. The chat log's
 * node survives a conversation switch, so nothing at the DOM level would
 * otherwise tell this module — or the probe, which reports once per surface —
 * that the conversation it judged is gone. Safe to call with nothing engaged.
 */
export function releaseChatScrollTakeover(): void {
  // The probe's release emits `surface_released`, which disengages us if we
  // were attached to that element; the explicit call after it covers a
  // surface the probe no longer holds (or a probe that is not installed).
  releaseChatScrollFreezeSurface();
  disengage();
}

/** Whether a surface is currently being driven from JavaScript. */
export function chatScrollTakeoverEngaged(): boolean {
  return surface?.phase === 'engaged';
}

/** Where the self-heal stands for the current surface, if any. */
export function chatScrollTakeoverPhase(): ChatScrollTakeoverPhase {
  return surface?.phase ?? 'idle';
}

// ---------------------------------------------------------------------------
// 1. The kick
// ---------------------------------------------------------------------------

function kick(
  element: HTMLElement,
  probeId: string,
  trigger: ScrollFreezeTrigger,
  geometry: ScrollGeometry,
): void {
  if (surface?.element === element && surface.phase === 'engaged') return;
  disengage();
  const active: Surface = {
    element,
    probeId,
    trigger,
    frozenAt: now(),
    phase: 'kicking',
    kickBefore: geometry,
    kickAfter: null,
    previousWillChange: element.style.willChange,
    kickFrameHandle: null,
    settledTop: geometry.scrollTop,
    observation: null,
    inconclusiveNotches: 0,
    pendingPx: 0,
    pendingEdge: null,
    framePending: false,
    frameHandle: null,
    geometry,
    keyboardOwner: true,
  };
  surface = active;

  // Listening from the first instant, so no wheel between the verdict and the
  // restore frame is lost — the handler itself ignores them until `probing`.
  element.addEventListener('wheel', onWheelObserve, PASSIVE_CAPTURE);
  element.addEventListener('scroll', onSurfaceScroll, { passive: true });

  // The verdict is delivered inside the probe's own frame callback, so this
  // style lands in the same frame's style recalc and commit; the restore
  // below lands in the next one. Exactly one committed frame promoted.
  element.style.willChange = 'transform';
  const handle = requestAnimationFrame(() => {
    active.kickFrameHandle = null;
    finishKick(active);
  });
  // A synchronous `requestAnimationFrame` (test stubs do this) has already
  // run the callback by now; only record the handle if it is still live.
  if (active.phase === 'kicking') active.kickFrameHandle = handle;
}

function finishKick(active: Surface): void {
  if (surface !== active || active.phase !== 'kicking') return;
  restoreWillChange(active);
  if (!active.element.isConnected) {
    disengage();
    return;
  }
  // Layout is clean in a frame callback, and `will-change` does not touch it:
  // these numbers must equal `kickBefore`, and the heal event carries both so
  // that holds per event rather than by argument.
  const after = readGeometry(active.element);
  active.kickAfter = after;
  active.geometry = after;
  active.settledTop = after.scrollTop;
  active.phase = 'probing';
}

function restoreWillChange(active: Surface): void {
  try {
    if (active.previousWillChange === '') {
      active.element.style.removeProperty('will-change');
      if (active.element.getAttribute('style') === '') active.element.removeAttribute('style');
    } else {
      active.element.style.willChange = active.previousWillChange;
    }
  } catch {
    // best-effort — a style we cannot restore is still one we must not leave
  }
}

// ---------------------------------------------------------------------------
// 2. The observation
// ---------------------------------------------------------------------------

/**
 * Passive: the point is to watch what the browser does with this notch, so
 * nothing here may cancel it.
 */
function onWheelObserve(event: WheelEvent): void {
  const active = surface;
  if (active === null || event.currentTarget !== active.element) return;
  if (active.phase !== 'probing' && active.phase !== 'observing') return;
  if (event.ctrlKey || event.metaKey) return;
  const deltaY = event.deltaY;
  if (!Number.isFinite(deltaY) || deltaY === 0) return;
  const px = wheelDeltaToPx(deltaY, event.deltaMode, viewportPxOf(active));
  if (px === 0) return;

  if (px < 0) {
    // An upward notch is a different gesture, and one landing inside the
    // window corrupts the measurement: the observation restarts from the
    // next downward notch. (Upward wheels work natively on a frozen surface.)
    cancelObservation(active);
    return;
  }
  // A wheel a code block or a tool-output box absorbs never asked the chat log
  // to move, so it is not evidence about the chat log. This reads layout in a
  // wheel handler, which this module otherwise refuses to do; it is bounded
  // by the number of wheels before the first one aimed at the log itself.
  if (innerScrollerWants(active.element, event.target, px)) return;

  const observation = active.observation ?? {
    startedAt: now(),
    topBefore: active.settledTop,
    requestedPx: 0,
    wheelCount: 0,
    scrollEvents: 0,
    timer: null,
  };
  observation.requestedPx += px;
  observation.wheelCount += 1;
  if (observation.timer != null) clearTimeout(observation.timer);
  observation.timer = setTimeout(() => concludeObservation(active), OBSERVATION_SETTLE_MS);
  active.observation = observation;
  active.phase = 'observing';
}

function onSurfaceScroll(): void {
  const active = surface;
  if (active === null) return;
  if (active.phase === 'observing' && active.observation != null) {
    active.observation.scrollEvents += 1;
    return;
  }
  if (active.phase === 'probing') active.settledTop = active.element.scrollTop;
}

function cancelObservation(active: Surface): void {
  const observation = active.observation;
  active.observation = null;
  if (observation?.timer != null) clearTimeout(observation.timer);
  if (active.phase === 'observing') {
    active.phase = 'probing';
    active.settledTop = active.element.scrollTop;
  }
}

/**
 * The gesture has been quiet for `OBSERVATION_SETTLE_MS`: compare where the log
 * is with where the notch asked it to be.
 */
function concludeObservation(active: Surface): void {
  if (surface !== active || active.phase !== 'observing') return;
  const observation = active.observation;
  active.observation = null;
  if (observation == null) return;
  observation.timer = null;
  if (!active.element.isConnected) {
    disengage();
    return;
  }

  const after = readGeometry(active.element);
  const layoutMax = Math.max(0, after.scrollHeight - after.clientHeight);
  const room = Math.max(0, layoutMax - observation.topBefore);
  const expected = clamp(observation.requestedPx, 0, room);
  if (expected <= MIN_UNREACHABLE_PX) {
    // A notch at the bottom proves nothing either way — the detector refuses
    // to convict there for the same reason. Wait for one with room.
    active.inconclusiveNotches += 1;
    active.phase = 'probing';
    active.settledTop = after.scrollTop;
    active.geometry = after;
    return;
  }

  const moved = after.scrollTop - observation.topBefore;
  const healed = moved > 0 && expected - moved <= MIN_UNREACHABLE_PX;
  reportHeal(active, healed ? 'healed' : 'takeover', observation, after, layoutMax, expected, moved);

  if (healed) {
    // The probe reports once per surface, and this surface has reported. A
    // fresh one lets a recurrence be judged — and kicked — again.
    releaseChatScrollFreezeSurface();
    disengage();
    return;
  }
  engage(active, after);
}

function reportHeal(
  active: Surface,
  outcome: ChatScrollHealProps['outcome'],
  observation: Observation,
  after: ScrollGeometry,
  layoutMax: number,
  expected: number,
  moved: number,
): void {
  const before = active.kickBefore;
  const kicked = active.kickAfter ?? before;
  const props: ChatScrollHealProps = {
    ...chatCorrelation(),
    outcome,
    probe_id: active.probeId,
    trigger: active.trigger,
    kick_scroll_top_before: Math.round(before.scrollTop),
    kick_scroll_height_before: Math.round(before.scrollHeight),
    kick_client_height_before: Math.round(before.clientHeight),
    kick_scroll_top_after: Math.round(kicked.scrollTop),
    kick_scroll_height_after: Math.round(kicked.scrollHeight),
    kick_client_height_after: Math.round(kicked.clientHeight),
    kick_to_notch_ms: Math.round(observation.startedAt - active.frozenAt),
    notch_wheel_count: observation.wheelCount,
    notch_requested_px: Math.round(observation.requestedPx),
    notch_expected_px: Math.round(expected),
    notch_moved_px: Math.round(moved),
    notch_scroll_top_before: Math.round(observation.topBefore),
    notch_scroll_top_after: Math.round(after.scrollTop),
    notch_layout_max_after: Math.round(layoutMax),
    notch_scroll_event_count: observation.scrollEvents,
    notch_inconclusive_count: active.inconclusiveNotches,
  };
  reportSafetyEvent('client_chat_scroll_heal', { ...props });
}

// ---------------------------------------------------------------------------
// 3. The takeover
// ---------------------------------------------------------------------------

function engage(active: Surface, geometry: ScrollGeometry): void {
  active.phase = 'engaged';
  active.geometry = geometry;
  active.pendingPx = 0;
  active.pendingEdge = null;
  active.keyboardOwner = true;
  active.element.removeEventListener('wheel', onWheelObserve, CAPTURE);
  active.element.removeEventListener('scroll', onSurfaceScroll);
  active.element.addEventListener('wheel', onWheelCapture, WHEEL_LISTEN_OPTIONS);
  document.addEventListener('keydown', onKeyDown, CAPTURE);
  document.addEventListener('pointerdown', onPointerDown, PASSIVE_CAPTURE);
}

function disengage(): void {
  const active = surface;
  surface = null;
  if (active == null) return;
  const element = active.element;
  element.removeEventListener('wheel', onWheelObserve, CAPTURE);
  element.removeEventListener('scroll', onSurfaceScroll);
  element.removeEventListener('wheel', onWheelCapture, CAPTURE);
  document.removeEventListener('keydown', onKeyDown, CAPTURE);
  document.removeEventListener('pointerdown', onPointerDown, CAPTURE);
  if (active.phase === 'kicking') {
    cancelAnimationFrameSafely(active.kickFrameHandle);
    active.kickFrameHandle = null;
    restoreWillChange(active);
  }
  if (active.observation?.timer != null) clearTimeout(active.observation.timer);
  active.observation = null;
  cancelFrame(active);
  active.pendingPx = 0;
  active.pendingEdge = null;
  active.phase = 'idle';
}

/**
 * The node this surface was engaged on is gone from the document.
 *
 * A tab switch or a route change unmounts the chat log without a conversation
 * change, and the probe only notices a missing node on its next scroll — which
 * a log that no longer exists never sends. Until then the document-level
 * keydown listener was still cancelling arrows and paging with nothing left to
 * scroll. Every input path asks this first and, when it is true, lets go and
 * hands the event back to the browser.
 */
function surfaceLost(active: Surface): boolean {
  if (active.element.isConnected) return false;
  disengage();
  return true;
}

// ---------------------------------------------------------------------------
// The wheel, once engaged
// ---------------------------------------------------------------------------

/**
 * Decide, cancel, accumulate. No layout read, no write, nothing synchronous
 * beyond the ancestor walk below.
 *
 * Every early return here hands the wheel back to the browser untouched, and
 * they are ordered cheapest-first for that reason: the expensive question
 * (does a box inside the transcript want this wheel) is asked last, and only
 * for a gesture this module would otherwise consume.
 */
function onWheelCapture(event: WheelEvent): void {
  const active = surface;
  if (active === null || active.phase !== 'engaged') return;
  // Disengaging removes this listener, so a superseded element should never
  // arrive here — but if one ever did, moving it would be moving the wrong
  // log.
  if (event.currentTarget !== active.element) return;
  if (surfaceLost(active)) return;

  // ctrl+wheel is pinch-to-zoom on a trackpad and browser zoom on a mouse.
  // Consuming it would take page zoom away from the user; meta is left alone
  // for the same reason.
  if (event.ctrlKey || event.metaKey) return;

  const deltaY = event.deltaY;
  if (!Number.isFinite(deltaY) || deltaY === 0) return;
  const px = wheelDeltaToPx(deltaY, event.deltaMode, viewportPxOf(active));
  if (px === 0) return;

  if (!travelRemains(active, px)) {
    // At a genuine edge the native behaviour is to hand the wheel outward, so
    // this one goes back to the browser untouched.
    //
    // But the cache it was judged against is a frame old, and on a streaming
    // log a frame is enough for the bottom to have moved. Without the refresh
    // below that is a deadlock, not a hiccup: a user parked at what USED to be
    // the bottom declines every wheel, each declined wheel schedules nothing,
    // so nothing ever re-reads the geometry that would let the next one
    // through — on a surface whose native path is broken, which is the whole
    // premise. So the frame is asked for anyway; it carries no pending pixels
    // and does nothing but take a fresh reading.
    scheduleApply(active);
    return;
  }

  if (innerScrollerWants(active.element, event.target, px)) return;

  event.preventDefault();
  active.pendingPx += px;
  scheduleApply(active);
}

/**
 * Is there travel left in this direction, once the pending burst has landed?
 *
 * Where the log WILL be, not where it was: at speed a flick delivers several
 * notches before any of them are applied, and reasoning from the pre-burst
 * position would keep claiming travel that the earlier notches in the same
 * frame already spent.
 */
function travelRemains(active: Surface, px: number): boolean {
  const travel = Math.max(0, active.geometry.scrollHeight - active.geometry.clientHeight);
  if (travel <= 0) return false;
  const projectedTop = clamp(pendingBase(active, active.geometry.scrollTop, travel) + active.pendingPx, 0, travel);
  const remaining = px > 0 ? travel - projectedTop : projectedTop;
  return remaining > 0;
}

/**
 * Is there a scrollport between the wheel's target and the chat log that could
 * still move in this direction?
 *
 * This matters more here than it does for the probe. `preventDefault()` at the
 * chat log cancels scrolling for the WHOLE chain, so a takeover that ignored
 * this question would freeze every code block, tool-output box and scrollable
 * card in the transcript — a worse bug than the one being worked around.
 *
 * It reads layout, per wheel event, which everything else in this file refuses
 * to do. That is a deliberate exception and it is affordable for one reason:
 * this code path only exists on a surface the compositor has already stopped
 * scrolling, so the alternative to the read is not a cheaper takeover, it is a
 * wrong one. The walk is bounded by the depth of the transcript node the
 * pointer is over.
 */
function innerScrollerWants(
  root: HTMLElement,
  target: EventTarget | null,
  deltaPx: number,
): boolean {
  if (!(target instanceof Element) || target === root) return false;
  let node: Element | null = target;
  while (node != null && node !== root) {
    if (node instanceof HTMLElement && absorbsWheelInDirection(node, deltaPx)) return true;
    node = node.parentElement;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The keyboard, once engaged
// ---------------------------------------------------------------------------

/**
 * Answer the keys that scroll, with Blink's own step sizes, when Blink would
 * have aimed them at the chat log.
 *
 * Which keys and how far is not this module's invention: 40px per arrow and
 * 0.875 of a viewport per page are the constants Blink's `ScrollableArea`
 * uses. Which SCROLLER is Blink's rule too — the focused element's, or, with
 * nothing focusable focused, the last mouse press's — see `keyboardAimsAtLog`.
 * Typing is never intercepted: a key inside an input, a textarea or a
 * contenteditable is text editing, whatever its name.
 */
function onKeyDown(event: KeyboardEvent): void {
  const active = surface;
  if (active === null || active.phase !== 'engaged') return;
  if (event.defaultPrevented) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const request = keyboardRequest(event.key, event.shiftKey, viewportPxOf(active));
  if (request == null) return;
  if (!keyboardAimsAtLog(active, event.key)) return;
  if (surfaceLost(active)) return;

  event.preventDefault();
  if (typeof request === 'number') {
    active.pendingPx += request;
  } else {
    active.pendingEdge = request;
    active.pendingPx = 0;
  }
  scheduleApply(active);
}

/** A pixel step, an edge to jump to, or `null` for a key that does not scroll. */
function keyboardRequest(key: string, shift: boolean, viewportPx: number): number | PendingEdge | null {
  const page = Math.round(viewportPx * KEYBOARD_PAGE_FRACTION);
  switch (key) {
    case 'ArrowDown':
      return KEYBOARD_LINE_PX;
    case 'ArrowUp':
      return -KEYBOARD_LINE_PX;
    case 'PageDown':
      return page;
    case 'PageUp':
      return -page;
    case ' ':
    case 'Spacebar':
      return shift ? -page : page;
    case 'End':
      return 'bottom';
    case 'Home':
      return 'top';
    default:
      return null;
  }
}

/** Where the pending pixels are measured from: the queued edge, else the current position. */
function pendingBase(active: Surface, scrollTop: number, max: number): number {
  if (active.pendingEdge === 'top') return 0;
  if (active.pendingEdge === 'bottom') return max;
  return scrollTop;
}

function keyboardAimsAtLog(active: Surface, key: string): boolean {
  const focused = document.activeElement;
  const focusedElement =
    focused instanceof HTMLElement
    && focused !== document.body
    && focused !== document.documentElement
      ? focused
      : null;
  if (focusedElement != null) {
    if (isTextEditing(focusedElement)) return false;
    // Space on a focused button, link or disclosure ACTIVATES it natively; the
    // arrows and paging keys scroll the nearest scroller even then.
    if (key === ' ' && isActivatedBySpace(focusedElement)) return false;
    return active.element.contains(focusedElement);
  }
  return active.keyboardOwner;
}

function isActivatedBySpace(el: HTMLElement): boolean {
  const tag = el.tagName;
  if (tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'DETAILS') return true;
  if (tag === 'A' && el.hasAttribute('href')) return true;
  const role = el.getAttribute('role');
  return role === 'button' || role === 'checkbox' || role === 'switch'
    || role === 'tab' || role === 'menuitem' || role === 'option';
}

function isTextEditing(el: HTMLElement): boolean {
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable === true) return true;
  return el.closest('[contenteditable]:not([contenteditable="false"])') != null;
}

function onPointerDown(event: Event): void {
  const active = surface;
  if (active === null) return;
  const target = event.target;
  active.keyboardOwner = target instanceof Node && active.element.contains(target);
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

/**
 * One write per frame, carrying the whole burst.
 *
 * Wheel events arrive faster than frames — a trackpad flick is a dozen of them
 * in the time the page paints twice. Writing `scrollTop` from the handler
 * would force a layout per event and make the gesture judder; batching into
 * the frame is what makes the takeover feel like scrolling rather than like
 * stepping.
 */
function scheduleApply(active: Surface): void {
  if (active.framePending) return;
  active.framePending = true;
  const handle = requestAnimationFrame(() => {
    active.framePending = false;
    active.frameHandle = null;
    applyPending(active);
  });
  // A synchronous `requestAnimationFrame` (test stubs do this) has already run
  // the callback by now, and storing the handle would leave a stale one behind
  // that blocks the next cancel. Only record it if it is still live.
  if (active.framePending) active.frameHandle = handle;
}

function cancelFrame(active: Surface): void {
  const handle = active.frameHandle;
  active.frameHandle = null;
  active.framePending = false;
  cancelAnimationFrameSafely(handle);
}

function cancelAnimationFrameSafely(handle: number | null): void {
  if (handle == null) return;
  try {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
  } catch {
    // best-effort — teardown must never propagate
  }
}

function applyPending(active: Surface): void {
  if (surface !== active || active.phase !== 'engaged') return;
  if (surfaceLost(active)) return;
  const element = active.element;

  const pending = active.pendingPx;
  const edge = active.pendingEdge;
  active.pendingPx = 0;
  active.pendingEdge = null;

  // The frame is where layout is read, and it is read fresh: the log has been
  // growing underneath this gesture if a turn is streaming, and clamping
  // against a stale extent is how a takeover would refuse to reach the bottom.
  const geometry = readGeometry(element);
  active.geometry = geometry;
  if (pending === 0 && edge === null) return;

  const max = Math.max(0, geometry.scrollHeight - geometry.clientHeight);
  // Edge first, then the steps pressed after it — and never a non-finite
  // number: both inputs are finite by construction now, and the clamp holds
  // the sum inside the layout.
  const base = edge === 'top' ? 0 : edge === 'bottom' ? max : geometry.scrollTop;
  const next = clamp(base + pending, 0, max);
  if (!Number.isFinite(next) || next === geometry.scrollTop) return;

  element.scrollTop = next;
  // Keep the cache in step with what was just written, so a wheel arriving
  // before the next frame reasons about where the log actually is.
  active.geometry = { ...geometry, scrollTop: next };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readGeometry(element: HTMLElement): ScrollGeometry {
  return {
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  };
}

function viewportPxOf(active: Surface): number {
  return active.geometry.clientHeight > 0 ? active.geometry.clientHeight : FALLBACK_VIEWPORT_PX;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// ---------------------------------------------------------------------------
// The escape hatch
// ---------------------------------------------------------------------------

/** `'0'` in storage, and nothing else, keeps this module out of the session. */
export function chatScrollTakeoverSwitchedOff(): boolean {
  try {
    return globalThis.localStorage?.getItem(CHAT_SCROLL_TAKEOVER_STORAGE_KEY) === '0';
  } catch {
    // Private mode, a blocked origin, a packaged `od:` page with storage
    // disabled — an unreadable hatch is a hatch nobody pulled.
    return false;
  }
}

/** Test-only — flush module state between cases. */
export function __resetChatScrollTakeoverForTest(): void {
  installed = false;
  unsubscribe?.();
  unsubscribe = null;
  disengage();
}
