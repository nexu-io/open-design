// Why the scroll-freeze probe has not reported, laid out one gate at a time.
//
// The problem this solves
// ----------------------
// A user hit a 1493px freeze on a dogfood build — sixty times the reporting
// threshold — and PostHog received nothing. The transport was demonstrably
// alive (`client_long_task`, `client_resource_error` and `client_run_stuck`
// all arrived from the same `reportSafetyEvent` path) and the observer was
// demonstrably installed (its neighbours in the same install array were
// reporting). So the failure was somewhere in the probe's own chain of
// conditions — and the probe could not say which one, because it exposed no
// state at all.
//
// A silent observer is the worst kind: silence reads as "no defect". This
// module turns silence into a sentence. Every condition between "a wheel
// happened" and "an event was sent" gets an entry saying where it stands and
// what it would have to be.
//
// Why it is pure
// --------------
// Same reason `chat-scroll-freeze-detector.ts` is pure. The inputs are
// numbers and booleans the probe already holds; keeping the reasoning free of
// the DOM means the specs can drive the exact state a real failing machine
// was in, which jsdom could never produce on its own.

import {
  FREEZE_REQUESTED_PX,
  FREEZE_WHEEL_COUNT,
  MIN_UNREACHABLE_PX,
  type ScrollFreezeState,
  type ScrollGeometry,
  SNAP_BACK_MIN_PX,
  layoutHeldStill,
} from './chat-scroll-freeze-detector';

/**
 * One condition on the road to a report, in the order the probe meets them.
 *
 * The prerequisites come first (is anything even watching), then the surface
 * gates, then the verdict gates. Reading top to bottom is meant to answer
 * "how far did this get" without knowing the source.
 *
 * There is deliberately no session-level budget gate. One used to sit second in
 * this list, backed by a cap of three inside `attach()` — and that cap did not
 * throttle events, it stopped the probe attaching at all, so a session that
 * spent it had no ledger, no activity trail and no freeze signal for the rest
 * of its life while looking identical to a session that simply never froze
 * again. The cap is gone; do not reintroduce a gate for it here.
 */
export type ReportBlockerId =
  /** `installChatScrollFreezeObserver()` ran and has not been torn down. */
  | 'observer_installed'
  /** Geometry is only ever read inside a frame callback; there is no fallback. */
  | 'frame_scheduler'
  /** A chat log has been found and is being watched. */
  | 'surface_attached'
  /** …and is still in the document. */
  | 'element_connected'
  /** This surface has not already reported. */
  | 'surface_unreported'
  /** At least one geometry frame has run, so there is something to compare to. */
  | 'geometry_sampled'
  /** Enough of the log is out of reach to be worth calling a defect. */
  | 'unreachable_px'
  /** The stall streak is anchored at where the scroller actually is. */
  | 'stall_pinned'
  /** Consecutive stalled wheel events. */
  | 'stall_wheel_count'
  /** …and the distance they asked for. */
  | 'stall_requested_px'
  /** No scrollable box between the wheel target and the log ate the gesture. */
  | 'inner_scroller_free';

export interface ReportBlocker {
  id: ReportBlockerId;
  /** Does this condition currently permit a report? */
  ok: boolean;
  /** Where it stands right now, formatted for a human reading a console. */
  actual: string;
  /** What it would have to be. */
  needed: string;
  /** Why the gate exists, and what a failure here means. */
  note: string;
}

export interface ReportBlockerSurface {
  elementConnected: boolean;
  /** The probe's own one-report-per-surface latch. */
  reported: boolean;
  /** LIVE geometry, read at the moment the audit was asked for. */
  geometry: ScrollGeometry;
  state: ScrollFreezeState;
  /** Frozen verdicts the inner-scroller gate has thrown away on this surface. */
  innerScrollerSuppressions: number;
}

export interface ReportBlockerInput {
  installed: boolean;
  frameSchedulerAvailable: boolean;
  surface: ReportBlockerSurface | null;
}

function px(value: number): string {
  return `${Math.round(value)}px`;
}

/**
 * Walk every condition and say where it stands.
 *
 * The surface-level gates are OMITTED rather than guessed when nothing is
 * attached. An audit that fabricates "0px unreachable" for a surface that
 * does not exist is worse than a short audit, because the reader takes the
 * number at face value.
 */
export function evaluateReportBlockers(input: ReportBlockerInput): ReportBlocker[] {
  const out: ReportBlocker[] = [];

  out.push({
    id: 'observer_installed',
    ok: input.installed,
    actual: String(input.installed),
    needed: 'true',
    note: 'installChatScrollFreezeObserver() must have run and not been torn down.',
  });

  out.push({
    id: 'frame_scheduler',
    ok: input.frameSchedulerAvailable,
    actual: String(input.frameSchedulerAvailable),
    needed: 'requestAnimationFrame is a function',
    note:
      'Geometry is read only inside a frame callback. Where the browser has '
      + 'no frame callback the probe deliberately does not observe at all.',
  });

  const surface = input.surface;
  out.push({
    id: 'surface_attached',
    ok: surface != null,
    actual: surface == null ? 'nothing attached' : 'attached',
    needed: 'attached',
    note:
      'Attaches on the first scroll event out of [data-testid="chat-log"], or '
      + 'on a wheel over it. A log that never scrolled and was never wheeled '
      + 'is never watched.',
  });
  if (surface == null) return out;

  const { geometry, state } = surface;
  const layoutMax = Math.max(0, geometry.scrollHeight - geometry.clientHeight);
  const unreachablePx = layoutMax - geometry.scrollTop;

  out.push({
    id: 'element_connected',
    ok: surface.elementConnected,
    actual: String(surface.elementConnected),
    needed: 'true',
    note:
      'A conversation switch replaces the log node. The next scroll event '
      + 'rediscovers the replacement; until then the probe is holding a corpse.',
  });

  out.push({
    id: 'surface_unreported',
    ok: !surface.reported && !state.reported,
    actual: surface.reported || state.reported ? 'already reported' : 'not yet',
    needed: 'not yet',
    note: 'One report per chat log element. This is a success, not a failure.',
  });

  out.push({
    id: 'geometry_sampled',
    ok: state.lastScrollTop != null,
    actual: state.lastScrollTop == null ? 'no frame yet' : px(state.lastScrollTop),
    needed: 'at least one frame sampled',
    note:
      'The freeze verdict compares this frame against the previous one. '
      + 'Without a previous reading every notch is unclassifiable.',
  });

  out.push({
    id: 'unreachable_px',
    ok: unreachablePx > MIN_UNREACHABLE_PX,
    actual: px(unreachablePx),
    needed: `> ${MIN_UNREACHABLE_PX}px`,
    note:
      'How much of the log the wheel cannot reach. At or below the bar this '
      + 'is a scroller sitting at its end, which is the normal state of a '
      + 'chat panel and must never be reported.',
  });

  out.push({
    id: 'stall_pinned',
    ok: state.stallAt != null && state.stallAt === geometry.scrollTop,
    actual: state.stallAt == null ? 'no streak' : px(state.stallAt),
    needed: `pinned at ${px(geometry.scrollTop)}`,
    note:
      'The streak only survives while it is anchored at the current '
      + 'scrollTop. ANYTHING that moves the scroller between two notches — an '
      + 'auto-scroll write, a resize, a jump-to-bottom — makes the next notch '
      + 'read as movement and zeroes the streak.',
  });

  out.push({
    id: 'stall_wheel_count',
    ok: state.stallWheelCount >= FREEZE_WHEEL_COUNT,
    actual: `${state.stallWheelCount} notches`,
    needed: `>= ${FREEZE_WHEEL_COUNT}`,
    note: 'Consecutive downward wheel events that moved nothing.',
  });

  out.push({
    id: 'stall_requested_px',
    ok: state.stallRequestedPx >= FREEZE_REQUESTED_PX,
    actual: px(state.stallRequestedPx),
    needed: `>= ${FREEZE_REQUESTED_PX}px`,
    note:
      'Distance those notches asked for. Trackpad jitter against a paused '
      + 'scroller is not a defect; most of a viewport is.',
  });

  out.push({
    id: 'inner_scroller_free',
    ok: surface.innerScrollerSuppressions === 0,
    actual: `${surface.innerScrollerSuppressions} verdicts discarded`,
    needed: '0',
    note:
      'A frozen verdict is thrown away when a scrollable box between the '
      + 'wheel target and the log still had travel. A non-zero count here '
      + 'means the probe SAW the freeze and chose not to report it.',
  });

  return out;
}

/** `ready`, or `blocked_by=` every failing gate — not just the first. */
export function summariseBlockers(blockers: ReportBlocker[]): string {
  const failing = blockers.filter((blocker) => !blocker.ok).map((blocker) => blocker.id);
  return failing.length === 0 ? 'ready' : `blocked_by=${failing.join(',')}`;
}

/**
 * The other way in.
 *
 * `wheel_stall` needs four notches; `wheel_snap_back` needs one, because a
 * downward wheel that lands ABOVE where the scroller already was is something
 * only a stale compositor ceiling does. An audit that described only the
 * four-notch route would call a surface "not close" when it is one gesture
 * from a report.
 */
export interface SnapBackRoute {
  armed: boolean;
  lastScrollTop: number | null;
  /**
   * Whether the layout has held still since `lastScrollTop` was read.
   *
   * Reported beside `armed` rather than folded silently into it, because
   * "this route is disarmed" and "this route is disarmed BECAUSE the content
   * height moved under it" are different findings for an operator who has
   * just watched a chat refuse to scroll.
   */
  layoutStable: boolean;
  /** A downward notch landing at or below this reports on the spot. */
  reportsAtOrBelowPx: number | null;
  note: string;
}

export function describeSnapBackRoute(
  state: ScrollFreezeState,
  geometry: ScrollGeometry,
): SnapBackRoute {
  const previousTop = state.lastScrollTop;
  if (previousTop == null || state.reported) {
    return {
      armed: false,
      lastScrollTop: previousTop,
      layoutStable: false,
      reportsAtOrBelowPx: null,
      note: state.reported
        ? 'already reported on this surface'
        : 'no frame sampled yet, so there is nothing to snap back FROM',
    };
  }
  const landing = previousTop - SNAP_BACK_MIN_PX;
  const layoutMax = Math.max(0, geometry.scrollHeight - geometry.clientHeight);
  // The same predicate the verdict uses, against the geometry as it stands
  // right now. Restating the test here would let this audit call a route armed
  // that the detector would decline — the one disagreement neither side could
  // detect.
  const stable = layoutHeldStill(state, geometry);
  return {
    armed: stable && landing >= 0 && layoutMax - landing > MIN_UNREACHABLE_PX,
    lastScrollTop: previousTop,
    layoutStable: stable,
    reportsAtOrBelowPx: landing,
    note: stable
      ? `A downward notch landing at or below ${px(landing)} reports at once, `
        + `provided at least ${MIN_UNREACHABLE_PX}px is still unreachable there.`
      : 'The content or viewport height has moved since the last reading, so a '
        + 'backwards step here could be the browser\'s own scroll anchoring. '
        + 'This route stays shut until one frame is sampled against a settled '
        + 'layout.',
  };
}
