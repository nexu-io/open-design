// Answering the wheel from JavaScript, once the compositor stops answering it.
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
// healthy, and the wheel path is not. So this module does the obvious thing
// with that pair — it takes the wheel input, cancels the default (which would
// do nothing anyway) and moves the log by assignment instead.
//
// What this is NOT
// ----------------
// It is not the self-heal that was considered and rejected. That one destroyed
// and rebuilt the layout box (`display: none` → `flex`), which does clear the
// stale ceiling, and costs a flash, the user's scroll position, and the
// evidence for whatever caused the freeze. Nothing here touches layout, styles
// or the element's identity; the frozen box stays exactly as it was, still
// reporting itself to the probe, and only the input path is routed around.
//
// Why it ships switched off
// -------------------------
// The takeover is downstream of a detector that has never been checked against
// the real world. `client_chat_scroll_frozen` has produced zero production
// events since it landed — and that zero turned out to be a reporting bug (a
// clipped box counted as a scrollable inner box and swallowed the report),
// not evidence that the detector never misfires. Its false-positive rate is
// therefore unknown.
//
// Changing how scrolling feels for every user, on the word of an unvalidated
// detector, is the wrong order to do this in. One false positive costs that
// user native scrolling — momentum, the compositor's own interpolation,
// scroll chaining — with no way to tell what happened. So: a `localStorage`
// switch, the same `open-design:` convention the write trace uses, read once
// at boot. Off, nothing subscribes and nothing is registered.
//
// How it comes off
// ----------------
// It disengages when the freeze probe releases the surface — which happens
// when the chat log node stops being the one the probe attached to. In
// `ChatPane` that means leaving the chat tab (the whole `.chat-log-wrap` is
// conditionally rendered on `tab === 'chat'`) or the panel unmounting.
// Switching CONVERSATION does not do it: that div carries no conversation key,
// so React reuses the same node. Whether the compositor's stale ceiling
// survives a conversation switch is unknown — the only recovery ever observed
// is the layout box being destroyed and rebuilt — so staying engaged there is
// the conservative reading, and the honest statement is that a session can sit
// in the takeover longer than it strictly needs to.
//
// There is deliberately no periodic "has native scrolling recovered yet?"
// probe. Letting one notch through every couple of seconds would risk exactly
// the symptom the takeover exists to hide: on a frozen surface a native
// downward notch does not merely fail, it throws the log BACKWARDS onto the
// stale ceiling. That is a visible jump, paid repeatedly, to detect an
// in-place recovery that has never once been observed.

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
// the user back to the bottom mid-gesture.
//
// The one writer that could fight is that bottom-pin, and it cannot be live
// here by construction: pinning uses the JS write path, which is healthy during
// this defect, so a following log is a log sitting at its bottom — and a log at
// its bottom has no unreachable content, which is a precondition of the freeze
// verdict this module waits for. Reasoned rather than measured; see the handoff
// notes.

import {
  type ChatScrollFreezeSignal,
  absorbsWheelInDirection,
  subscribeChatScrollFreeze,
} from '../observability/chat-scroll-freeze';
import {
  type ScrollGeometry,
  wheelDeltaToPx,
} from '../observability/chat-scroll-freeze-detector';

/**
 * The switch. `'1'` arms the takeover at the next boot; anything else,
 * including absence, leaves every wheel to the browser.
 *
 * Read once, at install, exactly like `SCROLL_WRITE_TRACE_STORAGE_KEY`:
 * flipping it takes effect on reload, which is the right granularity for
 * something that changes input handling for a whole session. To turn it on:
 *
 *   localStorage.setItem('open-design:chat-scroll-takeover', '1')  // then reload
 */
export const CHAT_SCROLL_TAKEOVER_STORAGE_KEY = 'open-design:chat-scroll-takeover';

/**
 * Capture, so a handler inside the transcript cannot stop the event before we
 * see it; NOT passive, because cancelling the default is the entire mechanism.
 * This is the only non-passive listener in the chat scroll path, and it exists
 * only while a surface is engaged.
 */
const WHEEL_LISTEN_OPTIONS = { capture: true, passive: false } as const;
const WHEEL_UNLISTEN_OPTIONS = { capture: true } as const;

/** Viewport height assumed for a page-mode wheel before the first frame lands. */
const FALLBACK_VIEWPORT_PX = 800;

interface Engaged {
  readonly element: HTMLElement;
  readonly probeId: string;
  /** Wheel pixels accumulated since the last applied frame. */
  pendingPx: number;
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
}

let engaged: Engaged | null = null;
let unsubscribe: (() => void) | null = null;
let installed = false;

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/**
 * Subscribe to the freeze probe — or, when the switch is off, do nothing at
 * all and say so by returning a no-op.
 *
 * "Nothing at all" is load-bearing and is pinned by a spec: no listener, no
 * timer, no frame, no subscription. A user who has not opted in must not be
 * able to tell this module exists.
 */
export function installChatScrollTakeover(): () => void {
  if (installed) return () => undefined;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }
  if (!chatScrollTakeoverFlagSet()) return () => undefined;
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
    engage(signal.element, signal.probeId, signal.geometry);
    return;
  }
  // The probe let go of this element — remount, conversation switch, its own
  // teardown. Whatever we hung on it comes off with it.
  if (engaged?.element === signal.element) disengage();
}

// ---------------------------------------------------------------------------
// Engage / disengage
// ---------------------------------------------------------------------------

function engage(element: HTMLElement, probeId: string, geometry: ScrollGeometry): void {
  if (engaged?.element === element) return;
  disengage();
  engaged = {
    element,
    probeId,
    pendingPx: 0,
    framePending: false,
    frameHandle: null,
    geometry,
  };
  element.addEventListener('wheel', onWheelCapture, WHEEL_LISTEN_OPTIONS);
}

function disengage(): void {
  const active = engaged;
  engaged = null;
  if (active == null) return;
  active.element.removeEventListener('wheel', onWheelCapture, WHEEL_UNLISTEN_OPTIONS);
  cancelFrame(active);
  active.pendingPx = 0;
}

/** Whether a surface is currently being driven from JavaScript. */
export function chatScrollTakeoverEngaged(): boolean {
  return engaged !== null;
}

// ---------------------------------------------------------------------------
// The wheel
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
  const active = engaged;
  if (active === null) return;
  // Disengaging removes this listener, so a superseded element should never
  // arrive here — but if one ever did, moving it would be moving the wrong
  // log.
  if (event.currentTarget !== active.element) return;

  // ctrl+wheel is pinch-to-zoom on a trackpad and browser zoom on a mouse.
  // Consuming it would take page zoom away from the user; meta is left alone
  // for the same reason.
  if (event.ctrlKey || event.metaKey) return;

  const deltaY = event.deltaY;
  if (!Number.isFinite(deltaY) || deltaY === 0) return;
  const viewportPx = active.geometry.clientHeight > 0
    ? active.geometry.clientHeight
    : FALLBACK_VIEWPORT_PX;
  const px = wheelDeltaToPx(deltaY, event.deltaMode, viewportPx);
  if (px === 0) return;

  const travel = Math.max(0, active.geometry.scrollHeight - active.geometry.clientHeight);
  // Where the log will be once the pending burst lands, not where it was: at
  // speed a flick delivers several notches before any of them are applied, and
  // reasoning from the pre-burst position would keep claiming travel that the
  // earlier notches in the same frame already spent.
  const projectedTop = clamp(active.geometry.scrollTop + active.pendingPx, 0, travel);
  const remaining = travel <= 0 ? 0 : px > 0 ? travel - projectedTop : projectedTop;
  if (remaining <= 0) {
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
function scheduleApply(active: Engaged): void {
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

function cancelFrame(active: Engaged): void {
  const handle = active.frameHandle;
  active.frameHandle = null;
  active.framePending = false;
  if (handle == null) return;
  try {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
  } catch {
    // best-effort — teardown must never propagate
  }
}

function applyPending(active: Engaged): void {
  if (engaged !== active) return;
  const element = active.element;
  if (!element.isConnected) return;

  const pending = active.pendingPx;
  active.pendingPx = 0;

  // The frame is where layout is read, and it is read fresh: the log has been
  // growing underneath this gesture if a turn is streaming, and clamping
  // against a stale extent is how a takeover would refuse to reach the bottom.
  const geometry: ScrollGeometry = {
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  };
  active.geometry = geometry;
  if (pending === 0) return;

  const max = Math.max(0, geometry.scrollHeight - geometry.clientHeight);
  const next = clamp(geometry.scrollTop + pending, 0, max);
  if (next === geometry.scrollTop) return;

  element.scrollTop = next;
  // Keep the cache in step with what was just written, so a wheel arriving
  // before the next frame reasons about where the log actually is.
  active.geometry = { ...geometry, scrollTop: next };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// The switch
// ---------------------------------------------------------------------------

export function chatScrollTakeoverFlagSet(): boolean {
  try {
    return globalThis.localStorage?.getItem(CHAT_SCROLL_TAKEOVER_STORAGE_KEY) === '1';
  } catch {
    // Private mode, a blocked origin, a packaged `od:` page with storage
    // disabled — an unreadable switch is an off switch.
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
