// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearExceptionTrackingContext,
  setExceptionTrackingContext,
} from '../../src/analytics/error-tracking';
import {
  __resetChatContextForTest,
  chatCorrelation,
} from '../../src/observability/chat-context';
import {
  __resetChatInteractionForTest,
  installChatInteractionObserver,
} from '../../src/observability/chat-interaction';
import { reattachDaemonRun, streamViaDaemon } from '../../src/providers/daemon';

/**
 * These specs are about WIRING, not about the observability modules.
 *
 * `chat-context.ts` and `chat-interaction.ts` both already have unit specs and
 * both are green — because those specs call `setChatCorrelation()` themselves.
 * In production nobody did. The result was a dashboard that looked healthy
 * while being wrong in a specific, self-consistent way: the
 * `client_chat_interaction_latency` event derives `streaming` from
 * `chatCorrelation().run_id`, so with no producer the flag was false on every
 * event ever sent, and the panel read "every chat stall happens while the app
 * sits idle".
 *
 * So every assertion below drives a REAL production entry point
 * (`streamViaDaemon` / `reattachDaemonRun`) and reads the correlation back out
 * the way an outgoing event would. A spec that reached for
 * `setChatCorrelation` itself would re-create the exact hole it exists to
 * close.
 */

const fetchMock = vi.fn();
const ORIGINAL_FETCH = globalThis.fetch;

let eventCallbacks: Array<(list: { getEntries: () => unknown[] }) => void> = [];

class FakePerformanceObserver {
  static supportedEntryTypes = ['event', 'longtask'];
  private readonly cb: (list: { getEntries: () => unknown[] }) => void;
  constructor(cb: (list: { getEntries: () => unknown[] }) => void) {
    this.cb = cb;
  }
  observe(options: { type?: string }): void {
    if (options?.type === 'event') eventCallbacks.push(this.cb);
  }
  disconnect(): void {
    eventCallbacks = eventCallbacks.filter((c) => c !== this.cb);
  }
  takeRecords(): unknown[] {
    return [];
  }
}

/** A slow keystroke inside the chat composer, as the browser would report it. */
function emitSlowInteraction(target: Element): void {
  for (const cb of eventCallbacks) {
    cb({ getEntries: () => [{ name: 'keydown', duration: 640, target, entryType: 'event' }] });
  }
}

/** Safety-telemetry beacons, decoded off the transport `reportSafetyEvent` uses. */
function safetyEvents(name: string): Array<Record<string, unknown>> {
  const decoded: Array<{ event?: string; properties?: Record<string, unknown> }> = [];
  for (const call of fetchMock.mock.calls) {
    const init = call[1] as RequestInit | undefined;
    if (typeof init?.body !== 'string') continue;
    try {
      decoded.push(JSON.parse(init.body) as { event?: string; properties?: Record<string, unknown> });
    } catch {
      // Not a telemetry beacon (run-create bodies land here too).
    }
  }
  return decoded.filter((e) => e.event === name).map((e) => e.properties ?? {});
}

function composerTarget(): Element {
  const composer = document.createElement('div');
  composer.setAttribute('data-testid', 'chat-composer');
  const textarea = document.createElement('textarea');
  composer.appendChild(textarea);
  document.body.append(composer);
  return textarea;
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

const strategy = {
  id: 'od-next-strategy',
  version: '2.0.0',
  packageHash: 'a'.repeat(64),
  snapshotId: 'snapshot-1',
};

const requestProjection = {
  taskExecutionId: 'task-1',
  strategy,
  inputStage: 'request',
  outcome: 'running',
  route: 'full_plan',
  executionMode: null,
  activeRunId: 'run-request',
  terminal: false,
};

const productionProjection = {
  ...requestProjection,
  inputStage: 'production',
  outcome: 'running',
  executionMode: 'simple',
  activeRunId: 'run-production',
  nextRunId: 'run-production',
};

const completedProjection = {
  ...productionProjection,
  outcome: 'completed',
  terminal: true,
  nextRunId: undefined,
};

beforeEach(() => {
  eventCallbacks = [];
  document.body.innerHTML = '';
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  setExceptionTrackingContext({
    apiKey: 'phc_test',
    host: 'https://us.i.posthog.com',
    distinctId: 'chat-correlation-wiring-test',
  });
  (globalThis as unknown as { PerformanceObserver: unknown }).PerformanceObserver =
    FakePerformanceObserver;
  __resetChatContextForTest();
  __resetChatInteractionForTest();
});

afterEach(() => {
  __resetChatContextForTest();
  __resetChatInteractionForTest();
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearExceptionTrackingContext();
  globalThis.fetch = ORIGINAL_FETCH;
  document.body.innerHTML = '';
});

describe('chat correlation — run lifecycle', () => {
  it('names the run while it streams and lets go of it when it ends', async () => {
    const seen: Array<{ run_id?: string; agent_id?: string }> = [];
    const handlers = daemonHandlers(() => {
      const { run_id, agent_id } = chatCorrelation();
      seen.push({ run_id, agent_id });
    });

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

    await streamViaDaemon({
      agentId: 'claude',
      history: [{ id: '1', role: 'user', content: 'go' }],
      signal: new AbortController().signal,
      handlers,
    });

    // Mid-run: the block a `client_chat_*` event would have spread.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]?.run_id).toBe('run-live');
    expect(seen[0]?.agent_id).toBe('claude');
    // Terminal: released, so nothing after the run is attributed to it. This
    // half matters more than the first — a run id that is never let go makes
    // every later event claim a run that finished hours ago, and makes
    // `streaming` permanently true.
    expect(chatCorrelation().run_id).toBeUndefined();
  });

  it('re-points at the next run of a strategy-task chain instead of the one that ended', async () => {
    // A chained run is a run start like any other. Miss it and every stall in
    // the rest of the chain is filed under the run that already finished.
    const seen: string[] = [];
    const handlers = daemonHandlers(() => {
      const id = chatCorrelation().run_id;
      if (id && seen[seen.length - 1] !== id) seen.push(id);
    });

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/runs') {
        return jsonResponse({
          runId: 'run-request',
          taskExecutionId: 'task-1',
          strategyTask: requestProjection,
        });
      }
      if (url === '/api/runs/run-request/events') {
        return sseResponse(
          `event: stdout\ndata: {"chunk":"plan"}\n\nevent: end\ndata: ${JSON.stringify({
            code: 0,
            status: 'succeeded',
            strategyTask: productionProjection,
          })}\n\n`,
        );
      }
      if (url === '/api/runs/run-production/events') {
        return sseResponse(
          `event: stdout\ndata: {"chunk":"build"}\n\nevent: end\ndata: ${JSON.stringify({
            code: 0,
            status: 'succeeded',
            strategyTask: completedProjection,
          })}\n\n`,
        );
      }
      return new Response('', { status: 200 });
    });

    await streamViaDaemon({
      agentId: 'mock',
      history: [{ id: '1', role: 'user', content: 'go' }],
      signal: new AbortController().signal,
      handlers,
    });

    expect(seen).toEqual(['run-request', 'run-production']);
    expect(chatCorrelation().run_id).toBeUndefined();
  });

  it('correlates a run picked back up after a refresh', async () => {
    // Reattach is how a reload gets back onto a run that is still in flight —
    // the moment the panel is most likely to be janky, and the one path with
    // no run-start signal of its own.
    const seen: Array<{ run_id?: string; agent_id?: string }> = [];
    const handlers = daemonHandlers(() => {
      const { run_id, agent_id } = chatCorrelation();
      seen.push({ run_id, agent_id });
    });

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/runs/run-resumed/events') {
        return sseResponse(
          'event: stdout\ndata: {"chunk":"back"}\n\nevent: end\ndata: {"code":0,"status":"succeeded"}\n\n',
        );
      }
      return new Response('', { status: 200 });
    });

    await reattachDaemonRun({
      agentId: 'codex',
      runId: 'run-resumed',
      signal: new AbortController().signal,
      handlers,
    });

    expect(seen[0]?.run_id).toBe('run-resumed');
    expect(seen[0]?.agent_id).toBe('codex');
    expect(chatCorrelation().run_id).toBeUndefined();
  });
});

describe('client_chat_interaction_latency — the streaming breakdown', () => {
  it('calls a mid-run stall streaming and an idle one not', async () => {
    // THE reason this change exists. `streaming` is the whole point of the
    // event ("the same UI can be fine at rest and unusable mid-run"), and with
    // no producer for `run_id` it was false on every event in production — a
    // self-consistent, wrong story. Both directions are asserted on purpose:
    // a "fix" that hard-wired `streaming` to true would pass the first half
    // and fail the second.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const target = composerTarget();
    installChatInteractionObserver();

    const handlers = daemonHandlers(() => {
      emitSlowInteraction(target);
      // Close the 30s reporting window from inside the run.
      vi.advanceTimersByTime(30_000);
    });

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

    await streamViaDaemon({
      agentId: 'claude',
      history: [{ id: '1', role: 'user', content: 'go' }],
      signal: new AbortController().signal,
      handlers,
    });

    // The same interaction, on the same element, once the run is over.
    emitSlowInteraction(target);
    vi.advanceTimersByTime(30_000);

    const events = safetyEvents('client_chat_interaction_latency');
    expect(events).toHaveLength(2);
    expect(events[0]?.streaming).toBe(true);
    expect(events[0]?.run_id).toBe('run-live');
    expect(events[0]?.agent_id).toBe('claude');
    expect(events[1]?.streaming).toBe(false);
    expect(events[1]?.run_id).toBeUndefined();
  });
});
