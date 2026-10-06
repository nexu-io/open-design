// Chat input-latency observer (INP for the chat panel).
//
// Long tasks tell us the main thread was blocked. They do not tell us
// whether a user was waiting on it. `client_chat_interaction_latency`
// closes that gap: it measures the delay between a real interaction —
// a keystroke in the composer, a click on a tool row — and the frame that
// answered it, using the browser's Event Timing API (the primitive behind
// Core Web Vitals' INP).
//
// This is the metric that matches the complaint. "Typing lags while it's
// generating" is not a long-task count; it is an interaction that took
// 700ms to paint. The `streaming` breakdown is the whole point of the
// event: the same UI can be fine at rest and unusable mid-run, and only a
// paired comparison shows it.
//
// Volume control, in three layers, because an un-throttled interaction
// metric is the classic case of telemetry becoming the problem:
//
//   1. `durationThreshold` filters IN THE BROWSER. Interactions faster
//      than 200 ms never reach our JavaScript at all — zero cost for the
//      overwhelming majority of interactions, which are fine.
//   2. We keep only the WORST interaction per 30 s window. A user
//      hammering keys through a janky minute yields two events, not two
//      hundred, and the worst case is the one worth knowing.
//   3. A hard per-session cap. Past it we stop reporting, because the
//      hundredth slow interaction in one session adds nothing the first
//      twenty did not already establish.
//
// Scope: only interactions inside the chat panel are reported. An event
// named `client_chat_*` that also counts clicks in the file viewer would
// make "chat input latency" untrue, and the file viewer has its own
// observability surface.

import type { ChatInteractionLatencyProps } from '@open-design/contracts/analytics';

import { reportSafetyEvent } from '../analytics/error-tracking';
import { chatCorrelation } from './chat-context';

/**
 * 200 ms. The RAIL "user notices" boundary is 100 ms, but the browser
 * already exposes a 104 ms floor of its own and the 100–200 ms band is
 * dominated by ordinary React work we would not act on. 200 ms is the
 * point where an interaction reads as "the app hesitated".
 */
const REPORT_THRESHOLD_MS = 200;
const WINDOW_MS = 30_000;
const MAX_REPORTS_PER_SESSION = 20;

type ChatArea = ChatInteractionLatencyProps['area'];

interface WindowState {
  worstMs: number;
  count: number;
  eventName: string;
  area: ChatArea;
  streaming: boolean;
}

let observer: PerformanceObserver | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let current: WindowState | null = null;
let reportedThisSession = 0;
let installed = false;

export function installChatInteractionObserver(): () => void {
  if (installed) return () => undefined;
  if (typeof PerformanceObserver === 'undefined') return () => undefined;
  // Event Timing is Chromium-only today. Safari and Firefox report the
  // entry type as unsupported; observe() would throw or silently no-op.
  if (PerformanceObserver.supportedEntryTypes?.includes?.('event') !== true) {
    return () => undefined;
  }
  installed = true;

  observer = new PerformanceObserver((list) => {
    if (reportedThisSession >= MAX_REPORTS_PER_SESSION) return;
    for (const entry of list.getEntries()) {
      const timing = entry as PerformanceEventTiming;
      const duration = timing.duration;
      if (typeof duration !== 'number' || duration < REPORT_THRESHOLD_MS) continue;
      const area = resolveArea(timing.target ?? null);
      // Not chat, not our story.
      if (area === 'other') continue;
      if (current == null || duration > current.worstMs) {
        current = {
          worstMs: duration,
          count: (current?.count ?? 0) + 1,
          // `entry.name` on an Event Timing entry is the DOM event type
          // ("keydown", "pointerup"). It is a fixed vocabulary, never a
          // selector and never user text.
          eventName: typeof timing.name === 'string' ? timing.name : 'unknown',
          area,
          streaming: isStreaming(),
        };
      } else {
        current.count += 1;
      }
    }
  });

  try {
    observer.observe({
      type: 'event',
      buffered: true,
      // Filtering here rather than in JS is the difference between
      // observing every interaction and observing only slow ones.
      durationThreshold: REPORT_THRESHOLD_MS,
    } as PerformanceObserverInit);
  } catch {
    observer = null;
    installed = false;
    return () => undefined;
  }

  flushTimer = setInterval(flush, WINDOW_MS);

  return () => {
    try {
      observer?.disconnect();
    } catch {
      // best-effort teardown
    }
    if (flushTimer != null) clearInterval(flushTimer);
    observer = null;
    flushTimer = null;
    current = null;
    installed = false;
  };
}

function flush(): void {
  const state = current;
  current = null;
  if (state == null) return;
  // The cap is enforced in ONE place — the observer callback, which stops
  // accumulating (and stops doing DOM work) once we are done reporting.
  // A second check here would be dead code: by the time the cap is hit the
  // observer has stopped filling `current`, so this function has nothing
  // left to suppress. Two mechanisms for one rule also make the rule
  // untestable — remove either and the spec stays green.
  reportedThisSession += 1;

  const correlation = chatCorrelation();
  const props: ChatInteractionLatencyProps = {
    ...correlation,
    inp_ms: Math.round(state.worstMs),
    interaction_count: state.count,
    event_name: state.eventName,
    area: state.area,
    streaming: state.streaming,
  };
  reportSafetyEvent('client_chat_interaction_latency', { ...props });
}

/**
 * A run is in flight exactly when the correlation context is carrying a
 * `run_id`; the wiring clears it at every terminal state. Deriving the
 * flag instead of maintaining a second one means the two can never
 * disagree about whether the app was streaming.
 */
function isStreaming(): boolean {
  return chatCorrelation().run_id != null;
}

/**
 * Attribute an interaction to a chat region.
 *
 * Prefers an explicit `data-od-chat-area` marker. Until that is wired it
 * falls back to the two container test ids that already ship in
 * production markup, so the metric is useful on day one rather than
 * blocked on a component change we do not own.
 */
function resolveArea(target: Node | null): ChatArea {
  const el = target instanceof Element ? target : null;
  if (el == null) return 'other';
  try {
    const marked = el.closest('[data-od-chat-area]');
    const explicit = marked?.getAttribute('data-od-chat-area');
    if (explicit === 'composer' || explicit === 'chat_log') return explicit;
    if (el.closest('[data-testid="chat-composer"]') != null) return 'composer';
    if (el.closest('[data-testid="chat-log"]') != null) return 'chat_log';
    return 'other';
  } catch {
    return 'other';
  }
}

/** Test-only — flush module state between cases. */
export function __resetChatInteractionForTest(): void {
  current = null;
  reportedThisSession = 0;
  if (flushTimer != null) clearInterval(flushTimer);
  flushTimer = null;
  try {
    observer?.disconnect();
  } catch {
    // best-effort
  }
  observer = null;
  installed = false;
}
