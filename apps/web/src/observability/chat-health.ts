// Chat panel runtime-health monitor.
//
// The chat panel is the one surface a user keeps open for hours while it
// accumulates unbounded state: messages, tool records, collapsed
// <details> blocks, artifact cards, an SSE stream writing into all of it.
// Every reliability problem we have shipped there — a 63k-event
// conversation taking 10.75s to open, a 2,799-node message list before
// lazy mounting, a renderer dying with `Reached heap limit` — was found
// by hand, after a user complained. This module turns those four failure
// modes into four numbers.
//
// What it answers, one event per question:
//
//   client_chat_first_paint      "How long until the user can read it?"
//   client_chat_dom_growth       "Is the DOM/heap growing without bound?"
//   client_chat_memory_pressure  "Who is about to OOM?"
//   client_chat_stream_health    "How janky is the UI while a run streams?"
//
// Transport is `reportSafetyEvent` — the consent-bypassing direct-fetch
// path that already carries `client_long_task`, `client_white_screen` and
// `client_boot_timing`. Stability ground truth must not disappear when a
// user opts out of product analytics; the reasoning is documented at the
// top of `analytics/error-tracking.ts`.
//
// Cost discipline. Measurement must never become the jank it measures:
//
//   - DOM/heap sampling runs on a 60s interval, inside
//     `requestIdleCallback`, and is skipped entirely while the tab is
//     hidden (a throttled background tab's numbers are not
//     representative and its beacons are pure noise).
//   - Node counting uses live `getElementsByTagName` collections, whose
//     `.length` is a native count, not an allocated NodeList.
//   - Jank is derived from the browser's own Long Tasks entries. We do
//     NOT sample `requestAnimationFrame`: `long-task.ts` already argues
//     rAF FPS counting is both a worse signal and a measurable cost, and
//     that decision stands here.
//   - A run window that saw zero long tasks emits nothing. Clean runs are
//     the common case; a zero-valued event per run would make this the
//     highest-volume event in the product while carrying no information.
//
// Privacy. Every field is structural — a count, a duration, a byte
// length, or a fixed enum. No message text, no file path, no prompt, no
// user-authored string is read, let alone transmitted.

import type {
  ChatDomGrowthProps,
  ChatFirstPaintProps,
  ChatMemoryPressureProps,
  ChatOpenKind,
  ChatSampleReason,
  ChatStreamHealthProps,
} from '@open-design/contracts/analytics';

import { reportSafetyEvent } from '../analytics/error-tracking';
import {
  chatBreadcrumbTrail,
  chatCorrelation,
  chatHeapTrend,
  chatMeasurementTrust,
  pushChatBreadcrumb,
  pushChatHeapSample,
} from './chat-context';

/** How often the DOM/heap curve is sampled while the surface is visible. */
const SAMPLE_INTERVAL_MS = 60_000;
/** Longest a streaming window may run before it is cut and reported. */
const STREAM_WINDOW_MS = 60_000;
/**
 * Heap-pressure bands. Each fires at most once per page session, on the
 * upward crossing only — a session that oscillates around 70% reports one
 * warning, not hundreds.
 */
const HEAP_PRESSURE_BANDS = [70, 85, 95] as const;
/**
 * An open intent older than this is stale — the user clicked, went to
 * lunch, and the surface mounted on their return. Attributing that wall
 * time to "chat open cost" would put a 20-minute outlier in the P95.
 */
const OPEN_INTENT_MAX_AGE_MS = 30_000;

const BYTES_PER_MB = 1024 * 1024;

interface OpenIntent {
  kind: ChatOpenKind;
  at: number;
}

interface HeapSnapshot {
  usedMb: number;
  limitMb: number;
  pressurePct: number;
}

/** Everything a caller can do to a live chat surface. */
export interface ChatSurfaceHandle {
  /**
   * The first message row is on screen and readable. Idempotent: only the
   * first call reports, so a StrictMode double-effect or a re-render
   * cannot manufacture a second, artificially fast sample.
   */
  markFirstPaint(input: { renderedRowCount: number }): void;
  /** Conversation length changed. Cheap; safe to call from a render effect. */
  setMessageCount(count: number): void;
  /** Virtualization toggled (the >80-message threshold crossed either way). */
  setVirtualized(virtualized: boolean): void;
  /** Raw agent stream events behind the conversation, once known. */
  setStreamEventCount(count: number): void;
  /** Take a DOM/heap sample now. Also evaluates the heap-pressure bands. */
  sample(reason: ChatSampleReason): void;
  /** A run began streaming into this surface. Opens a jank window. */
  runStarted(runId: string): void;
  /** A run reached a terminal state. Closes and reports the jank window. */
  runEnded(runId: string): void;
  /** Tear down observers and timers. Safe to call twice. */
  detach(): void;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let pendingIntent: OpenIntent | null = null;
let activeSurface: ChatSurface | null = null;
/** Bands already reported this page session. Per-session, not per-surface. */
const firedHeapBands = new Set<number>();

/**
 * Record that the user asked for a chat surface, before React has had a
 * chance to mount one.
 *
 * First paint has to be measured from intent, not from component
 * construction: routing, conversation fetch and message hydration all
 * happen before the chat component exists, and they are exactly where the
 * seconds go. Measuring from mount would report a healthy 600ms for an
 * open the user experienced as 10 seconds.
 */
export function markChatOpenIntent(kind: ChatOpenKind, at?: number): void {
  if (typeof performance === 'undefined') return;
  pendingIntent = { kind, at: typeof at === 'number' ? at : performance.now() };
}

/**
 * Begin monitoring a chat log element. Replaces (and tears down) any
 * previously attached surface, so a conversation switch cannot leave two
 * sets of observers running.
 */
export function openChatSurface(input: {
  element: HTMLElement;
  messageCount: number;
  virtualized: boolean;
  /** Raw agent stream events behind the conversation, when known. */
  streamEventCount?: number;
  /** Used when no intent was registered — e.g. a layout-driven remount. */
  fallbackOpenKind?: ChatOpenKind;
}): ChatSurfaceHandle {
  activeSurface?.detach();
  const surface = new ChatSurface(input);
  activeSurface = surface;
  return surface;
}

/**
 * Tell the active chat surface that a run started / ended, without holding
 * its handle.
 *
 * The handle lives in the chat component, but the authoritative run
 * lifecycle lives in the daemon provider (`providers/daemon.ts`), which has
 * no React context and must not acquire one. These two functions are the
 * seam: the provider names the run, and whichever surface is currently
 * mounted picks it up. Both no-op when no chat surface is attached — a run
 * started from a non-chat surface is simply not chat health.
 */
export function chatSurfaceRunStarted(runId: string): void {
  activeSurface?.runStarted(runId);
}

export function chatSurfaceRunEnded(runId: string): void {
  activeSurface?.runEnded(runId);
}

/** Take a DOM/heap sample of the active surface, if there is one. */
export function chatSurfaceSample(reason: ChatSampleReason): void {
  activeSurface?.sample(reason);
}

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

class ChatSurface implements ChatSurfaceHandle {
  private readonly element: HTMLElement;
  private readonly openKind: ChatOpenKind;
  private readonly openedAt: number;
  private readonly attachedAt: number;

  private messageCount: number;
  private virtualized: boolean;
  private streamEventCount: number | undefined;
  /**
   * Whether the tab was ever hidden since the current measurement window
   * opened. Read at emit time, when `visibilityState` has often flipped
   * back to `visible` and can no longer tell us the window was throttled.
   */
  private hiddenSincePaintWindow = false;
  private hiddenSinceStreamWindow = false;
  private onVisibilityChange: (() => void) | null = null;

  private paintReported = false;
  private detached = false;
  private runCount = 0;

  private sampleTimer: ReturnType<typeof setInterval> | null = null;

  private longTaskObserver: PerformanceObserver | null = null;
  private activeRunId: string | null = null;
  private windowStartedAt = 0;
  private windowBlockedMs = 0;
  private windowTaskCount = 0;
  private windowWorstMs = 0;
  private streamTimer: ReturnType<typeof setInterval> | null = null;

  constructor(input: {
    element: HTMLElement;
    messageCount: number;
    virtualized: boolean;
    streamEventCount?: number;
    fallbackOpenKind?: ChatOpenKind;
  }) {
    this.element = input.element;
    this.messageCount = input.messageCount;
    this.virtualized = input.virtualized;
    this.streamEventCount = input.streamEventCount;
    this.attachedAt = now();
    this.hiddenSincePaintWindow =
      typeof document !== 'undefined' && document.visibilityState === 'hidden';

    const intent = consumeOpenIntent(this.attachedAt);
    this.openKind = intent?.kind ?? input.fallbackOpenKind ?? 'remount';
    this.openedAt = intent?.at ?? this.attachedAt;

    this.sampleTimer = setInterval(() => {
      // A hidden tab is throttled: its timers fire late, its heap is not
      // representative of what the user is looking at, and nobody is
      // being annoyed by jank they cannot see.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      schedule(() => this.sample('interval'));
    }, SAMPLE_INTERVAL_MS);

    this.installLongTaskObserver();

    if (typeof document !== 'undefined') {
      this.onVisibilityChange = () => {
        if (document.visibilityState !== 'hidden') return;
        // Sticky, per window: once throttled, the window's timings are
        // suspect even if the user comes straight back.
        this.hiddenSincePaintWindow = true;
        this.hiddenSinceStreamWindow = true;
      };
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    pushChatBreadcrumb('surface_attach');
  }

  markFirstPaint(input: { renderedRowCount: number }): void {
    if (this.detached || this.paintReported) return;
    this.paintReported = true;
    pushChatBreadcrumb('first_paint');
    const props: ChatFirstPaintProps = {
      ...chatCorrelation(),
      ...chatMeasurementTrust({ hiddenDuringWindow: this.hiddenSincePaintWindow }),
      open_kind: this.openKind,
      duration_ms: Math.round(now() - this.openedAt),
      message_count: this.messageCount,
      rendered_row_count: input.renderedRowCount,
      virtualized: this.virtualized,
      dom_node_count: this.countDescendants(),
      details_count: this.element.getElementsByTagName('details').length,
      ...(this.streamEventCount != null
        ? { stream_event_count: this.streamEventCount }
        : {}),
    };
    reportSafetyEvent('client_chat_first_paint', { ...props });
  }

  setMessageCount(count: number): void {
    if (Number.isFinite(count)) this.messageCount = count;
  }

  setVirtualized(virtualized: boolean): void {
    if (this.virtualized === virtualized) return;
    this.virtualized = virtualized;
    pushChatBreadcrumb(virtualized ? 'virtualize_on' : 'virtualize_off');
  }

  setStreamEventCount(count: number): void {
    if (Number.isFinite(count)) this.streamEventCount = count;
  }

  sample(reason: ChatSampleReason): void {
    if (this.detached) return;
    const domNodeCount = this.countDescendants();
    const heap = readHeap();

    if (heap) pushChatHeapSample(heap.usedMb);

    const props: ChatDomGrowthProps = {
      ...chatCorrelation(),
      sample_reason: reason,
      message_count: this.messageCount,
      rendered_row_count: this.countRenderedRows(),
      virtualized: this.virtualized,
      dom_node_count: domNodeCount,
      details_count: this.element.getElementsByTagName('details').length,
      surface_age_ms: Math.round(now() - this.attachedAt),
      // Heap keys are omitted, never zeroed. A browser without
      // performance.memory reporting 0 would drag every average toward a
      // floor that does not exist.
      ...(heap
        ? {
            js_heap_used_mb: heap.usedMb,
            js_heap_limit_mb: heap.limitMb,
            heap_pressure_pct: heap.pressurePct,
          }
        : {}),
    };
    reportSafetyEvent('client_chat_dom_growth', { ...props });

    if (heap) this.evaluateHeapPressure(heap, domNodeCount);
  }

  runStarted(runId: string): void {
    if (this.detached) return;
    // A new run implicitly closes any window left open by a run whose
    // terminal event we never saw (reconnect, tab restore).
    if (this.activeRunId != null) this.flushStreamWindow(false);
    this.runCount += 1;
    this.activeRunId = runId;
    pushChatBreadcrumb('run_start');
    this.resetStreamWindow();
    if (this.streamTimer == null) {
      this.streamTimer = setInterval(() => {
        if (this.activeRunId == null) return;
        this.flushStreamWindow(false);
        this.resetStreamWindow();
      }, STREAM_WINDOW_MS);
    }
  }

  runEnded(runId: string): void {
    if (this.detached) return;
    if (this.activeRunId !== runId) return;
    pushChatBreadcrumb('run_end');
    this.flushStreamWindow(true);
    this.activeRunId = null;
    if (this.streamTimer != null) {
      clearInterval(this.streamTimer);
      this.streamTimer = null;
    }
  }

  detach(): void {
    if (this.detached) return;
    // Preserve a window that already saw jank; a conversation switch
    // mid-run is exactly when the panel is worst behaved.
    if (this.activeRunId != null) this.flushStreamWindow(false);
    pushChatBreadcrumb('surface_detach');
    this.detached = true;
    this.activeRunId = null;
    if (this.onVisibilityChange != null && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.onVisibilityChange = null;
    if (this.sampleTimer != null) clearInterval(this.sampleTimer);
    if (this.streamTimer != null) clearInterval(this.streamTimer);
    this.sampleTimer = null;
    this.streamTimer = null;
    try {
      this.longTaskObserver?.disconnect();
    } catch {
      // best-effort — teardown must never propagate
    }
    this.longTaskObserver = null;
    if (activeSurface === this) activeSurface = null;
  }

  // -- internals ------------------------------------------------------------

  private installLongTaskObserver(): void {
    if (typeof PerformanceObserver === 'undefined') return;
    if (PerformanceObserver.supportedEntryTypes?.includes?.('longtask') !== true) return;
    const observer = new PerformanceObserver((list) => {
      // Only tasks that land inside an open streaming window are ours.
      // Idle-time jank belongs to whatever else the app was doing and is
      // already covered by the global `client_long_task`.
      if (this.activeRunId == null) return;
      for (const entry of list.getEntries()) {
        const duration = entry.duration;
        if (typeof duration !== 'number' || duration <= 0) continue;
        this.windowBlockedMs += duration;
        this.windowTaskCount += 1;
        if (duration > this.windowWorstMs) this.windowWorstMs = duration;
      }
    });
    try {
      // Deliberately unbuffered: buffered entries predate the window and
      // would be misattributed to the run that happened to start next.
      observer.observe({ type: 'longtask' });
      this.longTaskObserver = observer;
    } catch {
      this.longTaskObserver = null;
    }
  }

  private resetStreamWindow(): void {
    this.hiddenSinceStreamWindow =
      typeof document !== 'undefined' && document.visibilityState === 'hidden';
    this.windowStartedAt = now();
    this.windowBlockedMs = 0;
    this.windowTaskCount = 0;
    this.windowWorstMs = 0;
  }

  private flushStreamWindow(runCompleted: boolean): void {
    // Silence is the signal for a healthy run. See the cost-discipline
    // note at the top of the file.
    if (this.windowTaskCount === 0) return;
    const windowMs = Math.max(1, Math.round(now() - this.windowStartedAt));
    const blockedMs = Math.round(this.windowBlockedMs);
    const props: ChatStreamHealthProps = {
      ...chatCorrelation(),
      ...chatMeasurementTrust({ hiddenDuringWindow: this.hiddenSinceStreamWindow }),
      window_ms: windowMs,
      blocked_ms: blockedMs,
      blocked_ratio_pct: Math.round((blockedMs / windowMs) * 100),
      long_task_count: this.windowTaskCount,
      worst_task_ms: Math.round(this.windowWorstMs),
      message_count: this.messageCount,
      dom_node_count: this.countDescendants(),
      virtualized: this.virtualized,
      run_completed: runCompleted,
      details_count: this.element.getElementsByTagName('details').length,
    };
    reportSafetyEvent('client_chat_stream_health', { ...props });
  }

  private evaluateHeapPressure(heap: HeapSnapshot, domNodeCount: number): void {
    // Report the highest band crossed, once. A session climbing straight
    // from 40% to 96% should say "95", not fire three events.
    let band: number | null = null;
    for (const candidate of HEAP_PRESSURE_BANDS) {
      if (heap.pressurePct >= candidate && !firedHeapBands.has(candidate)) band = candidate;
    }
    if (band == null) return;
    firedHeapBands.add(band);
    pushChatBreadcrumb('heap_band');
    const props: ChatMemoryPressureProps = {
      ...chatCorrelation(),
      threshold_pct: band,
      js_heap_used_mb: heap.usedMb,
      js_heap_limit_mb: heap.limitMb,
      heap_pressure_pct: heap.pressurePct,
      message_count: this.messageCount,
      dom_node_count: domNodeCount,
      surface_age_ms: Math.round(now() - this.attachedAt),
      run_count: this.runCount,
      details_count: this.element.getElementsByTagName('details').length,
      // The run-up, not just the moment. Without these two an OOM report
      // says "it happened" and nothing else.
      breadcrumbs: chatBreadcrumbTrail(),
      heap_trend_mb: chatHeapTrend(),
    };
    reportSafetyEvent('client_chat_memory_pressure', { ...props });
  }

  /**
   * Descendant count of the chat log subtree ONLY. Counting the document
   * would fold in the file viewer, the preview iframe wrapper and every
   * popover, so "chat DOM grew" would stop being a statement about chat.
   * `getElementsByTagName` returns a live collection whose `.length` is a
   * native count — no NodeList is materialised.
   */
  private countDescendants(): number {
    return this.element.getElementsByTagName('*').length;
  }

  private countRenderedRows(): number {
    return this.element.querySelectorAll(':scope > *').length;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function consumeOpenIntent(atAttach: number): OpenIntent | null {
  const intent = pendingIntent;
  pendingIntent = null;
  if (intent == null) return null;
  if (atAttach - intent.at > OPEN_INTENT_MAX_AGE_MS) return null;
  return intent;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * `performance.memory` is a non-standard Chromium extension. Firefox and
 * Safari expose nothing, and Chrome quantises the values unless the page
 * is cross-origin isolated. Callers must treat a null return as "this
 * browser cannot answer", never as zero.
 */
function readHeap(): HeapSnapshot | null {
  if (typeof performance === 'undefined') return null;
  const memory = (
    performance as unknown as {
      memory?: { usedJSHeapSize?: unknown; jsHeapSizeLimit?: unknown };
    }
  ).memory;
  if (memory == null) return null;
  const used = memory.usedJSHeapSize;
  const limit = memory.jsHeapSizeLimit;
  if (typeof used !== 'number' || typeof limit !== 'number') return null;
  if (!(used > 0) || !(limit > 0)) return null;
  return {
    usedMb: Math.round(used / BYTES_PER_MB),
    limitMb: Math.round(limit / BYTES_PER_MB),
    pressurePct: Math.round((used / limit) * 100),
  };
}

/**
 * Run off the critical path when the browser can tell us it is idle.
 *
 * Where `requestIdleCallback` is missing (Safari < 16.4, jsdom) we run
 * inline rather than deferring through `setTimeout`: the caller is
 * already on a 60-second timer, so it is by construction not a hot path,
 * and an inline call keeps the ordering deterministic.
 */
function schedule(fn: () => void): void {
  const rIC = (
    globalThis as unknown as {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (typeof rIC === 'function') {
    rIC(fn, { timeout: 2_000 });
    return;
  }
  fn();
}

/** Test-only — flush module state between cases. */
export function __resetChatHealthForTest(): void {
  activeSurface?.detach();
  activeSurface = null;
  pendingIntent = null;
  firedHeapBands.clear();
}
