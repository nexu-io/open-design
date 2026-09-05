// Chat-log scroll-freeze probe.
//
// What it watches for
// -------------------
// The compositor keeps its own copy of "how far this scroller scrolls", so
// a wheel can move the page without waiting on the main thread. On the
// chat log that copy can freeze at an early value and never refresh. The
// user sees a chat that will not scroll; every number JS can read says the
// chat is fine. Measured on a real machine (Chromium 146 / Electron 41):
// `scrollHeight` 2347, `clientHeight` 583, `scrollTop = 1700` assigned
// from JS took effect — yet twelve wheel notches asking for 1440px stopped
// at 91, and a notch from 800 snapped straight back to 91. 583 + 91 = 674,
// the correct ceiling for a 674px content box, so the copy went stale when
// the log was 674px tall and stayed there through a tripling of the
// content. Only destroying and rebuilding the layout box cleared it.
//
// JS cannot read the compositor's copy. It can read the symptom, and the
// symptom is fully observable: a downward wheel, room left according to
// layout, and a `scrollTop` that does not move. That is the whole design.
//
// What is deliberately absent: any repair. Toggling `display` clears the
// frozen ceiling, and doing that automatically would cost the user a flash
// plus their scroll position AND — the reason that actually decides it —
// destroy the evidence for the trigger we are trying to find. This module
// observes. Healing is a product decision, not an observability one.
//
// Cost discipline
// ---------------
// The decision logic is in `chat-scroll-freeze-detector.ts`, which touches
// nothing. This file is the only part that reads the DOM, and it reads it
// as follows:
//
//   - An event that did not come from the chat log must cost nothing and
//     must schedule nothing. This is enforced structurally, not by being
//     fast:
//       * `wheel` is listened for ON THE CHAT LOG ELEMENT once one is
//         found, so a wheel anywhere else in the app is never delivered to
//         this module at all. A global `wheel` listener exists only while
//         nothing is attached, purely so a user who wheels before anything
//         auto-scrolled still gets a probe; attaching removes it.
//       * `scroll` has to stay global — it does not bubble, and it is how
//         the log is discovered — so its bail is the first thing in the
//         handler: one identity compare, then one `isConnected` boolean.
//         No clock read, no allocation, no scheduling.
//   - NO layout is read in a listener. Reading `scrollHeight` from a wheel
//     handler forces a synchronous layout on the input path, which is the
//     jank this module exists to detect. Every geometry read happens in a
//     `requestAnimationFrame` callback instead, at most once per frame.
//   - Scroll-driven frames are throttled to one per 250ms. Auto-scroll
//     fires a scroll event per frame all through a streaming turn, and a
//     per-frame layout read during streaming is exactly the tax we refuse
//     to levy. Wheel-driven frames are not time-throttled — they are
//     bounded by the user's own gesture, and the browser is laying out for
//     the scroll anyway — because the freeze verdict needs notch
//     resolution.
//   - The compositing-layer census walks the subtree with
//     `getComputedStyle`, so it runs at most twice per chat log: once at
//     attach (only if `requestIdleCallback` exists — see
//     `scheduleAttachCensus`) and once at the freeze, where cost no longer
//     matters.
//   - Everything scheduled is cancellable, and `detach()` cancels it. A
//     probe that leaves a frame or an idle callback in flight after its
//     element is gone is a probe that runs inside somebody else's work.
//   - One report per chat log element, and a hard per-session cap.
//
// Privacy: counts, pixels, durations and fixed enums only. No message
// text, no selector, no user-authored string is read.

import type { ChatScrollFreezeProps } from '@open-design/contracts/analytics';

import { reportSafetyEvent } from '../analytics/error-tracking';
import { chatCorrelation } from './chat-context';
import {
  EDGE_TOLERANCE_PX,
  type LayerStyleProbe,
  type ScrollFreezeEvidence,
  type ScrollFreezeState,
  type ScrollGeometry,
  type ScrollLayerTrigger,
  type ScrollShapeMemo,
  classifyLayerTriggers,
  createScrollFreezeState,
  diffScrollShape,
  observeScroll,
  observeWheelBatch,
} from './chat-scroll-freeze-detector';

/**
 * The chat log is identified by the test id it already ships with. A
 * dedicated `data-od-*` marker would be cleaner, but it would also make
 * this observer depend on a component change landing first — and the bug
 * is in production now.
 */
const CHAT_LOG_SELECTOR = '[data-testid="chat-log"]';

/** Structural entries kept from the run-up. Small on purpose; read by eye. */
const MAX_TRANSITIONS = 20;
/** Minimum gap between two scroll-driven geometry reads. */
const SCROLL_SAMPLE_MIN_INTERVAL_MS = 250;
/**
 * A conversation switch remounts the log, so a session can legitimately
 * see several surfaces. Three reports is enough to establish a pattern;
 * past that we are describing the same defect repeatedly.
 */
const MAX_REPORTS_PER_SESSION = 3;
/** Element budget for the compositing-layer census. */
const MAX_LAYER_SCAN = 600;
/** `deltaMode: 1` is lines. Chromium's own line height for wheel input. */
const LINE_HEIGHT_PX = 16;

interface TransitionEntry {
  at: number;
  kind: string;
  contentPx: number;
  viewportPx: number;
}

interface Surface {
  readonly element: HTMLElement;
  readonly probeId: string;
  readonly attachedAt: number;
  state: ScrollFreezeState;
  shape: ScrollShapeMemo | null;
  geometry: ScrollGeometry | null;
  transitions: TransitionEntry[];
  /** Content height the first time the log became scrollable, if witnessed. */
  scrollableOnContentPx: number | null;
  scrollableOnAt: number | null;
  layerCountAtAttach: number | null;
  /** Wheel notches accumulated since the last frame. */
  pendingWheelPx: number;
  pendingWheelCount: number;
  /** Deepest element a pending wheel was aimed at — used to rule out inner scrollers. */
  pendingWheelTarget: Element | null;
  lastScrollSampleAt: number;
  scrollSamplePending: boolean;
  framePending: boolean;
  /** In-flight `requestAnimationFrame` handle, so `detach()` can cancel it. */
  frameHandle: number | null;
  idlePending: boolean;
  /** In-flight `requestIdleCallback` handle, so `detach()` can cancel it. */
  idleHandle: number | null;
  reported: boolean;
  resizeObserver: ResizeObserver | null;
}

let surface: Surface | null = null;
let installed = false;
/**
 * Whether the global wheel listener is currently registered. It is armed
 * ONLY while no chat log is attached; see the cost-discipline note above.
 */
let wheelDiscoveryArmed = false;
let reportedThisSession = 0;

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

export function installChatScrollFreezeObserver(): () => void {
  if (installed) return () => undefined;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }
  installed = true;

  document.addEventListener('scroll', onScrollCapture, { capture: true, passive: true });
  armWheelDiscovery();

  return () => {
    document.removeEventListener('scroll', onScrollCapture, { capture: true });
    // `installed` goes false BEFORE `detach()`, because detaching re-arms
    // wheel discovery and we are trying to take everything down.
    installed = false;
    disarmWheelDiscovery();
    detach();
  };
}

function armWheelDiscovery(): void {
  if (!installed || wheelDiscoveryArmed) return;
  window.addEventListener('wheel', onWheelDiscover, { capture: true, passive: true });
  wheelDiscoveryArmed = true;
}

function disarmWheelDiscovery(): void {
  if (!wheelDiscoveryArmed) return;
  window.removeEventListener('wheel', onWheelDiscover, { capture: true });
  wheelDiscoveryArmed = false;
}

// ---------------------------------------------------------------------------
// Listeners — no layout reads live below this line
// ---------------------------------------------------------------------------

/**
 * Scroll is how the probe finds its element.
 *
 * The chat log auto-scrolls to the newest message, so it emits a scroll
 * event within a frame of becoming scrollable — which is precisely the
 * transition we most want in the ring buffer. Discovering the element this
 * way costs nothing, where a `MutationObserver` over the body subtree
 * would fire on every streamed token.
 */
function onScrollCapture(event: Event): void {
  const active = surface;
  if (active !== null) {
    const target = event.target;
    if (target !== active.element) {
      // THE HOT PATH: every scroll anywhere in the app that is not ours.
      // One identity compare, then one boolean. No clock read, no
      // allocation, nothing scheduled. The `isConnected` check is here and
      // not earlier because a conversation switch replaces the chat log
      // node, and an old node left attached would silently block discovery
      // of its replacement — the probe would look installed and be deaf.
      if (active.element.isConnected) return;
      detach();
      discover(target);
      return;
    }
    if (active.reported) return;
    active.scrollSamplePending = true;
    const at = now();
    if (at - active.lastScrollSampleAt < SCROLL_SAMPLE_MIN_INTERVAL_MS) return;
    scheduleFrame(active);
    return;
  }
  discover(event.target);
}

function discover(target: EventTarget | null): void {
  if (!(target instanceof Element)) return;
  if (!matchesChatLog(target)) return;
  attach(target as HTMLElement);
}

/**
 * Global wheel listener, armed ONLY while no chat log is attached.
 *
 * It exists for one case: a user who wheels before anything auto-scrolled,
 * who would otherwise never be probed. The moment a log is found this
 * listener is removed and wheels are delivered by the element instead, so
 * the steady state is that a wheel outside the chat log never reaches this
 * module.
 */
function onWheelDiscover(event: WheelEvent): void {
  if (surface !== null) return;
  const deltaY = event.deltaY;
  if (!Number.isFinite(deltaY) || deltaY === 0) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const element = target.closest(CHAT_LOG_SELECTOR);
  if (element == null) return;
  const active = attach(element as HTMLElement);
  if (active == null) return;
  ingestWheel(active, event);
}

/**
 * Wheel listener on the chat log itself. Capture phase, so it sees wheels
 * aimed at descendants before any app handler can stop them — and because
 * the event reached us at all, no containment test is needed.
 */
function onSurfaceWheel(event: WheelEvent): void {
  const active = surface;
  if (active === null || active.reported) return;
  // `detach()` removes this listener, so a superseded element should never
  // reach here — but if it ever did, its wheels would be attributed to the
  // wrong surface, which is worse than missing them.
  if (event.currentTarget !== active.element) return;
  const deltaY = event.deltaY;
  if (!Number.isFinite(deltaY) || deltaY === 0) return;
  ingestWheel(active, event);
}

function ingestWheel(active: Surface, event: WheelEvent): void {
  active.pendingWheelPx += normaliseDeltaPx(event.deltaY, event.deltaMode, active);
  active.pendingWheelCount += 1;
  const target = event.target;
  active.pendingWheelTarget = target instanceof Element ? target : null;
  scheduleFrame(active);
}

/**
 * Wheel deltas arrive in pixels, lines or pages depending on the device
 * and the OS. Normalising here — with the CACHED viewport height, never a
 * fresh one — keeps the detector working in a single unit without putting
 * a layout read on the input path.
 */
function normaliseDeltaPx(deltaY: number, deltaMode: number, active: Surface): number {
  if (deltaMode === 1) return deltaY * LINE_HEIGHT_PX;
  if (deltaMode === 2) return deltaY * (active.geometry?.clientHeight ?? 800);
  return deltaY;
}

function matchesChatLog(el: Element): boolean {
  try {
    return el.matches(CHAT_LOG_SELECTOR);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Attach / detach
// ---------------------------------------------------------------------------

function attach(element: HTMLElement): Surface | null {
  if (reportedThisSession >= MAX_REPORTS_PER_SESSION) return null;
  detach();
  const active: Surface = {
    element,
    probeId: randomProbeId(),
    attachedAt: now(),
    state: createScrollFreezeState(),
    shape: null,
    geometry: null,
    transitions: [],
    scrollableOnContentPx: null,
    scrollableOnAt: null,
    layerCountAtAttach: null,
    pendingWheelPx: 0,
    pendingWheelCount: 0,
    pendingWheelTarget: null,
    lastScrollSampleAt: Number.NEGATIVE_INFINITY,
    scrollSamplePending: true,
    framePending: false,
    frameHandle: null,
    idlePending: false,
    idleHandle: null,
    reported: false,
    resizeObserver: null,
  };
  surface = active;

  // Wheels now arrive from the element, so the global listener comes off:
  // from here on a wheel anywhere else in the app is not delivered to this
  // module at all.
  disarmWheelDiscovery();
  element.addEventListener('wheel', onSurfaceWheel, { capture: true, passive: true });

  // A viewport change is the other input to the ceiling, and scroll events
  // never report one. One observer on one element is close to free.
  if (typeof ResizeObserver !== 'undefined') {
    try {
      const observer = new ResizeObserver(() => {
        if (surface !== active || active.reported) return;
        active.scrollSamplePending = true;
        scheduleFrame(active);
      });
      observer.observe(element);
      active.resizeObserver = observer;
    } catch {
      active.resizeObserver = null;
    }
  }

  scheduleAttachCensus(active);
  scheduleFrame(active);
  return active;
}

function detach(): void {
  const active = surface;
  surface = null;
  if (active == null) {
    armWheelDiscovery();
    return;
  }
  active.element.removeEventListener('wheel', onSurfaceWheel, { capture: true });
  cancelFrame(active);
  cancelAttachCensus(active);
  active.pendingWheelTarget = null;
  try {
    active.resizeObserver?.disconnect();
  } catch {
    // best-effort — teardown must never propagate
  }
  active.resizeObserver = null;
  armWheelDiscovery();
}

// ---------------------------------------------------------------------------
// The one place geometry is read
// ---------------------------------------------------------------------------

function scheduleFrame(active: Surface): void {
  if (active.framePending) return;
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
  // No fallback. Sampling geometry on a timer — or worse, inline from the
  // handler that asked for it — puts a layout read in the middle of
  // whatever else the page is doing. Where the browser has no frame
  // callback, this probe simply does not observe.
  if (raf == null) return;
  active.framePending = true;
  const handle = raf(() => {
    active.framePending = false;
    active.frameHandle = null;
    runFrame(active);
  });
  // A synchronous `requestAnimationFrame` (test stubs do this) has already
  // run the callback by now, and storing the handle would leave a stale one
  // behind that blocks the next cancel. Only record it if it is still live.
  if (active.framePending) active.frameHandle = handle;
}

function cancelFrame(active: Surface): void {
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

function runFrame(active: Surface): void {
  active.framePending = false;
  if (surface !== active) return;
  if (!active.element.isConnected) {
    // The log was remounted (conversation switch, tab toggle). The next
    // scroll re-discovers the replacement; a stale element would report
    // geometry nobody is looking at.
    detach();
    return;
  }

  const at = now();
  const geometry: ScrollGeometry = {
    scrollTop: active.element.scrollTop,
    scrollHeight: active.element.scrollHeight,
    clientHeight: active.element.clientHeight,
  };
  active.geometry = geometry;
  recordShape(active, geometry, at);

  const wheelCount = active.pendingWheelCount;
  const wheelPx = active.pendingWheelPx;
  const wheelTarget = active.pendingWheelTarget;
  active.pendingWheelCount = 0;
  active.pendingWheelPx = 0;
  active.pendingWheelTarget = null;

  if (active.scrollSamplePending) {
    active.scrollSamplePending = false;
    active.lastScrollSampleAt = at;
  }

  if (wheelCount === 0) {
    active.state = observeScroll(active.state, geometry);
    return;
  }

  const result = observeWheelBatch(active.state, {
    geometry,
    requestedPx: wheelPx,
    wheelCount,
  });
  active.state = result.state;
  if (result.verdict.kind !== 'frozen') return;

  // Last gate before reporting, and the expensive one — so it runs only
  // here. If a scrollable box between the wheel target and the chat log
  // still had travel in the requested direction, the chat log was never
  // asked to move and this is not our defect. Every code block and
  // tool-output box in a transcript is such a box.
  const innerScrollerCount = countAbsorbingScrollers(active.element, wheelTarget);
  if (innerScrollerCount > 0) {
    // Clear the streak as well as the verdict. Leaving it at the threshold
    // would re-run this ancestor walk — which does read layout — on every
    // single frame for as long as the user keeps scrolling that inner box.
    active.state = {
      ...active.state,
      reported: false,
      stallAt: null,
      stallWheelCount: 0,
      stallRequestedPx: 0,
    };
    return;
  }

  report(active, geometry, result.verdict.evidence, innerScrollerCount, at);
}

function recordShape(active: Surface, geometry: ScrollGeometry, at: number): void {
  const { memo, transitions } = diffScrollShape(active.shape, geometry);
  const first = active.shape == null;
  active.shape = memo;
  if (first) {
    pushTransition(active, 'probe_attach', geometry, at);
    return;
  }
  for (const kind of transitions) {
    if (kind === 'scrollable_on' && active.scrollableOnContentPx == null) {
      active.scrollableOnContentPx = geometry.scrollHeight;
      active.scrollableOnAt = at;
    }
    pushTransition(active, kind, geometry, at);
  }
}

function pushTransition(
  active: Surface,
  kind: string,
  geometry: ScrollGeometry,
  at: number,
): void {
  active.transitions.push({
    at: Math.round(at - active.attachedAt),
    kind,
    contentPx: geometry.scrollHeight,
    viewportPx: geometry.clientHeight,
  });
  if (active.transitions.length > MAX_TRANSITIONS) active.transitions.shift();
}

/**
 * Scrollable boxes between the wheel target and the chat log that still
 * had travel in the downward direction.
 *
 * Anything above zero means the wheel had a legitimate consumer and the
 * chat log's stillness proves nothing. Zero is the finding the user
 * established by hand on the real failure ("inner scroll boxes stayed at 0
 * throughout"), so the report carries it as evidence rather than dropping
 * it.
 */
function countAbsorbingScrollers(root: HTMLElement, target: Element | null): number {
  if (target == null || target === root) return 0;
  let count = 0;
  let node: Element | null = target;
  while (node != null && node !== root) {
    const el = node as HTMLElement;
    if (el.scrollHeight - el.clientHeight > EDGE_TOLERANCE_PX) {
      if (el.scrollHeight - el.clientHeight - el.scrollTop > EDGE_TOLERANCE_PX) count += 1;
    }
    node = el.parentElement;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Compositing-layer census
// ---------------------------------------------------------------------------

function readLayerStyle(el: Element): LayerStyleProbe {
  const style = getComputedStyle(el) as CSSStyleDeclaration & { backdropFilter?: string };
  return {
    willChange: style.willChange,
    transform: style.transform,
    filter: style.filter,
    backdropFilter: style.backdropFilter ?? style.getPropertyValue('backdrop-filter'),
    contain: style.contain,
    perspective: style.perspective,
  };
}

function scanLayerTriggers(root: HTMLElement): {
  count: number;
  kinds: Set<ScrollLayerTrigger>;
  truncated: boolean;
} {
  const kinds = new Set<ScrollLayerTrigger>();
  let count = 0;
  let truncated = false;
  try {
    const all = root.getElementsByTagName('*');
    const limit = Math.min(all.length, MAX_LAYER_SCAN);
    truncated = all.length > MAX_LAYER_SCAN;
    for (let i = 0; i < limit; i += 1) {
      const el = all[i];
      if (el == null) continue;
      const found = classifyLayerTriggers(readLayerStyle(el));
      if (found.length === 0) continue;
      count += 1;
      for (const kind of found) kinds.add(kind);
    }
  } catch {
    // A census failure must never suppress the report it decorates.
  }
  return { count, kinds, truncated };
}

/**
 * The ancestor chain matters as much as the subtree: a `transform` or
 * `filter` above the scroller changes what the compositor builds around
 * it. The chain is a dozen elements, so this is cheap even at report time.
 */
function scanAncestorLayerTriggers(root: HTMLElement): Set<ScrollLayerTrigger> {
  const kinds = new Set<ScrollLayerTrigger>();
  try {
    let node: HTMLElement | null = root.parentElement;
    while (node != null) {
      for (const kind of classifyLayerTriggers(readLayerStyle(node))) kinds.add(kind);
      node = node.parentElement;
    }
  } catch {
    // best-effort
  }
  return kinds;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function report(
  active: Surface,
  geometry: ScrollGeometry,
  evidence: ScrollFreezeEvidence,
  innerScrollerCount: number,
  at: number,
): void {
  if (active.reported) return;
  active.reported = true;
  reportedThisSession += 1;

  const census = scanLayerTriggers(active.element);
  const ancestors = scanAncestorLayerTriggers(active.element);
  const runtime = readRuntimeIdentity();

  const props: ChatScrollFreezeProps = {
    ...chatCorrelation(),
    // Not cast: the detector's trigger union and the contract's are the
    // same literals, so a divergence must fail typecheck rather than be
    // waved through.
    trigger: evidence.trigger,
    probe_id: active.probeId,

    scroll_top: Math.round(geometry.scrollTop),
    scroll_height: Math.round(geometry.scrollHeight),
    client_height: Math.round(geometry.clientHeight),
    ceiling_scroll_top: Math.round(evidence.ceilingScrollTop),
    max_scroll_top_seen: Math.round(evidence.maxScrollTopSeen),
    layout_max_scroll_top: Math.round(evidence.layoutMaxScrollTop),
    unreachable_px: Math.round(evidence.unreachablePx),

    compositor_content_px: Math.round(evidence.compositorContentPx),
    layout_content_px: Math.round(evidence.layoutContentPx),

    wheel_count: evidence.wheelCount,
    wheel_requested_px: Math.round(evidence.requestedPx),
    inner_scroller_count: innerScrollerCount,

    surface_age_ms: Math.round(at - active.attachedAt),
    transitions: serialiseTransitions(active.transitions),
    ...(active.scrollableOnContentPx != null
      ? { content_px_at_scrollable_on: Math.round(active.scrollableOnContentPx) }
      : {}),
    ...(active.scrollableOnAt != null
      ? { scrollable_since_ms: Math.round(at - active.scrollableOnAt) }
      : {}),

    ...(active.layerCountAtAttach != null
      ? { layer_count_at_attach: active.layerCountAtAttach }
      : {}),
    layer_count_now: census.count,
    layer_kinds_now: [...census.kinds].join(','),
    layer_scan_truncated: census.truncated,
    ancestor_layer_kinds: [...ancestors].join(','),

    streaming: hasMarker(active.element, '[data-streaming="true"]'),
    question_form_pending: hasMarker(
      active.element,
      '[data-testid="question-form-loading"]',
    ),
    message_row_count: active.element.children.length,
    visibility_state:
      typeof document !== 'undefined' ? document.visibilityState : 'unknown',
    ...runtime,
  };

  reportSafetyEvent('client_chat_scroll_frozen', { ...props });
}

/**
 * `at@kind:content/viewport`, oldest first. Deliberately a flat string:
 * this trail is read by a human looking at one bad event and never
 * aggregated, and a string survives PostHog's property inspector intact
 * where an array of objects becomes a chore to unfold.
 */
function serialiseTransitions(entries: TransitionEntry[]): string {
  return entries
    .map((entry) => `${entry.kind}@${entry.at}:c${entry.contentPx}/v${entry.viewportPx}`)
    .join(',');
}

function hasMarker(root: HTMLElement, selector: string): boolean {
  try {
    return root.querySelector(selector) != null;
  } catch {
    return false;
  }
}

/**
 * Engine identity, parsed rather than passed through whole. The defect is
 * a compositor behaviour, so the Chromium build number is the field that
 * decides whether an upstream fix explains a change in volume.
 */
interface RuntimeIdentity {
  packaged: boolean;
  device_pixel_ratio?: number;
  chromium_version?: string;
  electron_version?: string;
}

function readRuntimeIdentity(): RuntimeIdentity {
  const out: RuntimeIdentity = {
    packaged: typeof location !== 'undefined' && location.protocol === 'od:',
  };
  try {
    if (typeof devicePixelRatio === 'number') out.device_pixel_ratio = devicePixelRatio;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const chromium = /Chrome\/([\d.]+)/.exec(ua)?.[1];
    if (chromium != null) out.chromium_version = chromium;
    const electron = /Electron\/([\d.]+)/.exec(ua)?.[1];
    if (electron != null) out.electron_version = electron;
  } catch {
    // best-effort
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function randomProbeId(): string {
  try {
    const uuid = (globalThis.crypto as { randomUUID?: () => string } | undefined)
      ?.randomUUID?.();
    if (typeof uuid === 'string') return uuid.slice(0, 8);
  } catch {
    // fall through
  }
  return Math.random().toString(36).slice(2, 10);
}

interface IdleScheduler {
  requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

/**
 * The attach-time compositing-layer baseline, and the reason it has NO
 * fallback.
 *
 * This callback is `scanLayerTriggers`, which calls `getComputedStyle` on
 * up to `MAX_LAYER_SCAN` elements. It is reached from `attach()`, which is
 * reached from a scroll handler. An earlier version of this file copied
 * `chat-health.ts`'s "run inline when `requestIdleCallback` is missing"
 * rule — but that rule is only safe there because it sits on a 60-second
 * timer. Here it meant that on any engine without rIC (Safari < 16.4,
 * jsdom) the very first scroll of a chat log resolved 600 elements' styles
 * synchronously inside the scroll handler, which is precisely the jank
 * this module claims not to cause.
 *
 * A `setTimeout` fallback is no better: it just lands the same walk in the
 * middle of unrelated work. So where the browser cannot tell us it is
 * idle, we skip the baseline. `layer_count_at_attach` is then absent,
 * which is the correct outcome — absent rather than expensive, and absent
 * rather than fabricated.
 */
function scheduleAttachCensus(active: Surface): void {
  const scheduler = globalThis as unknown as IdleScheduler;
  const rIC = scheduler.requestIdleCallback;
  if (typeof rIC !== 'function') return;
  active.idlePending = true;
  const handle = rIC(
    () => {
      active.idlePending = false;
      active.idleHandle = null;
      if (surface !== active) return;
      active.layerCountAtAttach = scanLayerTriggers(active.element).count;
    },
    { timeout: 2_000 },
  );
  if (active.idlePending) active.idleHandle = handle;
}

function cancelAttachCensus(active: Surface): void {
  const handle = active.idleHandle;
  active.idleHandle = null;
  active.idlePending = false;
  if (handle == null) return;
  try {
    const cancel = (globalThis as unknown as IdleScheduler).cancelIdleCallback;
    if (typeof cancel === 'function') cancel(handle);
  } catch {
    // best-effort — teardown must never propagate
  }
}

/** Test-only — flush module state between cases. */
export function __resetChatScrollFreezeForTest(): void {
  if (typeof document !== 'undefined') {
    document.removeEventListener('scroll', onScrollCapture, { capture: true });
  }
  installed = false;
  disarmWheelDiscovery();
  detach();
  reportedThisSession = 0;
}
