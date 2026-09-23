// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearExceptionTrackingContext,
  setExceptionTrackingContext,
} from '../../src/analytics/error-tracking';
import { __resetChatContextForTest } from '../../src/observability/chat-context';
import {
  __resetChatHealthForTest,
  openChatSurface,
} from '../../src/observability/chat-health';
import { streamViaDaemon } from '../../src/providers/daemon';

/**
 * `client_chat_stream_health` is the one chat-health event that is EMITTED by
 * the run lifecycle rather than by a timer, which gives it two failure modes
 * the other three do not have — and both were live in the first cut of this
 * wiring:
 *
 *   1. The flush happens inside `chatSurfaceRunEnded`, and the event spreads
 *      `chatCorrelation()`. Clearing the correlation first shipped the event
 *      with an empty `run_id` — a chat event that cannot name the run it just
 *      measured, which is the exact defect this whole change exists to remove.
 *
 *   2. A surface is recreated on every conversation switch and every return to
 *      the Chat tab, but `chatSurfaceRunStarted` only ever reached the surface
 *      that existed when the provider fired it. A surface opened mid-run
 *      therefore believed nothing was running, kept its window shut, and threw
 *      away every long task until the next run started — the exact stretch a
 *      user is watching when they come back to see something generate.
 *
 * Both are asserted through the beacons the module actually sends, driven from
 * the real `streamViaDaemon` entry point.
 */

const fetchMock = vi.fn();
const ORIGINAL_FETCH = globalThis.fetch;

let longTaskCallbacks: Array<(list: { getEntries: () => unknown[] }) => void> = [];

class FakePerformanceObserver {
  static supportedEntryTypes = ['longtask', 'event'];
  private readonly cb: (list: { getEntries: () => unknown[] }) => void;
  constructor(cb: (list: { getEntries: () => unknown[] }) => void) {
    this.cb = cb;
  }
  observe(options: { type?: string }): void {
    if (options?.type === 'longtask') longTaskCallbacks.push(this.cb);
  }
  disconnect(): void {
    longTaskCallbacks = longTaskCallbacks.filter((c) => c !== this.cb);
  }
  takeRecords(): unknown[] {
    return [];
  }
}

function emitLongTask(durationMs: number): void {
  const entry = { duration: durationMs, startTime: 0, name: 'self', entryType: 'longtask' };
  for (const cb of [...longTaskCallbacks]) cb({ getEntries: () => [entry] });
}

function safetyEvents(name: string): Array<Record<string, unknown>> {
  const decoded: Array<{ event?: string; properties?: Record<string, unknown> }> = [];
  for (const call of fetchMock.mock.calls) {
    const init = call[1] as RequestInit | undefined;
    if (typeof init?.body !== 'string') continue;
    try {
      decoded.push(JSON.parse(init.body) as { event?: string; properties?: Record<string, unknown> });
    } catch {
      // not a telemetry beacon
    }
  }
  return decoded.filter((e) => e.event === name).map((e) => e.properties ?? {});
}

function chatLogElement(): HTMLElement {
  const log = document.createElement('div');
  log.setAttribute('data-testid', 'chat-log');
  log.appendChild(document.createElement('div'));
  document.body.append(log);
  return log;
}

function sseResponse(text: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 202,
    headers: { 'content-type': 'application/json' },
  });
}

function daemonHandlers(onDelta?: () => void) {
  return {
    onDelta: vi.fn(onDelta),
    onDone: vi.fn(),
    onError: vi.fn(),
    onAgentEvent: vi.fn(),
  };
}

function serveOneRun(): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/runs') return jsonResponse({ runId: 'run-live' });
    if (url === '/api/runs/run-live/events') {
      return sseResponse(
        'event: stdout\ndata: {"chunk":"hi"}\n\nevent: end\ndata: {"code":0,"status":"succeeded"}\n\n',
      );
    }
    return new Response('', { status: 200 });
  });
}

async function runOneTurn(handlers: ReturnType<typeof daemonHandlers>): Promise<void> {
  await streamViaDaemon({
    agentId: 'claude',
    history: [{ id: '1', role: 'user', content: 'go' }],
    signal: new AbortController().signal,
    handlers,
  });
}

beforeEach(() => {
  longTaskCallbacks = [];
  document.body.innerHTML = '';
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  setExceptionTrackingContext({
    apiKey: 'phc_test',
    host: 'https://us.i.posthog.com',
    distinctId: 'chat-health-wiring-test',
    clientType: 'web',
    osName: 'Mac OS X',
  });
  (globalThis as unknown as { PerformanceObserver: unknown }).PerformanceObserver =
    FakePerformanceObserver;
  __resetChatHealthForTest();
  __resetChatContextForTest();
});

afterEach(() => {
  __resetChatHealthForTest();
  __resetChatContextForTest();
  vi.restoreAllMocks();
  clearExceptionTrackingContext();
  globalThis.fetch = ORIGINAL_FETCH;
  document.body.innerHTML = '';
});

describe('client_chat_stream_health — the flush must still know its run', () => {
  it('names the run it just measured', async () => {
    // The terminal path clears the correlation AND flushes the jank window.
    // Do them in the wrong order and this event goes out anonymous — the very
    // shape of bug the rest of this change removes.
    openChatSurface({ element: chatLogElement(), messageCount: 1, virtualized: false });
    serveOneRun();

    await runOneTurn(daemonHandlers(() => emitLongTask(320)));

    const health = safetyEvents('client_chat_stream_health');
    expect(health).toHaveLength(1);
    expect(health[0]?.run_id).toBe('run-live');
    expect(health[0]?.agent_id).toBe('claude');
    expect(health[0]?.run_completed).toBe(true);
    expect(health[0]?.long_task_count).toBe(1);
  });

  it('still lets go of the run once the flush is done', async () => {
    // Reverse anchor for the reordering: moving the chat-health call ahead of
    // the correlation clear must not skip the clear. Without this, "carries a
    // run id" would also pass on an implementation that never releases it —
    // which is the mirror-image bug, and the one that makes `streaming` true
    // forever.
    openChatSurface({ element: chatLogElement(), messageCount: 1, virtualized: false });
    serveOneRun();

    await runOneTurn(daemonHandlers(() => emitLongTask(320)));

    fetchMock.mockClear();
    // A second surface opened after the run is over must find nothing in
    // flight to adopt, so its window stays shut and a stray long task is
    // attributed to nobody.
    openChatSurface({ element: chatLogElement(), messageCount: 1, virtualized: false });
    emitLongTask(900);

    expect(safetyEvents('client_chat_stream_health')).toHaveLength(0);
  });
});

describe('a surface opened mid-run adopts the run', () => {
  it('keeps measuring after the user leaves the tab and comes back', async () => {
    // Three long tasks, split by a surface swap in the middle: one before, two
    // after. Without adoption the second surface never opens a window and the
    // last two are dropped on the floor — exactly the stretch the user came
    // back to watch.
    const el = chatLogElement();
    openChatSurface({ element: el, messageCount: 1, virtualized: false });
    serveOneRun();

    let swapped = false;
    await runOneTurn(
      daemonHandlers(() => {
        if (swapped) return;
        swapped = true;
        emitLongTask(300);
        // The user switched conversation (or left Chat and came back): React
        // hands the same node to a brand-new surface.
        openChatSurface({ element: el, messageCount: 1, virtualized: false });
        emitLongTask(400);
        emitLongTask(500);
      }),
    );

    const health = safetyEvents('client_chat_stream_health');
    expect(health).toHaveLength(2);
    // The surface that was torn down mid-run keeps what it saw, marked as an
    // unfinished window.
    expect(health[0]).toMatchObject({
      run_id: 'run-live',
      run_completed: false,
      long_task_count: 1,
    });
    // The surface that took over carries the rest, and sees the run end.
    expect(health[1]).toMatchObject({
      run_id: 'run-live',
      run_completed: true,
      long_task_count: 2,
    });
    // Anti-double-count: three tasks emitted, three accounted for. Adoption
    // must open a window on the NEW surface only — re-running it against a
    // surface that already had the run would inflate these.
    expect(
      Number(health[0]?.long_task_count) + Number(health[1]?.long_task_count),
    ).toBe(3);
  });
});
