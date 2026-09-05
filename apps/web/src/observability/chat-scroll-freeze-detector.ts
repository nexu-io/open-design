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

// ---------------------------------------------------------------------------
// Parallel activity
// ---------------------------------------------------------------------------

/**
 * What else the page was doing.
 *
 * The geometry half of this module dates the freeze — it says the
 * compositor's ceiling belongs to a 674px-tall content box. It cannot say
 * what ELSE was moving at that instant, and after 225 synthetic
 * reproduction attempts that is the only lead left: the trigger is
 * something the surrounding UI does, not something the scroller does to
 * itself.
 *
 * So the probe keeps a bounded trail of parallel activity and ships two
 * slices of it with the report: the window around the birth of the scroll
 * node, and the run-up to the verdict.
 *
 * Kinds are an ENUM, and the enum is all that is ever reported. Class
 * names and test ids are read to derive a `ChatActivityRole` and then
 * dropped; no developer-authored string and no user-authored string leaves
 * the browser.
 */
export type ChatActivityKind =
  /** A node mounted or unmounted as a SIBLING of the chat log. */
  | 'shell_child_added'
  | 'shell_child_removed'
  /** …and inside the bottom float slot, where the two pills swap. */
  | 'float_child_added'
  | 'float_child_removed'
  | 'float_attr'
  /** `.chat-jump-btn` gained or lost `.chat-jump-btn-active`. */
  | 'jump_shown'
  | 'jump_hidden'
  /** Some other class/style churn on the jump button. */
  | 'jump_attr'
  | 'log_class'
  | 'log_style'
  | 'ancestor_class'
  | 'ancestor_style'
  | 'anim_start'
  | 'anim_end'
  | 'trans_start'
  | 'trans_end'
  | 'streaming_on'
  | 'streaming_off'
  | 'doc_hidden'
  | 'doc_visible'
  /** The chat log's own box changed size. */
  | 'log_resize'
  /** …and the box that gives it its height. */
  | 'host_resize'
  /** The anchor: content first exceeded the viewport. */
  | 'scroll_node_born';

/** Which moving part produced an entry. Derived from class/test id, then discarded. */
export type ChatActivityRole =
  | 'jump'
  | 'float'
  | 'plan_pill'
  | 'question_form'
  | 'skeleton'
  | 'log'
  | 'shell'
  | 'assistant_msg'
  | 'user_msg'
  | 'message'
  /** `.chat-log-tail-spacer` — the dynamic spacer that pads a pinned turn. */
  | 'tail_spacer'
  | 'other';

export interface ChatActivityEntry {
  kind: ChatActivityKind;
  role: ChatActivityRole;
  /** Clock reading when the FIRST occurrence of a coalesced run landed. */
  at: number;
  /** How many identical occurrences collapsed into this entry. */
  count: number;
}

/**
 * A ring buffer, not a list.
 *
 * 64 entries is roughly two seconds of a busy chat surface, which is the
 * span the report actually asks for. Growing without bound would let a long
 * session's trail outweigh everything else in the event; keeping the
 * NEWEST 64 means the entries nearest the freeze always survive, which is
 * the half that matters.
 */
export interface ChatActivityLog {
  readonly capacity: number;
  /** Circular storage; `head` is the next slot to write. */
  readonly slots: ChatActivityEntry[];
  head: number;
  size: number;
  /** Entries evicted before the report, so the trail cannot look complete when it is not. */
  dropped: number;
}

export const ACTIVITY_CAPACITY = 64;
/**
 * One class flip transitions several properties, so `transitionstart`
 * arrives two or three times within a frame. Collapsing a run into one
 * entry with a count keeps a single visual event from evicting three
 * others.
 */
export const ACTIVITY_COALESCE_MS = 16;
/** How far either side of the scroll node's birth the report looks. */
export const ACTIVITY_NEAR_WINDOW_MS = 500;
/** …and how far back from the verdict. */
export const ACTIVITY_PRE_FREEZE_MS = 2_000;

export function createActivityLog(capacity: number = ACTIVITY_CAPACITY): ChatActivityLog {
  return { capacity: Math.max(1, capacity), slots: [], head: 0, size: 0, dropped: 0 };
}

/**
 * Append one observation. Mutates in place and allocates at most one
 * object, because this is called from event handlers on a page that is
 * already struggling.
 */
export function pushActivity(
  log: ChatActivityLog,
  kind: ChatActivityKind,
  role: ChatActivityRole,
  at: number,
): void {
  const newest = log.size === 0
    ? null
    : log.slots[(log.head - 1 + log.capacity) % log.capacity];
  if (
    newest != null
    && newest.kind === kind
    && newest.role === role
    && at - newest.at <= ACTIVITY_COALESCE_MS
  ) {
    // `at` deliberately stays at the first occurrence: a burst is dated by
    // when it STARTED, which is the number a human lines up against the
    // birth of the scroll node.
    newest.count += 1;
    return;
  }
  const entry: ChatActivityEntry = { kind, role, at, count: 1 };
  if (log.size < log.capacity) {
    log.slots[log.head] = entry;
    log.size += 1;
  } else {
    log.slots[log.head] = entry;
    log.dropped += 1;
  }
  log.head = (log.head + 1) % log.capacity;
}

/** Oldest first. */
export function listActivity(log: ChatActivityLog): ChatActivityEntry[] {
  const out: ChatActivityEntry[] = [];
  const start = log.size < log.capacity ? 0 : log.head;
  for (let i = 0; i < log.size; i += 1) {
    const entry = log.slots[(start + i) % log.capacity];
    if (entry != null) out.push(entry);
  }
  return out;
}

/**
 * Entries within `radiusMs` either side of a moment.
 *
 * Both sides on purpose. "The jump button lit up 40ms AFTER the scroll node
 * was created" and "…120ms BEFORE" are different findings, and a trailing
 * window can only ever tell the first story.
 */
export function sliceActivityWindow(
  entries: ChatActivityEntry[],
  centerAt: number,
  radiusMs: number,
): ChatActivityEntry[] {
  return entries.filter((entry) => Math.abs(entry.at - centerAt) <= radiusMs);
}

/** Entries in the `spanMs` leading up to a moment. */
export function sliceActivityBefore(
  entries: ChatActivityEntry[],
  endAt: number,
  spanMs: number,
): ChatActivityEntry[] {
  return entries.filter((entry) => entry.at <= endAt && entry.at >= endAt - spanMs);
}

/**
 * `kind:role@ms` — or `kind@ms` when the role says nothing — oldest first,
 * with `xN` for a coalesced run.
 *
 * A flat string for the same reason `serialiseTransitions` is one: this
 * trail is read by a human staring at a single bad event in PostHog's
 * property inspector, and an array of objects becomes a chore to unfold.
 */
export function serialiseActivity(
  entries: ChatActivityEntry[],
  originAt: number,
): string {
  return entries
    .map((entry) => {
      const role = entry.role === 'other' ? '' : `:${entry.role}`;
      const repeat = entry.count > 1 ? `x${entry.count}` : '';
      return `${entry.kind}${role}@${Math.round(entry.at - originAt)}${repeat}`;
    })
    .join(',');
}

/** `kind=count` totals, sorted, so one glance says what dominated. */
export function countActivity(entries: ChatActivityEntry[]): string {
  const totals = new Map<ChatActivityKind, number>();
  for (const entry of entries) {
    totals.set(entry.kind, (totals.get(entry.kind) ?? 0) + entry.count);
  }
  return [...totals.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([kind, count]) => `${kind}=${count}`)
    .join(',');
}

/**
 * Name the moving part behind an element.
 *
 * Pure, and string-in/enum-out, for two reasons. It is specifiable without
 * a browser — `getComputedStyle` is useless in jsdom and irrelevant here
 * anyway. And it makes the privacy boundary structural rather than
 * conventional: class names go in, an enum member comes out, and the caller
 * has nothing else to leak.
 *
 * Order matters. `question-form-loading` carries `question-form` as well,
 * so the more specific token has to be tested first, and every test is on a
 * whole class TOKEN — `not-chat-logger` is not the chat log.
 */
export function classifyActivityRole(
  className: string,
  testId: string | null,
): ChatActivityRole {
  const tokens = new Set(className.split(/\s+/).filter(Boolean));
  const has = (token: string): boolean => tokens.has(token);

  if (testId === 'chat-jump-btn' || has('chat-jump-btn') || has('chat-jump-btn-active')) {
    return 'jump';
  }
  if (testId === 'chat-plan-pill' || has('chat-plan-pill')) return 'plan_pill';
  if (testId === 'chat-bottom-float-slot' || has('chat-bottom-float-slot')) return 'float';
  if (testId === 'question-form-loading' || has('question-form-loading')) return 'skeleton';
  if (has('question-form')) return 'question_form';
  if (has('chat-log-tail-spacer')) return 'tail_spacer';
  if (testId === 'chat-log' || has('chat-log')) return 'log';
  if (has('chat-log-viewport') || has('chat-log-wrap')) return 'shell';
  if (has('msg')) {
    // Assistant and user messages are kept apart because the one real
    // capture had a 1188px assistant message doing every pixel of the
    // growing; "a message got taller" would have thrown that away.
    if (has('assistant')) return 'assistant_msg';
    if (has('user')) return 'user_msg';
    return 'message';
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// The shortfall ledger
// ---------------------------------------------------------------------------

/**
 * The ceiling does not snap. It drifts.
 *
 * A probe on a user's machine caught a live freeze, and it overturns the
 * "stale from birth" model this file was written around. Six consecutive
 * rounds, layout unchanged at 851px of travel:
 *
 *   reached 851 → short 0
 *   reached 850 → short 1
 *   reached 846 → short 5
 *   reached 842 → short 9
 *   reached 839 → short 12
 *   reached 824 → short 27   ← the round that got reported
 *
 * The compositor's copy of "how far this scrolls" falls a little further
 * behind on each content change and the deficit accumulates. The 91 /
 * 1673px case measured earlier is the same mechanism run to the floor, not
 * a second defect — which means the interesting moment is not the freeze,
 * it is the FIRST content change the compositor failed to keep up with.
 *
 * The same capture also cleared the decorations: no thinking block, no tool
 * row, no question form, no error card, no iframe, no inner scroller. One
 * user message, one 1188px assistant message. So a ledger that pairs
 * "content became this tall" with "the wheel could only get this far" is
 * worth more than any amount of describing what was on screen.
 *
 * Pure, for the same reason the rest of this file is: jsdom performs no
 * layout, so the only way to spec the arithmetic is to feed it numbers.
 */
export interface ContentStepEntry {
  at: number;
  /** `scrollHeight` after the change. */
  contentPx: number;
  /** `clientHeight` at the same instant. */
  viewportPx: number;
  /** `scrollHeight - clientHeight` — the ceiling layout would permit. */
  layoutMax: number;
  /** Which child grew, when one could be attributed. */
  growthRole?: ChatActivityRole;
  /** …and by how much. */
  growthPx?: number;
}

export interface CeilingProbeInput {
  at: number;
  /** The furthest `scrollTop` a downward wheel actually achieved. */
  reachedPx: number;
  layoutMax: number;
  contentPx: number;
}

export interface CeilingProbeEntry extends CeilingProbeInput {
  /** `layoutMax - reachedPx`. The deficit for this round. */
  shortfallPx: number;
  /** Consecutive identical rounds collapsed into this one. */
  count: number;
}

/** The first round where the compositor fell behind, with its content change. */
export interface FirstShortfall {
  at: number;
  shortfallPx: number;
  reachedPx: number;
  layoutMax: number;
  contentPx: number;
  growthRole?: ChatActivityRole;
  growthPx?: number;
}

export interface ShortfallLedger {
  readonly capacity: number;
  /** Newest-last; evicts from the front. */
  steps: ContentStepEntry[];
  probes: CeilingProbeEntry[];
  /** Totals INCLUDING what was evicted, so a trimmed ring cannot read as complete. */
  stepCount: number;
  probeCount: number;
  /**
   * Never evicted. A streaming turn produces content changes for as long as
   * it runs, so by the time a freeze is called the ring has long since
   * rolled past the moment the deficit opened — which is the one moment
   * worth keeping.
   */
  first: FirstShortfall | null;
}

/** Rounds of each kind kept. Read by eye, so small. */
export const LEDGER_CAPACITY = 32;
/**
 * Below this a shortfall is sub-pixel slack, not drift. The captured
 * sequence starts drifting at exactly 1px, so the bar cannot be higher.
 */
export const SHORTFALL_MIN_PX = 1;

export function createShortfallLedger(
  capacity: number = LEDGER_CAPACITY,
): ShortfallLedger {
  return {
    capacity: Math.max(1, capacity),
    steps: [],
    probes: [],
    stepCount: 0,
    probeCount: 0,
    first: null,
  };
}

export function recordContentStep(ledger: ShortfallLedger, entry: ContentStepEntry): void {
  ledger.stepCount += 1;
  ledger.steps.push(entry);
  if (ledger.steps.length > ledger.capacity) ledger.steps.shift();
}

/**
 * One round of "the wheel asked to go further and this is where it
 * stopped".
 *
 * Consecutive identical rounds collapse: a user wheeling at a dead bottom
 * produces a dozen of them, and spending a dozen ring slots on `851/851/0`
 * would evict the drift they are sitting next to.
 */
export function recordCeilingProbe(
  ledger: ShortfallLedger,
  input: CeilingProbeInput,
): void {
  ledger.probeCount += 1;
  const shortfallPx = Math.max(0, input.layoutMax - input.reachedPx);
  const newest = ledger.probes[ledger.probes.length - 1];
  if (
    newest != null
    && newest.reachedPx === input.reachedPx
    && newest.layoutMax === input.layoutMax
  ) {
    newest.count += 1;
  } else {
    ledger.probes.push({ ...input, shortfallPx, count: 1 });
    if (ledger.probes.length > ledger.capacity) ledger.probes.shift();
  }

  if (ledger.first != null || shortfallPx < SHORTFALL_MIN_PX) return;
  const step = ledger.steps[ledger.steps.length - 1];
  ledger.first = {
    at: input.at,
    shortfallPx,
    reachedPx: input.reachedPx,
    layoutMax: input.layoutMax,
    contentPx: input.contentPx,
    ...(step?.growthRole != null ? { growthRole: step.growthRole } : {}),
    ...(step?.growthPx != null ? { growthPx: step.growthPx } : {}),
  };
}

/** `ms:cCONTENT/vVIEWPORT/mLAYOUTMAX+role:grew`, oldest first. */
export function serialiseContentSteps(
  steps: ContentStepEntry[],
  originAt: number,
): string {
  return steps
    .map((step) => {
      const growth = step.growthRole != null && step.growthPx != null
        ? `+${step.growthRole}:${Math.round(step.growthPx)}`
        : '';
      return `${Math.round(step.at - originAt)}:c${Math.round(step.contentPx)}`
        + `/v${Math.round(step.viewportPx)}/m${Math.round(step.layoutMax)}${growth}`;
    })
    .join(',');
}

/** `ms:rREACHED/mLAYOUTMAX/sSHORTFALL`, oldest first, `xN` for a collapsed run. */
export function serialiseCeilingProbes(
  probes: CeilingProbeEntry[],
  originAt: number,
): string {
  return probes
    .map((probe) => {
      const repeat = probe.count > 1 ? `x${probe.count}` : '';
      return `${Math.round(probe.at - originAt)}:r${Math.round(probe.reachedPx)}`
        + `/m${Math.round(probe.layoutMax)}/s${Math.round(probe.shortfallPx)}${repeat}`;
    })
    .join(',');
}
