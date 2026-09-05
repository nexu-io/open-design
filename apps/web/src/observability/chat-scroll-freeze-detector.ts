// The chat-log scroll-freeze decision, as arithmetic.
//
// The defect
// ----------
// The compositor keeps its own copy of "how far this scroller scrolls",
// so that a wheel can move the page without waiting on the main thread.
// On the chat log that copy can go stale and never refresh. Measured on a
// real machine (Chromium 146 / Electron 41), with real OS wheel events:
//
//   .chat-log     scrollHeight 2347   clientHeight 583   → 1764 scrollable
//   scrollTop = 1700 from JS                             → took effect
//   scrollTop = 99999 from JS                            → clamped to 1764
//   12 wheel notches asking for 1440px                   → stopped at 91
//   scrollTop = 800, then one downward notch             → thrown back to 91
//
// 91 is not noise. 583 + 91 = 674 — the correct ceiling for a 674px-tall
// content box. The compositor froze at the instant the content was 674px
// tall, while layout and every JS-visible number moved on. Tripling the
// content, changing clientHeight and moving the caret all left the ceiling
// at 91; only destroying and rebuilding the layout box cleared it.
//
// Why this file is pure
// ---------------------
// JS cannot read the compositor's copy. It CAN read the symptom, and the
// symptom is three numbers and a wheel delta. Keeping the decision in a
// module that touches no DOM, no clock and no globals means the specs can
// drive the exact geometry measured on the failing machine — which matters
// because jsdom performs no layout at all and reports `scrollHeight` and
// `clientHeight` as 0 for everything it builds. A detector that read the
// DOM itself would be untestable below a real browser.
//
// What is deliberately NOT here: any repair. `display:none` → `flex`
// clears the frozen ceiling, and doing it automatically would hide the
// trigger we are trying to find (as well as costing a flash and the user's
// scroll position). This module observes.

/** The three numbers a scroll container can be asked for. */
export interface ScrollGeometry {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** Which symptom fired. Both mean the same underlying stale ceiling. */
export type ScrollFreezeTrigger =
  /** Repeated downward wheels asked for real distance and moved nothing. */
  | 'wheel_stall'
  /** A downward wheel threw the scroller BACKWARDS onto the stale ceiling. */
  | 'wheel_snap_back';

/**
 * Everything the report needs to date the freeze.
 *
 * `compositorContentPx` is the field that earns this whole module:
 * ceiling + viewport is the content height the compositor still believes
 * in, so comparing it against the content height recorded at each earlier
 * transition says *when* the copy went stale rather than merely that it
 * did.
 */
export interface ScrollFreezeEvidence {
  trigger: ScrollFreezeTrigger;
  /** The scrollTop the wheel refuses to pass. */
  ceilingScrollTop: number;
  /** ceiling + clientHeight — the content height the compositor believes. */
  compositorContentPx: number;
  /** scrollHeight — the content height layout actually has. */
  layoutContentPx: number;
  /** scrollHeight - clientHeight — the ceiling layout would permit. */
  layoutMaxScrollTop: number;
  /** How much of the log the wheel cannot reach. */
  unreachablePx: number;
  /** Consecutive stalled wheel events behind this verdict. */
  wheelCount: number;
  /** Distance those wheels asked for, in CSS pixels. */
  requestedPx: number;
  /**
   * Highest scrollTop ever observed, including programmatic writes. When
   * this is far above `ceilingScrollTop` it proves the JS-visible scroller
   * was never the thing that was stuck.
   */
  maxScrollTopSeen: number;
}

export type ScrollFreezeVerdict =
  /** Upward or horizontal — not the symptom. */
  | { kind: 'ignored' }
  /** The wheel moved the log. Healthy. */
  | { kind: 'moving' }
  /** The wheel did nothing because there is nothing left to scroll. */
  | { kind: 'at_end' }
  /** Not moving, but not yet enough evidence to call it. */
  | { kind: 'stalling'; wheelCount: number; requestedPx: number }
  | { kind: 'frozen'; evidence: ScrollFreezeEvidence };

export interface ScrollFreezeState {
  readonly maxScrollTopSeen: number;
  readonly lastScrollTop: number | null;
  /** scrollTop the current stalled streak is pinned at; null when moving. */
  readonly stallAt: number | null;
  readonly stallWheelCount: number;
  readonly stallRequestedPx: number;
  /** Once true the detector is silent for the rest of this surface. */
  readonly reported: boolean;
}

/**
 * Sub-pixel slack. A scroller within 1px of its end is at its end; the
 * user's own reproduction used exactly this margin
 * (`scrollTop < scrollHeight - clientHeight - 1`).
 */
export const EDGE_TOLERANCE_PX = 1;
/**
 * A stalled wheel only counts as a defect when a visible amount of the log
 * is unreachable. Below this a rounding artefact or a one-line overflow
 * would read as a freeze.
 */
export const MIN_UNREACHABLE_PX = 24;
/** Consecutive stalled wheel events before we will call it. */
export const FREEZE_WHEEL_COUNT = 4;
/**
 * …and the distance they must have asked for. Four notches of trackpad
 * jitter against a paused scroller is not a defect; four notches asking
 * for most of a viewport is.
 */
export const FREEZE_REQUESTED_PX = 240;
/**
 * A downward wheel that lands at least this far ABOVE where the scroller
 * already was. Nothing but a stale ceiling does that, so one is enough.
 */
export const SNAP_BACK_MIN_PX = 8;

export function createScrollFreezeState(): ScrollFreezeState {
  return {
    maxScrollTopSeen: 0,
    lastScrollTop: null,
    stallAt: null,
    stallWheelCount: 0,
    stallRequestedPx: 0,
    reported: false,
  };
}

/**
 * Fold in a scroll position we did not cause — an auto-scroll, a
 * programmatic write, a keyboard scroll.
 *
 * These are what keep `maxScrollTopSeen` honest: the measured failure had
 * a JS write reach 1700 while the wheel could not pass 91, and the gap
 * between those two numbers is the finding.
 */
export function observeScroll(
  state: ScrollFreezeState,
  geometry: ScrollGeometry,
): ScrollFreezeState {
  const moved = state.stallAt != null && geometry.scrollTop !== state.stallAt;
  return {
    ...state,
    maxScrollTopSeen: Math.max(state.maxScrollTopSeen, geometry.scrollTop),
    lastScrollTop: geometry.scrollTop,
    stallAt: moved ? null : state.stallAt,
    stallWheelCount: moved ? 0 : state.stallWheelCount,
    stallRequestedPx: moved ? 0 : state.stallRequestedPx,
  };
}

/**
 * Judge one frame's worth of wheel input against the geometry that frame
 * ended with.
 *
 * A batch rather than a single event because wheel input arrives faster
 * than frames: several notches coalesce into one geometry read, and
 * pretending otherwise would either over-count reads or under-count
 * notches.
 */
export function observeWheelBatch(
  state: ScrollFreezeState,
  input: { geometry: ScrollGeometry; requestedPx: number; wheelCount: number },
): { state: ScrollFreezeState; verdict: ScrollFreezeVerdict } {
  if (state.reported) return { state, verdict: { kind: 'ignored' } };

  const { geometry, requestedPx, wheelCount } = input;
  const top = geometry.scrollTop;
  const maxScrollTopSeen = Math.max(state.maxScrollTopSeen, top);
  const layoutMaxScrollTop = Math.max(0, geometry.scrollHeight - geometry.clientHeight);
  const unreachablePx = layoutMaxScrollTop - top;
  const previousTop = state.lastScrollTop;

  // Upward and horizontal wheels are a different gesture; whatever streak
  // was building is over either way.
  if (!(requestedPx > 0)) {
    return {
      state: {
        ...state,
        maxScrollTopSeen,
        lastScrollTop: top,
        stallAt: null,
        stallWheelCount: 0,
        stallRequestedPx: 0,
      },
      verdict: { kind: 'ignored' },
    };
  }

  // Asked to go down, went UP, and there was room below. The compositor
  // clamped us onto its own ceiling; no repetition needed.
  if (
    previousTop != null
    && top <= previousTop - SNAP_BACK_MIN_PX
    && unreachablePx > MIN_UNREACHABLE_PX
  ) {
    return {
      state: { ...state, maxScrollTopSeen, lastScrollTop: top, reported: true },
      verdict: {
        kind: 'frozen',
        evidence: {
          trigger: 'wheel_snap_back',
          ceilingScrollTop: top,
          compositorContentPx: top + geometry.clientHeight,
          layoutContentPx: geometry.scrollHeight,
          layoutMaxScrollTop,
          unreachablePx,
          wheelCount,
          requestedPx,
          maxScrollTopSeen,
        },
      },
    };
  }

  // The overwhelmingly common "wheel does nothing" case in a chat panel:
  // the user is pinned to the newest message. Reporting it would bury the
  // real signal under its own noise.
  if (unreachablePx <= EDGE_TOLERANCE_PX) {
    return {
      state: {
        ...state,
        maxScrollTopSeen,
        lastScrollTop: top,
        stallAt: null,
        stallWheelCount: 0,
        stallRequestedPx: 0,
      },
      verdict: { kind: 'at_end' },
    };
  }

  if (previousTop != null && top !== previousTop) {
    // It moved. The streak restarts empty rather than at one: the wheel
    // that produced movement is evidence of health, not of a stall.
    return {
      state: {
        ...state,
        maxScrollTopSeen,
        lastScrollTop: top,
        stallAt: top,
        stallWheelCount: 0,
        stallRequestedPx: 0,
      },
      verdict: { kind: 'moving' },
    };
  }

  const continuing = state.stallAt === top;
  const streakWheelCount = (continuing ? state.stallWheelCount : 0) + wheelCount;
  const streakRequestedPx = (continuing ? state.stallRequestedPx : 0) + requestedPx;
  const frozen =
    streakWheelCount >= FREEZE_WHEEL_COUNT
    && streakRequestedPx >= FREEZE_REQUESTED_PX
    && unreachablePx > MIN_UNREACHABLE_PX;

  const next: ScrollFreezeState = {
    ...state,
    maxScrollTopSeen,
    lastScrollTop: top,
    stallAt: top,
    stallWheelCount: streakWheelCount,
    stallRequestedPx: streakRequestedPx,
    reported: state.reported || frozen,
  };

  if (!frozen) {
    return {
      state: next,
      verdict: {
        kind: 'stalling',
        wheelCount: streakWheelCount,
        requestedPx: streakRequestedPx,
      },
    };
  }

  return {
    state: next,
    verdict: {
      kind: 'frozen',
      evidence: {
        trigger: 'wheel_stall',
        ceilingScrollTop: top,
        compositorContentPx: top + geometry.clientHeight,
        layoutContentPx: geometry.scrollHeight,
        layoutMaxScrollTop,
        unreachablePx,
        wheelCount: streakWheelCount,
        requestedPx: streakRequestedPx,
        maxScrollTopSeen,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// The run-up
// ---------------------------------------------------------------------------

/**
 * Structural changes to the scroll container worth remembering.
 *
 * `scrollable_on` is the prime suspect: it is the moment content first
 * exceeds the viewport, which is when the compositor has to create the
 * scroll node whose ceiling later goes stale. If the reported
 * `compositorContentPx` matches the content height recorded at
 * `scrollable_on`, the copy was stale from birth.
 */
export type ScrollTransitionKind =
  | 'scrollable_on'
  | 'scrollable_off'
  | 'content_grew'
  | 'content_shrank'
  | 'viewport_resized';

/**
 * How much content growth is worth a ring-buffer slot. A streaming turn
 * grows the log a few pixels per frame; recording every frame would evict
 * the interesting entries within a second.
 */
export const CONTENT_STEP_PX = 200;

export interface ScrollShapeMemo {
  scrollable: boolean;
  /** Content height at the last RECORDED step, not at the last sample. */
  contentPx: number;
  viewportPx: number;
}

/**
 * Compare one geometry sample against the remembered shape.
 *
 * `contentPx` advances only when a step is emitted, so slow growth
 * accumulates into a transition instead of being smoothed away — the
 * mistake that would make a token-by-token stream look static.
 *
 * The first sample (`previous == null`) emits nothing: we did not witness
 * a transition, we arrived after it. The caller records its own arrival.
 */
export function diffScrollShape(
  previous: ScrollShapeMemo | null,
  next: ScrollGeometry,
): { memo: ScrollShapeMemo; transitions: ScrollTransitionKind[] } {
  const scrollable = next.scrollHeight - next.clientHeight > EDGE_TOLERANCE_PX;
  if (previous == null) {
    return {
      memo: { scrollable, contentPx: next.scrollHeight, viewportPx: next.clientHeight },
      transitions: [],
    };
  }

  const transitions: ScrollTransitionKind[] = [];
  if (scrollable !== previous.scrollable) {
    transitions.push(scrollable ? 'scrollable_on' : 'scrollable_off');
  }
  if (next.clientHeight !== previous.viewportPx) transitions.push('viewport_resized');

  let contentPx = previous.contentPx;
  if (next.scrollHeight - previous.contentPx >= CONTENT_STEP_PX) {
    transitions.push('content_grew');
    contentPx = next.scrollHeight;
  } else if (previous.contentPx - next.scrollHeight >= CONTENT_STEP_PX) {
    transitions.push('content_shrank');
    contentPx = next.scrollHeight;
  }

  return {
    memo: { scrollable, contentPx, viewportPx: next.clientHeight },
    transitions,
  };
}

// ---------------------------------------------------------------------------
// Compositing triggers
// ---------------------------------------------------------------------------

/**
 * Properties that can promote an element to its own compositor layer, and
 * so can plausibly disturb a neighbouring scroll node.
 */
export type ScrollLayerTrigger =
  | 'will_change'
  | 'transform'
  | 'filter'
  | 'backdrop_filter'
  | 'contain'
  | 'perspective';

/** The computed values this module cares about. Strings, never elements. */
export interface LayerStyleProbe {
  willChange?: string;
  transform?: string;
  filter?: string;
  backdropFilter?: string;
  contain?: string;
  perspective?: string;
}

/** Values that mean "this property is not doing anything". */
const NEUTRAL = new Set(['', 'auto', 'none', 'normal', 'initial']);

function isActive(value: string | undefined): boolean {
  if (typeof value !== 'string') return false;
  return !NEUTRAL.has(value.trim());
}

/**
 * Name the compositing triggers present on one element.
 *
 * Pure so it can be specced without layout: `getComputedStyle` in jsdom
 * returns the initial value for everything, which would make a
 * DOM-reading classifier permanently green and permanently useless.
 */
export function classifyLayerTriggers(probe: LayerStyleProbe): ScrollLayerTrigger[] {
  const kinds: ScrollLayerTrigger[] = [];
  if (isActive(probe.willChange)) kinds.push('will_change');
  if (isActive(probe.transform)) kinds.push('transform');
  if (isActive(probe.filter)) kinds.push('filter');
  if (isActive(probe.backdropFilter)) kinds.push('backdrop_filter');
  if (isActive(probe.contain)) kinds.push('contain');
  if (isActive(probe.perspective)) kinds.push('perspective');
  return kinds;
}
