// Chat-log scroll-freeze probe.
//
// What it watches for
// -------------------
// The compositor keeps its own copy of "how far this scroller scrolls", so
// a wheel can move the page without waiting on the main thread. On the
// chat log that copy stops tracking layout. The user sees a chat that will
// not scroll; every number JS can read says the chat is fine. Measured on
// a real machine (Chromium 146 / Electron 41): `scrollHeight` 2347,
// `clientHeight` 583, `scrollTop = 1700` assigned from JS took effect —
// yet twelve wheel notches asking for 1440px stopped at 91, and a notch
// from 800 snapped straight back to 91. Only destroying and rebuilding the
// layout box cleared it.
//
// It does not snap. It DRIFTS. A later capture from a user's machine, with
// layout steady at 851px of travel, caught six consecutive rounds:
//
//   reached 851 → short 0     reached 842 → short 9
//   reached 850 → short 1     reached 839 → short 12
//   reached 846 → short 5     reached 824 → short 27  ← reported
//
// The copy falls a little further behind on each content change and the
// deficit accumulates; the 91 / 1673px case is the same mechanism run to
// the floor. That capture also cleared the decorations — no thinking
// block, no tool row, no question form, no error card, no iframe, no inner
// scroller, just one user message and one 1188px assistant message — so
// the question worth instrumenting is not "what was on screen" but "which
// content change did the compositor first fail to keep up with".
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
//     probe that leaves a frame, an idle callback, an observer or a
//     listener in flight after its element is gone is a probe that runs
//     inside somebody else's work.
//   - One report per chat log element, and a hard per-session cap.
//
// Parallel activity
// -----------------
// The geometry above dates the freeze. It cannot say what ELSE was moving
// at that instant, and after 225 synthetic reproduction attempts that is
// the only lead left. So the probe also keeps a bounded ring buffer of
// structural events around the scroller — see "Parallel activity" below
// for the exact watch list and what it deliberately does not cover. The
// same discipline applies with no exceptions: those callbacks read no
// layout, resolve no computed style, schedule no frame, and every one of
// them is taken down by `detach()`.
//
// Its per-event cost is two `getAttribute` calls, an enum lookup and one
// ring-buffer slot; the buffer is 64 entries and evicts the oldest, so a
// busy surface costs a bounded amount of memory rather than a growing one.
//
// The shortfall ledger
// --------------------
// The drift above is what the report is really for, so every content-height
// change is paired with the furthest a downward wheel could actually get,
// and the first round where those two diverge is kept forever. Both halves
// are computed inside the frame callback that already read the geometry, so
// they add no layout pass. The one new read is `offsetHeight` on the chat
// log's children, to say WHICH child grew — bounded to the last
// `MAX_CHILD_HEIGHT_SCAN` of them and taken only on a frame where the
// content height actually moved, so a settled transcript costs nothing.
//
// Privacy: counts, pixels, durations and fixed enums only. No message
// text, no selector, no user-authored string is read. Class names and test
// ids ARE read — to derive a role enum, which is the only thing reported.

import type { ChatScrollFreezeProps } from '@open-design/contracts/analytics';

import { reportSafetyEvent } from '../analytics/error-tracking';
import { chatCorrelation } from './chat-context';
import {
  ACTIVITY_NEAR_WINDOW_MS,
  ACTIVITY_PRE_FREEZE_MS,
  type ChatActivityKind,
  type ChatActivityLog,
  type ChatActivityRole,
  EDGE_TOLERANCE_PX,
  FREEZE_REQUESTED_PX,
  FREEZE_WHEEL_COUNT,
  type FirstShortfall,
  type LayerStyleProbe,
  MIN_UNREACHABLE_PX,
  SNAP_BACK_MIN_PX,
  type ScrollFreezeEvidence,
  type ScrollFreezeState,
  type ScrollGeometry,
  type ScrollLayerTrigger,
  type ScrollShapeMemo,
  type ShortfallLedger,
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
} from './chat-scroll-freeze-detector';
import {
  type ReportBlocker,
  type SnapBackRoute,
  describeSnapBackRoute,
  evaluateReportBlockers,
  summariseBlockers,
} from './chat-scroll-freeze-blockers';
import {
  type ScrollWriteRecord,
  armScrollWriteTrace,
  clearScrollWrites,
  disarmScrollWriteTrace,
  isScrollWriteTraceArmed,
  listScrollWrites,
  scrollWriteTraceFlagSet,
  scrollWriteTraceStats,
  setScrollWriteTraceFlag,
} from './chat-scroll-write-trace';

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

/**
 * The two moving parts beside the scroller, by the markers they already
 * ship. Same reasoning as `CHAT_LOG_SELECTOR`: a dedicated `data-od-*`
 * attribute would be cleaner and would also make this observer wait on a
 * component change, and the bug is in production now.
 */
const FLOAT_SLOT_TESTID = 'chat-bottom-float-slot';
const FLOAT_SLOT_CLASS = 'chat-bottom-float-slot';
const JUMP_BTN_TESTID = 'chat-jump-btn';
const JUMP_BTN_CLASS = 'chat-jump-btn';
/** The class the jump button carries only while it is visible. */
const JUMP_ACTIVE_CLASS = 'chat-jump-btn-active';

/**
 * Only these two attributes are watched, on every watched element. `class`
 * and `style` are where a layout-affecting change shows up; watching
 * everything would put this observer on the receiving end of every
 * `aria-*` and `data-*` update React makes.
 */
const WATCHED_ATTRIBUTES = ['class', 'style'];
/** How far up the ancestor chain attribute changes are worth watching. */
const MAX_ANCESTOR_WATCH = 20;
/**
 * Node budget for locating the float slot and the jump button. A BFS from
 * the chat log's siblings, never entering the chat log itself — the whole
 * point is to avoid walking a transcript.
 */
const PART_SCAN_BUDGET = 64;

/**
 * Direct children of the chat log measured when the content height moves.
 *
 * The TAIL of the list, not the whole thing: growth happens at the bottom
 * (the streaming assistant message and the tail spacer), and a transcript
 * can be thousands of rows. Bounding the scan makes the cost independent of
 * conversation length.
 */
const MAX_CHILD_HEIGHT_SCAN = 32;

/** Motion events worth a slot. `animationiteration` is deliberately absent. */
const MOTION_KIND: Readonly<Record<string, ChatActivityKind>> = {
  animationstart: 'anim_start',
  animationend: 'anim_end',
  transitionstart: 'trans_start',
  transitionend: 'trans_end',
};
const MOTION_EVENTS = Object.keys(MOTION_KIND);
/** Every listener this module adds. Capture so nothing can stop it; passive so it cannot block. */
const LISTEN_OPTIONS = { capture: true, passive: true } as const;
const UNLISTEN_OPTIONS = { capture: true } as const;

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
  /**
   * Frozen verdicts the inner-scroller gate threw away.
   *
   * Incremented only inside that gate's own branch, which has just walked an
   * ancestor chain reading layout — so this costs nothing measurable and it
   * is the ONLY record that the probe saw a freeze and chose silence. Without
   * it, suppression and "no defect ever happened" are the same observation.
   */
  innerScrollerSuppressions: number;
  resizeObserver: ResizeObserver | null;

  // -- parallel activity ----------------------------------------------------
  /** What else was moving. Bounded ring buffer; see the detector. */
  activity: ChatActivityLog;
  /** The chat log's parent — the box siblings mount into. */
  shell: HTMLElement | null;
  /** Ancestors whose `class`/`style` are watched. Identity set, for dispatch. */
  ancestors: Set<Element>;
  /** The bottom float slot, where the jump button and the plan pill swap. */
  floatHost: HTMLElement | null;
  /** The jump button as currently mounted. Replaced wholesale on a swap. */
  jumpButton: HTMLElement | null;
  jumpActive: boolean;
  /** It was already lit when the probe arrived — so we never witnessed it appear. */
  jumpActiveAtAttach: boolean;
  /** Clock reading the first time we SAW it light up. */
  jumpFirstActiveAt: number | null;
  /** Latest known value of the streaming flag inside the log. */
  streamingOn: boolean;
  structureObserver: MutationObserver | null;
  streamObserver: MutationObserver | null;
  /** Resizes of the box that gives the log its height. */
  hostResizeObserver: ResizeObserver | null;
  /** `offsetParent` forces layout, so it is resolved once, inside a frame. */
  hostResolved: boolean;

  // -- the shortfall ledger -------------------------------------------------
  /** Content changes paired with how far the wheel could actually reach. */
  ledger: ShortfallLedger;
  /**
   * `scrollHeight` at the last sample — EVERY change, unlike
   * `shape.contentPx`, which only advances in 200px steps.
   */
  lastContentPx: number | null;
  /** Per-child heights from the previous measured frame. Weak, so it cannot leak. */
  childHeights: WeakMap<Element, number>;
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
  // One object, published once. No listener, no timer, no observer, and
  // nothing computed: the handle does all of its work on the stack of
  // whoever calls it, so a session that never calls it pays for this line
  // and nothing else.
  installHandle();
  // The write trace stays off unless a previous session asked for it. One
  // synchronous storage read at boot, then either a patched prototype or
  // nothing at all.
  if (scrollWriteTraceFlagSet()) armScrollWriteTrace(CHAT_LOG_SELECTOR);

  return () => {
    document.removeEventListener('scroll', onScrollCapture, { capture: true });
    // `installed` goes false BEFORE `detach()`, because detaching re-arms
    // wheel discovery and we are trying to take everything down.
    installed = false;
    disarmWheelDiscovery();
    detach();
    uninstallHandle();
    // Leaving a rewritten `Element.prototype` behind after teardown would be
    // the worst possible residue: invisible, global, and outliving the module
    // that explains it.
    disarmScrollWriteTrace();
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
    innerScrollerSuppressions: 0,
    resizeObserver: null,
    activity: createActivityLog(),
    shell: null,
    ancestors: new Set(),
    floatHost: null,
    jumpButton: null,
    jumpActive: false,
    jumpActiveAtAttach: false,
    jumpFirstActiveAt: null,
    streamingOn: false,
    structureObserver: null,
    streamObserver: null,
    hostResizeObserver: null,
    hostResolved: false,
    ledger: createShortfallLedger(),
    lastContentPx: null,
    childHeights: new WeakMap(),
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
        // The entry's own `contentRect` would be free, but the ring buffer
        // wants a moment, not a measurement — and the frame below reads the
        // real geometry a beat later anyway.
        pushActivity(active.activity, 'log_resize', 'log', now());
        active.scrollSamplePending = true;
        scheduleFrame(active);
      });
      observer.observe(element);
      active.resizeObserver = observer;
    } catch {
      active.resizeObserver = null;
    }
  }

  armActivity(active);
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
  disarmActivity(active);
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
// Parallel activity — what ELSE the page was doing
// ---------------------------------------------------------------------------
//
// Everything below records; nothing below reads layout, schedules a frame,
// or resolves a computed style. That is the whole contract, and it is why
// these observers are affordable on a page that is already struggling.
//
// The watch is deliberately narrow:
//
//   * `childList` on the chat log's PARENT only — one level, no subtree.
//     That is where the float slot and the message rail mount, which is
//     where a height change the scroller cannot see comes from. A
//     `subtree: true` childList anywhere near `.chat-log` would fire on
//     every streamed token.
//   * `childList` + `class`/`style` on the bottom float slot, because the
//     jump button and the plan pill SWAP there rather than stacking.
//   * `class`/`style` on the chat log and on its ancestor chain. Two
//     attribute names, never "all attributes".
//   * `data-streaming` with `subtree: true` on the chat log — the ONE
//     registration that reaches inside. It is a single attribute name, so
//     the engine rejects the class churn of a streaming turn without ever
//     queueing a record, and the flag itself flips about twice a turn.
//     This is the only item here that goes past "shell plus ancestors",
//     and it is here because "was a turn streaming into the log while this
//     happened" is a question the report otherwise answers only at the
//     final instant.
//   * `animationstart` / `animationend` / `transitionstart` /
//     `transitionend` on the shell, capture and passive.
//     `animationiteration` is NOT listened for: an infinite shimmer would
//     otherwise fill the buffer by itself.
//
// What is knowingly NOT covered: a question form or a skeleton
// APPEARING or DISAPPEARING is a childList change inside the transcript,
// and observing that costs a subtree childList watch on a node that
// mutates every frame while streaming. So those show up only when they
// animate (which the skeleton does) or when they land as a direct sibling.
// Absent beats expensive.

function armActivity(active: Surface): void {
  const shell = active.element.parentElement;
  active.shell = shell;

  // The chain is a dozen elements in the real app; the cap is there so a
  // pathological document cannot turn this into a walk.
  active.ancestors.clear();
  let node: HTMLElement | null = shell;
  for (let depth = 0; node != null && depth < MAX_ANCESTOR_WATCH; depth += 1) {
    active.ancestors.add(node);
    node = node.parentElement;
  }

  if (typeof MutationObserver !== 'undefined') {
    try {
      const structure = new MutationObserver(onStructureMutations);
      structure.observe(active.element, {
        attributes: true,
        attributeFilter: WATCHED_ATTRIBUTES,
      });
      for (const ancestor of active.ancestors) {
        structure.observe(
          ancestor,
          ancestor === shell
            // One registration, not two: observing the same node twice with
            // the same observer REPLACES the options rather than adding to
            // them, so the shell's childList and attribute watches have to
            // arrive together.
            ? { childList: true, attributes: true, attributeFilter: WATCHED_ATTRIBUTES }
            : { attributes: true, attributeFilter: WATCHED_ATTRIBUTES },
        );
      }
      active.structureObserver = structure;
    } catch {
      active.structureObserver = null;
    }

    // A SECOND observer for the same reason: `data-streaming` needs
    // `subtree: true` on the chat log, and the log already carries a
    // non-subtree registration on the structure observer that a second
    // `observe()` call would overwrite.
    try {
      const stream = new MutationObserver(onStreamMutations);
      stream.observe(active.element, {
        attributes: true,
        attributeFilter: ['data-streaming'],
        subtree: true,
      });
      active.streamObserver = stream;
    } catch {
      active.streamObserver = null;
    }
  }

  adoptSurfaceParts(active, now(), true);

  if (shell != null) {
    for (const type of MOTION_EVENTS) {
      shell.addEventListener(type, onSurfaceMotion, LISTEN_OPTIONS);
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange, LISTEN_OPTIONS);
  }
}

function disarmActivity(active: Surface): void {
  try {
    active.structureObserver?.disconnect();
  } catch {
    // best-effort — teardown must never propagate
  }
  active.structureObserver = null;
  try {
    active.streamObserver?.disconnect();
  } catch {
    // best-effort
  }
  active.streamObserver = null;
  try {
    active.hostResizeObserver?.disconnect();
  } catch {
    // best-effort
  }
  active.hostResizeObserver = null;

  const shell = active.shell;
  if (shell != null) {
    for (const type of MOTION_EVENTS) {
      shell.removeEventListener(type, onSurfaceMotion, UNLISTEN_OPTIONS);
    }
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange, UNLISTEN_OPTIONS);
  }

  active.shell = null;
  active.ancestors.clear();
  active.floatHost = null;
  active.jumpButton = null;
}

/**
 * Locate the float slot and the jump button, and watch whichever of them
 * exist.
 *
 * Called at attach and again whenever the shell or the float slot changes
 * children, because on this branch the button is genuinely destroyed and
 * rebuilt when the plan pill takes the slot — the same node does not come
 * back.
 *
 * `initial` distinguishes "we arrived and it was already lit" (which is not
 * a transition and must not be dated as one) from "we watched it light up".
 */
function adoptSurfaceParts(active: Surface, at: number, initial: boolean): void {
  const shell = active.shell;
  if (shell == null) return;
  const parts = scanSurfaceParts(shell, active.element);

  if (parts.float !== active.floatHost) {
    active.floatHost = parts.float;
    if (parts.float != null) {
      try {
        active.structureObserver?.observe(parts.float, {
          childList: true,
          attributes: true,
          attributeFilter: WATCHED_ATTRIBUTES,
        });
      } catch {
        // best-effort — a missing watch loses evidence, never correctness
      }
    }
  }

  if (parts.jump !== active.jumpButton) {
    active.jumpButton = parts.jump;
    const lit = parts.jump != null && isJumpActive(parts.jump);
    if (initial) {
      active.jumpActive = lit;
      active.jumpActiveAtAttach = lit;
    } else if (lit !== active.jumpActive) {
      // The button can arrive ALREADY lit — that is the documented path on
      // this branch, where the plan pill stepping aside hands the slot back
      // to a jump button that is on from its first frame. Dropping that
      // would lose the exact event the report is hunting.
      active.jumpActive = lit;
      if (lit && active.jumpFirstActiveAt == null) active.jumpFirstActiveAt = at;
      pushActivity(active.activity, lit ? 'jump_shown' : 'jump_hidden', 'jump', at);
    }
    if (parts.jump != null) {
      try {
        active.structureObserver?.observe(parts.jump, {
          attributes: true,
          attributeFilter: WATCHED_ATTRIBUTES,
        });
      } catch {
        // best-effort
      }
    }
  }
}

/**
 * Breadth-first over the chat log's SIBLINGS, never into the log itself,
 * with a hard node budget.
 *
 * `querySelector` from the shell would be one line and would walk the whole
 * transcript on every miss, which on a long conversation is thousands of
 * nodes for a button that lives two levels down beside it.
 */
function scanSurfaceParts(
  shell: HTMLElement,
  chatLog: HTMLElement,
): { jump: HTMLElement | null; float: HTMLElement | null } {
  let jump: HTMLElement | null = null;
  let float: HTMLElement | null = null;
  let budget = PART_SCAN_BUDGET;
  const queue: Element[] = [];
  for (const child of Array.from(shell.children)) {
    if (child !== chatLog) queue.push(child);
  }
  while (queue.length > 0 && budget > 0) {
    const node = queue.shift();
    if (node == null) break;
    budget -= 1;
    if (jump == null && hasPartIdentity(node, JUMP_BTN_TESTID, JUMP_BTN_CLASS)) {
      jump = node as HTMLElement;
    } else if (float == null && hasPartIdentity(node, FLOAT_SLOT_TESTID, FLOAT_SLOT_CLASS)) {
      float = node as HTMLElement;
    }
    if (jump != null && float != null) break;
    for (const child of Array.from(node.children)) queue.push(child);
  }
  return { jump, float };
}

function hasPartIdentity(el: Element, testId: string, className: string): boolean {
  try {
    if (el.getAttribute('data-testid') === testId) return true;
    return el.classList.contains(className);
  } catch {
    return false;
  }
}

function isJumpActive(el: Element): boolean {
  try {
    return el.classList.contains(JUMP_ACTIVE_CLASS);
  } catch {
    return false;
  }
}

/**
 * Structural mutations. One clock read for the whole batch, then a switch
 * on node identity — no selector matching, no layout, no scheduling.
 *
 * Dispatch is by identity rather than by `contains()` on purpose. A
 * `MutationObserver` has no way to stop watching a single node, so a jump
 * button that has been swapped out stays registered until it is collected;
 * comparing against the CURRENT `jumpButton` is what keeps a dead node's
 * last gasp out of the trail.
 */
function onStructureMutations(records: MutationRecord[]): void {
  const active = surface;
  if (active === null || active.reported) return;
  const at = now();
  let partsDirty = false;

  for (const record of records) {
    const target = record.target;
    if (record.type === 'childList') {
      const inFloat = target === active.floatHost;
      const inShell = target === active.shell;
      if (!inFloat && !inShell) continue;
      for (const node of Array.from(record.addedNodes)) {
        if (!isElement(node)) continue;
        pushActivity(
          active.activity,
          inFloat ? 'float_child_added' : 'shell_child_added',
          roleOfNode(node),
          at,
        );
      }
      for (const node of Array.from(record.removedNodes)) {
        if (!isElement(node)) continue;
        pushActivity(
          active.activity,
          inFloat ? 'float_child_removed' : 'shell_child_removed',
          roleOfNode(node),
          at,
        );
      }
      partsDirty = true;
      continue;
    }

    const isStyle = record.attributeName === 'style';
    if (target === active.element) {
      pushActivity(active.activity, isStyle ? 'log_style' : 'log_class', 'log', at);
      continue;
    }
    if (target === active.jumpButton) {
      const lit = isJumpActive(target as Element);
      if (lit === active.jumpActive) {
        pushActivity(active.activity, 'jump_attr', 'jump', at);
        continue;
      }
      active.jumpActive = lit;
      if (lit && active.jumpFirstActiveAt == null) active.jumpFirstActiveAt = at;
      pushActivity(active.activity, lit ? 'jump_shown' : 'jump_hidden', 'jump', at);
      continue;
    }
    if (target === active.floatHost) {
      pushActivity(active.activity, 'float_attr', 'float', at);
      continue;
    }
    if (isElement(target) && active.ancestors.has(target)) {
      pushActivity(
        active.activity,
        isStyle ? 'ancestor_style' : 'ancestor_class',
        roleOfNode(target),
        at,
      );
    }
    // Anything else is a node we no longer own. Silence is correct.
  }

  if (partsDirty) adoptSurfaceParts(active, at, false);
}

/**
 * The streaming flag, read from the record's own target.
 *
 * Only the newest assistant message streams, so taking the mutated
 * element's new value as the surface's state is accurate in practice. It
 * would be wrong if two messages ever streamed at once — at which point the
 * trail would show a spurious `streaming_off`, which is a legible wrong
 * rather than an expensive right.
 */
function onStreamMutations(records: MutationRecord[]): void {
  const active = surface;
  if (active === null || active.reported) return;
  const at = now();
  for (const record of records) {
    const target = record.target;
    if (!isElement(target)) continue;
    const streaming = target.getAttribute('data-streaming') === 'true';
    if (streaming === active.streamingOn) continue;
    active.streamingOn = streaming;
    pushActivity(
      active.activity,
      streaming ? 'streaming_on' : 'streaming_off',
      roleOfNode(target),
      at,
    );
  }
}

/**
 * Animations and transitions anywhere under the shell.
 *
 * The `currentTarget` check is not defensive noise: `addEventListener`
 * de-duplicates identical registrations, so a listener left on an abandoned
 * shell is invisible to any same-element test. Comparing against the live
 * shell is what actually guarantees a superseded surface stops feeding the
 * buffer.
 */
function onSurfaceMotion(event: Event): void {
  const active = surface;
  if (active === null || active.reported) return;
  if (event.currentTarget !== active.shell) return;
  const kind = MOTION_KIND[event.type];
  if (kind === undefined) return;
  pushActivity(active.activity, kind, roleOfNode(event.target), now());
}

function onVisibilityChange(): void {
  const active = surface;
  if (active === null || active.reported) return;
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  pushActivity(active.activity, hidden ? 'doc_hidden' : 'doc_visible', 'other', now());
}

/**
 * Watch the box that gives the chat log its height.
 *
 * `offsetParent` forces a synchronous layout, which is banned everywhere
 * else in this file. It is read HERE, from inside the frame callback that
 * has just read `scrollHeight`, so layout is already clean and the read
 * costs nothing — and it happens exactly once per surface.
 */
function observeHostBox(active: Surface): void {
  if (typeof ResizeObserver === 'undefined') return;
  let host: HTMLElement | null = null;
  try {
    host = (active.element.offsetParent as HTMLElement | null) ?? active.element.parentElement;
  } catch {
    host = active.element.parentElement;
  }
  if (host == null || host === active.element) return;
  const target = host;
  try {
    const observer = new ResizeObserver(() => {
      if (surface !== active || active.reported) return;
      // Record only. Unlike the chat log's own observer this does NOT
      // schedule a geometry frame: the host's height is not one of the three
      // numbers the verdict is made from.
      pushActivity(active.activity, 'host_resize', roleOfNode(target), now());
    });
    observer.observe(target);
    active.hostResizeObserver = observer;
  } catch {
    active.hostResizeObserver = null;
  }
}

/**
 * Class names and test ids in, an enum member out.
 *
 * `getAttribute('class')` rather than `.className` because on an SVG
 * element the latter is an `SVGAnimatedString`, not a string. Neither
 * reads layout.
 */
function roleOfNode(node: EventTarget | Node | null): ChatActivityRole {
  if (!isElement(node)) return 'other';
  try {
    return classifyActivityRole(
      node.getAttribute('class') ?? '',
      node.getAttribute('data-testid'),
    );
  } catch {
    return 'other';
  }
}

function isElement(node: EventTarget | Node | null): node is Element {
  return typeof Element !== 'undefined' && node instanceof Element;
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
  // Layout is clean at this point, so the one `offsetParent` read this
  // module allows itself happens here and nowhere else.
  if (!active.hostResolved) {
    active.hostResolved = true;
    observeHostBox(active);
  }
  recordContentChange(active, geometry, at);
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

  // One round of "the wheel asked to go further; this is where it stopped".
  // Read BEFORE `observeWheelBatch`, which replaces `lastScrollTop`. A batch
  // that did not advance — including one thrown backwards — has found the
  // compositor's current ceiling, whether or not it is far enough from
  // layout's to be worth reporting on its own.
  const previousTop = active.state.lastScrollTop;
  if (wheelPx > 0 && previousTop != null && geometry.scrollTop <= previousTop) {
    recordCeilingProbe(active.ledger, {
      at,
      reachedPx: geometry.scrollTop,
      layoutMax: Math.max(0, geometry.scrollHeight - geometry.clientHeight),
      contentPx: geometry.scrollHeight,
    });
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
    // The only trace this decision leaves. A suppressed freeze and a chat
    // that never froze are otherwise indistinguishable from outside, which is
    // how a real 1493px failure produced no event and no explanation.
    active.innerScrollerSuppressions += 1;
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

/**
 * Note every content-height change, and say which child caused it.
 *
 * Deliberately NOT filtered the way `recordShape` is. `transitions` ignores
 * anything under 200px so a token stream cannot flood it; the ledger cannot
 * afford that, because the captured deficit grew five and nine pixels at a
 * time and a 200px filter would have shown a flat line.
 *
 * The first sample records nothing: we arrived at a height, we did not
 * witness a change. It still takes the child snapshot, so the next real
 * change has a baseline to subtract from.
 */
function recordContentChange(
  active: Surface,
  geometry: ScrollGeometry,
  at: number,
): void {
  const contentPx = geometry.scrollHeight;
  if (active.lastContentPx === contentPx) return;
  const arriving = active.lastContentPx == null;
  active.lastContentPx = contentPx;
  const growth = measureChildGrowth(active);
  if (arriving) return;
  recordContentStep(active.ledger, {
    at,
    contentPx,
    viewportPx: geometry.clientHeight,
    layoutMax: Math.max(0, contentPx - geometry.clientHeight),
    ...(growth != null ? { growthRole: growth.role, growthPx: growth.deltaPx } : {}),
  });
}

/**
 * Which direct child of the chat log changed height, and by how much.
 *
 * `offsetHeight` is layout, and this is the only place outside the geometry
 * read that touches it. It is affordable because of where it sits: the
 * frame callback has just read `scrollHeight`, so layout is clean and these
 * reads cost a lookup each rather than a reflow — and nothing between the
 * two reads writes to the DOM, because this module never writes to the DOM.
 *
 * Bounded twice over: only the last `MAX_CHILD_HEIGHT_SCAN` children (growth
 * happens at the tail — the streaming message and the spacer), and only on a
 * frame where the content height moved.
 *
 * Returns the single largest mover. The capture that motivates this had one
 * assistant message doing every pixel of the growing, and "the assistant
 * message grew 534px" is the fact worth 32 reads; a full per-child census
 * would be a different, more expensive event.
 */
function measureChildGrowth(
  active: Surface,
): { role: ChatActivityRole; deltaPx: number } | null {
  let winner: Element | null = null;
  let winnerDelta = 0;
  try {
    const children = active.element.children;
    const total = children.length;
    for (let i = Math.max(0, total - MAX_CHILD_HEIGHT_SCAN); i < total; i += 1) {
      const child = children[i];
      if (child == null || !(child instanceof HTMLElement)) continue;
      const height = child.offsetHeight;
      const previous = active.childHeights.get(child);
      active.childHeights.set(child, height);
      if (previous === undefined) continue;
      const delta = height - previous;
      if (Math.abs(delta) > Math.abs(winnerDelta)) {
        winner = child;
        winnerDelta = delta;
      }
    }
  } catch {
    // A measurement failure must never suppress the step it decorates.
  }
  if (winner == null || winnerDelta === 0) return null;
  return { role: roleOfNode(winner), deltaPx: winnerDelta };
}

/**
 * The tail spacer's height at the freeze.
 *
 * It was 0 in the capture, which is itself the finding — "does this thing
 * ever have height while the deficit is opening" is a question the report
 * should be able to answer. Read here rather than per frame because report
 * time is the one place cost stops mattering.
 */
function readTailSpacerPx(root: HTMLElement): number | null {
  try {
    const children = root.children;
    for (let i = children.length - 1; i >= 0 && i >= children.length - 4; i -= 1) {
      const child = children[i];
      if (child == null || !(child instanceof HTMLElement)) continue;
      if (roleOfNode(child) === 'tail_spacer') return child.offsetHeight;
    }
  } catch {
    // best-effort
  }
  return null;
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
      // The anchor the activity slices are measured against, planted in the
      // trail itself so the trail can be read without the other fields.
      pushActivity(active.activity, 'scroll_node_born', 'log', at);
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
 * The one test for "this box could legitimately have eaten a downward
 * wheel", used by the suppression gate and by the handle that reports on
 * it, so the two can never again describe different sets.
 *
 * Both halves are required, and an earlier version asked only the second:
 *
 *   1. It is a vertical SCROLLPORT. `overflow-y` has to be a value the
 *      engine gives a scrollbar to.
 *   2. It has travel left below where it currently sits.
 *
 * Geometry alone cannot tell a scroller from a box that overflows its
 * content and clips it — and a chat transcript is built out of the latter
 * on purpose. A user message at `-webkit-line-clamp: 6`, a collapsed code
 * block at `max-height: 7em`, a closed accordion, an action card: every one
 * of them reports content taller than its box while ignoring the wheel
 * completely. Counting those as consumers threw away the freeze verdict AND
 * cleared the streak, so a genuine freeze anywhere near normal chat
 * furniture was silent, and the only surviving trace was
 * `innerScrollerSuppressions`.
 *
 * `overflow-y` is read as the COMPUTED value rather than reasoned about from
 * the declarations, because the engine has already resolved the awkward
 * corner of the grid: a box specified `overflow-x: auto; overflow-y:
 * visible` computes `overflow-y: auto` (CSS Overflow 3 — it genuinely is a
 * vertical scrollport, and a vertical wheel genuinely does scroll it),
 * whereas an explicit `overflow-y: hidden` next to a scrolling x-axis
 * genuinely is not. Asking `getComputedStyle` gets that grid right for free;
 * inferring it here would get it wrong. `hidden` and `clip` are excluded
 * deliberately — `hidden` is scrollable from script and inert to a wheel,
 * which is the entire defect.
 *
 * Order is chosen for cost. Geometry first: those are property reads on a
 * layout tree the caller has just made clean, and they reject most of an
 * ancestor chain outright, so `getComputedStyle` is only paid for the few
 * boxes that actually overflow.
 *
 * A style that cannot be read counts as NOT absorbing. Suppression has to be
 * earned by proof: a false report is visible and correctable, and a false
 * silence is what cost a day.
 */
const WHEEL_SCROLLABLE_OVERFLOW_Y: ReadonlySet<string> = new Set([
  'auto',
  'scroll',
  // Legacy alias some engines still compute rather than normalising to
  // `auto`. It scrolls; it belongs here.
  'overlay',
]);

function absorbsDownwardWheel(el: HTMLElement): boolean {
  const travel = el.scrollHeight - el.clientHeight;
  if (travel <= EDGE_TOLERANCE_PX) return false;
  if (travel - el.scrollTop <= EDGE_TOLERANCE_PX) return false;
  try {
    return WHEEL_SCROLLABLE_OVERFLOW_Y.has(getComputedStyle(el).overflowY);
  } catch {
    return false;
  }
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
    if (absorbsDownwardWheel(el)) count += 1;
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
  const activity = listActivity(active.activity);
  const ledger = active.ledger;
  const firstShortfall = ledger.first;
  const tailSpacerPx = readTailSpacerPx(active.element);

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

    // -- what else was moving ------------------------------------------
    activity_trail: serialiseActivity(activity, active.attachedAt),
    activity_pre_freeze: serialiseActivity(
      sliceActivityBefore(activity, at, ACTIVITY_PRE_FREEZE_MS),
      active.attachedAt,
    ),
    ...(active.scrollableOnAt != null
      ? {
          activity_near_scroll_node: serialiseActivity(
            sliceActivityWindow(activity, active.scrollableOnAt, ACTIVITY_NEAR_WINDOW_MS),
            active.attachedAt,
          ),
        }
      : {}),
    activity_dropped: active.activity.dropped,
    activity_counts: countActivity(activity),

    // -- the drift -----------------------------------------------------
    content_steps: serialiseContentSteps(ledger.steps, active.attachedAt),
    content_step_count: ledger.stepCount,
    ceiling_probes: serialiseCeilingProbes(ledger.probes, active.attachedAt),
    ceiling_probe_count: ledger.probeCount,
    ...(firstShortfall != null
      ? {
          shortfall_first_ms: Math.round(firstShortfall.at - active.attachedAt),
          shortfall_first_px: Math.round(firstShortfall.shortfallPx),
          shortfall_first_reached_px: Math.round(firstShortfall.reachedPx),
          shortfall_first_layout_max_px: Math.round(firstShortfall.layoutMax),
          shortfall_first_content_px: Math.round(firstShortfall.contentPx),
          ...(firstShortfall.growthRole != null && firstShortfall.growthPx != null
            ? {
                shortfall_first_growth:
                  `${firstShortfall.growthRole}:${Math.round(firstShortfall.growthPx)}`,
              }
            : {}),
        }
      : {}),
    ...(tailSpacerPx != null ? { tail_spacer_px: Math.round(tailSpacerPx) } : {}),
    jump_active_at_attach: active.jumpActiveAtAttach,
    ...(active.jumpFirstActiveAt != null
      ? { jump_first_active_ms: Math.round(active.jumpFirstActiveAt - active.attachedAt) }
      : {}),
    ...(active.jumpFirstActiveAt != null && active.scrollableOnAt != null
      ? {
          jump_active_vs_scroll_node_ms: Math.round(
            active.jumpFirstActiveAt - active.scrollableOnAt,
          ),
        }
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
// The runtime handle — `window.__chatScrollFreeze`
// ---------------------------------------------------------------------------
//
// Why this exists
// ---------------
// A user hit a 1493px freeze on a dogfood build and PostHog received nothing.
// The transport was alive and the observer was installed — both provable from
// neighbouring events — so the failure was inside this module's own chain of
// conditions, and this module could not say which one, because it exposed no
// state whatsoever. Getting any number at all meant hand-injecting a script
// into the running renderer, which dies with the window.
//
// So there is now a read-only way to ask. It answers, in one call: what is
// attached, what the geometry is RIGHT NOW, what is accumulated, what the
// ledger holds, and — the field this was really built for — every gate
// between here and a report, with its current value beside the value it
// needs.
//
// The cost contract, which is not negotiable
// ------------------------------------------
// Nobody calling it must cost nothing. That is enforced structurally:
//
//   - No listener, no observer, no timer and no frame is created for the
//     handle, at install or ever. Installing it is one property assignment.
//   - NOTHING is pre-computed. Every geometry read, every element
//     description, every subtree walk happens inside `snapshot()`, on the
//     stack of whoever asked. A cached "current scrollHeight" kept fresh in
//     the background would be a layout read on somebody else's frame, which
//     is the exact tax this module refuses to levy.
//   - The one piece of new bookkeeping in the hot path is
//     `innerScrollerSuppressions`, and it lives inside a branch that has
//     already walked an ancestor chain reading layout.
//
// `snapshot()` itself is expensive — it forces layout and walks the
// transcript. That is correct: it runs when a human is looking, and at that
// moment cost has stopped mattering.

/** Elements examined when listing boxes that could absorb a wheel. */
const MAX_ABSORBING_SCAN = 400;
/** …and how many of them are named in the sample. */
const MAX_ABSORBING_SAMPLE = 12;
/** The property `window.__chatScrollFreeze` is published under. */
const HANDLE_KEY = '__chatScrollFreeze';

export interface ChatScrollFreezeGeometrySnapshot extends ScrollGeometry {
  /** `scrollHeight - clientHeight` — the ceiling layout would permit. */
  layoutMax: number;
  /** …minus where the scroller is. What the wheel cannot reach. */
  unreachablePx: number;
}

export interface ChatScrollFreezeSurfaceSnapshot {
  probeId: string;
  /** How long this element has been watched. */
  ageMs: number;
  /** Tag, classes, test id, rendered size and child count. */
  element: string;
  elementConnected: boolean;
  messageRowCount: number;
  /** Read live, on this call. */
  geometry: ChatScrollFreezeGeometrySnapshot;
  /** What the last frame callback saw — stale on purpose, so drift is visible. */
  geometryAtLastFrame: ScrollGeometry | null;
  pendingWheel: { px: number; count: number; target: string | null };
  /** Frozen verdicts the inner-scroller gate has discarded on this surface. */
  innerScrollerSuppressions: number;
  /** Boxes in the transcript that would suppress a report if wheeled over. */
  absorbingScrollers: { count: number; truncated: boolean; sample: string[] };
  detector: ScrollFreezeState;
  shape: ScrollShapeMemo | null;
  transitions: string;
  scrollableOn: { contentPx: number; agoMs: number } | null;
  ledger: {
    stepCount: number;
    probeCount: number;
    steps: string;
    probes: string;
    first: FirstShortfall | null;
  };
  activity: { size: number; dropped: number; counts: string; trail: string };
  jump: {
    activeAtAttach: boolean;
    active: boolean;
    firstActiveMs: number | null;
    activeVsScrollNodeMs: number | null;
  };
  streaming: boolean;
  parts: {
    shell: string | null;
    floatHost: string | null;
    jumpButton: string | null;
    ancestorCount: number;
  };
  scheduling: {
    framePending: boolean;
    idlePending: boolean;
    scrollSamplePending: boolean;
    msSinceScrollSample: number | null;
    layerCountAtAttach: number | null;
  };
  observers: { log: boolean; host: boolean; structure: boolean; stream: boolean };
}

export interface ChatScrollFreezeSnapshot {
  version: 1;
  at: number;
  installed: boolean;
  attached: boolean;
  reportedThisSession: number;
  wheelDiscoveryArmed: boolean;
  thresholds: {
    minUnreachablePx: number;
    freezeWheelCount: number;
    freezeRequestedPx: number;
    snapBackMinPx: number;
    edgeTolerancePx: number;
    maxReportsPerSession: number;
    scrollSampleMinIntervalMs: number;
  };
  surface: ChatScrollFreezeSurfaceSnapshot | null;
  /** Every condition between a wheel and an event, with actual vs needed. */
  blockers: ReportBlocker[];
  /** `ready`, or `blocked_by=` every failing gate. */
  verdict: string;
  /** The one-notch route, which the four-notch gates say nothing about. */
  snapBack: SnapBackRoute | null;
  writeTrace: {
    armed: boolean;
    flagSet: boolean;
    recorded: number;
    dropped: number;
    capacity: number;
  };
}

export interface ChatScrollFreezeHandle {
  readonly version: 1;
  /** Everything, read at this instant. */
  snapshot(): ChatScrollFreezeSnapshot;
  /** Just the verdict line, for a console one-liner. */
  why(): string;
  writes: {
    enabled(): boolean;
    /** Patches `Element.prototype` and persists the switch. */
    enable(): boolean;
    /** Restores the prototype verbatim and clears the switch. */
    disable(): void;
    list(): ScrollWriteRecord[];
    clear(): void;
  };
}

interface ProbeGlobals {
  [HANDLE_KEY]?: ChatScrollFreezeHandle;
}

/**
 * Enough to pick an element out of a screenshot: what it is, what it is
 * called, how big it is and how much it contains.
 *
 * `getBoundingClientRect` forces layout. It is called from `snapshot()` and
 * nowhere else, which is the whole reason the handle computes nothing ahead
 * of time.
 */
function describeElement(el: Element | null): string | null {
  if (el == null) return null;
  try {
    const tag = el.tagName.toLowerCase();
    const classes = (el.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 8)
      .map((token) => `.${token}`)
      .join('');
    const testId = el.getAttribute('data-testid');
    const rect = el.getBoundingClientRect();
    return (
      `${tag}${classes}`
      + (testId != null ? `[data-testid=${testId}]` : '')
      + ` ${Math.round(rect.width)}x${Math.round(rect.height)}`
      + ` children=${el.children.length}`
    );
  } catch {
    return 'unknown';
  }
}

/**
 * Boxes inside the log that `countAbsorbingScrollers` would count.
 *
 * Prospective where the suppression counter is historical: "which boxes in
 * this transcript can eat a wheel" is answerable at any moment, and the
 * answer is what turns "it never reported" into a reason.
 *
 * It calls the gate's own predicate rather than restating it. The two were
 * separate copies of the same geometry test once, which meant this list
 * named every clipped user message and collapsed code block in the
 * transcript as a suppressor — the exact wrong conclusion the operator comes
 * here to avoid. One predicate, so a reader of this list is reading the
 * gate.
 */
function scanAbsorbingScrollers(root: HTMLElement): {
  count: number;
  truncated: boolean;
  sample: string[];
} {
  let count = 0;
  let truncated = false;
  const sample: string[] = [];
  try {
    const all = root.getElementsByTagName('*');
    const limit = Math.min(all.length, MAX_ABSORBING_SCAN);
    truncated = all.length > MAX_ABSORBING_SCAN;
    for (let i = 0; i < limit; i += 1) {
      const el = all[i];
      if (el == null || !(el instanceof HTMLElement)) continue;
      if (!absorbsDownwardWheel(el)) continue;
      count += 1;
      if (sample.length < MAX_ABSORBING_SAMPLE) {
        const described = describeElement(el);
        if (described != null) sample.push(described);
      }
    }
  } catch {
    // A diagnostic that throws is worse than a diagnostic that is short.
  }
  return { count, truncated, sample };
}

function snapshotSurface(
  active: Surface,
  geometry: ChatScrollFreezeGeometrySnapshot,
  at: number,
): ChatScrollFreezeSurfaceSnapshot {
  const activity = listActivity(active.activity);
  return {
    probeId: active.probeId,
    ageMs: Math.round(at - active.attachedAt),
    element: describeElement(active.element) ?? 'unknown',
    elementConnected: active.element.isConnected,
    messageRowCount: active.element.children.length,
    geometry,
    geometryAtLastFrame: active.geometry,
    pendingWheel: {
      px: Math.round(active.pendingWheelPx),
      count: active.pendingWheelCount,
      target: describeElement(active.pendingWheelTarget),
    },
    innerScrollerSuppressions: active.innerScrollerSuppressions,
    absorbingScrollers: scanAbsorbingScrollers(active.element),
    detector: active.state,
    shape: active.shape,
    transitions: serialiseTransitions(active.transitions),
    scrollableOn:
      active.scrollableOnContentPx != null && active.scrollableOnAt != null
        ? {
            contentPx: Math.round(active.scrollableOnContentPx),
            agoMs: Math.round(at - active.scrollableOnAt),
          }
        : null,
    ledger: {
      stepCount: active.ledger.stepCount,
      probeCount: active.ledger.probeCount,
      steps: serialiseContentSteps(active.ledger.steps, active.attachedAt),
      probes: serialiseCeilingProbes(active.ledger.probes, active.attachedAt),
      first: active.ledger.first,
    },
    activity: {
      size: active.activity.size,
      dropped: active.activity.dropped,
      counts: countActivity(activity),
      trail: serialiseActivity(activity, active.attachedAt),
    },
    jump: {
      activeAtAttach: active.jumpActiveAtAttach,
      active: active.jumpActive,
      firstActiveMs:
        active.jumpFirstActiveAt != null
          ? Math.round(active.jumpFirstActiveAt - active.attachedAt)
          : null,
      activeVsScrollNodeMs:
        active.jumpFirstActiveAt != null && active.scrollableOnAt != null
          ? Math.round(active.jumpFirstActiveAt - active.scrollableOnAt)
          : null,
    },
    streaming: active.streamingOn,
    parts: {
      shell: describeElement(active.shell),
      floatHost: describeElement(active.floatHost),
      jumpButton: describeElement(active.jumpButton),
      ancestorCount: active.ancestors.size,
    },
    scheduling: {
      framePending: active.framePending,
      idlePending: active.idlePending,
      scrollSamplePending: active.scrollSamplePending,
      msSinceScrollSample: Number.isFinite(active.lastScrollSampleAt)
        ? Math.round(at - active.lastScrollSampleAt)
        : null,
      layerCountAtAttach: active.layerCountAtAttach,
    },
    observers: {
      log: active.resizeObserver != null,
      host: active.hostResizeObserver != null,
      structure: active.structureObserver != null,
      stream: active.streamObserver != null,
    },
  };
}

function buildSnapshot(): ChatScrollFreezeSnapshot {
  const at = now();
  const active = surface;
  const thresholds = {
    minUnreachablePx: MIN_UNREACHABLE_PX,
    freezeWheelCount: FREEZE_WHEEL_COUNT,
    freezeRequestedPx: FREEZE_REQUESTED_PX,
    snapBackMinPx: SNAP_BACK_MIN_PX,
    edgeTolerancePx: EDGE_TOLERANCE_PX,
    maxReportsPerSession: MAX_REPORTS_PER_SESSION,
    scrollSampleMinIntervalMs: SCROLL_SAMPLE_MIN_INTERVAL_MS,
  };
  const frameSchedulerAvailable = typeof requestAnimationFrame === 'function';
  const trace = scrollWriteTraceStats();
  const writeTrace = { ...trace, flagSet: scrollWriteTraceFlagSet() };

  if (active == null) {
    const blockers = evaluateReportBlockers({
      installed,
      frameSchedulerAvailable,
      reportedThisSession,
      maxReportsPerSession: MAX_REPORTS_PER_SESSION,
      surface: null,
    });
    return {
      version: 1,
      at,
      installed,
      attached: false,
      reportedThisSession,
      wheelDiscoveryArmed,
      thresholds,
      surface: null,
      blockers,
      verdict: summariseBlockers(blockers),
      snapBack: null,
      writeTrace,
    };
  }

  // The one place this file reads layout outside a frame callback, and it is
  // deliberate: the caller is a human at a console, not a scroll handler.
  const live: ScrollGeometry = {
    scrollTop: active.element.scrollTop,
    scrollHeight: active.element.scrollHeight,
    clientHeight: active.element.clientHeight,
  };
  const layoutMax = Math.max(0, live.scrollHeight - live.clientHeight);
  const geometry: ChatScrollFreezeGeometrySnapshot = {
    ...live,
    layoutMax,
    unreachablePx: layoutMax - live.scrollTop,
  };

  const blockers = evaluateReportBlockers({
    installed,
    frameSchedulerAvailable,
    reportedThisSession,
    maxReportsPerSession: MAX_REPORTS_PER_SESSION,
    surface: {
      elementConnected: active.element.isConnected,
      reported: active.reported,
      geometry: live,
      state: active.state,
      innerScrollerSuppressions: active.innerScrollerSuppressions,
    },
  });

  return {
    version: 1,
    at,
    installed,
    attached: true,
    reportedThisSession,
    wheelDiscoveryArmed,
    thresholds,
    surface: snapshotSurface(active, geometry, at),
    blockers,
    verdict: summariseBlockers(blockers),
    snapBack: describeSnapBackRoute(active.state, live),
    writeTrace,
  };
}

function installHandle(): void {
  if (typeof globalThis === 'undefined') return;
  const globals = globalThis as unknown as ProbeGlobals;
  globals[HANDLE_KEY] = {
    version: 1,
    snapshot: buildSnapshot,
    why: () => buildSnapshot().verdict,
    writes: {
      enabled: isScrollWriteTraceArmed,
      enable: () => {
        setScrollWriteTraceFlag(true);
        return armScrollWriteTrace(CHAT_LOG_SELECTOR);
      },
      disable: () => {
        setScrollWriteTraceFlag(false);
        disarmScrollWriteTrace();
      },
      list: listScrollWrites,
      clear: clearScrollWrites,
    },
  };
}

function uninstallHandle(): void {
  if (typeof globalThis === 'undefined') return;
  const globals = globalThis as unknown as ProbeGlobals;
  delete globals[HANDLE_KEY];
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
  uninstallHandle();
  disarmScrollWriteTrace();
  clearScrollWrites();
  reportedThisSession = 0;
}
