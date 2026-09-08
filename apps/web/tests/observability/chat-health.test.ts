// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearExceptionTrackingContext,
  setExceptionTrackingContext,
} from '../../src/analytics/error-tracking';
import {
  __resetChatHealthForTest,
  markChatOpenIntent,
  openChatSurface,
} from '../../src/observability/chat-health';

/**
 * These specs pin the four things the chat-health monitor exists to
 * answer, in the order a triager reads them:
 *
 *   1. "How long until the user can read the conversation?"  → first_paint
 *   2. "Is the DOM growing without bound?"                   → dom_growth
 *   3. "Who is about to run out of heap?"                    → memory_pressure
 *   4. "How janky is the UI while a run streams?"            → stream_health
 *
 * Every assertion is on a STRUCTURAL field. If any of these ever needs a
 * message body, a file path or a prompt to be meaningful, the metric is
 * wrong and should be deleted rather than widened.
 */

const fetchMock = vi.fn();
const ORIGINAL_FETCH = globalThis.fetch;

// A controllable monotonic clock. We drive `performance.now()` directly
// rather than leaning on fake timers so duration assertions are exact
// regardless of which clocks vitest chooses to fake.
let clock = 0;
function advanceClock(ms: number): void {
  clock += ms;
}

// Captured `longtask` PerformanceObserver callbacks, so a test can feed
// synthetic long tasks through the real observer code path (jsdom ships
// no PerformanceObserver at all).
type ObserverCallback = (list: { getEntries: () => unknown[] }) => void;
let longTaskCallbacks: ObserverCallback[] = [];

function emitLongTask(durationMs: number, startTime = clock): void {
  const entry = { duration: durationMs, startTime, name: 'self', entryType: 'longtask' };
  for (const cb of longTaskCallbacks) {
    cb({ getEntries: () => [entry] });
  }
}

class FakePerformanceObserver {
  static supportedEntryTypes = ['longtask', 'event'];
  private readonly callback: ObserverCallback;
  constructor(callback: ObserverCallback) {
    this.callback = callback;
  }
  observe(options: { type?: string }): void {
    if (options?.type === 'longtask') longTaskCallbacks.push(this.callback);
  }
  disconnect(): void {
    longTaskCallbacks = longTaskCallbacks.filter((cb) => cb !== this.callback);
  }
  takeRecords(): unknown[] {
    return [];
  }
}

function setHeap(usedBytes: number | null, limitBytes = 2_000_000_000): void {
  const perf = performance as unknown as { memory?: unknown };
  if (usedBytes == null) {
    delete perf.memory;
    return;
  }
  perf.memory = {
    usedJSHeapSize: usedBytes,
    totalJSHeapSize: usedBytes,
    jsHeapSizeLimit: limitBytes,
  };
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

/** A chat log container with `rows` message rows, each holding a <details>. */
function buildChatLog(rows: number): HTMLElement {
  const log = document.createElement('div');
  log.className = 'chat-log';
  for (let i = 0; i < rows; i += 1) {
    const row = document.createElement('div');
    row.className = 'chat-row';
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    details.appendChild(summary);
    row.appendChild(details);
    log.appendChild(row);
  }
  document.body.appendChild(log);
  return log;
}

beforeEach(() => {
  clock = 0;
  longTaskCallbacks = [];
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  setExceptionTrackingContext({
    apiKey: 'phc_test',
    host: 'https://us.i.posthog.com',
    distinctId: 'chat-health-test',
  });
  (globalThis as unknown as { PerformanceObserver: unknown }).PerformanceObserver =
    FakePerformanceObserver;
  // Fake timers must be installed BEFORE the performance.now spy: sinon's
  // fake clock installs its own performance.now and would silently
  // replace ours, making every duration read 0.
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  setHeap(null);
  document.body.innerHTML = '';
  __resetChatHealthForTest();
});

afterEach(() => {
  __resetChatHealthForTest();
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearExceptionTrackingContext();
  globalThis.fetch = ORIGINAL_FETCH;
  setHeap(null);
  document.body.innerHTML = '';
});

describe('observability/chat-health — first paint', () => {
  it('measures from the open intent, not from surface construction', () => {
    // The user clicks a conversation at t=0. React does routing work,
    // fetches, and only mounts the chat surface at t=400. The number the
    // user feels is 1000ms, not the 600ms the component was alive.
    markChatOpenIntent('conversation_switch');
    advanceClock(400);
    const log = buildChatLog(12);
    const handle = openChatSurface({ element: log, messageCount: 12, virtualized: false });
    advanceClock(600);
    handle.markFirstPaint({ renderedRowCount: 12 });

    const [paint] = eventsNamed('client_chat_first_paint');
    expect(paint).toBeDefined();
    expect(paint?.duration_ms).toBe(1000);
    expect(paint?.open_kind).toBe('conversation_switch');
    expect(paint?.message_count).toBe(12);
    expect(paint?.rendered_row_count).toBe(12);
    expect(paint?.virtualized).toBe(false);
    // 12 rows × (row + details + summary) = 36 descendants.
    expect(paint?.dom_node_count).toBe(36);
  });

  it('emits exactly once per surface even if the paint marker re-fires', () => {
    // React StrictMode double-invokes effects; a re-render must not
    // manufacture a second, faster first-paint sample that drags the
    // P50 down and hides the real regression.
    markChatOpenIntent('cold_boot');
    const log = buildChatLog(3);
    const handle = openChatSurface({ element: log, messageCount: 3, virtualized: false });
    advanceClock(100);
    handle.markFirstPaint({ renderedRowCount: 3 });
    advanceClock(5);
    handle.markFirstPaint({ renderedRowCount: 3 });

    expect(eventsNamed('client_chat_first_paint')).toHaveLength(1);
  });

  it('falls back to remount when no open intent was registered', () => {
    const log = buildChatLog(1);
    const handle = openChatSurface({ element: log, messageCount: 1, virtualized: false });
    handle.markFirstPaint({ renderedRowCount: 1 });
    expect(eventsNamed('client_chat_first_paint')[0]?.open_kind).toBe('remount');
  });
});

describe('observability/chat-health — DOM growth', () => {
  it('counts nodes inside the chat log only, never the whole document', () => {
    // A sibling panel (file viewer, preview iframe wrapper) must not
    // inflate the chat DOM number, or "chat DOM grew" stops meaning
    // anything about chat.
    const noise = document.createElement('div');
    for (let i = 0; i < 50; i += 1) noise.appendChild(document.createElement('span'));
    document.body.appendChild(noise);

    const log = buildChatLog(4);
    const handle = openChatSurface({ element: log, messageCount: 4, virtualized: false });
    handle.markFirstPaint({ renderedRowCount: 4 });
    handle.sample('conversation_open');

    const [growth] = eventsNamed('client_chat_dom_growth');
    expect(growth?.dom_node_count).toBe(12);
    expect(growth?.details_count).toBe(4);
    expect(growth?.sample_reason).toBe('conversation_open');
  });

  it('omits heap fields entirely when performance.memory is unavailable', () => {
    // Safari and Firefox ship no performance.memory. Emitting 0 there
    // would poison every heap average with a fake floor.
    setHeap(null);
    const log = buildChatLog(2);
    const handle = openChatSurface({ element: log, messageCount: 2, virtualized: false });
    handle.sample('interval');

    const [growth] = eventsNamed('client_chat_dom_growth');
    expect(growth).toBeDefined();
    expect(growth && 'js_heap_used_mb' in growth).toBe(false);
    expect(growth && 'heap_pressure_pct' in growth).toBe(false);
  });

  it('does not sample on the interval while the tab is hidden', () => {
    // A backgrounded tab is throttled and its heap is not representative;
    // sampling it just burns beacons and skews the distribution.
    const log = buildChatLog(2);
    const handle = openChatSurface({ element: log, messageCount: 2, virtualized: false });
    handle.markFirstPaint({ renderedRowCount: 2 });
    fetchMock.mockClear();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    vi.advanceTimersByTime(5 * 60_000);
    expect(eventsNamed('client_chat_dom_growth')).toHaveLength(0);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    vi.advanceTimersByTime(60_000);
    expect(eventsNamed('client_chat_dom_growth').length).toBeGreaterThan(0);
  });
});

describe('observability/chat-health — memory pressure', () => {
  it('fires once per threshold band, edge-triggered', () => {
    const limit = 1_000_000_000;
    const log = buildChatLog(2);
    const handle = openChatSurface({ element: log, messageCount: 2, virtualized: false });

    setHeap(0.5 * limit, limit); // 50% — below the first band
    handle.sample('interval');
    expect(eventsNamed('client_chat_memory_pressure')).toHaveLength(0);

    setHeap(0.72 * limit, limit); // crosses 70
    handle.sample('interval');
    setHeap(0.75 * limit, limit); // still in the 70 band — must not re-fire
    handle.sample('interval');
    let fired = eventsNamed('client_chat_memory_pressure');
    expect(fired).toHaveLength(1);
    expect(fired[0]?.threshold_pct).toBe(70);

    setHeap(0.9 * limit, limit); // crosses 85
    handle.sample('interval');
    fired = eventsNamed('client_chat_memory_pressure');
    expect(fired).toHaveLength(2);
    expect(fired[1]?.threshold_pct).toBe(85);
    expect(fired[1]?.js_heap_limit_mb).toBe(Math.round(limit / (1024 * 1024)));
  });

  it('stays silent when the browser exposes no heap numbers', () => {
    setHeap(null);
    const log = buildChatLog(1);
    const handle = openChatSurface({ element: log, messageCount: 1, virtualized: false });
    handle.sample('interval');
    handle.sample('interval');
    expect(eventsNamed('client_chat_memory_pressure')).toHaveLength(0);
  });
});

describe('observability/chat-health — stream health', () => {
  it('attributes only the long tasks that land inside the run window', () => {
    const log = buildChatLog(5);
    const handle = openChatSurface({ element: log, messageCount: 5, virtualized: false });
    handle.markFirstPaint({ renderedRowCount: 5 });

    // Idle jank before the run starts is somebody else's problem.
    emitLongTask(500);

    handle.runStarted('run-1');
    advanceClock(1000);
    emitLongTask(200);
    advanceClock(1000);
    emitLongTask(300);
    advanceClock(2000);
    handle.runEnded('run-1');

    const [health] = eventsNamed('client_chat_stream_health');
    expect(health).toBeDefined();
    expect(health?.window_ms).toBe(4000);
    expect(health?.blocked_ms).toBe(500);
    expect(health?.long_task_count).toBe(2);
    expect(health?.worst_task_ms).toBe(300);
    // 500/4000 = 12.5% → 13 after rounding.
    expect(health?.blocked_ratio_pct).toBe(13);
    expect(health?.run_completed).toBe(true);
  });

  it('emits nothing for a run window that saw no jank at all', () => {
    // A clean run is the common case. Emitting a zero-valued event for
    // every run would make this the highest-volume event in the product
    // while adding no information.
    const log = buildChatLog(2);
    const handle = openChatSurface({ element: log, messageCount: 2, virtualized: false });
    handle.runStarted('run-quiet');
    advanceClock(3000);
    handle.runEnded('run-quiet');
    expect(eventsNamed('client_chat_stream_health')).toHaveLength(0);
  });

  it('cuts a long run into periodic windows so a 40-minute run still reports', () => {
    const log = buildChatLog(2);
    const handle = openChatSurface({ element: log, messageCount: 2, virtualized: false });
    handle.runStarted('run-long');
    emitLongTask(400);
    // The periodic cut is timer-driven; advance both clocks together.
    advanceClock(60_000);
    vi.advanceTimersByTime(60_000);

    const cuts = eventsNamed('client_chat_stream_health');
    expect(cuts.length).toBeGreaterThan(0);
    expect(cuts[0]?.run_completed).toBe(false);
  });

  it('stops observing long tasks once the surface detaches', () => {
    const log = buildChatLog(2);
    const handle = openChatSurface({ element: log, messageCount: 2, virtualized: false });
    handle.runStarted('run-x');
    handle.detach();
    fetchMock.mockClear();
    emitLongTask(900);
    advanceClock(1000);
    expect(eventsNamed('client_chat_stream_health')).toHaveLength(0);
  });
});

describe('observability/chat-health — provider-facing seam', () => {
  it('lets the daemon provider drive run windows without holding the handle', async () => {
    // providers/daemon.ts owns the authoritative run lifecycle but has no
    // React context. These module-level functions are the seam; without
    // them the provider would need the surface handle threaded through
    // props, and the run window would silently never open.
    const { chatSurfaceRunEnded, chatSurfaceRunStarted } = await import(
      '../../src/observability/chat-health'
    );
    const log = buildChatLog(2);
    const handle = openChatSurface({ element: log, messageCount: 2, virtualized: false });
    handle.markFirstPaint({ renderedRowCount: 2 });

    chatSurfaceRunStarted('run-remote');
    advanceClock(1000);
    emitLongTask(250);
    advanceClock(1000);
    chatSurfaceRunEnded('run-remote');

    const [health] = eventsNamed('client_chat_stream_health');
    expect(health).toBeDefined();
    expect(health?.blocked_ms).toBe(250);
    expect(health?.run_completed).toBe(true);
  });

  it('no-ops when no chat surface is attached', async () => {
    const { chatSurfaceRunEnded, chatSurfaceRunStarted } = await import(
      '../../src/observability/chat-health'
    );
    expect(() => {
      chatSurfaceRunStarted('run-orphan');
      chatSurfaceRunEnded('run-orphan');
    }).not.toThrow();
    expect(eventsNamed('client_chat_stream_health')).toHaveLength(0);
  });
});
